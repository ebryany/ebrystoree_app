import { describe, expect, it } from "vitest";

/**
 * Unit test untuk aturan pemilihan metode pembayaran
 * (src/lib/transaction.server.ts → resolveEnabled).
 *
 * Latar masalah: dulu ada tiga nama setting berbeda untuk QRIS
 * (qris_enabled, qris_payment_active, feature_qris) dan dua di antaranya tidak
 * ada di database. Nilai `undefined` dianggap aktif, sehingga saklar admin
 * tampak tidak berfungsi. Aturan baru: nama kanonik menang bila ada.
 */

function resolveEnabled(
  map: Map<string, unknown>,
  canonical: string,
  aliases: string[],
): boolean {
  const canonicalValue = map.get(canonical);
  if (canonicalValue !== undefined) return canonicalValue !== false;
  return aliases.every((key) => {
    const value = map.get(key);
    return value === undefined ? true : value !== false;
  });
}

const QRIS_ALIASES = ["qris_payment_active", "feature_qris"];

describe("PAY: aturan saklar metode pembayaran", () => {
  it("PAY-01: saklar kanonik false menang walau alias true", () => {
    const map = new Map<string, unknown>([
      ["qris_enabled", false],
      ["qris_payment_active", true],
      ["feature_qris", true],
    ]);
    expect(resolveEnabled(map, "qris_enabled", QRIS_ALIASES)).toBe(false);
  });

  it("PAY-02: saklar kanonik true menang walau alias false", () => {
    const map = new Map<string, unknown>([
      ["qris_enabled", true],
      ["qris_payment_active", false],
      ["feature_qris", false],
    ]);
    expect(resolveEnabled(map, "qris_enabled", QRIS_ALIASES)).toBe(true);
  });

  it("PAY-03: tanpa saklar kanonik, alias yang menentukan", () => {
    expect(resolveEnabled(new Map([["feature_qris", false]]), "qris_enabled", QRIS_ALIASES)).toBe(
      false,
    );
    expect(resolveEnabled(new Map([["feature_qris", true]]), "qris_enabled", QRIS_ALIASES)).toBe(
      true,
    );
  });

  it("PAY-04: semua setting kosong berarti aktif (fitur belum pernah diatur)", () => {
    expect(resolveEnabled(new Map(), "qris_enabled", QRIS_ALIASES)).toBe(true);
  });

  it("PAY-05: manual memakai saklar kanoniknya sendiri", () => {
    const disabled = new Map<string, unknown>([["manual_payment_active", false]]);
    const enabled = new Map<string, unknown>([["manual_payment_active", true]]);
    expect(resolveEnabled(disabled, "manual_payment_active", ["feature_manual_payment"])).toBe(
      false,
    );
    expect(resolveEnabled(enabled, "manual_payment_active", ["feature_manual_payment"])).toBe(true);
  });

  it("PAY-06: dua metode bisa dikombinasikan bebas", () => {
    const onlyManual = new Map<string, unknown>([
      ["qris_enabled", false],
      ["manual_payment_active", true],
    ]);
    const onlyQris = new Map<string, unknown>([
      ["qris_enabled", true],
      ["manual_payment_active", false],
    ]);
    const both = new Map<string, unknown>([
      ["qris_enabled", true],
      ["manual_payment_active", true],
    ]);
    const none = new Map<string, unknown>([
      ["qris_enabled", false],
      ["manual_payment_active", false],
    ]);

    expect(resolveEnabled(onlyManual, "qris_enabled", QRIS_ALIASES)).toBe(false);
    expect(resolveEnabled(onlyManual, "manual_payment_active", [])).toBe(true);

    expect(resolveEnabled(onlyQris, "qris_enabled", QRIS_ALIASES)).toBe(true);
    expect(resolveEnabled(onlyQris, "manual_payment_active", [])).toBe(false);

    expect(resolveEnabled(both, "qris_enabled", QRIS_ALIASES)).toBe(true);
    expect(resolveEnabled(both, "manual_payment_active", [])).toBe(true);

    expect(resolveEnabled(none, "qris_enabled", QRIS_ALIASES)).toBe(false);
    expect(resolveEnabled(none, "manual_payment_active", [])).toBe(false);
  });
});
