import { createFileRoute } from "@tanstack/react-router";

const RASTER_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

export const Route = createFileRoute("/api/public/catalog-image/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = (params as Record<string, string>)._splat ?? "";
        let path: string;
        try {
          path = decodeURIComponent(raw);
        } catch {
          return new Response("Not found", { status: 404 });
        }

        // Hanya izinkan ekstensi gambar raster aman di bucket catalog-images.
        if (
          !path ||
          path.includes("..") ||
          !/^[A-Za-z0-9/_-]+\.(jpg|jpeg|png|webp|avif)$/i.test(path)
        ) {
          return new Response("Not found", { status: 404 });
        }

        const ext = path.split(".").pop()!.toLowerCase();
        const contentType = RASTER_MIME[ext];
        if (!contentType) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("catalog-images").download(path);
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
