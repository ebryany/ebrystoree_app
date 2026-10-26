import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const authz = () => import("./authz.server");
const tx = () => import("./transaction.server");

type Ctx = { supabase: any; userId: string };

async function can(context: Ctx, permission: string): Promise<boolean> {
  const helpers = await authz();
  try {
    await helpers.assertPermission(context, permission);
    return true;
  } catch {
    return false;
  }
}

async function rpc(context: Ctx, fn: string, args: Record<string, unknown>) {
  const helpers = await tx();
  const { data, error } = await (context.supabase as any).rpc(fn, args);
  if (error) return { ok: false as const, error: helpers.rpcErrorMessage(error.message) };
  return { ok: true as const, data };
}

/* ------------------------- Admin: penugasan ------------------------- */

export const listOperators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    if (!(await can(ctx, "orders.assign"))) return { forbidden: true as const, items: [] as any[] };
    const { data: roles } = await ctx.supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["operator", "admin", "super_admin"]);
    const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    if (!ids.length) return { forbidden: false as const, items: [] };
    const { data: profiles } = await ctx.supabase.from("profiles").select("id, full_name, email").in("id", ids);
    const roleMap = new Map<string, string[]>();
    for (const r of roles ?? []) roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
    const items = (profiles ?? []).map((p: any) => ({
      id: p.id,
      name: p.full_name || p.email || p.id.slice(0, 8),
      email: p.email,
      roles: roleMap.get(p.id) ?? [],
    }));
    items.sort((a: any, b: any) => a.name.localeCompare(b.name));
    return { forbidden: false as const, items };
  });

export const assignOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        operatorId: z.string().uuid(),
        deadline: z.string().max(40).optional().nullable(),
        note: z.string().trim().max(500).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    rpc(context as Ctx, "assign_operator", {
      _order_id: data.orderId,
      _operator_id: data.operatorId,
      _deadline: data.deadline ? new Date(data.deadline).toISOString() : null,
      _note: data.note ?? null,
    }),
  );

/* ------------------------- Operator ------------------------- */

export const listMyAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        filter: z.enum(["active", "done", "all"]).default("active"),
        scope: z.enum(["mine", "all"]).default("mine"),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    if (!(await can(ctx, "orders.fulfill"))) return { forbidden: true as const, items: [] as any[] };
    // Scope "all" hanya untuk staf yang boleh menugaskan operator.
    const seeAll = data.scope === "all" && (await can(ctx, "orders.assign"));

    let q = ctx.supabase
      .from("operator_assignments")
      .select("id, order_id, operator_id, status, assigned_at, accepted_at, started_at, completed_at, deadline_at")
      .order("assigned_at", { ascending: false });
    if (!seeAll) q = q.eq("operator_id", ctx.userId);
    if (data.filter === "active") q = q.in("status", ["assigned", "accepted", "in_progress"]);
    if (data.filter === "done") q = q.in("status", ["completed", "released", "cancelled"]);

    const { data: rows, error } = await q;
    if (error) return { forbidden: false as const, items: [], error: "Daftar tugas tidak dapat dimuat." };

    const orderIds = (rows ?? []).map((r: any) => r.order_id);
    const { data: orders } = orderIds.length
      ? await ctx.supabase
          .from("orders")
          .select("id, order_number, status, total, created_at, order_type")
          .in("id", orderIds)
      : { data: [] as any[] };
    const { data: items } = orderIds.length
      ? await ctx.supabase.from("order_items").select("order_id, name_snapshot, item_type").in("order_id", orderIds)
      : { data: [] as any[] };

    const orderMap = new Map((orders ?? []).map((o: any) => [o.id, o]));

    const operatorIds = Array.from(new Set((rows ?? []).map((r: any) => r.operator_id).filter(Boolean)));
    const { data: operatorProfiles } = operatorIds.length
      ? await ctx.supabase.from("profiles").select("id, full_name, email").in("id", operatorIds)
      : { data: [] as any[] };
    const operatorMap = new Map(
      (operatorProfiles ?? []).map((p: any) => [p.id, p.full_name || p.email || p.id.slice(0, 8)]),
    );

    const { data: progressRows } = orderIds.length
      ? await ctx.supabase
          .from("job_progress")
          .select("order_id, percent, created_at")
          .in("order_id", orderIds)
          .order("created_at", { ascending: false })
      : { data: [] as any[] };
    const { data: revisionRows } = orderIds.length
      ? await ctx.supabase.from("job_revisions").select("order_id, status").in("order_id", orderIds)
      : { data: [] as any[] };

    const percentMap = new Map<string, number>();
    for (const p of progressRows ?? []) if (!percentMap.has(p.order_id)) percentMap.set(p.order_id, p.percent);
    const revisionMap = new Map<string, number>();
    for (const r of revisionRows ?? []) {
      if (r.status === "open" || r.status === "in_progress")
        revisionMap.set(r.order_id, (revisionMap.get(r.order_id) ?? 0) + 1);
    }

    return {
      forbidden: false as const,
      items: (rows ?? []).map((a: any) => ({
        ...a,
        order: orderMap.get(a.order_id) ?? null,
        operatorName: operatorMap.get(a.operator_id) ?? null,
        isMine: a.operator_id === ctx.userId,
        percent: percentMap.get(a.order_id) ?? 0,
        openRevisions: revisionMap.get(a.order_id) ?? 0,
        serviceName:
          (items ?? []).find((i: any) => i.order_id === a.order_id && i.item_type === "service")?.name_snapshot ?? null,
      })),
      error: null,
    };
  });

/** Detail lengkap fulfillment satu order. Dapat dibaca customer, operator, dan staf sesuai RLS. */
export const getOrderFulfillment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const sb = (context as Ctx).supabase;
    const [order, assignment, progress, results, revisions, detail] = await Promise.all([
      sb
        .from("orders")
        .select("id, order_number, status, order_type, total, created_at, customer_note")
        .eq("id", data.orderId)
        .maybeSingle(),
      sb
        .from("operator_assignments")
        .select("id, operator_id, status, assigned_at, accepted_at, started_at, completed_at, deadline_at, internal_note")
        .eq("order_id", data.orderId)
        .order("assigned_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      sb
        .from("job_progress")
        .select("id, percent, note, is_public, created_at")
        .eq("order_id", data.orderId)
        .order("created_at", { ascending: false }),
      sb
        .from("job_results")
        .select("id, version, summary, delivery_note, result_url, status, submitted_at, reviewed_at")
        .eq("order_id", data.orderId)
        .order("version", { ascending: false }),
      sb
        .from("job_revisions")
        .select("id, sequence, reason, status, is_chargeable, created_at, resolved_at")
        .eq("order_id", data.orderId)
        .order("sequence", { ascending: false }),
      sb
        .from("service_order_details")
        .select("package_snapshot, addons_snapshot, requirements, requirements_note, estimated_days, revision_allowance, internal_deadline")
        .eq("order_id", data.orderId)
        .maybeSingle(),
    ]);

    let operatorName: string | null = null;
    if (assignment.data?.operator_id) {
      const { data: p } = await sb
        .from("profiles")
        .select("full_name, email")
        .eq("id", assignment.data.operator_id)
        .maybeSingle();
      operatorName = p ? (p.full_name || p.email) : null;
    }

    return {
      order: order.data ?? null,
      assignment: assignment.data ?? null,
      operatorName,
      progress: progress.data ?? [],
      results: results.data ?? [],
      revisions: revisions.data ?? [],
      serviceDetail: detail.data ?? null,
    };
  });

export const operatorAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        action: z.enum(["accept", "start", "progress"]),
        note: z.string().trim().max(1000).optional().nullable(),
        percent: z.number().int().min(0).max(100).optional().nullable(),
        isPublic: z.boolean().default(true),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    rpc(context as Ctx, "operator_update_assignment", {
      _order_id: data.orderId,
      _action: data.action,
      _note: data.note ?? null,
      _percent: data.percent ?? null,
      _is_public: data.isPublic,
    }),
  );

export const submitJobResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        summary: z.string().trim().min(5).max(2000),
        deliveryNote: z.string().trim().max(2000).optional().nullable(),
        resultUrl: z.string().trim().url().max(500).optional().or(z.literal("")).nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    rpc(context as Ctx, "submit_job_result", {
      _order_id: data.orderId,
      _summary: data.summary,
      _delivery_note: data.deliveryNote ?? null,
      _result_url: data.resultUrl || null,
    }),
  );

/* ------------------------- Customer ------------------------- */

export const reviewJobResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        decision: z.enum(["approve", "revision"]),
        reason: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    rpc(context as Ctx, "review_job_result", {
      _order_id: data.orderId,
      _decision: data.decision,
      _reason: data.reason ?? null,
    }),
  );

/* ------------------------- Admin: antrean penugasan ------------------------- */

/** Order jasa yang sudah dibayar tapi belum punya operator aktif. */
export const listPendingAssignment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    if (!(await can(ctx, "orders.assign"))) return { forbidden: true as const, items: [] as any[] };

    const { data: orders } = await ctx.supabase
      .from("orders")
      .select("id, order_number, status, total, created_at, paid_at")
      .eq("order_type", "service")
      .in("status", ["academic_review", "waiting_assignment"])
      .order("created_at", { ascending: true });

    const ids = (orders ?? []).map((o: any) => o.id);
    if (!ids.length) return { forbidden: false as const, items: [] };

    const [{ data: assigns }, { data: details }, { data: items }] = await Promise.all([
      ctx.supabase
        .from("operator_assignments")
        .select("order_id, status")
        .in("order_id", ids)
        .in("status", ["assigned", "accepted", "in_progress"]),
      ctx.supabase
        .from("service_order_details")
        .select("order_id, scope_review_status, scope_review_note, estimated_days, customer_deadline")
        .in("order_id", ids),
      ctx.supabase.from("order_items").select("order_id, name_snapshot, item_type").in("order_id", ids),
    ]);

    const busy = new Set((assigns ?? []).map((a: any) => a.order_id));
    const detailMap = new Map<string, any>((details ?? []).map((d: any) => [d.order_id, d]));

    return {
      forbidden: false as const,
      items: (orders ?? [])
        .filter((o: any) => !busy.has(o.id))
        .map((o: any) => ({
          ...o,
          scopeStatus: detailMap.get(o.id)?.scope_review_status ?? "pending",
          scopeNote: detailMap.get(o.id)?.scope_review_note ?? null,
          customerDeadline: detailMap.get(o.id)?.customer_deadline ?? null,
          serviceName:
            (items ?? []).find((i: any) => i.order_id === o.id && i.item_type === "service")?.name_snapshot ?? null,
        })),
    };
  });

export const reviewAcademicScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        decision: z.enum(["approved", "needs_clarification", "rejected"]),
        note: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    rpc(context as Ctx, "review_academic_scope", {
      _order_id: data.orderId,
      _decision: data.decision,
      _note: data.note ?? null,
    }),
  );
