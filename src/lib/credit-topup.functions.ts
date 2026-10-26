import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "./rate-limit.server";

type Ctx = { supabase: any; userId: string };

const MIN_AMOUNT = 10_000;
const MAX_AMOUNT = 1_000_000;

export type CreditTopupQris = {
  payUrl: string;
  amount: number;
  fee: number;
  total: number;
  expiredAt: string;
  qrString?: string;
};

type StoredTopupQris = CreditTopupQris & { providerPaymentId: string };

/**
 * Buat permintaan isi saldo + QRIS SumoPod.
 *
 * Alur: RPC create_credit_topup (nominal server-authoritative, batas 10rb-1jt)
 * → buat QRIS ke provider → simpan qr_reference via RPC service-role
 * attach_credit_topup_qris. Bila pembuatan QRIS gagal, baris top-up dibiarkan
 * menunggu (bisa dicoba lagi / kedaluwarsa sendiri oleh cron).
 */
export const createCreditTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ amount: z.number().int().min(MIN_AMOUNT).max(MAX_AMOUNT) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const limited = await enforceRateLimit(context.userId, "topup.create");
    if (limited) return { ok: false as const, error: limited.error };

    const sumopod = await import("./sumopod.server");
    const cfg = sumopod.sumopodConfig();
    if (!cfg)
      return { ok: false as const, error: "Pembayaran QRIS belum dikonfigurasi. Coba lagi nanti." };

    const { data: topup, error } = await (context as Ctx).supabase.rpc("create_credit_topup", {
      _amount: data.amount,
    });
    if (error || !topup) {
      const msg = error?.message ?? "";
      if (msg.includes("AMOUNT_TOO_SMALL"))
        return { ok: false as const, error: "Minimal isi saldo Rp10.000." };
      if (msg.includes("AMOUNT_TOO_LARGE"))
        return { ok: false as const, error: "Maksimal isi saldo Rp1.000.000." };
      return { ok: false as const, error: "Isi saldo tidak dapat dibuat. Coba lagi." };
    }

    const created = await sumopod.createQrisPayment(cfg, String(topup.topup_number), data.amount);
    if (!created)
      return {
        ok: true as const,
        topupNumber: String(topup.topup_number),
        topupId: String(topup.id),
        qris: null,
        error: "QRIS sedang tidak dapat dibuat. Muat ulang halaman ini untuk mencoba lagi.",
      };

    const qr = await sumopod.fetchQrPayload(created.paymentLinkUrl);

    const total = created.amount || data.amount;
    const qris: StoredTopupQris = {
      providerPaymentId: created.paymentId,
      payUrl: created.paymentLinkUrl,
      amount: created.netAmount || data.amount,
      fee: created.fee,
      total,
      expiredAt:
        qr?.expiresAt ?? created.expiresAt ?? new Date(Date.now() + 60 * 60_000).toISOString(),
      ...(qr?.qrString ? { qrString: qr.qrString } : {}),
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: attachError } = await supabaseAdmin.rpc("attach_credit_topup_qris", {
      _topup_id: topup.id,
      _provider: "sumopod",
      _provider_payment_id: created.paymentId,
      _payment_url: qris.payUrl,
      _qr_reference: JSON.stringify(qris),
    });
    if (attachError) {
      console.error("[topup] attach qris gagal:", attachError.message);
      return { ok: false as const, error: "QRIS dibuat namun gagal disimpan. Coba lagi." };
    }

    return {
      ok: true as const,
      topupNumber: String(topup.topup_number),
      topupId: String(topup.id),
      qris,
      error: null,
    };
  });

/**
 * Cek status top-up ke provider; bila sudah dibayar, selesaikan (settle + kredit).
 * Idempoten: settle_credit_topup mengembalikan already_settled pada panggilan ulang.
 */
export const checkCreditTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ topupId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const sumopod = await import("./sumopod.server");
    const cfg = sumopod.sumopodConfig();
    if (!cfg) return { ok: false as const, error: "Pembayaran QRIS belum dikonfigurasi." };

    const { data: topup } = await (context as Ctx).supabase
      .from("credit_topups")
      .select("id, topup_number, status, amount, provider_payment_id, qr_reference")
      .eq("id", data.topupId)
      .maybeSingle();

    if (!topup) return { ok: false as const, error: "Isi saldo tidak ditemukan." };
    if (topup.status === "paid") return { ok: true as const, status: "paid" as const };
    if (topup.status !== "waiting_payment")
      return { ok: true as const, status: String(topup.status) };

    const stored = parseTopupQr(topup.qr_reference);
    const providerId = stored?.providerPaymentId ?? (topup.provider_payment_id as string | null);
    if (!providerId) return { ok: true as const, status: "waiting_payment" as const };

    const detail = await sumopod.getPaymentStatus(cfg, providerId);
    if (!detail) {
      // Provider tanpa endpoint status: andalkan webhook yang mungkin sudah settle.
      const { data: fresh } = await (context as Ctx).supabase
        .from("credit_topups")
        .select("status")
        .eq("id", topup.id)
        .maybeSingle();
      if (fresh?.status === "paid") return { ok: true as const, status: "paid" as const };
      return { ok: true as const, status: "waiting_payment" as const };
    }
    if (!["completed", "paid", "success", "settled"].includes(detail.status.toLowerCase())) {
      return { ok: true as const, status: detail.status };
    }

    const { settleCreditTopup } = await import("./credit-topup.server");
    const settled = await settleCreditTopup(String(topup.id), providerId, Number(topup.amount));
    if (!settled.ok)
      return {
        ok: false as const,
        error: "Pembayaran terdeteksi, namun gagal diproses. Hubungi admin.",
      };
    return { ok: true as const, status: "paid" as const };
  });

function parseTopupQr(value: string | null): StoredTopupQris | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed.payUrl === "string" && typeof parsed.expiredAt === "string")
      return parsed as StoredTopupQris;
  } catch {
    return null;
  }
  return null;
}
