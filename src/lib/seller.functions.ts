import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "./rate-limit.server";
import { isRenderableImageUrl } from "./utils";

type Ctx = { supabase: any; userId: string };

function rpcError(message: string) {
  const clean = message.replace(/^.*?:\s*/, "").trim();
  const map: Record<string, string> = {
    SLUG_TAKEN: "Slug toko sudah dipakai. Pilih nama lain.",
    NAME_REQUIRED: "Nama toko minimal 3 karakter.",
    SLUG_INVALID: "Slug toko tidak valid.",
    NO_STORE: "Anda belum memiliki toko aktif.",
    INVALID_STATE: "Status saat ini tidak mengizinkan aksi ini.",
    REASON_REQUIRED: "Alasan minimal 5 karakter.",
    FORBIDDEN: "Anda tidak punya izin untuk aksi ini.",
    NOT_FOUND: "Data tidak ditemukan.",
    NO_CREDIT: "Saldo tidak cukup.",
    STORE_INACTIVE: "Toko belum aktif atau sedang ditangguhkan.",
    FEATURE_DISABLED: "Fitur penarikan saldo belum diaktifkan.",
    BANK_ACCOUNT_REQUIRED: "Daftarkan rekening pencairan terlebih dahulu.",
    INVALID_BANK_ACCOUNT:
      "Data rekening tidak valid (bank 2-60 karakter, nomor 6-25 digit, pemilik 2-100 karakter).",
    INVALID_AMOUNT: "Nominal penarikan tidak valid.",
    BELOW_MINIMUM: "Nominal di bawah minimum penarikan.",
    INSUFFICIENT_BALANCE: "Saldo tersedia tidak mencukupi.",
    INVALID_IDEMPOTENCY_KEY: "Permintaan tidak valid. Muat ulang halaman lalu coba lagi.",
    INVALID_DECISION: "Keputusan tidak valid.",
    REFERENCE_REQUIRED: "Referensi transfer wajib diisi (minimal 3 karakter).",
    SELF_APPROVAL_FORBIDDEN: "Pemilik toko tidak boleh memproses payout toko sendiri.",
  };
  return map[clean] ?? (clean.length > 3 ? clean : "Aksi gagal diproses. Coba lagi.");
}

/* ---------------- Toko seller ---------------- */

const uploadImagePayload = z
  .object({ name: z.string().min(1).max(200), data: z.string().min(1).max(4_200_000) })
  .strict();

/** Unggah thumbnail produk ke bucket catalog-images milik toko sendiri. */
export const uploadProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => uploadImagePayload.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const limited = await enforceRateLimit(ctx.userId, "seller.product");
    if (limited) return { ok: false as const, error: limited.error };
    const { data: store } = await ctx.supabase
      .from("stores")
      .select("id, status")
      .eq("owner_id", ctx.userId)
      .maybeSingle();
    if (!store || store.status !== "active")
      return { ok: false as const, error: "Toko aktif diperlukan untuk mengunggah gambar." };
    const { persistCatalogImage } = await import("./banner-upload.server");
    const result = await persistCatalogImage(data.data, `products/${store.id}`);
    if (!result.ok) return { ok: false as const, error: result.error };
    return { ok: true as const, url: result.url };
  });

/** Unggah logo atau banner toko ke bucket catalog-images milik toko sendiri. */
export const uploadStoreAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        data: z.string().min(1).max(4_200_000),
        kind: z.enum(["logo", "banner"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const limited = await enforceRateLimit(ctx.userId, "seller.product");
    if (limited) return { ok: false as const, error: limited.error };
    const { data: store } = await ctx.supabase
      .from("stores")
      .select("id, status")
      .eq("owner_id", ctx.userId)
      .maybeSingle();
    if (!store || store.status !== "active")
      return { ok: false as const, error: "Toko aktif diperlukan untuk mengunggah gambar." };
    const { persistCatalogImage } = await import("./banner-upload.server");
    const result = await persistCatalogImage(data.data, `stores/${store.id}/${data.kind}`);
    if (!result.ok) return { ok: false as const, error: result.error };
    return { ok: true as const, url: result.url };
  });

/** Kategori platform untuk produk digital (form tambah produk). */
export const listProductCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context as Ctx).supabase
      .from("categories")
      .select("id, name")
      .eq("kind", "product")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order")
      .order("id");
    if (error) return { items: [], error: "Kategori tidak dapat dimuat." as const };
    return { items: data as { id: string; name: string }[], error: null };
  });

/** Toko milik pemanggil (untuk dashboard/ops). */
export const getMyStore = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as Ctx).supabase;
    const { data, error } = await sb
      .from("stores")
      .select(
        "id, name, slug, description, logo_url, banner_url, banner_position, status, verification_note, suspended_reason, created_at",
      )
      .eq("owner_id", (context as Ctx).userId)
      .maybeSingle();
    if (error) return { store: null, error: "Toko tidak dapat dimuat." as const };
    return { store: data ?? null, error: null };
  });

/** Ajukan toko baru (jadi seller). */
export const applyAsSeller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(3).max(80),
        slug: z.string().trim().min(3).max(60).optional(),
        description: z.string().trim().max(1000).optional(),
        contactPhone: z.string().trim().max(30).optional(),
        contactEmail: z.string().trim().email().max(160).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const limited = await enforceRateLimit((context as Ctx).userId, "order.create");
    if (limited) return { ok: false as const, error: limited.error };
    const { data: result, error } = await (context as Ctx).supabase.rpc("apply_as_seller", {
      _name: data.name,
      _slug: data.slug ?? null,
      _description: data.description ?? null,
      _contact_phone: data.contactPhone ?? null,
      _contact_email: data.contactEmail ?? null,
    });
    if (error) return { ok: false as const, error: rpcError(error.message) };
    return {
      ok: true as const,
      ...(result as { store_id: string; status: string; duplicate: boolean }),
    };
  });

/** Perbarui profil toko sendiri. */
export const updateMyStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(3).max(80),
        description: z.string().trim().max(1000).optional(),
        logoUrl: z.string().trim().max(500).optional().or(z.literal("")),
        bannerUrl: z.string().trim().max(500).optional().or(z.literal("")),
        bannerPosition: z.number().int().min(0).max(100).optional(),
        contactPhone: z.string().trim().max(30).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const sb = (context as Ctx).supabase;
    // Validasi URL gambar dengan penjaga yang sama seperti thumbnail produk:
    // menolak skema berbahaya (javascript:, data:) dan path proxy yang cacat.
    const logoUrl = data.logoUrl ? data.logoUrl : "";
    const bannerUrl = data.bannerUrl ? data.bannerUrl : "";
    for (const [label, value] of [
      ["Logo", logoUrl],
      ["Banner", bannerUrl],
    ] as const) {
      if (value && !isRenderableImageUrl(value))
        return { ok: false as const, error: `${label} toko bukan gambar yang valid.` };
    }
    const { error } = await sb
      .from("stores")
      .update({
        name: data.name,
        description: data.description || null,
        logo_url: logoUrl || null,
        banner_url: bannerUrl || null,
        ...(data.bannerPosition === undefined ? {} : { banner_position: data.bannerPosition }),
        contact_phone: data.contactPhone || null,
      })
      .eq("owner_id", (context as Ctx).userId);
    if (error) return { ok: false as const, error: "Toko gagal disimpan." };
    return { ok: true as const };
  });

/* ---------------- Produk seller ---------------- */

export const getMyProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ productId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const sb = (context as Ctx).supabase;
    const storeId = (await sb.rpc("my_store_id")).data as string | null;
    if (!storeId) return { product: null };
    const { data: product } = await sb
      .from("digital_products")
      .select(
        "id, name, slug, short_description, description, price, discount_price, status, moderation_status, moderation_note, thumbnail_url, delivery_mode, available_stock, created_at",
      )
      .eq("id", data.productId)
      .eq("store_id", storeId)
      .is("deleted_at", null)
      .maybeSingle();
    return { product: product ?? null };
  });

export const listMyStoreProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as Ctx).supabase;
    const storeId = await sb.rpc("my_store_id");
    if (!storeId.data) return { items: [], error: null };
    const { data, error } = await sb
      .from("digital_products")
      .select(
        "id, name, slug, price, discount_price, status, moderation_status, moderation_note, thumbnail_url, delivery_mode, available_stock, created_at",
      )
      .eq("store_id", storeId.data)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) return { items: [], error: "Produk tidak dapat dimuat." as const };
    return { items: data ?? [], error: null };
  });

export const saveMyProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(3).max(160),
        shortDescription: z.string().trim().max(300).optional(),
        description: z.string().trim().max(5000).optional(),
        price: z.number().int().min(0).max(1_000_000_000),
        discountPrice: z.number().int().min(0).max(1_000_000_000).optional(),
        thumbnailUrl: z
          .string()
          .trim()
          .max(500)
          .refine((value) => value === "" || isRenderableImageUrl(value), {
            message: "Gambar tidak valid",
          })
          .optional(),
        downloadLimit: z.number().int().min(1).max(100).default(5),
        validityDays: z.number().int().min(1).max(3650).default(365),
        categoryId: z.string().uuid().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const sb = (context as Ctx).supabase;
    const storeId = (await sb.rpc("my_store_id")).data as string | null;
    if (!storeId) return { ok: false as const, error: "Anda belum memiliki toko." };

    const slugBase = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);

    const payload: Record<string, unknown> = {
      store_id: storeId,
      name: data.name,
      short_description: data.shortDescription || null,
      description: data.description || null,
      price: data.price,
      discount_price: data.discountPrice ?? null,
      thumbnail_url: data.thumbnailUrl || null,
      download_limit: data.downloadLimit,
      validity_days: data.validityDays,
      category_id: data.categoryId ?? null,
    };

    if (data.id) {
      const { error } = await sb.from("digital_products").update(payload).eq("id", data.id);
      if (error) return { ok: false as const, error: "Produk gagal disimpan." };
      return { ok: true as const, id: data.id };
    }

    // Slug unik: tambahkan sufiks acak bila bentrok.
    const slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
    payload.slug = slug;
    payload.status = "draft";
    payload.moderation_status = "pending";

    const { data: row, error } = await sb
      .from("digital_products")
      .insert(payload)
      .select("id")
      .maybeSingle();
    if (error || !row) return { ok: false as const, error: "Produk gagal dibuat." };
    return { ok: true as const, id: row.id as string };
  });

export const submitMyProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ productId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await (context as Ctx).supabase.rpc("submit_product_for_review", {
      _product_id: data.productId,
    });
    if (error) return { ok: false as const, error: rpcError(error.message) };
    return { ok: true as const };
  });

export const archiveMyProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ productId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin;
    const userId = (context as Ctx).userId;

    const { data: product } = await sb
      .from("digital_products")
      .select("id, store_id, stores!inner(owner_id)")
      .eq("id", data.productId)
      .maybeSingle();

    if (!product || (product as any).stores?.owner_id !== userId) {
      return { ok: false as const, error: "Produk tidak ditemukan atau bukan milik Anda." };
    }

    const { error } = await sb
      .from("digital_products")
      .update({ status: "archived", deleted_at: new Date().toISOString() })
      .eq("id", data.productId);
    if (error) {
      console.error("[archiveMyProduct] error:", error.message);
      return { ok: false as const, error: "Produk gagal dihapus." };
    }
    return { ok: true as const };
  });

/* ---------------- Storefront publik ---------------- */

export const getPublicStore = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ slug: z.string().trim().min(1).max(80) }).parse(data))
  .handler(async ({ data }) => {
    const { createPublicClient } = await import("./supabase-public.server");
    const supabase = createPublicClient();
    const empty = {
      store: null,
      products: [] as any[],
      services: [] as any[],
      rating: { average: 0, total: 0 },
      soldCount: 0,
      error: null,
    };
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select(
        "id, name, slug, description, logo_url, banner_url, banner_position, status, contact_phone, created_at, is_platform",
      )
      .eq("slug", data.slug)
      .eq("status", "active")
      .maybeSingle();
    if (storeError) {
      return { ...empty, error: "Toko tidak dapat dimuat." as const };
    }
    if (!store) return empty;

    // Kepemilikan dihitung di server, bukan dengan mengirim owner_id ke klien:
    // halaman toko publik tidak boleh membawa id pemilik sama sekali. Pemanggil
    // anonim tidak punya sesi, jadi hasilnya false tanpa perlu query tambahan.
    let isOwner = false;
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const request = getRequest();
      const authHeader = request?.headers?.get("authorization") ?? "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (token) {
        const { createClient } = await import("@supabase/supabase-js");
        const url = process.env["SUPABASE_URL"];
        const anonKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (url && anonKey) {
          const asUser = createClient(url, anonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const {
            data: { user },
          } = await asUser.auth.getUser();
          if (!user) {
            isOwner = false;
          } else {
            const { data: store } = await asUser
              .from("stores")
              .select("owner_id")
              .eq("slug", data.slug)
              .eq("status", "active")
              .maybeSingle();
            // Bandingkan owner_id dengan user saat ini secara eksplisit.
            // RLS stores_select_staff (has_permission 'sellers.view') memang
            // mengizinkan admin membaca semua toko untuk moderasi — karena itu
            // keberhasilan SELECT TIDAK boleh dipakai sebagai sinyal ownership.
            isOwner = store?.owner_id === user.id;
          }
        }
      }
    } catch {
      // Kepemilikan bersifat opsional (hanya untuk tombol Edit toko).
      // Kegagalan di sini tidak boleh menggagalkan halaman toko.
      isOwner = false;
    }

    // Produk, jasa, rating, dan jumlah terjual diambil paralel; masing-masing
    // gagal secara terpisah supaya satu error tidak mengosongkan seluruh halaman.
    // Toko resmi juga menaungi produk platform (store_id NULL).
    const ownerFilter = store.is_platform
      ? `store_id.eq.${store.id},store_id.is.null`
      : `store_id.eq.${store.id}`;
    const [productsResult, ratingResult, soldResult] = await Promise.all([
      supabase
        .from("digital_products")
        .select(
          "id, name, slug, short_description, thumbnail_url, price, discount_price, sold_count",
        )
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
    ]);

    const { readPublicStoreServices } = await import("./marketplace-service-catalog.server");
    const { readStoreOnline } = await import("./store-presence");
    const [servicesResult, online] = await Promise.all([
      readPublicStoreServices(store.id),
      readStoreOnline(supabase, store.id),
    ]);

    if (productsResult.error) {
      return { ...empty, store, error: "Produk toko tidak dapat dimuat." as const };
    }

    const products = productsResult.data ?? [];
    const hasMoreProducts = products.length > 48;
    const rating = (ratingResult.data ?? { average: 0, total: 0 }) as {
      average: number;
      total: number;
    };
    const soldCount = (soldResult.data ?? []).reduce(
      (sum, row) => sum + Number((row as { sold_count?: number }).sold_count ?? 0),
      0,
    );

    return {
      store: { ...store, online },
      products: products.slice(0, 48),
      hasMoreProducts,
      services: servicesResult.items,
      servicesError: servicesResult.error,
      rating: { average: Number(rating.average) || 0, total: Number(rating.total) || 0 },
      soldCount,
      isOwner,
      error: null,
    };
  });

/* ---------------- Dashboard seller: ringkasan & keuangan ---------------- */

/** Ringkasan toko: KPI, tren penjualan 30 hari, produk, rating. */
export const getSellerSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as Ctx).supabase;
    const store = await sb.rpc("my_store_id");
    if (store.error) return { summary: null, error: "Ringkasan toko tidak dapat dimuat." };
    const storeId = store.data as string | null;
    if (!storeId) return { summary: null, error: null };

    const [balance, rating, products] = await Promise.all([
      sb.rpc("get_store_finances", { _store_id: storeId }),
      sb.rpc("store_rating_summary", { _store_id: storeId }),
      sb
        .from("digital_products")
        .select("id, status, moderation_status, sold_count")
        .eq("store_id", storeId)
        .is("deleted_at", null),
    ]);

    if (balance.error || !balance.data || products.error || rating.error)
      return { summary: null, error: "Ringkasan toko tidak dapat dimuat." };
    const finances = balance.data as {
      available_balance: number;
      held_receipt: number;
      refund_reserved: number;
      released_total: number;
      released_trend: { date: string; total: number }[];
    };
    const prods: any[] = products.data ?? [];

    // Tren penjualan 30 hari terakhir (dari ledger 'sale').
    const days: { date: string; total: number }[] = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      days.push({ date: d.toISOString().slice(0, 10), total: 0 });
    }
    const byDate = new Map(days.map((d) => [d.date, d]));
    for (const entry of finances.released_trend) {
      const row = byDate.get(entry.date);
      if (row) row.total = Number(entry.total);
    }

    const salesTotal = Number(finances.released_total);

    return {
      summary: {
        balance: Number(finances.available_balance),
        held: Number(finances.held_receipt),
        reserved: Number(finances.refund_reserved),
        rating: Number((rating.data as any)?.average ?? 0),
        ratingCount: Number((rating.data as any)?.total ?? 0),
        productTotal: prods.length,
        productPublished: prods.filter((p) => p.status === "published").length,
        productPending: prods.filter((p) => p.moderation_status === "pending").length,
        soldCount: prods.reduce((s, p) => s + Number(p.sold_count ?? 0), 0),
        salesTotal,
        trend: days,
      },
      error: null,
    };
  });

/** Pesanan yang masuk ke toko. */
export const listSellerOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ filter: z.string().max(20).default("all") }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const sb = (context as Ctx).supabase;

    // RPC SECURITY DEFINER: seller tidak boleh membaca tabel `orders` langsung
    // (memuat PII pembeli), jadi kolom aman diambil lewat fungsi yang sudah
    // di-scope ke my_store_id().
    const { data: rows, error } = await sb.rpc("list_my_store_orders", { _filter: data.filter });

    if (error) return { items: [], error: "Pesanan tidak dapat dimuat." as const };

    return { items: rows ?? [], error: null };
  });

/** Ulasan yang masuk ke toko (untuk menu Performa). */
export const listStoreReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as Ctx).supabase;
    const storeId = (await sb.rpc("my_store_id")).data as string | null;
    if (!storeId) return { items: [], rating: 0, ratingCount: 0, error: null };

    const [rows, rating] = await Promise.all([
      sb
        .from("product_reviews")
        .select("id, product_id, rating, title, body, created_at, digital_products(name)")
        .eq("store_id", storeId)
        .eq("is_visible", true)
        .order("created_at", { ascending: false })
        .limit(100),
      sb.rpc("store_rating_summary", { _store_id: storeId }),
    ]);

    if (rows.error)
      return { items: [], rating: 0, ratingCount: 0, error: "Ulasan tidak dapat dimuat." as const };

    return {
      items: rows.data ?? [],
      rating: Number((rating.data as any)?.average ?? 0),
      ratingCount: Number((rating.data as any)?.total ?? 0),
      error: null,
    };
  });

/** Riwayat saldo (ledger) toko. */
export const listSellerLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as Ctx).supabase;
    const store = await sb.rpc("my_store_id");
    if (store.error)
      return {
        balance: 0,
        held: 0,
        reserved: 0,
        items: [],
        error: "Saldo toko tidak dapat dimuat.",
      };
    const storeId = store.data as string | null;
    if (!storeId) return { balance: 0, held: 0, reserved: 0, items: [], error: null };

    const [balance, ledger] = await Promise.all([
      sb.rpc("get_store_finances", { _store_id: storeId }),
      sb
        .from("seller_ledger")
        .select(
          "id, direction, amount, gross_amount, platform_fee, source_type, reference, note, created_at",
        )
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (balance.error || !balance.data || ledger.error)
      return {
        balance: 0,
        held: 0,
        reserved: 0,
        items: [],
        error: "Saldo toko tidak dapat dimuat.",
      };
    const finances = balance.data as {
      available_balance: number;
      held_receipt: number;
      refund_reserved: number;
      released_total: number;
    };
    return {
      balance: Number(finances.available_balance),
      held: Number(finances.held_receipt),
      reserved: Number(finances.refund_reserved),
      items: ledger.data ?? [],
      error: null,
    };
  });

/* ---------------- Penarikan saldo (payout) ---------------- */

type WithdrawalPolicy = {
  has_store: boolean;
  feature_enabled: boolean;
  min_payout?: number;
  fee_bps?: number;
  bank?: {
    bank_name: string;
    account_number: string;
    account_holder_name: string;
    account_number_masked: string;
    updated_at: string;
  } | null;
};

type WithdrawalRow = {
  id: string;
  withdrawal_number: string;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
  status: string;
  bank_name: string;
  bank_account_masked: string;
  decision_note: string | null;
  created_at: string;
  completed_at: string | null;
};

/** Kebijakan penarikan aktif + rekening terdaftar untuk seller ini. */
export const getWithdrawalPolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as Ctx).supabase;
    const { data, error } = await sb.rpc("get_my_withdrawal_policy");
    if (error) return { policy: null, error: rpcError(error.message) };
    return { policy: data as WithdrawalPolicy, error: null };
  });

/** Riwayat pengajuan penarikan milik toko sendiri (RLS membatasi baris). */
export const listMyWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as Ctx).supabase;
    const store = await sb.rpc("my_store_id");
    if (store.error) return { items: [] as WithdrawalRow[], error: rpcError(store.error.message) };
    const storeId = store.data as string | null;
    if (!storeId) return { items: [] as WithdrawalRow[], error: null };

    const { data, error } = await sb
      .from("withdrawals")
      .select(
        "id, withdrawal_number, gross_amount, fee_amount, net_amount, status, bank_name, bank_account_number, decision_note, created_at, completed_at",
      )
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) return { items: [] as WithdrawalRow[], error: "Riwayat penarikan gagal dimuat." };
    const items: WithdrawalRow[] = (data ?? []).map((w: any) => ({
      id: w.id,
      withdrawal_number: w.withdrawal_number,
      gross_amount: Number(w.gross_amount),
      fee_amount: Number(w.fee_amount),
      net_amount: Number(w.net_amount),
      status: w.status,
      bank_name: w.bank_name,
      bank_account_masked: "****" + String(w.bank_account_number).replace(/[ -]/g, "").slice(-4),
      decision_note: w.decision_note,
      created_at: w.created_at,
      completed_at: w.completed_at,
    }));
    return { items, error: null };
  });

const bankAccountPayload = z
  .object({
    bank_name: z.string().trim().min(2).max(60),
    account_number: z
      .string()
      .trim()
      .regex(/^[0-9][0-9 -]{4,28}[0-9]$/, "Nomor rekening harus 6-25 digit."),
    account_holder_name: z.string().trim().min(2).max(100),
  })
  .strict();

/** Daftar / perbarui rekening pencairan (pemilik toko, lewat RPC ber-audit). */
export const saveSellerBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => bankAccountPayload.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const limited = await enforceRateLimit(ctx.userId, "seller.payout");
    if (limited) return { ok: false as const, error: limited.error };
    const { data: res, error } = await ctx.supabase.rpc("save_seller_bank_account", {
      _bank_name: data.bank_name,
      _account_number: data.account_number,
      _account_holder_name: data.account_holder_name,
    });
    if (error) return { ok: false as const, error: rpcError(error.message) };
    return { ok: true as const, account_masked: (res as any)?.account_masked ?? null, error: null };
  });

const withdrawalRequestPayload = z
  .object({
    gross_amount: z.number().int().min(1).max(2_000_000_000_000),
    idempotency_key: z.string().min(8).max(80),
  })
  .strict();

/** Ajukan penarikan. Server (RPC) menghitung ulang fee dan mengunci saldo secara atomik. */
export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => withdrawalRequestPayload.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const limited = await enforceRateLimit(ctx.userId, "seller.payout");
    if (limited) return { ok: false as const, error: limited.error };
    const { data: res, error } = await ctx.supabase.rpc("request_withdrawal", {
      _gross_amount: data.gross_amount,
      _idempotency_key: data.idempotency_key,
    });
    if (error) return { ok: false as const, error: rpcError(error.message) };
    return { ok: true as const, withdrawal: res, error: null };
  });

const withdrawalCancelPayload = z.object({ withdrawal_id: z.string().uuid() }).strict();

/** Batalkan pengajuan milik sendiri sebelum transfer (reservasi dikembalikan server). */
export const cancelWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => withdrawalCancelPayload.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const limited = await enforceRateLimit(ctx.userId, "seller.payout");
    if (limited) return { ok: false as const, error: limited.error };
    const { error } = await ctx.supabase.rpc("cancel_own_withdrawal", {
      _withdrawal_id: data.withdrawal_id,
    });
    if (error) return { ok: false as const, error: rpcError(error.message) };
    return { ok: true as const, error: null };
  });

/* ---------------- Inventori seller ---------------- */

export const getMyInventorySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as Ctx).supabase;
    const { data, error } = await sb.rpc("get_my_inventory_summary");
    if (error) return { summary: null, error: rpcError(error.message) };
    return {
      summary: data as {
        total_products: number;
        out_of_stock: number;
        low_stock: number;
        threshold: number;
      },
      error: null,
    };
  });

export const listLowStockProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as Ctx).supabase;
    const { data, error } = await sb.rpc("get_my_low_stock_products", { _limit: 20 });
    if (error) return { items: [], error: rpcError(error.message) };
    return {
      items: (data ?? []) as {
        product_id: string;
        product_name: string;
        delivery_mode: string;
        available_stock: number;
        moderation_status: string;
        status: string;
      }[],
      error: null,
    };
  });
