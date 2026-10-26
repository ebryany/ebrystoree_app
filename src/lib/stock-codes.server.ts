/**
 * Helper server-only untuk stok kode/link redeem (mis. Google AI Pro dari JioFarm).
 * Dipakai oleh endpoint publik /api/public/integrations/jiofarm/*.
 */

/** Perbandingan string tahan timing attack. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Ambil token dari header Authorization/X-Jiofarm-Token lalu bandingkan dengan secret. */
export function authorizeIngest(request: Request): boolean {
  const expected = process.env["JIOFARM_INGEST_TOKEN"];
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const alt = request.headers.get("x-jiofarm-token")?.trim() ?? "";
  const provided = bearer || alt;
  if (!provided) return false;
  return safeEqual(provided, expected);
}

export async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Cari produk mode `code` berdasarkan id atau slug. */
export async function resolveCodeProduct(idOrSlug: string): Promise<{ id: string; name: string } | null> {
  const sb = await adminClient();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
  const { data } = await sb
    .from("digital_products")
    .select("id, name, delivery_mode")
    .eq(uuid ? "id" : "slug", idOrSlug)
    .maybeSingle();
  if (!data || data.delivery_mode !== "code") return null;
  return { id: data.id, name: data.name };
}
