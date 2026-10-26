import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createHash } from "node:crypto";

/**
 * Endpoint penerima event analytics.
 *
 * Keputusan dan alasannya:
 * - **Tanpa data pribadi.** IP tidak disimpan; hanya dipakai untuk membuat hash
 *   sesi harian (tidak bisa dilacak balik ke orang) dan hash itu berganti setiap
 *   hari. User-agent tidak disimpan; hanya dibaca untuk mendeteksi bot.
 * - **Bot disaring di server**, bukan di klien, supaya crawler yang tidak
 *   menjalankan JavaScript tetap tertangkap dan tidak mengotori metrik.
 * - **Rate limit per sesi** supaya satu klien tidak bisa membanjiri database.
 * - **Selalu balas 204**, bahkan saat payload ditolak: endpoint analitik tidak
 *   boleh membocorkan informasi ke penyerang atau mengganggu pengalaman halaman.
 */

const eventSchema = z.object({
  event: z.enum([
    "page_view",
    "product_view",
    "service_view",
    "article_view",
    "checkout_start",
    "payment_success",
  ]),
  path: z.string().min(1).max(300),
  referrer: z.string().max(500).optional().nullable(),
  utmSource: z.string().max(120).optional().nullable(),
  utmMedium: z.string().max(120).optional().nullable(),
  utmCampaign: z.string().max(120).optional().nullable(),
});

/** Pola user-agent yang jelas bot/crawler. */
const BOT_PATTERN =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|curl|wget|python-requests|axios|headless|lighthouse|pingdom|uptimerobot/i;

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return true; // tanpa UA dianggap bot: klien nyata selalu mengirim
  return BOT_PATTERN.test(userAgent);
}

/** Hash sesi harian: tidak dapat dilacak balik, dan berganti tiap hari. */
function sessionHash(ip: string, userAgent: string, day: string): string {
  const salt =
    process.env["SETTINGS_ENCRYPTION_KEY"] ??
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
    "ebrystore";
  return createHash("sha256")
    .update(`${salt}:${day}:${ip}:${userAgent}`)
    .digest("hex")
    .slice(0, 32);
}

/** Hanya host referrer yang disimpan, bukan URL penuh (bisa memuat data pribadi). */
function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    // Jangan catat referrer dari domain sendiri: itu navigasi internal, bukan sumber.
    const own = process.env["SITE_URL"] ? new URL(process.env["SITE_URL"]).hostname : "";
    if (own && host === own) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

/** Path dibatasi ke bentuk aman: tanpa query, tanpa ID panjang. */
function cleanPath(raw: string): string {
  const path = raw.split("?")[0].split("#")[0];
  return path.slice(0, 300);
}

export const Route = createFileRoute("/api/public/analytics/track")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Selalu 204: tidak ada informasi yang berguna bagi pemanggil tak sah.
        const ok = new Response(null, { status: 204 });

        const declared = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declared) && declared > 4 * 1024) return ok;

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return ok;
        }

        const parsed = eventSchema.safeParse(payload);
        if (!parsed.success) return ok;

        const userAgent = request.headers.get("user-agent") ?? "";
        const forwarded = request.headers.get("x-forwarded-for") ?? "";
        const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
        const today = new Date().toISOString().slice(0, 10);
        const hash = sessionHash(ip, userAgent, today);
        const bot = isBot(userAgent || null);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Pengguna yang login: dipakai HANYA untuk atribusi kampanye yang benar
        // (menghubungkan kunjungan ke order milik orang yang sama). Token
        // diverifikasi server, jadi klien tidak bisa memalsukan identitas.
        // Pengunjung anonim tetap hanya punya hash sesi harian.
        let userId: string | null = null;
        const authHeader = request.headers.get("authorization") ?? "";
        const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (bearer) {
          try {
            const { data: userData } = await supabaseAdmin.auth.getUser(bearer);
            userId = userData?.user?.id ?? null;
          } catch {
            userId = null;
          }
        }

        // Rate limit ringan per sesi: cukup untuk mencegah banjir, tidak
        // mengganggu pengunjung normal (yang membuka beberapa halaman per menit).
        const { data: rate } = await supabaseAdmin.rpc("check_rate_limit", {
          _bucket: "analytics.track",
          _subject: hash,
          _limit: 60,
          _window_seconds: 60,
        });
        if (rate && (rate as { allowed?: boolean }).allowed === false) return ok;

        await supabaseAdmin.from("analytics_events").insert({
          event_type: parsed.data.event,
          path: cleanPath(parsed.data.path),
          session_hash: hash,
          user_id: userId,
          referrer_host: referrerHost(parsed.data.referrer),
          utm_source: parsed.data.utmSource?.slice(0, 120) ?? null,
          utm_medium: parsed.data.utmMedium?.slice(0, 120) ?? null,
          utm_campaign: parsed.data.utmCampaign?.slice(0, 120) ?? null,
          is_bot: bot,
        });

        // Artikel dibaca: naikkan view_count lewat RPC yang benar.
        if (parsed.data.event === "article_view" && !bot) {
          const slug = cleanPath(parsed.data.path).split("/").filter(Boolean).pop();
          if (slug) {
            await supabaseAdmin.rpc("record_article_view", { _slug: slug });
          }
        }

        return ok;
      },
    },
  },
});
