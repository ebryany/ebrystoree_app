import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { clampFeeBps, withdrawalFee, withdrawalNet } from "../withdrawal";

const migration = readFileSync(
  "supabase/migrations/20261027100000_seller_withdrawal_system.sql",
  "utf8",
);

// Tabel contoh dari master prompt (fee 15% dari bruto, pembulatan half-up).
const FEE_TABLE: Array<[number, number, number]> = [
  [5_000, 750, 4_250],
  [10_000, 1_500, 8_500],
  [25_000, 3_750, 21_250],
  [50_000, 7_500, 42_500],
  [100_000, 15_000, 85_000],
];

describe("fee calculator (15% = 1500 bps, half-up)", () => {
  it.each(FEE_TABLE)("gross %i → fee %i, net %i", (gross, fee, net) => {
    expect(withdrawalFee(gross, 1500)).toBe(fee);
    expect(withdrawalNet(gross, 1500)).toBe(net);
  });

  it("rounds half-up deterministically on fractional rupiah", () => {
    // 0.15 × 350 = 52.5 → 53 (tepat setengah dibulatkan ke atas)
    expect(withdrawalFee(350, 1500)).toBe(53);
    // 0.15 × 5003 = 750.45 → 750
    expect(withdrawalFee(5003, 1500)).toBe(750);
    // 0.15 × 5004 = 750.6 → 751
    expect(withdrawalFee(5004, 1500)).toBe(751);
  });

  it("net stays positive at the bps cap for realistic amounts; net=0 is rejected server-side", () => {
    for (const gross of [2, 7, 5000, 123_456, 10_000_000]) {
      expect(withdrawalNet(gross, 5000)).toBeGreaterThan(0);
    }
    // Gross 1 pada cap 50% menghasilkan net 0 — RPC menolaknya via INVALID_AMOUNT.
    expect(withdrawalNet(1, 5000)).toBe(0);
  });

  it("fee is zero when bps is zero and clamps out-of-range bps", () => {
    expect(withdrawalFee(50_000, 0)).toBe(0);
    expect(clampFeeBps(-100)).toBe(0);
    expect(clampFeeBps(1500)).toBe(1500);
    expect(clampFeeBps(9_999)).toBe(5000);
  });

  it("matches the SQL formula in the migration exactly (static contract)", () => {
    // RPC menghitung fee dengan rumus yang sama dengan CHECK constraint.
    expect(migration).toContain("v_fee := (v_gross * v_bps + 5000) / 10000");
    expect(migration).toContain("CHECK (fee_amount = (gross_amount * fee_bps + 5000) / 10000)");
    expect(migration).toContain("CHECK (net_amount = gross_amount - fee_amount)");
  });
});
