import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regresi keamanan webhook SumoPod (SEC-09/10/11).
 *
 * Menguji verifyWebhook tanpa memanggil provider:
 * - tanpa kredensial → ditolak
 * - token salah → ditolak
 * - token benar → diterima
 * - signature Svix valid → diterima
 * - timestamp kedaluwarsa (replay) → ditolak
 * - signature tidak cocok → ditolak
 */

const ENV_KEYS = ["SUMOPOD_WEBHOOK_TOKEN", "SUMOPOD_WEBHOOK_SECRET"] as const;

async function verify(raw: string, headers: Record<string, string>) {
  const mod = await import("../sumopod.server");
  return mod.verifyWebhook(raw, new Headers(headers));
}

async function svixSignature(secretBase64: string, id: string, ts: string, raw: string) {
  const keyBytes = Uint8Array.from(atob(secretBase64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${ts}.${raw}`),
  );
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

const SECRET_B64 = btoa("super-secret-webhook-key-32bytes!");

describe("verifyWebhook", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env["SUMOPOD_WEBHOOK_TOKEN"];
    delete process.env["SUMOPOD_WEBHOOK_SECRET"];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of ENV_KEYS) delete process.env[k];
  });

  it("menolak saat tidak ada kredensial yang dikonfigurasi", async () => {
    await expect(verify("{}", {})).resolves.toBe(false);
  });

  it("menolak token yang salah", async () => {
    process.env["SUMOPOD_WEBHOOK_TOKEN"] = "token-benar";
    await expect(verify("{}", { "x-webhook-token": "token-salah" })).resolves.toBe(false);
  });

  it("menerima token yang benar", async () => {
    process.env["SUMOPOD_WEBHOOK_TOKEN"] = "token-benar";
    await expect(verify("{}", { "x-webhook-token": "token-benar" })).resolves.toBe(true);
  });

  it("menolak signature dengan timestamp kedaluwarsa (replay)", async () => {
    process.env["SUMOPOD_WEBHOOK_SECRET"] = `whsec_${SECRET_B64}`;
    const raw = '{"event_type":"payment.paid"}';
    const id = "msg_1";
    const oldTs = String(Math.floor(Date.now() / 1000) - 3600);
    const sig = await svixSignature(SECRET_B64, id, oldTs, raw);

    await expect(
      verify(raw, {
        "svix-id": id,
        "svix-timestamp": oldTs,
        "svix-signature": `v1,${sig}`,
      }),
    ).resolves.toBe(false);
  });

  it("menerima signature valid dengan timestamp segar", async () => {
    process.env["SUMOPOD_WEBHOOK_SECRET"] = `whsec_${SECRET_B64}`;
    const raw = '{"event_type":"payment.paid"}';
    const id = "msg_2";
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await svixSignature(SECRET_B64, id, ts, raw);

    await expect(
      verify(raw, {
        "svix-id": id,
        "svix-timestamp": ts,
        "svix-signature": `v1,${sig}`,
      }),
    ).resolves.toBe(true);
  });

  it("menolak signature yang tidak cocok untuk body yang berbeda", async () => {
    process.env["SUMOPOD_WEBHOOK_SECRET"] = `whsec_${SECRET_B64}`;
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await svixSignature(SECRET_B64, "msg_3", ts, '{"amount":1000}');

    await expect(
      verify('{"amount":999999}', {
        "svix-id": "msg_3",
        "svix-timestamp": ts,
        "svix-signature": `v1,${sig}`,
      }),
    ).resolves.toBe(false);
  });

  it("menolak timestamp yang bukan angka", async () => {
    process.env["SUMOPOD_WEBHOOK_SECRET"] = `whsec_${SECRET_B64}`;
    await expect(
      verify("{}", {
        "svix-id": "msg_4",
        "svix-timestamp": "bukan-angka",
        "svix-signature": "v1,abc",
      }),
    ).resolves.toBe(false);
  });
});
