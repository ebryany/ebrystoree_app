import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "./rate-limit.server";

type Ctx = { supabase: any; userId: string };

const SOCIAL_ERRORS: Record<string, string> = {
  AUTH_REQUIRED: "Masuk dulu untuk melanjutkan.",
  STORE_NOT_FOUND: "Toko tidak ditemukan.",
  OWN_STORE: "Kamu tidak bisa mengikuti tokomu sendiri.",
  PRODUCT_NOT_FOUND: "Produk tidak ditemukan.",
};

function socialError(message: string | undefined) {
  const key = Object.keys(SOCIAL_ERRORS).find((k) => message?.includes(k));
  return key ? SOCIAL_ERRORS[key] : "Permintaan gagal. Coba lagi.";
}

export type StoreSocial = {
  followers: number;
  likes: number;
  rating_average: number;
  rating_total: number;
};

/** Agregat publik toko: pengikut, total suka produk, rating. */
export const getStoreSocial = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ storeId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { createPublicClient } = await import("./supabase-public.server");
    const { data: row, error } = await createPublicClient().rpc("store_social_summary", {
      _store_id: data.storeId,
    });
    if (error || !row) return { social: null as StoreSocial | null };
    const r = row as Record<string, unknown>;
    return {
      social: {
        followers: Number(r.followers ?? 0),
        likes: Number(r.likes ?? 0),
        rating_average: Number(r.rating_average ?? 0),
        rating_total: Number(r.rating_total ?? 0),
      } as StoreSocial | null,
    };
  });

export const getProductLikes = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ productId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { createPublicClient } = await import("./supabase-public.server");
    const { data: row } = await createPublicClient().rpc("product_like_summary", {
      _product_id: data.productId,
    });
    return { likes: Number((row as { likes?: number } | null)?.likes ?? 0) };
  });

/** Status milik pemanggil (ikuti/suka); dibaca dari baris miliknya sendiri (RLS). */
export const getMySocialState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({ storeId: z.string().uuid().optional(), productId: z.string().uuid().optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const [follow, like] = await Promise.all([
      data.storeId
        ? supabase
            .from("store_follows")
            .select("store_id")
            .eq("user_id", userId)
            .eq("store_id", data.storeId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      data.productId
        ? supabase
            .from("product_likes")
            .select("product_id")
            .eq("user_id", userId)
            .eq("product_id", data.productId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    return { following: Boolean(follow.data), liked: Boolean(like.data) };
  });

export const toggleStoreFollow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ storeId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const limited = await enforceRateLimit(userId, "social.toggle");
    if (limited) return { ok: false as const, error: limited.error };
    const { data: row, error } = await supabase.rpc("toggle_store_follow", {
      _store_id: data.storeId,
    });
    if (error) return { ok: false as const, error: socialError(error.message) };
    const r = row as { following: boolean; followers: number };
    return { ok: true as const, following: r.following, followers: Number(r.followers) };
  });

export const toggleProductLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ productId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const limited = await enforceRateLimit(userId, "social.toggle");
    if (limited) return { ok: false as const, error: limited.error };
    const { data: row, error } = await supabase.rpc("toggle_product_like", {
      _product_id: data.productId,
    });
    if (error) return { ok: false as const, error: socialError(error.message) };
    const r = row as { liked: boolean; likes: number };
    return { ok: true as const, liked: r.liked, likes: Number(r.likes) };
  });

/** Dashboard: toko yang diikuti + produk yang disukai pemanggil. */
export const listMyFollowsAndLikes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { readPresenceMap } = await import("./store-presence");
    const [follows, likes, presence] = await Promise.all([
      supabase
        .from("store_follows")
        .select("created_at, stores(id, name, slug, logo_url, is_platform)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("product_likes")
        .select(
          "created_at, digital_products(id, name, slug, short_description, thumbnail_url, price, discount_price, store_id)",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      readPresenceMap(supabase),
    ]);
    if (follows.error || likes.error) {
      return { stores: [], products: [], error: "Daftar belum dapat dimuat." as const };
    }
    return {
      // Baris yang target-nya tidak lagi publik (RLS) muncul sebagai null: dibuang.
      stores: (follows.data ?? [])
        .map((r: any) => r.stores)
        .filter(Boolean)
        .map((s: any) => ({ ...s, presence: presence.get(s.id) })) as Array<{
        id: string;
        name: string;
        slug: string;
        logo_url: string | null;
        is_platform: boolean;
        presence: import("./store-presence").StorePresence;
      }>,
      products: (likes.data ?? []).map((r: any) => r.digital_products).filter(Boolean) as Array<{
        id: string;
        name: string;
        slug: string;
        short_description: string | null;
        thumbnail_url: string | null;
        price: number;
        discount_price: number | null;
        store_id: string | null;
      }>,
      error: null,
    };
  });

/** Slug produk dari id; dipakai tautan notifikasi "produk baru". */
export const getProductSlugById = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { createPublicClient } = await import("./supabase-public.server");
    const { data: row } = await createPublicClient()
      .from("digital_products")
      .select("slug")
      .eq("id", data.id)
      .maybeSingle();
    return { slug: (row?.slug as string | undefined) ?? null };
  });
