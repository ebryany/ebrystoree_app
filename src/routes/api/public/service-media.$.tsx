import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxy media jasa: objek tetap privat di storage, hanya dilayani lewat rute ini
 * dengan validasi path yang ketat. Splat adalah path relatif di dalam bucket
 * service-media (tanpa prefiks bucket), sehingga URL tidak menggandakan nama bucket.
 */
export const Route = createFileRoute("/api/public/service-media/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = (params as Record<string, string>)._splat ?? "";
        const relative = decodeURIComponent(raw);

        if (
          !relative ||
          relative.includes("..") ||
          relative.startsWith("service-media/") ||
          !/^[A-Za-z0-9/_.-]+\.(jpg|jpeg|png|webp|avif|mp4|webm)$/i.test(relative)
        ) {
          return new Response("Not found", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage
          .from("service-media")
          .download(`service-media/${relative}`);
        if (error || !data) return new Response("Not found", { status: 404 });

        return new Response(await data.arrayBuffer(), {
          headers: {
            "Content-Type": data.type || "application/octet-stream",
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
