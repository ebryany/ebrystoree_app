/**
 * Isolasi sesi portal admin berbasis cookie HttpOnly bertanda tangan HMAC-SHA256.
 *
 * Tujuan keamanan:
 * - Memastikan sesi Supabase yang dibuat lewat `/auth` (login user/Google) atau
 *   `/see/masuk` TIDAK dapat membuka `/admin` maupun memanggil server function admin,
 *   sekalipun kredensial admin benar atau klien dimodifikasi lewat DevTools.
 * - Cookie `ebry_admin_portal` bersifat HttpOnly (tidak bisa dibaca/dipalsukan JS),
 *   terikat ke `userId`, sidik jari `User-Agent`, `portal` (`admin` vs `see`),
 *   dan masa berlaku terbatas (8 jam untuk admin).
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { deleteCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server";

export const ADMIN_PORTAL_LOGIN_PATH = "/as/feb/auth/admin" as const;
export const ADMIN_PORTAL_COOKIE_NAME = "ebry_admin_portal" as const;
export const ADMIN_PORTAL_TTL_SECONDS = 8 * 60 * 60; // 8 jam
export const SEE_PORTAL_TTL_SECONDS = 12 * 60 * 60; // 12 jam

export type PortalScope = "admin" | "see";

type AdminPortalPayload = {
  v: 1;
  uid: string;
  portal: PortalScope;
  ua: string;
  iat: number;
  exp: number;
  jti: string;
};

export type AdminPortalState = {
  adminVerified: boolean;
  seeVerified: boolean;
  portal: PortalScope | null;
  expiresAt: number | null;
};

function signingKey(): Buffer {
  const raw =
    process.env.ADMIN_PORTAL_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    (process.env.VITEST ? "vitest-admin-portal-signing-key" : "");
  if (!raw) {
    throw new Error("Admin portal signing secret is not configured");
  }
  return createHmac("sha256", raw).update("ebrystore:admin-portal-gate:v1").digest();
}

export function hashUserAgent(ua: string | null | undefined): string {
  const normalized = (ua ?? "").trim().slice(0, 300);
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export function hashEmailForRateLimit(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export function createAdminPortalCookieValue(
  userId: string,
  portal: PortalScope,
  userAgent: string | null | undefined,
  ttlSeconds = portal === "admin" ? ADMIN_PORTAL_TTL_SECONDS : SEE_PORTAL_TTL_SECONDS,
): { value: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;
  const payload: AdminPortalPayload = {
    v: 1,
    uid: userId,
    portal,
    ua: hashUserAgent(userAgent),
    iat: now,
    exp,
    jti: randomBytes(12).toString("hex"),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", signingKey()).update(encoded).digest("base64url");
  return { value: `${encoded}.${sig}`, expiresAt: exp * 1000 };
}

export function verifyAdminPortalCookieValue(
  rawValue: string | null | undefined,
  expectedUserId: string,
  userAgent: string | null | undefined,
): AdminPortalState {
  const empty: AdminPortalState = {
    adminVerified: false,
    seeVerified: false,
    portal: null,
    expiresAt: null,
  };
  if (!rawValue || typeof rawValue !== "string") return empty;
  const dot = rawValue.indexOf(".");
  if (dot <= 0 || dot !== rawValue.lastIndexOf(".")) return empty;

  const encoded = rawValue.slice(0, dot);
  const providedSig = rawValue.slice(dot + 1);
  if (!encoded || !providedSig) return empty;

  let expectedSig: string;
  try {
    expectedSig = createHmac("sha256", signingKey()).update(encoded).digest("base64url");
  } catch {
    return empty;
  }

  const a = Buffer.from(providedSig, "utf8");
  const b = Buffer.from(expectedSig, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return empty;

  let payload: AdminPortalPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AdminPortalPayload;
  } catch {
    return empty;
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    payload.v !== 1 ||
    payload.uid !== expectedUserId ||
    (payload.portal !== "admin" && payload.portal !== "see") ||
    typeof payload.exp !== "number" ||
    typeof payload.iat !== "number" ||
    payload.exp <= now ||
    payload.iat > now + 60 ||
    payload.ua !== hashUserAgent(userAgent)
  ) {
    return empty;
  }

  return {
    adminVerified: payload.portal === "admin",
    seeVerified: payload.portal === "admin" || payload.portal === "see",
    portal: payload.portal,
    expiresAt: payload.exp * 1000,
  };
}

export function parseCookieFromHeader(
  cookieHeader: string | null | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) {
      const raw = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

export function readAdminPortalState(expectedUserId: string): AdminPortalState {
  try {
    const cookieHeader = getRequestHeader("cookie");
    const raw = parseCookieFromHeader(cookieHeader, ADMIN_PORTAL_COOKIE_NAME);
    const ua = getRequestHeader("user-agent") ?? "";
    return verifyAdminPortalCookieValue(raw, expectedUserId, ua);
  } catch {
    return { adminVerified: false, seeVerified: false, portal: null, expiresAt: null };
  }
}

export function setAdminPortalCookie(userId: string, portal: PortalScope): number {
  const ua = (() => {
    try {
      return getRequestHeader("user-agent") ?? "";
    } catch {
      return "";
    }
  })();
  const ttl = portal === "admin" ? ADMIN_PORTAL_TTL_SECONDS : SEE_PORTAL_TTL_SECONDS;
  const { value, expiresAt } = createAdminPortalCookieValue(userId, portal, ua, ttl);
  setCookie(ADMIN_PORTAL_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ttl,
  });
  return expiresAt;
}

export function clearAdminPortalCookie(): void {
  try {
    deleteCookie(ADMIN_PORTAL_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  } catch {
    /* aman bila tidak berada pada siklus respons HTTP */
  }
}

/** Kode akses tambahan opsional melalui env server ADMIN_PORTAL_PASSCODE. */
export function isAdminPortalPasscodeConfigured(): boolean {
  return Boolean(process.env.ADMIN_PORTAL_PASSCODE?.trim());
}

export function verifyAdminPortalPasscode(input: string | null | undefined): boolean {
  const configured = process.env.ADMIN_PORTAL_PASSCODE?.trim();
  if (!configured) return true;
  if (!input || typeof input !== "string") return false;
  const a = createHash("sha256").update(input.trim()).digest();
  const b = createHash("sha256").update(configured).digest();
  return timingSafeEqual(a, b);
}

/**
 * Akun yang memiliki izin dashboard admin/staf wajib masuk lewat portal khusus,
 * tidak boleh menggunakan halaman login user (`/auth`).
 */
export function isAdminPortalAccount(access: {
  isSuperAdmin: boolean;
  permissions: string[];
}): boolean {
  return access.isSuperAdmin || access.permissions.includes("admin.dashboard.view");
}

/** Cegah `/auth` atau `/auth/callback` mengarahkan pengguna ke rute admin atau portal rahasia. */
export function sanitizeUserNextPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const normalized = path.toLowerCase();
  if (
    normalized === "/admin" ||
    normalized.startsWith("/admin/") ||
    normalized.startsWith("/admin?") ||
    normalized === "/as/feb/auth/admin" ||
    normalized.startsWith("/as/feb/auth/admin/") ||
    normalized.startsWith("/as/feb/auth/admin?") ||
    normalized === "/see" ||
    normalized.startsWith("/see/") ||
    normalized.startsWith("/see?")
  ) {
    return undefined;
  }
  return path;
}
