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
  store: z.object({ name: z.string(), slug: z.string() }),
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
        "id, name, price, agreement, media, store:stores!inner(name, slug), category:categories!inner(name, slug)",
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
    const { data, error, count } = await query;
    if (error) throw error;
    const items: PublicMarketplaceService[] = (data ?? []).map((row) =>
      publicServiceSchema.parse(row),
    );
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
        "id, name, price, agreement, media, store:stores!inner(name, slug), category:categories!inner(name, slug)",
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
