import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Test regresi untuk bug perbaikan FASE 0.
 *
 * Menguji file migrasi secara statis: memastikan perbaikan tidak "kembali rusak"
 * bila ada yang mengubah migrasi. Ini menjaga:
 *   A-01  refund actor_type  (tidak boleh kembali ke 'staff')
 *   A-02  scheduler          (job harus terdaftar via cron.schedule)
 *   A-03  rate limit         (tabel+RPC harus ada, RPC tidak terbuka ke klien)
 *   store credit             (ledger + idempotency key)
 */

const MIG = join(process.cwd(), "supabase", "migrations");

function allMigrations(): { name: string; body: string }[] {
  return readdirSync(MIG)
    .filter((f) => f.endsWith(".sql"))
    .map((name) => ({ name, body: readFileSync(join(MIG, name), "utf8") }));
}

describe("A-01 refund actor_type tidak kembali ke 'staff'", () => {
  it("definisi TERAKHIR review_refund & process_refund memakai 'finance', bukan 'staff'", () => {
    // Kumpulkan setiap definisi (file + nama fungsi), urut kronologis.
    const defs: { fname: string; file: string; body: string }[] = [];
    for (const m of allMigrations()) {
      for (const fname of ["review_refund", "process_refund"]) {
        if (m.body.includes(`FUNCTION public.${fname}(`)) {
          defs.push({ fname, file: m.name, body: m.body });
        }
      }
    }
    expect(defs.length).toBeGreaterThan(0);

    for (const fname of ["review_refund", "process_refund"]) {
      const versions = defs.filter((d) => d.fname === fname).sort((a, b) => a.file.localeCompare(b.file));
      const last = versions[versions.length - 1];
      expect(last, `${fname} harus didefinisikan`).toBeTruthy();

      // Ambil hanya definisi fungsi terakhir (dari CREATE OR REPLACE sampai $$;)
      const body = last!.body;
      const at = body.lastIndexOf(`FUNCTION public.${fname}(`);
      const defBody = body.slice(at, body.indexOf("$$;", at));

      // actor_type harus 'finance' pada blok yang menulis refund
      const refundBlock = defBody.slice(defBody.indexOf("review_refund") >= 0 ? 0 : 0);
      expect(refundBlock, `${fname} (${last!.file}) tidak boleh menulis 'staff'`).not.toContain("'staff'");
    }
  });
});

describe("A-02 scheduler terdaftar", () => {
  it("ada migrasi yang memanggil cron.schedule untuk ketiga job", () => {
    const body = allMigrations().map((m) => m.body).join("\n");
    expect(body).toMatch(/cron\.schedule\(\s*'expire_orders'/);
    expect(body).toMatch(/cron\.schedule\(\s*'flag_overdue_tasks'/);
    expect(body).toMatch(/cron\.schedule\(\s*'check_sla_breach'/);
  });
});

describe("A-03 rate limit tersedia & tertutup", () => {
  it("tabel rate_limit_hits + RPC check_rate_limit ada", () => {
    const body = allMigrations().map((m) => m.body).join("\n");
    expect(body).toContain("CREATE TABLE IF NOT EXISTS public.rate_limit_hits");
    expect(body).toContain("FUNCTION public.check_rate_limit");
  });

  it("RPC check_rate_limit tidak terbuka untuk anon/authenticated", () => {
    const body = allMigrations().map((m) => m.body).join("\n");
    expect(body).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.check_rate_limit\([^)]*\) FROM[^;]*anon/,
    );
  });
});

describe("Store credit: ledger + idempotency", () => {
  it("tabel credit_ledger punya idempotency_key UNIQUE", () => {
    const body = allMigrations().map((m) => m.body).join("\n");
    expect(body).toContain("CREATE TABLE IF NOT EXISTS public.credit_ledger");
    expect(body).toMatch(/idempotency_key text NOT NULL UNIQUE/);
  });

  it("saldo dihitung dari ledger (fungsi get_credit_balance ada)", () => {
    const body = allMigrations().map((m) => m.body).join("\n");
    expect(body).toContain("FUNCTION public.get_credit_balance");
  });
});

describe("Marketplace Prompt 06: seller role & store", () => {
  it("role 'seller' ditambahkan ke enum app_role", () => {
    const body = allMigrations().map((m) => m.body).join("\n");
    expect(body).toMatch(/ALTER TYPE public\.app_role ADD VALUE IF NOT EXISTS 'seller'/);
  });

  it("tabel stores ada dengan unique owner (satu toko per seller)", () => {
    const body = allMigrations().map((m) => m.body).join("\n");
    expect(body).toContain("CREATE TABLE IF NOT EXISTS public.stores");
    expect(body).toMatch(/stores_owner_unique ON public\.stores \(owner_id\)/);
  });

  it("stores punya RLS aktif", () => {
    const body = allMigrations().map((m) => m.body).join("\n");
    expect(body).toMatch(/ALTER TABLE public\.stores ENABLE ROW LEVEL SECURITY/);
  });

  it("RLS stores membatasi ke owner (isolasi seller)", () => {
    const body = allMigrations().map((m) => m.body).join("\n");
    expect(body).toMatch(/stores_select_own[\s\S]{0,120}owner_id = auth\.uid\(\)/);
  });

  it("role seller diberikan saat approval (bukan saat pendaftaran)", () => {
    // Migrasi terakhir yang mendefinisikan review_seller tidak boleh memberi role
    // di apply_as_seller.
    const body = allMigrations().map((m) => m.body).join("\n");
    const applyFn = body.slice(body.lastIndexOf("FUNCTION public.apply_as_seller"));
    const firstEnd = applyFn.indexOf("END; $$;");
    expect(applyFn.slice(0, firstEnd)).not.toContain("INSERT INTO public.user_roles");
  });
});

describe("Marketplace 09-12: ownership katalog + moderasi + storefront", () => {
  it("digital_products punya kolom store_id + moderation_status", () => {
    const body = allMigrations().map((m) => m.body).join("\n");
    expect(body).toMatch(/ALTER TABLE public\.digital_products[\s\S]{0,200}store_id uuid REFERENCES public\.stores/);
    expect(body).toMatch(/moderation_status text NOT NULL DEFAULT 'approved'/);
  });

  it("produk legacy di-backfill ke platform store", () => {
    const body = allMigrations().map((m) => m.body).join("\n");
    expect(body).toMatch(/UPDATE public\.digital_products[\s\S]{0,200}is_platform = true/);
  });

  it("trigger memaksa moderasi: seller tak bisa publish langsung", () => {
    const body = allMigrations().map((m) => m.body).join("\n");
    expect(body).toContain("FUNCTION public.enforce_product_moderation");
    expect(body).toMatch(/BEFORE INSERT OR UPDATE ON public\.digital_products/);
  });

  it("RLS produk membatasi seller ke tokonya sendiri", () => {
    const body = allMigrations().map((m) => m.body).join("\n");
    expect(body).toMatch(/products_select_seller_own[\s\S]{0,200}store_id = public\.my_store_id\(\)/);
  });

  it("RPC moderasi produk ada", () => {
    const body = allMigrations().map((m) => m.body).join("\n");
    expect(body).toContain("FUNCTION public.submit_product_for_review");
    expect(body).toContain("FUNCTION public.review_product");
  });

  it("store publik dapat dibaca anon (storefront)", () => {
    const body = allMigrations().map((m) => m.body).join("\n");
    expect(body).toMatch(/stores_select_public[\s\S]{0,150}TO anon/);
  });
});
