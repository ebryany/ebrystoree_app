import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Test regresi statis untuk perbaikan keamanan H-1..H-4.
 * (docs/security/01-rencana-perbaikan-h1-h4-mgrcao-v3.md)
 *
 * Membaca file migrasi secara kronologis dan mengambil DEFINISI TERAKHIR setiap
 * fungsi/trigger — pola yang sama dengan regression-fase0.test.ts — lalu
 * memastikan perbaikan masih ada. Ini bukan bukti isolasi runtime; itu penjaga
 * agar perbaikan tidak dihapus/diturunkan diam-diam di migrasi berikutnya.
 *
 * Pencarian definisi hanya mencocokkan statement CREATE [OR REPLACE] FUNCTION,
 * bukan menyebut nama fungsi di REVOKE/GRANT/EXECUTE FUNCTION yang bisa muncul
 * setelah body dan membuat slice mulai di posisi yang salah.
 */

const MIG = join(process.cwd(), "supabase", "migrations");

function allMigrations(): { name: string; body: string }[] {
  return readdirSync(MIG)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, body: readFileSync(join(MIG, name), "utf8") }));
}

/** Definisi TERAKHIR sebuah fungsi: statement CREATE [OR REPLACE] FUNCTION paling akhir. */
function latestFunctionDef(fname: string): { file: string; body: string } {
  const re = new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${fname}\\s*\\(`, "g");
  const defs = allMigrations()
    .map((m) => {
      re.lastIndex = 0;
      let at = -1;
      let match: RegExpExecArray | null;
      while ((match = re.exec(m.body)) !== null) at = match.index;
      return at >= 0 ? { file: m.name, body: m.body.slice(at) } : null;
    })
    .filter((d): d is { file: string; body: string } => d !== null);
  const last = defs[defs.length - 1];
  expect(last, `${fname} harus punya definisi`).toBeTruthy();
  return last!;
}

describe("H-1: update_admin_task otorisasi NULL-safe", () => {
  it("predikat izin memakai IS NOT TRUE", () => {
    const def = latestFunctionDef("update_admin_task");
    expect(def.body).toMatch(
      /\(public\.has_permission\(auth\.uid\(\), 'tasks\.update'\) OR t\.assignee_id = auth\.uid\(\)\) IS NOT TRUE/,
    );
  });

  it("definisi terakhir berasal dari migrasi fix (bukan versi lama yang rawan NULL)", () => {
    expect(latestFunctionDef("update_admin_task").file).toBe(
      "20261002100001_fix_h1_h4_security.sql",
    );
  });
});

describe("H-2: kolom moderasi dilindungi di level database", () => {
  it("fungsi protect_moderation_fields ada dan terpasang BEFORE INSERT OR UPDATE", () => {
    const body = allMigrations()
      .map((m) => m.body)
      .join("\n");
    expect(body).toMatch(/CREATE(?: OR REPLACE)? FUNCTION public\.protect_moderation_fields\s*\(/);
    expect(body).toMatch(
      /CREATE TRIGGER products_protect_moderation\s+BEFORE INSERT OR UPDATE ON public\.digital_products/,
    );
  });

  it("trigger melewati admin dan service_role (auth.uid NULL)", () => {
    const fn = latestFunctionDef("protect_moderation_fields").body;
    expect(fn).toMatch(/IF auth\.uid\(\) IS NULL OR public\.is_admin\(auth\.uid\(\)\) THEN/);
  });

  it("INSERT produk seller dipaksa pending; UPDATE tidak bisa naik ke approved", () => {
    const fn = latestFunctionDef("protect_moderation_fields").body;
    expect(fn).toMatch(/IF TG_OP = 'INSERT' THEN[\s\S]{0,400}NEW\.moderation_status := 'pending';/);
    expect(fn).toMatch(
      /IF NEW\.moderation_status = 'approved' AND OLD\.moderation_status IS DISTINCT FROM 'approved' THEN[\s\S]{0,200}NEW\.moderation_status := OLD\.moderation_status;/,
    );
    // Kolom reviewer tidak boleh ditulis non-admin.
    expect(fn).toMatch(/NEW\.reviewed_by := OLD\.reviewed_by;/);
  });

  it("trigger hanya membatasi baris milik seller, bukan produk platform", () => {
    const fn = latestFunctionDef("protect_moderation_fields").body;
    expect(fn).toMatch(/IF NEW\.store_id IS NULL THEN[\s\S]{0,120}RETURN NEW;/);
  });
});

describe("H-3: pemakaian saldo kredit diserialisasi per user", () => {
  it("advisory lock diperoleh SEBELUM baca saldo", () => {
    const def = latestFunctionDef("apply_credit_to_order");
    const lockAt = def.body.indexOf("pg_advisory_xact_lock(710003, hashtext(o.user_id::text))");
    const balanceAt = def.body.indexOf("public.get_credit_balance(o.user_id)");
    expect(lockAt).toBeGreaterThanOrEqual(0);
    expect(balanceAt).toBeGreaterThan(lockAt);
  });

  it("lock memakai bentuk dua-argumen (keyspace terpisah dari check_rate_limit)", () => {
    const def = latestFunctionDef("apply_credit_to_order");
    expect(def.body).toContain("pg_advisory_xact_lock(710003, hashtext(o.user_id::text))");
  });
});

describe("H-4: reversal kredit tunggal untuk cancel & expire", () => {
  it("cancel_own_order memakai kunci reverse:order:", () => {
    const def = latestFunctionDef("cancel_own_order");
    expect(def.body).toContain("v_reversal_key := 'reverse:order:' || _order_id::text;");
  });

  it("job_expire_orders memakai kunci yang SAMA dengan cancel", () => {
    const def = latestFunctionDef("job_expire_orders");
    expect(def.body).toContain("v_reversal_key := 'reverse:order:' || r.id::text;");
  });

  it("kunci idempotensi lama yang berbeda sudah tidak dipakai definisi terakhir", () => {
    expect(latestFunctionDef("cancel_own_order").body).not.toContain("'cancel:' || _order_id");
    expect(latestFunctionDef("job_expire_orders").body).not.toContain("'expire:' || r.id");
  });

  it("kursor job expire mengunci baris dengan FOR UPDATE SKIP LOCKED", () => {
    expect(latestFunctionDef("job_expire_orders").body).toMatch(/FOR UPDATE SKIP LOCKED/);
  });
});
