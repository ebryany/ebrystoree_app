import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "./rate-limit.server";
import { parsePaymentMethods, type CustomPaymentMethod } from "./payment-methods";

type Ctx = { supabase: any; userId: string };

const PROOF_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const PROOF_EXT: Record<(typeof PROOF_MIME)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const PROOF_MAX_BYTES = 5 * 1024 * 1024;

// Kolom bukti transfer (migration 20261029120000) belum ada di types.ts hasil generate,
// jadi klien admin dipakai tanpa tipe sampai types diregenerasi.
async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Metode custom aktif untuk top up. Dibaca service role karena setting-nya privat. */
async function loadTopupMethods(): Promise<{ methods: CustomPaymentMethod[]; deadlineHours: number }> {
  const sb = await admin();
  const { data } = await sb
    .from("system_settings")
    .select("key, value")
    .in("key", ["custom_payment_methods", "topup_manual_deadline_hours"]);
  const map = new Map<string, unknown>((data ?? []).map((r: any) => [r.key, r.value]));
  return {
    methods: parsePaymentMethods(map.get("custom_payment_methods") ?? []).filter(
      (m) => m.is_active && m.for_topup,
    ),
    deadlineHours: Math.min(72, Math.max(1, Number(map.get("topup_manual_deadline_hours") ?? 24))),
  };
}

/** Daftar metode top up untuk pengguna login: QRIS (bila aktif) + metode custom. */
export const listTopupMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { loadPaymentMethods } = await import("./transaction.server");
    const [{ methods }, flags] = await Promise.all([loadTopupMethods(), loadPaymentMethods()]);
    return { qris: flags.qris, methods };
  });

/** Buat top up dengan metode transfer custom. Nominal divalidasi RPC (10rb-1jt). */
export const createManualTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        amount: z.number().int().min(10_000).max(1_000_000),
        methodId: z.string().min(1).max(40),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const limited = await enforceRateLimit(context.userId, "topup.create");
    if (limited) return { ok: false as const, error: limited.error };

    const { methods, deadlineHours } = await loadTopupMethods();
    const method = methods.find((m) => m.id === data.methodId);
    if (!method) return { ok: false as const, error: "Metode pembayaran tidak tersedia." };

    const { data: topup, error } = await (context as Ctx).supabase.rpc("create_credit_topup", {
      _amount: data.amount,
    });
    if (error || !topup) return { ok: false as const, error: "Isi saldo tidak dapat dibuat. Coba lagi." };

    const expiresAt = new Date(Date.now() + deadlineHours * 3_600_000).toISOString();
    const sb = await admin();
    const { error: updError } = await sb
      .from("credit_topups")
      .update({ provider: "manual", method_snapshot: method, expires_at: expiresAt })
      .eq("id", topup.id)
      .eq("user_id", context.userId)
      .eq("status", "waiting_payment");
    if (updError) {
      console.error("[topup-manual] gagal menyiapkan:", updError.message);
      // Jangan tinggalkan baris yatim tanpa metode: batalkan supaya tidak menggantung.
      await sb.from("credit_topups").update({ status: "cancelled" }).eq("id", topup.id);
      return { ok: false as const, error: "Isi saldo gagal disiapkan. Coba lagi." };
    }

    return {
      ok: true as const,
      topup: {
        id: String(topup.id),
        topupNumber: String(topup.topup_number),
        amount: data.amount,
        expiresAt,
        method,
        proofSubmitted: false,
      },
    };
  });

/** Top up manual milik pengguna yang masih menunggu (untuk dilanjutkan setelah reload). */
export const getPendingManualTopup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context as Ctx).supabase
      .from("credit_topups")
      .select("id, topup_number, amount, expires_at, method_snapshot, proof_submitted_at, status")
      .eq("user_id", context.userId)
      .eq("provider", "manual")
      .eq("status", "waiting_payment")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return { topup: null };
    return {
      topup: {
        id: String(data.id),
        topupNumber: String(data.topup_number),
        amount: Number(data.amount),
        expiresAt: String(data.expires_at),
        method: data.method_snapshot as CustomPaymentMethod,
        proofSubmitted: Boolean(data.proof_submitted_at),
        proofSubmittedAt: (data.proof_submitted_at as string | null) ?? null,
      },
    };
  });

/** Status satu top up manual milik pengguna; dipakai layar "menunggu verifikasi". */
export const getManualTopupStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ topupId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row } = await (context as Ctx).supabase
      .from("credit_topups")
      .select("status, paid_at, proof_submitted_at, review_note")
      .eq("id", data.topupId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row) return { ok: false as const, error: "Isi saldo tidak ditemukan." };
    return {
      ok: true as const,
      status: String(row.status),
      paidAt: (row.paid_at as string | null) ?? null,
      proofSubmittedAt: (row.proof_submitted_at as string | null) ?? null,
      reviewNote: (row.review_note as string | null) ?? null,
    };
  });

export const prepareTopupProofUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        topupId: z.string().uuid(),
        mimeType: z.enum(PROOF_MIME),
        sizeBytes: z.number().int().min(1).max(PROOF_MAX_BYTES),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const limited = await enforceRateLimit(context.userId, "payment.proof");
    if (limited) return { ok: false as const, error: limited.error };

    const { data: topup } = await (context as Ctx).supabase
      .from("credit_topups")
      .select("id, status, provider, expires_at, proof_submitted_at")
      .eq("id", data.topupId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!topup || topup.provider !== "manual" || topup.status !== "waiting_payment")
      return { ok: false as const, error: "Isi saldo tidak menerima bukti transfer." };
    if (topup.expires_at && new Date(topup.expires_at).getTime() <= Date.now())
      return { ok: false as const, error: "Batas waktu isi saldo sudah lewat." };
    if (topup.proof_submitted_at)
      return { ok: false as const, error: "Bukti transfer sudah dikirim dan sedang menunggu verifikasi." };

    const path = `${context.userId}/topup-${topup.id}/${crypto.randomUUID()}.${PROOF_EXT[data.mimeType]}`;
    const sb = await admin();
    const { data: signed, error } = await sb.storage
      .from("payment-proofs")
      .createSignedUploadUrl(path);
    if (error || !signed) return { ok: false as const, error: "Gagal menyiapkan unggahan. Coba lagi." };
    return { ok: true as const, path, token: signed.token };
  });

export const submitTopupProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        topupId: z.string().uuid(),
        filePath: z.string().min(3).max(300),
        senderName: z.string().trim().min(2).max(100),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const limited = await enforceRateLimit(context.userId, "payment.proof");
    if (limited) return { ok: false as const, error: limited.error };
    // Path wajib milik top up ini dan bebas traversal; mencegah menempelkan berkas pengguna lain.
    if (
      !data.filePath.startsWith(`${context.userId}/topup-${data.topupId}/`) ||
      data.filePath.includes("..") ||
      data.filePath.includes("\\")
    ) {
      return { ok: false as const, error: "Berkas bukti tidak valid." };
    }

    const { rpcErrorMessage } = await import("./transaction.server");
    const { error } = await (context as Ctx).supabase.rpc("submit_manual_topup_proof", {
      _topup_id: data.topupId,
      _file_path: data.filePath,
      _sender_name: data.senderName,
    });
    if (error) return { ok: false as const, error: rpcErrorMessage(error.message) };
    return { ok: true as const };
  });

/* ----------------------------- Admin ----------------------------- */

async function guard<T>(context: Ctx, permission: string, run: () => Promise<T>) {
  const { assertPermission } = await import("./authz.server");
  try {
    await assertPermission(context, permission);
  } catch {
    return { forbidden: true as const, permission };
  }
  return run();
}

export const listManualTopups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    guard(context as Ctx, "payments.view", async () => {
      const sb = await admin();
      const { data } = await sb
        .from("credit_topups")
        .select(
          "id, topup_number, user_id, amount, status, method_snapshot, proof_path, proof_sender_name, proof_submitted_at, expires_at, created_at, reviewed_at, review_note",
        )
        .eq("provider", "manual")
        .order("created_at", { ascending: false })
        .limit(50);
      // Jangan membuat 50 signed URL setiap polling; tanda tangani on-demand saat admin klik "Lihat bukti".
      const items = (data ?? []).map((t: any) => {
        const { proof_path, ...rest } = t;
        return {
          ...rest,
          has_proof: Boolean(proof_path),
          proof_url: null as string | null,
        };
      });
      return { items, error: null };
    }),
  );

export const getManualTopupProofUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ topupId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "payments.view", async () => {
      const sb = await admin();
      const { data: topup, error } = await sb
        .from("credit_topups")
        .select("id, proof_path, provider")
        .eq("id", data.topupId)
        .eq("provider", "manual")
        .maybeSingle();
      if (error || !topup?.proof_path) {
        return { ok: false as const, error: "Bukti transfer tidak tersedia." };
      }
      const { data: signed, error: signErr } = await sb.storage
        .from("payment-proofs")
        .createSignedUrl(topup.proof_path, 300);
      if (signErr || !signed?.signedUrl) {
        console.error("[topup-manual] gagal membuat signed URL:", signErr?.message);
        return { ok: false as const, error: "Tautan bukti gagal dibuat. Coba lagi." };
      }
      return { ok: true as const, url: signed.signedUrl };
    }),
  );

export const reviewManualTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        topupId: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
        reason: z.string().trim().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    guard(
      context as Ctx,
      data.decision === "approve" ? "payments.verify" : "payments.reject",
      async () => {
        const limited = await enforceRateLimit(context.userId, "admin.payment.decision");
        if (limited) return { ok: false as const, error: limited.error };

        const { rpcErrorMessage } = await import("./transaction.server");
        const { error } = await (context as Ctx).supabase.rpc("review_manual_topup", {
          _topup_id: data.topupId,
          _decision: data.decision,
          _reason: data.reason ?? null,
        });
        if (error) return { ok: false as const, error: rpcErrorMessage(error.message) };
        return { ok: true as const };
      },
    ),
  );
