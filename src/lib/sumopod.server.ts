/** Adapter SumoPod Payment Gateway (QRIS). Server-only. */

export type SumopodConfig = { apiKey: string; baseUrl: string; method: string };

export function sumopodConfig(): SumopodConfig | null {
  const apiKey = process.env['SUMOPOD_API_KEY']?.trim();
  if (!apiKey) return null;
  const env = (process.env['SUMOPOD_ENV']?.trim() || "sandbox").toLowerCase();
  const baseUrl =
    env === "live" || env === "production"
      ? "https://api-pay.sumopod.com"
      : "https://api-pay-sandbox.sumopod.com";
  const method = process.env['SUMOPOD_METHOD']?.trim() || "QRIS";
  return { apiKey, baseUrl, method };
}

export type SumopodPayment = {
  paymentId: string;
  orderId: string;
  amount: number;
  fee: number;
  netAmount: number;
  paymentLinkUrl: string;
  status: string;
  expiresAt: string | null;
};

function mapPayment(json: any): SumopodPayment | null {
  if (!json?.payment_id || !json?.payment_link_url) return null;
  return {
    paymentId: String(json.payment_id),
    orderId: String(json.order_id ?? ""),
    amount: Number(json.amount ?? 0),
    fee: Number(json.fee ?? 0),
    netAmount: Number(json.net_amount ?? 0),
    paymentLinkUrl: String(json.payment_link_url),
    status: String(json.status ?? "pending"),
    expiresAt: json.expires_at ? String(json.expires_at) : null,
  };
}

/** Membuat payment link QRIS. `orderRef` harus unik di sistem kami. */
export async function createQrisPayment(
  cfg: SumopodConfig,
  orderRef: string,
  amount: number,
  returnUrl?: string,
): Promise<SumopodPayment | null> {
  const res = await fetch(`${cfg.baseUrl}/api/v1/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": cfg.apiKey },
    body: JSON.stringify({
      order_id: orderRef,
      amount,
      currency: "IDR",
      expires_in_hours: 1,
      payment_method_type_code: cfg.method,
      ...(returnUrl ? { success_return_url: returnUrl, cancel_return_url: returnUrl } : {}),
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("[sumopod] create gagal", res.status, text.slice(0, 300));
    return null;
  }
  try {
    return mapPayment(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Sumber kebenaran status pembayaran (endpoint status publik SumoPod). */
export async function getPaymentStatus(
  cfg: SumopodConfig,
  providerPaymentId: string,
): Promise<{ status: string; amount: number } | null> {
  const res = await fetch(
    `${cfg.baseUrl}/api/v1/public/payments/${encodeURIComponent(providerPaymentId)}/status`,
    { headers: { "X-Api-Key": cfg.apiKey } },
  );
  if (!res.ok) {
    console.error("[sumopod] status gagal", res.status);
    return null;
  }
  const json: any = await res.json().catch(() => null);
  if (!json?.status) return null;
  return { status: String(json.status), amount: Number(json.amount ?? 0) };
}

/**
 * Mengambil string QRIS mentah dari halaman checkout provider supaya kami bisa
 * menampilkan gambar barcode sendiri (tanpa iframe halaman checkout).
 */
export async function fetchQrPayload(
  paymentLinkUrl: string,
): Promise<{ qrString: string; expiresAt: string | null } | null> {
  try {
    const link = new URL(paymentLinkUrl);
    let sessionId = link.pathname.split("/").filter(Boolean).pop() ?? "";

    if (link.pathname.includes("/payment-links/")) {
      const hop = await fetch(paymentLinkUrl, { redirect: "manual" });
      const location = hop.headers.get("location");
      const target = location ? new URL(location, link.origin) : null;
      if (target) sessionId = target.pathname.split("/").filter(Boolean).pop() ?? sessionId;
    }
    if (!sessionId) return null;

    const res = await fetch(`${link.origin}/api/checkout/${encodeURIComponent(sessionId)}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      console.error("[sumopod] ambil QR gagal", res.status);
      return null;
    }
    const json: any = await res.json().catch(() => null);
    const code = json?.paymentCode ? String(json.paymentCode) : "";
    if (!code.startsWith("00020101")) return null;
    return { qrString: code, expiresAt: json?.expirationTime ? String(json.expirationTime) : null };
  } catch (err) {
    console.error("[sumopod] ambil QR error:", (err as Error).message);
    return null;
  }
}

const TOKEN_HEADERS = ["x-webhook-token", "x-sumopod-token", "x-webhook-secret", "x-api-key"];

/** Toleransi clock skew untuk timestamp Svix (detik). */
const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

function headerToken(headers: Headers): string | null {
  for (const name of TOKEN_HEADERS) {
    const value = headers.get(name)?.trim();
    if (value) return value;
  }
  const auth = headers.get("authorization")?.trim();
  if (auth) return auth.replace(/^Bearer\s+/i, "");
  return null;
}

/** Perbandingan constant-time agar token tidak bocor lewat timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Tolak timestamp di luar jendela toleransi supaya signature lama tidak bisa diputar ulang. */
function timestampFresh(value: string | null): boolean {
  if (!value) return false;
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return false;
  return Math.abs(Date.now() / 1000 - seconds) <= WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS;
}

async function hmacBase64(secretRaw: string, payload: string): Promise<string | null> {
  try {
    const cleaned = secretRaw.replace(/^whsec_/, "");
    const keyBytes = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    return btoa(String.fromCharCode(...new Uint8Array(mac)));
  } catch (err) {
    console.error("[sumopod] hmac gagal:", (err as Error).message);
    return null;
  }
}

/** Verifikasi webhook: token sederhana atau tanda tangan Svix. */
export async function verifyWebhook(raw: string, headers: Headers): Promise<boolean> {
  const token = process.env['SUMOPOD_WEBHOOK_TOKEN']?.trim();
  const received = headerToken(headers);
  if (token && received && safeEqual(received, token)) return true;

  const secret = process.env['SUMOPOD_WEBHOOK_SECRET']?.trim();
  const id = headers.get("svix-id") ?? headers.get("webhook-id");
  const timestamp = headers.get("svix-timestamp") ?? headers.get("webhook-timestamp");
  const signature = headers.get("svix-signature") ?? headers.get("webhook-signature");

  if (secret && id && timestamp && signature) {
    if (!timestampFresh(timestamp)) {
      console.error("[sumopod] webhook ditolak: timestamp di luar toleransi");
      return false;
    }
    const expected = await hmacBase64(secret, `${id}.${timestamp}.${raw}`);
    if (
      expected &&
      signature.split(" ").some((part) => {
        const candidate = part.includes(",") ? part.split(",")[1] : part;
        return safeEqual(candidate, expected);
      })
    ) {
      return true;
    }
  }

  console.error("[sumopod] verifikasi webhook gagal", {
    hasToken: Boolean(token),
    tokenHeaderPresent: Boolean(received),
    hasSecret: Boolean(secret),
    svixHeaders: Boolean(id && timestamp && signature),
    headerNames: [...headers.keys()].filter((n) => !n.startsWith("cf-")).join(","),
  });
  return false;
}

/** Melunasi pembayaran setelah status provider terkonfirmasi. */
export async function settleSumopodPayment(paymentId: string, providerRef: string, paidAmount: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("settle_gateway_payment" as any, {
    _payment_id: paymentId,
    _provider: "sumopod",
    _provider_ref: providerRef,
    _paid_amount: paidAmount,
    _method: "qris",
  } as any);
  if (error) {
    console.error("[sumopod] settle gagal:", error.message);
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const, result: data };
}
