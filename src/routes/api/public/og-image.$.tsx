import { createFileRoute } from "@tanstack/react-router";

/** Versi ringan gambar katalog untuk pratinjau link (WhatsApp, Telegram, Facebook). */
export const Route = createFileRoute("/api/public/og-image/$")({
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

        if (
          !path ||
          path.includes("..") ||
          !/^[A-Za-z0-9/_-]+\.(jpg|jpeg|png|webp|avif)$/i.test(path)
        ) {
          return new Response("Not found", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("catalog-images").download(path);
        if (error || !data) return new Response("Not found", { status: 404 });

        const sharpModule = await import("sharp");
        const sharp = sharpModule.default ?? sharpModule;
        let output: Buffer;
        try {
          output = await sharp(Buffer.from(await data.arrayBuffer()), { limitInputPixels: 40_000_000 })
            .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: 80, mozjpeg: true })
            .toBuffer();
        } catch {
          return new Response("Not found", { status: 404 });
        }

        return new Response(new Uint8Array(output), {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=604800",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
