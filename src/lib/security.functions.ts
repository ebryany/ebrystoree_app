import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "./authz.server";

type Ctx = { supabase: any; userId: string };

export type SecurityFinding = {
  id: string;
  severity: "ok" | "warning" | "critical";
  title: string;
  detail: string;
};

export type SecurityOverview = {
  findings: SecurityFinding[];
  counts: {
    tablesTotal: number;
    tablesWithRls: number;
    anonWriteGrants: number;
    anonFunctions: number;
    definerWithoutSearchPath: number;
    publicBuckets: number;
    bucketsTotal: number;
  };
  anonFunctionNames: string[];
  publicBucketIds: string[];
  recentAudit: Array<{
    action: string;
    entity_type: string;
    actor_role: string | null;
    created_at: string;
  }>;
  checkedAt: string;
};

/**
 * Ringkasan kondisi keamanan untuk super_admin.
 * Membaca katalog database (pg_class, pg_proc, pg_policies, storage.buckets) lewat
 * service role, bukan data pelanggan. Tidak ada rahasia yang dikembalikan.
 */
export const getSecurityOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    await assertPermission(ctx, "settings.view");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [catalog, anonFns, definers, buckets, audit] = await Promise.all([
      supabaseAdmin.rpc("security_catalog_snapshot"),
      supabaseAdmin.rpc("security_anon_functions"),
      supabaseAdmin.rpc("security_definer_missing_search_path"),
      supabaseAdmin
        .from("system_settings")
        .select("key")
        .in("key", ["security_bucket_ids"])
        .maybeSingle(),
      ctx.supabase
        .from("audit_logs")
        .select("action, entity_type, actor_role, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

    const snap = (catalog.data ?? {}) as {
      tables_total?: number;
      tables_with_rls?: number;
      anon_write_grants?: number;
    };
    const anonNames = ((anonFns.data ?? []) as Array<{ fn: string }>).map((row) => row.fn);
    const definerList = (definers.data ?? []) as Array<{ fn: string; args: string }>;

    // Daftar bucket dibaca langsung dari storage via service role.
    const { data: bucketRows } = await supabaseAdmin.storage.listBuckets();
    const bucketList = (bucketRows ?? []) as Array<{ id: string; public: boolean }>;
    const publicBuckets = bucketList.filter((b) => b.public).map((b) => b.id);
    void buckets;

    const findings: SecurityFinding[] = [];
    const tablesTotal = Number(snap.tables_total ?? 0);
    const tablesWithRls = Number(snap.tables_with_rls ?? 0);
    const anonWrite = Number(snap.anon_write_grants ?? 0);

    findings.push(
      tablesWithRls === tablesTotal
        ? {
            id: "rls",
            severity: "ok",
            title: "Row Level Security aktif di semua tabel",
            detail: `${tablesWithRls} dari ${tablesTotal} tabel public memakai RLS.`,
          }
        : {
            id: "rls",
            severity: "critical",
            title: "Ada tabel tanpa Row Level Security",
            detail: `${tablesTotal - tablesWithRls} tabel public belum memakai RLS.`,
          },
    );

    findings.push(
      anonWrite === 0
        ? {
            id: "anon_write",
            severity: "ok",
            title: "Anon tidak punya hak tulis",
            detail: "Tidak ada grant INSERT/UPDATE/DELETE/TRUNCATE untuk anon.",
          }
        : {
            id: "anon_write",
            severity: "critical",
            title: "Anon masih punya hak tulis",
            detail: `${anonWrite} tabel memberi grant tulis ke anon.`,
          },
    );

    const expectedAnon = ["product_rating_summary", "search_products_fts", "store_rating_summary"];
    const unexpectedAnon = anonNames.filter((name) => !expectedAnon.includes(name));
    findings.push(
      unexpectedAnon.length === 0
        ? {
            id: "anon_fn",
            severity: "ok",
            title: "Fungsi publik anon sesuai daftar",
            detail: `Hanya ${anonNames.length} fungsi publik yang dapat dipanggil anon.`,
          }
        : {
            id: "anon_fn",
            severity: "warning",
            title: "Ada fungsi tambahan yang dapat dipanggil anon",
            detail: unexpectedAnon.join(", "),
          },
    );

    findings.push(
      definerList.length === 0
        ? {
            id: "search_path",
            severity: "ok",
            title: "Semua fungsi definer memakai search_path",
            detail: "Tidak ada fungsi SECURITY DEFINER tanpa search_path eksplisit.",
          }
        : {
            id: "search_path",
            severity: "warning",
            title: "Fungsi definer tanpa search_path",
            detail: definerList.map((row) => row.fn).join(", "),
          },
    );

    findings.push(
      publicBuckets.length === 0
        ? {
            id: "buckets",
            severity: "ok",
            title: "Tidak ada bucket publik",
            detail: `${bucketList.length} bucket storage semuanya privat.`,
          }
        : {
            id: "buckets",
            severity: "critical",
            title: "Ada bucket storage publik",
            detail: publicBuckets.join(", "),
          },
    );

    const overview: SecurityOverview = {
      findings,
      counts: {
        tablesTotal,
        tablesWithRls,
        anonWriteGrants: anonWrite,
        anonFunctions: anonNames.length,
        definerWithoutSearchPath: definerList.length,
        publicBuckets: publicBuckets.length,
        bucketsTotal: bucketList.length,
      },
      anonFunctionNames: anonNames,
      publicBucketIds: publicBuckets,
      recentAudit: (audit.data ?? []) as SecurityOverview["recentAudit"],
      checkedAt: new Date().toISOString(),
    };
    return { overview, error: null };
  });

export const securityOverviewInput = z.object({}).strict();
