import { clientIpFrom } from "./client-ip.server";

export type SecuritySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type SecurityCategory = "access_denial" | "suspicious_activity" | "security_violation";
export type SecuritySourceSystem =
  | "app_server"
  | "server_fn"
  | "webhook"
  | "internal_job"
  | "mcp"
  | "route_guard";

export type SecurityEventInput = {
  eventType: string;
  severity: SecuritySeverity;
  category: SecurityCategory;
  endpoint: string;
  reasonCode: string;
  requestId?: string | null;
  actorUserId?: string | null;
  actorRole?: string | null;
  actorEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  httpMethod?: string | null;
  routeTemplate?: string | null;
  actionName?: string | null;
  targetResourceType?: string | null;
  targetResourceId?: string | null;
  statusCode?: number;
  sourceSystem?: SecuritySourceSystem;
  dedupKey?: string | null;
  metadata?: Record<string, unknown>;
};

const SENSITIVE_KEY_PATTERN =
  /pass(word|phrase)?|token|secret|cookie|authorization|auth_header|api[_-]?key|signature|jwt|session|card|cvv|pin|private[_-]?key|credential/i;

/** Hasilkan Request Reference ID unik untuk header HTTP, halaman error, dan security event. */
export function generateRequestId(prefix = "ebry"): string {
  const ts = Date.now().toString(36);
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const bytes = new Uint8Array(4);
    cryptoObj.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${prefix}-${ts}-${hex}`;
  }
  const rand = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
  return `${prefix}-${ts}-${rand}`;
}

/** Samarkan email agar log pemantauan tetap informatif tanpa membuka PII mentah. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== "string") return null;
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (!domain) return null;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`.slice(0, 120);
}

function redactStringValue(value: string): string {
  const redacted = value
    .replace(/Bearer\s+[A-Za-z0-9\-_.~+/=]+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g, "[REDACTED_JWT]");
  return redacted.length > 300 ? `${redacted.slice(0, 297)}...` : redacted;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return redactStringValue(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 4) return "[TRUNCATED]";
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 30);
    for (const [k, v] of entries) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitizeValue(v, depth + 1);
      }
    }
    return out;
  }
  return String(value).slice(0, 120);
}

/** Sanitasi payload metadata sebelum disimpan: rahasia, token, password, dan cookie selalu dibuang. */
export function sanitizeSecurityMetadata(
  input: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  return sanitizeValue(input, 0) as Record<string, unknown>;
}

export function sanitizeUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const clean = userAgent.replace(/[\r\n\t\p{Cc}]/gu, " ").trim();
  return clean ? clean.slice(0, 300) : null;
}

async function resolveRequestContext(): Promise<{
  ip: string | null;
  userAgent: string | null;
  method: string | null;
  requestId: string | null;
}> {
  try {
    const mod = await import("@tanstack/react-start/server");
    const getHeader = mod.getRequestHeader;
    const ip = clientIpFrom((name) => getHeader(name));
    const userAgent = sanitizeUserAgent(getHeader("user-agent"));
    const requestId = getHeader("x-request-id")?.trim() || null;
    let method: string | null = null;
    if (typeof mod.getRequest === "function") {
      method = mod.getRequest()?.method ?? null;
    }
    return { ip, userAgent, method, requestId };
  } catch {
    return { ip: null, userAgent: null, method: null, requestId: null };
  }
}

/**
 * Catat security event ke database (`public.record_security_event`).
 * Selalu fail-safe: kegagalan pencatatan tidak pernah mengalahkan penolakan akses.
 */
export async function recordSecurityEvent(
  input: SecurityEventInput,
): Promise<{ ok: boolean; eventId: string | null; requestId: string }> {
  const reqCtx = await resolveRequestContext();
  const requestId = (input.requestId || reqCtx.requestId || generateRequestId()).slice(0, 80);
  const ipAddress = (input.ipAddress ?? reqCtx.ip)?.slice(0, 80) ?? null;
  const userAgent = sanitizeUserAgent(input.userAgent ?? reqCtx.userAgent);
  const httpMethod = (input.httpMethod || reqCtx.method || "POST").toUpperCase().slice(0, 16);
  const endpoint = String(input.endpoint || "/").slice(0, 240);
  const reasonCode = String(input.reasonCode || "ACCESS_DENIED").slice(0, 80);
  const sanitizedMetadata = sanitizeSecurityMetadata(input.metadata);
  const actorEmailMasked = maskEmail(input.actorEmail);
  const dedupKey = (
    input.dedupKey ||
    `${input.eventType}:${input.actorUserId ?? ipAddress ?? "anon"}:${endpoint}:${reasonCode}`
  ).slice(0, 240);

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const { data, error } = await sb.rpc("record_security_event", {
      _event_type: input.eventType.slice(0, 80),
      _severity: input.severity,
      _category: input.category,
      _endpoint: endpoint,
      _reason_code: reasonCode,
      _request_id: requestId,
      _actor_user_id: input.actorUserId ?? null,
      _actor_role: input.actorRole?.slice(0, 80) ?? null,
      _actor_email_masked: actorEmailMasked,
      _ip_address: ipAddress,
      _user_agent: userAgent,
      _http_method: httpMethod,
      _route_template: input.routeTemplate?.slice(0, 200) ?? null,
      _action_name: input.actionName?.slice(0, 120) ?? null,
      _target_resource_type: input.targetResourceType?.slice(0, 80) ?? null,
      _target_resource_id: input.targetResourceId?.slice(0, 120) ?? null,
      _status_code: input.statusCode ?? 403,
      _source_system: input.sourceSystem ?? "app_server",
      _dedup_key: dedupKey,
      _sanitized_metadata: sanitizedMetadata,
    });
    if (!error) {
      const eventId = (data as { event_id?: string } | null)?.event_id ?? null;
      return { ok: true, eventId, requestId };
    }

    // Fallback insert langsung bila fungsi RPC belum tersedia di DB target.
    const { data: inserted, error: insertError } = await sb
      .from("security_events")
      .insert({
        event_type: input.eventType.slice(0, 80),
        severity: input.severity,
        category: input.category,
        actor_user_id: input.actorUserId ?? null,
        actor_role: input.actorRole?.slice(0, 80) ?? null,
        actor_email_masked: actorEmailMasked,
        ip_address: ipAddress,
        user_agent: userAgent,
        http_method: httpMethod,
        endpoint,
        route_template: input.routeTemplate?.slice(0, 200) ?? null,
        action_name: input.actionName?.slice(0, 120) ?? null,
        target_resource_type: input.targetResourceType?.slice(0, 80) ?? null,
        target_resource_id: input.targetResourceId?.slice(0, 120) ?? null,
        status_code: input.statusCode ?? 403,
        reason_code: reasonCode,
        request_id: requestId,
        source_system: input.sourceSystem ?? "app_server",
        dedup_key: dedupKey,
        sanitized_metadata: sanitizedMetadata,
      })
      .select("id")
      .maybeSingle();

    if (insertError) {
      console.error("[security-event] gagal mencatat event:", insertError.message);
      return { ok: false, eventId: null, requestId };
    }
    return { ok: true, eventId: inserted?.id ?? null, requestId };
  } catch (err) {
    console.error(
      "[security-event] error pencatatan event:",
      err instanceof Error ? err.message : err,
    );
    return { ok: false, eventId: null, requestId };
  }
}
