import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PUSH_PREFERENCES,
  normalizePushPreferences,
  readFcmConfig,
} from "@/services/firebase-push/config";
import {
  androidChannelForNotification,
  buildFcmMessageBody,
  buildFcmOAuthAssertion,
  preferenceCategoryForChannel,
} from "@/services/firebase-push/fcm-client";
import {
  dispatchChatMessagePush,
  formatChatAttachmentPreview,
  shouldSendForPreferences,
} from "@/services/firebase-push/dispatcher";
import { handleMobileChatRoute } from "@/lib/mobile-chat.server";

describe("Isolated Firebase Push Service & Mobile Chat API", () => {
  it("builds Android high-priority data-only payload so interactive actions always wake onMessageReceived", () => {
    const body = buildFcmMessageBody({
      token: "fcm_device_token_1234567890",
      platform: "android",
      title: "Toko Citra",
      body: "Produk siap diunduh kak",
      channelId: "ebry_chat",
      collapseKey: "ebry_chat_abc",
      data: {
        kind: "chat",
        actionStyle: "chat_reply",
        threadId: "abc",
      },
    }) as { message: Record<string, unknown> };

    expect(body.message["notification"]).toBeUndefined();
    expect((body.message["android"] as Record<string, unknown>)["priority"]).toBe("HIGH");
    expect((body.message["data"] as Record<string, string>)["title"]).toBe("Toko Citra");
    expect((body.message["data"] as Record<string, string>)["channelId"]).toBe("ebry_chat");
    expect((body.message["data"] as Record<string, string>)["actionStyle"]).toBe("chat_reply");

    const iosBody = buildFcmMessageBody({
      token: "ios_token_1234567890",
      platform: "ios",
      title: "Ebrystore",
      body: "Pembayaran lunas",
      channelId: "ebry_payment",
      data: { kind: "notification" },
    }) as { message: Record<string, unknown> };
    expect(iosBody.message["notification"]).toEqual({ title: "Ebrystore", body: "Pembayaran lunas" });
  });

  it("classifies chat channels and enforces mute/category preferences", () => {
    expect(androidChannelForNotification("product_inquiry", "product_inquiry")).toBe("ebry_chat");
    expect(preferenceCategoryForChannel("ebry_chat")).toBe("chat");
    expect(preferenceCategoryForChannel("ebry_payment")).toBe("payments");
    expect(preferenceCategoryForChannel("ebry_credit")).toBe("wallet");

    const muted = normalizePushPreferences({ muted: true, chat: true });
    expect(shouldSendForPreferences(muted, "ebry_chat")).toBe(false);

    const noChat = normalizePushPreferences({ chat: false, orders: true });
    expect(shouldSendForPreferences(noChat, "ebry_chat")).toBe(false);
    expect(shouldSendForPreferences(noChat, "ebry_order")).toBe(true);
  });

  it("formats human-friendly attachment previews for chat push notifications", () => {
    expect(formatChatAttachmentPreview("Halo kak", null)).toBe("Halo kak");
    expect(formatChatAttachmentPreview("", { kind: "image" })).toBe("Mengirim foto");
    expect(formatChatAttachmentPreview("", { kind: "audio" })).toBe("Mengirim pesan suara");
    expect(formatChatAttachmentPreview("", { kind: "product", name: "ChatGPT Plus" })).toBe(
      "Membagikan produk: ChatGPT Plus",
    );
  });

  it("dispatches chat push to recipient only and excludes sender self-push", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const cfg = {
      projectId: "ebrystore-test",
      clientEmail: "worker@ebrystore-test.iam.gserviceaccount.com",
      privateKey,
    };
    expect(buildFcmOAuthAssertion(cfg).split(".")).toHaveLength(3);

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "ya29.test-token", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ name: "projects/ebrystore-test/messages/msg-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const insertedLogs: unknown[] = [];
    const fakeAdmin = {
      from: (table: string) => {
        if (table === "product_inquiries") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "11111111-1111-4111-8111-111111111111",
                    user_id: "buyer-1",
                    store_id: "store-1",
                    subject: "Tanya ChatGPT Plus",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "stores") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { name: "Toko Citra", owner_id: "seller-1", is_platform: false },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "user_push_tokens") {
          return {
            select: () => ({
              in: () => ({
                is: async () => ({
                  data: [
                    {
                      id: "tok-1",
                      user_id: "buyer-1",
                      token: "fcm_buyer_device_token_1234567890",
                      platform: "android",
                      push_preferences: DEFAULT_PUSH_PREFERENCES,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "push_dispatch_log") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
            insert: async (row: unknown) => {
              insertedLogs.push(row);
              return { error: null };
            },
          };
        }
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        };
      },
    };

    try {
      const res = await dispatchChatMessagePush(
        {
          id: "22222222-2222-4222-8222-222222222222",
          inquiry_id: "11111111-1111-4111-8111-111111111111",
          sender_id: "seller-1",
          sender_role: "seller",
          body: "Ready kak, silakan checkout ya",
        },
        { admin: fakeAdmin, cfg },
      );

      expect(res.configured).toBe(true);
      expect(res.sent).toBe(1);
      expect(res.failed).toBe(0);
      expect(insertedLogs).toHaveLength(1);
      expect((insertedLogs[0] as Record<string, unknown>)["event_key"]).toBe(
        "chat:22222222-2222-4222-8222-222222222222",
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("enforces authentication and validates input on mobile chat & push-preferences routes", async () => {
    const ok = <T,>(data: T, status = 200) =>
      new Response(JSON.stringify({ ok: true, data }), {
        status,
        headers: { "content-type": "application/json" },
      });
    const err = (code: string, message: string, status: number) =>
      new Response(JSON.stringify({ ok: false, error: { code, message } }), {
        status,
        headers: { "content-type": "application/json" },
      });
    const readJsonBody = async (req: Request) => ({ ok: true as const, body: await req.json() });

    // Unauthenticated call returns 401
    const unauthRes = await handleMobileChatRoute(
      new Request("https://app.ebrystore.my.id/api/mobile/v1/chats", { method: "GET" }),
      "/api/mobile/v1/chats",
      "GET",
      new URL("https://app.ebrystore.my.id/api/mobile/v1/chats"),
      {
        ok,
        err,
        readJsonBody,
        requireAuth: async () => ({ ok: false, code: "UNAUTHORIZED", message: "Login dulu", status: 401 }),
      },
    );
    expect(unauthRes?.status).toBe(401);

    // Authenticated GET push-preferences falls back gracefully when migration pending
    const prefsRes = await handleMobileChatRoute(
      new Request("https://app.ebrystore.my.id/api/mobile/v1/devices/push-preferences", { method: "GET" }),
      "/api/mobile/v1/devices/push-preferences",
      "GET",
      new URL("https://app.ebrystore.my.id/api/mobile/v1/devices/push-preferences"),
      {
        ok,
        err,
        readJsonBody,
        requireAuth: async () => ({
          ok: true,
          context: {
            userId: "user-1",
            email: "u@example.com",
            accessToken: "tok",
            claims: { sub: "user-1" },
            supabase: {
              from: () => ({
                select: () => ({
                  eq: () => ({
                    is: () => ({
                      order: () => ({
                        limit: async () => ({ data: null, error: { code: "42P01", message: "missing" } }),
                      }),
                    }),
                  }),
                }),
              }),
            } as any,
          },
        }),
      },
    );
    expect(prefsRes?.status).toBe(200);
    const prefsJson = (await prefsRes?.json()) as { data: { preferences: typeof DEFAULT_PUSH_PREFERENCES; migrationPending: boolean } };
    expect(prefsJson.data.preferences.chat).toBe(true);
    expect(prefsJson.data.migrationPending).toBe(true);
  });

  it("reads null gracefully when no Firebase env vars or path are configured", () => {
    const prevPath = process.env["FCM_SERVICE_ACCOUNT_PATH"];
    const prevJson = process.env["FCM_SERVICE_ACCOUNT_JSON"];
    const prevProj = process.env["FCM_PROJECT_ID"];
    delete process.env["FCM_SERVICE_ACCOUNT_PATH"];
    delete process.env["FCM_SERVICE_ACCOUNT_JSON"];
    delete process.env["FCM_PROJECT_ID"];
    expect(readFcmConfig()).toBeNull();
    if (prevPath) process.env["FCM_SERVICE_ACCOUNT_PATH"] = prevPath;
    if (prevJson) process.env["FCM_SERVICE_ACCOUNT_JSON"] = prevJson;
    if (prevProj) process.env["FCM_PROJECT_ID"] = prevProj;
  });
});
