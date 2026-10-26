import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const authz = () => import("./authz.server");
const tx = () => import("./transaction.server");

type Ctx = { supabase: any; userId: string };

async function guard<T>(
  context: Ctx,
  permission: string,
  run: () => Promise<T>,
): Promise<T | { forbidden: true; permission: string }> {
  const helpers = await authz();
  try {
    await helpers.assertPermission(context, permission);
  } catch {
    return { forbidden: true as const, permission };
  }
  return run();
}

const PAGE = 15;

/**
 * Nama toko (snapshot) per order — item pertama karena satu order = satu seller
 * (invariant checkout MVP). NULL berarti order produk platform.
 */
async function storeNameMap(sb: any, orderIds: string[]) {
  if (!orderIds.length) return new Map<string, string | null>();
  const { data: items } = await sb
    .from("order_items")
    .select("order_id, store_name_snapshot, created_at")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });
  const map = new Map<string, string | null>();
  for (const it of items ?? []) {
    if (!map.has(it.order_id))
      map.set(it.order_id, (it.store_name_snapshot as string | null) ?? null);
  }
  return map;
}

/* ------------------------- Order ------------------------- */

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        search: z.string().trim().max(120).default(""),
        status: z.string().max(40).default("all"),
        type: z.string().max(20).default("all"),
        paymentStatus: z.string().max(40).default("all"),
        from: z.string().max(30).default(""),
        to: z.string().max(30).default(""),
        sort: z.enum(["newest", "oldest", "amount_desc", "amount_asc"]).default("newest"),
        page: z.number().int().min(1).default(1),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "orders.view", async () => {
      const sb = (context as Ctx).supabase;
      const from = (data.page - 1) * PAGE;
      const sortMap = {
        newest: ["created_at", false],
        oldest: ["created_at", true],
        amount_desc: ["total", false],
        amount_asc: ["total", true],
      } as const;
      const [sortCol, ascending] = sortMap[data.sort];
      let q = sb
        .from("orders")
        .select("id, order_number, order_type, status, total, created_at, expired_at, user_id", {
          count: "exact",
        })
        .order(sortCol, { ascending })
        .range(from, from + PAGE - 1);

      if (data.search) q = q.ilike("order_number", `%${data.search}%`);
      if (data.status !== "all") q = q.eq("status", data.status);
      if (data.type !== "all") q = q.eq("order_type", data.type);
      if (data.from) q = q.gte("created_at", new Date(data.from).toISOString());
      if (data.to) q = q.lte("created_at", new Date(`${data.to}T23:59:59`).toISOString());
      if (data.paymentStatus !== "all") {
        const { data: pays } = await sb
          .from("payments")
          .select("order_id")
          .eq("status", data.paymentStatus);
        const ids = Array.from(new Set((pays ?? []).map((p: any) => p.order_id)));
        if (!ids.length) return { items: [], total: 0, error: null };
        q = q.in("id", ids);
      }

      const { data: rows, count, error } = await q;
      if (error) return { items: [], total: 0, error: "Data order tidak dapat dimuat." };

      const ids = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
      const { data: profiles } = ids.length
        ? await sb.from("profiles").select("id, full_name, email").in("id", ids)
        : { data: [] as any[] };
      const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));

      const orderIds = (rows ?? []).map((r: any) => r.id);
      const { data: pays } = orderIds.length
        ? await sb.from("payments").select("order_id, status, method").in("order_id", orderIds)
        : { data: [] as any[] };
      const payMap = new Map<string, any>();
      for (const p of pays ?? []) if (!payMap.has(p.order_id)) payMap.set(p.order_id, p);

      const stores = await storeNameMap(sb, orderIds);

      return {
        items: (rows ?? []).map((r: any) => ({
          ...r,
          customer: map.get(r.user_id) ?? null,
          payment: payMap.get(r.id) ?? null,
          storeName: stores.get(r.id) ?? null,
        })),
        total: count ?? 0,
        error: null,
      };
    }),
  );

export const getOrderDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "orders.view", async () => {
      const sb = (context as Ctx).supabase;
      const { data: order } = await sb.from("orders").select("*").eq("id", data.id).maybeSingle();
      if (!order) return { order: null, error: "Order tidak ditemukan." };

      const [
        items,
        payments,
        histories,
        entitlements,
        refunds,
        customer,
        invoice,
        assignments,
        tasks,
        audits,
        serviceDetail,
      ] = await Promise.all([
        sb.from("order_items").select("*").eq("order_id", order.id),
        sb
          .from("payments")
          .select("*")
          .eq("order_id", order.id)
          .order("created_at", { ascending: false }),
        sb.from("order_status_histories").select("*").eq("order_id", order.id).order("created_at"),
        sb.from("digital_entitlements").select("*").eq("order_id", order.id),
        sb.from("refunds").select("*").eq("order_id", order.id),
        sb
          .from("profiles")
          .select("id, full_name, email, phone")
          .eq("id", order.user_id)
          .maybeSingle(),
        sb.from("invoices").select("*").eq("order_id", order.id).maybeSingle(),
        sb
          .from("operator_assignments")
          .select("*")
          .eq("order_id", order.id)
          .order("created_at", { ascending: false }),
        sb
          .from("admin_tasks")
          .select("*")
          .eq("source_id", order.id)
          .order("created_at", { ascending: false }),
        sb
          .from("audit_logs")
          .select("*")
          .eq("entity_id", order.id)
          .order("created_at", { ascending: false })
          .limit(30),
        sb.from("service_order_details").select("*").eq("order_id", order.id).maybeSingle(),
      ]);

      // Kontrak jasa seller: hanya diambil saat order memang bertipe marketplace_service,
      // sehingga daftar order biasa tidak menambah query.
      let serviceContract: any = null;
      let serviceDeliveries: any[] = [];
      let serviceEvents: any[] = [];
      let serviceStore: { name: string; slug: string } | null = null;
      if (order.order_type === "marketplace_service") {
        const [contract, deliveries, events] = await Promise.all([
          sb.from("marketplace_service_orders").select("*").eq("order_id", order.id).maybeSingle(),
          sb
            .from("marketplace_service_deliveries")
            .select("id, version, kind, url, note, summary, original_name, file_size, created_at")
            .eq("order_id", order.id)
            .order("version", { ascending: false }),
          sb
            .from("marketplace_service_events")
            .select("id, event_type, actor_role, payload, created_at")
            .eq("order_id", order.id)
            .order("id", { ascending: true }),
        ]);
        serviceContract = contract.data ?? null;
        serviceDeliveries = deliveries.data ?? [];
        serviceEvents = events.data ?? [];
        if (serviceContract?.store_id) {
          const { data: store } = await sb
            .from("stores")
            .select("name, slug")
            .eq("id", serviceContract.store_id)
            .maybeSingle();
          serviceStore = store ?? null;
        }
      }

      return {
        order,
        items: items.data ?? [],
        serviceContract,
        serviceDeliveries,
        serviceEvents,
        serviceStore,
        payments: payments.data ?? [],
        histories: histories.data ?? [],
        entitlements: entitlements.data ?? [],
        refunds: refunds.data ?? [],
        customer: customer.data ?? null,
        invoice: invoice.data ?? null,
        assignments: assignments.data ?? [],
        tasks: tasks.data ?? [],
        audits: audits.data ?? [],
        serviceDetail: serviceDetail.data ?? null,
        error: null,
      };
    }),
  );

/* ------------------------- Pembayaran ------------------------- */
export const listPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        search: z.string().trim().max(120).default(""),
        status: z.string().max(40).default("waiting_verification"),
        page: z.number().int().min(1).default(1),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "payments.view", async () => {
      const sb = (context as Ctx).supabase;
      const from = (data.page - 1) * PAGE;
      let q = sb
        .from("payments")
        .select(
          "id, payment_number, status, method, expected_amount, paid_amount, expired_at, created_at, reupload_count, order_id, orders(order_number, order_type, status)",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);

      if (data.search) q = q.ilike("payment_number", `%${data.search}%`);
      if (data.status !== "all") q = q.eq("status", data.status);

      const { data: rows, count, error } = await q;
      if (error) return { items: [], total: 0, error: "Data pembayaran tidak dapat dimuat." };
      const stores = await storeNameMap(
        sb,
        (rows ?? []).map((r: any) => r.order_id),
      );
      return {
        items: (rows ?? []).map((r: any) => ({ ...r, storeName: stores.get(r.order_id) ?? null })),
        total: count ?? 0,
        error: null,
      };
    }),
  );

export const getPaymentDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "payments.view", async () => {
      const sb = (context as Ctx).supabase;
      const helpers = await tx();
      const { data: payment } = await sb
        .from("payments")
        .select("*, orders(order_number, order_type, status, total, user_id)")
        .eq("id", data.id)
        .maybeSingle();
      if (!payment) return { payment: null, error: "Pembayaran tidak ditemukan." };

      const [proofs, verifications] = await Promise.all([
        sb
          .from("manual_payment_proofs")
          .select("*")
          .eq("payment_id", payment.id)
          .order("submitted_at", { ascending: false }),
        sb
          .from("payment_verifications")
          .select("*")
          .eq("payment_id", payment.id)
          .order("created_at", { ascending: false }),
      ]);

      const withUrl = await Promise.all(
        (proofs.data ?? []).map(async (p: any) => ({
          ...p,
          preview_url: await helpers.signedUrl("payment-proofs", p.file_path, 300),
        })),
      );

      return { payment, proofs: withUrl, verifications: verifications.data ?? [], error: null };
    }),
  );

export const verifyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        paymentId: z.string().uuid(),
        decision: z.enum(["approve", "reject", "request_reupload"]),
        reason: z.string().trim().max(400).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    guard(
      context as Ctx,
      data.decision === "approve" ? "payments.verify" : "payments.reject",
      async () => {
        const helpers = await tx();
        const dbDecision =
          data.decision === "approve"
            ? "approved"
            : data.decision === "reject"
              ? "rejected"
              : "reupload_requested";
        const { error } = await (context as Ctx).supabase.rpc("verify_manual_payment", {
          _payment_id: data.paymentId,
          _decision: dbDecision,
          _reason: data.reason ?? null,
        });
        if (error) return { ok: false, error: helpers.rpcErrorMessage(error.message) };
        return { ok: true, error: null };
      },
    ),
  );

/* ------------------------- Refund ------------------------- */

export const listRefunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        status: z.string().max(40).default("all"),
        page: z.number().int().min(1).default(1),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "refunds.view", async () => {
      const sb = (context as Ctx).supabase;
      const from = (data.page - 1) * PAGE;
      let q = sb
        .from("refunds")
        .select("*, orders(order_number, order_type, total)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (data.status !== "all") q = q.eq("status", data.status);

      const { data: rows, count, error } = await q;
      if (error) return { items: [], total: 0, error: "Data refund tidak dapat dimuat." };
      const stores = await storeNameMap(
        sb,
        (rows ?? []).map((r: any) => r.order_id),
      );
      return {
        items: (rows ?? []).map((r: any) => ({ ...r, storeName: stores.get(r.order_id) ?? null })),
        total: count ?? 0,
        error: null,
      };
    }),
  );

export const decideRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        refundId: z.string().uuid(),
        decision: z.enum(["approve", "reject", "request_info"]),
        reason: z.string().trim().min(5).max(400),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    guard(
      context as Ctx,
      data.decision === "reject" ? "refunds.reject" : "refunds.approve",
      async () => {
        const helpers = await tx();
        const { error } = await (context as Ctx).supabase.rpc("review_refund", {
          _refund_id: data.refundId,
          _decision: data.decision,
          _reason: data.reason,
        });
        if (error) return { ok: false, error: helpers.rpcErrorMessage(error.message) };
        return { ok: true, error: null };
      },
    ),
  );

export const processRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({ refundId: z.string().uuid(), reference: z.string().trim().min(3).max(120) })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "refunds.process", async () => {
      const helpers = await tx();
      const { error } = await (context as Ctx).supabase.rpc("process_refund", {
        _refund_id: data.refundId,
        _reference: data.reference,
      });
      if (error) return { ok: false, error: helpers.rpcErrorMessage(error.message) };

      // Email "refund selesai" ke pembeli. Kegagalan email tidak membatalkan
      // refund yang sudah tercatat; cron akan mengirim ulang.
      try {
        const { dispatchEmails } = await import("./email-dispatch.server");
        await dispatchEmails(5);
      } catch (err) {
        console.error("[email] dispatch setelah refund gagal:", err);
      }

      return { ok: true, error: null };
    }),
  );

/* ------------------------- Task ------------------------- */

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        status: z.string().max(30).default("open"),
        page: z.number().int().min(1).default(1),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "tasks.view", async () => {
      const sb = (context as Ctx).supabase;
      const from = (data.page - 1) * PAGE;
      let q = sb
        .from("admin_tasks")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (data.status !== "all") q = q.eq("status", data.status);

      const { data: rows, count, error } = await q;
      if (error) return { items: [], total: 0, error: "Data task tidak dapat dimuat." };
      return { items: rows ?? [], total: count ?? 0, error: null };
    }),
  );

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        taskId: z.string().uuid(),
        action: z.enum(["claim", "complete", "cancel", "reopen"]),
        note: z.string().trim().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "tasks.view", async () => {
      const helpers = await tx();
      const { error } = await (context as Ctx).supabase.rpc("update_admin_task", {
        _task_id: data.taskId,
        _action: data.action,
        _assignee: null,
        _note: data.note ?? null,
      });
      if (error) return { ok: false, error: helpers.rpcErrorMessage(error.message) };
      return { ok: true, error: null };
    }),
  );

/* ------------------------- Laporan ------------------------- */

export const getTransactionReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ days: z.number().int().min(1).max(180).default(30) }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "reports.view", async () => {
      const sb = (context as Ctx).supabase;
      const since = new Date(Date.now() - data.days * 86400000).toISOString();

      const [orders, payments, refunds] = await Promise.all([
        sb
          .from("orders")
          .select("status, order_type, total, created_at, paid_at")
          .eq("is_test_data", false)
          .gte("created_at", since),
        sb
          .from("payments")
          .select("status, method, expected_amount, paid_amount, created_at")
          .gte("created_at", since),
        sb.from("refunds").select("status, amount, created_at").gte("created_at", since),
      ]);

      if (orders.error || payments.error || refunds.error) {
        throw new Error("Ringkasan transaksi tidak dapat dimuat.");
      }
      const o = orders.data ?? [];
      const paidOrders = o.filter((x: any) => x.paid_at);
      const revenue = paidOrders.reduce((s: number, x: any) => s + Number(x.total ?? 0), 0);
      const refunded = (refunds.data ?? [])
        .filter((r: any) => r.status === "completed")
        .reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);

      const byStatus: Record<string, number> = {};
      for (const row of o) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;

      const byType: Record<string, { orders: number; revenue: number }> = {};
      for (const row of o) {
        const entry = byType[row.order_type] ?? { orders: 0, revenue: 0 };
        entry.orders += 1;
        if (row.paid_at) entry.revenue += Number(row.total ?? 0);
        byType[row.order_type] = entry;
      }

      const p = payments.data ?? [];
      const byMethod: Record<string, number> = {};
      for (const row of p) byMethod[row.method] = (byMethod[row.method] ?? 0) + 1;
      const paymentStatusCount = (s: string) => p.filter((x: any) => x.status === s).length;

      const { data: assignments } = await sb
        .from("operator_assignments")
        .select("operator_id, status, completed_at, created_at")
        .gte("created_at", since);
      const operatorPerf: Record<string, { total: number; completed: number }> = {};
      for (const a of assignments ?? []) {
        const entry = operatorPerf[a.operator_id] ?? { total: 0, completed: 0 };
        entry.total += 1;
        if (a.completed_at) entry.completed += 1;
        operatorPerf[a.operator_id] = entry;
      }

      const daily = new Map<string, { date: string; orders: number; revenue: number }>();
      for (const row of o) {
        const day = String(row.created_at).slice(0, 10);
        const entry = daily.get(day) ?? { date: day, orders: 0, revenue: 0 };
        entry.orders += 1;
        if (row.paid_at) entry.revenue += Number(row.total ?? 0);
        daily.set(day, entry);
      }

      return {
        totalOrders: o.length,
        paidOrders: paidOrders.length,
        revenue,
        refunded,
        netRevenue: revenue - refunded,
        conversion: o.length ? Math.round((paidOrders.length / o.length) * 100) : 0,
        waitingVerification: paymentStatusCount("waiting_verification"),
        paymentPaid: paymentStatusCount("paid"),
        paymentRejected: paymentStatusCount("rejected"),
        paymentExpired: paymentStatusCount("expired"),
        refundCount: (refunds.data ?? []).length,
        byType,
        byMethod,
        operatorPerf,
        byStatus,
        daily: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)),
        error: null,
      };
    }),
  );

/* ------------------------- Pengaturan ------------------------- */

export const listSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    guard(context as Ctx, "settings.view", async () => {
      const { data, error } = await (context as Ctx).supabase
        .from("system_settings")
        .select("key, value, description, is_public, updated_at")
        .order("key");
      if (error) return { items: [], error: "Pengaturan tidak dapat dimuat." };
      return { items: data ?? [], error: null };
    }),
  );

export const updateSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ key: z.string().min(1).max(80), value: z.string().max(500) }).parse(data),
  )
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "settings.manage", async () => {
      const sb = (context as Ctx).supabase;
      const helpers = await authz();

      let parsed: unknown;
      try {
        parsed = JSON.parse(data.value);
      } catch {
        parsed = data.value;
      }

      const { data: before } = await sb
        .from("system_settings")
        .select("value")
        .eq("key", data.key)
        .maybeSingle();
      const { error } = await sb
        .from("system_settings")
        .update({ value: parsed })
        .eq("key", data.key);
      if (error) return { ok: false, error: "Pengaturan gagal disimpan." };

      await helpers.writeAudit(context as Ctx, {
        action: "setting.update",
        entityType: "system_setting",
        before: before?.value ?? null,
        after: parsed,
        reason: `key=${data.key}`,
      });
      return { ok: true, error: null };
    }),
  );
/* ------------------------- Detail Refund & Task ------------------------- */

export const getRefundDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "refunds.view", async () => {
      const sb = (context as Ctx).supabase;
      const { data: refund } = await sb
        .from("refunds")
        .select("*, orders(order_number, order_type, status, total, created_at)")
        .eq("id", data.id)
        .maybeSingle();
      if (!refund) return { refund: null, error: "Refund tidak ditemukan." };

      const [customer, payment, audits] = await Promise.all([
        sb
          .from("profiles")
          .select("id, full_name, email, phone")
          .eq("id", refund.customer_id)
          .maybeSingle(),
        refund.payment_id
          ? sb.from("payments").select("*").eq("id", refund.payment_id).maybeSingle()
          : Promise.resolve({ data: null }),
        sb
          .from("audit_logs")
          .select("*")
          .eq("entity_id", refund.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      return {
        refund,
        customer: customer.data ?? null,
        payment: (payment as any).data ?? null,
        audits: audits.data ?? [],
        error: null,
      };
    }),
  );

export const getTaskDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "tasks.view", async () => {
      const sb = (context as Ctx).supabase;
      const { data: task } = await sb
        .from("admin_tasks")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      if (!task) return { task: null, error: "Task tidak ditemukan." };

      const [assignee, audits] = await Promise.all([
        task.assignee_id
          ? sb
              .from("profiles")
              .select("id, full_name, email")
              .eq("id", task.assignee_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        sb
          .from("audit_logs")
          .select("*")
          .eq("entity_id", task.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      return {
        task,
        assignee: (assignee as any).data ?? null,
        audits: audits.data ?? [],
        error: null,
      };
    }),
  );
