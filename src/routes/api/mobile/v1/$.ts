import { createFileRoute } from "@tanstack/react-router";

async function dispatch(request: Request) {
  const { handleMobileV1Request } = await import("@/lib/mobile-api.server");
  return handleMobileV1Request(request);
}

export const Route = createFileRoute("/api/mobile/v1/$")({
  server: {
    handlers: {
      GET: ({ request }) => dispatch(request),
      POST: ({ request }) => dispatch(request),
      PATCH: ({ request }) => dispatch(request),
      DELETE: ({ request }) => dispatch(request),
    },
  },
});
