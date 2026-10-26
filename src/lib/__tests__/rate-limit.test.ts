import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit test untuk rate limiting (FASE 0 #3).
 *
 * Dua kebijakan kegagalan yang berbeda:
 * - Bucket finansial (order/payment/refund/topup/qris/po): fail-closed.
 * - Bucket non-finansial (inquiry, seller.product): fail-open.
 */

const { rpcMock, mode } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  mode: { throwOnCall: null as Error | null },
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: (...args: unknown[]) => {
      if (mode.throwOnCall) throw mode.throwOnCall;
      return rpcMock(...args);
    },
  },
}));

import { enforceRateLimit } from "../rate-limit.server";

describe("enforceRateLimit", () => {
  beforeEach(() => { rpcMock.mockReset(); mode.throwOnCall = null; });

  it("mengizinkan (null) ketika RPC menyatakan allowed", async () => {
    rpcMock.mockResolvedValue({ data: { allowed: true, count: 1, limit: 10 }, error: null });
    await expect(enforceRateLimit("user-1", "inquiry.create")).resolves.toBeNull();
  });

  it("memblokir dengan pesan ramah ketika limit tercapai", async () => {
    rpcMock.mockResolvedValue({
      data: { allowed: false, count: 10, limit: 10, retry_after: 60 },
      error: null,
    });
    const result = await enforceRateLimit("user-1", "inquiry.create");
    expect(result).not.toBeNull();
    expect(result?.ok).toBe(false);
    expect(result?.reason).toBe("limited");
    expect(result?.error).toMatch(/terlalu banyak/i);
  });

  it("mengirim bucket, subject, dan kebijakan yang benar ke RPC", async () => {
    rpcMock.mockResolvedValue({ data: { allowed: true }, error: null });
    await enforceRateLimit("user-42", "refund.request");
    expect(rpcMock).toHaveBeenCalledWith("check_rate_limit", {
      _bucket: "refund.request",
      _subject: "user-42",
      _limit: 5,
      _window_seconds: 3600,
    });
  });

  it("memakai kebijakan QRIS yang benar (10 / 300 detik)", async () => {
    rpcMock.mockResolvedValue({ data: { allowed: true }, error: null });
    await enforceRateLimit("u", "qris.create");
    expect(rpcMock).toHaveBeenCalledWith("check_rate_limit", {
      _bucket: "qris.create",
      _subject: "u",
      _limit: 10,
      _window_seconds: 300,
    });
  });
});

describe("kegagalan limiter", () => {
  beforeEach(() => { rpcMock.mockReset(); mode.throwOnCall = null; });

  it.each([
    "order.create",
    "payment.proof",
    "refund.request",
    "topup.create",
    "qris.create",
    "po.create",
  ] as const)("fail-closed pada bucket finansial %s saat RPC error", async (bucket) => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "db down" } });
    const result = await enforceRateLimit("user-1", bucket);
    expect(result).not.toBeNull();
    expect(result?.ok).toBe(false);
    expect(result?.reason).toBe("unavailable");
    expect(result?.error).not.toMatch(/terlalu banyak/i);
  });

  it("fail-closed pada bucket finansial saat RPC melempar exception", async () => {
    mode.throwOnCall = new Error("network timeout");
    const result = await enforceRateLimit("user-1", "order.create");
    expect(result?.ok).toBe(false);
    expect(result?.reason).toBe("unavailable");
  });

  it("fail-closed saat RPC tidak dapat dipanggil sama sekali", async () => {
    mode.throwOnCall = new Error("cannot reach rpc");
    const result = await enforceRateLimit("user-1", "topup.create");
    expect(result?.ok).toBe(false);
    expect(result?.reason).toBe("unavailable");
  });

  it.each([
    "inquiry.create",
    "inquiry.message",
    "seller.product",
    "admin.seller.decision",
  ] as const)("tetap fail-open pada bucket non-finansial %s", async (bucket) => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "db down" } });
    await expect(enforceRateLimit("user-1", bucket)).resolves.toBeNull();
  });

  it("pulih normal setelah limiter kembali sehat", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "db down" } });
    expect((await enforceRateLimit("u", "order.create"))?.reason).toBe("unavailable");

    rpcMock.mockResolvedValueOnce({ data: { allowed: true }, error: null });
    await expect(enforceRateLimit("u", "order.create")).resolves.toBeNull();
  });
});
