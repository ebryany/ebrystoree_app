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

/* ------------------------------ ShopeePay (API resmi) ------------------------------ */

const SHOPEEPAY_OFF = "ShopeePay QRIS belum aktif. Gunakan metode pembayaran lain.";
const SHOPEEPAY_PAYABLE = ["waiting_payment", "pending"];

/**
 * Membuat / mengambil Dynamic QR ShopeePay. Status awal tetap pending: pembayaran
 * hanya lunas lewat verifikasi server-to-server (verifyAndSettle).
 */
export const startShopeepayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ paymentId: z.string().uuid(), refresh: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const sp = await import("./shopeepay.server");
    const cfg = sp.shopeepayConfig();
    if (!cfg) return { ok: false as const, unavailable: true, error: SHOPEEPAY_OFF };
    const { loadPaymentMethods } = await import("./transaction.server");
    if (!(await loadPaymentMethods()).shopeepay) {
      return { ok: false as const, unavailable: true, error: SHOPEEPAY_OFF };
    }
    const limited = await enforceRateLimit(context.userId, "qris.create");
    if (limited) return { ok: false as const, error: limited.error };

    const { data: payment, error } = await (context as Ctx).supabase
      .from("payments")
      .select("id, payment_number, status, provider, method, expected_amount, expired_at, qr_reference, order_id")
      .eq("id", data.paymentId)
      .eq("user_id", (context as Ctx).userId)
      .maybeSingle();
    if (error || !payment) return { ok: false as const, error: "Pembayaran tidak ditemukan." };
    if (payment.status === "paid") return { ok: false as const, error: "Pembayaran ini sudah lunas." };
    // Hanya status yang dapat dilunasi settle_gateway_payment; QR untuk status lain
    // berisiko dana masuk tanpa bisa dilunasi.
    if (!SHOPEEPAY_PAYABLE.includes(payment.status)) {
      return { ok: false as const, error: "Status pembayaran tidak mengizinkan QRIS." };
    }

    const { data: order } = await (context as Ctx).supabase
      .from("orders")
      .select("status")
      .eq("id", payment.order_id)
      .maybeSingle();
    if (order?.status !== "awaiting_payment") {
      return { ok: false as const, error: "Pesanan tidak lagi menunggu pembayaran." };
    }

    const amount = Number(payment.expected_amount);
    if (!Number.isSafeInteger(amount) || amount < 1) {
      return { ok: false as const, error: "Nominal tagihan tidak valid." };
    }
    const paymentDeadline = payment.expired_at ? new Date(payment.expired_at).getTime() : null;
    if (paymentDeadline !== null && paymentDeadline <= Date.now() + 60_000) {
      return { ok: false as const, error: "Batas waktu pembayaran sudah lewat." };
    }

    const existing = sp.parseStoredQr(payment.qr_reference);
    if (
      !data.refresh &&
      existing &&
      existing.amount === amount &&
      new Date(existing.expiredAt).getTime() > Date.now() + 60_000
    ) {
      return { ok: true as const, qris: toClientQr(existing) };
    }

    // Kunci idempoten persisten: referensi dicadangkan di payment_events
    // (UNIQUE provider + external_event_id) SEBELUM memanggil provider, sehingga
    // dua permintaan bersamaan tidak pernah menerbitkan referensi yang sama.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("payment_events")
      .select("id", { count: "exact", head: true })
      .eq("provider", "shopeepay")
      .eq("payment_id", payment.id)
      .eq("event_type", "qr.issued");
    const attempt = count ?? 0;
    if (attempt >= 20) return { ok: false as const, error: "Terlalu banyak QRIS dibuat untuk tagihan ini. Hubungi admin." };
    const ref = sp.buildPartnerReference(payment.payment_number, attempt);
    const reserved = await sp.recordShopeepayEvent({
      eventId: sp.issuedEventId(ref),
      paymentId: payment.id,
      eventType: "qr.issued",
      signatureValid: true,
      payloadHash: null,
      status: "received",
      details: { amount, currency: "IDR", paymentStatus: "pending", metadata: { partnerReferenceNo: ref } },
    });
    if (reserved !== "inserted") {
      return { ok: false as const, error: "QRIS sedang dibuat. Tunggu sebentar lalu muat ulang." };
    }

    const validMs = cfg.validitySeconds * 1000;
    const validUntil = new Date(Math.min(Date.now() + validMs, paymentDeadline ?? Number.POSITIVE_INFINITY));
    const created = await sp.createDynamicQr(cfg, { partnerReferenceNo: ref, amount, validUntil });
    if (!created) {
      await markIssued(supabaseAdmin, ref, "failed", "generate failed");
      return { ok: false as const, error: "Gagal membuat QRIS ShopeePay. Coba lagi sebentar lagi." };
    }

    const references = [...new Set([...(existing?.references ?? []), ref])];
    const stored: import("./shopeepay.server").ShopeepayStoredQr = {
      provider: "shopeepay",
      partnerReferenceNo: ref,
      references,
      qrString: created.qrContent,
      amount,
      fee: 0,
      total: amount,
      expiredAt: validUntil.toISOString(),
      payUrl: created.qrUrl ?? "",
    };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("payments")
      .update({
        provider: "shopeepay",
        method: "qris",
        qr_reference: JSON.stringify(stored),
        payment_url: stored.payUrl || null,
      })
      .eq("id", payment.id)
      .eq("status", payment.status)
      .eq("provider", payment.provider)
      .eq("method", payment.method)
      .eq("expected_amount", payment.expected_amount)
      .select("id")
      .maybeSingle();
    if (updateError || !updated) {
      // QR sudah terbit tetapi tagihan berubah: batalkan QR agar tidak bisa dibayar.
      await sp.invalidateQr(cfg, ref, "payment changed");
      await markIssued(supabaseAdmin, ref, "rejected", "payment changed before store");
      return { ok: false as const, error: "Status pembayaran berubah. Muat ulang pesanan sebelum melanjutkan." };
    }
    await markIssued(supabaseAdmin, ref, "processed", null);

    // QR sebelumnya dibatalkan; bila tetap terbayar, rekonsiliasi masih memeriksanya.
    if (existing && existing.partnerReferenceNo !== ref) {
      await sp.invalidateQr(cfg, existing.partnerReferenceNo, "regenerated");
    }
    return { ok: true as const, qris: toClientQr(stored) };
  });

/** Cek status ShopeePay ke server ShopeePay (bukan dari klien), lalu lunasi bila valid. */
export const checkShopeepayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ paymentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: payment } = await (context as Ctx).supabase
      .from("payments")
      .select("id, payment_number, status, expected_amount, qr_reference")
      .eq("id", data.paymentId)
      .eq("user_id", (context as Ctx).userId)
      .maybeSingle();
    if (!payment) return { ok: false as const, error: "Pembayaran tidak ditemukan." };
    if (payment.status === "paid") return { ok: true as const, status: "paid" as const };

    const sp = await import("./shopeepay.server");
    const cfg = sp.shopeepayConfig();
    if (!cfg) return { ok: true as const, status: "unavailable" as const };

    const limited = await enforceRateLimit(context.userId, "qris.check");
    if (limited) return { ok: true as const, status: "pending" as const };

    const outcome = await sp.verifyAndSettle(cfg, payment);
    const stored = sp.parseStoredQr(payment.qr_reference);
    const state = sp.buyerStateFor(outcome, stored?.expiredAt ?? null);
    if (state === "failed") {
      return {
        ok: true as const,
        status: state,
        message: "Pembayaran terdeteksi tetapi tidak sesuai tagihan. Tim Ebrystore akan memeriksanya.",
      };
    }
    return { ok: true as const, status: state };
  });

function toClientQr(stored: import("./shopeepay.server").ShopeepayStoredQr) {
  return {
    payUrl: stored.payUrl,
    amount: stored.amount,
    fee: stored.fee,
    total: stored.total,
    expiredAt: stored.expiredAt,
    qrString: stored.qrString,
    reference: stored.partnerReferenceNo,
  };
}

async function markIssued(admin: any, ref: string, status: "processed" | "failed" | "rejected", error: string | null) {
  const { issuedEventId } = await import("./shopeepay.server");
  const { error: updateError } = await admin
    .from("payment_events")
    .update({ processing_status: status, processed_at: new Date().toISOString(), error })
    .eq("provider", "shopeepay")
    .eq("external_event_id", issuedEventId(ref));
  if (updateError) console.error("[shopeepay] update qr.issued gagal:", updateError.message);
}

function parseQr(value: string | null): StoredQris | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    // Data QR milik provider lain (ShopeePay) bukan QR SumoPod.
    if (parsed?.provider === "shopeepay") return null;
    if (parsed && typeof parsed.payUrl === "string" && typeof parsed.expiredAt === "string") return parsed as StoredQris;
  } catch {
    return null;
  }
  return null;
}
