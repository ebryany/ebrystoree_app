import { describe, expect, it, vi } from "vitest";
import { handleMobileV1Request, type MobileV1Deps } from "../mobile-api.server";

function req(path: string, init: RequestInit = {}) {
  return new Request(`https://app.ebrystore.my.id${path}`, init);
}

function baseDeps(overrides: Partial<MobileV1Deps> = {}): Partial<MobileV1Deps> {
  return {
    checkRateLimit: vi.fn().mockResolvedValue(null),
    optionalAuth: vi.fn().mockResolvedValue(null),
    requireAuth: vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      message: "Sesi tidak valid.",
    }),
    ...overrides,
  };
}

describe("Mobile API v1 Slice 1", () => {
  it("returns bootstrap settings with no-store security headers", async () => {
    const res = await handleMobileV1Request(
      req("/api/mobile/v1/bootstrap"),
      baseDeps({
        readBootstrap: vi.fn().mockResolvedValue({
          mobile: { apiVersion: "v1", minVersionCode: 1, latestVersionCode: 1 },
          maintenance: { active: false, title: "", message: "", eta: "" },
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.mobile.apiVersion).toBe("v1");
  });

  it("blocks admin accounts on POST /auth/login with 403 ADMIN_BLOCKED", async () => {
    const res = await handleMobileV1Request(
      req("/api/mobile/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@ebrystore.my.id", password: "password1234" }),
      }),
      baseDeps({
        signInWithPassword: vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
          code: "ADMIN_BLOCKED",
          message: "Akun admin atau staf tidak dapat masuk melalui aplikasi pengguna.",
        }),
      }),
    );

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("ADMIN_BLOCKED");
  });

  it("rejects malformed login payload with 400 INVALID_INPUT", async () => {
    const res = await handleMobileV1Request(
      req("/api/mobile/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email", password: "short" }),
      }),
      baseDeps(),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("INVALID_INPUT");
  });

  it("verifies bearer session and blocks unauthenticated calls", async () => {
    const unauth = await handleMobileV1Request(
      req("/api/mobile/v1/auth/verify-session", { method: "POST" }),
      baseDeps(),
    );
    expect(unauth.status).toBe(401);

    const allowed = await handleMobileV1Request(
      req("/api/mobile/v1/auth/verify-session", {
        method: "POST",
        headers: { authorization: "Bearer a.b.c" },
      }),
      baseDeps({
        requireAuth: vi.fn().mockResolvedValue({
          ok: true,
          context: { supabase: {} as never, userId: "user-123", claims: { sub: "user-123" } },
        }),
      }),
    );
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({
      ok: true,
      data: { allowed: true, userId: "user-123" },
    });
  });

  it("sorts catalog products and rejects duplicate query keys", async () => {
    const dup = await handleMobileV1Request(req("/api/mobile/v1/products?q=a&q=b"), baseDeps());
    expect(dup.status).toBe(400);

    const res = await handleMobileV1Request(
      req("/api/mobile/v1/products?sort=price_asc&pageSize=10"),
      baseDeps({
        readProducts: vi.fn().mockResolvedValue({
          items: [
            {
              id: "1",
              name: "Mahal",
              slug: "mahal",
              price: 50000,
              discount_price: null,
              sold_count: 2,
            },
            {
              id: "2",
              name: "Diskon",
              slug: "diskon",
              price: 40000,
              discount_price: 20000,
              sold_count: 5,
            },
          ],
          error: null,
          total: 2,
          page: 0,
          nextPage: null,
        }) as unknown as MobileV1Deps["readProducts"],
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.items.map((x: { slug: string }) => x.slug)).toEqual(["diskon", "mahal"]);
  });

  it("rejects path traversal in product slug and returns 404 when not found", async () => {
    const bad = await handleMobileV1Request(req("/api/mobile/v1/products/foo%2Fbar"), baseDeps());
    expect(bad.status).toBe(400);

    const missing = await handleMobileV1Request(
      req("/api/mobile/v1/products/tidak-ada"),
      baseDeps({
        readProductDetail: vi.fn().mockResolvedValue({ error: null, data: null }),
      }),
    );
    expect(missing.status).toBe(404);
  });

  it("validates UUID on /p/:id and /stores/presence", async () => {
    const badId = await handleMobileV1Request(req("/api/mobile/v1/p/not-a-uuid"), baseDeps());
    expect(badId.status).toBe(400);

    const goodId = await handleMobileV1Request(
      req("/api/mobile/v1/p/11111111-1111-4111-8111-111111111111"),
      baseDeps({
        readProductSlugById: vi.fn().mockResolvedValue({ error: null, slug: "template-ui" }),
      }),
    );
    expect(goodId.status).toBe(200);
    expect((await goodId.json()).data.slug).toBe("template-ui");

    const badPresence = await handleMobileV1Request(
      req("/api/mobile/v1/stores/presence?ids=invalid"),
      baseDeps(),
    );
    expect(badPresence.status).toBe(400);
  });

  it("enforces Bearer auth and RPC execution on toggle-like and toggle-follow", async () => {
    const unauth = await handleMobileV1Request(
      req("/api/mobile/v1/social/toggle-like", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: "11111111-1111-4111-8111-111111111111" }),
      }),
      baseDeps(),
    );
    expect(unauth.status).toBe(401);

    const rpc = vi.fn().mockResolvedValue({ data: { liked: true, likes: 7 }, error: null });
    const authed = await handleMobileV1Request(
      req("/api/mobile/v1/social/toggle-like", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer a.b.c" },
        body: JSON.stringify({ productId: "11111111-1111-4111-8111-111111111111" }),
      }),
      baseDeps({
        requireAuth: vi.fn().mockResolvedValue({
          ok: true,
          context: { supabase: { rpc } as never, userId: "user-1", claims: { sub: "user-1" } },
        }),
      }),
    );
    expect(authed.status).toBe(200);
    expect(await authed.json()).toEqual({ ok: true, data: { liked: true, likes: 7 } });
  });

  it("returns 429 when rate limited and 405 on unsupported HTTP methods", async () => {
    const limited = await handleMobileV1Request(
      req("/api/mobile/v1/home"),
      baseDeps({
        checkRateLimit: vi.fn().mockResolvedValue({ error: "Terlalu banyak permintaan." }),
      }),
    );
    expect(limited.status).toBe(429);

    const methodNotAllowed = await handleMobileV1Request(
      req("/api/mobile/v1/home", { method: "DELETE" }),
      baseDeps(),
    );
    expect(methodNotAllowed.status).toBe(405);
  });
});
