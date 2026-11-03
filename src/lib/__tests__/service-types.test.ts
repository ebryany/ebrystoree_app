import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  displayCategoryOf,
  generalBriefMissing,
  isAcademicCategorySlug,
  looksLikeSecret,
  serviceFlowOf,
} from "../service-types";

describe("serviceFlowOf", () => {
  it("routes academic categories to the academic form", () => {
    expect(serviceFlowOf({ categories: { slug: "makalah" } })).toBe("academic");
    expect(serviceFlowOf({ categories: { slug: "pendampingan-skripsi" } })).toBe("academic");
  });

  it("routes every other service (web, design, IT, uncategorized) to the general form", () => {
    expect(serviceFlowOf({ categories: { slug: "jasa-digital-ebry" } })).toBe("general");
    expect(serviceFlowOf({ categories: { slug: "desain-grafis" } })).toBe("general");
    expect(serviceFlowOf({ categories: null })).toBe("general");
    expect(serviceFlowOf({})).toBe("general");
  });

  it("only knows the academic slugs", () => {
    expect(isAcademicCategorySlug("tugas-harian")).toBe(true);
    expect(isAcademicCategorySlug("website")).toBe(false);
    expect(isAcademicCategorySlug(null)).toBe(false);
  });
});

describe("generalBriefMissing", () => {
  const now = new Date("2026-11-04T10:00:00Z");
  const ok = {
    hasPackage: true,
    title: "Website toko kue",
    description: "Butuh website company profile 5 halaman dengan form kontak.",
    deliverables: "",
    references: "",
    deadlineIso: null,
    noCredentialAccepted: true,
  };

  it("needs no academic fields and deadline is optional", () => {
    expect(generalBriefMissing(ok, now)).toEqual([]);
  });

  it("flags short brief, too-close deadline and missing acknowledgement", () => {
    const res = generalBriefMissing(
      {
        ...ok,
        description: "web",
        deadlineIso: "2026-11-04T11:00:00Z",
        noCredentialAccepted: false,
      },
      now,
    );
    expect(res.map((m) => m.field)).toEqual(["deskripsi", "tenggat", "kredensial"]);
  });
});

describe("looksLikeSecret", () => {
  it("catches pasted credentials", () => {
    expect(looksLikeSecret("login cpanel password: rahasia123")).toBe(true);
    expect(looksLikeSecret("token=ghp_abcdefghijklmnopqrstuvwxyz123456")).toBe(true);
    expect(looksLikeSecret("-----BEGIN RSA PRIVATE KEY-----")).toBe(true);
  });

  it("does not block normal briefs that mention passwords", () => {
    expect(looksLikeSecret("Tambahkan fitur reset password dan login Google")).toBe(false);
    expect(looksLikeSecret("Halaman lupa kata sandi")).toBe(false);
  });
});

describe("displayCategoryOf", () => {
  it("prefers the main category and collapses whitespace", () => {
    expect(
      displayCategoryOf({
        category: { slug: "jasa-digital-ebry", name: "Jasa Digital  Ebry" },
        categories: null,
      }),
    ).toEqual({ slug: "jasa-digital-ebry", name: "Jasa Digital Ebry" });
  });
});

describe("checkout split", () => {
  const checkout = readFileSync("src/routes/_authenticated/checkout.layanan.$slug.tsx", "utf8");
  const general = checkout.slice(
    checkout.indexOf("function GeneralCheckout"),
    checkout.indexOf("function AcademicCheckout"),
  );

  it("has separate general and academic forms", () => {
    expect(checkout).toContain("serviceFlowOf(service)");
    expect(general).toContain("createGeneralServiceOrder");
    expect(general).toContain("idempotencyKey");
  });

  it("general form has no academic fields", () => {
    expect(general).not.toMatch(
      /Mata kuliah|Program studi|Jenjang|dosen|kampus|Integritas akademik/i,
    );
    expect(general).not.toContain("createAcademicOrder");
  });

  it("general form never sends a price", () => {
    expect(general).not.toMatch(/total:\s*total|price:/);
  });

  it("migration keeps general orders out of the academic review queue", () => {
    const sql = readFileSync(
      "supabase/migrations/20261104090000_general_service_checkout.sql",
      "utf8",
    );
    expect(sql).toContain("WRONG_SERVICE_FLOW");
    expect(sql).not.toMatch(/academic_category_id,\s*course_name/);
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.create_general_service_order");
  });
});
