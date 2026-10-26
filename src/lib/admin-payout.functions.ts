/**
 * Server functions payout seller untuk finance/admin.
 * Semua aksi melewati assertPermission + RPC SECURITY DEFINER yang memeriksa
 * permission dan anti self-approval di dalam database. Server fn tidak pernah
 * memutasi data finansial langsung.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const authz = () => import("./authz.server");

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

function rpcError(message: string) {
  const clean = message.replace(/^.*?:\s*/, "").trim();
  const map: Record<string, string> = {
    UNAUTHENTICATED: "Sesi berakhir. Masuk kembali.",
    FORBIDDEN: "Anda tidak punya izin untuk aksi ini.",
    NOT_FOUND: "Data tidak ditemukan.",
    INVALID_STATE: "Status saat ini tidak mengizinkan aksi ini.",
    INVALID_DECISION: "Keputusan tidak valid.",
    REASON_REQUIRED: "Alasan minimal 5 karakter.",
    REFERENCE_REQUIRED: "Referensi transfer wajib diisi (minimal 3 karakter).",
    SELF_APPROVAL_FORBIDDEN: "Pemilik toko tidak boleh memproses payout toko sendiri.",
  };
  return map[clean] ?? (clean.length > 3 ? clean : "Aksi gagal diproses. Coba lagi.");
}

const PAYOUT_STATUSES = [
  "requested",
  "approved",
  "transferred",
  "completed",
  "rejected",
  "cancelled",
  "needs_reconciliation",
] as const;

function maskAccount(number: string) {
  return "****" + String(number).replace(/[ -]/g, "").slice(-4);
}

/** Antrean payout (RLS staff payouts.view). Status default = yang butuh aksi. */
export const listPayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        status: z.enum(["all", ...PAYOUT_STATUSES]).default("all"),
        search: z.string().trim().max(80).default(""),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "payouts.view", async () => {
      const sb = (context as Ctx).supabase;
      let q = sb
        .from("withdrawals")
        .select(
          "id, withdrawal_number, gross_amount, fee_amount, net_amount, status, bank_name, bank_account_number, bank_account_holder, created_at, completed_at, stores(name, slug)",
        )
        .order("created_at", { ascending: false })
        .limit(100);

      if (data.status !== "all") q = q.eq("status", data.status);
      if (data.search) q = q.ilike("withdrawal_number", `%${data.search}%`);

      const { data: rows, error } = await q;
      if (error) return { items: [], error: "Antrean payout tidak dapat dimuat." };
      return {
        items: (rows ?? []).map((w: any) => ({
          id: w.id,
          withdrawal_number: w.withdrawal_number,
          store_name: w.stores?.name ?? "-",
          gross_amount: Number(w.gross_amount),
          fee_amount: Number(w.fee_amount),
          net_amount: Number(w.net_amount),
          status: w.status,
          bank_name: w.bank_name,
          bank_account_masked: maskAccount(w.bank_account_number),
          bank_account_holder: w.bank_account_holder,
          created_at: w.created_at,
          completed_at: w.completed_at,
        })),
        error: null,
      };
    }),
  );

/** Detail payout + timeline event + rekening tujuan penuh (untuk transfer manual). */
export const getPayoutDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "payouts.view", async () => {
      const sb = (context as Ctx).supabase;
      const { data: w, error } = await sb
        .from("withdrawals")
        .select(
          "*, stores(name, slug, owner_id, profiles:owner_id(full_name)), requested_by_profile:requested_by(full_name)",
        )
        .eq("id", data.id)
        .maybeSingle();
      if (error || !w) return { detail: null, error: "Detail payout tidak dapat dimuat." };

      const { data: events } = await sb
        .from("withdrawal_events")
        .select("id, event_type, note, created_at")
        .eq("withdrawal_id", data.id)
        .order("created_at", { ascending: true });

      return {
        detail: {
          ...w,
          gross_amount: Number(w.gross_amount),
          fee_amount: Number(w.fee_amount),
          net_amount: Number(w.net_amount),
          bank_account_masked: maskAccount(w.bank_account_number),
          store_owner_id: w.stores?.owner_id ?? null,
          events: events ?? [],
        },
        error: null,
      };
    }),
  );

const decisionPayload = z
  .object({
    withdrawal_id: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
    reason: z.string().trim().max(500).optional().default(""),
  })
  .strict();

/** Setujui / tolak pengajuan (permission payouts.approve di server + database). */
export const decidePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => decisionPayload.parse(data))
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "payouts.approve", async () => {
      const sb = (context as Ctx).supabase;
      const { error } = await sb.rpc("review_withdrawal", {
        _withdrawal_id: data.withdrawal_id,
        _decision: data.decision,
        _reason: data.decision === "reject" ? data.reason : data.reason || null,
      });
      if (error) return { ok: false as const, error: rpcError(error.message) };
      return { ok: true as const, error: null };
    }),
  );

const transferPayload = z
  .object({
    withdrawal_id: z.string().uuid(),
    bank_reference: z.string().trim().min(3).max(100),
    note: z.string().trim().max(500).optional().default(""),
  })
  .strict();

/** Catat transfer manual keluar (uang sudah keluar dari rekening platform). */
export const recordPayoutTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => transferPayload.parse(data))
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "payouts.process", async () => {
      const sb = (context as Ctx).supabase;
      const { error } = await sb.rpc("record_withdrawal_transfer", {
        _withdrawal_id: data.withdrawal_id,
        _bank_reference: data.bank_reference,
        _note: data.note || null,
      });
      if (error) return { ok: false as const, error: rpcError(error.message) };
      return { ok: true as const, error: null };
    }),
  );

const completionPayload = z
  .object({
    withdrawal_id: z.string().uuid(),
    note: z.string().trim().max(500).optional().default(""),
  })
  .strict();

/** Konfirmasi transfer terverifikasi selesai (fee resmi jadi pendapatan platform). */
export const completePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => completionPayload.parse(data))
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "payouts.process", async () => {
      const sb = (context as Ctx).supabase;
      const { error } = await sb.rpc("complete_withdrawal", {
        _withdrawal_id: data.withdrawal_id,
        _note: data.note || null,
      });
      if (error) return { ok: false as const, error: rpcError(error.message) };
      return { ok: true as const, error: null };
    }),
  );

const reconciliationPayload = z
  .object({ withdrawal_id: z.string().uuid(), note: z.string().trim().min(5).max(500) })
  .strict();

/** Status transfer tak pasti → butuh rekonsiliasi (tanpa auto-retry/reverse). */
export const markPayoutReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => reconciliationPayload.parse(data))
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "payouts.process", async () => {
      const sb = (context as Ctx).supabase;
      const { error } = await sb.rpc("mark_withdrawal_reconciliation", {
        _withdrawal_id: data.withdrawal_id,
        _note: data.note,
      });
      if (error) return { ok: false as const, error: rpcError(error.message) };
      return { ok: true as const, error: null };
    }),
  );

const resolvePayload = z
  .object({
    withdrawal_id: z.string().uuid(),
    outcome: z.enum(["completed", "cancelled"]),
    note: z.string().trim().min(5).max(500),
  })
  .strict();

/** Keputusan akhir rekonsiliasi oleh pihak berwenang (payouts.approve). */
export const resolvePayoutReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => resolvePayload.parse(data))
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "payouts.approve", async () => {
      const sb = (context as Ctx).supabase;
      const { error } = await sb.rpc("resolve_withdrawal_reconciliation", {
        _withdrawal_id: data.withdrawal_id,
        _outcome: data.outcome,
        _note: data.note,
      });
      if (error) return { ok: false as const, error: rpcError(error.message) };
      return { ok: true as const, error: null };
    }),
  );
