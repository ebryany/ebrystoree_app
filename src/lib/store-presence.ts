/** Jeda heartbeat dari browser pemilik toko. */
export const PRESENCE_HEARTBEAT_MS = 60_000;
/** Heartbeat terakhir lebih tua dari ini = offline, walau tab tidak sempat pamit. */
export const PRESENCE_ONLINE_WINDOW_MS = 3 * 60_000;
/** Tanpa klik/ketik/scroll selama ini, heartbeat berhenti (penjual dianggap tidak di depan layar). */
export const PRESENCE_IDLE_MS = 10 * 60_000;
/** Tab disembunyikan lebih lama dari ini = pamit offline. */
export const PRESENCE_HIDDEN_GRACE_MS = 2 * 60_000;

export type StorePresence = { online: boolean; lastSeenAt: string | null };

export const OFFLINE_UNKNOWN: StorePresence = { online: false, lastSeenAt: null };

type PresenceRow = {
  store_id: string;
  last_seen_at: string;
  online: boolean | null;
  stores?: { is_platform?: boolean } | null;
};

export function toPresence(
  row: { last_seen_at?: string | null; online?: boolean | null } | null | undefined,
  now = Date.now(),
): StorePresence {
  if (!row?.last_seen_at) return OFFLINE_UNKNOWN;
  const t = Date.parse(row.last_seen_at);
  if (!Number.isFinite(t)) return OFFLINE_UNKNOWN;
  return {
    online: row.online !== false && now - t < PRESENCE_ONLINE_WINDOW_MS,
    lastSeenAt: row.last_seen_at,
  };
}

/**
 * "Aktif 5 menit lalu" dsb. null bila belum pernah tercatat (tidak mengarang data).
 * Di bawah 1 menit ditulis "baru saja" agar tidak tampak seperti masih online.
 */
export function lastSeenLabel(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const min = Math.max(0, Math.floor((now - t) / 60_000));
  if (min < 1) return "Aktif baru saja";
  if (min < 60) return `Aktif ${min} menit lalu`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `Aktif ${hour} jam lalu`;
  const day = Math.floor(hour / 24);
  if (day === 1) return "Aktif kemarin";
  if (day < 7) return `Aktif ${day} hari lalu`;
  const week = Math.floor(day / 7);
  if (day < 30) return `Aktif ${week} minggu lalu`;
  const month = Math.floor(day / 30);
  if (month < 12) return `Aktif ${month} bulan lalu`;
  return "Aktif lebih dari setahun lalu";
}

export type PresenceMap = {
  get(storeId: string | null | undefined): StorePresence;
  /** Toko resmi; dipakai untuk produk platform tanpa store_id. */
  platform: StorePresence;
};

/** Status semua toko sekaligus (tabel kecil: satu baris per toko). */
export async function readPresenceMap(supabase: any): Promise<PresenceMap> {
  const map = new Map<string, StorePresence>();
  let platform = OFFLINE_UNKNOWN;
  try {
    const { data } = await supabase
      .from("store_presence")
      .select("store_id, last_seen_at, online, stores(is_platform)")
      .limit(2000);
    const now = Date.now();
    for (const row of (data ?? []) as PresenceRow[]) {
      const p = toPresence(row, now);
      map.set(row.store_id, p);
      if (row.stores?.is_platform) platform = p;
    }
  } catch {
    // Status online bersifat pelengkap; gagal baca = semua dianggap offline.
  }
  return {
    get: (id) => (id ? (map.get(id) ?? OFFLINE_UNKNOWN) : platform),
    platform,
  };
}

export async function readStorePresence(supabase: any, storeId: string): Promise<StorePresence> {
  try {
    const { data } = await supabase
      .from("store_presence")
      .select("last_seen_at, online")
      .eq("store_id", storeId)
      .maybeSingle();
    return toPresence(data);
  } catch {
    return OFFLINE_UNKNOWN;
  }
}
