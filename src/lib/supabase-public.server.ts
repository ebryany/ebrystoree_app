import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

let cachedClient: { cacheKey: string; client: SupabaseClient<Database> } | null = null;

/**
 * Klien publishable singleton untuk pembacaan data publik dari sisi server (SSR).
 * RLS tetap berlaku sebagai `anon` — hanya data berstatus published yang terbaca.
 * Singleton mencegah alokasi ribuan objek GoTrue/Realtime/PostgREST di bawah beban tinggi.
 */
export function createPublicClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Konfigurasi backend belum lengkap.");

  const cacheKey = `${url}::${key}`;
  if (cachedClient && cachedClient.cacheKey === cacheKey) {
    return cachedClient.client;
  }

  const client = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });

  cachedClient = { cacheKey, client };
  return client;
}
