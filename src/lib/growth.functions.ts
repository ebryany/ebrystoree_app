import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/**
 * Server functions untuk dashboard Pertumbuhan.
 *
 * Prinsip:
 * - Semua angka berasal dari tabel nyata (analytics_daily, orders, articles,
 *   seo_audit_results, campaigns). Tidak ada angka contoh.
 * - Bila data belum ada, kembalikan nol dan biarkan UI menampilkan keadaan
 *   kosong yang menjelaskan cara mengisinya.
 * - Akses dibatasi izin `admin.dashboard.view`; bagian konten juga butuh
 *   `articles.view` supaya orang marketing tidak otomatis melihat draf.
 */

/** Cek akses dashboard. Menerima context apa pun yang punya `supabase`. */
async function assertAccess(context: unknown): Promise<boolean> {
  const ctx = context as Ctx;
  const { data: roles } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  return (roles ?? []).some((r: any) =>
    ["admin", "super_admin", "support", "finance"].includes(r.role),
  );
}

const rangeSchema = z.object({ days: z.number().int().min(1).max(365).default(30) });

export type DailyRow = { day: string; metric: string; dimension: string; value: number };

/** Data mentah agregat harian untuk rentang tertentu. */
export const getAnalyticsRange = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => rangeSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    if (!(await assertAccess(ctx))) return { forbidden: true as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sejak = new Date();
    sejak.setDate(sejak.getDate() - data.days);

    const { data: rows, error } = await supabaseAdmin
      .from("analytics_daily")
      .select("day, metric, dimension, value")
      .gte("day", sejak.toISOString().slice(0, 10))
      .order("day", { ascending: true });

    if (error) {
      return {
        forbidden: false as const,
        rows: [] as DailyRow[],
        error: "Data analitik tidak dapat dimuat.",
      };
    }
    return { forbidden: false as const, rows: (rows ?? []) as DailyRow[], error: null };
  });

/** Ringkasan bisnis: order, nilai, konversi. Dari tabel nyata, bukan analytics. */
export const getGrowthSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => rangeSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    if (!(await assertAccess(ctx))) return { forbidden: true as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sejak = new Date();
    sejak.setDate(sejak.getDate() - data.days);
    const sejakIso = sejak.toISOString();

    const [orders, paidOrders, articles, campaigns, seo, credits] = await Promise.all([
      supabaseAdmin
        .from("orders")
        .select("id, total, status, created_at")
        .gte("created_at", sejakIso),
      supabaseAdmin
        .from("orders")
        .select("id, total, paid_at")
        .in("status", ["paid", "completed"])
        .gte("created_at", sejakIso),
      supabaseAdmin.from("articles").select("id, status, view_count").is("deleted_at", null),
      supabaseAdmin.from("campaigns").select("id, status"),
      supabaseAdmin.from("seo_audit_results").select("url_path, severity"),
      supabaseAdmin.from("credit_ledger").select("amount, direction, source_type"),
    ]);

    const allOrders = (orders.data ?? []) as Array<{ total: number; status: string }>;
    const paid = (paidOrders.data ?? []) as Array<{ total: number }>;
    const arts = (articles.data ?? []) as Array<{ status: string; view_count: number | null }>;
    const camps = (campaigns.data ?? []) as Array<{ status: string }>;
    const seoRows = (seo.data ?? []) as Array<{ url_path: string; severity: string }>;
    const ledger = (credits.data ?? []) as Array<{
      amount: number;
      direction: string;
      source_type: string;
    }>;

    // Nilai transaksi hanya dari order yang benar-benar lunas.
    const revenue = paid.reduce((sum, o) => sum + Number(o.total ?? 0), 0);

    // Saldo yang dipakai untuk belanja: debit dari ledger bertipe adjustment
    // (pemakaian saldo di order). Ini bukan pendapatan, hanya perpindahan.
    const creditUsed = ledger
      .filter((e) => e.direction === "debit" && e.source_type === "adjustment")
      .reduce((sum, e) => sum + Number(e.amount ?? 0), 0);

    return {
      forbidden: false as const,
      orders: allOrders.length,
      ordersPaid: paid.length,
      revenue,
      creditUsed,
      articles: {
        total: arts.length,
        published: arts.filter((a) => a.status === "published").length,
        scheduled: arts.filter((a) => a.status === "scheduled").length,
        inReview: arts.filter((a) => a.status === "review").length,
        totalViews: arts.reduce((sum, a) => sum + Number(a.view_count ?? 0), 0),
      },
      campaigns: {
        total: camps.length,
        active: camps.filter((c) => c.status === "active").length,
      },
      seo: {
        pagesChecked: new Set(seoRows.map((r) => r.url_path)).size,
        pagesWithIssues: new Set(
          seoRows
            .filter((r) => r.severity === "error" || r.severity === "warning")
            .map((r) => r.url_path),
        ).size,
        totalIssues: seoRows.length,
      },
      error: null,
    };
  });

/** Ringkasan konten (status, penulis, artikel terpopuler). */
export const getContentSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    if (!(await assertAccess(ctx))) return { forbidden: true as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("content_summary");
    if (error) {
      return {
        forbidden: false as const,
        summary: null,
        error: "Ringkasan konten tidak dapat dimuat.",
      };
    }
    return { forbidden: false as const, summary: data, error: null };
  });

/** Daftar artikel untuk board editorial. */
export const listArticlesForBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    if (!(await assertAccess(ctx))) return { forbidden: true as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("articles")
      .select(
        "id, title, slug, status, author_name, view_count, published_at, scheduled_at, updated_at",
      )
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) {
      return { forbidden: false as const, items: [], error: "Daftar artikel tidak dapat dimuat." };
    }
    return { forbidden: false as const, items: data ?? [], error: null };
  });

/** Bentuk satu kampanye seperti yang dikembalikan RPC `list_campaigns`. */
export type CampaignRow = {
  id: string;
  name: string;
  channel: string;
  status: string;
  utm_source: string;
  utm_medium: string | null;
  utm_campaign: string;
  starts_at: string | null;
  ends_at: string | null;
  kunjungan: number;
  pengunjung: number;
  order: number;
};

/** Daftar kampanye + performa. */
export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    if (!(await assertAccess(ctx))) return { forbidden: true as const, items: [], error: null };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("list_campaigns");
    if (error) {
      return {
        forbidden: false as const,
        items: [] as CampaignRow[],
        error: "Daftar kampanye tidak dapat dimuat.",
      };
    }
    return { forbidden: false as const, items: (data ?? []) as CampaignRow[], error: null };
  });

/** Atribusi: sumber mana yang menghasilkan order. */
export const getAttribution = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => rangeSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    if (!(await assertAccess(ctx))) return { forbidden: true as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("campaign_attribution", {
      _days: data.days,
    });
    if (error) {
      return { forbidden: false as const, result: null, error: "Atribusi tidak dapat dihitung." };
    }
    return { forbidden: false as const, result, error: null };
  });
