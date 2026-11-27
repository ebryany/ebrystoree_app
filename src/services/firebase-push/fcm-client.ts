import { createHash, createSign } from "node:crypto";

import type { FcmServiceAccount, PushCategoryKey } from "./config";

let cachedAccessToken: { token: string; expiresAtMs: number; clientEmail: string } | null = null;

function base64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function buildFcmOAuthAssertion(
  cfg: FcmServiceAccount,
  nowSec = Math.floor(Date.now() / 1000),
): string {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: cfg.clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );
  const signingInput = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = base64Url(signer.sign(cfg.privateKey));
  return `${signingInput}.${signature}`;
}

export async function fetchGoogleAccessToken(cfg: FcmServiceAccount): Promise<string | null> {
  if (
    cachedAccessToken &&
    cachedAccessToken.clientEmail === cfg.clientEmail &&
    cachedAccessToken.expiresAtMs > Date.now() + 60_000
  ) {
    return cachedAccessToken.token;
  }
  const assertion = buildFcmOAuthAssertion(cfg);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  cachedAccessToken = {
    token: data.access_token,
    clientEmail: cfg.clientEmail,
    expiresAtMs: Date.now() + Math.max(60, Number(data.expires_in ?? 3000)) * 1000,
  };
  return data.access_token;
}

export function androidChannelForNotification(type: string, relatedType: string | null): string {
  const key = `${type} ${relatedType ?? ""}`.toLowerCase();
  if (
    key.includes("chat") ||
    key.includes("message") ||
    key.includes("thread") ||
    key.includes("product_inquiry") ||
    key.includes("po_message")
  ) {
    return "ebry_chat";
  }
  if (key.includes("payment") || key.includes("qris") || key.includes("proof") || key.includes("refund")) {
    return "ebry_payment";
  }
  if (key.includes("credit") || key.includes("topup") || key.includes("wallet") || key.includes("saldo")) {
    return "ebry_credit";
  }
  if (key.includes("store") || key.includes("seller") || key.includes("payout")) {
    return "ebry_store";
  }
  if (key.includes("order") || key.includes("service") || key.includes("delivery")) {
    return "ebry_order";
  }
  return "ebry_general";
}

export function preferenceCategoryForChannel(channelId: string): PushCategoryKey {
  switch (channelId) {
    case "ebry_chat":
      return "chat";
    case "ebry_payment":
      return "payments";
    case "ebry_credit":
      return "wallet";
    case "ebry_store":
      return "store";
    case "ebry_order":
      return "orders";
    default:
      return "promo";
  }
}

export function hashPushToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

export type FcmPayloadInput = {
  token: string;
  platform?: "android" | "ios" | "web";
  title: string;
  body: string;
  channelId: string;
  collapseKey?: string;
  data: Record<string, string>;
};

/**
 * Mengirim push via FCM HTTP v1 API.
 * Khusus Android, payload dikirim sebagai High-Priority Data Message agar
 * `EbryFirebaseMessagingService.onMessageReceived()` selalu terpanggil baik saat
 * foreground maupun background — sehingga fitur interaktif (Direct Reply, Tandai Dibaca,
 * MessagingStyle, dan peredaman thread aktif) selalu berfungsi penuh.
 */
export function buildFcmMessageBody(payload: FcmPayloadInput): Record<string, unknown> {
  const platform = payload.platform ?? "android";
  const mergedData: Record<string, string> = {
    ...payload.data,
    title: payload.title,
    body: payload.body,
    channelId: payload.channelId,
  };

  if (platform === "android") {
    return {
      message: {
        token: payload.token,
        android: {
          priority: "HIGH",
          ttl: "86400s",
          ...(payload.collapseKey ? { collapse_key: payload.collapseKey.slice(0, 64) } : {}),
        },
        data: mergedData,
      },
    };
  }

  return {
    message: {
      token: payload.token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: mergedData,
    },
  };
}

export async function sendFcmNotification(
  cfg: FcmServiceAccount,
  accessToken: string,
  payload: FcmPayloadInput,
): Promise<{ ok: true; messageId: string } | { ok: false; invalidToken: boolean; error: string }> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(buildFcmMessageBody(payload)),
  });

  const text = await res.text();
  if (res.ok) {
    try {
      const parsed = JSON.parse(text) as { name?: string };
      return { ok: true, messageId: parsed.name ?? "sent" };
    } catch {
      return { ok: true, messageId: "sent" };
    }
  }
  const invalidToken =
    res.status === 404 || text.includes("UNREGISTERED") || text.includes("INVALID_ARGUMENT");
  return { ok: false, invalidToken, error: `HTTP_${res.status}` };
}
