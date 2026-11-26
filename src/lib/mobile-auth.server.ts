import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isAdminPortalAccount } from "./admin-portal.server";
import { loadAccess } from "./authz.server";
import { clientIpFrom } from "./client-ip.server";
import { enforceRateLimit } from "./rate-limit.server";

export type MobileAuthContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  claims: Record<string, unknown>;
};

export type MobileAuthResult =
  | { ok: true; context: MobileAuthContext }
  | { ok: false; status: 401 | 403 | 503; code: string; message: string };

export type MobileLoginResult =
  | {
      ok: true;
      data: {
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        expiresAt: number | null;
        user: { id: string; email: string | null };
      };
    }
  | { ok: false; status: 401 | 403 | 429 | 503; code: string; message: string };

const ADMIN_BLOCKED_MESSAGE = "Akun admin atau staf tidak dapat masuk melalui aplikasi pengguna.";

function isOpaqueSupabaseKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(apiKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    // Opaque sb_publishable_ keys are not JWTs and must not be sent as Bearer tokens.
    if (isOpaqueSupabaseKey(apiKey) && headers.get("Authorization") === `Bearer ${apiKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", apiKey);
    return fetch(input, { ...init, headers });
  };
}

export function createMobileSupabaseClient(accessToken?: string): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_CONFIG_MISSING");
  }
  return createClient<Database>(url, key, {
    global: {
      fetch: createSupabaseFetch(key),
      ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token || token.split(".").length !== 3) return null;
  return token;
}

async function logMobileSecurityEvent(params: {
  eventType: string;
  endpoint: string;
  reasonCode: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  actorEmail?: string | null;
  statusCode?: number;
}) {
  try {
    const { recordSecurityEvent } = await import("./security-event.server");
    await recordSecurityEvent({
      ...params,
      severity: "HIGH",
      category: "access_denial",
      sourceSystem: "app_server",
    });
  } catch {
    // Audit logging must not break request handling.
  }
}

export async function requireMobileAuth(request: Request): Promise<MobileAuthResult> {
  const token = extractBearerToken(request);
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      message: "Sesi tidak valid atau sudah berakhir. Silakan masuk kembali.",
    };
  }

  let supabase: SupabaseClient<Database>;
  try {
    supabase = createMobileSupabaseClient(token);
  } catch {
    return {
      ok: false,
      status: 503,
      code: "AUTH_UNAVAILABLE",
      message: "Layanan autentikasi sedang tidak tersedia.",
    };
  }

  const { data, error } = await supabase.auth.getClaims(token);
  const claims = data?.claims as Record<string, unknown> | undefined;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  if (error || !claims || !userId) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      message: "Sesi tidak valid atau sudah berakhir. Silakan masuk kembali.",
    };
  }

  const access = await loadAccess({ supabase, userId });
  if (isAdminPortalAccount(access)) {
    await logMobileSecurityEvent({
      eventType: "admin_mobile_api_blocked",
      endpoint: new URL(request.url).pathname,
      reasonCode: "ADMIN_ON_MOBILE_APP",
      actorUserId: userId,
      actorRole: access.roles.join(",") || "admin",
      statusCode: 403,
    });
    return {
      ok: false,
      status: 403,
      code: "ADMIN_BLOCKED",
      message: ADMIN_BLOCKED_MESSAGE,
    };
  }

  return { ok: true, context: { supabase, userId, claims } };
}

export async function optionalMobileAuth(request: Request): Promise<MobileAuthContext | null> {
  if (!extractBearerToken(request)) return null;
  const result = await requireMobileAuth(request);
  return result.ok ? result.context : null;
}

export async function mobileSignInWithPassword(
  request: Request,
  input: { email: string; password: string },
): Promise<MobileLoginResult> {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const ip = clientIpFrom((name) => request.headers.get(name)) ?? "unknown";
    const limited = await enforceRateLimit(`ip:${ip}`, "user.login");
    if (limited) {
      return { ok: false, status: 429, code: "RATE_LIMITED", message: limited.error };
    }
  }

  let authClient: SupabaseClient<Database>;
  try {
    authClient = createMobileSupabaseClient();
  } catch {
    return {
      ok: false,
      status: 503,
      code: "AUTH_UNAVAILABLE",
      message: "Layanan autentikasi sedang tidak tersedia.",
    };
  }

  const { data: authData, error: signInError } = await authClient.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  });

  if (signInError || !authData.session || !authData.user) {
    const msg = signInError?.message ?? "";
    if (msg.includes("Invalid login credentials")) {
      return {
        ok: false,
        status: 401,
        code: "INVALID_CREDENTIALS",
        message: "Email atau kata sandi salah.",
      };
    }
    if (msg.includes("Email not confirmed")) {
      return {
        ok: false,
        status: 401,
        code: "EMAIL_NOT_CONFIRMED",
        message: "Email belum dikonfirmasi. Periksa kotak masuk email kamu terlebih dahulu.",
      };
    }
    return {
      ok: false,
      status: 401,
      code: "AUTH_ERROR",
      message: "Gagal masuk. Coba lagi.",
    };
  }

  const userId = authData.user.id;
  const accessToken = authData.session.access_token;
  const userClient = createMobileSupabaseClient(accessToken);
  const access = await loadAccess({ supabase: userClient, userId });

  if (isAdminPortalAccount(access)) {
    await logMobileSecurityEvent({
      eventType: "admin_login_blocked_on_mobile_api",
      endpoint: "/api/mobile/v1/auth/login",
      reasonCode: "ADMIN_ON_MOBILE_APP",
      actorUserId: userId,
      actorRole: access.roles.join(",") || "admin",
      actorEmail: input.email.trim(),
      statusCode: 403,
    });
    return {
      ok: false,
      status: 403,
      code: "ADMIN_BLOCKED",
      message: ADMIN_BLOCKED_MESSAGE,
    };
  }

  return {
    ok: true,
    data: {
      accessToken,
      refreshToken: authData.session.refresh_token,
      expiresIn: authData.session.expires_in,
      expiresAt: authData.session.expires_at ?? null,
      user: {
        id: userId,
        email: authData.user.email ?? null,
      },
    },
  };
}
