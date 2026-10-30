/**
 * Rate limiting server-side (FASE 0 #3).
 *
 * Memakai RPC check_rate_limit() yang atomik di database — bukan penghitung
 * in-memory yang hilang saat server restart atau tidak akurat di banyak instance.
 *
 * Pakai:
 *   const rl = await enforceRateLimit(userId, "inquiry.create", 10, 60);
 *   if (rl) return rl; // { ok:false, error: "..." } — minta klien menunggu
 */

const DEFAULT_POLICIES = {
  "inquiry.create": { limit: 10, windowSeconds: 60 },
  "inquiry.message": { limit: 20, windowSeconds: 60 },
  "social.toggle": { limit: 30, windowSeconds: 60 },
  "po.create": { limit: 5, windowSeconds: 300 },
  "po.message": { limit: 20, windowSeconds: 60 },
  "order.create": { limit: 20, windowSeconds: 60 },
  "payment.proof": { limit: 10, windowSeconds: 300 },
  "refund.request": { limit: 5, windowSeconds: 3600 },
  "qris.create": { limit: 10, windowSeconds: 300 },
  "qris.check": { limit: 20, windowSeconds: 60 },
  "topup.create": { limit: 5, windowSeconds: 600 },
  "seller.apply": { limit: 3, windowSeconds: 3600 },
  "seller.product": { limit: 30, windowSeconds: 300 },
  "seller.payout": { limit: 5, windowSeconds: 300 },
  "admin.seller.decision": { limit: 60, windowSeconds: 300 },
  "admin.payout.decision": { limit: 60, windowSeconds: 300 },
} as const;

export type RateLimitBucket = keyof typeof DEFAULT_POLICIES;

/**
 * Bucket yang menyentuh uang atau stok. Untuk bucket ini, kegagalan limiter
 * TIDAK boleh meloloskan request: kalau pemeriksaan tidak bisa dilakukan,
 * lebih aman menolak daripada membiarkan operasi finansial tanpa batas.
 */
const FAIL_CLOSED_BUCKETS = new Set<RateLimitBucket>([
  "order.create",
  "payment.proof",
  "refund.request",
  "qris.create",
  "topup.create",
  "po.create",
  "seller.payout",
  "admin.payout.decision",
]);

export type RateLimitResult = {
  ok: false;
  error: string;
  reason: "limited" | "unavailable";
} | null;

/**
 * Mengembalikan null bila diizinkan, atau objek error siap-pakai bila dibatasi.
 *
 * Kegagalan infrastruktur (RPC error/timeout):
 * - bucket finansial → fail-closed (`reason: "unavailable"`), request ditolak
 *   dengan pesan sementara, bukan 429 palsu.
 * - bucket non-finansial → fail-open, agar gangguan database tidak mematikan
 *   fitur yang tidak menyentuh uang.
 */
export async function enforceRateLimit(
  subject: string,
  bucket: RateLimitBucket,
): Promise<RateLimitResult> {
  const policy = DEFAULT_POLICIES[bucket];
  const failClosed = FAIL_CLOSED_BUCKETS.has(bucket);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      _bucket: bucket,
      _subject: subject,
      _limit: policy.limit,
      _window_seconds: policy.windowSeconds,
    });
    if (error) {
      console.error("[rate-limit] RPC gagal:", error.message);
      return failClosed
        ? {
            ok: false,
            reason: "unavailable",
            error:
              "Layanan sedang sibuk dan permintaan Anda belum diproses. Coba lagi beberapa saat lagi.",
          }
        : null;
    }
    const allowed = Boolean((data as { allowed?: boolean } | null)?.allowed);
    if (allowed) return null;

    const minutes = Math.ceil(policy.windowSeconds / 60);
    return {
      ok: false,
      reason: "limited",
      error: `Terlalu banyak permintaan. Coba lagi dalam ${minutes} menit.`,
    };
  } catch (e) {
    console.error("[rate-limit] error tak terduga:", e instanceof Error ? e.message : e);
    return failClosed
      ? {
          ok: false,
          reason: "unavailable",
          error:
            "Layanan sedang sibuk dan permintaan Anda belum diproses. Coba lagi beberapa saat lagi.",
        }
      : null;
  }
}
