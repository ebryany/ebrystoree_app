import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  marketplaceServiceAgreementSchema,
  marketplaceServiceMediaListSchema,
  type PublicMarketplaceService,
} from "./marketplace-service";

const publicServiceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(3).max(160),
  price: z.coerce.number().int().min(1).max(1_000_000_000),
  agreement: marketplaceServiceAgreementSchema,
  media: marketplaceServiceMediaListSchema.default([]),
  store: z.object({
    name: z.string(),
    slug: z.string(),
    id: z.string().uuid().optional(),
    logo_url: z.string().nullable().optional(),
  }),
  category: z.object({ name: z.string(), slug: z.string() }),
});

export async function readPublicMarketplaceServices(
  filters: { q?: string; category?: string; page?: number; pageSize?: number } = {},
  client: SupabaseClient = supabaseAdmin as unknown as SupabaseClient,
) {
  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? 12;
  try {
    // Anon has no table access; eligibility and projection must stay in this server-only query.
    let query = client
      .from("marketplace_services")
      .select(
        "id, name, price, agreement, media, store:stores!inner(id, name, slug, logo_url), category:categories!inner(name, slug)",
        { count: "exact" },
      )
      .eq("status", "approved")
      .eq("store.status", "active")
      .eq("category.kind", "service")
      .eq("category.is_active", true)
      .is("category.deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id")
      .range(page * pageSize, (page + 1) * pageSize - 1);
    const term = filters.q?.replace(/[\\%_]/g, " ").trim();
    if (term) query = query.ilike("name", `%${term}%`);
    if (filters.category) query = query.eq("category.slug", filters.category);
    const { readPresenceMap } = await import("./store-presence");
    const [{ data, error, count }, presence] = await Promise.all([query, readPresenceMap(client)]);
    if (error) throw error;
    const items: PublicMarketplaceService[] = (data ?? []).map((row) => {
      const item = publicServiceSchema.parse(row);
      return { ...item, store: { ...item.store, presence: presence.get(item.store.id) } };
    });
    const total = count ?? items.length;
    return {
      items,
      total,
      page,
      nextPage: (page + 1) * pageSize < total ? page + 1 : null,
      error: null,
    };
  } catch (error) {
    console.error(
      "[catalog] jasa seller gagal:",
      error instanceof Error ? error.message : "Query failed",
    );
    return {
      items: [] as PublicMarketplaceService[],
      total: 0,
      page,
      nextPage: null,
      error: "Katalog jasa seller sedang tidak dapat dimuat.",
    };
  }
}

/**
 * Satu jasa publik untuk halaman preview (/jasa/$id) plus jasa lain dari toko
 * yang sama. Syarat kelayakan sama dengan katalog; selain itu = tidak ditemukan.
 */
export async function readPublicMarketplaceService(
  id: string,
  client: SupabaseClient = supabaseAdmin as unknown as SupabaseClient,
) {
  try {
    const { data, error } = await client
      .from("marketplace_services")
      .select(
        "id, name, price, agreement, media, store:stores!inner(id, name, slug, logo_url, created_at), category:categories!inner(name, slug)",
      )
      .eq("id", id)
      .eq("status", "approved")
      .eq("store.status", "active")
      .eq("category.kind", "service")
      .eq("category.is_active", true)
      .is("category.deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { service: null, related: [], stats: null, error: null };

    const row = data as { store: { created_at?: string } };
    // Skema membuang key yang tidak dikenal (store.created_at), jadi dibaca terpisah dari `row`.
    const service = publicServiceSchema.parse(data);
    const { readStorePresence } = await import("./store-presence");
    const storeId = service.store.id;
    // Jumlah pesanan yang hasilnya sudah diterima pembeli; gagal = null (angka disembunyikan).
    const countAccepted = async (column: "service_id" | "store_id", value: string) => {
      const { count, error: countError } = await client
        .from("marketplace_service_orders")
        .select("order_id", { count: "exact", head: true })
        .eq(column, value)
        .eq("work_state", "accepted");
      return countError ? null : (count ?? 0);
    };
    const [presence, others, serviceDone, storeDone] = await Promise.all([
      storeId ? readStorePresence(client, storeId) : null,
      storeId
        ? readPublicStoreServices(storeId, client)
        : Promise.resolve({ items: [] as PublicMarketplaceService[], error: null }),
      countAccepted("service_id", service.id),
      storeId ? countAccepted("store_id", storeId) : null,
    ]);
    return {
      stats: {
        serviceCompleted: serviceDone,
        storeCompleted: storeDone,
        storeServices: others.error ? null : others.items.length,
      },
      service: {
        ...service,
        store: {
          ...service.store,
          presence: presence ?? undefined,
          created_at: row.store.created_at ?? null,
        },
      },
      related: others.items
        .filter((s) => s.id !== service.id)
        .slice(0, 6)
        .map((s) => ({ ...s, store: { ...s.store, presence: presence ?? undefined } })),
      error: null,
    };
  } catch (error) {
    console.error(
      "[catalog] detail jasa gagal:",
      error instanceof Error ? error.message : "Query failed",
    );
    return { service: null, related: [], stats: null, error: "Jasa tidak dapat dimuat." };
  }
}

/**
 * Jasa approved milik satu toko untuk storefront publik. Proyeksi dan syarat
 * kelayakan sama dengan katalog: listing approved, toko aktif, kategori jasa
 * aktif. Anon tidak pernah menyentuh tabel langsung; query ini server-only.
 */
export async function readPublicStoreServices(
  storeId: string,
  client: SupabaseClient = supabaseAdmin as unknown as SupabaseClient,
) {
  try {
    const { data, error } = await client
      .from("marketplace_services")
      .select(
        "id, name, price, agreement, media, store:stores!inner(id, name, slug, logo_url), category:categories!inner(name, slug)",
      )
      .eq("store_id", storeId)
      .eq("status", "approved")
      .eq("store.status", "active")
      .eq("category.kind", "service")
      .eq("category.is_active", true)
      .is("category.deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id");
    if (error) throw error;
    const items: PublicMarketplaceService[] = (data ?? []).map((row) =>
      publicServiceSchema.parse(row),
    );
    return { items, error: null };
  } catch (error) {
    console.error(
      "[store] jasa toko gagal:",
      error instanceof Error ? error.message : "Query failed",
    );
    return { items: [] as PublicMarketplaceService[], error: "Jasa toko tidak dapat dimuat." };
  }
}
