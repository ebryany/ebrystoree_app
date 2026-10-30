import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const listInput = z
  .object({
    q: z.string().trim().max(80).optional(),
    category: z.string().trim().max(80).optional(),
    page: z.number().int().min(0).max(500).optional(),
    pageSize: z.number().int().min(1).max(48).optional(),
  })
  .optional();

function pageRange(data: { page?: number; pageSize?: number } | undefined) {
  const pageSize = data?.pageSize ?? 48;
  const page = data?.page ?? 0;
  return { page, pageSize, from: page * pageSize, to: page * pageSize + pageSize - 1 };
}

function escapeLike(value: string) {
  return value.replace(/[%_,]/g, " ").trim();
}

export const listCatalogCategories = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ kind: z.string().trim().max(20) }).parse(data))
  .handler(async ({ data }) => {
    const { createPublicClient } = await import("./supabase-public.server");
    const supabase = createPublicClient();
    const { data: rows, error } = await supabase
      .from("categories")
      .select("id, name, slug, icon, tone")
      .eq("kind", data.kind)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      console.error("[catalog] listCatalogCategories gagal:", error.message);
      return {
        items: [] as {
          id: string;
          name: string;
          slug: string;
          icon: string | null;
          tone: string | null;
        }[],
        error: "Kategori sedang tidak dapat dimuat.",
      };
    }
    return { items: rows ?? [], error: null };
  });

async function resolveCategoryId(
  supabase: { from: (t: "categories") => any },
  slug: string | undefined,
) {
  if (!slug) return null;
  const { data } = await supabase.from("categories").select("id").eq("slug", slug).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

const listInputExt = z
  .object({
    q: z.string().trim().max(80).optional(),
    category: z.string().trim().max(80).optional(),
    store: z.string().trim().max(80).optional(),
    page: z.number().int().min(0).max(500).optional(),
    pageSize: z.number().int().min(1).max(48).optional(),
  })
  .optional();

export const listProducts = createServerFn({ method: "GET" })
  .validator((data: unknown) => listInputExt.parse(data))
  .handler(async ({ data }) => {
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
    const extra = new Map<string, { sold_count: number; store_logo_url: string | null }>();
    if (items.length > 0) {
      const { data: meta } = await supabase
        .from("digital_products")
        .select("id, sold_count, stores(logo_url)")
        .in(
          "id",
          items.map((i) => i.id),
        );
      for (const m of (meta ?? []) as any[]) {
        extra.set(m.id, {
          sold_count: Number(m.sold_count ?? 0),
          store_logo_url: m.stores?.logo_url ?? null,
        });
      }
    }
    return {
      items: items.map((i) => ({
        ...i,
        sold_count: extra.get(i.id)?.sold_count ?? 0,
        store_logo_url: extra.get(i.id)?.store_logo_url ?? null,
      })),
      error: null,
      total: items.length,
      page,
      nextPage: items.length === pageSize ? page + 1 : null,
    };
  });

export type ShelfProduct = {
  id: string;
  name: string;
  slug: string;
  thumbnail_url: string | null;
  price: number;
  discount_price: number | null;
  sold_count: number;
  store_name: string | null;
  store_slug: string | null;
  store_logo_url: string | null;
  is_official: boolean;
  /** Rata-rata bintang toko dari ulasan yang tampil; null bila belum ada ulasan. */
  store_rating: number | null;
};

/**
 * Rak produk untuk dashboard user: "Terlaris" + satu rak per kategori aktif.
 * Satu query produk lalu dikelompokkan di server agar klien cukup 1 request.
 */
export const listProductShelves = createServerFn({ method: "GET" }).handler(async () => {
  const { createPublicClient } = await import("./supabase-public.server");
  const supabase = createPublicClient();

  const [productsRes, categoriesRes] = await Promise.all([
    supabase
      .from("digital_products")
      .select(
        "id, name, slug, thumbnail_url, price, discount_price, sold_count, category_id, store_id, stores(name, slug, logo_url, is_platform)",
      )
      .eq("status", "published")
      .eq("moderation_status", "approved")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("categories")
      .select("id, name, slug")
      .eq("kind", "product")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  if (productsRes.error) {
    console.error("[catalog] listProductShelves gagal:", productsRes.error.message);
    return {
      bestSellers: [] as ShelfProduct[],
      latest: [] as ShelfProduct[],
      shelves: [] as { slug: string; name: string; items: ShelfProduct[] }[],
      error: "Produk sedang tidak dapat dimuat." as const,
    };
  }

  // Rating per toko: satu query ulasan, dirata-rata di server.
  const storeIds = [
    ...new Set((productsRes.data ?? []).map((r: any) => r.store_id as string).filter(Boolean)),
  ];
  const ratingByStore = new Map<string, number>();
  if (storeIds.length) {
    const { data: reviews } = await supabase
      .from("product_reviews")
      .select("store_id, rating")
      .eq("is_visible", true)
      .in("store_id", storeIds)
      .limit(3000);
    const agg = new Map<string, { sum: number; n: number }>();
    for (const r of reviews ?? []) {
      const a = agg.get(r.store_id as string) ?? { sum: 0, n: 0 };
      a.sum += Number(r.rating);
      a.n += 1;
      agg.set(r.store_id as string, a);
    }
    for (const [id, a] of agg) ratingByStore.set(id, a.sum / a.n);
  }

  const rows = (productsRes.data ?? []).map((r: any) => ({
    category_id: r.category_id as string | null,
    item: {
      id: r.id,
      name: r.name,
      slug: r.slug,
      thumbnail_url: r.thumbnail_url,
      price: Number(r.price),
      discount_price: r.discount_price == null ? null : Number(r.discount_price),
      sold_count: Number(r.sold_count ?? 0),
      // Produk tanpa toko = milik platform; tampil sebagai Ebrystore resmi.
      store_name: r.stores?.name ?? (r.store_id ? null : "Ebrystore"),
      store_slug: r.stores?.slug ?? null,
      store_logo_url: r.stores?.logo_url ?? null,
      is_official: !r.store_id || Boolean(r.stores?.is_platform),
      store_rating: ratingByStore.get(r.store_id) ?? null,
    } satisfies ShelfProduct,
  }));

  const bestSellers = rows
    .map((r) => r.item)
    .filter((p) => p.sold_count > 0)
    .sort((a, b) => b.sold_count - a.sold_count)
    .slice(0, 12);

  const shelves = (categoriesRes.data ?? [])
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      items: rows
        .filter((r) => r.category_id === c.id)
        .map((r) => r.item)
        .slice(0, 12),
    }))
    .filter((s) => s.items.length > 0);

  // Query sudah diurutkan created_at desc, jadi 12 pertama = produk terbaru.
  const latest = rows.map((r) => r.item).slice(0, 12);

  return { bestSellers, latest, shelves, error: null };
});

export const listPublicMarketplaceServices = createServerFn({ method: "GET" })
  .validator((data: unknown) => listInput.parse(data))
  .handler(async ({ data }) => {
    const { readPublicMarketplaceServices } = await import("./marketplace-service-catalog.server");
    return readPublicMarketplaceServices(data);
  });

export const listServices = createServerFn({ method: "GET" })
  .validator((data: unknown) => listInput.parse(data))
  .handler(async ({ data }) => {
    const { createPublicClient } = await import("./supabase-public.server");
    const supabase = createPublicClient();
    const { page, pageSize, from, to } = pageRange(data);
    const categoryId = await resolveCategoryId(supabase as never, data?.category);
    if (data?.category && !categoryId) {
      return { items: [], error: null, total: 0, page, nextPage: null };
    }

    let query = supabase
      .from("services")
      .select(
        "id, name, slug, short_description, thumbnail_url, service_packages(id, name, price, estimated_days, free_revisions, is_active)",
        { count: "exact" },
      )
      .eq("status", "published")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, to);

    const term = data?.q ? escapeLike(data.q) : "";
    if (term) query = query.or(`name.ilike.%${term}%,short_description.ilike.%${term}%`);
    if (categoryId)
      query = query.or(`academic_category_id.eq.${categoryId},category_id.eq.${categoryId}`);

    const { data: rows, error, count } = await query;
    if (error) {
      console.error("[catalog] listServices gagal:", error.message);
      return {
        items: [],
        error: "Katalog layanan sedang tidak dapat dimuat." as const,
        total: 0,
        page,
        nextPage: null,
      };
    }
    const items = rows ?? [];
    const total = count ?? items.length;
    return {
      items,
      error: null,
      total,
      page,
      nextPage: items.length === pageSize && (page + 1) * pageSize < total ? page + 1 : null,
    };
  });

export const getStorefrontSummary = createServerFn({ method: "GET" }).handler(async () => {
  const { createPublicClient } = await import("./supabase-public.server");
  const supabase = createPublicClient();

  const [products, services] = await Promise.all([
    supabase
      .from("digital_products")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .is("deleted_at", null),
    supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .is("deleted_at", null),
  ]);

  return {
    productCount: products.count ?? 0,
    serviceCount: services.count ?? 0,
    error:
      products.error || services.error ? ("Ringkasan katalog tidak dapat dimuat." as const) : null,
  };
});

const slugInput = z.object({ slug: z.string().trim().min(1).max(120) });

export const getServiceDetail = createServerFn({ method: "GET" })
  .validator((data: unknown) => slugInput.parse(data))
  .handler(async ({ data }) => {
    const { createPublicClient } = await import("./supabase-public.server");
    const supabase = createPublicClient();

    const { data: row, error } = await supabase
      .from("services")
      .select(
        "id, name, slug, short_description, description, thumbnail_url, requirements_note, order_capacity, supported_education_levels, supported_outputs, supported_citation_styles, requires_quality_review, allows_attachments, requires_rubric, requires_dataset, default_revision_limit, categories:academic_category_id(slug, name), service_packages(id, name, description, price, estimated_days, free_revisions, sla_hours, priority, is_active, sort_order, urgency_supported, quality_review_included, maximum_pages), service_addons(id, name, description, price, is_active, sort_order)",
      )
      .eq("slug", data.slug)
      .eq("status", "published")
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      console.error("[catalog] getServiceDetail gagal:", error.message);
      return { service: null, error: "Detail layanan sedang tidak dapat dimuat." as const };
    }
    if (!row) return { service: null, error: null };

    const packages = (row.service_packages ?? [])
      .filter((p) => p.is_active !== false)
      .sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || Number(a.price) - Number(b.price),
      );
    const addons = (row.service_addons ?? [])
      .filter((a) => a.is_active !== false)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    return { service: { ...row, service_packages: packages, service_addons: addons }, error: null };
  });
