import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PublicReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  reviewer_name: string | null;
  created_at: string;
  product: { name: string; slug: string; thumbnail_url: string | null } | null;
  /** Toko tempat pembelian; dipakai pita review di home. */
  store: { name: string; slug: string } | null;
};

/** Ulasan terbaru untuk etalase publik (Home). */
export const listRecentReviews = createServerFn({ method: "GET" }).handler(async () => {
  const { createPublicClient } = await import("./supabase-public.server");
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("product_reviews")
    .select(
      "id, rating, title, body, reviewer_name, created_at, digital_products(name, slug, thumbnail_url), stores(name, slug)",
    )
    .eq("is_visible", true)
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) {
    console.error("[reviews] listRecentReviews gagal:", error.message);
    return {
      items: [] as PublicReview[],
      average: 0,
      total: 0,
      error: "Ulasan sedang tidak dapat dimuat." as const,
    };
  }

  const items: PublicReview[] = (data ?? []).map((row) => ({
    id: row.id,
    rating: Number(row.rating),
    title: row.title,
    body: row.body,
    reviewer_name: row.reviewer_name,
    created_at: row.created_at,
    product: (row as { digital_products?: PublicReview["product"] }).digital_products ?? null,
    store: (row as { stores?: PublicReview["store"] }).stores ?? null,
  }));

  const total = items.length;
  const average = total ? items.reduce((sum, r) => sum + r.rating, 0) / total : 0;
  return { items, average, total, error: null };
});

/** Ulasan untuk satu produk (publik). */
export const listProductReviews = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ productId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { createPublicClient } = await import("./supabase-public.server");
    const supabase = createPublicClient();

    const { data: rows, error } = await supabase
      .from("product_reviews")
      .select("id, rating, title, body, reviewer_name, created_at")
      .eq("product_id", data.productId)
      .eq("is_visible", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[reviews] listProductReviews gagal:", error.message);
      return {
        items: [],
        average: 0,
        total: 0,
        error: "Ulasan sedang tidak dapat dimuat." as const,
      };
    }

    const items = rows ?? [];
    const total = items.length;
    const average = total ? items.reduce((sum, r) => sum + Number(r.rating), 0) / total : 0;
    return { items, average, total, error: null };
  });

/** Apakah pemanggil boleh memberi ulasan, dan ulasan miliknya saat ini. */
export const getMyReviewState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ productId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: purchase }, { data: mine }] = await Promise.all([
      supabase
        .from("order_items")
        .select("id, orders!inner(status, user_id)")
        .eq("product_id", data.productId)
        .eq("orders.user_id", userId)
        .in("orders.status", ["paid", "processing", "delivered", "completed"])
        .limit(1)
        .maybeSingle(),
      supabase
        .from("product_reviews")
        .select("id, rating, title, body")
        .eq("product_id", data.productId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    return { canReview: Boolean(purchase), myReview: mine ?? null };
  });

export const submitProductReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        productId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        title: z.string().trim().max(120).optional(),
        body: z.string().trim().max(1000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("submit_product_review", {
      _product_id: data.productId,
      _rating: data.rating,
      _title: data.title,
      _body: data.body,
    });
    if (error) {
      console.error("[reviews] submitProductReview gagal:", error.message);
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const, error: null };
  });
