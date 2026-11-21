import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/catalog/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleCatalogRequest } = await import("@/lib/catalog-api.server");
        return handleCatalogRequest(request);
      },
    },
  },
});
