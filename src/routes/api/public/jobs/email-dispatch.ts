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
 * Cron email transaksional.
 *
 * Dua tugas dalam satu pemanggilan:
 * 1. Kirim email untuk event yang belum pernah dikirim (jaring pengaman bila
 *    pemicu langsung terlewat, mis. server restart saat transaksi).
 * 2. Kirim ulang yang gagal, maksimal 3 percobaan.
 *
 * Aman dipanggil berkali-kali: idempotensi dijaga `email_dispatch_log`.
 */
export const Route = createFileRoute("/api/public/jobs/email-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorize(request)) return json({ error: "unauthorized" }, 401);

        const { dispatchEmails, retryFailedEmails } = await import("@/lib/email-dispatch.server");
        const sent = await dispatchEmails();
        const retried = await retryFailedEmails();

        return json({ ok: true, ...sent, retried: retried.retried });
      },
    },
  },
});
