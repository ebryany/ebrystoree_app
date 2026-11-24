import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import type { RateLimitBucket } from "../rate-limit.server";

type RuntimeGlobals = typeof globalThis & {
  Deno?: { env?: { get?: (name: string) => string | undefined } };
  process?: { env?: Record<string, string | undefined> };
};

function runtimeEnv(name: string): string | undefined {
  const runtime = globalThis as RuntimeGlobals;
  return runtime.Deno?.env?.get?.(name) ?? runtime.process?.env?.[name];
}

function configuredEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = runtimeEnv(name)?.trim();
    if (value) return value;
  }
  return undefined;
}

function supabaseProjectUrl(): string {
  const url = configuredEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
  if (!url) throw new Error("SUPABASE_URL (or VITE_SUPABASE_URL) is required");
  return url;
}

function supabasePublishableKey(): string {
  const direct = configuredEnv(["SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY"]);
  if (direct) return direct;
  const keyset = runtimeEnv("SUPABASE_PUBLISHABLE_KEYS");
  if (keyset) {
    try {
      const parsed: unknown = JSON.parse(keyset);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const keys = parsed as Record<string, unknown>;
        const key = [keys['default'], ...Object.values(keys)]
          .find((v): v is string => typeof v === "string" && v.trim().startsWith("sb_publishable_"))
          ?.trim();
        if (key) return key;
      }
    } catch {
      // fall through to legacy names
    }
  }
  const legacy = configuredEnv(["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"]);
  if (legacy) return legacy;
  throw new Error("SUPABASE_PUBLISHABLE_KEY, SUPABASE_PUBLISHABLE_KEYS, or SUPABASE_ANON_KEY is required");
}

/** Forwards the verified bearer token so RLS runs as the signed-in user. */
export function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();
  if (!token) throw new Error("supabaseForUser requires a verified OAuth token");
  return createClient(supabaseProjectUrl(), supabasePublishableKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function authGuard(ctx: ToolContext) {
  if (!ctx.isAuthenticated()) {
    return { content: [{ type: "text" as const, text: "Tidak terautentikasi." }], isError: true };
  }
  return null;
}

export function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

const MCP_KNOWN_ERRORS: Record<string, string> = {
  UNAUTHENTICATED: "Sesi autentikasi tidak valid atau berakhir.",
  FORBIDDEN: "Akun tidak memiliki izin untuk tindakan ini.",
  SELF_APPROVAL_FORBIDDEN: "Tidak diperbolehkan memproses atau menyetujui transaksi milik sendiri.",
  NOT_FOUND: "Data tidak ditemukan atau bukan milik Anda.",
  INVALID_STATE: "Status data saat ini tidak mengizinkan tindakan tersebut.",
  INVALID_DECISION: "Keputusan tidak valid.",
  REASON_REQUIRED: "Alasan wajib diisi.",
  PROOF_REQUIRED: "Bukti pembayaran belum tersedia.",
  INVALID_PROOF: "Bukti pembayaran tidak valid.",
  PROOF_ALREADY_SUBMITTED: "Bukti pembayaran sudah dikirim.",
  AMOUNT_MISMATCH: "Nominal tidak cocok dengan tagihan.",
  MANUAL_ONLY: "Tindakan ini hanya berlaku untuk pembayaran manual.",
  FEATURE_DISABLED: "Fitur ini sedang dinonaktifkan sementara.",
  REFUND_ACTIVE: "Sudah ada pengajuan refund aktif untuk pesanan ini.",
  REFUND_ALLOCATION_REQUIRED: "Refund ini memerlukan keputusan alokasi dana.",
  INVALID_REFUND_AMOUNT: "Nominal refund tidak valid.",
  NO_PAID_PAYMENT: "Belum ada pembayaran lunas pada pesanan ini.",
  PAYMENT_EXPIRED: "Batas waktu pembayaran sudah lewat.",
  STORE_INACTIVE: "Toko belum aktif atau sedang ditangguhkan.",
  "row-level security": "Akun tidak memiliki izin untuk tindakan ini.",
  "42501": "Akun tidak memiliki izin untuk tindakan ini.",
  "duplicate key": "Data sudah ada atau duplikat.",
};

const MCP_KNOWN_ERROR_ENTRIES = Object.entries(MCP_KNOWN_ERRORS).sort(
  (a, b) => b[0].length - a[0].length,
);

/** Sanitasi error DB/RPC untuk output MCP agar detail skema/constraint internal tidak bocor. */
export function safeMcpError(
  tag: string,
  error: { message?: string; code?: string } | string | null | undefined,
  fallback = "Permintaan tidak dapat diproses. Periksa data atau izin akun.",
) {
  const raw = typeof error === "string" ? error : (error?.message ?? "");
  const code = typeof error === "string" ? "" : (error?.code ?? "");
  for (const [token, friendly] of MCP_KNOWN_ERROR_ENTRIES) {
    if (raw.includes(token) || code === token) {
      return errorResult(friendly);
    }
  }
  console.error(`[mcp:${tag}]`, raw || error);
  return errorResult(fallback);
}

/** Verifikasi permission RBAC di database sebelum menjalankan operasi berbiaya tinggi / side-effect. */
export async function requireMcpPermission(
  supabase: any,
  ctx: ToolContext,
  permission: string,
) {
  let userId = ctx.getUserId?.() ?? null;
  if (!userId) {
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id ?? null;
  }
  if (!userId) return errorResult("Tidak dapat membaca identitas pengguna.");

  const { data: allowed, error } = await supabase.rpc("has_permission", {
    _user_id: userId,
    _permission: permission,
  });
  if (error) {
    console.error("[mcp:authz] has_permission gagal:", error.message);
    return errorResult("Pemeriksaan izin gagal. Coba lagi.");
  }
  if (allowed) return null;

  const { data: isSuper, error: superErr } = await supabase.rpc("is_super_admin", {
    _user_id: userId,
  });
  if (!superErr && isSuper) return null;

  return errorResult(`Akun tidak memiliki izin ${permission}.`);
}

/** Rate limit server-side untuk tool MCP mutasi / berbiaya tinggi. */
export async function enforceMcpRateLimit(ctx: ToolContext, bucket: RateLimitBucket) {
  const subject = ctx.getUserId?.() || "mcp:anonymous";
  const { enforceRateLimit } = await import("../rate-limit.server");
  const limited = await enforceRateLimit(subject, bucket);
  if (limited) return errorResult(limited.error);
  return null;
}

/** Tulis jejak audit MCP ke audit_logs secara fail-safe. */
export async function writeMcpAudit(
  supabase: any,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
  },
) {
  try {
    await supabase.rpc("write_audit_log", {
      _action: entry.action,
      _entity_type: entry.entityType,
      _entity_id: entry.entityId ?? null,
      _before: entry.before ?? null,
      _after: entry.after ?? null,
      _reason: entry.reason ?? null,
      _ip: null,
      _trace_id: null,
    });
  } catch (e) {
    console.error("[mcp:audit] gagal menulis audit log:", e instanceof Error ? e.message : e);
  }
}