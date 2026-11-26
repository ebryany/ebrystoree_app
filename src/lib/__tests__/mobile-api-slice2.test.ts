import { describe, expect, it, vi } from "vitest";
import { handleMobileCommerceRoute, type MobileCommerceHelpers } from "../mobile-commerce.server";
import { mobileErr, mobileOk } from "../mobile-api.server";

function req(path: string, init: RequestInit = {}) {
  return new Request(`https://app.ebrystore.my.id${path}`, init);
}

function makeHelpers(overrides: Partial<MobileCommerceHelpers> = {}): MobileCommerceHelpers {
  return {
    ok: mobileOk,
    err: mobileErr,
    readJsonBody: async (request) => {
      const raw = await request.text();
      return { ok: true, body: raw ? JSON.parse(raw) : {} };
    },
    requireAuth: vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      message: "Sesi tidak valid.",
    }),
    checkPublicRateLimit: vi.fn().mockResolvedValue(null),
    checkFeature: vi.fn().mockResolvedValue(true),
    checkUserRateLimit: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe("Mobile API v1 Slice 2 (Commerce, Payments, Library, Notifications, Profile)", () => {
  it("validates cart items via authoritative server reader and rejects oversized arrays", async () => {
    const tooMany = Array.from({ length: 51 }, () => ({
      productId: "11111111-1111-4111-8111-111111111111",
    }));
    const url = new URL("https://app.ebrystore.my.id/api/mobile/v1/cart/validate");
    const bad = await handleMobileCommerceRoute(
      req("/api/mobile/v1/cart/validate", {
        method: "POST",
        body: JSON.stringify({ items: tooMany }),
      }),
      url.pathname,
      "POST",
      url,
      makeHelpers(),
    );
    expect(bad?.status).toBe(400);

    const good = await handleMobileCommerceRoute(
      req("/api/mobile/v1/cart/validate", {
        method: "POST",
        body: JSON.stringify({
          items: [{ productId: "11111111-1111-4111-8111-111111111111" }],
        }),
      }),
      url.pathname,
      "POST",
      url,
      makeHelpers({
        validateCart: vi.fn().mockResolvedValue({
          items: [
            { productId: "11111111-1111-4111-8111-111111111111", price: 29000, available: true },
          ],
          error: null,
        }),
      }),
    );
    expect(good?.status).toBe(200);
    const json = await good!.json();
    expect(json.ok).toBe(true);
    expect(json.data.items[0].price).toBe(29000);
  });

  it("blocks digital checkout when feature flag is disabled or unauthenticated", async () => {
    const url = new URL("https://app.ebrystore.my.id/api/mobile/v1/orders/digital");
    const unauth = await handleMobileCommerceRoute(
      req(url.pathname, { method: "POST", body: "{}" }),
      url.pathname,
      "POST",
      url,
      makeHelpers(),
    );
    expect(unauth?.status).toBe(401);

    const disabled = await handleMobileCommerceRoute(
      req(url.pathname, {
        method: "POST",
        body: JSON.stringify({
          productId: "11111111-1111-4111-8111-111111111111",
          quantity: 1,
          idempotencyKey: "idem-12345678",
        }),
      }),
      url.pathname,
      "POST",
      url,
      makeHelpers({
        requireAuth: vi.fn().mockResolvedValue({
          ok: true,
          context: { supabase: {} as never, userId: "u1", claims: {} },
        }),
        checkFeature: vi.fn().mockResolvedValue(false),
      }),
    );
    expect(disabled?.status).toBe(403);
    expect((await disabled!.json()).error.code).toBe("FEATURE_DISABLED");
  });

  it("creates digital order and optionally applies credit atomically", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          order_id: "22222222-2222-4222-8222-222222222222",
          order_number: "EBR-001",
          duplicate: false,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { credit_used: 15000, amount_due: 14000, duplicate: false },
        error: null,
      });
    const url = new URL("https://app.ebrystore.my.id/api/mobile/v1/orders/digital");
    const res = await handleMobileCommerceRoute(
      req(url.pathname, {
        method: "POST",
        body: JSON.stringify({
          productId: "11111111-1111-4111-8111-111111111111",
          quantity: 1,
          idempotencyKey: "idem-12345678",
          useCredit: true,
        }),
      }),
      url.pathname,
      "POST",
      url,
      makeHelpers({
        requireAuth: vi.fn().mockResolvedValue({
          ok: true,
          context: { supabase: { rpc } as never, userId: "u1", claims: {} },
        }),
      }),
    );

    expect(res?.status).toBe(201);
    const json = await res!.json();
    expect(json.data).toEqual({
      orderId: "22222222-2222-4222-8222-222222222222",
      orderNumber: "EBR-001",
      duplicate: false,
      creditUsed: 15000,
      amountDue: 14000,
    });
  });

  it("enforces cancel reason length and calls cancel_own_order RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const url = new URL(
      "https://app.ebrystore.my.id/api/mobile/v1/orders/22222222-2222-4222-8222-222222222222/cancel",
    );
    const authed = makeHelpers({
      requireAuth: vi.fn().mockResolvedValue({
        ok: true,
        context: { supabase: { rpc } as never, userId: "u1", claims: {} },
      }),
    });

    const tooShort = await handleMobileCommerceRoute(
      req(url.pathname, { method: "POST", body: JSON.stringify({ reason: "no" }) }),
      url.pathname,
      "POST",
      url,
      authed,
    );
    expect(tooShort?.status).toBe(400);

    const valid = await handleMobileCommerceRoute(
      req(url.pathname, {
        method: "POST",
        body: JSON.stringify({ reason: "Salah pilih varian produk" }),
      }),
      url.pathname,
      "POST",
      url,
      authed,
    );
    expect(valid?.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("cancel_own_order", {
      _order_id: "22222222-2222-4222-8222-222222222222",
      _reason: "Salah pilih varian produk",
    });
  });

  it("blocks cross-user avatar path injection with 403 FORBIDDEN", async () => {
    const url = new URL("https://app.ebrystore.my.id/api/mobile/v1/profile/avatar");
    const res = await handleMobileCommerceRoute(
      req(url.pathname, {
        method: "POST",
        body: JSON.stringify({ avatarUrl: "/api/public/avatar/other-user/pic.png" }),
      }),
      url.pathname,
      "POST",
      url,
      makeHelpers({
        requireAuth: vi.fn().mockResolvedValue({
          ok: true,
          context: { supabase: {} as never, userId: "my-user-id", claims: {} },
        }),
      }),
    );

    expect(res?.status).toBe(403);
    expect((await res!.json()).error.code).toBe("FORBIDDEN");
  });

  it("reveals stock code via get_my_stock_code RPC for authenticated owner", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { code: "ACC-SECRET-999" }, error: null });
    const url = new URL(
      "https://app.ebrystore.my.id/api/mobile/v1/entitlements/33333333-3333-4333-8333-333333333333/stock-code",
    );
    const res = await handleMobileCommerceRoute(
      req(url.pathname, { method: "POST" }),
      url.pathname,
      "POST",
      url,
      makeHelpers({
        requireAuth: vi.fn().mockResolvedValue({
          ok: true,
          context: { supabase: { rpc } as never, userId: "u1", claims: {} },
        }),
      }),
    );

    expect(res?.status).toBe(200);
    expect(await res!.json()).toEqual({ ok: true, data: { code: "ACC-SECRET-999" } });
  });

  it("marks all notifications read scoped strictly to authenticated recipient", async () => {
    const isFn = vi.fn().mockResolvedValue({ error: null });
    const eqFn = vi.fn().mockReturnValue({ is: isFn });
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
    const fromFn = vi.fn().mockReturnValue({ update: updateFn });
    const url = new URL("https://app.ebrystore.my.id/api/mobile/v1/notifications/read-all");

    const res = await handleMobileCommerceRoute(
      req(url.pathname, { method: "POST" }),
      url.pathname,
      "POST",
      url,
      makeHelpers({
        requireAuth: vi.fn().mockResolvedValue({
          ok: true,
          context: { supabase: { from: fromFn } as never, userId: "u-99", claims: {} },
        }),
      }),
    );

    expect(res?.status).toBe(200);
    expect(eqFn).toHaveBeenCalledWith("recipient_id", "u-99");
  });
});
