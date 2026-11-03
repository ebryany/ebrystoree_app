import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  checkoutMissingItems,
  daysLabel,
  minDeadlineLocal,
  resolveInitialPackage,
  revisionLabel,
} from "../service-checkout";

const complete = {
  hasPackage: true,
  courseName: "Statistika",
  studyProgram: "Manajemen",
  educationLevel: "s1",
  title: "Analisis regresi",
  description: "Butuh bantuan memahami uji regresi linear berganda.",
  deadlineIso: new Date(Date.now() + 86_400_000).toISOString(),
  outputType: "dokumen",
  fileFormat: "docx",
  missingExtras: false,
  integrityAccepted: true,
  noCredentialAccepted: true,
};

describe("checkoutMissingItems", () => {
  it("is empty when every required field is filled", () => {
    expect(checkoutMissingItems(complete)).toEqual([]);
  });

  it("maps each missing field to its input id", () => {
    const res = checkoutMissingItems({
      ...complete,
      description: "pendek",
      deadlineIso: null,
      integrityAccepted: false,
    });
    expect(res.map((m) => m.field)).toEqual(["deskripsi", "tenggat", "integritas"]);
  });
});

describe("helpers", () => {
  it("minDeadlineLocal is at least 2 hours ahead", () => {
    const now = new Date(2026, 10, 4, 10, 0);
    expect(minDeadlineLocal(now)).toBe("2026-11-04T12:01");
  });

  it("resolveInitialPackage falls back to the first package", () => {
    const pk = [{ id: "a" }, { id: "b" }];
    expect(resolveInitialPackage(pk, "b")?.id).toBe("b");
    expect(resolveInitialPackage(pk, "zzz")?.id).toBe("a");
    expect(resolveInitialPackage([], "a")).toBeNull();
  });

  it("does not advertise zero free revisions", () => {
    expect(revisionLabel(0)).toBe("Tanpa revisi gratis");
    expect(revisionLabel(2)).toBe("2x revisi gratis");
  });

  it("formats day ranges", () => {
    expect(daysLabel(null, null)).toBeNull();
    expect(daysLabel(3, 3)).toBe("3 hari");
    expect(daysLabel(1, 7)).toBe("1–7 hari");
  });
});

describe("service detail & checkout pages", () => {
  const detail = readFileSync("src/routes/layanan.$slug.tsx", "utf8");
  const checkout = readFileSync("src/routes/_authenticated/checkout.layanan.$slug.tsx", "utf8");

  it("does not show unverifiable claims or hardcoded payee", () => {
    for (const src of [detail, checkout]) {
      expect(src).not.toMatch(/Operator terverifikasi|Progres terpantau|Kuota revisi jelas/);
      expect(src).not.toMatch(/FEBRYANUS/);
    }
  });

  it("keeps server-side ordering with idempotency", () => {
    expect(checkout).toContain("createAcademicOrder");
    expect(checkout).toContain("idempotencyKey");
    expect(checkout).toContain("quoteAcademicOrder");
    expect(checkout).not.toMatch(/total:\s*estimatedTotal/);
  });

  it("guards double submit and shows inline errors", () => {
    expect(checkout).toContain("if (submitting) return;");
    expect(checkout).toContain("aria-invalid");
    expect(checkout).toContain("noValidate");
  });

  it("uses a 2-column desktop layout with a sticky gallery, matching /produk/$slug", () => {
    expect(detail).toContain("lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]");
    expect(detail).toContain("lg:sticky");
    expect(checkout).toContain("lg:sticky");
  });
});
