import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function authorize(request: Request): boolean {
  const expected = process.env["JOBS_CRON_TOKEN"];
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const alt = request.headers.get("x-jobs-token")?.trim() ?? "";
  const provided = bearer || alt;
  if (!provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1)
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * Rekonsiliasi ShopeePay. Callback ShopeePay hanya dikirim sekali tanpa retry,
 * jadi job ini memeriksa ulang pembayaran ShopeePay yang belum lunas lewat
 * qr-mpm-query dan melunasi yang terkonfirmasi. Aman dijalankan berulang:
 * pelunasan idempoten di settle_gateway_payment.
 */
export const Route = createFileRoute("/api/public/jobs/shopeepay-reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorize(request)) return json({ ok: false, error: "unauthorized" }, 401);
        const sp = await import("@/lib/shopeepay.server");
        const cfg = sp.shopeepayConfig();
        if (!cfg) return json({ ok: true, skipped: "shopeepay disabled" });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // QR yang kedaluwarsa masih diperiksa 2 hari: pembayaran bisa tercatat terlambat.
        const since = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
        // Kandidat dari referensi yang pernah diterbitkan (payment_events), bukan
        // hanya payments.provider: pembeli bisa berpindah metode setelah QR terbit.
        const { data: issued, error: issuedError } = await supabaseAdmin
          .from("payment_events")
          .select("payment_id")
          .eq("provider", "shopeepay")
          .eq("event_type", "qr.issued")
          .gte("created_at", since)
          .not("payment_id", "is", null)
          .limit(500);
        if (issuedError) return json({ ok: false, error: "query failed" }, 500);
        const ids = [...new Set((issued ?? []).map((r: any) => String(r.payment_id)))];
        if (!ids.length) return json({ ok: true, checked: 0 });

        const { data, error } = await supabaseAdmin
          .from("payments")
          .select("id, payment_number, status, expected_amount, qr_reference")
          .in("id", ids.slice(0, 200))
          .in("status", ["waiting_payment", "pending", "processing", "waiting_verification"])
          .order("updated_at", { ascending: true })
          .limit(25);
        if (error) return json({ ok: false, error: "query failed" }, 500);

        const summary = { checked: 0, paid: 0, pending: 0, rejected: 0, errors: 0 };
        for (const payment of data ?? []) {
          summary.checked += 1;
          const outcome = await sp.verifyAndSettle(cfg, payment as any);
          if (outcome.status === "paid") summary.paid += 1;
          else if (outcome.status === "failed") summary.rejected += 1;
          else if (outcome.status === "error") summary.errors += 1;
          else summary.pending += 1;
        }
        return json({ ok: true, ...summary });
      },
    },
  },
});
