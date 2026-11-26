import { createHash, createSign } from "node:crypto";

type FcmServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

let cachedAccessToken: { token: string; expiresAtMs: number } | null = null;

export function readFcmConfig(): FcmServiceAccount | null {
  const rawJson = process.env["FCM_SERVICE_ACCOUNT_JSON"]?.trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key.replace(/\\n/g, "\n"),
        };
      }
    } catch {
      return null;
    }
  }

  const projectId = process.env["FCM_PROJECT_ID"]?.trim();
  const clientEmail = process.env["FCM_CLIENT_EMAIL"]?.trim();
  const privateKey = process.env["FCM_PRIVATE_KEY"]?.replace(/\\n/g, "\n").trim();
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function buildFcmOAuthAssertion(cfg: FcmServiceAccount, nowSec = Math.floor(Date.now() / 1000)): string {
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

async function fetchGoogleAccessToken(cfg: FcmServiceAccount): Promise<string | null> {
  if (cachedAccessToken && cachedAccessToken.expiresAtMs > Date.now() + 60_000) {
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
    expiresAtMs: Date.now() + Math.max(60, Number(data.expires_in ?? 3000)) * 1000,
  };
  return data.access_token;
}

export function androidChannelForNotification(type: string, relatedType: string | null): string {
  const key = `${type} ${relatedType ?? ""}`.toLowerCase();
  if (key.includes("payment") || key.includes("qris") || key.includes("proof") || key.includes("refund")) {
    return "ebry_payment";
  }
  if (key.includes("credit") || key.includes("topup") || key.includes("wallet") || key.includes("saldo")) {
    return "ebry_credit";
  }
  if (key.includes("chat") || key.includes("message") || key.includes("thread")) {
    return "ebry_chat";
  }
  if (key.includes("store") || key.includes("seller") || key.includes("payout")) {
    return "ebry_store";
  }
  if (key.includes("order") || key.includes("service") || key.includes("delivery")) {
    return "ebry_order";
  }
  return "ebry_general";
}

export function hashPushToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

export async function sendFcmNotification(
  cfg: FcmServiceAccount,
  accessToken: string,
  payload: {
    token: string;
    title: string;
    body: string;
    channelId: string;
    data: Record<string, string>;
  },
): Promise<{ ok: true; messageId: string } | { ok: false; invalidToken: boolean; error: string }> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: payload.token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        android: {
          priority: "HIGH",
          notification: {
            channel_id: payload.channelId,
          },
        },
        data: payload.data,
      },
    }),
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

export async function dispatchPendingPushNotifications(limit = 50): Promise<{
  configured: boolean;
  sent: number;
  failed: number;
  skipped: number;
}> {
  const cfg = readFcmConfig();
  if (!cfg) {
    return { configured: false, sent: 0, failed: 0, skipped: 0 };
  }
  const accessToken = await fetchGoogleAccessToken(cfg);
  if (!accessToken) {
    return { configured: true, sent: 0, failed: 0, skipped: 0 };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as {
    from: (table: string) => {
      select: (cols: string) => any;
      insert: (row: unknown) => any;
      update: (row: unknown) => any;
    };
  };

  const sinceIso = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data: notifications, error: notifError } = await admin
    .from("notifications")
    .select("id, recipient_id, type, title, message, related_type, related_id, created_at")
    .is("read_at", null)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (notifError || !Array.isArray(notifications) || notifications.length === 0) {
    return { configured: true, sent: 0, failed: 0, skipped: 0 };
  }

  const userIds = Array.from(new Set(notifications.map((n: { recipient_id: string }) => n.recipient_id)));
  const notifIds = notifications.map((n: { id: string }) => n.id);

  const [{ data: tokens, error: tokErr }, { data: existingLogs }] = await Promise.all([
    admin
      .from("user_push_tokens")
      .select("id, user_id, token")
      .in("user_id", userIds)
      .is("revoked_at", null),
    admin
      .from("push_dispatch_log")
      .select("notification_id, token_hash")
      .in("notification_id", notifIds),
  ]);

  if (tokErr || !Array.isArray(tokens) || tokens.length === 0) {
    return { configured: true, sent: 0, failed: 0, skipped: notifications.length };
  }

  const sentPairs = new Set<string>(
    (existingLogs ?? []).map(
      (r: { notification_id: string; token_hash: string }) => `${r.notification_id}:${r.token_hash}`,
    ),
  );
  const tokensByUser = new Map<string, Array<{ id: string; token: string }>>();
  for (const row of tokens as Array<{ id: string; user_id: string; token: string }>) {
    const cur = tokensByUser.get(row.user_id) ?? [];
    cur.push({ id: row.id, token: row.token });
    tokensByUser.set(row.user_id, cur);
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const notif of notifications as Array<{
    id: string;
    recipient_id: string;
    type: string;
    title: string;
    message: string;
    related_type: string | null;
    related_id: string | null;
  }>) {
    const userTokens = tokensByUser.get(notif.recipient_id) ?? [];
    if (userTokens.length === 0) {
      skipped += 1;
      continue;
    }
    const channelId = androidChannelForNotification(notif.type, notif.related_type);
    for (const dev of userTokens) {
      const tokenHash = hashPushToken(dev.token);
      if (sentPairs.has(`${notif.id}:${tokenHash}`)) {
        skipped += 1;
        continue;
      }
      const res = await sendFcmNotification(cfg, accessToken, {
        token: dev.token,
        title: notif.title || "Ebrystore",
        body: notif.message || "Ada pembaruan baru di akun kamu.",
        channelId,
        data: {
          notificationId: notif.id,
          type: notif.type || "general",
          relatedType: notif.related_type ?? "",
          relatedId: notif.related_id ?? "",
        },
      });
      if (res.ok) {
        sent += 1;
        await admin.from("push_dispatch_log").insert({
          notification_id: notif.id,
          user_id: notif.recipient_id,
          token_hash: tokenHash,
          status: "sent",
          provider_message_id: res.messageId,
        });
      } else {
        failed += 1;
        await admin.from("push_dispatch_log").insert({
          notification_id: notif.id,
          user_id: notif.recipient_id,
          token_hash: tokenHash,
          status: "failed",
          error: res.error,
        });
        if (res.invalidToken) {
          await admin
            .from("user_push_tokens")
            .update({ revoked_at: new Date().toISOString() })
            .eq("id", dev.id);
        }
      }
    }
  }

  return { configured: true, sent, failed, skipped };
}
