/**
 * Server functions autentikasi terpisah untuk:
 * 1. Portal khusus Admin (`/as/feb/auth/admin`) -> menerbitkan cookie HttpOnly `ebry_admin_portal` (scope `admin`).
 * 2. Portal Pertumbuhan (`/see/masuk`) -> menerbitkan cookie HttpOnly `ebry_admin_portal` (scope `see`).
 * 3. Portal User (`/auth` & `/auth/callback`) -> menghapus cookie admin & memblokir akun admin/staf.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GENERIC_ADMIN_LOGIN_ERROR =
  "Email atau kata sandi salah, atau akun tidak memiliki akses admin.";
const USER_PORTAL_BLOCKED_ERROR = "Akun tidak dapat masuk melalui halaman ini.";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

async function createEphemeralAuthClient(accessToken?: string) {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Konfigurasi autentikasi server belum lengkap.");
  }
  const customFetch: typeof fetch = (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    }
    if (isNewSupabaseApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
  return createClient(url, key, {
    global: {
      fetch: customFetch,
      ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function getClientIp(): Promise<string> {
  try {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const { clientIpFrom } = await import("./client-ip.server");
    return clientIpFrom((name) => getRequestHeader(name)) ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function randomDelay(minMs = 140, maxMs = 280) {
  if (process.env.VITEST) return;
  const ms = minMs + Math.floor(Math.random() * (maxMs - minMs));
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function logPortalSecurityEvent(params: {
  eventType: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  category: "access_denial" | "suspicious_activity" | "security_violation";
  endpoint: string;
  reasonCode: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  actorEmail?: string | null;
  statusCode?: number;
  metadata?: Record<string, unknown>;
}) {
  try {
    const { recordSecurityEvent } = await import("./security-event.server");
    await recordSecurityEvent({
      ...params,
      sourceSystem: "server_fn",
    });
  } catch {
    /* fail-safe */
  }
}

/* --------------------- Konfigurasi Portal Admin --------------------- */

export const getAdminPortalConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { isAdminPortalPasscodeConfigured } = await import("./admin-portal.server");
  return {
    passcodeRequired: isAdminPortalPasscodeConfigured(),
  };
});

/* --------------------- Login Portal Khusus Admin --------------------- */

const adminLoginSchema = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(200),
  passcode: z.string().trim().max(120).optional(),
  /** Honeypot anti-bot: wajib kosong untuk pengguna manusia. */
  website: z.string().max(200).optional(),
});

export const adminPortalSignIn = createServerFn({ method: "POST" })
  .validator((data: unknown) => adminLoginSchema.parse(data))
  .handler(async ({ data }) => {
    const portal = await import("./admin-portal.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const { loadAccess, writeAudit } = await import("./authz.server");

    portal.clearAdminPortalCookie();

    const ip = await getClientIp();
    const emailHash = portal.hashEmailForRateLimit(data.email);

    // Honeypot terisi: bot otomatis ditolak tanpa membocorkan informasi.
    if (data.website && data.website.trim().length > 0) {
      await logPortalSecurityEvent({
        eventType: "admin_portal_bot_honeypot",
        severity: "HIGH",
        category: "suspicious_activity",
        endpoint: portal.ADMIN_PORTAL_LOGIN_PATH,
        reasonCode: "HONEYPOT_TRIGGERED",
        actorEmail: data.email,
        statusCode: 403,
      });
      await randomDelay();
      return { ok: false as const, error: GENERIC_ADMIN_LOGIN_ERROR };
    }

    const [ipLimited, accountLimited] = await Promise.all([
      enforceRateLimit(`ip:${ip}`, "admin.login.ip"),
      enforceRateLimit(`acct:${emailHash}`, "admin.login.account"),
    ]);
    if (ipLimited) return { ok: false as const, error: ipLimited.error };
    if (accountLimited) return { ok: false as const, error: accountLimited.error };

    if (!portal.verifyAdminPortalPasscode(data.passcode)) {
      await logPortalSecurityEvent({
        eventType: "admin_portal_invalid_passcode",
        severity: "HIGH",
        category: "access_denial",
        endpoint: portal.ADMIN_PORTAL_LOGIN_PATH,
        reasonCode: "INVALID_ADMIN_PASSCODE",
        actorEmail: data.email,
        statusCode: 403,
      });
      await randomDelay();
      return { ok: false as const, error: GENERIC_ADMIN_LOGIN_ERROR };
    }

    const authClient = await createEphemeralAuthClient();
    const { data: authData, error: signInError } = await authClient.auth.signInWithPassword({
      email: data.email.trim(),
      password: data.password,
    });

    if (signInError || !authData.session || !authData.user) {
      await logPortalSecurityEvent({
        eventType: "admin_portal_login_failed",
        severity: "HIGH",
        category: "access_denial",
        endpoint: portal.ADMIN_PORTAL_LOGIN_PATH,
        reasonCode: "INVALID_CREDENTIALS",
        actorEmail: data.email,
        statusCode: 401,
      });
      await randomDelay();
      return { ok: false as const, error: GENERIC_ADMIN_LOGIN_ERROR };
    }

    const userId = authData.user.id;
    const accessToken = authData.session.access_token;
    const refreshToken = authData.session.refresh_token;
    const userClient = await createEphemeralAuthClient(accessToken);

    const access = await loadAccess({ supabase: userClient, userId });
    if (!portal.isAdminPortalAccount(access)) {
      await logPortalSecurityEvent({
        eventType: "admin_portal_unauthorized_role",
        severity: "HIGH",
        category: "security_violation",
        endpoint: portal.ADMIN_PORTAL_LOGIN_PATH,
        reasonCode: "NON_ADMIN_ON_ADMIN_PORTAL",
        actorUserId: userId,
        actorRole: access.roles.join(",") || "customer",
        actorEmail: data.email,
        statusCode: 403,
      });
      await randomDelay();
      return { ok: false as const, error: GENERIC_ADMIN_LOGIN_ERROR };
    }

    // Periksa apakah akun admin mengaktifkan Supabase MFA (TOTP 2FA).
    try {
      const { data: aal } = await userClient.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        const { data: factors } = await userClient.auth.mfa.listFactors();
        const totp = factors?.totp?.find((f) => f.status === "verified");
        if (totp) {
          const { data: challenge, error: chErr } = await userClient.auth.mfa.challenge({
            factorId: totp.id,
          });
          if (!chErr && challenge) {
            // Belum menerbitkan cookie admin sebelum kode TOTP diverifikasi.
            return {
              ok: true as const,
              mfaRequired: true as const,
              factorId: totp.id,
              challengeId: challenge.id,
              accessToken,
              refreshToken,
            };
          }
        }
      }
    } catch {
      /* bila MFA tidak terkonfigurasi, lanjut ke penerbitan sesi admin */
    }

    const expiresAt = portal.setAdminPortalCookie(userId, "admin");
    await writeAudit(
      { supabase: userClient, userId },
      {
        action: "admin.portal_login",
        entityType: "auth_session",
        entityId: userId,
        after: { portal: "admin", mfa: false, roles: access.roles },
        reason: "Login melalui portal khusus admin",
      },
    );

    return {
      ok: true as const,
      mfaRequired: false as const,
      accessToken,
      refreshToken,
      expiresAt,
    };
  });

const adminMfaSchema = z.object({
  accessToken: z.string().min(20).max(4096),
  refreshToken: z.string().min(5).max(4096),
  factorId: z.string().uuid(),
  challengeId: z.string().uuid(),
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, "Kode verifikasi harus 6 digit angka."),
});

export const adminPortalVerifyMfa = createServerFn({ method: "POST" })
  .validator((data: unknown) => adminMfaSchema.parse(data))
  .handler(async ({ data }) => {
    const portal = await import("./admin-portal.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const { loadAccess, writeAudit } = await import("./authz.server");

    portal.clearAdminPortalCookie();

    const ip = await getClientIp();
    const limited = await enforceRateLimit(`ip:${ip}`, "admin.login.ip");
    if (limited) return { ok: false as const, error: limited.error };

    const client = await createEphemeralAuthClient(data.accessToken);
    const { error: setErr } = await client.auth.setSession({
      access_token: data.accessToken,
      refresh_token: data.refreshToken,
    });
    if (setErr) {
      return { ok: false as const, error: "Sesi verifikasi berakhir. Silakan masuk ulang." };
    }

    const { data: verified, error: verifyErr } = await client.auth.mfa.verify({
      factorId: data.factorId,
      challengeId: data.challengeId,
      code: data.code,
    });
    if (verifyErr || !verified) {
      await logPortalSecurityEvent({
        eventType: "admin_portal_mfa_failed",
        severity: "HIGH",
        category: "access_denial",
        endpoint: portal.ADMIN_PORTAL_LOGIN_PATH,
        reasonCode: "INVALID_MFA_CODE",
        statusCode: 401,
      });
      return { ok: false as const, error: "Kode autentikator salah atau kedaluwarsa." };
    }

    const { data: sessData } = await client.auth.getSession();
    const session = sessData.session;
    const userId = session?.user?.id;
    if (!session || !userId) {
      return { ok: false as const, error: "Gagal menyelesaikan sesi verifikasi." };
    }

    const authedClient = await createEphemeralAuthClient(session.access_token);
    const access = await loadAccess({ supabase: authedClient, userId });
    if (!portal.isAdminPortalAccount(access)) {
      return { ok: false as const, error: GENERIC_ADMIN_LOGIN_ERROR };
    }

    const expiresAt = portal.setAdminPortalCookie(userId, "admin");
    await writeAudit(
      { supabase: authedClient, userId },
      {
        action: "admin.portal_login",
        entityType: "auth_session",
        entityId: userId,
        after: { portal: "admin", mfa: true, roles: access.roles },
        reason: "Login portal admin dengan verifikasi 2FA TOTP",
      },
    );

    return {
      ok: true as const,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt,
    };
  });

/* --------------------- Login Portal Pertumbuhan (/see/masuk) --------------------- */

const growthLoginSchema = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(6).max(200),
});

export const growthPortalSignIn = createServerFn({ method: "POST" })
  .validator((data: unknown) => growthLoginSchema.parse(data))
  .handler(async ({ data }) => {
    const portal = await import("./admin-portal.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const { loadAccess, writeAudit } = await import("./authz.server");

    portal.clearAdminPortalCookie();

    const ip = await getClientIp();
    const emailHash = portal.hashEmailForRateLimit(data.email);
    const [ipLimited, accountLimited] = await Promise.all([
      enforceRateLimit(`ip:${ip}`, "admin.login.ip"),
      enforceRateLimit(`acct:${emailHash}`, "admin.login.account"),
    ]);
    if (ipLimited) return { ok: false as const, error: ipLimited.error };
    if (accountLimited) return { ok: false as const, error: accountLimited.error };

    const authClient = await createEphemeralAuthClient();
    const { data: authData, error: signInError } = await authClient.auth.signInWithPassword({
      email: data.email.trim(),
      password: data.password,
    });
    if (signInError || !authData.session || !authData.user) {
      await randomDelay();
      return { ok: false as const, error: "Email atau kata sandi salah." };
    }

    const userId = authData.user.id;
    const accessToken = authData.session.access_token;
    const refreshToken = authData.session.refresh_token;
    const userClient = await createEphemeralAuthClient(accessToken);

    const access = await loadAccess({ supabase: userClient, userId });
    if (!portal.isAdminPortalAccount(access)) {
      await randomDelay();
      return { ok: false as const, error: "Akun ini tidak memiliki akses ke dashboard pertumbuhan." };
    }

    // Scope `see` saja: TIDAK dapat mengakses `/admin` maupun server function admin!
    portal.setAdminPortalCookie(userId, "see");
    await writeAudit(
      { supabase: userClient, userId },
      {
        action: "see.portal_login",
        entityType: "auth_session",
        entityId: userId,
        after: { portal: "see", roles: access.roles },
      },
    );

    return {
      ok: true as const,
      accessToken,
      refreshToken,
    };
  });

/* --------------------- Login Portal User (/auth) --------------------- */

const userLoginSchema = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(200),
});

export const userPortalSignIn = createServerFn({ method: "POST" })
  .validator((data: unknown) => userLoginSchema.parse(data))
  .handler(async ({ data }) => {
    const portal = await import("./admin-portal.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const { loadAccess } = await import("./authz.server");

    // Setiap upaya login di halaman user wajib membersihkan cookie portal admin.
    portal.clearAdminPortalCookie();

    const ip = await getClientIp();
    const limited = await enforceRateLimit(`ip:${ip}`, "user.login");
    if (limited) return { ok: false as const, error: limited.error };

    const authClient = await createEphemeralAuthClient();
    const { data: authData, error: signInError } = await authClient.auth.signInWithPassword({
      email: data.email.trim(),
      password: data.password,
    });

    if (signInError || !authData.session || !authData.user) {
      const msg = signInError?.message ?? "";
      if (msg.includes("Invalid login credentials")) {
        return { ok: false as const, code: "INVALID_CREDENTIALS" as const, error: "Email atau kata sandi salah." };
      }
      if (msg.includes("Email not confirmed")) {
        return {
          ok: false as const,
          code: "EMAIL_NOT_CONFIRMED" as const,
          error: "Email belum dikonfirmasi. Periksa kotak masuk email kamu terlebih dahulu.",
        };
      }
      return { ok: false as const, code: "AUTH_ERROR" as const, error: "Gagal masuk. Coba lagi." };
    }

    const userId = authData.user.id;
    const accessToken = authData.session.access_token;
    const refreshToken = authData.session.refresh_token;
    const userClient = await createEphemeralAuthClient(accessToken);

    const access = await loadAccess({ supabase: userClient, userId });
    if (portal.isAdminPortalAccount(access)) {
      await logPortalSecurityEvent({
        eventType: "admin_login_blocked_on_user_portal",
        severity: "HIGH",
        category: "access_denial",
        endpoint: "/auth",
        reasonCode: "ADMIN_ON_USER_PORTAL",
        actorUserId: userId,
        actorRole: access.roles.join(",") || "admin",
        actorEmail: data.email,
        statusCode: 403,
      });
      await randomDelay();
      return {
        ok: false as const,
        code: "ADMIN_BLOCKED" as const,
        error: USER_PORTAL_BLOCKED_ERROR,
      };
    }

    return {
      ok: true as const,
      accessToken,
      refreshToken,
    };
  });

/**
 * Verifikasi pasca-OAuth Google di `/auth/callback`:
 * - Selalu menghapus cookie portal admin.
 * - Memblokir akun admin/staf agar tidak bisa masuk lewat OAuth user.
 */
export const verifyUserPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const portal = await import("./admin-portal.server");
    const { loadAccess } = await import("./authz.server");

    portal.clearAdminPortalCookie();

    const access = await loadAccess(context as { supabase: any; userId: string });
    if (portal.isAdminPortalAccount(access)) {
      await logPortalSecurityEvent({
        eventType: "admin_oauth_blocked_on_user_portal",
        severity: "HIGH",
        category: "access_denial",
        endpoint: "/auth/callback",
        reasonCode: "ADMIN_OAUTH_ON_USER_PORTAL",
        actorUserId: context.userId,
        actorRole: access.roles.join(",") || "admin",
        statusCode: 403,
      });
      return {
        allowed: false as const,
        error: "Akun ini tidak dapat masuk melalui halaman login pengguna.",
      };
    }
    return { allowed: true as const };
  });

/** Hapus cookie gate portal admin di server saat sign-out (admin, /see, maupun user). */
export const adminPortalSignOut = createServerFn({ method: "POST" }).handler(async () => {
  const portal = await import("./admin-portal.server");
  portal.clearAdminPortalCookie();
  return { ok: true as const };
});
