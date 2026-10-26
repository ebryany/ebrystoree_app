import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  event_type: z.string().min(1).max(60),
  data: z.object({
    payment_id: z.string().min(1).max(120),
    order_id: z.string().min(1).max(160),
    amount: z.number(),
    status: z.string().max(40).optional().nullable(),
    payment_method: z.string().max(40).optional().nullable(),
    completed_at: z.string().max(60).optional().nullable(),
  }),
});

const envelopeSchema = z.object({
  event_type: z.string().min(1).max(60),
});

export const Route = createFileRoute("/api/public/payments/webhook/sumopod")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sumopod = await import("@/lib/sumopod.server");
        const cfg = sumopod.sumopodConfig();
        if (!cfg) return new Response("not configured", { status: 503 });

        // Batas ukuran body sebelum membaca: webhook tidak pernah sebesar ini,
        // dan membaca tanpa batas membuka jalan konsumsi memori.
        const declared = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declared) && declared > 64 * 1024) {
          return new Response("payload too large", { status: 413 });
        }
        const raw = await request.text();
        if (raw.length > 64 * 1024) {
          return new Response("payload too large", { status: 413 });
        }
        if (!(await sumopod.verifyWebhook(raw, request.headers))) {
          return new Response("invalid signature", { status: 401 });
        }

        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("invalid payload", { status: 400 });
        }

        const envelope = envelopeSchema.safeParse(payload);
        if (!envelope.success) {
          return new Response("invalid payload", { status: 400 });
        }

        // Tombol "Save & Test" SumoPod mengirim envelope uji tanpa data pembayaran.
        // Setelah autentikasi webhook lolos, cukup balas sukses dan jangan menyentuh transaksi.
        if (envelope.data.event_type === "payment.test") {
          return new Response("ok", { status: 200 });
        }

        const result = bodySchema.safeParse(payload);
        if (!result.success) {
          return new Response("invalid payload", { status: 400 });
        }
        const parsed: z.infer<typeof bodySchema> = result.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: byProvider } = await supabaseAdmin
          .from("payments")
          .select("id, status, expected_amount, payment_number")
          .eq("external_transaction_id", parsed.data.payment_id)
          .maybeSingle();

        // Fallback: cocokkan lewat nomor pembayaran (order_id provider bisa bersufiks).
        const paymentNumber = parsed.data.order_id.split("-").slice(0, 3).join("-");
        const { data: byNumber } = byProvider
          ? { data: null }
          : await supabaseAdmin
              .from("payments")
              .select("id, status, expected_amount, payment_number")
              .eq("payment_number", paymentNumber)
              .maybeSingle();

        const payment = byProvider ?? byNumber;

        // Jalur kedua: top-up saldo (tidak memakai tabel payments/orders).
        if (!payment) {
          const topupHandled = await handleTopupEvent(parsed);
          if (topupHandled) return new Response("ok");
        }

        const eventId = `${parsed.data.payment_id}:${parsed.event_type}`;

        async function logEvent(status: string, error?: string) {
          await supabaseAdmin.from("payment_events").insert({
            provider: "sumopod",
            external_event_id: eventId,
            payment_id: payment?.id ?? null,
            event_type: parsed.event_type,
            signature_valid: true,
            processing_status: status,
            processed_at: new Date().toISOString(),
            error: error ?? null,
          });
        }

        if (parsed.event_type !== "payment.completed") {
          await logEvent("skipped", `event ${parsed.event_type}`);
          return new Response("ok");
        }
        if (!payment) {
          await logEvent("failed", "payment not found");
          return new Response("ok");
        }
        if (payment.status === "paid") {
          await logEvent("skipped", "already settled");
          return new Response("ok");
        }
        if (Number(parsed.data.amount) !== Number(payment.expected_amount)) {
          await logEvent("failed", "amount mismatch");
          return new Response("ok");
        }

        // Validasi ulang ke API provider bila tersedia; jika endpoint status tidak ada,
        // gunakan status dari payload webhook yang sudah terverifikasi tanda tangannya.
        const detail = await sumopod.getPaymentStatus(cfg, parsed.data.payment_id);
        const effectiveStatus = (detail?.status ?? parsed.data.status ?? "").toLowerCase();
        const ok = ["completed", "paid", "success", "settled"].includes(effectiveStatus);
        if (!ok) {
          await logEvent("failed", "unverified status");
          return new Response("ok");
        }

        const settled = await sumopod.settleSumopodPayment(
          payment.id,
          parsed.data.payment_id,
          Number(payment.expected_amount),
        );
        await logEvent(settled.ok ? "processed" : "failed", settled.ok ? undefined : settled.error);

        if (settled.ok) {
          // Beritahu pemilik toko lewat Telegram bila pesanan jasa baru saja lunas.
          try {
            const { dispatchServiceOrderAlerts } = await import("@/lib/telegram.server");
            await dispatchServiceOrderAlerts();
          } catch (err) {
            console.error("[telegram] dispatch gagal:", err);
          }

          // Email transaksional. Kegagalan email tidak boleh menggagalkan webhook,
          // jadi hasilnya hanya dicatat; cron akan mengirim ulang yang gagal.
          try {
            const { dispatchEmails } = await import("@/lib/email-dispatch.server");
            await dispatchEmails(10);
          } catch (err) {
            console.error("[email] dispatch gagal:", err);
          }

          // Analitik konversi. Dicatat di SERVER, bukan dari klien: hanya server
          // yang tahu pembayaran benar-benar lunas, jadi angka konversi tidak bisa
          // dipalsukan oleh browser.
          try {
            const { recordServerEvent } = await import("@/lib/analytics.server");
            await recordServerEvent({
              event: "payment_success",
              path: `/pembayaran/${payment.id}`,
            });
          } catch (err) {
            console.error("[analytics] catat konversi gagal:", err);
          }
        }
        return new Response("ok");
      },
    },
  },
});

type ParsedWebhook = z.infer<typeof bodySchema>;

/**
 * Jalur webhook untuk top-up saldo. Dipanggil hanya ketika event bukan milik
 * tabel `payments`. Idempoten: settle_credit_topup mengembalikan
 * already_settled pada event ganda; payment_events tetap mencatat tiap event
 * dengan external_event_id unik (provider + payment_id + event_type).
 *
 * Mengembalikan true bila event memang milik top-up (sudah ditangani).
 */
async function handleTopupEvent(parsed: ParsedWebhook): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: byProviderId } = await supabaseAdmin
    .from("credit_topups")
    .select("id, status, amount, topup_number")
    .eq("provider_payment_id", parsed.data.payment_id)
    .maybeSingle();

  // Fallback: order_id provider bisa bersufiks waktu; nomor top-up TOP-YYYYMMDD-NNNNNN.
  const topupNumber = parsed.data.order_id.split("-").slice(0, 3).join("-");
  const { data: byNumber } = byProviderId
    ? { data: null }
    : await supabaseAdmin
        .from("credit_topups")
        .select("id, status, amount, topup_number")
        .eq("topup_number", topupNumber)
        .maybeSingle();

  const topup = byProviderId ?? byNumber;
  if (!topup) return false;

  const eventId = `${parsed.data.payment_id}:${parsed.event_type}`;
  async function logEvent(status: string, error?: string) {
    await supabaseAdmin.from("payment_events").insert({
      provider: "sumopod",
      external_event_id: eventId,
      payment_id: null,
      event_type: parsed.event_type,
      signature_valid: true,
      processing_status: status,
      processed_at: new Date().toISOString(),
      error: error ?? null,
    });
  }

  if (parsed.event_type !== "payment.completed") {
    await logEvent("skipped", `topup event ${parsed.event_type}`);
    return true;
  }
  if (topup.status === "paid") {
    await logEvent("skipped", "topup already settled");
    return true;
  }
  if (topup.status !== "waiting_payment") {
    await logEvent("failed", `topup status ${topup.status}`);
    return true;
  }
  if (Number(parsed.data.amount) < Number(topup.amount)) {
    await logEvent("failed", "topup amount mismatch");
    return true;
  }

  const sumopod = await import("@/lib/sumopod.server");
  const cfg = sumopod.sumopodConfig();
  if (cfg) {
    const detail = await sumopod.getPaymentStatus(cfg, parsed.data.payment_id);
    const effectiveStatus = (detail?.status ?? parsed.data.status ?? "").toLowerCase();
    if (!["completed", "paid", "success", "settled"].includes(effectiveStatus)) {
      await logEvent("failed", "topup unverified status");
      return true;
    }
  }

  const { settleCreditTopup } = await import("@/lib/credit-topup.server");
  const settled = await settleCreditTopup(
    String(topup.id),
    parsed.data.payment_id,
    Number(parsed.data.amount),
  );
  await logEvent(settled.ok ? "processed" : "failed", settled.ok ? undefined : settled.error);
  return true;
}
