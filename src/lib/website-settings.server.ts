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

/** Nilai publik (anon) — dipakai SSR header/footer/metadata/maintenance. */
export async function readPublicSettings() {
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

export async function readAllSettings(supabase: {
  from: (t: "system_settings") => any;
}) {
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
  return rows.reduce<string | null>((acc, r) => (!acc || r.updated_at > acc ? r.updated_at : acc), null);
}