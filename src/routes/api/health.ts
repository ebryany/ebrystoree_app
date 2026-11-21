import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const { checkAppHealth } = await import("@/lib/health.server");
        const { status, body } = await checkAppHealth();
        return new Response(JSON.stringify(body), {
          status,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
