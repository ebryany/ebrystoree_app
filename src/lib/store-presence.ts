/** Jeda heartbeat dari browser pemilik toko. */
export const PRESENCE_HEARTBEAT_MS = 60_000;
/** Toko dianggap online bila heartbeat terakhir masih dalam jendela ini. */
export const PRESENCE_ONLINE_WINDOW_MS = 3 * 60_000;

export function isPresenceOnline(lastSeenAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const t = Date.parse(lastSeenAt);
  return Number.isFinite(t) && now - t < PRESENCE_ONLINE_WINDOW_MS;
}

/** Status online toko untuk halaman publik (dibaca server, bukan klien). */
export async function readStoreOnline(supabase: any, storeId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("store_presence")
      .select("last_seen_at")
      .eq("store_id", storeId)
      .maybeSingle();
    return isPresenceOnline(data?.last_seen_at);
  } catch {
    return false;
  }
}
