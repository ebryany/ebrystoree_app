import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "./rate-limit.server";

type Ctx = { supabase: any; userId: string };

const PAYABLE = ["waiting_payment", "pending", "rejected", "processing"];

type StoredQris = {
  providerPaymentId: string;
  payUrl: string;
  amount: number;
  fee: number;
  total: number;
  expiredAt: string;
  qrString?: string;
};

/** Membuat / mengambil pembayaran QRIS (SumoPod) untuk sebuah pembayaran. */
export const startQrisPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ paymentId: z.string().uuid(), refresh: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const limited = await enforceRateLimit(context.userId, "qris.create");
    if (limited) return { ok: false as const, error: limited.error };
    const sumopod = await import("./sumopod.server");
    const cfg = sumopod.sumopodConfig();
    if (!cfg) return { ok: false as const, error: "Pembayaran QRIS belum dikonfigurasi. Gunakan transfer manual." };

    const { data: payment, error } = await (context as Ctx).supabase
      .from("payments")
      .select("id, payment_number, status, provider, method, expected_amount, qr_reference, payment_url, order_id")
      .eq("id", data.paymentId)
      .eq("user_id", (context as Ctx).userId)
      .maybeSingle();

    if (error || !payment) return { ok: false as const, error: "Pembayaran tidak ditemukan." };
    if (payment.status === "paid") return { ok: false as const, error: "Pembayaran ini sudah lunas." };
    if (!PAYABLE.includes(payment.status)) return { ok: false as const, error: "Status pembayaran tidak mengizinkan QRIS." };

    const amount = Number(payment.expected_amount);
    const existing = parseQr(payment.qr_reference);
    if (
      !data.refresh &&
      existing?.qrString &&
      new Date(existing.expiredAt).getTime() > Date.now() + 60_000
    ) {
      return { ok: true as const, qris: existing, payUrl: existing.payUrl };
    }

    // order_id provider harus unik setiap kali dibuat ulang.
    const orderRef = data.refresh || existing ? `${payment.payment_number}-${Date.now().toString(36)}` : payment.payment_number;

    const created = await sumopod.createQrisPayment(cfg, orderRef, amount);
    if (!created) return { ok: false as const, error: "Gagal membuat QRIS. Coba lagi sebentar lagi." };

    const qr = await sumopod.fetchQrPayload(created.paymentLinkUrl);

    const total = created.amount || amount;
    const qris: StoredQris = {
      providerPaymentId: created.paymentId,
      payUrl: created.paymentLinkUrl,
      amount: created.netAmount || amount,
      fee: created.fee,
      total,
      expiredAt:
        qr?.expiresAt ?? created.expiresAt ?? new Date(Date.now() + 60 * 60_000).toISOString(),
      ...(qr?.qrString ? { qrString: qr.qrString } : {}),
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("payments")
      .update({
        provider: "sumopod",
        method: "qris",
        qr_reference: JSON.stringify(qris),
        payment_url: qris.payUrl,
        external_transaction_id: created.paymentId,
      })
      .eq("id", payment.id)
      .eq("status", payment.status)
      .eq("provider", payment.provider)
      .eq("method", payment.method)
      .eq("expected_amount", payment.expected_amount)
      .select("id")
      .maybeSingle();
    if (updateError || !updated) {
      return { ok: false as const, error: "Status pembayaran berubah. Muat ulang pesanan sebelum melanjutkan." };
    }

    return { ok: true as const, qris, payUrl: qris.payUrl };
  });

/** Mengecek status ke provider; melunasi bila sudah dibayar. */
export const checkQrisPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ paymentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const sumopod = await import("./sumopod.server");
    const cfg = sumopod.sumopodConfig();
    if (!cfg) return { ok: false as const, error: "Pembayaran QRIS belum dikonfigurasi." };

    const { data: payment } = await (context as Ctx).supabase
      .from("payments")
      .select("id, payment_number, status, expected_amount, qr_reference, external_transaction_id")
      .eq("id", data.paymentId)
      .maybeSingle();

    if (!payment) return { ok: false as const, error: "Pembayaran tidak ditemukan." };
    if (payment.status === "paid") return { ok: true as const, status: "paid" as const };

    const stored = parseQr(payment.qr_reference);
    const providerId = stored?.providerPaymentId ?? (payment.external_transaction_id as string | null);
    if (!providerId) return { ok: true as const, status: "pending" as const };

    const detail = await sumopod.getPaymentStatus(cfg, providerId);
    if (!detail) {
      // Provider tidak menyediakan endpoint status: andalkan webhook yang mungkin
      // sudah melunasi pembayaran ini beberapa detik lalu.
      const { data: fresh } = await (context as Ctx).supabase
        .from("payments")
        .select("status")
        .eq("id", payment.id)
        .maybeSingle();
      if (fresh?.status === "paid") return { ok: true as const, status: "paid" as const };
      return { ok: true as const, status: "pending" as const };
    }
    if (!["completed", "paid", "success", "settled"].includes(detail.status.toLowerCase())) {
      return { ok: true as const, status: detail.status };
    }

    const settled = await sumopod.settleSumopodPayment(payment.id, providerId, Number(payment.expected_amount));
    if (!settled.ok) return { ok: false as const, error: "Pembayaran terdeteksi, namun gagal diproses. Hubungi admin." };
    return { ok: true as const, status: "paid" as const };
  });

function parseQr(value: string | null): StoredQris | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed.payUrl === "string" && typeof parsed.expiredAt === "string") return parsed as StoredQris;
  } catch {
    return null;
  }
  return null;
}
