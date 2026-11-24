import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ADMIN_PORTAL_COOKIE_NAME,
  ADMIN_PORTAL_LOGIN_PATH,
  createAdminPortalCookieValue,
  isAdminPortalAccount,
  parseCookieFromHeader,
  verifyAdminPortalCookieValue,
  verifyAdminPortalPasscode,
} from "@/lib/admin-portal.server";
import { safeUserNextPath } from "@/lib/utils";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  delete process.env.ADMIN_PORTAL_PASSCODE;
});

describe("Admin Portal Gate — Cryptographic Cookie & Scope Isolation", () => {
  const uid = "11111111-1111-4111-8111-111111111111";
  const ua = "Mozilla/5.0 AdminBrowser";

  it("issues and verifies HMAC-signed admin portal cookies bound to uid, portal, and User-Agent", () => {
    const { value } = createAdminPortalCookieValue(uid, "admin", ua);
    const verified = verifyAdminPortalCookieValue(value, uid, ua);
    expect(verified.adminVerified).toBe(true);
    expect(verified.seeVerified).toBe(true);
    expect(verified.portal).toBe("admin");
    expect(verified.expiresAt).toBeGreaterThan(Date.now());
  });

  it("prevents /see portal cookies from accessing /admin", () => {
    const { value } = createAdminPortalCookieValue(uid, "see", ua);
    const verified = verifyAdminPortalCookieValue(value, uid, ua);
    expect(verified.adminVerified).toBe(false);
    expect(verified.seeVerified).toBe(true);
    expect(verified.portal).toBe("see");
  });

  it("rejects tampered, expired, wrong-user, and wrong-UA cookies", () => {
    const { value } = createAdminPortalCookieValue(uid, "admin", ua);
    expect(verifyAdminPortalCookieValue(`${value}x`, uid, ua).adminVerified).toBe(false);
    expect(
      verifyAdminPortalCookieValue(value, "22222222-2222-4222-8222-222222222222", ua).adminVerified,
    ).toBe(false);
    expect(verifyAdminPortalCookieValue(value, uid, "OtherBrowser/9.0").adminVerified).toBe(false);

    const expired = createAdminPortalCookieValue(uid, "admin", ua, -10);
    expect(verifyAdminPortalCookieValue(expired.value, uid, ua).adminVerified).toBe(false);
  });

  it("parses cookie values safely from Cookie header", () => {
    const { value } = createAdminPortalCookieValue(uid, "admin", ua);
    const header = `other=1; ${ADMIN_PORTAL_COOKIE_NAME}=${encodeURIComponent(value)}; theme=dark`;
    expect(parseCookieFromHeader(header, ADMIN_PORTAL_COOKIE_NAME)).toBe(value);
    expect(parseCookieFromHeader("other=1", ADMIN_PORTAL_COOKIE_NAME)).toBeNull();
  });

  it("validates optional ADMIN_PORTAL_PASSCODE in constant time", () => {
    delete process.env.ADMIN_PORTAL_PASSCODE;
    expect(verifyAdminPortalPasscode(undefined)).toBe(true);

    process.env.ADMIN_PORTAL_PASSCODE = "Rahasia-Admin-2026!";
    expect(verifyAdminPortalPasscode("Rahasia-Admin-2026!")).toBe(true);
    expect(verifyAdminPortalPasscode("salah")).toBe(false);
    expect(verifyAdminPortalPasscode("")).toBe(false);
  });

  it("identifies admin/staff accounts vs regular customer accounts", () => {
    expect(isAdminPortalAccount({ isSuperAdmin: true, permissions: [] })).toBe(true);
    expect(isAdminPortalAccount({ isSuperAdmin: false, permissions: ["admin.dashboard.view"] })).toBe(
      true,
    );
    expect(isAdminPortalAccount({ isSuperAdmin: false, permissions: [] })).toBe(false);
  });
});

describe("User Login Isolation — Redirect & Header Hardening", () => {
  it("blocks /admin, /as/feb/auth/admin, /see, and external URLs in safeUserNextPath", () => {
    expect(safeUserNextPath("/dashboard")).toBe("/dashboard");
    expect(safeUserNextPath("/checkout/produk/ebook-1")).toBe("/checkout/produk/ebook-1");

    for (const blocked of [
      "/admin",
      "/admin/orders",
      "/ADMIN/topups",
      "/%61dmin",
      ADMIN_PORTAL_LOGIN_PATH,
      `${ADMIN_PORTAL_LOGIN_PATH}?x=1`,
      "/see",
      "/see/seo",
      "//evil.example.com",
      "https://evil.example.com",
    ]) {
      expect(safeUserNextPath(blocked)).toBeNull();
    }
  });

  it("attaches X-Robots-Tag noindex/nofollow/noarchive on /as/feb/auth/admin and /admin", async () => {
    vi.resetModules();
    vi.doMock("@tanstack/react-start/server-entry", () => ({
      default: {
        fetch: async () =>
          new Response("<html><body>ok</body></html>", {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
      },
    }));
    try {
      const { default: handler } = await import("@/server");
      for (const path of ["/as/feb/auth/admin", "/admin", "/admin/orders"]) {
        const res = await handler.fetch(new Request(`https://app.ebrystore.my.id${path}`), {}, {});
        expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
        expect(res.headers.get("Cache-Control")).toContain("no-store");
      }
      const home = await handler.fetch(new Request("https://app.ebrystore.my.id/"), {}, {});
      expect(home.headers.get("X-Robots-Tag")).toBeNull();
    } finally {
      vi.doUnmock("@tanstack/react-start/server-entry");
    }
  });
});

describe("Admin Portal Separation — Route, Header, and Auth Contract", () => {
  it("keeps /as/feb/auth/admin private, email/password-only, accessible, and free of public auth links", () => {
    const src = readFileSync("src/routes/as.feb.auth.admin.tsx", "utf8");
    expect(src).toContain('createFileRoute("/as/feb/auth/admin")');
    expect(src).toContain("noindex, nofollow, noarchive");
    expect(src).toContain('autoComplete="username"');
    expect(src).toContain('autoComplete="current-password"');
    expect(src).toContain('autoComplete="one-time-code"');
    expect(src).toContain('inputMode="numeric"');
    expect(src).toContain("aria-pressed={showPassword}");
    expect(src).toContain("tabIndex={-1}");
    expect(src).not.toContain("signInWithOAuth");
    expect(src).not.toContain('to="/auth"');
  });

  it("blocks admin login on /auth and /auth/callback and never leaks /as/feb/auth/admin", () => {
    const authSrc = readFileSync("src/routes/auth.tsx", "utf8");
    expect(authSrc).toContain("userPortalSignIn");
    expect(authSrc).toContain("safeUserNextPath");
    expect(authSrc).not.toContain("signInWithPassword");
    expect(authSrc).not.toContain("/as/feb/auth/admin");

    const cbSrc = readFileSync("src/routes/auth.callback.tsx", "utf8");
    expect(cbSrc).toContain("verifyUserPortalSession");
    expect(cbSrc).toContain("safeUserNextPath");
    expect(cbSrc).toContain("supabase.auth.signOut()");
    expect(cbSrc).not.toContain("/as/feb/auth/admin");
  });

  it("hides public Admin links in SiteHeader, guards /admin without leaking login URL, and allows login during maintenance", () => {
    const headerSrc = readFileSync("src/components/site-header.tsx", "utf8");
    expect(headerSrc).not.toContain('to="/admin"');
    expect(headerSrc).not.toContain("/as/feb/auth/admin");
    expect(headerSrc).toContain("adminPortalSignOut");

    const authLayoutSrc = readFileSync("src/routes/_authenticated/route.tsx", "utf8");
    expect(authLayoutSrc).toContain("isAdminPath");
    expect(authLayoutSrc).not.toContain('to: "/as/feb/auth/admin"');

    const adminLayoutSrc = readFileSync("src/routes/_authenticated/admin/route.tsx", "utf8");
    expect(adminLayoutSrc).toContain("data.adminPortalVerified");
    expect(adminLayoutSrc).toContain("adminPortalSignOut");

    const maintenanceSrc = readFileSync("src/components/maintenance-gate.tsx", "utf8");
    expect(maintenanceSrc).toContain('"/as/feb/auth/admin"');
  });
});
