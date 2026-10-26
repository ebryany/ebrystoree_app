import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regresi statis Slice 1 (docs/marketplace/06-rencana-mgrcao-v3-jejak-toko-pribadi.md):
 * halaman "Produk Platform Store" tidak boleh kehilangan scope platform — kalau
 * filter/guard ini dihapus, admin kembali mengelola katalog seller lewat form umum.
 */

const SRC = join(process.cwd(), "src", "lib", "admin.functions.ts");
const body = readFileSync(SRC, "utf8");

describe("A-1: Produk Platform Store scope", () => {
  it("listAdminProducts hanya menampilkan produk platform (store_id IS NULL)", () => {
    const at = body.indexOf("export const listAdminProducts");
    const next = body.indexOf("export const", at + 10);
    const fn = body.slice(at, next);
    expect(fn).toContain('.is("store_id", null)');
  });

  it("saveProduct menolak produk seller (diarahkan ke Moderasi)", () => {
    const at = body.indexOf("export const saveProduct");
    const next = body.indexOf("export const", at + 10);
    const fn = body.slice(at, next);
    expect(fn).toMatch(/before\?\.store_id != null/);
    expect(fn).toContain("Moderasi Produk");
  });

  it("deleteProduct menolak produk seller", () => {
    const at = body.indexOf("export const deleteProduct");
    const next = body.indexOf("export const", at + 10);
    const fn = body.slice(at, next);
    expect(fn).toMatch(/before\?\.store_id != null/);
  });
});
