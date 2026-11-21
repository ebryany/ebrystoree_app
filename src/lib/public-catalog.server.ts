import type { ProductVariant } from "./orders.functions";

function pageRange(data: { page?: number; pageSize?: number } | undefined) {
  const pageSize = data?.pageSize ?? 48;
  const page = data?.page ?? 0;
  return { page, pageSize };
}

export async function readCatalogCategories(data: { kind: string }) {
  const { createPublicClient } = await import("./supabase-public.server");
  const supabase = createPublicClient();
  const query = (columns: string) =>
    supabase
      .from("categories")
      .select(columns)
      .eq("kind", data.kind)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
  let { data: rows, error } = await query("id, name, slug, icon, tone, image_url");
  // Kolom image_url belum ada (migrasi belum diterapkan): tetap tampil dengan ikon bawaan.
  if (error && /image_url/.test(error.message)) {
    ({ data: rows, error } = await query("id, name, slug, icon, tone"));
  }

  if (error) {
    console.error("[catalog] listCatalogCategories gagal:", error.message);
    return {
      items: [] as {
        id: string;
        name: string;
        slug: string;
        icon: string | null;
        tone: string | null;
        image_url: string | null;
      }[],
      error: "Kategori sedang tidak dapat dimuat.",
    };
  }
  return {
    items: ((rows ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      slug: r.slug as string,
      icon: (r.icon as string | null) ?? null,
      tone: (r.tone as string | null) ?? null,
      image_url: (r.image_url as string | null | undefined) ?? null,
    })),
    error: null,
  };
}

export async function readCatalogProducts(
  data:
    { q?: string; category?: string; store?: string; page?: number; pageSize?: number } | undefined,
) {
  const { createPublicClient } = await import("./supabase-public.server");
  const supabase = createPublicClient();
  const { page, pageSize } = pageRange(data);

  const { data: rows, error } = await supabase.rpc("search_products_fts", {
    _query: data?.q ?? "",
    _category_slug: data?.category ?? "",
    _store_slug: data?.store ?? "",
    _limit: pageSize,
    _offset: page * pageSize,
  });

  if (error) {
    console.error("[catalog] listProducts FTS gagal:", error.message);
    return {
      items: [],
      error: "Katalog produk sedang tidak dapat dimuat." as const,
      total: 0,
      page,
      nextPage: null,
    };
  }
  const items = (rows ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    short_description: string | null;
    thumbnail_url: string | null;
    price: number;
    discount_price: number | null;
    category_id: string | null;
    store_name: string | null;
    store_slug: string | null;
    is_official: boolean;
    rank: number;
  }>;
  // FTS tidak membawa jumlah terjual dan logo toko; ambil untuk id halaman ini saja.
  const extra = new Map<
    string,
    { sold_count: number; store_logo_url: string | null; store_id: string | null }
  >();
  const { readPresenceMap } = await import("./store-presence");
  const [, presence] = await Promise.all([
    items.length > 0
      ? supabase
          .from("digital_products")
          .select("id, sold_count, store_id, stores(logo_url)")
          .in(
            "id",
            items.map((i) => i.id),
          )
          .then(({ data: meta }) => {
            for (const m of (meta ?? []) as any[]) {
              extra.set(m.id, {
                sold_count: Number(m.sold_count ?? 0),
                store_logo_url: m.stores?.logo_url ?? null,
                store_id: m.store_id ?? null,
              });
            }
          })
      : Promise.resolve(),
    readPresenceMap(supabase),
  ]);
  return {
    items: items.map((i) => {
      const storeId = extra.get(i.id)?.store_id ?? null;
      return {
        ...i,
        sold_count: extra.get(i.id)?.sold_count ?? 0,
        store_logo_url: extra.get(i.id)?.store_logo_url ?? null,
        store_presence: presence.get(storeId),
      };
    }),
    error: null,
    total: items.length,
    page,
    nextPage: items.length === pageSize ? page + 1 : null,
  };
}

export async function readCatalogProduct(data: { slug: string }) {
  const { createPublicClient } = await import("./supabase-public.server");
  const supabase = createPublicClient();
  const { data: row, error } = await supabase
    .from("digital_products")
    .select(
      "id, name, slug, short_description, description, thumbnail_url, price, discount_price, usage_notes, version, download_limit, validity_days, sold_count, delivery_mode, code_kind, available_stock, store_id, stores(name, slug, is_platform), categories(name, slug), product_variants(id, name, price, discount_price, sort_order)",
    )
    .eq("slug", data.slug)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[katalog] detail produk gagal:", error.message);
    return { product: null, error: "Produk tidak dapat dimuat." as const };
  }
  if (!row) return { product: null, error: null };

  // RLS publik hanya mengembalikan variasi aktif; urutkan dan buang variasi
  // pada mode kirim yang tidak mendukungnya.
  const { product_variants: rawVariants, ...rest } = row as typeof row & {
    product_variants?: ProductVariant[] | null;
  };
  const variants =
    (rest.delivery_mode ?? "shared") === "shared"
      ? [...(rawVariants ?? [])].sort((a, b) => a.sort_order - b.sort_order)
      : [];

  // Produk tanpa store_id adalah produk platform: tampilkan sebagai toko resmi.
  const { loadStoreCard } = await import("./store-card.server");
  const { seller, sellerStats } = await loadStoreCard(supabase, rest.store_id ?? null);

  return {
    product: { ...rest, variants, seller, sellerStats },
    error: null,
  };
}
