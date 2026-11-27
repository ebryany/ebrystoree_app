import {
  normalizePushPreferences,
  readFcmConfig,
  type FcmServiceAccount,
  type PushPreferences,
} from "./config";
import {
  androidChannelForNotification,
  fetchGoogleAccessToken,
  hashPushToken,
  preferenceCategoryForChannel,
  sendFcmNotification,
} from "./fcm-client";

export type NotificationPushRow = {
  id: string;
  recipient_id: string;
  type: string;
  title: string;
  message: string;
  related_type: string | null;
  related_id: string | null;
  created_at?: string;
};

export type ChatMessagePushRow = {
  id: string;
  inquiry_id: string;
  sender_id: string | null;
  sender_role: string;
  body: string | null;
  is_system?: boolean | null;
  attachment?: Record<string, unknown> | null;
  created_at?: string;
};

type DeviceTokenRow = {
  id: string;
  user_id: string;
  token: string;
  platform: "android" | "ios" | "web";
  push_preferences?: unknown;
};

type AdminClientLike = {
  from: (table: string) => any;
};

const STAFF_ROLES = ["admin", "super_admin", "support"] as const;

// In-memory LRU guard so concurrent realtime + fast-path calls never double-send within the same worker.
const recentEventKeys = new Map<string, number>();
const RECENT_TTL_MS = 10 * 60_000;

function markInMemoryDedup(key: string): boolean {
  const now = Date.now();
  if (recentEventKeys.size > 4000) {
    for (const [k, ts] of recentEventKeys.entries()) {
      if (now - ts > RECENT_TTL_MS) recentEventKeys.delete(k);
    }
  }
  const prev = recentEventKeys.get(key);
  if (prev && now - prev < RECENT_TTL_MS) return false;
  recentEventKeys.set(key, now);
  return true;
}

export function formatChatAttachmentPreview(
  body: string | null | undefined,
  attachment: Record<string, unknown> | null | undefined,
): string {
  const clean = (body ?? "").trim();
  if (clean.length > 0) {
    return clean.length > 160 ? `${clean.slice(0, 157)}...` : clean;
  }
  const kind = String(attachment?.["kind"] ?? "").toLowerCase();
  switch (kind) {
    case "image":
      return "Mengirim foto";
    case "gallery":
      return "Mengirim beberapa foto";
    case "audio":
      return "Mengirim pesan suara";
    case "location":
      return "Membagikan lokasi";
    case "product":
      return `Membagikan produk${attachment?.["name"] ? `: ${String(attachment["name"])}` : ""}`;
    case "service":
      return `Membagikan jasa${attachment?.["name"] ? `: ${String(attachment["name"])}` : ""}`;
    case "file":
      return `Mengirim berkas${attachment?.["name"] ? `: ${String(attachment["name"])}` : ""}`;
    default:
      return "Pesan baru masuk";
  }
}

export function shouldSendForPreferences(prefs: PushPreferences, channelId: string): boolean {
  if (prefs.muted) return false;
  const cat = preferenceCategoryForChannel(channelId);
  return prefs[cat] !== false;
}

async function getDefaultAdmin(): Promise<AdminClientLike> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminClientLike;
}

async function fetchActiveTokensForUsers(
  admin: AdminClientLike,
  userIds: string[],
): Promise<DeviceTokenRow[]> {
  if (userIds.length === 0) return [];
  const withPrefs = await admin
    .from("user_push_tokens")
    .select("id, user_id, token, platform, push_preferences")
    .in("user_id", userIds)
    .is("revoked_at", null);

  if (!withPrefs.error && Array.isArray(withPrefs.data)) {
    return withPrefs.data as DeviceTokenRow[];
  }
  // Backward-compatible fallback if push_preferences column has not been migrated yet.
  const fallback = await admin
    .from("user_push_tokens")
    .select("id, user_id, token, platform")
    .in("user_id", userIds)
    .is("revoked_at", null);
  return Array.isArray(fallback.data) ? (fallback.data as DeviceTokenRow[]) : [];
}

async function recordDispatchLog(
  admin: AdminClientLike,
  entry: {
    notificationId: string | null;
    eventKey: string;
    userId: string;
    tokenHash: string;
    status: "sent" | "failed" | "skipped";
    providerMessageId?: string;
    error?: string;
  },
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      user_id: entry.userId,
      token_hash: entry.tokenHash,
      status: entry.status,
      ...(entry.notificationId ? { notification_id: entry.notificationId } : {}),
      ...(entry.providerMessageId ? { provider_message_id: entry.providerMessageId } : {}),
      ...(entry.error ? { error: entry.error } : {}),
      event_key: entry.eventKey,
    };
    const res = await admin.from("push_dispatch_log").insert(payload);
    // Fallback if event_key column is not migrated yet (only when notificationId is present).
    if (res.error && entry.notificationId && String(res.error.code ?? "") === "42703") {
      const { event_key: _drop, ...legacy } = payload;
      await admin.from("push_dispatch_log").insert(legacy);
    }
  } catch {
    // Audit log failure must not crash push delivery.
  }
}

async function alreadyDispatchedEventKey(
  admin: AdminClientLike,
  eventKey: string,
  tokenHash: string,
): Promise<boolean> {
  try {
    const res = await admin
      .from("push_dispatch_log")
      .select("id")
      .eq("event_key", eventKey)
      .eq("token_hash", tokenHash)
      .limit(1)
      .maybeSingle();
    if (!res.error && res.data) return true;
  } catch {
    // Ignore if column not yet migrated; in-memory guard still protects current process.
  }
  return false;
}

async function sendToUserDevices(
  admin: AdminClientLike,
  cfg: FcmServiceAccount,
  accessToken: string,
  devices: DeviceTokenRow[],
  params: {
    eventKey: string;
    notificationId: string | null;
    recipientId: string;
    title: string;
    body: string;
    channelId: string;
    collapseKey?: string;
    data: Record<string, string>;
  },
): Promise<{ sent: number; failed: number; skipped: number }> {
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const dev of devices) {
    const prefs = normalizePushPreferences(dev.push_preferences);
    if (!shouldSendForPreferences(prefs, params.channelId)) {
      skipped += 1;
      continue;
    }

    const tokenHash = hashPushToken(dev.token);
    const dedupKey = `${params.eventKey}:${tokenHash}`;
    if (!markInMemoryDedup(dedupKey)) {
      skipped += 1;
      continue;
    }

    if (await alreadyDispatchedEventKey(admin, params.eventKey, tokenHash)) {
      skipped += 1;
      continue;
    }

    const res = await sendFcmNotification(cfg, accessToken, {
      token: dev.token,
      platform: dev.platform,
      title: params.title,
      body: params.body,
      channelId: params.channelId,
      collapseKey: params.collapseKey,
      data: params.data,
    });

    if (res.ok) {
      sent += 1;
      await recordDispatchLog(admin, {
        notificationId: params.notificationId,
        eventKey: params.eventKey,
        userId: params.recipientId,
        tokenHash,
        status: "sent",
        providerMessageId: res.messageId,
      });
    } else {
      failed += 1;
      await recordDispatchLog(admin, {
        notificationId: params.notificationId,
        eventKey: params.eventKey,
        userId: params.recipientId,
        tokenHash,
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

  return { sent, failed, skipped };
}

/**
 * Mengirim push realtime untuk 1 baris `public.notifications` (pesanan, pembayaran,
 * saldo/top-up, aktivitas toko/seller, pengumuman admin).
 * Chat (`product_inquiry`) ditangani per-pesan oleh `dispatchChatMessagePush` agar
 * pesan ke-2, ke-3, dst di thread yang sama tetap terkirim realtime.
 */
export async function dispatchSingleNotification(
  notif: NotificationPushRow,
  deps?: { admin?: AdminClientLike; cfg?: FcmServiceAccount | null },
): Promise<{ configured: boolean; sent: number; failed: number; skipped: number }> {
  const cfg = deps?.cfg !== undefined ? deps.cfg : readFcmConfig();
  if (!cfg) return { configured: false, sent: 0, failed: 0, skipped: 0 };

  if (notif.related_type === "product_inquiry" || notif.type === "product_inquiry") {
    return { configured: true, sent: 0, failed: 0, skipped: 1 };
  }

  const accessToken = await fetchGoogleAccessToken(cfg);
  if (!accessToken) return { configured: true, sent: 0, failed: 0, skipped: 0 };

  const admin = deps?.admin ?? (await getDefaultAdmin());
  const devices = await fetchActiveTokensForUsers(admin, [notif.recipient_id]);
  if (devices.length === 0) return { configured: true, sent: 0, failed: 0, skipped: 1 };

  const channelId = androidChannelForNotification(notif.type, notif.related_type);
  const res = await sendToUserDevices(admin, cfg, accessToken, devices, {
    eventKey: `notif:${notif.id}`,
    notificationId: notif.id,
    recipientId: notif.recipient_id,
    title: notif.title || "Ebrystore",
    body: notif.message || "Ada pembaruan baru di akun kamu.",
    channelId,
    collapseKey: notif.related_id ? `${channelId}_${notif.related_id}` : channelId,
    data: {
      kind: "notification",
      notificationId: notif.id,
      type: notif.type || "general",
      relatedType: notif.related_type ?? "",
      relatedId: notif.related_id ?? "",
      actionStyle: channelId === "ebry_order" || channelId === "ebry_payment" ? "order" : "default",
    },
  });

  return { configured: true, ...res };
}

/**
 * Mengirim push realtime interaktif (MessagingStyle + Direct Reply) untuk setiap pesan
 * baru pada `public.product_inquiry_messages`.
 * Pengirim sendiri otomatis dikecualikan agar tidak menerima push pesan sendiri.
 */
export async function dispatchChatMessagePush(
  msg: ChatMessagePushRow,
  deps?: { admin?: AdminClientLike; cfg?: FcmServiceAccount | null },
): Promise<{ configured: boolean; sent: number; failed: number; skipped: number }> {
  const cfg = deps?.cfg !== undefined ? deps.cfg : readFcmConfig();
  if (!cfg) return { configured: false, sent: 0, failed: 0, skipped: 0 };

  const accessToken = await fetchGoogleAccessToken(cfg);
  if (!accessToken) return { configured: true, sent: 0, failed: 0, skipped: 0 };

  const admin = deps?.admin ?? (await getDefaultAdmin());
  const { data: inquiry } = await admin
    .from("product_inquiries")
    .select("id, user_id, store_id, subject")
    .eq("id", msg.inquiry_id)
    .maybeSingle();
  if (!inquiry) return { configured: true, sent: 0, failed: 0, skipped: 1 };

  let store: { name: string; owner_id: string | null; is_platform: boolean | null } | null = null;
  if (inquiry.store_id) {
    const { data: s } = await admin
      .from("stores")
      .select("name, owner_id, is_platform")
      .eq("id", inquiry.store_id)
      .maybeSingle();
    store = s ?? null;
  }

  let recipientIds: string[] = [];
  let senderName = "Ebrystore";

  if (msg.sender_role === "customer") {
    const { data: prof } = msg.sender_id
      ? await admin.from("profiles").select("full_name, email").eq("id", msg.sender_id).maybeSingle()
      : { data: null };
    senderName = prof?.full_name || prof?.email?.split("@")[0] || "Pembeli";

    if (store && !store.is_platform && store.owner_id) {
      recipientIds = [store.owner_id];
    } else {
      const { data: roles } = await admin
        .from("user_roles")
        .select("user_id")
        .in("role", STAFF_ROLES);
      recipientIds = Array.from(new Set((roles ?? []).map((r: { user_id: string }) => r.user_id)));
    }
  } else {
    senderName =
      msg.sender_role === "seller" && store?.name ? store.name : "Tim Ebrystore";
    recipientIds = [inquiry.user_id];
  }

  // Jangan pernah kirim push ke pengirim sendiri.
  const filteredRecipients = recipientIds.filter((uid) => Boolean(uid) && uid !== msg.sender_id);
  if (filteredRecipients.length === 0) {
    return { configured: true, sent: 0, failed: 0, skipped: 1 };
  }

  const devices = await fetchActiveTokensForUsers(admin, filteredRecipients);
  if (devices.length === 0) {
    return { configured: true, sent: 0, failed: 0, skipped: filteredRecipients.length };
  }

  const byUser = new Map<string, DeviceTokenRow[]>();
  for (const d of devices) {
    const list = byUser.get(d.user_id) ?? [];
    list.push(d);
    byUser.set(d.user_id, list);
  }

  const preview = formatChatAttachmentPreview(msg.body, msg.attachment);
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const uid of filteredRecipients) {
    const userDevices = byUser.get(uid) ?? [];
    if (userDevices.length === 0) {
      skipped += 1;
      continue;
    }
    const res = await sendToUserDevices(admin, cfg, accessToken, userDevices, {
      eventKey: `chat:${msg.id}`,
      notificationId: null,
      recipientId: uid,
      title: senderName,
      body: preview,
      channelId: "ebry_chat",
      collapseKey: `ebry_chat_${inquiry.id}`,
      data: {
        kind: "chat",
        actionStyle: "chat_reply",
        threadId: String(inquiry.id),
        messageId: String(msg.id),
        senderName,
        subject: String(inquiry.subject ?? ""),
        type: "product_inquiry",
        relatedType: "product_inquiry",
        relatedId: String(inquiry.id),
      },
    });
    sent += res.sent;
    failed += res.failed;
    skipped += res.skipped;
  }

  return { configured: true, sent, failed, skipped };
}

/**
 * Safety sweep (reconciliation) untuk menangkap notifikasi belum terkirim jika worker
 * sempat restart atau terputus dari Realtime sementara.
 */
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

  const admin = await getDefaultAdmin();
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

  const userIds = Array.from(
    new Set(notifications.map((n: { recipient_id: string }) => n.recipient_id)),
  );
  const notifIds = notifications.map((n: { id: string }) => n.id);

  const [tokens, { data: existingLogs }] = await Promise.all([
    fetchActiveTokensForUsers(admin, userIds),
    admin
      .from("push_dispatch_log")
      .select("notification_id, token_hash")
      .in("notification_id", notifIds),
  ]);

  if (tokens.length === 0) {
    return { configured: true, sent: 0, failed: 0, skipped: notifications.length };
  }

  const sentPairs = new Set<string>(
    (existingLogs ?? []).map(
      (r: { notification_id: string | null; token_hash: string }) =>
        `${r.notification_id ?? ""}:${r.token_hash}`,
    ),
  );
  const tokensByUser = new Map<string, DeviceTokenRow[]>();
  for (const row of tokens) {
    const cur = tokensByUser.get(row.user_id) ?? [];
    cur.push(row);
    tokensByUser.set(row.user_id, cur);
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const notif of notifications as NotificationPushRow[]) {
    const userTokens = tokensByUser.get(notif.recipient_id) ?? [];
    if (userTokens.length === 0) {
      skipped += 1;
      continue;
    }
    const channelId = androidChannelForNotification(notif.type, notif.related_type);
    const eligible = userTokens.filter((dev) => {
      const tokenHash = hashPushToken(dev.token);
      if (sentPairs.has(`${notif.id}:${tokenHash}`)) {
        skipped += 1;
        return false;
      }
      return true;
    });
    if (eligible.length === 0) continue;

    const res = await sendToUserDevices(admin, cfg, accessToken, eligible, {
      eventKey: `notif:${notif.id}`,
      notificationId: notif.id,
      recipientId: notif.recipient_id,
      title: notif.title || "Ebrystore",
      body: notif.message || "Ada pembaruan baru di akun kamu.",
      channelId,
      collapseKey: notif.related_id ? `${channelId}_${notif.related_id}` : channelId,
      data: {
        kind: notif.related_type === "product_inquiry" ? "chat" : "notification",
        notificationId: notif.id,
        type: notif.type || "general",
        relatedType: notif.related_type ?? "",
        relatedId: notif.related_id ?? "",
        ...(notif.related_type === "product_inquiry" && notif.related_id
          ? { threadId: notif.related_id, actionStyle: "chat_reply" }
          : { actionStyle: channelId === "ebry_order" || channelId === "ebry_payment" ? "order" : "default" }),
      },
    });
    sent += res.sent;
    failed += res.failed;
    skipped += res.skipped;
  }

  return { configured: true, sent, failed, skipped };
}
