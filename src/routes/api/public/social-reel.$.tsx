import { createFileRoute } from "@tanstack/react-router";

const VIDEO_MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
};

/**
 * Byte-range streaming proxy for Ebrystore Reels (`social-reels` private bucket).
 * Forwards HTTP `Range` headers so iOS Safari, Android, and desktop browsers
 * start playback instantaneously and support scrubbing (`206 Partial Content`).
 */
export const Route = createFileRoute("/api/public/social-reel/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const raw = (params as Record<string, string>)._splat ?? "";
        let path: string;
        try {
          path = decodeURIComponent(raw);
        } catch {
          return new Response("Not found", { status: 404 });
        }

        // Strict UUID-scoped path: <author_uuid>/<file_uuid>.(mp4|webm)
        if (
          !path ||
          path.includes("..") ||
          !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp4|webm)$/i.test(path)
        ) {
          return new Response("Not found", { status: 404 });
        }

        const ext = path.split(".").pop()!.toLowerCase();
        const fallbackMime = VIDEO_MIME[ext];
        if (!fallbackMime) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: signed, error } = await (supabaseAdmin as any).storage
          .from("social-reels")
          .createSignedUrl(path, 120);
        if (error || !signed?.signedUrl) {
          return new Response("Not found", { status: 404 });
        }

        const rangeHeader = request?.headers?.get("range");
        const upstream = await fetch(signed.signedUrl, {
          headers: rangeHeader ? { Range: rangeHeader } : undefined,
        });
        if (!upstream.ok && upstream.status !== 206) {
          return new Response("Not found", { status: 404 });
        }

        const headers = new Headers();
        headers.set("Content-Type", upstream.headers.get("content-type") || fallbackMime);
        headers.set("Accept-Ranges", "bytes");
        headers.set("Cache-Control", "public, max-age=3600");
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("Content-Security-Policy", "default-src 'none'; sandbox");

        const contentLength = upstream.headers.get("content-length");
        if (contentLength) headers.set("Content-Length", contentLength);
        const contentRange = upstream.headers.get("content-range");
        if (contentRange) headers.set("Content-Range", contentRange);

        return new Response(upstream.body, {
          status: upstream.status,
          headers,
        });
      },
    },
  },
});
