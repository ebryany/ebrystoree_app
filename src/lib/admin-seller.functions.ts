import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "./rate-limit.server";
import { marketplaceOverviewSchema, marketplaceSellerSchema } from "./marketplace-report";

type Ctx = { supabase: any; userId: string };

const authz = () => import("./authz.server");

async function guard<T>(
  context: Ctx,
  permission: string,
  run: () => Promise<T>,
): Promise<T | { forbidden: true; permission: string }> {
  const helpers = await authz();
  try {
    await helpers.assertPermission(context, permission);
  } catch {
    return { forbidden: true as const, permission };
  }
  return run();
}

/** Pesan ramah untuk error RPC seller. */
function sellerError(message: string) {
  const clean = message.replace(/^.*?:\s*/, "").trim();
  const map: Record<string, string> = {
    FORBIDDEN: "Anda tidak punya izin untuk aksi ini.",
    NOT_FOUND: "Data tidak ditemukan.",
    INVALID_STATE: "Status saat ini tidak mengizinkan aksi ini.",
    REASON_REQUIRED: "Alasan minimal 5 karakter.",
    INVALID_DECISION: "Keputusan tidak valid.",
    UNAUTHENTICATED: "Sesi berakhir. Masuk ulang.",
  };
  return map[clean] ?? (clean.length > 3 ? clean : "Aksi gagal diproses.");
}

/* ---------------- Antrean & daftar seller ---------------- */

/** Daftar toko untuk admin. `status='pending'` = antrean pengajuan. */
export const listStoresForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        status: z.enum(["all", "pending", "active", "suspended", "rejected"]).default("all"),
        search: z.string().trim().max(120).default(""),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "sellers.view", async () => {
      const sb = (context as Ctx).supabase;
      const { data: rows, error } = await sb.rpc("admin_list_stores", {
        _status: data.status,
        _search: data.search || null,
      });
      if (error) return { items: [], error: "Daftar seller tidak dapat dimuat." };
      return { items: rows ?? [], error: null };
    }),
  );

/** Drill-down satu toko: profil, owner, agregat produk/order/saldo/rating. */
export const getStoreForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ storeId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "sellers.view", async () => {
      const sb = (context as Ctx).supabase;
      const { data: summary, error } = await sb.rpc("admin_store_summary", {
        _store_id: data.storeId,
      });
      if (error) return { summary: null, error: sellerError(error.message) };
      return { summary, error: null };
    }),
  );

/** Transaksi seller (read-only, kolom aman tanpa PII pembeli). */
export const listStoreOrdersForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({ storeId: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "sellers.view", async () => {
      const sb = (context as Ctx).supabase;
      const { data: rows, error } = await sb.rpc("admin_store_orders", {
        _store_id: data.storeId,
        _limit: data.limit,
      });
      if (error) return { items: [], error: "Transaksi tidak dapat dimuat." };
      return { items: rows ?? [], error: null };
    }),
  );

/** Riwayat ledger seller (read-only). */
export const listStoreLedgerForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({ storeId: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "sellers.view", async () => {
      const sb = (context as Ctx).supabase;
      const { data: rows, error } = await sb.rpc("admin_store_ledger", {
        _store_id: data.storeId,
        _limit: data.limit,
      });
      if (error) return { items: [], error: "Riwayat saldo tidak dapat dimuat." };
      return { items: rows ?? [], error: null };
    }),
  );

/* ---------------- Keputusan admin (aksi berisiko) ---------------- */

/** Setujui / tolak pengajuan seller. Wajib alasan (dipaksa RPC juga). */
export const decideSellerApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        storeId: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
        reason: z.string().trim().min(5).max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "sellers.approve", async () => {
      const sb = (context as Ctx).supabase;
      const limited = await enforceRateLimit((context as Ctx).userId, "admin.seller.decision");
      if (limited) return { ok: false as const, error: limited.error };

      const { error } = await sb.rpc("review_seller", {
        _store_id: data.storeId,
        _decision: data.decision,
        _reason: data.reason,
      });
      if (error) return { ok: false as const, error: sellerError(error.message) };
      return { ok: true as const, error: null };
    }),
  );

/** Suspend / aktifkan kembali toko. Wajib alasan. */
export const setSellerSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        storeId: z.string().uuid(),
        suspend: z.boolean(),
        reason: z.string().trim().min(5).max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "sellers.manage", async () => {
      const sb = (context as Ctx).supabase;
      const { error } = await sb.rpc("set_seller_suspended", {
        _store_id: data.storeId,
        _suspend: data.suspend,
        _reason: data.reason,
      });
      if (error) return { ok: false as const, error: sellerError(error.message) };
      return { ok: true as const, error: null };
    }),
  );

/** Setujui / tolak produk seller (moderasi). Wajib alasan. */
export const decideProductModeration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        productId: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
        reason: z.string().trim().min(5).max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) =>
    guard(context as Ctx, "products.update", async () => {
      const sb = (context as Ctx).supabase;
      const { error } = await sb.rpc("review_product", {
        _product_id: data.productId,
        _decision: data.decision,
        _reason: data.reason,
      });
      if (error) return { ok: false as const, error: sellerError(error.message) };
      return { ok: true as const, error: null };
    }),
  );

/** Ringkasan marketplace untuk laporan admin (dari sumber transaksi nyata). */
export const getMarketplaceOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    guard(context as Ctx, "sellers.view", async () => {
      const sb = (context as Ctx).supabase;
      const { data: overview, error } = await sb.rpc("admin_marketplace_overview");
      const parsedOverview = marketplaceOverviewSchema.safeParse(overview);
      if (error || !parsedOverview.success) {
        return {
          overview: null,
          leaderboard: [],
          leaderboardError: null,
          error: "Laporan tidak dapat dimuat. Silakan coba lagi.",
        };
      }

      const { data: leaderboard, error: leaderboardError } = await sb.rpc(
        "admin_seller_leaderboard",
        { _limit: 10 },
      );
      const parsedLeaderboard = z.array(marketplaceSellerSchema).safeParse(leaderboard);
      return {
        overview: parsedOverview.data,
        leaderboard: !leaderboardError && parsedLeaderboard.success ? parsedLeaderboard.data : [],
        leaderboardError:
          leaderboardError || !parsedLeaderboard.success
            ? "Performa seller belum dapat dimuat. Silakan perbarui data."
            : null,
        error: null,
      };
    }),
  );

/** Produk yang menunggu moderasi, lintas seller. */
export const listPendingProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    guard(context as Ctx, "products.view", async () => {
      const sb = (context as Ctx).supabase;
      const { data: rows, error } = await sb
        .from("digital_products")
        .select(
          "id, name, slug, price, discount_price, thumbnail_url, status, moderation_status, created_at, store_id, stores(name, slug, status)",
        )
        .eq("moderation_status", "pending")
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) return { items: [], error: "Antrean moderasi tidak dapat dimuat." };
      return { items: rows ?? [], error: null };
    }),
  );
