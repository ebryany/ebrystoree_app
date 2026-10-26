import { createServerFn } from "@tanstack/react-start";
import { enforceRateLimit } from "./rate-limit.server";
import { z } from "zod";
import { canSubmitManualProof, PROOF_MAX_BYTES, PROOF_MIME_TYPES } from "./manual-payment";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DigitalReceipt } from "./digital-receipt";

const tx = () => import("./transaction.server");

type Ctx = { supabase: any; userId: string };

/* ---------------- Katalog publik: detail produk ---------------- */

export const getProductDetail = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ slug: z.string().trim().min(1).max(120) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { createPublicClient } = await import("./supabase-public.server");
    const supabase = createPublicClient();
    const { data: row, error } = await supabase
      .from("digital_products")
      .select(
        "id, name, slug, short_description, description, thumbnail_url, price, discount_price, usage_notes, version, download_limit, validity_days, sold_count, delivery_mode, available_stock, store_id, stores(name, slug, is_platform)",
      )
      .eq("slug", data.slug)
      .eq("status", "published")
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error("[katalog] detail produk gagal:", error.message);
      return { product: null, error: "Produk tidak dapat dimuat." as const };
    }
    return { product: row, error: null };
  });

/** Penegakan feature flag di server: checkout ditutup saat flag dimatikan. */
async function ensureFeature(keys: string[]) {
  const { isFeatureEnabled } = await import("./website-settings.server");
  for (const key of keys) {
    if (!(await isFeatureEnabled(key))) {
      return { ok: false as const, error: "Fitur ini sedang dinonaktifkan sementara oleh admin." };
    }
  }
  return null;
}

/* ---------------- Checkout ---------------- */

export const createDigitalOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(10).default(1),
        idempotencyKey: z.string().min(8).max(64),
        note: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const blocked = await ensureFeature(["feature_checkout", "feature_digital_products"]);
    if (blocked) return blocked;
    const limited = await enforceRateLimit(context.userId, "order.create");
    if (limited) return { ok: false as const, error: limited.error };
    const helpers = await tx();
    const { data: result, error } = await (context as Ctx).supabase.rpc("create_digital_order", {
      _product_id: data.productId,
      _quantity: data.quantity,
      _idempotency_key: data.idempotencyKey,
      _customer_note: data.note ?? null,
    });
    if (error) return { ok: false as const, error: helpers.rpcErrorMessage(error.message) };
    return {
      ok: true as const,
      ...(result as { order_id: string; order_number: string; duplicate: boolean }),
    };
  });

/* ---------------- Ringkasan & daftar order ---------------- */
export const createServiceOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        serviceId: z.string().uuid(),
        packageId: z.string().uuid(),
        addonIds: z.array(z.string().uuid()).max(20).default([]),
        requirements: z.record(z.string(), z.string().trim().max(300)).default({}),
        requirementsNote: z.string().trim().min(10).max(2000),
        idempotencyKey: z.string().min(8).max(64),
        note: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const blocked = await ensureFeature(["feature_checkout", "feature_academic_services"]);
    if (blocked) return blocked;
    const helpers = await tx();
    const { data: result, error } = await (context as Ctx).supabase.rpc("create_service_order", {
      _service_id: data.serviceId,
      _package_id: data.packageId,
      _addon_ids: data.addonIds,
      _requirements: data.requirements,
      _requirements_note: data.requirementsNote,
      _idempotency_key: data.idempotencyKey,
      _customer_note: data.note ?? null,
    });
    if (error) return { ok: false as const, error: helpers.rpcErrorMessage(error.message) };
    return {
      ok: true as const,
      ...(result as { order_id: string; order_number: string; duplicate: boolean }),
    };
  });

export const getCustomerSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as Ctx).supabase;
    const uid = (context as Ctx).userId;
    const count = (q: any) => q.select("id", { count: "exact", head: true });

    const [total, awaiting, review, active, done, entitlements, refunds, notifications, recentRes] =
      await Promise.all([
        count(sb.from("orders")).eq("user_id", uid),
        count(sb.from("orders")).eq("user_id", uid).eq("status", "awaiting_payment"),
        count(sb.from("orders")).eq("user_id", uid).eq("status", "payment_under_review"),
        count(sb.from("orders"))
          .eq("user_id", uid)
          .in("status", [
            "paid",
            "waiting_assignment",
            "assigned",
            "queued",
            "in_progress",
            "waiting_customer_review",
          ]),
        count(sb.from("orders")).eq("user_id", uid).eq("status", "completed"),
        count(sb.from("digital_entitlements")).eq("user_id", uid).is("revoked_at", null),
        count(sb.from("refunds"))
          .eq("customer_id", uid)
          .in("status", [
            "requested",
            "under_review",
            "information_requested",
            "approved",
            "processing",
          ]),
        sb
          .from("notifications")
          .select("id, title, message, created_at, read_at")
          .eq("recipient_id", uid)
          .order("created_at", { ascending: false })
          .limit(5),
        sb
          .from("orders")
          .select(
            "id, order_number, order_type, status, total, created_at, order_items(name_snapshot)",
          )
          .eq("user_id", uid)
          .not("status", "in", "(completed,cancelled,refunded)")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
    const recent = recentRes.data;

    return {
      totalOrders: total.count ?? 0,
      awaitingPayment: awaiting.count ?? 0,
      underReview: review.count ?? 0,
      activeOrders: active.count ?? 0,
      completedOrders: done.count ?? 0,
      entitlements: entitlements.count ?? 0,
      activeRefunds: refunds.count ?? 0,
      notifications: notifications.data ?? [],
      recentOrders: recent ?? [],
    };
  });

export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        filter: z.string().max(30).default("all"),
        page: z.number().int().min(1).default(1),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const sb = (context as Ctx).supabase;
    const uid = (context as Ctx).userId;
    const size = 10;
    const from = (data.page - 1) * size;

    let query = sb
      .from("orders")
      .select(
        "id, order_number, order_type, status, total, created_at, order_items(name_snapshot, quantity), payments(status, id)",
        { count: "exact" },
      )
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .range(from, from + size - 1);

    if (data.filter === "digital") query = query.eq("order_type", "digital_product");
    else if (data.filter === "service")
      query = query.in("order_type", ["service", "marketplace_service"]);
    else if (data.filter === "unpaid")
      query = query.in("status", ["awaiting_payment", "payment_under_review"]);
    else if (data.filter === "active")
      query = query.in("status", [
        "paid",
        "waiting_assignment",
        "assigned",
        "queued",
        "in_progress",
      ]);
    else if (data.filter === "completed") query = query.eq("status", "completed");
    else if (data.filter === "cancelled") query = query.in("status", ["cancelled", "refunded"]);

    const { data: rows, count, error } = await query;
    if (error) {
      console.error("[order] daftar order gagal:", error.message);
      return { items: [], total: 0, error: "Daftar pesanan tidak dapat dimuat." as const };
    }
    return { items: rows ?? [], total: count ?? 0, error: null };
  });

export const getMyOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const sb = (context as Ctx).supabase;
    const helpers = await tx();

    const { data: order, error } = await sb
      .from("orders")
      .select(
        "id, order_number, order_type, status, subtotal, discount_total, admin_fee, total, credit_used, amount_due, customer_note, expired_at, paid_at, completed_at, cancelled_at, cancellation_reason, created_at",
      )
      .eq("id", data.id)
      .eq("user_id", (context as Ctx).userId)
      .maybeSingle();

    if (error || !order) {
      return {
        order: null,
        items: [] as any[],
        invoice: null as any,
        payments: [] as any[],
        histories: [] as any[],
        entitlements: [] as any[],
        refunds: [] as any[],
        manualAccount: { method: "", number: "", holder: "", active: false, reuploadLimit: 3 },
        instruction: "",
        qrisAvailable: false,
        error: "Pesanan tidak ditemukan." as const,
      };
    }

    const [items, invoice, payments, histories, entitlements, refunds] = await Promise.all([
      sb
        .from("order_items")
        .select("id, name_snapshot, unit_price, quantity, total, item_type")
        .eq("order_id", order.id),
      sb
        .from("invoices")
        .select("invoice_number, status, issued_at, due_at, paid_at, total")
        .eq("order_id", order.id)
        .maybeSingle(),
      sb
        .from("payments")
        .select(
          "id, payment_number, status, method, provider, expected_amount, paid_amount, expired_at, paid_at, reupload_count, qr_reference, payment_url",
        )
        .eq("order_id", order.id)
        .order("created_at", { ascending: false }),
      sb
        .from("order_status_histories")
        .select("previous_status, new_status, public_note, actor_type, created_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: true }),
      sb
        .from("digital_entitlements")
        .select("id, product_id, download_limit, download_count, valid_until, revoked_at")
        .eq("order_id", order.id),
      sb
        .from("refunds")
        .select("refund_number, amount, status, reason, created_at")
        .eq("order_id", order.id),
    ]);

    const account = await helpers.loadManualAccount();
    const instruction = await helpers.loadPaymentInstruction(sb);
    // Satu sumber kebenaran: helper yang sama dipakai checkout dan admin,
    // sehingga saklar metode pembayaran di pengaturan benar-benar berlaku.
    const methods = await helpers.loadPaymentMethods();

    return {
      order,
      items: items.data ?? [],
      invoice: invoice.data ?? null,
      payments: payments.data ?? [],
      histories: histories.data ?? [],
      entitlements: entitlements.data ?? [],
      refunds: refunds.data ?? [],
      manualAccount: account,
      instruction: instruction.instruction,
      qrisAvailable: methods.qris,
      manualAvailable: methods.manual,
      error: null,
    };
  });

/* ---------------- Aksi pelanggan ---------------- */

export const preparePaymentProofUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        paymentId: z.string().uuid(),
        mimeType: z.enum(PROOF_MIME_TYPES),
        sizeBytes: z.number().int().min(1).max(PROOF_MAX_BYTES),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const limited = await enforceRateLimit(userId, "payment.proof");
    if (limited) return { ok: false as const, error: limited.error };
    const helpers = await tx();
    const account = await helpers.loadManualAccount();
    if (
      !account.active ||
      account.method.toLowerCase() !== "dana" ||
      !account.number.trim() ||
      !account.holder.trim()
    ) {
      return { ok: false as const, error: "Pembayaran manual sedang tidak tersedia." };
    }
    const { data: payment } = await supabase
      .from("payments")
      .select("id, provider, method, status, expired_at, reupload_count, orders!inner(status)")
      .eq("id", data.paymentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (
      !payment ||
      !canSubmitManualProof(payment, payment.orders.status, Date.now(), account.reuploadLimit)
    ) {
      return { ok: false as const, error: "Pembayaran tidak mengizinkan unggah bukti manual." };
    }
    const extensions = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "application/pdf": "pdf",
    };
    const path = `${userId}/${data.paymentId}/${crypto.randomUUID()}.${extensions[data.mimeType]}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("payment-proofs")
      .createSignedUploadUrl(path);
    if (error || !signed)
      return { ok: false as const, error: "Gagal menyiapkan unggahan bukti. Coba lagi." };
    return { ok: true as const, path, token: signed.token };
  });

export const submitPaymentProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        paymentId: z.string().uuid(),
        filePath: z.string().min(3).max(300),
        originalFilename: z.string().min(1).max(200),
        mimeType: z.enum(PROOF_MIME_TYPES),
        sizeBytes: z.number().int().min(1).max(PROOF_MAX_BYTES),
        senderName: z.string().trim().min(2).max(100),
        amountClaimed: z.number().int().min(0),
        note: z.string().trim().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const limited = await enforceRateLimit(context.userId, "payment.proof");
    if (limited) return { ok: false as const, error: limited.error };
    const helpers = await tx();
    const { data: result, error } = await (context as Ctx).supabase.rpc("submit_payment_proof", {
      _payment_id: data.paymentId,
      _file_path: data.filePath,
      _original_filename: data.originalFilename,
      _mime_type: data.mimeType ?? null,
      _size_bytes: data.sizeBytes,
      _sender_name: data.senderName,
      _amount_claimed: data.amountClaimed,
      _note: data.note ?? null,
    });
    if (error) return { ok: false as const, error: helpers.rpcErrorMessage(error.message) };
    return { ok: true as const, result };
  });

export const cancelMyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ orderId: z.string().uuid(), reason: z.string().trim().min(5).max(300) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const helpers = await tx();
    const { error } = await (context as Ctx).supabase.rpc("cancel_own_order", {
      _order_id: data.orderId,
      _reason: data.reason,
    });
    if (error) return { ok: false as const, error: helpers.rpcErrorMessage(error.message) };
    return { ok: true as const };
  });

export const requestMyRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({ orderId: z.string().uuid(), reason: z.string().trim().min(10).max(500) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const helpers = await tx();
    const { error } = await (context as Ctx).supabase.rpc("request_refund", {
      _order_id: data.orderId,
      _reason: data.reason,
    });
    if (error) return { ok: false as const, error: helpers.rpcErrorMessage(error.message) };
    return { ok: true as const };
  });

export const getMyDigitalReceipt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const helpers = await tx();
    const { data: receipt, error } = await (context as Ctx).supabase.rpc("get_my_digital_receipt", {
      _order_id: data.orderId,
    });
    return {
      receipt: error ? null : (receipt as DigitalReceipt | null),
      error: error ? helpers.rpcErrorMessage(error.message) : null,
    };
  });

export const confirmDigitalReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const helpers = await tx();
    const { error } = await (context as Ctx).supabase.rpc("confirm_digital_receipt", {
      _order_id: data.orderId,
    });
    if (error) return { ok: false as const, error: helpers.rpcErrorMessage(error.message) };

    // Email "pesanan selesai". Kegagalan email tidak membatalkan konfirmasi
    // yang sudah tercatat; cron akan mengirim ulang.
    try {
      const { dispatchEmails } = await import("./email-dispatch.server");
      await dispatchEmails(5);
    } catch (err) {
      console.error("[email] dispatch setelah penerimaan gagal:", err);
    }

    return { ok: true as const };
  });

export const getMyStockCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ entitlementId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const helpers = await tx();
    const { data: result, error } = await (context as Ctx).supabase.rpc("get_my_stock_code", {
      _entitlement_id: data.entitlementId,
    });
    if (error) return { ok: false as const, error: helpers.rpcErrorMessage(error.message) };
    return { ok: true as const, code: (result as { code: string }).code };
  });

/* ---------------- Pustaka produk digital ---------------- */

export const listMyEntitlements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as Ctx).supabase;
    const { data, error } = await sb
      .from("digital_entitlements")
      .select(
        "id, download_limit, download_count, valid_until, revoked_at, file_version, order_id, digital_products(name, thumbnail_url, slug, delivery_mode)",
      )
      .eq("user_id", (context as Ctx).userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[entitlement] gagal memuat pustaka:", error.message);
      return { items: [], error: "Pustaka produk tidak dapat dimuat." as const };
    }
    return { items: data ?? [], error: null };
  });

export const downloadEntitlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ entitlementId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const helpers = await tx();
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    let ip: string | null = null;
    let ua: string | null = null;
    try {
      ip = (getRequestHeader("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;
      ua = getRequestHeader("user-agent") ?? null;
    } catch {
      /* header opsional */
    }

    const { data: result, error } = await (context as Ctx).supabase.rpc("consume_download", {
      _entitlement_id: data.entitlementId,
      _ip: ip,
      _ua: ua,
    });
    if (error) return { ok: false as const, error: helpers.rpcErrorMessage(error.message) };

    const payload = result as { storage_path: string; filename: string; remaining: number };
    const url = await helpers.signedUrl(
      "product-files",
      payload.storage_path,
      300,
      payload.filename,
    );
    if (!url) return { ok: false as const, error: "Tautan unduhan gagal dibuat. Coba lagi." };
    return { ok: true as const, url, filename: payload.filename, remaining: payload.remaining };
  });

/* ---------------- Notifikasi ---------------- */

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context as Ctx).supabase
      .from("notifications")
      .select("id, type, title, message, related_type, related_id, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return { items: [], error: "Notifikasi tidak dapat dimuat." as const };
    return { items: data ?? [], error: null };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await (context as Ctx).supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id);
    return { ok: !error };
  });
export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    const { error } = await ctx.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", ctx.userId)
      .is("read_at", null);
    return { ok: !error };
  });

/* ---------------- Pengaturan akun ---------------- */

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    const { data, error } = await ctx.supabase
      .from("profiles")
      .select("id, full_name, phone, email, avatar_url, created_at, email_notifications_enabled")
      .eq("id", ctx.userId)
      .maybeSingle();
    if (error) return { profile: null, error: "Profil tidak dapat dimuat." as const };
    return { profile: data, error: null };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        fullName: z.string().trim().min(2).max(120),
        phone: z
          .string()
          .trim()
          .max(24)
          .regex(/^[0-9+\-\s()]*$/, "Nomor telepon tidak valid")
          .optional()
          .or(z.literal("")),
        /** Preferensi email transaksional; tidak dikirim = tidak diubah. */
        emailNotificationsEnabled: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { error } = await ctx.supabase
      .from("profiles")
      .update({
        full_name: data.fullName,
        phone: data.phone || null,
        ...(data.emailNotificationsEnabled === undefined
          ? {}
          : { email_notifications_enabled: data.emailNotificationsEnabled }),
      })
      .eq("id", ctx.userId);
    if (error) return { ok: false, error: "Profil gagal disimpan." as const };
    return { ok: true, error: null };
  });

export const updateMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        avatarUrl: z
          .string()
          .trim()
          .max(300)
          .regex(
            /^\/api\/public\/avatar\/[A-Za-z0-9/_-]+\.[A-Za-z0-9]{2,5}$/,
            "URL avatar tidak valid",
          )
          .or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    // Pastikan path avatar berada di folder milik pengguna sendiri.
    if (data.avatarUrl && !data.avatarUrl.startsWith(`/api/public/avatar/${ctx.userId}/`)) {
      return { ok: false, error: "URL avatar tidak valid." as const };
    }
    const { error } = await ctx.supabase
      .from("profiles")
      .update({ avatar_url: data.avatarUrl || null })
      .eq("id", ctx.userId);
    if (error) return { ok: false, error: "Foto profil gagal disimpan." as const };
    return { ok: true, error: null };
  });

/* ---------------- Saldo Ebrystore (store credit) ---------------- */

/** Saldo aktif + riwayat ledger milik pemanggil. RLS memastikan hanya data sendiri. */
export const getMyCredit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as Ctx).supabase;
    const [{ data: balance, error: balErr }, { data: entries, error: ledErr }] = await Promise.all([
      sb.rpc("get_my_credit_balance"),
      sb
        .from("credit_ledger")
        .select("id, direction, amount, source_type, reference, note, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (balErr || ledErr) {
      return { balance: 0, items: [], error: "Saldo tidak dapat dimuat." as const };
    }
    return { balance: Number(balance ?? 0), items: entries ?? [], error: null };
  });

/** Pakai saldo Ebrystore untuk membayar sebagian order. Idempoten per order. */
export const applyCreditToOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        maxCredit: z.number().int().min(0).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const helpers = await tx();
    const { data: result, error } = await (context as Ctx).supabase.rpc("apply_credit_to_order", {
      _order_id: data.orderId,
      _max_credit: data.maxCredit ?? null,
    });
    if (error) return { ok: false as const, error: helpers.rpcErrorMessage(error.message) };
    return {
      ok: true as const,
      ...(result as { credit_used: number; amount_due: number; duplicate: boolean }),
    };
  });
