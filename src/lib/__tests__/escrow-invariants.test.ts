import { describe, expect, it } from "vitest";

/**
 * Unit test untuk invariant finansial yang didefinisikan di
 * docs/marketplace/03-escrow-audit-dan-rancangan.md (Section 5.5).
 *
 * Test ini memverifikasi LOGIKA ATURAN, bukan menjalankan SQL.
 * Untuk verifikasi SQL aktual dibutuhkan integration test dengan Supabase.
 */

// --- Helpers yang mensimulasikan aturan idempotency key ---

function sellerCreditKey(orderId: string, storeId: string) {
  return `sale:${orderId}:${storeId}`;
}

function sellerDebitKey(refundId: string, storeId: string) {
  return `refund:${refundId}:${storeId}`;
}

function cancelReversalKey(orderId: string) {
  return `cancel:${orderId}`;
}

function expireReversalKey(orderId: string) {
  return `expire:${orderId}`;
}

function buyerRefundCreditKey(refundId: string) {
  return `refund:${refundId}`;
}

// --- Simulasi ledger append-only ---

type LedgerEntry = {
  key: string;
  direction: "credit" | "debit";
  amount: number;
  source: string;
};

function balance(entries: LedgerEntry[]): number {
  return entries.reduce((acc, e) => acc + (e.direction === "credit" ? e.amount : -e.amount), 0);
}

function hasKey(entries: LedgerEntry[], key: string): boolean {
  return entries.some((e) => e.key === key);
}

describe("INV: Invariant Finansial Escrow", () => {
  it("INV-01: saldo seller = credits - debits", () => {
    const ledger: LedgerEntry[] = [
      { key: "sale:o1:s1", direction: "credit", amount: 100_000, source: "sale" },
      { key: "sale:o2:s1", direction: "credit", amount: 50_000, source: "sale" },
      { key: "refund:r1:s1", direction: "debit", amount: 100_000, source: "refund" },
    ];
    expect(balance(ledger)).toBe(50_000);
  });

  it("INV-02: order completed dengan store_id harus punya seller credit", () => {
    const orderId = "order-123";
    const storeId = "store-abc";
    const key = sellerCreditKey(orderId, storeId);
    const ledger: LedgerEntry[] = [{ key, direction: "credit", amount: 75_000, source: "sale" }];
    expect(hasKey(ledger, key)).toBe(true);
  });

  it("INV-03: refund completed setelah release mengimbangi seller credit", () => {
    const refundId = "refund-456";
    const storeId = "store-abc";
    const key = sellerDebitKey(refundId, storeId);
    const ledger: LedgerEntry[] = [
      { key: "sale:o1:store-abc", direction: "credit", amount: 75_000, source: "sale" },
      { key, direction: "debit", amount: 75_000, source: "refund" },
    ];
    expect(hasKey(ledger, key)).toBe(true);
    expect(balance(ledger)).toBe(0);
  });

  it("INV-04: cancelled order dengan credit_used harus punya reversal", () => {
    const orderId = "order-789";
    const creditUsed = 30_000;
    const key = cancelReversalKey(orderId);

    const buyerLedger: LedgerEntry[] = [
      { key: `order:${orderId}`, direction: "debit", amount: creditUsed, source: "checkout" },
      { key, direction: "credit", amount: creditUsed, source: "reversal" },
    ];
    expect(balance(buyerLedger)).toBe(0);
    expect(hasKey(buyerLedger, key)).toBe(true);
  });

  it("INV-04b: expired order dengan credit_used harus punya reversal", () => {
    const orderId = "order-expired";
    const creditUsed = 20_000;
    const key = expireReversalKey(orderId);

    const buyerLedger: LedgerEntry[] = [
      { key: `order:${orderId}`, direction: "debit", amount: creditUsed, source: "checkout" },
      { key, direction: "credit", amount: creditUsed, source: "reversal" },
    ];
    expect(balance(buyerLedger)).toBe(0);
    expect(hasKey(buyerLedger, key)).toBe(true);
  });

  it("INV-05: buyer saldo tidak boleh negatif setelah operasi normal", () => {
    const buyerLedger: LedgerEntry[] = [
      { key: "refund:r1", direction: "credit", amount: 50_000, source: "refund" },
      { key: "order:o1", direction: "debit", amount: 50_000, source: "checkout" },
    ];
    expect(balance(buyerLedger)).toBeGreaterThanOrEqual(0);
  });

  it("INV-07: idempotency key unik per store per order (seller credit)", () => {
    const key1 = sellerCreditKey("order-1", "store-a");
    const key2 = sellerCreditKey("order-1", "store-b");
    const key3 = sellerCreditKey("order-1", "store-a");

    expect(key1).not.toBe(key2);
    expect(key1).toBe(key3);
  });

  it("INV-07b: idempotency key unik per store per refund (seller debit)", () => {
    const key1 = sellerDebitKey("refund-1", "store-a");
    const key2 = sellerDebitKey("refund-1", "store-b");

    expect(key1).not.toBe(key2);
  });

  it("buyer refund credit key format benar", () => {
    expect(buyerRefundCreditKey("ref-123")).toBe("refund:ref-123");
  });
});

describe("Idempotency: operasi ulang tidak mengubah saldo", () => {
  it("kredit seller idempoten: insert kedua di-skip", () => {
    const key = sellerCreditKey("o1", "s1");
    const ledger: LedgerEntry[] = [];
    const seenKeys = new Set<string>();

    function idempotentInsert(entry: LedgerEntry) {
      if (seenKeys.has(entry.key)) return "already_credited";
      seenKeys.add(entry.key);
      ledger.push(entry);
      return "credited";
    }

    expect(idempotentInsert({ key, direction: "credit", amount: 100_000, source: "sale" })).toBe(
      "credited",
    );
    expect(idempotentInsert({ key, direction: "credit", amount: 100_000, source: "sale" })).toBe(
      "already_credited",
    );
    expect(ledger).toHaveLength(1);
    expect(balance(ledger)).toBe(100_000);
  });

  it("debit refund seller idempoten: insert kedua di-skip", () => {
    const key = sellerDebitKey("r1", "s1");
    const ledger: LedgerEntry[] = [];
    const seenKeys = new Set<string>();

    function idempotentInsert(entry: LedgerEntry) {
      if (seenKeys.has(entry.key)) return "already_debited";
      seenKeys.add(entry.key);
      ledger.push(entry);
      return "debited";
    }

    expect(idempotentInsert({ key, direction: "debit", amount: 100_000, source: "refund" })).toBe(
      "debited",
    );
    expect(idempotentInsert({ key, direction: "debit", amount: 100_000, source: "refund" })).toBe(
      "already_debited",
    );
    expect(ledger).toHaveLength(1);
  });

  it("reversal cancel idempoten via ON CONFLICT DO NOTHING", () => {
    const key = cancelReversalKey("o1");
    const ledger: LedgerEntry[] = [];
    const seenKeys = new Set<string>();

    function idempotentInsert(entry: LedgerEntry) {
      if (seenKeys.has(entry.key)) return;
      seenKeys.add(entry.key);
      ledger.push(entry);
    }

    idempotentInsert({ key, direction: "credit", amount: 30_000, source: "reversal" });
    idempotentInsert({ key, direction: "credit", amount: 30_000, source: "reversal" });
    expect(ledger).toHaveLength(1);
  });
});

describe("Skenario alur lengkap", () => {
  it("beli -> kredit seller -> refund -> debit seller -> saldo seller 0", () => {
    const sellerLedger: LedgerEntry[] = [];
    const buyerLedger: LedgerEntry[] = [];

    sellerLedger.push({
      key: sellerCreditKey("o1", "s1"),
      direction: "credit",
      amount: 100_000,
      source: "sale",
    });

    expect(balance(sellerLedger)).toBe(100_000);

    sellerLedger.push({
      key: sellerDebitKey("r1", "s1"),
      direction: "debit",
      amount: 100_000,
      source: "refund",
    });
    buyerLedger.push({
      key: buyerRefundCreditKey("r1"),
      direction: "credit",
      amount: 100_000,
      source: "refund",
    });

    expect(balance(sellerLedger)).toBe(0);
    expect(balance(buyerLedger)).toBe(100_000);
  });

  it("beli dengan saldo -> batal -> saldo kembali", () => {
    const buyerLedger: LedgerEntry[] = [
      { key: "refund:prev", direction: "credit", amount: 50_000, source: "refund" },
    ];
    expect(balance(buyerLedger)).toBe(50_000);

    buyerLedger.push({
      key: "order:o2",
      direction: "debit",
      amount: 30_000,
      source: "checkout",
    });
    expect(balance(buyerLedger)).toBe(20_000);

    buyerLedger.push({
      key: cancelReversalKey("o2"),
      direction: "credit",
      amount: 30_000,
      source: "reversal",
    });
    expect(balance(buyerLedger)).toBe(50_000);
  });
});
