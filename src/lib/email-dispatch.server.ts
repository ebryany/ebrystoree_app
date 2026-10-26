/**
 * Server-only: dispatcher email transaksional.
 *
 * Cara kerja: memindai event nyata di database yang belum pernah dikirim
 * emailnya, lalu mengirim. Idempotensi dijamin oleh `email_dispatch_log`
 * (UNIQUE recipient + event + entity), jadi memanggil fungsi ini berkali-kali
 * aman — pola yang sama dengan `dispatchServiceOrderAlerts` (Telegram).
 *
 * Dipanggil dari dua tempat:
 * 1. Setelah transaksi penting selesai (webhook pembayaran, penerimaan, refund).
 * 2. Cron sebagai jaring pengaman untuk yang gagal atau terlewat.
 *
 * Kegagalan email tidak pernah menggagalkan transaksi: fungsi ini mengembalikan
 * ringkasan, bukan melempar.
 */

type DispatchSummary = { sent: number; skipped: number; failed: number };

const EMPTY: DispatchSummary = { sent: 0, skipped: 0, failed: 0 };

function merge(target: DispatchSummary, result: { ok: boolean; skipped?: boolean }): void {
  if (!result.ok) target.failed += 1;
  else if (result.skipped) target.skipped += 1;
  else target.sent += 1;
}

/**
 * Bentuk baris order seperti yang dikembalikan query di bawah. `order_items`
 * selalu array karena relasi one-to-many, walau dalam praktiknya satu order
 * marketplace hanya punya satu item (invariant M-02).
 */
type OrderRow = {
  id: string;
  order_number: string;
  user_id: string;
  order_type: string;
  status: string;
  total: number;
  order_items: Array<{ name_snapshot: string; store_name_snapshot: string | null }> | null;
};

function orderData(order: OrderRow) {
  const item = order.order_items?.[0];
  return {
    orderNumber: order.order_number,
    orderId: order.id,
    total: Number(order.total),
    itemName: item?.name_snapshot ?? null,
    storeName: item?.store_name_snapshot ?? null,
  };
}

/**
 * Kirim email untuk semua event yang tertunda.
 *
 * `limit` membatasi jumlah pesanan yang dipindai per pemanggilan supaya cron
 * tidak menahan koneksi terlalu lama saat ada tumpukan.
 */
export async function dispatchEmails(limit = 25): Promise<DispatchSummary> {
  const { emailReady } = await import("./email.server");
  if (!emailReady()) return { ...EMPTY };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const total: DispatchSummary = { ...EMPTY };

  // --- 1. Pembayaran lunas ---
  {
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, user_id, order_type, status, total, order_items(name_snapshot, store_name_snapshot)",
      )
      .in("status", ["paid", "completed", "refunded"])
      .not("paid_at", "is", null)
      .order("paid_at", { ascending: false })
      .limit(limit);

    for (const order of (orders ?? []) as OrderRow[]) {
      const d = orderData(order);
      const { emailOrderPaid } = await import("./email-templates");
      const content = emailOrderPaid(d, order.user_id);
      const result = await sendOne({
        recipientId: order.user_id,
        event: "order.paid",
        entityType: "order",
        entityId: order.id,
        template: "order-paid",
        content,
      });
      merge(total, result);
    }
  }

  // --- 2. Produk digital selesai (receipt diterima) ---
  {
    const { data: receipts } = await supabaseAdmin
      .from("digital_order_receipts")
      .select(
        "order_id, status, orders!inner(id, order_number, user_id, status, total, order_items(name_snapshot, store_name_snapshot))",
      )
      .eq("status", "accepted")
      .order("accepted_at", { ascending: false })
      .limit(limit);

    for (const row of (receipts ?? []) as unknown as Array<{ orders: OrderRow }>) {
      const order = row.orders;
      if (!order) continue;
      const d = orderData(order);
      const { emailOrderCompletedDigital } = await import("./email-templates");
      const content = emailOrderCompletedDigital(d, order.user_id);
      const result = await sendOne({
        recipientId: order.user_id,
        event: "order.completed",
        entityType: "order",
        entityId: order.id,
        template: "order-completed-digital",
        content,
      });
      merge(total, result);
    }
  }

  // --- 3. Hasil jasa dikirim (menunggu tinjauan pembeli) ---
  {
    const { data: svc } = await supabaseAdmin
      .from("marketplace_service_orders")
      .select(
        "order_id, work_state, latest_delivery_id, orders!inner(id, order_number, user_id, status, total, order_items(name_snapshot, store_name_snapshot))",
      )
      .eq("work_state", "delivered")
      .not("latest_delivery_id", "is", null)
      .limit(limit);

    for (const row of (svc ?? []) as unknown as Array<{
      orders: OrderRow;
      latest_delivery_id: string;
    }>) {
      const order = row.orders;
      if (!order) continue;
      const d = orderData(order);
      const { emailServiceDelivered } = await import("./email-templates");
      const content = emailServiceDelivered({ ...d, version: 1 }, order.user_id);
      const result = await sendOne({
        recipientId: order.user_id,
        event: "service.delivered",
        entityType: "order",
        entityId: order.id,
        template: "service-delivered",
        content,
      });
      merge(total, result);
    }
  }

  // --- 4. Hasil jasa diterima (transaksi selesai) ---
  {
    const { data: svc } = await supabaseAdmin
      .from("marketplace_service_orders")
      .select(
        "order_id, work_state, store_id, orders!inner(id, order_number, user_id, status, total, order_items(name_snapshot, store_name_snapshot))",
      )
      .eq("work_state", "accepted")
      .not("accepted_at", "is", null)
      .order("accepted_at", { ascending: false })
      .limit(limit);

    for (const row of (svc ?? []) as unknown as Array<{ orders: OrderRow; store_id: string }>) {
      const order = row.orders;
      if (!order) continue;
      const d = orderData(order);
      const { emailServiceAccepted } = await import("./email-templates");

      // Pembeli
      const buyerContent = emailServiceAccepted(d, order.user_id);
      merge(
        total,
        await sendOne({
          recipientId: order.user_id,
          event: "service.accepted",
          entityType: "order",
          entityId: order.id,
          template: "service-accepted-buyer",
          content: buyerContent,
        }),
      );

      // Penjual: dana dilepas ke saldo toko
      const { data: store } = await supabaseAdmin
        .from("stores")
        .select("owner_id")
        .eq("id", row.store_id)
        .maybeSingle();
      if (store?.owner_id) {
        const sellerContent = emailServiceAccepted(
          { ...d, sellerView: true },
          store.owner_id as string,
        );
        merge(
          total,
          await sendOne({
            recipientId: store.owner_id as string,
            event: "service.accepted.seller",
            entityType: "order",
            entityId: order.id,
            template: "service-accepted-seller",
            content: sellerContent,
          }),
        );
      }
    }
  }

  // --- 5. Refund selesai ---
  {
    const { data: refunds } = await supabaseAdmin
      .from("refunds")
      .select("id, refund_number, order_id, customer_id, amount, status, orders(order_number)")
      .eq("status", "completed")
      .order("processed_at", { ascending: false })
      .limit(limit);

    for (const row of (refunds ?? []) as Array<{
      id: string;
      refund_number: string;
      order_id: string;
      customer_id: string;
      amount: number;
      orders: { order_number: string } | null;
    }>) {
      const { emailRefundCompleted } = await import("./email-templates");
      const content = emailRefundCompleted(
        {
          orderNumber: row.orders?.order_number ?? row.order_id,
          orderId: row.order_id,
          amount: Number(row.amount),
          refundNumber: row.refund_number,
        },
        row.customer_id,
      );
      merge(
        total,
        await sendOne({
          recipientId: row.customer_id,
          event: "refund.completed",
          entityType: "refund",
          entityId: row.id,
          template: "refund-completed",
          content,
        }),
      );
    }
  }

  return total;
}

async function sendOne(params: {
  recipientId: string;
  event: string;
  entityType: string;
  entityId: string;
  template: string;
  content: { subject: string; html: string; text: string };
}) {
  const { sendEmail } = await import("./email.server");
  return sendEmail({
    recipientId: params.recipientId,
    event: params.event,
    entityType: params.entityType,
    entityId: params.entityId,
    template: params.template,
    subject: params.content.subject,
    html: params.content.html,
    text: params.content.text,
  });
}

/**
 * Kirim ulang yang gagal (maksimal 3 percobaan).
 *
 * Hanya menyentuh baris `failed`; baris `sent` tidak pernah disentuh, dan baris
 * `skipped` dihormati (pengguna mematikan email atau tidak punya alamat).
 */
export async function retryFailedEmails(limit = 20): Promise<{ retried: number }> {
  const { emailReady, sendEmail } = await import("./email.server");
  if (!emailReady()) return { retried: 0 };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: failed } = await supabaseAdmin
    .from("email_dispatch_log")
    .select("id, recipient_id, event, entity_type, entity_id, template, attempts")
    .eq("status", "failed")
    .lt("attempts", 3)
    .order("created_at", { ascending: true })
    .limit(limit);

  let retried = 0;
  for (const row of (failed ?? []) as Array<{
    id: string;
    recipient_id: string;
    event: string;
    entity_type: string;
    entity_id: string;
    template: string;
    attempts: number;
  }>) {
    // Bangun ulang isi email dari data terkini supaya angkanya tetap benar.
    const content = await rebuildContent(row.template, row.entity_id, row.recipient_id);
    if (!content) {
      await supabaseAdmin
        .from("email_dispatch_log")
        .update({
          attempts: (row.attempts ?? 0) + 1,
          error: "Isi email tidak dapat dibangun ulang.",
        })
        .eq("id", row.id);
      continue;
    }

    const result = await sendEmail({
      recipientId: row.recipient_id,
      event: row.event,
      entityType: row.entity_type,
      entityId: row.entity_id,
      template: row.template,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });

    await supabaseAdmin
      .from("email_dispatch_log")
      .update({ attempts: (row.attempts ?? 0) + 1 })
      .eq("id", row.id);

    if (result.ok && !result.skipped) retried += 1;
  }
  return { retried };
}

async function rebuildContent(
  template: string,
  entityId: string,
  recipientId: string,
): Promise<{ subject: string; html: string; text: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const templates = await import("./email-templates");

  if (template === "refund-completed") {
    const { data: refund } = await supabaseAdmin
      .from("refunds")
      .select("id, refund_number, order_id, amount, orders(order_number)")
      .eq("id", entityId)
      .maybeSingle();
    if (!refund) return null;
    return templates.emailRefundCompleted(
      {
        orderNumber: (refund as any).orders?.order_number ?? refund.order_id,
        orderId: refund.order_id,
        amount: Number(refund.amount),
        refundNumber: refund.refund_number,
      },
      recipientId,
    );
  }

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, user_id, order_type, status, total, order_items(name_snapshot, store_name_snapshot)",
    )
    .eq("id", entityId)
    .maybeSingle();
  if (!order) return null;

  const d = orderData(order as OrderRow);
  switch (template) {
    case "order-paid":
      return templates.emailOrderPaid(d, recipientId);
    case "order-completed-digital":
      return templates.emailOrderCompletedDigital(d, recipientId);
    case "service-delivered":
      return templates.emailServiceDelivered({ ...d, version: 1 }, recipientId);
    case "service-accepted-buyer":
      return templates.emailServiceAccepted(d, recipientId);
    case "service-accepted-seller":
      return templates.emailServiceAccepted({ ...d, sellerView: true }, recipientId);
    default:
      return null;
  }
}
