import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertStaff(ctx: Ctx): Promise<boolean> {
  const { data: roles } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  return (roles ?? []).some((r: any) => ["admin", "super_admin", "support"].includes(r.role));
}

/**
 * Daftar halaman yang akan diperiksa SEO.
 *
 * Diambil dari sitemap supaya yang diperiksa adalah halaman yang benar-benar
 * dipublikasikan. Dibatasi jumlahnya agar audit tidak berjalan terlalu lama.
 */
async function collectPaths(limit = 60): Promise<string[]> {
  const { createPublicClient } = await import("./supabase-public.server");
  const supabase = createPublicClient() as any;

  const paths: string[] = [
    "/",
    "/produk",
    "/layanan",
    "/artikel",
    "/bantuan",
    "/syarat-ketentuan",
    "/kebijakan-privasi",
    "/kebijakan-refund",
  ];

  try {
    const [products, services, articles] = await Promise.all([
      supabase.from("digital_products").select("slug").eq("status", "published").limit(20),
      supabase.from("services").select("slug").eq("status", "published").limit(10),
      supabase.from("articles").select("slug").eq("status", "published").limit(20),
    ]);
    for (const row of products.data ?? []) if (row.slug) paths.push(`/produk/${row.slug}`);
    for (const row of services.data ?? []) if (row.slug) paths.push(`/layanan/${row.slug}`);
    for (const row of articles.data ?? []) if (row.slug) paths.push(`/artikel/${row.slug}`);
  } catch {
    // Gagal mengambil halaman dinamis: audit tetap jalan untuk halaman statis.
  }

  return Array.from(new Set(paths)).slice(0, limit);
}

/**
 * Jalankan audit SEO sekarang (dipicu admin dari dashboard).
 *
 * Hasil disimpan di `seo_audit_results` dan bisa dibaca lewat `getSeoAudit`.
 */
export const runSeoAuditNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    if (!(await assertStaff(ctx))) {
      return { ok: false as const, error: "Hanya staf yang dapat menjalankan audit SEO." };
    }

    const baseUrl = process.env["SITE_URL"] ?? "https://app.ebrystore.my.id";
    const paths = await collectPaths();
    const { runSeoAudit } = await import("./seo-audit.server");
    const result = await runSeoAudit(baseUrl, paths);

    return { ok: true as const, ...result, totalPages: paths.length };
  });

/**
 * Ambil hasil audit terakhir untuk dashboard.
 *
 * Mengembalikan ringkasan + daftar masalah per halaman, diurutkan dari yang
 * paling berat. Tidak mengembalikan data mentah HTML apa pun.
 */
export const getSeoAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    if (!(await assertStaff(ctx))) return { forbidden: true as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: summary }, { data: rows }] = await Promise.all([
      supabaseAdmin.rpc("seo_audit_summary"),
      supabaseAdmin
        .from("seo_audit_results")
        .select("url_path, issue_code, severity, detail, checked_at, ignored_at")
        .order("severity", { ascending: true })
        .order("url_path")
        .limit(200),
    ]);

    return {
      forbidden: false as const,
      summary: summary ?? null,
      issues: (rows ?? []) as Array<{
        url_path: string;
        issue_code: string;
        severity: string;
        detail: string | null;
        checked_at: string;
        ignored_at: string | null;
      }>,
    };
  });
