/**
 * Health check non-sensitif untuk monitoring uptime & kesiapan database.
 * Tidak pernah mengembalikan pesan error internal, URL Supabase, atau kredensial.
 */
export async function checkAppHealth(): Promise<{
  status: number;
  body: { ok: boolean; status: "healthy" | "degraded"; timestamp: string };
}> {
  const timestamp = new Date().toISOString();
  try {
    const { createPublicClient } = await import("./supabase-public.server");
    const supabase = createPublicClient();
    const { error } = await supabase.from("system_settings").select("key").limit(1);
    if (error) {
      return { status: 503, body: { ok: false, status: "degraded", timestamp } };
    }
    return { status: 200, body: { ok: true, status: "healthy", timestamp } };
  } catch {
    return { status: 503, body: { ok: false, status: "degraded", timestamp } };
  }
}
