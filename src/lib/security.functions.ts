import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { sanitizeSearchTerm } from "@/lib/utils";
import { assertPermission, loadAccess, writeAudit } from "./authz.server";

type Ctx = { supabase: any; userId: string };

export type SecurityFinding = {
  id: string;
  severity: "ok" | "warning" | "critical";
  title: string;
  detail: string;
};

export type SecurityOverview = {
  findings: SecurityFinding[];
  counts: {
    tablesTotal: number;
    tablesWithRls: number;
    anonWriteGrants: number;
    anonFunctions: number;
    definerWithoutSearchPath: number;
    publicBuckets: number;
    bucketsTotal: number;
  };
  anonFunctionNames: string[];
  publicBucketIds: string[];
  recentAudit: Array<{
    action: string;
    entity_type: string;
    actor_role: string | null;
    created_at: string;
  }>;
  checkedAt: string;
};

export type SecurityEventRecord = {
  id: string;
  created_at: string;
  last_seen_at: string;
  event_type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  category: "access_denial" | "suspicious_activity" | "security_violation";
  actor_user_id: string | null;
  actor_role: string | null;
  actor_email_masked: string | null;
  ip_address: string | null;
  user_agent: string | null;
  http_method: string;
  endpoint: string;
  route_template: string | null;
  action_name: string | null;
  target_resource_type: string | null;
  target_resource_id: string | null;
  status_code: number;
  reason_code: string;
  request_id: string;
  source_system: string;
  occurrence_count: number;
  sanitized_metadata: Json;
  detection_status: "NEW" | "INVESTIGATING" | "ACKNOWLEDGED" | "RESOLVED" | "FALSE_POSITIVE";
  assigned_to: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
};

export type SecurityEventHistoryRecord = {
  id: string;
  event_id: string;
  actor_id: string | null;
  actor_role: string | null;
  previous_status: string | null;
  new_status: string;
  note: string | null;
  created_at: string;
};

export type SecurityAlertRecord = {
  id: string;
  created_at: string;
  updated_at: string;
  last_triggered_at: string;
  rule_code: string;
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "INVESTIGATING" | "ACKNOWLEDGED" | "RESOLVED" | "FALSE_POSITIVE";
  source_ip: string | null;
  actor_user_id: string | null;
  target_endpoint: string | null;
  trigger_count: number;
  sample_event_ids: string[];
  metadata: Json;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
};

export type SecurityDashboardSummary = {
  migrationPending: boolean;
  hours: number;
  kpis: {
    totalEvents: number;
    uniqueEvents: number;
    unauthenticatedCount: number;
    forbiddenCount: number;
    rateLimitCount: number;
    webhookFailureCount: number;
    criticalHighCount: number;
    openAlertsCount: number;
  };
  topEndpoints: Array<{ endpoint: string; count: number }>;
  topIps: Array<{ ip: string; count: number }>;
  alerts: SecurityAlertRecord[];
};

async function requireSecurityAccess(
  ctx: Ctx,
  primaryPermission: string,
  fallbackPermission: string,
  endpoint: string,
) {
  const access = await loadAccess(ctx);
  if (
    access.isSuperAdmin ||
    access.permissions.includes(primaryPermission) ||
    access.permissions.includes(fallbackPermission)
  ) {
    return access;
  }
  return assertPermission(ctx, primaryPermission, { endpoint });
}

function isMissingRelationError(err: unknown): boolean {
  const msg = String((err as { message?: string; code?: string } | null)?.message ?? "");
  const code = String((err as { code?: string } | null)?.code ?? "");
  return code === "42P01" || /does not exist|Could not find the table/i.test(msg);
}

/**
 * Mencatat percobaan akses langsung oleh pengguna terautentikasi yang tidak
 * memiliki izin membuka rute sensitif (`/admin`, `/see`, `/operator`).
 */
export const reportUnauthorizedRouteAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        area: z.enum(["admin", "see", "operator", "seller"]),
        route: z.string().trim().min(1).max(240),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { enforceRateLimit } = await import("./rate-limit.server");
    const limited = await enforceRateLimit(ctx.userId, "security.route_report");
    const access = await loadAccess(ctx);

    const { generateRequestId, recordSecurityEvent } = await import("./security-event.server");
    if (limited) {
      return { recorded: false as const, requestId: generateRequestId() };
    }

    const cleanRoute = data.route.split("?")[0].split("#")[0].slice(0, 240);
    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("email")
      .eq("id", ctx.userId)
      .maybeSingle();

    const result = await recordSecurityEvent({
      eventType:
        data.area === "admin" || data.area === "see"
          ? "forbidden_admin_access"
          : "forbidden_role_access",
      severity: data.area === "admin" || data.area === "see" ? "HIGH" : "MEDIUM",
      category: "access_denial",
      actorUserId: ctx.userId,
      actorRole: access.roles.join(",") || "authenticated",
      actorEmail: (profile?.email as string | null) ?? null,
      httpMethod: "GET",
      endpoint: cleanRoute,
      routeTemplate: `/${data.area}/*`,
      actionName: "route.guard.denied",
      statusCode: 403,
      reasonCode: "SENSITIVE_ROUTE_DENIED",
      sourceSystem: "route_guard",
      metadata: { area: data.area, attemptedPath: cleanRoute },
    });

    return { recorded: result.ok, requestId: result.requestId };
  });

/**
 * Ringkasan kondisi keamanan database & storage (`settings.view`).
 */
export const getSecurityOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    await assertPermission(ctx, "settings.view");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [catalog, anonFns, definers, buckets, audit] = await Promise.all([
      supabaseAdmin.rpc("security_catalog_snapshot"),
      supabaseAdmin.rpc("security_anon_functions"),
      supabaseAdmin.rpc("security_definer_missing_search_path"),
      supabaseAdmin
        .from("system_settings")
        .select("key")
        .in("key", ["security_bucket_ids"])
        .maybeSingle(),
      ctx.supabase
        .from("audit_logs")
        .select("action, entity_type, actor_role, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

    const snap = (catalog.data ?? {}) as {
      tables_total?: number;
      tables_with_rls?: number;
      anon_write_grants?: number;
    };
    const anonNames = ((anonFns.data ?? []) as Array<{ fn: string }>).map((row) => row.fn);
    const definerList = (definers.data ?? []) as Array<{ fn: string; args: string }>;

    const { data: bucketRows } = await supabaseAdmin.storage.listBuckets();
    const bucketList = (bucketRows ?? []) as Array<{ id: string; public: boolean }>;
    const publicBuckets = bucketList.filter((b) => b.public).map((b) => b.id);
    void buckets;

    const findings: SecurityFinding[] = [];
    const tablesTotal = Number(snap.tables_total ?? 0);
    const tablesWithRls = Number(snap.tables_with_rls ?? 0);
    const anonWrite = Number(snap.anon_write_grants ?? 0);

    findings.push(
      tablesWithRls === tablesTotal
        ? {
            id: "rls",
            severity: "ok",
            title: "Row Level Security aktif di semua tabel",
            detail: `${tablesWithRls} dari ${tablesTotal} tabel public memakai RLS.`,
          }
        : {
            id: "rls",
            severity: "critical",
            title: "Ada tabel tanpa Row Level Security",
            detail: `${tablesTotal - tablesWithRls} tabel public belum memakai RLS.`,
          },
    );

    findings.push(
      anonWrite === 0
        ? {
            id: "anon_write",
            severity: "ok",
            title: "Anon tidak punya hak tulis",
            detail: "Tidak ada grant INSERT/UPDATE/DELETE/TRUNCATE untuk anon.",
          }
        : {
            id: "anon_write",
            severity: "critical",
            title: "Anon masih punya hak tulis",
            detail: `${anonWrite} tabel memberi grant tulis ke anon.`,
          },
    );

    const expectedAnon = ["product_rating_summary", "search_products_fts", "store_rating_summary"];
    const unexpectedAnon = anonNames.filter((name) => !expectedAnon.includes(name));
    findings.push(
      unexpectedAnon.length === 0
        ? {
            id: "anon_fn",
            severity: "ok",
            title: "Fungsi publik anon sesuai daftar",
            detail: `Hanya ${anonNames.length} fungsi publik yang dapat dipanggil anon.`,
          }
        : {
            id: "anon_fn",
            severity: "warning",
            title: "Ada fungsi tambahan yang dapat dipanggil anon",
            detail: unexpectedAnon.join(", "),
          },
    );

    findings.push(
      definerList.length === 0
        ? {
            id: "search_path",
            severity: "ok",
            title: "Semua fungsi definer memakai search_path",
            detail: "Tidak ada fungsi SECURITY DEFINER tanpa search_path eksplisit.",
          }
        : {
            id: "search_path",
            severity: "warning",
            title: "Fungsi definer tanpa search_path",
            detail: definerList.map((row) => row.fn).join(", "),
          },
    );

    findings.push(
      publicBuckets.length === 0
        ? {
            id: "buckets",
            severity: "ok",
            title: "Tidak ada bucket publik",
            detail: `${bucketList.length} bucket storage semuanya privat.`,
          }
        : {
            id: "buckets",
            severity: "critical",
            title: "Ada bucket storage publik",
            detail: publicBuckets.join(", "),
          },
    );

    const overview: SecurityOverview = {
      findings,
      counts: {
        tablesTotal,
        tablesWithRls,
        anonWriteGrants: anonWrite,
        anonFunctions: anonNames.length,
        definerWithoutSearchPath: definerList.length,
        publicBuckets: publicBuckets.length,
        bucketsTotal: bucketList.length,
      },
      anonFunctionNames: anonNames,
      publicBucketIds: publicBuckets,
      recentAudit: (audit.data ?? []) as SecurityOverview["recentAudit"],
      checkedAt: new Date().toISOString(),
    };
    return { overview, error: null };
  });

/** KPI Security Monitoring Center & daftar alerts terbaru. */
export const getSecurityDashboardSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        hours: z.number().int().min(1).max(720).default(24),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireSecurityAccess(
      ctx,
      "security.events.read",
      "settings.view",
      "serverFn:security:getSecurityDashboardSummary",
    );

    const sinceIso = new Date(Date.now() - data.hours * 3600_000).toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;

    const [eventsRes, alertsRes] = await Promise.all([
      sb
        .from("security_events")
        .select("event_type, severity, status_code, endpoint, ip_address, occurrence_count")
        .gte("last_seen_at", sinceIso)
        .order("last_seen_at", { ascending: false })
        .limit(1000),
      sb
        .from("security_alerts")
        .select("*")
        .order("last_triggered_at", { ascending: false })
        .limit(50),
    ]);

    if (eventsRes.error && isMissingRelationError(eventsRes.error)) {
      return {
        summary: {
          migrationPending: true,
          hours: data.hours,
          kpis: {
            totalEvents: 0,
            uniqueEvents: 0,
            unauthenticatedCount: 0,
            forbiddenCount: 0,
            rateLimitCount: 0,
            webhookFailureCount: 0,
            criticalHighCount: 0,
            openAlertsCount: 0,
          },
          topEndpoints: [],
          topIps: [],
          alerts: [],
        } satisfies SecurityDashboardSummary,
      };
    }

    const rows = (eventsRes.data ?? []) as Array<{
      event_type: string;
      severity: string;
      status_code: number;
      endpoint: string;
      ip_address: string | null;
      occurrence_count: number;
    }>;
    const alerts = (alertsRes.data ?? []) as SecurityAlertRecord[];

    let totalEvents = 0;
    let unauthenticatedCount = 0;
    let forbiddenCount = 0;
    let rateLimitCount = 0;
    let webhookFailureCount = 0;
    let criticalHighCount = 0;
    const endpointCounts = new Map<string, number>();
    const ipCounts = new Map<string, number>();

    for (const r of rows) {
      const n = Math.max(1, Number(r.occurrence_count ?? 1));
      totalEvents += n;
      if (r.status_code === 401) unauthenticatedCount += n;
      if (r.status_code === 403) forbiddenCount += n;
      if (r.status_code === 429) rateLimitCount += n;
      if (
        r.event_type === "invalid_webhook_signature" ||
        r.event_type === "invalid_internal_job_token"
      ) {
        webhookFailureCount += n;
      }
      if (r.severity === "CRITICAL" || r.severity === "HIGH") {
        criticalHighCount += n;
      }
      endpointCounts.set(r.endpoint, (endpointCounts.get(r.endpoint) ?? 0) + n);
      if (r.ip_address) {
        ipCounts.set(r.ip_address, (ipCounts.get(r.ip_address) ?? 0) + n);
      }
    }

    const topEndpoints = [...endpointCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([endpoint, count]) => ({ endpoint, count }));
    const topIps = [...ipCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ip, count]) => ({ ip, count }));

    const openAlertsCount = alerts.filter(
      (a) => a.status === "OPEN" || a.status === "INVESTIGATING",
    ).length;

    return {
      summary: {
        migrationPending: false,
        hours: data.hours,
        kpis: {
          totalEvents,
          uniqueEvents: rows.length,
          unauthenticatedCount,
          forbiddenCount,
          rateLimitCount,
          webhookFailureCount,
          criticalHighCount,
          openAlertsCount,
        },
        topEndpoints,
        topIps,
        alerts,
      } satisfies SecurityDashboardSummary,
    };
  });

/** Daftar terpaginasi dan terfilter `security_events`. */
export const listSecurityEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        search: z.string().trim().max(120).optional().default(""),
        severity: z.enum(["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional().default("ALL"),
        status: z
          .enum(["ALL", "NEW", "INVESTIGATING", "ACKNOWLEDGED", "RESOLVED", "FALSE_POSITIVE"])
          .optional()
          .default("ALL"),
        category: z
          .enum(["ALL", "access_denial", "suspicious_activity", "security_violation"])
          .optional()
          .default("ALL"),
        hours: z.number().int().min(1).max(720).optional().default(168),
        page: z.number().int().min(1).optional().default(1),
        pageSize: z.number().int().min(5).max(50).optional().default(15),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireSecurityAccess(
      ctx,
      "security.events.read",
      "settings.view",
      "serverFn:security:listSecurityEvents",
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const from = (data.page - 1) * data.pageSize;
    const sinceIso = new Date(Date.now() - data.hours * 3600_000).toISOString();

    let q = sb
      .from("security_events")
      .select("*", { count: "exact" })
      .gte("last_seen_at", sinceIso)
      .order("last_seen_at", { ascending: false })
      .range(from, from + data.pageSize - 1);

    if (data.severity !== "ALL") q = q.eq("severity", data.severity);
    if (data.status !== "ALL") q = q.eq("detection_status", data.status);
    if (data.category !== "ALL") q = q.eq("category", data.category);

    const term = sanitizeSearchTerm(data.search);
    if (term) {
      q = q.or(
        `endpoint.ilike.%${term}%,event_type.ilike.%${term}%,reason_code.ilike.%${term}%,request_id.ilike.%${term}%,ip_address.ilike.%${term}%`,
      );
    }

    const { data: items, count, error } = await q;
    if (error) {
      if (isMissingRelationError(error)) {
        return { items: [] as SecurityEventRecord[], total: 0, migrationPending: true, error: null };
      }
      return {
        items: [] as SecurityEventRecord[],
        total: 0,
        migrationPending: false,
        error: "Daftar security event tidak dapat dimuat.",
      };
    }

    return {
      items: (items ?? []) as SecurityEventRecord[],
      total: count ?? 0,
      migrationPending: false,
      error: null,
    };
  });

/** Detail lengkap satu security event + riwayat investigasi. */
export const getSecurityEventDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireSecurityAccess(
      ctx,
      "security.events.view_details",
      "settings.view",
      "serverFn:security:getSecurityEventDetail",
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const [eventRes, historyRes] = await Promise.all([
      sb.from("security_events").select("*").eq("id", data.id).maybeSingle(),
      sb
        .from("security_event_histories")
        .select("*")
        .eq("event_id", data.id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    return {
      event: (eventRes.data ?? null) as SecurityEventRecord | null,
      histories: (historyRes.data ?? []) as SecurityEventHistoryRecord[],
    };
  });

/** Workflow investigasi security event (`NEW` -> `INVESTIGATING` / `ACKNOWLEDGED` / `RESOLVED` / `FALSE_POSITIVE`). */
export const updateSecurityEventStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["NEW", "INVESTIGATING", "ACKNOWLEDGED", "RESOLVED", "FALSE_POSITIVE"]),
        note: z.string().trim().max(1000).optional().default(""),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const access = await requireSecurityAccess(
      ctx,
      "security.events.resolve",
      "settings.manage",
      "serverFn:security:updateSecurityEventStatus",
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const { data: before } = await sb
      .from("security_events")
      .select("id, detection_status, resolution_note")
      .eq("id", data.id)
      .maybeSingle();

    if (!before) return { ok: false as const, message: "Security event tidak ditemukan." };

    const isDone = data.status === "RESOLVED" || data.status === "FALSE_POSITIVE";
    const { error } = await sb
      .from("security_events")
      .update({
        detection_status: data.status,
        resolved_by: isDone ? ctx.userId : null,
        resolved_at: isDone ? new Date().toISOString() : null,
        resolution_note: data.note || before.resolution_note || null,
      })
      .eq("id", data.id);

    if (error) return { ok: false as const, message: "Status event gagal diperbarui." };

    await Promise.all([
      sb.from("security_event_histories").insert({
        event_id: data.id,
        actor_id: ctx.userId,
        actor_role: access.roles.join(",") || null,
        previous_status: before.detection_status,
        new_status: data.status,
        note: data.note || null,
      }),
      writeAudit(ctx, {
        action: "security_event.status_updated",
        entityType: "security_events",
        entityId: data.id,
        before: { status: before.detection_status },
        after: { status: data.status },
        reason: data.note || `Status diubah ke ${data.status}`,
      }),
    ]);

    return { ok: true as const, message: "Status security event diperbarui." };
  });

/** Tindak lanjut Security Alert. */
export const updateSecurityAlertStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["OPEN", "INVESTIGATING", "ACKNOWLEDGED", "RESOLVED", "FALSE_POSITIVE"]),
        note: z.string().trim().max(1000).optional().default(""),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await requireSecurityAccess(
      ctx,
      "security.alerts.manage",
      "settings.manage",
      "serverFn:security:updateSecurityAlertStatus",
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const { data: before } = await sb
      .from("security_alerts")
      .select("id, status, rule_code")
      .eq("id", data.id)
      .maybeSingle();

    if (!before) return { ok: false as const, message: "Security alert tidak ditemukan." };

    const isDone = data.status === "RESOLVED" || data.status === "FALSE_POSITIVE";
    const { error } = await sb
      .from("security_alerts")
      .update({
        status: data.status,
        resolved_by: isDone ? ctx.userId : null,
        resolved_at: isDone ? new Date().toISOString() : null,
        resolution_note: data.note || null,
      })
      .eq("id", data.id);

    if (error) return { ok: false as const, message: "Status alert gagal diperbarui." };

    await writeAudit(ctx, {
      action: "security_alert.status_updated",
      entityType: "security_alerts",
      entityId: data.id,
      before: { status: before.status },
      after: { status: data.status, ruleCode: before.rule_code },
      reason: data.note || `Alert diubah ke ${data.status}`,
    });

    return { ok: true as const, message: "Status security alert diperbarui." };
  });

export const securityOverviewInput = z.object({}).strict();
