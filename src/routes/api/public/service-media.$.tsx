import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxy media jasa: objek tetap privat di storage, hanya dilayani lewat rute ini
 * dengan validasi path yang ketat. Splat adalah path relatif di dalam bucket
 * service-media (tanpa prefiks bucket), sehingga URL tidak menggandakan nama bucket.
 */
const MEDIA_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  mp4: "video/mp4",
  webm: "video/webm",
};

export const Route = createFileRoute("/api/public/service-media/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = (params as Record<string, string>)._splat ?? "";
        let relative: string;
        try {
          relative = decodeURIComponent(raw);
        } catch {
          return new Response("Not found", { status: 404 });
        }

        if (
          !relative ||
          relative.includes("..") ||
          relative.startsWith("service-media/") ||
          !/^[A-Za-z0-9/_.-]+\.(jpg|jpeg|png|webp|avif|mp4|webm)$/i.test(relative)
        ) {
          return new Response("Not found", { status: 404 });
        }

        const ext = relative.split(".").pop()!.toLowerCase();
        const contentType = MEDIA_MIME[ext];
        if (!contentType) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage
          .from("service-media")
          .download(`service-media/${relative}`);
        if (error || !data) return new Response("Not found", { status: 404 });

        return new Response(await data.arrayBuffer(), {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
          },
        });
      },
    },
  },
});
