import { clearServerCache } from "./server-cache.server";
import {
  FIELD_BY_KEY,
  PUBLIC_DEFAULTS,
  PUBLIC_KEYS,
  defaultsFor,
  ALL_FIELDS,
} from "./website-settings";

type Row = { key: string; value: unknown; updated_at: string };

function coerce(rows: Row[], base: Record<string, unknown>) {
  const out: Record<string, any> = { ...base };
  for (const row of rows) {
    if (!FIELD_BY_KEY.has(row.key)) continue;
    out[row.key] = row.value;
  }
  return out as Record<string, any>;
}

// Cache singkat di memori proses + singleflight coalescing: setiap halaman SSR
// membaca pengaturan publik, jadi saat TTL habis ratusan request serentak cukup
// memicu satu query ke database (mencegah cache stampede).
const PUBLIC_TTL_MS = 30_000;
let publicCache: { at: number; value: Awaited<ReturnType<typeof fetchPublicSettings>> } | null =
  null;
let publicInflight: Promise<Awaited<ReturnType<typeof fetchPublicSettings>>> | null = null;

/** Dipanggil setelah admin menyimpan pengaturan agar perubahan langsung tampil. */
export function clearPublicSettingsCache() {
  publicCache = null;
  publicInflight = null;
  clearServerCache("tx-settings");
}

/** Nilai publik (anon) — dipakai SSR header/footer/metadata/maintenance. */
export async function readPublicSettings() {
  if (publicCache && Date.now() - publicCache.at < PUBLIC_TTL_MS) return publicCache.value;
  if (publicInflight) return publicInflight;
  publicInflight = fetchPublicSettings()
    .then((value) => {
      // Hasil fallback (gagal baca DB) tidak di-cache supaya segera pulih.
      if (value.updatedAt !== null) publicCache = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      publicInflight = null;
    });
  return publicInflight;
}

async function fetchPublicSettings() {
  const { createPublicClient } = await import("./supabase-public.server");
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("system_settings")
      .select("key, value, updated_at")
      .eq("is_public", true);
    if (error) throw error;
    const rows = ((data ?? []) as Row[]).filter((r) => PUBLIC_KEYS.includes(r.key));
    return { values: coerce(rows, PUBLIC_DEFAULTS), updatedAt: latest(rows) };
  } catch (e) {
    console.error("[settings] gagal membaca pengaturan publik:", (e as Error).message);
    return { values: { ...PUBLIC_DEFAULTS }, updatedAt: null as string | null };
  }
}

/** Pembacaan satu flag di sisi server untuk penegakan feature flag. */
export async function isFeatureEnabled(key: string) {
  const { values } = await readPublicSettings();
  const field = FIELD_BY_KEY.get(key);
  const value = values[key];
  return value === undefined ? Boolean(field?.default) : Boolean(value);
}

/** Baca satu nilai pengaturan (publik lewat cache, internal lewat database) dengan fallback default registry. */
export async function readServerSetting(key: string): Promise<unknown> {
  const field = FIELD_BY_KEY.get(key);
  if (field?.isPublic) {
    const { values } = await readPublicSettings();
    return values[key] !== undefined ? values[key] : field.default;
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    return data?.value !== undefined ? data.value : field?.default;
  } catch {
    return field?.default;
  }
}

export async function readNumberSetting(key: string): Promise<number> {
  const raw = await readServerSetting(key);
  const num = Number(raw);
  const fallback = Number(FIELD_BY_KEY.get(key)?.default ?? 0);
  return Number.isFinite(num) ? num : fallback;
}

export async function readStringSetting(key: string): Promise<string> {
  const raw = await readServerSetting(key);
  if (typeof raw === "string") return raw.trim();
  const fallback = FIELD_BY_KEY.get(key)?.default;
  return typeof fallback === "string" ? fallback.trim() : "";
}

export async function readAllSettings(supabase: { from: (t: "system_settings") => any }) {
  const { data, error } = await supabase.from("system_settings").select("key, value, updated_at");
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  return {
    values: coerce(rows, defaultsFor(ALL_FIELDS.map((f) => f.key))),
    storedKeys: rows.map((r) => r.key),
    updatedAt: latest(rows),
  };
}

function latest(rows: Row[]) {
  return rows.reduce<string | null>(
    (acc, r) => (!acc || r.updated_at > acc ? r.updated_at : acc),
    null,
  );
}
