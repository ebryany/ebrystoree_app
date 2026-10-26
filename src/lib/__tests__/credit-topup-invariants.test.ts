import { describe, expect, it } from "vitest";

/**
 * Unit test untuk invariant top-up saldo Ebrystore
 * (docs/marketplace/08-rencana-mgrcao-v3-topup-saldo-qris.md).
 *
 * Test ini memverifikasi LOGIKA ATURAN, bukan menjalankan SQL. Verifikasi SQL
 * aktual sudah dilakukan lewat integration test langsung ke database
 * (.zcode/topup-rpc-test.sql): idempotensi settle, amount mismatch, batas
 * nominal, dan penolakan top-up kedaluwarsa.
 */

// --- Batas nominal (harus sinkron dengan create_credit_topup di migrasi) ---

const MIN_AMOUNT = 10_000;
const MAX_AMOUNT = 1_000_000;

function validateTopupAmount(amount: number): "ok" | "AMOUNT_TOO_SMALL" | "AMOUNT_TOO_LARGE" {
  if (!Number.isFinite(amount) || amount < MIN_AMOUNT) return "AMOUNT_TOO_SMALL";
  if (amount > MAX_AMOUNT) return "AMOUNT_TOO_LARGE";
  return "ok";
}

// --- Simulasi settle idempoten (pola idempotency_key ledger) ---

type TopupRow = { id: string; amount: number; status: "waiting_payment" | "paid" | "expired" };
type LedgerEntry = { key: string; direction: "credit" | "debit"; amount: number; source: string };

function settleTopup(topup: TopupRow, paidAmount: number, ledger: LedgerEntry[]): string {
  if (topup.status === "paid") return "already_settled";
  if (topup.status !== "waiting_payment") return "INVALID_STATE";
  if (paidAmount < topup.amount) return "AMOUNT_MISMATCH";
  const key = `topup:${topup.id}`;
  if (!ledger.some((e) => e.key === key)) {
    ledger.push({ key, direction: "credit", amount: topup.amount, source: "topup" });
  }
  topup.status = "paid";
  return "credited";
}

function balance(entries: LedgerEntry[]): number {
  return entries.reduce((acc, e) => acc + (e.direction === "credit" ? e.amount : -e.amount), 0);
}

describe("TOPUP: Invariant top-up saldo", () => {
  it("TOPUP-01: nominal di bawah minimum ditolak", () => {
    expect(validateTopupAmount(5_000)).toBe("AMOUNT_TOO_SMALL");
    expect(validateTopupAmount(0)).toBe("AMOUNT_TOO_SMALL");
    expect(validateTopupAmount(-10_000)).toBe("AMOUNT_TOO_SMALL");
  });

  it("TOPUP-02: nominal di atas maksimum ditolak", () => {
    expect(validateTopupAmount(2_000_000)).toBe("AMOUNT_TOO_LARGE");
  });

  it("TOPUP-03: nominal dalam rentang diterima (inklusif di batas)", () => {
    expect(validateTopupAmount(10_000)).toBe("ok");
    expect(validateTopupAmount(25_000)).toBe("ok");
    expect(validateTopupAmount(1_000_000)).toBe("ok");
  });

  it("TOPUP-04: settle menambah saldo sesuai nominal", () => {
    const topup: TopupRow = { id: "t1", amount: 50_000, status: "waiting_payment" };
    const ledger: LedgerEntry[] = [];
    expect(settleTopup(topup, 50_000, ledger)).toBe("credited");
    expect(balance(ledger)).toBe(50_000);
  });

  it("TOPUP-05: settle dua kali idempoten, saldo tidak dobel", () => {
    const topup: TopupRow = { id: "t2", amount: 25_000, status: "waiting_payment" };
    const ledger: LedgerEntry[] = [];
    expect(settleTopup(topup, 25_000, ledger)).toBe("credited");
    expect(settleTopup(topup, 25_000, ledger)).toBe("already_settled");
    expect(ledger.filter((e) => e.key === "topup:t2")).toHaveLength(1);
    expect(balance(ledger)).toBe(25_000);
  });

  it("TOPUP-06: pembayaran kurang dari nominal ditolak", () => {
    const topup: TopupRow = { id: "t3", amount: 100_000, status: "waiting_payment" };
    const ledger: LedgerEntry[] = [];
    expect(settleTopup(topup, 90_000, ledger)).toBe("AMOUNT_MISMATCH");
    expect(ledger).toHaveLength(0);
    expect(topup.status).toBe("waiting_payment");
  });

  it("TOPUP-07: top-up kedaluwarsa tidak bisa disettle", () => {
    const topup: TopupRow = { id: "t4", amount: 50_000, status: "expired" };
    const ledger: LedgerEntry[] = [];
    expect(settleTopup(topup, 50_000, ledger)).toBe("INVALID_STATE");
    expect(ledger).toHaveLength(0);
  });

  it("TOPUP-08: kelebihan bayar tetap dikredit sebesar nominal top-up", () => {
    const topup: TopupRow = { id: "t5", amount: 25_000, status: "waiting_payment" };
    const ledger: LedgerEntry[] = [];
    expect(settleTopup(topup, 30_000, ledger)).toBe("credited");
    expect(balance(ledger)).toBe(25_000);
  });

  it("TOPUP-09: saldo gabungan refund + topup dihitung benar", () => {
    const ledger: LedgerEntry[] = [
      { key: "refund:r1", direction: "credit", amount: 40_000, source: "refund" },
      { key: "topup:t6", direction: "credit", amount: 25_000, source: "topup" },
      { key: "order:o1", direction: "debit", amount: 30_000, source: "adjustment" },
    ];
    expect(balance(ledger)).toBe(35_000);
  });
});
