import type { StorePresence } from "./store-presence";

export type StoreCardSeller = {
  id: string;
  name: string;
  slug: string;
  is_platform: boolean;
  logo_url: string | null;
  created_at: string;
  presence: StorePresence | null;
};

export type StoreCardStats = {
  products: number;
  services: number;
  sold: number;
  rating: number | null;
  reviews: number;
};

const STORE_COLUMNS = "id, name, slug, is_platform, logo_url, created_at";

/**
 * Data kartu "Dijual oleh": toko + statistik nyata. Tanpa storeId berarti
 * milik platform, jadi dipakai toko resmi. Kegagalan statistik hanya
 * mengosongkan angka, tidak menggagalkan halaman.
 */
export async function loadStoreCard(
  supabase: any,
  storeId: string | null,
): Promise<{ seller: StoreCardSeller | null; sellerStats: StoreCardStats | null }> {
  const base = supabase.from("stores").select(STORE_COLUMNS);
  const { data: s } = storeId
    ? await base.eq("id", storeId).maybeSingle()
    : await base.eq("is_platform", true).eq("status", "active").limit(1).maybeSingle();
  if (!s) return { seller: null, sellerStats: null };
  const store = s as Omit<StoreCardSeller, "presence">;

  const ownerFilter = store.is_platform
    ? `store_id.is.null,store_id.eq.${store.id}`
    : `store_id.eq.${store.id}`;
  const { readStorePresence } = await import("./store-presence");
  const [{ data: storeProducts }, servicesRes, presence] = await Promise.all([
    supabase
      .from("digital_products")
      .select("id, sold_count")
      .or(ownerFilter)
      .eq("status", "published")
      .is("deleted_at", null)
      .limit(1000),
    store.is_platform
      ? supabase
          .from("services")
          .select("id", { count: "exact", head: true })
          .eq("status", "published")
          .is("deleted_at", null)
      : supabase
          .from("marketplace_services")
          .select("id", { count: "exact", head: true })
          .eq("store_id", store.id)
          .eq("status", "published"),
    readStorePresence(supabase, store.id),
  ]);
  const ids = ((storeProducts ?? []) as { id: string }[]).map((r) => r.id);
  let rating: number | null = null;
  let reviews = 0;
  if (ids.length) {
    const { data: rv } = await supabase
      .from("product_reviews")
      .select("rating")
      .eq("is_visible", true)
      .eq("is_verified", true)
      .in("product_id", ids)
      .limit(3000);
    reviews = rv?.length ?? 0;
    if (reviews)
      rating = (rv as { rating: number }[]).reduce((n, r) => n + Number(r.rating), 0) / reviews;
  }

  return {
    seller: { ...store, presence },
    sellerStats: {
      products: ids.length,
      services: servicesRes?.count ?? 0,
      sold: ((storeProducts ?? []) as { sold_count: number | null }[]).reduce(
        (n, r) => n + Number(r.sold_count ?? 0),
        0,
      ),
      rating,
      reviews,
    },
  };
}
