import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
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
  for (let i = 0; i < provided.length; i += 1) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/jobs/telegram-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorize(request)) return json({ error: "unauthorized" }, 401);
        const { dispatchServiceOrderAlerts } = await import("@/lib/telegram.server");
        const result = await dispatchServiceOrderAlerts();
        return json({ ok: true, ...result });
      },
    },
  },
});
