import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export const Route = createFileRoute("/api/public/integrations/jiofarm/demand")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authorizeIngest, adminClient } = await import("@/lib/stock-codes.server");
        if (!authorizeIngest(request)) return json({ error: "unauthorized" }, 401);

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
