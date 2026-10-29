import { createHmac, createSign, createVerify, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  accessTokenSignature,
  assessSettlement,
  buildPartnerReference,
  buyerStateFor,
  formatSnapAmount,
  mapTransactionStatus,
  parseNotification,
  parseSnapAmount,
  parseStoredQr,
  paymentNumberFromReference,
  sha256Hex,
  shopeepayConfig,
  snapTimestamp,
  timestampFresh,
  transactionSignature,
  verifyCallbackSignature,
} from "@/lib/shopeepay.server";

/** Fixture lokal: bukan kunci ShopeePay, hanya untuk menguji algoritma tanda tangan. */
const merchant = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const shopee = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const CALLBACK = "https://ebrystore.example/api/public/payments/webhook/shopeepay";

function signCallback(raw: string, timestamp: string, key = shopee.privateKey) {
  const s = createSign("RSA-SHA256");
  s.update(`POST:${CALLBACK}:${sha256Hex(raw)}:${timestamp}`);
  return s.sign(key, "base64");
}

const fullEnv = {
  SHOPEEPAY_ENABLED: "true",
  SHOPEEPAY_CLIENT_ID: "client",
  SHOPEEPAY_CLIENT_SECRET: "secret",
  SHOPEEPAY_PRIVATE_KEY: merchant.privateKey.replace(/\n/g, "\\n"),
  SHOPEEPAY_PUBLIC_KEY: shopee.publicKey,
  SHOPEEPAY_MERCHANT_ID: "M1",
  SHOPEEPAY_STORE_ID: "S1",
  SHOPEEPAY_CALLBACK_URL: CALLBACK,
};

const cfg = { merchantId: "M1", storeId: "S1" };
const paidEvent = {
  partnerReferenceNo: "PAY-20261029-000123",
  amount: 150000,
  currency: "IDR",
  merchantId: "M1",
  storeId: "S1",
  status: "paid" as const,
};

describe("SPAY config: nonaktif secara default", () => {
  it("SPAY-01: tanpa SHOPEEPAY_ENABLED adapter mati walau kredensial ada", () => {
    expect(shopeepayConfig({ ...fullEnv, SHOPEEPAY_ENABLED: undefined })).toBeNull();
  });
  it("SPAY-02: kredensial kurang satu → mati", () => {
    expect(shopeepayConfig({ ...fullEnv, SHOPEEPAY_STORE_ID: "" })).toBeNull();
  });
  it("SPAY-03: default sandbox, PEM \\n dipulihkan", () => {
    const c = shopeepayConfig(fullEnv)!;
    expect(c.baseUrl).toBe("https://api.snap.uat.airpay.co.id");
    expect(c.privateKey).toContain("\n");
    expect(shopeepayConfig({ ...fullEnv, SHOPEEPAY_ENV: "live" })!.baseUrl).toBe(
      "https://api.snap.airpay.co.id",
    );
  });
});

describe("SPAY format", () => {
  it("SPAY-04: timestamp WIB +07:00", () => {
    expect(snapTimestamp(new Date("2026-10-29T06:05:09Z"))).toBe("2026-10-29T13:05:09+07:00");
  });
  it("SPAY-05: nominal valid dan tidak valid", () => {
    expect(formatSnapAmount(10000)).toBe("10000.00");
    expect(() => formatSnapAmount(0)).toThrow();
    expect(() => formatSnapAmount(-5)).toThrow();
    expect(() => formatSnapAmount(10.5)).toThrow();
    expect(parseSnapAmount("10000.00")).toBe(10000);
    expect(parseSnapAmount("10000")).toBe(10000);
    expect(parseSnapAmount("10000.50")).toBeNull();
    expect(parseSnapAmount("1e5")).toBeNull();
    expect(parseSnapAmount(10000)).toBeNull();
  });
  it("SPAY-06: pemetaan status resmi", () => {
    expect(mapTransactionStatus("00")).toBe("paid");
    expect(mapTransactionStatus("01")).toBe("pending");
    expect(mapTransactionStatus("03")).toBe("pending");
    expect(mapTransactionStatus("04")).toBe("refunded");
    expect(mapTransactionStatus("05")).toBe("cancelled");
    expect(mapTransactionStatus("06")).toBe("failed");
    expect(mapTransactionStatus("07")).toBe("not_found");
    expect(mapTransactionStatus("99")).toBe("pending");
    expect(mapTransactionStatus(undefined)).toBe("pending");
  });
});

describe("SPAY referensi", () => {
  it("SPAY-07: referensi unik per QR dan dapat dipetakan balik", () => {
    expect(buildPartnerReference("PAY-20261029-000123", 0)).toBe("PAY-20261029-000123");
    expect(buildPartnerReference("PAY-20261029-000123", 2)).toBe("PAY-20261029-000123-R2");
    expect(paymentNumberFromReference("PAY-20261029-000123-R2")).toBe("PAY-20261029-000123");
    expect(paymentNumberFromReference("PAY-20261029-000123")).toBe("PAY-20261029-000123");
    expect(paymentNumberFromReference("TOP-20261029-000123")).toBeNull();
    expect(paymentNumberFromReference("PAY-20261029-000123; drop")).toBeNull();
  });
  it("SPAY-08: qr_reference SumoPod tidak dibaca sebagai ShopeePay", () => {
    expect(parseStoredQr(JSON.stringify({ payUrl: "x", expiredAt: "y" }))).toBeNull();
    expect(parseStoredQr("not json")).toBeNull();
    expect(
      parseStoredQr(
        JSON.stringify({ provider: "shopeepay", partnerReferenceNo: "PAY-1", references: ["PAY-1"] }),
      )?.provider,
    ).toBe("shopeepay");
  });
});

describe("SPAY signature", () => {
  it("SPAY-09: access token SHA256withRSA atas clientId|timestamp", () => {
    const ts = "2026-10-29T13:05:09+07:00";
    const sig = accessTokenSignature("client", ts, merchant.privateKey);
    const v = createVerify("RSA-SHA256");
    v.update(`client|${ts}`);
    expect(v.verify(merchant.publicKey, sig, "base64")).toBe(true);
  });
  it("SPAY-10: transaksional HMAC-SHA512 dengan body hash lowercase", () => {
    const body = JSON.stringify({ a: 1 });
    const ts = "2026-10-29T13:05:09+07:00";
    const expected = createHmac("sha512", "secret")
      .update(`POST:/v1.0/qr/qr-mpm-query:tok:${sha256Hex(body)}:${ts}`)
      .digest("base64");
    expect(
      transactionSignature({
        method: "post",
        path: "/v1.0/qr/qr-mpm-query",
        accessToken: "tok",
        body,
        timestamp: ts,
        clientSecret: "secret",
      }),
    ).toBe(expected);
    expect(sha256Hex(body)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("SPAY-11: callback valid diterima", () => {
    const raw = '{"originalPartnerReferenceNo":"PAY-20261029-000123"}';
    const ts = "2026-10-29T13:05:09+07:00";
    expect(
      verifyCallbackSignature({
        rawBody: raw,
        callbackUrl: CALLBACK,
        timestamp: ts,
        signature: signCallback(raw, ts),
        publicKey: shopee.publicKey,
      }),
    ).toBe(true);
  });
  it("SPAY-12: signature palsu, body diubah, kunci lain, header hilang → ditolak", () => {
    const raw = '{"amount":{"value":"150000.00"}}';
    const ts = "2026-10-29T13:05:09+07:00";
    const sig = signCallback(raw, ts);
    const base = { callbackUrl: CALLBACK, timestamp: ts, publicKey: shopee.publicKey };
    expect(verifyCallbackSignature({ ...base, rawBody: raw.replace("150000", "1"), signature: sig })).toBe(false);
    expect(verifyCallbackSignature({ ...base, rawBody: raw, signature: signCallback(raw, ts, merchant.privateKey) })).toBe(false);
    expect(verifyCallbackSignature({ ...base, rawBody: raw, signature: "AAAA" })).toBe(false);
    expect(verifyCallbackSignature({ ...base, rawBody: raw, signature: null })).toBe(false);
    expect(verifyCallbackSignature({ ...base, rawBody: raw, timestamp: null, signature: sig })).toBe(false);
    expect(verifyCallbackSignature({ ...base, rawBody: raw, signature: sig, publicKey: "bukan pem" })).toBe(false);
  });
  it("SPAY-13: timestamp kedaluwarsa ditolak (anti replay)", () => {
    const now = Date.parse("2026-10-29T06:05:09Z");
    expect(timestampFresh("2026-10-29T13:05:09+07:00", now)).toBe(true);
    expect(timestampFresh("2026-10-29T12:00:00+07:00", now)).toBe(false);
    expect(timestampFresh("garbage", now)).toBe(false);
    expect(timestampFresh(null, now)).toBe(false);
  });
});

describe("SPAY aturan pelunasan", () => {
  const base = { cfg, issuedReferences: ["PAY-20261029-000123"], expectedAmount: 150000 };
  it("SPAY-14: semua cocok → boleh dilunasi", () => {
    expect(assessSettlement({ ...base, event: paidEvent })).toEqual({ ok: true });
  });
  it("SPAY-15: nominal beda (kurang atau lebih) ditolak", () => {
    expect(assessSettlement({ ...base, event: { ...paidEvent, amount: 149999 } }).ok).toBe(false);
    expect(assessSettlement({ ...base, event: { ...paidEvent, amount: 150001 } }).ok).toBe(false);
  });
  it("SPAY-16: referensi tidak diterbitkan untuk pembayaran ini ditolak", () => {
    expect(
      assessSettlement({ ...base, event: { ...paidEvent, partnerReferenceNo: "PAY-20261029-000999" } }),
    ).toEqual({ ok: false, reason: "reference not issued" });
  });
  it("SPAY-17: merchant/store/currency lain ditolak", () => {
    expect(assessSettlement({ ...base, event: { ...paidEvent, merchantId: "M2" } }).ok).toBe(false);
    expect(assessSettlement({ ...base, event: { ...paidEvent, storeId: "S2" } }).ok).toBe(false);
    expect(assessSettlement({ ...base, event: { ...paidEvent, currency: "USD" } }).ok).toBe(false);
  });
  it("SPAY-18: status selain 00 tidak pernah melunasi", () => {
    for (const status of ["pending", "failed", "refunded", "cancelled", "not_found"] as const) {
      expect(assessSettlement({ ...base, event: { ...paidEvent, status } }).ok).toBe(false);
    }
  });
});

describe("SPAY notifikasi", () => {
  it("SPAY-19: body MPM resmi diparse", () => {
    const n = parseNotification({
      originalReferenceNo: "SP123",
      originalPartnerReferenceNo: "PAY-20261029-000123-R1",
      latestTransactionStatus: "00",
      amount: { value: "150000.00", currency: "IDR" },
      externalStoreId: "S1",
      additionalInfo: { merchantId: "M1" },
    });
    expect(n).toMatchObject({ partnerReferenceNo: "PAY-20261029-000123-R1", amount: 150000, status: "paid" });
  });
  it("SPAY-20: body cacat ditolak", () => {
    expect(parseNotification(null)).toBeNull();
    expect(parseNotification({ originalPartnerReferenceNo: "PAY-1" })).toBeNull();
    expect(parseNotification({ originalPartnerReferenceNo: "x".repeat(65), amount: { value: "1.00" } })).toBeNull();
  });
});

describe("SPAY status pembeli", () => {
  const now = Date.parse("2026-10-29T06:00:00Z");
  it("SPAY-21: kedaluwarsa hanya bila belum lunas", () => {
    expect(buyerStateFor({ status: "pending" }, "2026-10-29T05:00:00Z", now)).toBe("expired");
    expect(buyerStateFor({ status: "paid" }, "2026-10-29T05:00:00Z", now)).toBe("paid");
    expect(buyerStateFor({ status: "pending" }, "2026-10-29T07:00:00Z", now)).toBe("pending");
    expect(buyerStateFor({ status: "error" }, null, now)).toBe("unavailable");
    expect(buyerStateFor({ status: "failed" }, null, now)).toBe("failed");
  });
});

describe("SPAY kontrak integritas (statis)", () => {
  const adapter = readFileSync("src/lib/shopeepay.server.ts", "utf8");
  const fns = readFileSync("src/lib/payments.functions.ts", "utf8");
  const hook = readFileSync("src/routes/api/public/payments/webhook.shopeepay.ts", "utf8");
  const sumopodHook = readFileSync("src/routes/api/public/payments/webhook.sumopod.ts", "utf8");
  const ui = readFileSync("src/components/ebry/qris-payment.tsx", "utf8");

  it("SPAY-22: pelunasan hanya lewat RPC atomik settle_gateway_payment", () => {
    expect(adapter).toContain('rpc("settle_gateway_payment"');
    expect(adapter).not.toMatch(/\.from\("payments"\)\s*\.update/);
    expect(fns).not.toMatch(/status:\s*"paid"\s*,?\s*\n?\s*\}\)\s*\.eq/);
  });
  it("SPAY-23: tidak ada token sesi portal / endpoint tidak resmi", () => {
    for (const src of [adapter, fns, hook]) {
      expect(src).not.toMatch(/SHOPEE_TOKEN|partner-web|api\.qrserver\.com/);
    }
  });
  it("SPAY-24: callback dibatasi ukuran sebelum verifikasi tanda tangan, lalu re-query", () => {
    expect(hook.indexOf("payload too large")).toBeLessThan(hook.indexOf("verifyCallbackSignature"));
    expect(hook).toContain("verifyAndSettle");
    expect(hook).toContain('"2005600"');
  });
  it("SPAY-25: SumoPod tidak lagi menulis status di luar CHECK payment_events", () => {
    expect(sumopodHook).not.toContain('"skipped"');
    expect(sumopodHook).toContain("payload_hash");
  });
  it("SPAY-26: frontend tidak memegang kunci atau melunasi", () => {
    expect(ui).not.toMatch(/SHOPEEPAY_|privateKey|settle_gateway|supabaseAdmin|shopeepay\.server/);
  });
});
