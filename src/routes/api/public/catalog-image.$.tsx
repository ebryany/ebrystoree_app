import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/catalog-image/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = (params as Record<string, string>)._splat ?? "";
        const path = decodeURIComponent(raw);

        // Only allow simple, safe object keys inside the catalog bucket.
        if (!path || path.includes("..") || !/^[A-Za-z0-9/_-]+\.[A-Za-z0-9]{2,5}$/.test(path)) {
          return new Response("Not found", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("catalog-images").download(path);
        if (error || !data) return new Response("Not found", { status: 404 });

        return new Response(await data.arrayBuffer(), {
          headers: {
            "Content-Type": data.type || "image/jpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
