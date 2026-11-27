import { z } from "zod";

import type { MobileAuthResult } from "./mobile-auth.server";
import { enforceRateLimit } from "./rate-limit.server";
import {
  DEFAULT_PUSH_PREFERENCES,
  normalizePushPreferences,
  type PushPreferences,
} from "@/services/firebase-push/config";
import { dispatchChatMessagePush } from "@/services/firebase-push/dispatcher";

export type MobileChatHelpers = {
  ok: <T>(data: T, status?: number) => Response;
  err: (code: string, message: string, status: number) => Response;
  readJsonBody: (
    request: Request,
  ) => Promise<{ ok: true; body: unknown } | { ok: false; response: Response }>;
  requireAuth: (request: Request) => Promise<MobileAuthResult>;
};

const STAFF_ROLES = ["admin", "super_admin", "support"] as const;
const MESSAGE_PAGE_SIZE = 50;

const THREAD_FIELDS =
  "id, product_id, service_id, store_id, user_id, subject, status, last_message_at, created_at, " +
  "last_message_body, last_message_role, customer_read_at, merchant_read_at";

const MESSAGE_FIELDS_RICH =
  "id, sender_id, sender_role, body, is_system, created_at, attachment, reply_to_id, reactions, edited_at, deleted_at";
const MESSAGE_FIELDS_BASE =
  "id, sender_id, sender_role, body, is_system, created_at, attachment";

const openThreadSchema = z.object({
  productId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  subject: z.string().trim().min(2).max(160).optional(),
  initialMessage: z.string().trim().min(1).max(2000).optional(),
});

const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "Pesan tidak boleh kosong.").max(2000),
  replyToId: z.string().uuid().nullable().optional(),
});

const pushPreferencesSchema = z.object({
  orders: z.boolean().optional(),
  payments: z.boolean().optional(),
  chat: z.boolean().optional(),
  wallet: z.boolean().optional(),
  store: z.boolean().optional(),
  promo: z.boolean().optional(),
  muted: z.boolean().optional(),
});

function isMissingColumnOrTable(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "");
  return code === "42703" || code === "42P01" || msg.includes("does not exist");
}

function isThreadUnread(row: {
  last_message_at: string;
  last_message_role: string | null;
  customer_read_at: string | null;
  merchant_read_at: string | null;
  isSellerView: boolean;
}): boolean {
  if (!row.last_message_role || row.last_message_role === "system") return false;
  if (row.isSellerView) {
    if (row.last_message_role !== "customer") return false;
    if (!row.merchant_read_at) return true;
    return Date.parse(row.last_message_at) > Date.parse(row.merchant_read_at);
  }
  if (row.last_message_role === "customer") return false;
  if (!row.customer_read_at) return true;
  return Date.parse(row.last_message_at) > Date.parse(row.customer_read_at);
}

async function notifyThreadOnce(
  recipientId: string,
  title: string,
  message: string,
  inquiryId: string,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as { from: (t: string) => any };
    const { data: existing } = await admin
      .from("notifications")
      .select("id")
      .eq("recipient_id", recipientId)
      .eq("related_type", "product_inquiry")
      .eq("related_id", inquiryId)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await admin
        .from("notifications")
        .update({ title, message, created_at: new Date().toISOString() })
        .eq("id", existing.id);
      return;
    }
    await admin.from("notifications").insert({
      recipient_id: recipientId,
      type: "product_inquiry",
      title,
      message,
      related_type: "product_inquiry",
      related_id: inquiryId,
    });
  } catch {
    // Non-fatal notification failure.
  }
}

async function markThreadRead(
  sb: any,
  userId: string,
  inquiry: { id: string; user_id: string; store_id: string | null },
  myStoreId: string | null,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const isOwner = inquiry.user_id === userId;
  const isSeller = Boolean(!isOwner && inquiry.store_id && myStoreId && inquiry.store_id === myStoreId);
  if (isOwner) {
    await sb.from("product_inquiries").update({ customer_read_at: nowIso }).eq("id", inquiry.id);
  } else if (isSeller) {
    await sb.from("product_inquiries").update({ merchant_read_at: nowIso }).eq("id", inquiry.id);
  }
  // Clear matching bell notification for this thread so badge stays accurate.
  await sb
    .from("notifications")
    .update({ read_at: nowIso })
    .eq("recipient_id", userId)
    .eq("related_type", "product_inquiry")
    .eq("related_id", inquiry.id)
    .is("read_at", null);
}

export async function handleMobileChatRoute(
  request: Request,
  path: string,
  method: string,
  url: URL,
  h: MobileChatHelpers,
): Promise<Response | null> {
  /* ------------------- Push Notification Preferences ------------------- */
  if (path === "/api/mobile/v1/devices/push-preferences") {
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const sb = auth.context.supabase as unknown as { from: (t: string) => any };

    if (method === "GET") {
      const { data, error } = await sb
        .from("user_push_tokens")
        .select("push_preferences")
        .eq("user_id", auth.context.userId)
        .is("revoked_at", null)
        .order("last_seen_at", { ascending: false })
        .limit(1);
      if (error) {
        if (isMissingColumnOrTable(error)) {
          return h.ok({ preferences: DEFAULT_PUSH_PREFERENCES, migrationPending: true });
        }
        return h.err("PUSH_PREFS_FAILED", "Gagal memuat pengaturan notifikasi.", 503);
      }
      const latest = Array.isArray(data) && data.length > 0 ? data[0]?.push_preferences : null;
      return h.ok({ preferences: normalizePushPreferences(latest), migrationPending: false });
    }

    if (method === "PUT" || method === "PATCH") {
      const bodyRes = await h.readJsonBody(request);
      if (!bodyRes.ok) return bodyRes.response;
      const parsed = pushPreferencesSchema.safeParse(bodyRes.body);
      if (!parsed.success) {
        return h.err("INVALID_INPUT", "Pengaturan notifikasi tidak valid.", 400);
      }

      const existingRes = await sb
        .from("user_push_tokens")
        .select("push_preferences")
        .eq("user_id", auth.context.userId)
        .is("revoked_at", null)
        .order("last_seen_at", { ascending: false })
        .limit(1);

      if (existingRes.error && isMissingColumnOrTable(existingRes.error)) {
        const merged: PushPreferences = { ...DEFAULT_PUSH_PREFERENCES, ...parsed.data };
        return h.ok({ preferences: merged, saved: false, migrationPending: true });
      }

      const current = normalizePushPreferences(
        Array.isArray(existingRes.data) ? existingRes.data[0]?.push_preferences : null,
      );
      const next: PushPreferences = { ...current, ...parsed.data };

      const { error } = await sb
        .from("user_push_tokens")
        .update({ push_preferences: next })
        .eq("user_id", auth.context.userId)
        .is("revoked_at", null);

      if (error && !isMissingColumnOrTable(error)) {
        return h.err("PUSH_PREFS_FAILED", "Gagal menyimpan pengaturan notifikasi.", 503);
      }
      return h.ok({ preferences: next, saved: !error, migrationPending: Boolean(error) });
    }

    return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
  }

  /* ------------------- Chat Threads List & Open/Create ------------------- */
  if (path === "/api/mobile/v1/chats") {
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);
    const sb = auth.context.supabase as unknown as {
      from: (t: string) => any;
      rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
    };
    const userId = auth.context.userId;

    if (method === "GET") {
      const myStoreRes = await sb.rpc("my_store_id").catch(() => ({ data: null, error: null }));
      const myStoreId = (myStoreRes?.data as string | null) ?? null;

      let query = sb
        .from("product_inquiries")
        .select(THREAD_FIELDS)
        .order("last_message_at", { ascending: false })
        .limit(50);

      query = myStoreId
        ? query.or(`user_id.eq.${userId},store_id.eq.${myStoreId}`)
        : query.eq("user_id", userId);

      const { data: rows, error } = await query;
      if (error) return h.err("CHAT_LOAD_FAILED", "Daftar chat gagal dimuat.", 503);

      const list = (rows ?? []) as Array<Record<string, any>>;
      const storeIds = Array.from(
        new Set(list.map((r) => r["store_id"]).filter((id): id is string => typeof id === "string")),
      );
      const customerIds = Array.from(
        new Set(
          list
            .filter((r) => r["user_id"] !== userId)
            .map((r) => r["user_id"])
            .filter((id): id is string => typeof id === "string"),
        ),
      );

      const [{ data: stores }, { data: profiles }] = await Promise.all([
        storeIds.length
          ? sb.from("stores").select("id, name, slug, logo_url, is_platform").in("id", storeIds)
          : Promise.resolve({ data: [] }),
        customerIds.length
          ? sb.from("profiles").select("id, full_name, email, avatar_url").in("id", customerIds)
          : Promise.resolve({ data: [] }),
      ]);

      const storeById = new Map<string, { name: string; slug: string; logoUrl: string | null }>();
      for (const s of (stores ?? []) as Array<Record<string, any>>) {
        storeById.set(String(s["id"]), {
          name: String(s["name"] ?? "Tim Ebrystore"),
          slug: String(s["slug"] ?? ""),
          logoUrl: (s["logo_url"] as string | null) ?? null,
        });
      }

      const profileById = new Map<string, { name: string; avatarUrl: string | null }>();
      for (const p of (profiles ?? []) as Array<Record<string, any>>) {
        const fallback = typeof p["email"] === "string" ? p["email"].split("@")[0] : "Pelanggan";
        profileById.set(String(p["id"]), {
          name: String(p["full_name"] || fallback || "Pelanggan"),
          avatarUrl: (p["avatar_url"] as string | null) ?? null,
        });
      }

      let unreadThreads = 0;
      const items = list.map((r) => {
        const isSellerView = Boolean(myStoreId && r["store_id"] === myStoreId && r["user_id"] !== userId);
        const store = r["store_id"] ? storeById.get(String(r["store_id"])) : null;
        const customer = profileById.get(String(r["user_id"]));
        const unread = isThreadUnread({
          last_message_at: String(r["last_message_at"] ?? r["created_at"] ?? ""),
          last_message_role: (r["last_message_role"] as string | null) ?? null,
          customer_read_at: (r["customer_read_at"] as string | null) ?? null,
          merchant_read_at: (r["merchant_read_at"] as string | null) ?? null,
          isSellerView,
        });
        if (unread) unreadThreads += 1;

        return {
          id: String(r["id"]),
          subject: String(r["subject"] ?? "Percakapan"),
          status: String(r["status"] ?? "open"),
          productId: (r["product_id"] as string | null) ?? null,
          serviceId: (r["service_id"] as string | null) ?? null,
          storeId: (r["store_id"] as string | null) ?? null,
          counterpartyName: isSellerView
            ? (customer?.name ?? "Pelanggan")
            : (store?.name ?? "Tim Ebrystore"),
          counterpartyAvatarUrl: isSellerView
            ? (customer?.avatarUrl ?? null)
            : (store?.logoUrl ?? null),
          storeSlug: store?.slug ?? null,
          isSellerView,
          unread,
          lastMessageBody: (r["last_message_body"] as string | null) ?? null,
          lastMessageRole: (r["last_message_role"] as string | null) ?? null,
          lastMessageAt: String(r["last_message_at"] ?? r["created_at"] ?? ""),
        };
      });

      return h.ok({ items, unreadThreads });
    }

    if (method === "POST") {
      const limited = await enforceRateLimit(userId, "inquiry.create");
      if (limited) return h.err("RATE_LIMITED", limited.error, 429);

      const bodyRes = await h.readJsonBody(request);
      if (!bodyRes.ok) return bodyRes.response;
      const parsed = openThreadSchema.safeParse(bodyRes.body);
      if (!parsed.success) {
        return h.err("INVALID_INPUT", "Data percakapan tidak valid.", 400);
      }

      const data = parsed.data;
      let storeId: string | null = data.storeId ?? null;
      let resolvedSubject = data.subject?.trim() ?? "";

      if (data.productId) {
        const { data: prod } = await sb
          .from("digital_products")
          .select("id, name, store_id")
          .eq("id", data.productId)
          .maybeSingle();
        if (!prod) return h.err("NOT_FOUND", "Produk tidak ditemukan.", 404);
        storeId = (prod.store_id as string | null) ?? null;
        if (!resolvedSubject) resolvedSubject = `Tanya produk: ${String(prod.name).slice(0, 120)}`;
      } else if (data.serviceId) {
        const { data: svc } = await sb
          .from("marketplace_services")
          .select("id, name, store_id")
          .eq("id", data.serviceId)
          .maybeSingle();
        if (!svc) return h.err("NOT_FOUND", "Jasa tidak ditemukan.", 404);
        storeId = (svc.store_id as string | null) ?? null;
        if (!resolvedSubject) resolvedSubject = `Tanya jasa: ${String(svc.name).slice(0, 120)}`;
      }

      let isOfficialStore = !storeId;
      if (storeId) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as unknown as { from: (t: string) => any };
        const { data: store } = await admin
          .from("stores")
          .select("id, name, owner_id, is_platform, status")
          .eq("id", storeId)
          .maybeSingle();
        if (!store || store.status !== "active") {
          return h.err("NOT_FOUND", "Toko tidak ditemukan.", 404);
        }
        if (store.owner_id === userId) {
          return h.err("SELF_CHAT_FORBIDDEN", "Ini tokomu sendiri.", 400);
        }
        isOfficialStore = store.is_platform === true;
        if (isOfficialStore) storeId = null;
        if (!resolvedSubject) resolvedSubject = `Chat dengan ${String(store.name)}`;
      }
      if (!resolvedSubject) resolvedSubject = "Pertanyaan ke Ebrystore";

      // Reuse existing open thread with same store (prioritizing same product/service).
      let findQ = sb
        .from("product_inquiries")
        .select("id, product_id, service_id")
        .eq("user_id", userId)
        .neq("status", "closed")
        .order("last_message_at", { ascending: false })
        .limit(20);
      findQ = storeId ? findQ.eq("store_id", storeId) : findQ.is("store_id", null);
      const { data: existingRows } = await findQ;
      const candidates = (existingRows ?? []) as Array<{
        id: string;
        product_id: string | null;
        service_id: string | null;
      }>;
      const existing =
        (data.serviceId && candidates.find((r) => r.service_id === data.serviceId)) ||
        (data.productId && candidates.find((r) => r.product_id === data.productId)) ||
        candidates[0];

      let threadId = existing?.id ?? null;
      let created = false;
      if (!threadId) {
        const { data: inserted, error: insErr } = await sb
          .from("product_inquiries")
          .insert({
            user_id: userId,
            product_id: data.productId ?? null,
            service_id: data.serviceId ?? null,
            store_id: storeId,
            subject: resolvedSubject.slice(0, 160),
          })
          .select("id")
          .maybeSingle();
        if (insErr || !inserted?.id) {
          return h.err("CHAT_CREATE_FAILED", "Gagal memulai percakapan.", 503);
        }
        threadId = String(inserted.id);
        created = true;
      }

      if (data.initialMessage) {
        const { data: msgRow, error: msgErr } = await sb
          .from("product_inquiry_messages")
          .insert({
            inquiry_id: threadId,
            sender_id: userId,
            sender_role: "customer",
            body: data.initialMessage,
          })
          .select("id, inquiry_id, sender_id, sender_role, body, created_at")
          .maybeSingle();
        if (!msgErr && msgRow) {
          void dispatchChatMessagePush(msgRow).catch(() => {});
        }
      }

      return h.ok({ id: threadId, created }, created ? 201 : 200);
    }

    return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
  }

  /* ------------------- Single Chat Thread Detail / Messages / Read ------------------- */
  const threadMatch = /^\/api\/mobile\/v1\/chats\/([0-9a-f-]{36})(?:\/(messages|read))?$/i.exec(path);
  if (threadMatch) {
    const auth = await h.requireAuth(request);
    if (!auth.ok) return h.err(auth.code, auth.message, auth.status);

    const threadId = threadMatch[1]!;
    const subAction = threadMatch[2] ?? null;
    const sb = auth.context.supabase as unknown as {
      from: (t: string) => any;
      rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
    };
    const userId = auth.context.userId;

    const { data: inquiry } = await sb
      .from("product_inquiries")
      .select(THREAD_FIELDS)
      .eq("id", threadId)
      .maybeSingle();

    if (!inquiry) {
      return h.err("NOT_FOUND", "Percakapan tidak ditemukan.", 404);
    }

    const myStoreRes = await sb.rpc("my_store_id").catch(() => ({ data: null, error: null }));
    const myStoreId = (myStoreRes?.data as string | null) ?? null;
    const isOwner = inquiry.user_id === userId;
    const isSeller = Boolean(!isOwner && inquiry.store_id && myStoreId && inquiry.store_id === myStoreId);

    // GET /api/mobile/v1/chats/:id
    if (!subAction && method === "GET") {
      const before = url.searchParams.get("before")?.trim() || undefined;
      const peek = url.searchParams.get("peek") === "1";

      const queryMsgs = async (fields: string) => {
        let q = sb.from("product_inquiry_messages").select(fields).eq("inquiry_id", threadId);
        if (before) q = q.lt("created_at", before);
        return q.order("created_at", { ascending: false }).limit(MESSAGE_PAGE_SIZE + 1);
      };

      let msgRes = await queryMsgs(MESSAGE_FIELDS_RICH);
      if (msgRes.error && isMissingColumnOrTable(msgRes.error)) {
        msgRes = await queryMsgs(MESSAGE_FIELDS_BASE);
      }

      const [storeRes, prodRes, svcRes, customerRes] = await Promise.all([
        inquiry.store_id
          ? sb.from("stores").select("id, name, slug, logo_url").eq("id", inquiry.store_id).maybeSingle()
          : Promise.resolve({ data: null }),
        inquiry.product_id
          ? sb
              .from("digital_products")
              .select("id, name, slug, price, discount_price, thumbnail_url")
              .eq("id", inquiry.product_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        inquiry.service_id
          ? sb
              .from("marketplace_services")
              .select("id, name, price, duration_days")
              .eq("id", inquiry.service_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        !isOwner
          ? sb.from("profiles").select("full_name, email, avatar_url").eq("id", inquiry.user_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const rawList = (msgRes.data ?? []) as Array<Record<string, any>>;
      const hasMore = rawList.length > MESSAGE_PAGE_SIZE;
      const messagesDesc = rawList.slice(0, MESSAGE_PAGE_SIZE);
      const messages = [...messagesDesc].reverse().map((m) => ({
        id: String(m["id"]),
        senderId: (m["sender_id"] as string | null) ?? null,
        senderRole: String(m["sender_role"] ?? "customer"),
        body: String(m["body"] ?? ""),
        isSystem: Boolean(m["is_system"]),
        isMine: m["sender_id"] === userId,
        replyToId: (m["reply_to_id"] as string | null) ?? null,
        attachmentKind:
          m["attachment"] && typeof m["attachment"] === "object"
            ? String((m["attachment"] as Record<string, unknown>)["kind"] ?? "") || null
            : null,
        attachmentName:
          m["attachment"] && typeof m["attachment"] === "object"
            ? String((m["attachment"] as Record<string, unknown>)["name"] ?? "") || null
            : null,
        deletedAt: (m["deleted_at"] as string | null) ?? null,
        createdAt: String(m["created_at"] ?? ""),
      }));

      if (!peek && !before) {
        await markThreadRead(sb, userId, inquiry, myStoreId);
      }

      const store = storeRes.data as Record<string, any> | null;
      const customer = customerRes.data as Record<string, any> | null;
      const counterpartyName = isOwner
        ? String(store?.["name"] ?? "Tim Ebrystore")
        : String(
            customer?.["full_name"] ||
              (typeof customer?.["email"] === "string" ? customer["email"].split("@")[0] : "Pelanggan"),
          );

      return h.ok({
        thread: {
          id: String(inquiry.id),
          subject: String(inquiry.subject ?? "Percakapan"),
          status: String(inquiry.status ?? "open"),
          counterpartyName,
          counterpartyAvatarUrl: isOwner
            ? ((store?.["logo_url"] as string | null) ?? null)
            : ((customer?.["avatar_url"] as string | null) ?? null),
          storeSlug: (store?.["slug"] as string | null) ?? null,
          isOwner,
          isSeller,
          product: prodRes.data
            ? {
                id: String(prodRes.data.id),
                slug: String(prodRes.data.slug ?? ""),
                name: String(prodRes.data.name ?? ""),
                price: Number(prodRes.data.price ?? 0),
                discountPrice:
                  prodRes.data.discount_price != null ? Number(prodRes.data.discount_price) : null,
                thumbnailUrl: (prodRes.data.thumbnail_url as string | null) ?? null,
              }
            : null,
          service: svcRes.data
            ? {
                id: String(svcRes.data.id),
                name: String(svcRes.data.name ?? ""),
                price: Number(svcRes.data.price ?? 0),
                durationDays: Number(svcRes.data.duration_days ?? 1),
              }
            : null,
        },
        messages,
        hasMore,
        oldest: messages[0]?.createdAt ?? null,
      });
    }

    // POST /api/mobile/v1/chats/:id/messages (also used by Android Direct Reply!)
    if (subAction === "messages" && method === "POST") {
      const limited = await enforceRateLimit(userId, "inquiry.message");
      if (limited) return h.err("RATE_LIMITED", limited.error, 429);

      if (inquiry.status === "closed") {
        return h.err("THREAD_CLOSED", "Percakapan sudah ditutup.", 409);
      }

      const bodyRes = await h.readJsonBody(request);
      if (!bodyRes.ok) return bodyRes.response;
      const parsed = sendMessageSchema.safeParse(bodyRes.body);
      if (!parsed.success) {
        return h.err("INVALID_INPUT", "Pesan tidak valid atau kosong.", 400);
      }

      let validReplyToId: string | null = null;
      if (parsed.data.replyToId) {
        const { data: targetMsg } = await sb
          .from("product_inquiry_messages")
          .select("id")
          .eq("id", parsed.data.replyToId)
          .eq("inquiry_id", threadId)
          .maybeSingle();
        if (!targetMsg) {
          return h.err("INVALID_INPUT", "Pesan yang dibalas tidak ditemukan.", 400);
        }
        validReplyToId = String(targetMsg.id);
      }

      const senderRole = isOwner ? "customer" : isSeller ? "seller" : "staff";
      const insertPayload: Record<string, unknown> = {
        inquiry_id: threadId,
        sender_id: userId,
        sender_role: senderRole,
        body: parsed.data.body,
        ...(validReplyToId ? { reply_to_id: validReplyToId } : {}),
      };

      let insRes = await sb
        .from("product_inquiry_messages")
        .insert(insertPayload)
        .select("id, inquiry_id, sender_id, sender_role, body, is_system, created_at")
        .maybeSingle();

      if (insRes.error && validReplyToId && isMissingColumnOrTable(insRes.error)) {
        const { reply_to_id: _drop, ...fallback } = insertPayload;
        insRes = await sb
          .from("product_inquiry_messages")
          .insert(fallback)
          .select("id, inquiry_id, sender_id, sender_role, body, is_system, created_at")
          .maybeSingle();
      }

      if (insRes.error || !insRes.data) {
        return h.err("MESSAGE_SEND_FAILED", "Pesan gagal dikirim. Coba lagi.", 503);
      }

      const createdMsg = insRes.data as {
        id: string;
        inquiry_id: string;
        sender_id: string;
        sender_role: string;
        body: string;
        is_system: boolean;
        created_at: string;
      };

      // Update in-app bell notification + trigger immediate push fast-path (deduped with worker).
      void (async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const admin = supabaseAdmin as unknown as { from: (t: string) => any };
          if (isOwner) {
            if (inquiry.store_id) {
              const { data: st } = await admin
                .from("stores")
                .select("owner_id, is_platform")
                .eq("id", inquiry.store_id)
                .maybeSingle();
              if (st && !st.is_platform && st.owner_id) {
                await notifyThreadOnce(st.owner_id, "Pesan baru di chat", parsed.data.body, threadId);
              } else {
                const { data: roles } = await admin
                  .from("user_roles")
                  .select("user_id")
                  .in("role", STAFF_ROLES);
                for (const r of (roles ?? []) as Array<{ user_id: string }>) {
                  await notifyThreadOnce(r.user_id, "Pesan baru di chat", parsed.data.body, threadId);
                }
              }
            } else {
              const { data: roles } = await admin
                .from("user_roles")
                .select("user_id")
                .in("role", STAFF_ROLES);
              for (const r of (roles ?? []) as Array<{ user_id: string }>) {
                await notifyThreadOnce(r.user_id, "Pesan baru di chat", parsed.data.body, threadId);
              }
            }
          } else {
            await notifyThreadOnce(
              inquiry.user_id,
              isSeller ? "Balasan dari penjual" : "Balasan tim Ebrystore",
              parsed.data.body,
              threadId,
            );
          }
          await dispatchChatMessagePush(createdMsg);
        } catch {
          // Non-fatal; isolated worker also listens via Supabase Realtime.
        }
      })();

      return h.ok(
        {
          message: {
            id: createdMsg.id,
            senderId: createdMsg.sender_id,
            senderRole: createdMsg.sender_role,
            body: createdMsg.body,
            isSystem: Boolean(createdMsg.is_system),
            isMine: true,
            replyToId: validReplyToId,
            attachmentKind: null,
            attachmentName: null,
            deletedAt: null,
            createdAt: createdMsg.created_at,
          },
        },
        201,
      );
    }

    // POST /api/mobile/v1/chats/:id/read
    if (subAction === "read" && method === "POST") {
      await markThreadRead(sb, userId, inquiry, myStoreId);
      return h.ok({ read: true });
    }

    return h.err("METHOD_NOT_ALLOWED", "Metode tidak diizinkan.", 405);
  }

  return null;
}
