import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "./rate-limit.server";

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
  };
  return map[clean] ?? (clean.length > 3 ? clean : "Aksi gagal diproses. Coba lagi.");
}

/* ---------------- Toko seller ---------------- */

/** Toko milik pemanggil (untuk dashboard/ops). */
export const getMyStore = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as Ctx).supabase;
    const { data, error } = await sb
      .from("stores")
      .select(
        "id, name, slug, description, logo_url, status, verification_note, suspended_reason, created_at",
      )
      .eq("owner_id", (context as Ctx).userId)
      .maybeSingle();
    if (error) return { store: null, error: "Toko tidak dapat dimuat." as const };
    return { store: data ?? null, error: null };
  });

/** Ajukan toko baru (jadi seller). */
export const applyAsSeller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
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
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(3).max(80),
        description: z.string().trim().max(1000).optional(),
        logoUrl: z.string().trim().max(500).optional().or(z.literal("")),
        contactPhone: z.string().trim().max(30).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const sb = (context as Ctx).supabase;
    const { error } = await sb
      .from("stores")
      .update({
        name: data.name,
        description: data.description || null,
        logo_url: data.logoUrl || null,
        contact_phone: data.contactPhone || null,
      })
      .eq("owner_id", (context as Ctx).userId);
    if (error) return { ok: false as const, error: "Toko gagal disimpan." };
    return { ok: true as const };
  });

/* ---------------- Produk seller ---------------- */

export const getMyProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ productId: z.string().uuid() }).parse(data))
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
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(3).max(160),
        shortDescription: z.string().trim().max(300).optional(),
        description: z.string().trim().max(5000).optional(),
        price: z.number().int().min(0).max(1_000_000_000),
        discountPrice: z.number().int().min(0).max(1_000_000_000).optional(),
        thumbnailUrl: z.string().trim().max(500).optional(),
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
  .inputValidator((data: unknown) => z.object({ productId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await (context as Ctx).supabase.rpc("submit_product_for_review", {
      _product_id: data.productId,
    });
    if (error) return { ok: false as const, error: rpcError(error.message) };
    return { ok: true as const };
  });

export const archiveMyProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ productId: z.string().uuid() }).parse(data))
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
  .inputValidator((data: unknown) =>
    z.object({ slug: z.string().trim().min(1).max(80) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { createPublicClient } = await import("./supabase-public.server");
    const supabase = createPublicClient();
    const { data: store } = await supabase
      .from("stores")
      .select("id, name, slug, description, logo_url, status")
      .eq("slug", data.slug)
      .eq("status", "active")
      .maybeSingle();
    if (!store) return { store: null, products: [], error: null };

    const { data: products } = await supabase
      .from("digital_products")
      .select("id, name, slug, short_description, thumbnail_url, price, discount_price")
      .eq("store_id", store.id)
      .eq("status", "published")
      .eq("moderation_status", "approved")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(48);

    return { store, products: products ?? [], error: null };
  });

/* ---------------- Dashboard seller: ringkasan & keuangan ---------------- */

/** Ringkasan toko: KPI, tren penjualan 30 hari, produk, rating. */
export const getSellerSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as Ctx).supabase;
    const storeId = (await sb.rpc("my_store_id")).data as string | null;
    if (!storeId) return { summary: null, error: null };

    const [balance, rating, products, ledger] = await Promise.all([
      sb.rpc("get_store_balance", { _store_id: storeId }),
      sb.rpc("store_rating_summary", { _store_id: storeId }),
      sb
        .from("digital_products")
        .select("id, status, moderation_status, sold_count")
        .eq("store_id", storeId)
        .is("deleted_at", null),
      sb
        .from("seller_ledger")
        .select("direction, amount, gross_amount, source_type, order_id, reference, created_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const prods: any[] = products.data ?? [];
    const entries: any[] = ledger.data ?? [];

    // Tren penjualan 30 hari terakhir (dari ledger 'sale').
    const days: { date: string; total: number }[] = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push({ date: d.toISOString().slice(0, 10), total: 0 });
    }
    const byDate = new Map(days.map((d) => [d.date, d]));
    for (const e of entries) {
      if (e.direction !== "credit" || e.source_type !== "sale") continue;
      const key = String(e.created_at).slice(0, 10);
      const row = byDate.get(key);
      if (row) row.total += Number(e.amount);
    }

    const salesTotal = entries
      .filter((e) => e.direction === "credit" && e.source_type === "sale")
      .reduce((s, e) => s + Number(e.amount), 0);

    return {
      summary: {
        balance: Number(balance.data ?? 0),
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
  .inputValidator((data: unknown) =>
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
    const storeId = (await sb.rpc("my_store_id")).data as string | null;
    if (!storeId) return { balance: 0, items: [], error: null };

    const [balance, ledger] = await Promise.all([
      sb.rpc("get_store_balance", { _store_id: storeId }),
      sb
        .from("seller_ledger")
        .select(
          "id, direction, amount, gross_amount, platform_fee, source_type, reference, note, created_at",
        )
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    return { balance: Number(balance.data ?? 0), items: ledger.data ?? [], error: null };
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
