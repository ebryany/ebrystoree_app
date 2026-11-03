import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { summarizeServicePackages } from "../admin-service-list";

describe("summarizeServicePackages", () => {
  it("returns nulls when there are no packages", () => {
    expect(summarizeServicePackages([])).toEqual({
      activeCount: 0,
      minPrice: null,
      maxPrice: null,
      minDays: null,
      maxDays: null,
    });
    expect(summarizeServicePackages(null).minPrice).toBeNull();
  });

  it("ignores inactive packages and invalid numbers", () => {
    const sum = summarizeServicePackages([
      { price: 50000, estimated_days: 3, is_active: true },
      { price: "150000", estimated_days: 7, is_active: true },
      { price: 1000, estimated_days: 1, is_active: false },
      { price: null, estimated_days: null, is_active: true },
    ]);
    expect(sum).toEqual({
      activeCount: 3,
      minPrice: 50000,
      maxPrice: 150000,
      minDays: 3,
      maxDays: 7,
    });
  });
});

describe("/admin/layanan page contract", () => {
  const page = readFileSync(
    resolve(__dirname, "../../routes/_authenticated/admin/layanan.tsx"),
    "utf8",
  );
  const fns = readFileSync(resolve(__dirname, "../admin.functions.ts"), "utf8");

  it("uses the agreed header copy and primary action", () => {
    expect(page).toContain('title="Manajemen Layanan"');
    expect(page).toContain(
      "Kelola layanan, kategori, harga, publikasi, dan pesanan jasa Ebrystore.",
    );
    expect(page).toContain("Tambah Layanan");
  });

  it("reads stats from the server instead of hardcoding numbers", () => {
    expect(page).toContain("getAdminServiceStats");
    expect(fns).toMatch(
      /export const getAdminServiceStats[\s\S]+guard\(context as Ctx, "services\.view"/,
    );
  });

  it("sanitizes search and whitelists sort columns", () => {
    const block = fns.slice(fns.indexOf("export const listAdminServices"));
    expect(block).toContain("sanitizeSearchTerm(");
    expect(fns).toMatch(/const SERVICE_SORTS = \{/);
  });

  it("keeps fulfillment out of the catalog page", () => {
    expect(page).not.toMatch(/listFulfillment|operator_assignments|job_progress/);
    expect(page).toContain('to="/admin/pengerjaan"');
  });

  it("uses 44px tap targets and has a mobile card layout", () => {
    expect(page).toContain("md:hidden");
    expect(page).toContain("hidden overflow-x-auto");
    expect(page).toMatch(/min-h-11/);
  });
});
