import { createFileRoute } from "@tanstack/react-router";

/** Balasan sukses wajib sesuai kontrak Notify Transaction Status (MPM). */
const ACK = { responseCode: "2005600", responseMessage: "Successful" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Callback ShopeePay MPM. Callback hanya pemicu: status selalu dikonfirmasi
 * ulang lewat qr-mpm-query sebelum pelunasan. ShopeePay tidak mengulang
 * callback, jadi job rekonsiliasi menutup callback yang hilang.
 */
export const Route = createFileRoute("/api/public/payments/webhook/shopeepay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sp = await import("@/lib/shopeepay.server");
        const cfg = sp.shopeepayConfig();
        if (!cfg) return new Response("not configured", { status: 503 });

        const declared = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declared) && declared > 64 * 1024) {
          return new Response("payload too large", { status: 413 });
        }
        const raw = await request.text();
        if (raw.length > 64 * 1024) {
          return new Response("payload too large", { status: 413 });
        }

        const timestamp = request.headers.get("x-timestamp");
        const signatureValid = sp.verifyCallbackSignature({
          rawBody: raw,
          callbackUrl: cfg.callbackUrl,
          timestamp,
          signature: request.headers.get("x-signature"),
          publicKey: cfg.shopeepayPublicKey,
        });
        if (!signatureValid) {
          return json({ responseCode: "4015600", responseMessage: "Unauthorized. Invalid signature" }, 401);
        }
        if (!sp.timestampFresh(timestamp)) {
          return json({ responseCode: "4015600", responseMessage: "Unauthorized. Stale timestamp" }, 401);
        }

        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return json({ responseCode: "4005601", responseMessage: "Invalid Field Format" }, 400);
        }
        const event = sp.parseNotification(payload);
        if (!event) {
          return json({ responseCode: "4005602", responseMessage: "Invalid Mandatory Field" }, 400);
        }

        const payloadHash = sp.sha256Hex(raw);
        const paymentNumber = sp.paymentNumberFromReference(event.partnerReferenceNo);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: payment } = paymentNumber
          ? await supabaseAdmin
              .from("payments")
              .select("id, payment_number, status, expected_amount, qr_reference")
              .eq("payment_number", paymentNumber)
              .maybeSingle()
          : { data: null };

        const details = {
          amount: event.amount,
          currency: event.currency,
          providerTransactionId: event.providerReference || null,
          paymentStatus: event.status,
          eventAt: timestamp,
          metadata: { partnerReferenceNo: event.partnerReferenceNo, source: "callback" },
        };
        const eventId = `${event.partnerReferenceNo}:notify:${event.providerReference || payloadHash.slice(0, 16)}`;

        if (!payment) {
          await sp.recordShopeepayEvent({
            eventId,
            paymentId: null,
            eventType: "payment.notify",
            signatureValid: true,
            payloadHash,
            status: "failed",
            error: "payment not found",
            details,
          });
          return json(ACK);
        }

        const recorded = await sp.recordShopeepayEvent({
          eventId,
          paymentId: payment.id,
          eventType: "payment.notify",
          signatureValid: true,
          payloadHash,
          status: "received",
          details,
        });
        if (recorded === "duplicate" || payment.status === "paid") return json(ACK);

        // Sumber kebenaran: query server-to-server, bukan isi callback.
        const outcome = await sp.verifyAndSettle(cfg, payment);
        const { error } = await supabaseAdmin
          .from("payment_events")
          .update({
            // pending = query belum mengonfirmasi; job rekonsiliasi akan mengulang.
            processing_status:
              outcome.status === "paid"
                ? "processed"
                : outcome.status === "failed"
                  ? "rejected"
                  : outcome.status === "pending"
                    ? "received"
                    : "failed",
            processed_at: new Date().toISOString(),
            error: outcome.status === "paid" ? null : (outcome.reason ?? outcome.status),
          })
          .eq("provider", "shopeepay")
          .eq("external_event_id", eventId.slice(0, 200));
        if (error) console.error("[shopeepay] update notify gagal:", error.message);

        return json(ACK);
      },
    },
  },
});
