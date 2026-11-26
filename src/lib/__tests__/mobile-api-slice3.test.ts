import { describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  androidChannelForNotification,
  buildFcmOAuthAssertion,
  dispatchPendingPushNotifications,
  hashPushToken,
} from "../fcm.server";
import { handleMobileV1Request, mobileErr, mobileOk } from "../mobile-api.server";
import { handleMobileCommerceRoute, type MobileCommerceHelpers } from "../mobile-commerce.server";

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
    expect(body.data.helpTopics).toHaveLength(12);
    expect(res.headers.get("cache-control")).toContain("public");
  });

  it("validates password change length and manual topup status ID", async () => {
    const shortPw = await handleMobileV1Request(
      new Request("https://app.ebrystore.my.id/api/mobile/v1/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "short" }),
      }),
      { requireAuth: async () => mockAuthContext(), checkRateLimit: async () => null },
    );
    expect(shortPw.status).toBe(400);

    const badTopupId = await handleMobileV1Request(
      new Request("https://app.ebrystore.my.id/api/mobile/v1/wallet/topup/manual/not-a-uuid", {
        method: "GET",
      }),
      { requireAuth: async () => mockAuthContext(), checkRateLimit: async () => null },
    );
    expect(badTopupId.status).toBe(400);

    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "44444444-4444-4444-8444-444444444444",
        topup_number: "TOP-001",
        status: "rejected",
        amount: 50000,
        expires_at: "2026-11-28T00:00:00Z",
        proof_submitted_at: "2026-11-27T01:00:00Z",
        review_note: "Nominal tidak sesuai mutasi",
        paid_at: null,
        method_snapshot: null,
      },
      error: null,
    });
    const eqUser = vi.fn().mockReturnValue({ maybeSingle });
    const eqId = vi.fn().mockReturnValue({ eq: eqUser });
    const select = vi.fn().mockReturnValue({ eq: eqId });
    const from = vi.fn().mockReturnValue({ select });

    const topupStatus = await handleMobileV1Request(
      new Request(
        "https://app.ebrystore.my.id/api/mobile/v1/wallet/topup/manual/44444444-4444-4444-8444-444444444444",
        { method: "GET" },
      ),
      { requireAuth: async () => mockAuthContext({ from }), checkRateLimit: async () => null },
    );
    expect(topupStatus.status).toBe(200);
    const json = (await topupStatus.json()) as {
      ok: boolean;
      data: { status: string; reviewNote: string };
    };
    expect(json.ok).toBe(true);
    expect(json.data.status).toBe("rejected");
    expect(json.data.reviewNote).toBe("Nominal tidak sesuai mutasi");
  });

  it("returns cacheable headers on /home and surfaces creditWarning when digital credit fails", async () => {
    const homeRes = await handleMobileV1Request(
      new Request("https://app.ebrystore.my.id/api/mobile/v1/home", { method: "GET" }),
      {
        checkRateLimit: async () => null,
        readHome: async () => ({ categories: [], latest: [] }),
      },
    );
    expect(homeRes.status).toBe(200);
    expect(homeRes.headers.get("cache-control")).toContain("public");

    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          order_id: "22222222-2222-4222-8222-222222222222",
          order_number: "EBR-002",
          duplicate: false,
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: "INSUFFICIENT_CREDIT" } });

    const helpers: MobileCommerceHelpers = {
      ok: mobileOk,
      err: mobileErr,
      readJsonBody: async (request) => {
        const raw = await request.text();
        return { ok: true, body: raw ? JSON.parse(raw) : {} };
      },
      requireAuth: async () => mockAuthContext({ rpc }),
      checkPublicRateLimit: async () => null,
      checkFeature: async () => true,
      checkUserRateLimit: async () => null,
    };
    const url = new URL("https://app.ebrystore.my.id/api/mobile/v1/orders/digital");
    const orderRes = await handleMobileCommerceRoute(
      new Request(url.toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: "11111111-1111-4111-8111-111111111111",
          quantity: 1,
          idempotencyKey: "idem-warn-1234",
          useCredit: true,
        }),
      }),
      url.pathname,
      "POST",
      url,
      helpers,
    );
    expect(orderRes?.status).toBe(201);
    const body = (await orderRes!.json()) as { ok: boolean; data: { creditWarning?: string } };
    expect(body.ok).toBe(true);
    expect(body.data.creditWarning).toBeTruthy();
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
