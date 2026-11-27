import { z } from "zod";
import { clientIpFrom } from "./client-ip.server";
import { serviceMediaUrl } from "./marketplace-service";
import {
  mobileSignInWithPassword,
  optionalMobileAuth,
  requireMobileAuth,
  type MobileAuthContext,
  type MobileAuthResult,
  type MobileLoginResult,
} from "./mobile-auth.server";
import { handleMobileCommerceRoute } from "./mobile-commerce.server";
import { handleMobileSlice3Route } from "./mobile-slice3.server";
import {
  readCatalogCategories,
  readCatalogProduct,
  readCatalogProducts,
} from "./public-catalog.server";
import { enforceRateLimit } from "./rate-limit.server";
import { getOrLoad } from "./server-cache.server";
import { homeBannerSlides } from "./website-settings";
import { readPublicSettings } from "./website-settings.server";

const MAX_JSON_BODY_BYTES = 65_536;

const loginSchema = z
  .object({
    email: z.string().trim().email().max(160),
    password: z.string().min(8).max(200),
  })
  .strict();

const productsQuerySchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    category: z.string().trim().max(80).optional(),
    store: z.string().trim().max(80).optional(),
    official: z.enum(["1", "true", "0", "false"]).optional(),
    discount: z.enum(["1", "true", "0", "false"]).optional(),
    sort: z
      .enum(["latest", "popular", "price_asc", "price_desc", "discount_desc"])
      .default("latest"),
    page: z.coerce.number().int().min(0).max(500).default(0),
    pageSize: z.coerce.number().int().min(1).max(48).default(20),
  })
  .strict();

const socialStateQuerySchema = z
  .object({
    storeId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
  })
  .strict();

const toggleLikeSchema = z.object({ productId: z.string().uuid() }).strict();
const toggleFollowSchema = z.object({ storeId: z.string().uuid() }).strict();
const submitProductReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    title: z.string().trim().max(120).optional(),
    body: z.string().trim().max(1000).optional(),
  })
  .strict();
const uuidSchema = z.string().uuid();
const slugSchema = z.string().trim().min(1).max(120);

const SOCIAL_ERRORS: Record<string, string> = {
  AUTH_REQUIRED: "Masuk dulu untuk melanjutkan.",
  STORE_NOT_FOUND: "Toko tidak ditemukan.",
  OWN_STORE: "Kamu tidak bisa mengikuti tokomu sendiri.",
  PRODUCT_NOT_FOUND: "Produk tidak ditemukan.",
};

function mapSocialError(message: string | undefined): string {
  const key = Object.keys(SOCIAL_ERRORS).find((k) => message?.includes(k));
  return key ? SOCIAL_ERRORS[key] : "Permintaan gagal. Coba lagi.";
}

export function mobileOk(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export function mobileOkPublic(
  data: unknown,
  maxAgeSeconds = 30,
  swrSeconds = 120,
  cdnMaxAgeSeconds = maxAgeSeconds * 2,
  cdnSwrSeconds = swrSeconds * 2,
): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${swrSeconds}`,
      "cdn-cache-control": `public, max-age=${cdnMaxAgeSeconds}, stale-while-revalidate=${cdnSwrSeconds}`,
      vary: "Accept-Encoding",
      "x-content-type-options": "nosniff",
    },
  });
}

export function mobileErr(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function hasDuplicateSearchParams(url: URL): boolean {
  const entries = [...url.searchParams];
  return new Set(entries.map(([key]) => key)).size !== entries.length;
}

function isSafeSlugSegment(value: string): boolean {
  return !["/", "\\", "\u0000"].some((bad) => value.includes(bad));
}

async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    return {
      ok: false,
      response: mobileErr("PAYLOAD_TOO_LARGE", "Ukuran permintaan melebihi batas.", 413),
    };
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_JSON_BODY_BYTES) {
    return {
      ok: false,
      response: mobileErr("PAYLOAD_TOO_LARGE", "Ukuran permintaan melebihi batas.", 413),
    };
  }
  if (!raw.trim()) {
    return { ok: false, response: mobileErr("INVALID_JSON", "Body JSON wajib diisi.", 400) };
  }
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, response: mobileErr("INVALID_JSON", "Format JSON tidak valid.", 400) };
  }
}

function effectivePrice(price: number, discountPrice: number | null): number {
  return discountPrice != null && discountPrice > 0 && discountPrice < price
    ? discountPrice
    : price;
}

function discountPercent(price: number, discountPrice: number | null): number {
  if (discountPrice == null || discountPrice <= 0 || discountPrice >= price || price <= 0) return 0;
  return Math.round(((price - discountPrice) / price) * 100);
}

function sortProducts<
  T extends { price: number; discount_price: number | null; sold_count?: number },
>(items: T[], sort: z.infer<typeof productsQuerySchema>["sort"]): T[] {
  const copy = [...items];
  switch (sort) {
    case "popular":
      return copy.sort((a, b) => (b.sold_count ?? 0) - (a.sold_count ?? 0));
    case "price_asc":
      return copy.sort(
        (a, b) =>
          effectivePrice(a.price, a.discount_price) - effectivePrice(b.price, b.discount_price),
      );
    case "price_desc":
      return copy.sort(
        (a, b) =>
          effectivePrice(b.price, b.discount_price) - effectivePrice(a.price, a.discount_price),
      );
    case "discount_desc":
      return copy.sort(
        (a, b) =>
          discountPercent(b.price, b.discount_price) - discountPercent(a.price, a.discount_price),
      );
    case "latest":
    default:
      return copy;
  }
}

// Bounded in-memory rate limiter strictly for non-financial read-only public GETs.
// Financial, auth, and mutation buckets continue using fail-closed DB RPC `enforceRateLimit`.
const publicRateWindows = new Map<string, { count: number; resetAt: number }>();
const PUBLIC_RATE_LIMIT = 180;
const PUBLIC_RATE_WINDOW_MS = 60_000;
const PUBLIC_RATE_MAX_KEYS = 4000;

function checkLocalPublicRateLimit(ipKey: string): { error: string } | null {
  const now = Date.now();
  const entry = publicRateWindows.get(ipKey);
  if (!entry || now >= entry.resetAt) {
    if (publicRateWindows.size >= PUBLIC_RATE_MAX_KEYS && !publicRateWindows.has(ipKey)) {
      const oldest = publicRateWindows.keys().next().value;
      if (oldest !== undefined) publicRateWindows.delete(oldest);
    }
    publicRateWindows.set(ipKey, { count: 1, resetAt: now + PUBLIC_RATE_WINDOW_MS });
    return null;
  }
  entry.count += 1;
  if (entry.count > PUBLIC_RATE_LIMIT) {
    return { error: "Terlalu banyak permintaan. Coba lagi dalam 1 menit." };
  }
  return null;
}

async function defaultCheckRateLimit(
  request: Request,
  bucket: "catalog.public" | "social.toggle",
  keyOverride?: string,
) {
  const key = keyOverride ?? `ip:${clientIpFrom((name) => request.headers.get(name)) ?? "unknown"}`;
  if (bucket === "catalog.public") {
    return checkLocalPublicRateLimit(key);
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return enforceRateLimit(key, bucket);
}

async function readBootstrapData() {
  const load = async () => {
    const { values, updatedAt } = await readPublicSettings();
    return {
      mobile: {
        apiVersion: "v1",
        minVersionCode: 1,
        latestVersionCode: 1,
      },
      supabase: {
        url: process.env.SUPABASE_URL ?? "",
        publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
      },
      maintenance: {
        active: Boolean(values.maintenance_active),
        title: String(values.maintenance_title ?? ""),
        message: String(values.maintenance_message ?? ""),
        eta: String(values.maintenance_eta ?? ""),
      },
      features: {
        registration: values.feature_registration !== false,
        checkout: values.feature_checkout !== false,
        digitalProducts: values.feature_digital_products !== false,
        academicServices: values.feature_academic_services !== false,
        creditTopup: values.feature_credit_topup !== false,
        refund: values.feature_refund !== false,
      },
      branding: {
        siteName: String(values.store_name ?? values.site_name ?? "Ebrystore"),
        tagline: String(values.site_tagline ?? ""),
        accentColor: String(values.site_accent_color ?? "#0f8f86"),
        logoUrl: String(values.site_logo_url ?? ""),
        logoDarkUrl: String(values.site_logo_dark_url ?? ""),
        heroTitle: String(values.home_hero_title ?? ""),
        heroSubtitle: String(values.home_hero_subtitle ?? ""),
        banners: homeBannerSlides(values),
      },
      updatedAt,
    };
  };
  if (process.env.VITEST) return load();
  return getOrLoad("mobile:bootstrap", "v1", 60_000, load, { maxEntries: 4 });
}

async function readHomeData() {
  const load = async () => {
    const { createPublicClient } = await import("./supabase-public.server");
    const { readPresenceMap } = await import("./store-presence");
    const { readPublicMarketplaceServices } = await import("./marketplace-service-catalog.server");
    const supabase = createPublicClient();

    const [
      categoriesRes,
      serviceCategoriesRes,
      productsRes,
      servicesRes,
      platformServicesRes,
      reviewsRes,
      presence,
    ] = await Promise.all([
      readCatalogCategories({ kind: "product" }),
      readCatalogCategories({ kind: "service" }),
      supabase
        .from("digital_products")
        .select(
          "id, name, slug, short_description, thumbnail_url, price, discount_price, sold_count, category_id, store_id, stores(name, slug, logo_url, is_platform)",
        )
        .eq("status", "published")
        .eq("moderation_status", "approved")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(120),
      readPublicMarketplaceServices({ page: 0, pageSize: 8 }),
      supabase
        .from("services")
        .select(
          "id, name, slug, short_description, thumbnail_url, category:categories!services_category_id_fkey(slug, name), service_packages(id, name, price, estimated_days, free_revisions, is_active)",
        )
        .eq("status", "published")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(4),
      supabase
        .from("product_reviews")
        .select(
          "id, rating, title, body, reviewer_name, created_at, store_id, digital_products(name, slug, thumbnail_url), stores(name, slug, logo_url)",
        )
        .eq("is_visible", true)
        .order("created_at", { ascending: false })
        .limit(40),
      readPresenceMap(supabase),
    ]);

    if (productsRes.error) {
      throw new Error("HOME_PRODUCTS_FAILED");
    }

    const storeStats = new Map<
      string,
      { id: string; name: string; slug: string; logoUrl: string | null; sum: number; count: number }
    >();
    for (const rev of (reviewsRes.data ?? []) as any[]) {
      if (!rev.store_id || !rev.stores?.slug) continue;
      const cur = storeStats.get(rev.store_id) ?? {
        id: rev.store_id,
        name: rev.stores.name,
        slug: rev.stores.slug,
        logoUrl: rev.stores.logo_url ?? null,
        sum: 0,
        count: 0,
      };
      cur.sum += Number(rev.rating ?? 0);
      cur.count += 1;
      storeStats.set(rev.store_id, cur);
    }

    const rawProducts = (productsRes.data ?? []) as any[];
    const normalizedProducts = rawProducts.map((r) => {
      const stat = r.store_id ? storeStats.get(r.store_id) : undefined;
      const storeRating =
        stat && stat.count > 0 ? Number((stat.sum / stat.count).toFixed(1)) : null;
      return {
        id: r.id as string,
        name: r.name as string,
        slug: r.slug as string,
        shortDescription: (r.short_description as string | null) ?? null,
        thumbnailUrl: (r.thumbnail_url as string | null) ?? null,
        price: Number(r.price),
        discountPrice: r.discount_price == null ? null : Number(r.discount_price),
        soldCount: Number(r.sold_count ?? 0),
        storeRating,
        categoryId: (r.category_id as string | null) ?? null,
        storeId: (r.store_id as string | null) ?? null,
        storeName: (r.stores?.name as string | null) ?? (r.store_id ? null : "Ebrystore"),
        storeSlug: (r.stores?.slug as string | null) ?? null,
        storeLogoUrl: (r.stores?.logo_url as string | null) ?? null,
        isOfficial: !r.store_id || Boolean(r.stores?.is_platform),
        storePresence: presence.get(r.store_id ?? null),
      };
    });

    const promoDeals = normalizedProducts
      .filter((p) => discountPercent(p.price, p.discountPrice) > 0)
      .sort(
        (a, b) =>
          discountPercent(b.price, b.discountPrice) - discountPercent(a.price, a.discountPrice),
      )
      .slice(0, 10);

    const bestSellers = [...normalizedProducts]
      .filter((p) => p.soldCount > 0)
      .sort((a, b) => b.soldCount - a.soldCount)
      .slice(0, 12);

    const latest = normalizedProducts.slice(0, 12);

    const featuredSellers = [...storeStats.values()]
      .map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        logoUrl: s.logoUrl,
        rating: s.count > 0 ? Number((s.sum / s.count).toFixed(2)) : 0,
        reviews: s.count,
        presence: presence.get(s.id),
      }))
      .sort((a, b) => b.reviews - a.reviews || b.rating - a.rating)
      .slice(0, 10);

    const recentReviews = ((reviewsRes.data ?? []) as any[]).slice(0, 10).map((r) => ({
      id: r.id as string,
      rating: Number(r.rating),
      title: (r.title as string | null) ?? null,
      body: (r.body as string | null) ?? null,
      reviewerName: (r.reviewer_name as string | null) ?? null,
      createdAt: r.created_at as string,
      product: r.digital_products ?? null,
      store: r.stores ? { name: r.stores.name, slug: r.stores.slug } : null,
    }));

    const sellerServices = servicesRes.items.map((item) => ({
      ...item,
      media: item.media.map((m) => ({ ...m, url: serviceMediaUrl(m.path) })),
    }));

    const platformServices = ((platformServicesRes.data ?? []) as any[]).map((r) => {
      const pkgs = (r.service_packages ?? []).filter((p: any) => p.is_active !== false);
      const minPrice = pkgs.length ? Math.min(...pkgs.map((p: any) => Number(p.price))) : 0;
      const minDays = pkgs.length
        ? Math.min(...pkgs.map((p: any) => Number(p.estimated_days ?? 1)))
        : 1;
      return {
        id: r.id as string,
        name: r.name as string,
        slug: r.slug as string,
        shortDescription: (r.short_description as string | null) ?? null,
        thumbnailUrl: (r.thumbnail_url as string | null) ?? null,
        category: r.category ?? null,
        startingPrice: minPrice,
        minEstimatedDays: minDays,
        packageCount: pkgs.length,
      };
    });

    return {
      categories: categoriesRes.items,
      serviceCategories: serviceCategoriesRes.items,
      promoDeals,
      bestSellers,
      latest,
      sellerServices,
      platformServices,
      featuredSellers,
      recentReviews,
    };
  };

  if (process.env.VITEST) return load();
  return getOrLoad("mobile:home", "v1", 60_000, load, { maxEntries: 4 });
}

async function readProductDetailData(slug: string, viewer: MobileAuthContext | null) {
  const result = await readCatalogProduct({ slug });
  if (result.error) return { error: "CATALOG_UNAVAILABLE" as const, data: null };
  if (!result.product) return { error: null, data: null };

  const product = result.product as any;
  const { createPublicClient } = await import("./supabase-public.server");
  const pub = createPublicClient();

  const loadPublicExtras = async () => {
    const ownerFilter = product.store_id
      ? `store_id.eq.${product.store_id}`
      : "store_id.is.null";
    const [likesRes, reviewsRes, relatedRes] = await Promise.all([
      pub.rpc("product_like_summary", { _product_id: product.id }),
      pub
        .from("product_reviews")
        .select("id, rating, title, body, reviewer_name, created_at, is_verified")
        .eq("product_id", product.id)
        .eq("is_visible", true)
        .order("created_at", { ascending: false })
        .limit(30),
      pub
        .from("digital_products")
        .select(
          "id, name, slug, short_description, thumbnail_url, price, discount_price, sold_count, store_id, stores(name, slug, logo_url, is_platform)",
        )
        .or(ownerFilter)
        .neq("id", product.id)
        .eq("status", "published")
        .eq("moderation_status", "approved")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);
    const reviews = reviewsRes.data ?? [];
    const verified = reviews.filter((r) => Boolean(r.is_verified));
    const ratingAverage = verified.length
      ? Number((verified.reduce((sum, r) => sum + Number(r.rating), 0) / verified.length).toFixed(2))
      : 0;
    const relatedProducts = ((relatedRes.data ?? []) as any[]).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      slug: r.slug as string,
      shortDescription: (r.short_description as string | null) ?? null,
      thumbnailUrl: (r.thumbnail_url as string | null) ?? null,
      price: Number(r.price),
      discountPrice: r.discount_price == null ? null : Number(r.discount_price),
      soldCount: Number(r.sold_count ?? 0),
      storeId: (r.store_id as string | null) ?? null,
      storeName: (r.stores?.name as string | null) ?? (r.store_id ? null : "Ebrystore"),
      storeSlug: (r.stores?.slug as string | null) ?? null,
      storeLogoUrl: (r.stores?.logo_url as string | null) ?? null,
      isOfficial: !r.store_id || Boolean(r.stores?.is_platform),
    }));
    return {
      likes: Number((likesRes.data as { likes?: number } | null)?.likes ?? 0),
      reviews: { items: reviews, average: ratingAverage, total: verified.length },
      relatedProducts,
    };
  };

  const [extras, viewerSocial] = await Promise.all([
    process.env.VITEST
      ? loadPublicExtras()
      : getOrLoad("mobile:product-extras", product.id, 15_000, loadPublicExtras, {
        maxEntries: 128,
      }),
    viewer
      ? Promise.all([
        viewer.supabase
          .from("product_likes")
          .select("product_id")
          .eq("user_id", viewer.userId)
          .eq("product_id", product.id)
          .maybeSingle(),
        product.store_id
          ? viewer.supabase
            .from("store_follows")
            .select("store_id")
            .eq("user_id", viewer.userId)
            .eq("store_id", product.store_id)
            .maybeSingle()
          : Promise.resolve({ data: null }),
        viewer.supabase
          .from("order_items")
          .select("id, orders!inner(status, user_id)")
          .eq("product_id", product.id)
          .eq("orders.user_id", viewer.userId)
          .in("orders.status", ["paid", "processing", "delivered", "completed"])
          .limit(1)
          .maybeSingle(),
        viewer.supabase
          .from("product_reviews")
          .select("id, rating, title, body")
          .eq("product_id", product.id)
          .eq("user_id", viewer.userId)
          .maybeSingle(),
      ])
      : Promise.resolve(null),
  ]);

  return {
    error: null,
    data: {
      product,
      likes: extras.likes,
      reviews: extras.reviews,
      relatedProducts: extras.relatedProducts,
      viewer: viewerSocial
        ? {
          liked: Boolean(viewerSocial[0].data),
          followingStore: Boolean(viewerSocial[1].data),
          canReview: Boolean(viewerSocial[2].data),
          myReview: viewerSocial[3].data ?? null,
        }
        : { liked: false, followingStore: false, canReview: false, myReview: null },
    },
  };
}

async function readProductReviewsBySlug(slug: string) {
  const { createPublicClient } = await import("./supabase-public.server");
  const supabase = createPublicClient();
  const { data: prod, error: prodErr } = await supabase
    .from("digital_products")
    .select("id")
    .eq("slug", slug)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle();
  if (prodErr) return { error: "CATALOG_UNAVAILABLE" as const, data: null };
  if (!prod) return { error: null, data: null };

  const { data: rows, error } = await supabase
    .from("product_reviews")
    .select("id, rating, title, body, reviewer_name, created_at, is_verified")
    .eq("product_id", prod.id)
    .eq("is_visible", true)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { error: "CATALOG_UNAVAILABLE" as const, data: null };

  const items = rows ?? [];
  const verified = items.filter((r) => Boolean(r.is_verified));
  const total = verified.length;
  const average = total
    ? Number((verified.reduce((sum, r) => sum + Number(r.rating), 0) / total).toFixed(2))
    : 0;

  return { error: null, data: { items, average, total } };
}

async function readProductSlugById(id: string) {
  const { createPublicClient } = await import("./supabase-public.server");
  const { data: row, error } = await createPublicClient()
    .from("digital_products")
    .select("slug")
    .eq("id", id)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { error: "CATALOG_UNAVAILABLE" as const, slug: null };
  return { error: null, slug: (row?.slug as string | undefined) ?? null };
}

async function readPublicStoreData(slug: string, viewer: MobileAuthContext | null) {
  const loadPublicStore = async () => {
    const { createPublicClient } = await import("./supabase-public.server");
    const { readPublicStoreServices } = await import("./marketplace-service-catalog.server");
    const { readStorePresence } = await import("./store-presence");
    const supabase = createPublicClient();

    const { data: store, error } = await supabase
      .from("stores")
      .select(
        "id, name, slug, description, logo_url, banner_url, banner_position, contact_phone, is_platform, created_at",
      )
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();
    if (error) return { error: "STORE_UNAVAILABLE" as const, data: null };
    if (!store) return { error: null, data: null };

    const ownerFilter = store.is_platform
      ? `store_id.eq.${store.id},store_id.is.null`
      : `store_id.eq.${store.id}`;

    const [
      productsResult,
      ratingResult,
      soldResult,
      socialResult,
      servicesResult,
      presence,
    ] = await Promise.all([
      supabase
        .from("digital_products")
        .select("id, name, slug, short_description, thumbnail_url, price, discount_price, sold_count")
        .or(ownerFilter)
        .eq("status", "published")
        .eq("moderation_status", "approved")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id")
        .limit(49),
      supabase.rpc("store_rating_summary", { _store_id: store.id }),
      supabase
        .from("digital_products")
        .select("sold_count")
        .or(ownerFilter)
        .eq("status", "published")
        .eq("moderation_status", "approved")
        .is("deleted_at", null),
      supabase.rpc("store_social_summary", { _store_id: store.id }),
      readPublicStoreServices(store.id),
      readStorePresence(supabase, store.id),
    ]);

    if (productsResult.error) return { error: "STORE_UNAVAILABLE" as const, data: null };

    const products = productsResult.data ?? [];
    const hasMoreProducts = products.length > 48;
    const rating = (ratingResult.data ?? { average: 0, total: 0 }) as {
      average: number;
      total: number;
    };
    const socialRow = (socialResult.data ?? {}) as Record<string, unknown>;
    const soldCount = (soldResult.data ?? []).reduce(
      (sum, row) => sum + Number((row as { sold_count?: number }).sold_count ?? 0),
      0,
    );
    const services = servicesResult.items.map((item) => ({
      ...item,
      media: item.media.map((m) => ({ ...m, url: serviceMediaUrl(m.path) })),
    }));

    return {
      error: null,
      data: {
        store: { ...store, presence },
        products: products.slice(0, 48),
        hasMoreProducts,
        services,
        rating: { average: Number(rating.average) || 0, total: Number(rating.total) || 0 },
        social: {
          followers: Number(socialRow.followers ?? 0),
          likes: Number(socialRow.likes ?? 0),
        },
        soldCount,
      },
    };
  };

  const base = process.env.VITEST
    ? await loadPublicStore()
    : await getOrLoad("mobile:store", slug, 20_000, loadPublicStore, {
      maxEntries: 64,
      shouldCache: (v) => v.error === null && v.data !== null,
    });

  if (base.error || !base.data) return base;

  const viewerResult = viewer
    ? await Promise.all([
      viewer.supabase
        .from("store_follows")
        .select("store_id")
        .eq("user_id", viewer.userId)
        .eq("store_id", base.data.store.id)
        .maybeSingle(),
      viewer.supabase
        .from("stores")
        .select("owner_id")
        .eq("id", base.data.store.id)
        .maybeSingle(),
    ])
    : null;

  // Explicitly compare owner_id to avoid RLS staff-read false positives.
  const isOwner = Boolean(viewer && viewerResult?.[1]?.data?.owner_id === viewer.userId);

  return {
    error: null,
    data: {
      ...base.data,
      viewer: {
        following: Boolean(viewerResult?.[0]?.data),
        isOwner,
      },
    },
  };
}

async function readStoresPresenceData(ids: string[]) {
  const { createPublicClient } = await import("./supabase-public.server");
  const { toPresence } = await import("./store-presence");
  const { data: rows } = await createPublicClient()
    .from("store_presence" as never)
    .select("store_id, last_seen_at, online")
    .in("store_id", ids);

  const result: Record<string, { online: boolean; lastSeenAt: string | null }> = {};
  for (const id of ids) result[id] = { online: false, lastSeenAt: null };
  for (const r of (rows ?? []) as Array<{
    store_id: string;
    last_seen_at: string;
    online: boolean;
  }>) {
    result[r.store_id] = toPresence(r);
  }
  return result;
}

export type MobileV1Deps = {
  requireAuth: (request: Request) => Promise<MobileAuthResult>;
  optionalAuth: (request: Request) => Promise<MobileAuthContext | null>;
  signInWithPassword: (
    request: Request,
    input: { email: string; password: string },
  ) => Promise<MobileLoginResult>;
  checkRateLimit: (
    request: Request,
    bucket: "catalog.public" | "social.toggle",
    keyOverride?: string,
  ) => Promise<{ error: string } | null>;
  readBootstrap: () => Promise<unknown>;
  readHome: () => Promise<unknown>;
  readProducts: typeof readCatalogProducts;
  readProductDetail: (
    slug: string,
    viewer: MobileAuthContext | null,
  ) => Promise<{ error: string | null; data: unknown }>;
  readProductReviews: (slug: string) => Promise<{ error: string | null; data: unknown }>;
  readProductSlugById: (id: string) => Promise<{ error: string | null; slug: string | null }>;
  readStore: (
    slug: string,
    viewer: MobileAuthContext | null,
  ) => Promise<{ error: string | null; data: unknown }>;
  readStoresPresence: (
    ids: string[],
  ) => Promise<Record<string, { online: boolean; lastSeenAt: string | null }>>;
};

const defaultDeps: MobileV1Deps = {
  requireAuth: requireMobileAuth,
  optionalAuth: optionalMobileAuth,
  signInWithPassword: mobileSignInWithPassword,
  checkRateLimit: defaultCheckRateLimit,
  readBootstrap: readBootstrapData,
  readHome: readHomeData,
  readProducts: readCatalogProducts,
  readProductDetail: readProductDetailData,
  readProductReviews: readProductReviewsBySlug,
  readProductSlugById: readProductSlugById,
  readStore: readPublicStoreData,
  readStoresPresence: readStoresPresenceData,
};

export async function handleMobileV1Request(
  request: Request,
  overrides: Partial<MobileV1Deps> = {},
): Promise<Response> {
  const deps: MobileV1Deps = { ...defaultDeps, ...overrides };
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");
  const method = request.method.toUpperCase();

  try {
    if (path === "/api/mobile/v1/bootstrap") {
      if (method !== "GET") return mobileErr("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
      const limited = await deps.checkRateLimit(request, "catalog.public");
      if (limited) return mobileErr("RATE_LIMITED", limited.error, 429);
      return mobileOkPublic(await deps.readBootstrap(), 15, 60, 30, 120);
    }

    if (path === "/api/mobile/v1/auth/login") {
      if (method !== "POST") return mobileErr("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
      const parsedBody = await readJsonBody(request);
      if (!parsedBody.ok) return parsedBody.response;
      const parsed = loginSchema.safeParse(parsedBody.body);
      if (!parsed.success) {
        return mobileErr("INVALID_INPUT", "Email atau format kata sandi tidak valid.", 400);
      }
      const res = await deps.signInWithPassword(request, parsed.data);
      if (!res.ok) return mobileErr(res.code, res.message, res.status);
      return mobileOk(res.data);
    }

    if (path === "/api/mobile/v1/auth/verify-session") {
      if (method !== "POST") return mobileErr("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
      const auth = await deps.requireAuth(request);
      if (!auth.ok) return mobileErr(auth.code, auth.message, auth.status);
      return mobileOk({ allowed: true, userId: auth.context.userId });
    }

    if (path === "/api/mobile/v1/home") {
      if (method !== "GET") return mobileErr("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
      const limited = await deps.checkRateLimit(request, "catalog.public");
      if (limited) return mobileErr("RATE_LIMITED", limited.error, 429);
      return mobileOkPublic(await deps.readHome(), 30, 120, 60, 300);
    }

    if (path === "/api/mobile/v1/products") {
      if (method !== "GET") return mobileErr("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
      const limited = await deps.checkRateLimit(request, "catalog.public");
      if (limited) return mobileErr("RATE_LIMITED", limited.error, 429);
      if (hasDuplicateSearchParams(url)) {
        return mobileErr("INVALID_QUERY", "Parameter query duplikat tidak diizinkan.", 400);
      }
      const parsed = productsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
      if (!parsed.success) {
        return mobileErr("INVALID_QUERY", "Parameter pencarian tidak valid.", 400);
      }
      const result = await deps.readProducts({
        q: parsed.data.q,
        category: parsed.data.category,
        store: parsed.data.store,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
      });
      if (result.error) {
        return mobileErr("CATALOG_UNAVAILABLE", "Katalog produk sedang tidak dapat dimuat.", 503);
      }
      let filtered = result.items;
      if (parsed.data.official === "1" || parsed.data.official === "true") {
        filtered = filtered.filter((item) => Boolean(item.is_official));
      }
      if (parsed.data.discount === "1" || parsed.data.discount === "true") {
        filtered = filtered.filter((item) => discountPercent(item.price, item.discount_price) > 0);
      }
      return mobileOkPublic(
        {
          items: sortProducts(filtered, parsed.data.sort),
          page: result.page,
          pageSize: parsed.data.pageSize,
          nextPage: result.nextPage,
        },
        30,
        120,
        60,
        300,
      );
    }

    const reviewsMatch = /^\/api\/mobile\/v1\/products\/([^/]+)\/reviews$/.exec(path);
    if (reviewsMatch) {
      const decoded = decodeURIComponent(reviewsMatch[1]);
      const slug = slugSchema.safeParse(decoded);
      if (!slug.success || !isSafeSlugSegment(slug.data)) {
        return mobileErr("INVALID_QUERY", "Slug produk tidak valid.", 400);
      }
      if (method === "GET") {
        const limited = await deps.checkRateLimit(request, "catalog.public");
        if (limited) return mobileErr("RATE_LIMITED", limited.error, 429);
        const res = await deps.readProductReviews(slug.data);
        if (res.error) return mobileErr(res.error, "Ulasan sedang tidak dapat dimuat.", 503);
        if (!res.data) return mobileErr("PRODUCT_NOT_FOUND", "Produk tidak ditemukan.", 404);
        return mobileOkPublic(res.data, 15, 45);
      }
      if (method === "POST") {
        const auth = await deps.requireAuth(request);
        if (!auth.ok) return mobileErr(auth.code, auth.message, auth.status);
        const limited = await deps.checkRateLimit(request, "social.toggle", auth.context.userId);
        if (limited) return mobileErr("RATE_LIMITED", limited.error, 429);
        const parsedBody = await readJsonBody(request);
        if (!parsedBody.ok) return parsedBody.response;
        const parsed = submitProductReviewSchema.safeParse(parsedBody.body);
        if (!parsed.success) {
          return mobileErr("INVALID_INPUT", "Rating 1-5 dan format ulasan tidak valid.", 400);
        }
        const { createPublicClient } = await import("./supabase-public.server");
        const { data: prod } = await createPublicClient()
          .from("digital_products")
          .select("id")
          .eq("slug", slug.data)
          .eq("status", "published")
          .is("deleted_at", null)
          .maybeSingle();
        if (!prod) return mobileErr("PRODUCT_NOT_FOUND", "Produk tidak ditemukan.", 404);
        const { error } = await auth.context.supabase.rpc("submit_product_review", {
          _product_id: prod.id,
          _rating: parsed.data.rating,
          _title: parsed.data.title ?? undefined,
          _body: parsed.data.body ?? undefined,
        });
        if (error) {
          return mobileErr(
            "REVIEW_FAILED",
            "Ulasan gagal dikirim. Pastikan kamu sudah membeli produk ini.",
            400,
          );
        }
        return mobileOk({ submitted: true });
      }
      return mobileErr("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
    }

    const productMatch = /^\/api\/mobile\/v1\/products\/([^/]+)$/.exec(path);
    if (productMatch) {
      if (method !== "GET") return mobileErr("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
      const limited = await deps.checkRateLimit(request, "catalog.public");
      if (limited) return mobileErr("RATE_LIMITED", limited.error, 429);
      const decoded = decodeURIComponent(productMatch[1]);
      const slug = slugSchema.safeParse(decoded);
      if (!slug.success || !isSafeSlugSegment(slug.data) || url.search) {
        return mobileErr("INVALID_QUERY", "Slug produk tidak valid.", 400);
      }
      const viewer = await deps.optionalAuth(request);
      const res = await deps.readProductDetail(slug.data, viewer);
      if (res.error) return mobileErr(res.error, "Produk tidak dapat dimuat.", 503);
      if (!res.data) return mobileErr("PRODUCT_NOT_FOUND", "Produk tidak ditemukan.", 404);
      return viewer ? mobileOk(res.data) : mobileOkPublic(res.data, 20, 60, 45, 180);
    }

    const shortProductMatch = /^\/api\/mobile\/v1\/p\/([^/]+)$/.exec(path);
    if (shortProductMatch) {
      if (method !== "GET") return mobileErr("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
      const limited = await deps.checkRateLimit(request, "catalog.public");
      if (limited) return mobileErr("RATE_LIMITED", limited.error, 429);
      const parsedId = uuidSchema.safeParse(decodeURIComponent(shortProductMatch[1]));
      if (!parsedId.success) {
        return mobileErr("INVALID_QUERY", "ID produk tidak valid.", 400);
      }
      const res = await deps.readProductSlugById(parsedId.data);
      if (res.error) return mobileErr(res.error, "Produk tidak dapat dimuat.", 503);
      if (!res.slug) return mobileErr("PRODUCT_NOT_FOUND", "Produk tidak ditemukan.", 404);
      return mobileOkPublic({ slug: res.slug }, 60, 300, 120, 600);
    }

    if (path === "/api/mobile/v1/stores/presence") {
      if (method !== "GET") return mobileErr("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
      const limited = await deps.checkRateLimit(request, "catalog.public");
      if (limited) return mobileErr("RATE_LIMITED", limited.error, 429);
      const rawIds = (url.searchParams.get("ids") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const parsedIds = z.array(uuidSchema).min(1).max(50).safeParse(rawIds);
      if (!parsedIds.success) {
        return mobileErr("INVALID_QUERY", "Parameter ids harus berisi 1 sampai 50 UUID toko.", 400);
      }
      return mobileOk({ presence: await deps.readStoresPresence(parsedIds.data) });
    }

    const storeMatch = /^\/api\/mobile\/v1\/stores\/([^/]+)$/.exec(path);
    if (storeMatch) {
      if (method !== "GET") return mobileErr("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
      const limited = await deps.checkRateLimit(request, "catalog.public");
      if (limited) return mobileErr("RATE_LIMITED", limited.error, 429);
      const decoded = decodeURIComponent(storeMatch[1]);
      const slug = slugSchema.safeParse(decoded);
      if (!slug.success || !isSafeSlugSegment(slug.data) || url.search) {
        return mobileErr("INVALID_QUERY", "Slug toko tidak valid.", 400);
      }
      const viewer = await deps.optionalAuth(request);
      const res = await deps.readStore(slug.data, viewer);
      if (res.error) return mobileErr(res.error, "Toko tidak dapat dimuat.", 503);
      if (!res.data) return mobileErr("STORE_NOT_FOUND", "Toko tidak ditemukan.", 404);
      return viewer ? mobileOk(res.data) : mobileOkPublic(res.data, 20, 60, 45, 180);
    }

    if (path === "/api/mobile/v1/social/state") {
      if (method !== "GET") return mobileErr("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
      const auth = await deps.requireAuth(request);
      if (!auth.ok) return mobileErr(auth.code, auth.message, auth.status);
      if (hasDuplicateSearchParams(url)) {
        return mobileErr("INVALID_QUERY", "Parameter query duplikat tidak diizinkan.", 400);
      }
      const parsed = socialStateQuerySchema.safeParse(Object.fromEntries(url.searchParams));
      if (!parsed.success) {
        return mobileErr("INVALID_QUERY", "Parameter storeId atau productId tidak valid.", 400);
      }
      const { supabase, userId } = auth.context;
      const [follow, like] = await Promise.all([
        parsed.data.storeId
          ? supabase
            .from("store_follows")
            .select("store_id")
            .eq("user_id", userId)
            .eq("store_id", parsed.data.storeId)
            .maybeSingle()
          : Promise.resolve({ data: null }),
        parsed.data.productId
          ? supabase
            .from("product_likes")
            .select("product_id")
            .eq("user_id", userId)
            .eq("product_id", parsed.data.productId)
            .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return mobileOk({ following: Boolean(follow.data), liked: Boolean(like.data) });
    }

    if (path === "/api/mobile/v1/social/toggle-like") {
      if (method !== "POST") return mobileErr("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
      const auth = await deps.requireAuth(request);
      if (!auth.ok) return mobileErr(auth.code, auth.message, auth.status);
      const limited = await deps.checkRateLimit(request, "social.toggle", auth.context.userId);
      if (limited) return mobileErr("RATE_LIMITED", limited.error, 429);
      const parsedBody = await readJsonBody(request);
      if (!parsedBody.ok) return parsedBody.response;
      const parsed = toggleLikeSchema.safeParse(parsedBody.body);
      if (!parsed.success) {
        return mobileErr("INVALID_INPUT", "ID produk tidak valid.", 400);
      }
      const { data: row, error } = await auth.context.supabase.rpc("toggle_product_like", {
        _product_id: parsed.data.productId,
      });
      if (error) return mobileErr("SOCIAL_ACTION_FAILED", mapSocialError(error.message), 400);
      const r = row as { liked: boolean; likes: number };
      return mobileOk({ liked: Boolean(r.liked), likes: Number(r.likes ?? 0) });
    }

    if (path === "/api/mobile/v1/social/toggle-follow") {
      if (method !== "POST") return mobileErr("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
      const auth = await deps.requireAuth(request);
      if (!auth.ok) return mobileErr(auth.code, auth.message, auth.status);
      const limited = await deps.checkRateLimit(request, "social.toggle", auth.context.userId);
      if (limited) return mobileErr("RATE_LIMITED", limited.error, 429);
      const parsedBody = await readJsonBody(request);
      if (!parsedBody.ok) return parsedBody.response;
      const parsed = toggleFollowSchema.safeParse(parsedBody.body);
      if (!parsed.success) {
        return mobileErr("INVALID_INPUT", "ID toko tidak valid.", 400);
      }
      const { data: row, error } = await auth.context.supabase.rpc("toggle_store_follow", {
        _store_id: parsed.data.storeId,
      });
      if (error) return mobileErr("SOCIAL_ACTION_FAILED", mapSocialError(error.message), 400);
      const r = row as { following: boolean; followers: number };
      return mobileOk({ following: Boolean(r.following), followers: Number(r.followers ?? 0) });
    }

    const commerceResponse = await handleMobileCommerceRoute(request, path, method, url, {
      ok: mobileOk,
      err: mobileErr,
      readJsonBody,
      requireAuth: deps.requireAuth,
      checkPublicRateLimit: (req) => deps.checkRateLimit(req, "catalog.public"),
    });
    if (commerceResponse) return commerceResponse;

    const slice3Response = await handleMobileSlice3Route(request, path, method, url, {
      ok: mobileOk,
      okPublic: mobileOkPublic,
      err: mobileErr,
      readJsonBody,
      requireAuth: deps.requireAuth,
      checkPublicRateLimit: (req) => deps.checkRateLimit(req, "catalog.public"),
    });
    if (slice3Response) return slice3Response;

    return mobileErr("NOT_FOUND", "Endpoint tidak ditemukan.", 404);
  } catch (error) {
    if (error instanceof URIError) {
      return mobileErr("INVALID_QUERY", "Encoding URL tidak valid.", 400);
    }
    return mobileErr("SERVICE_UNAVAILABLE", "Layanan sedang tidak tersedia. Coba lagi.", 503);
  }
}
