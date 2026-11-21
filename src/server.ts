import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Security headers — diterapkan pada respons HTML (tidak menyentuh asset/API).
// CSP diset permisif-tapi-terarah karena halaman memakai inline script SSR
// (TanStack Start hydration) dan font dari Google Fonts.
// Host Supabase diambil dari environment agar pindah project tidak memblokir fetch.
const supabaseOrigin = (() => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  try {
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
})();
const supabaseConnectSources = supabaseOrigin
  ? `${supabaseOrigin} ${supabaseOrigin.replace(/^https:/, "wss:")}`
  : "";

// Preview Lovable memuat situs di iframe *.lovable.app; di produksi siapa pun bisa
// membuat situs *.lovable.app, jadi framing hanya diizinkan dari origin sendiri.
const isProduction = process.env.NODE_ENV === "production";
const frameAncestors = isProduction ? "'self'" : "'self' https://*.lovable.app";
const lovableConnectSource = isProduction ? "" : "https://*.lovable.app";

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${supabaseConnectSources} ${lovableConnectSource}`.replace(/\s+/g, " ").trim(),
  "frame-src 'self' https://*.sumopod.com https://*.pymnt.app https://checkout.pymnt.app",
  `frame-ancestors ${frameAncestors}`,
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

function applySecurityHeaders(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  const isHtml = contentType.includes("text/html");
  const headers = new Headers(response.headers);
  // Berlaku untuk semua respons (HTML, JSON server function, API, gambar).
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // HSTS diabaikan browser pada koneksi non-TLS, jadi aman dikirim juga di dev lokal.
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // Mencegah Cloudflare default-extension caching (Web Cache Deception pada rute
  // dinamis berakhiran .css/.js/.png) dan kebocoran cache lintas pengguna pada SSR,
  // server functions, webhook, serta API yang tidak menetapkan Cache-Control eksplisit.
  // Rute publik cacheable (catalog-image, service-media, og-image, sitemap.xml) sudah
  // menetapkan Cache-Control sendiri sehingga tetap dipertahankan.
  if (!headers.has("cache-control")) {
    headers.set("Cache-Control", isHtml ? "private, no-store" : "no-store");
  }
  if (isHtml) {
    headers.set("Content-Security-Policy", CSP);
    headers.set("X-Frame-Options", "SAMEORIGIN");
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(self), payment=(self), usb=(), interest-cohort=()",
    );
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return applySecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return applySecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
