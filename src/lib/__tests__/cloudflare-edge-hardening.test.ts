import { describe, expect, it, vi } from "vitest";

async function runServerWith(
  mockFetch: () => Promise<Response>,
  nodeEnv: "production" | "development" = "production",
) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.doMock("@tanstack/react-start/server-entry", () => ({
    default: { fetch: mockFetch },
  }));
  try {
    const { default: handler } = await import("@/server");
    return await handler.fetch(new Request("https://app.ebrystore.my.id/dashboard/pesanan/test.css"), {}, {});
  } finally {
    vi.unstubAllEnvs();
    vi.doUnmock("@tanstack/react-start/server-entry");
  }
}

describe("Cloudflare edge & cache isolation headers (src/server.ts)", () => {
  it("sets Cache-Control: private, no-store on SSR HTML responses to prevent Web Cache Deception", async () => {
    const res = await runServerWith(
      async () =>
        new Response("<!doctype html><html><body>dashboard</body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    );
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("sets Cache-Control: no-store on dynamic JSON/API/webhook responses that omit Cache-Control", async () => {
    const res = await runServerWith(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("preserves explicit Cache-Control on intentionally cacheable public media/sitemap routes", async () => {
    const res = await runServerWith(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            "content-type": "image/jpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        }),
    );
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });

  it("applies security headers and private, no-store even when handler throws an unhandled exception", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await runServerWith(async () => {
        throw new Error("boom");
      });
      expect(res.status).toBe(500);
      expect(res.headers.get("Cache-Control")).toBe("private, no-store");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
      expect(res.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'self'");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("removes *.lovable.app from CSP connect-src in production while allowing it in development", async () => {
    const prodRes = await runServerWith(
      async () =>
        new Response("<!doctype html><html></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      "production",
    );
    const prodCsp = prodRes.headers.get("Content-Security-Policy") ?? "";
    expect(prodCsp).toContain("connect-src 'self' https://example.supabase.co wss://example.supabase.co;");
    expect(prodCsp).not.toContain("lovable.app");

    const devRes = await runServerWith(
      async () =>
        new Response("<!doctype html><html></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      "development",
    );
    const devCsp = devRes.headers.get("Content-Security-Policy") ?? "";
    expect(devCsp).toContain("https://*.lovable.app");
  });
});
