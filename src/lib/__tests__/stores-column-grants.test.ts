import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Regresi API-SEC-007.
 *
 * Policy `stores_select_public` memberi SELECT seluruh baris untuk anon. Tanpa
 * pembatasan kolom, PostgREST mengembalikan contact_email, verification_note,
 * suspended_reason, reviewed_by, dan owner_id ke pengunjung anonim.
 *
 * Test ini mengunci bentuk migrasi: grant tabel dicabut, lalu hanya kolom
 * publik yang diberikan kembali.
 */

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20261023100000_stores_public_column_grants.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("grant kolom publik stores", () => {
  it("mencabut SELECT level tabel dari anon", () => {
    expect(migration).toMatch(/REVOKE\s+SELECT\s+ON\s+public\.stores\s+FROM\s+anon/i);
  });

  it("tidak memberikan SELECT seluruh tabel kembali ke anon", () => {
    expect(migration).not.toMatch(/GRANT\s+SELECT\s+ON\s+public\.stores\s+TO\s+anon/i);
  });

  it("mempertahankan contact_phone karena storefront memakai tombol WhatsApp", () => {
    const grantBlock = migration.slice(migration.indexOf("GRANT SELECT ("));
    expect(grantBlock).toMatch(/contact_phone/);
  });

  it.each(["contact_email", "verification_note", "suspended_reason", "reviewed_by", "owner_id"])(
    "tidak memberikan kolom privat %s ke anon",
    (column) => {
      const grantBlock = migration.slice(migration.indexOf("GRANT SELECT ("));
      const columnList = grantBlock.slice(0, grantBlock.indexOf(")"));
      expect(columnList).not.toMatch(new RegExp(`\\b${column}\\b`));
    },
  );

  it("tidak mengubah RLS — baris tetap dibatasi status aktif", () => {
    expect(migration).not.toMatch(/CREATE\s+POLICY/i);
    expect(migration).not.toMatch(/DROP\s+POLICY/i);
    expect(migration).not.toMatch(/ALTER\s+POLICY/i);
  });
});
