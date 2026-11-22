import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export const Route = createFileRoute("/api/public/integrations/jiofarm/demand")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authorizeIngest, adminClient } = await import("@/lib/stock-codes.server");
        if (!authorizeIngest(request)) {
          const { recordSecurityEvent } = await import("@/lib/security-event.server");
          await recordSecurityEvent({
            eventType: "invalid_internal_job_token",
            severity: "HIGH",
            category: "security_violation",
            endpoint: "/api/public/integrations/jiofarm/demand",
            httpMethod: "GET",
            statusCode: 401,
            reasonCode: "INVALID_INGEST_TOKEN",
            sourceSystem: "internal_job",
            ipAddress: request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip"),
            userAgent: request.headers.get("user-agent"),
          });
          return json({ error: "unauthorized" }, 401);
        }

        const sb = await adminClient();
        const { data, error } = await sb.rpc("stock_code_demand");
        if (error) {
          console.error("[jiofarm] demand gagal:", error.message);
          return json({ error: "demand failed" }, 500);
        }
        return json({ ok: true, products: data ?? [] });
      },
    },
  },
});
