import { describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  androidChannelForNotification,
  buildFcmOAuthAssertion,
  dispatchPendingPushNotifications,
  hashPushToken,
} from "../fcm.server";
import { handleMobileV1Request } from "../mobile-api.server";

function mockAuthContext(supabaseOverrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    context: {
      userId: "11111111-1111-4111-8111-111111111111",
      email: "buyer@ebrystore.my.id",
      accessToken: "hdr.pay.sig",
      claims: {},
      supabase: {
        rpc: vi.fn(),
        from: vi.fn(),
        ...supabaseOverrides,
      } as never,
    },
  };
}

describe("Mobile API v1 Slice 3 & FCM", () => {
  it("maps notification types to the 6 Android channels", () => {
    expect(androidChannelForNotification("payment_verified", "order")).toBe("ebry_payment");
    expect(androidChannelForNotification("credit_topup", null)).toBe("ebry_credit");
    expect(androidChannelForNotification("chat_message", "chat")).toBe("ebry_chat");
    expect(androidChannelForNotification("seller_payout", "store")).toBe("ebry_store");
    expect(androidChannelForNotification("order_completed", "order")).toBe("ebry_order");
    expect(androidChannelForNotification("announcement", null)).toBe("ebry_general");
  });

  it("signs valid RS256 OAuth assertion JWT for FCM HTTP v1", () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const jwt = buildFcmOAuthAssertion(
      {
        projectId: "ebrystore-demo",
        clientEmail: "fcm@ebrystore-demo.iam.gserviceaccount.com",
        privateKey,
      },
      1_700_000_000,
    );
    const parts = jwt.split(".");
    expect(parts).toHaveLength(3);
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
    expect(payload.iss).toBe("fcm@ebrystore-demo.iam.gserviceaccount.com");
    expect(payload.exp).toBe(1_700_003_600);
    expect(hashPushToken("fcm-token-sample")).toHaveLength(32);
  });

  it("returns configured: false gracefully when FCM env vars are absent", async () => {
    const prev = process.env["FCM_SERVICE_ACCOUNT_JSON"];
    delete process.env["FCM_SERVICE_ACCOUNT_JSON"];
    delete process.env["FCM_PROJECT_ID"];
    const result = await dispatchPendingPushNotifications(10);
    if (prev) process.env["FCM_SERVICE_ACCOUNT_JSON"] = prev;
    expect(result.configured).toBe(false);
    expect(result.sent).toBe(0);
  });

  it("serves native legal and help markdown content without WebView", async () => {
    const res = await handleMobileV1Request(
      new Request("https://app.ebrystore.my.id/api/mobile/v1/content/legal", { method: "GET" }),
      { checkRateLimit: async () => null },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { documents: Array<{ slug: string }>; helpTopics: Array<{ id: string }> };
    };
    expect(body.ok).toBe(true);
    expect(body.data.documents.map((d) => d.slug)).toEqual([
      "syarat-ketentuan",
      "kebijakan-privasi",
      "kebijakan-refund",
    ]);
    expect(body.data.helpTopics.length).toBeGreaterThanOrEqual(4);
  });

  it("registers and revokes mobile push token for authenticated user", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const eqToken = vi.fn().mockResolvedValue({ error: null });
    const eqUser = vi.fn().mockReturnValue({ eq: eqToken });
    const update = vi.fn().mockReturnValue({ eq: eqUser });
    const from = vi.fn().mockReturnValue({ upsert, update });

    const reqPost = new Request("https://app.ebrystore.my.id/api/mobile/v1/devices/push-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token: "fcm_token_valid_length_1234567890",
        platform: "android",
        appVersion: "1.0.0",
      }),
    });
    const resPost = await handleMobileV1Request(reqPost, {
      requireAuth: async () => mockAuthContext({ from }),
      checkRateLimit: async () => null,
    });
    expect(resPost.status).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);

    const reqDel = new Request("https://app.ebrystore.my.id/api/mobile/v1/devices/push-token", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "fcm_token_valid_length_1234567890" }),
    });
    const resDel = await handleMobileV1Request(reqDel, {
      requireAuth: async () => mockAuthContext({ from }),
      checkRateLimit: async () => null,
    });
    expect(resDel.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("rejects out-of-range wallet QRIS topup amount", async () => {
    const req = new Request("https://app.ebrystore.my.id/api/mobile/v1/wallet/topup/qris", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: 5000 }),
    });
    const res = await handleMobileV1Request(req, {
      requireAuth: async () => mockAuthContext(),
      checkRateLimit: async () => null,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("validates seller service checkout requirements length and agreement acceptance", async () => {
    const req = new Request("https://app.ebrystore.my.id/api/mobile/v1/services/seller/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        serviceId: "22222222-2222-4222-8222-222222222222",
        idempotencyKey: "33333333-3333-4333-8333-333333333333",
        expectedVersion: 1,
        expectedTotal: 50000,
        requirements: "pendek",
        agreementAccepted: true,
      }),
    });
    const res = await handleMobileV1Request(req, {
      requireAuth: async () => mockAuthContext(),
      checkRateLimit: async () => null,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("forbids path traversal on manual topup proof submission", async () => {
    const req = new Request("https://app.ebrystore.my.id/api/mobile/v1/wallet/topup/manual/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        topupId: "44444444-4444-4444-8444-444444444444",
        filePath: "other-user/topup-4444/proof.jpg",
        senderName: "Budi Santoso",
      }),
    });
    const res = await handleMobileV1Request(req, {
      requireAuth: async () => mockAuthContext(),
      checkRateLimit: async () => null,
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
