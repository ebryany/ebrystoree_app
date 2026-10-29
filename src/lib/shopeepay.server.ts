/**
 * Adapter ShopeePay Payment API resmi (SNAP, Merchant Presented Mode / Dynamic QR).
 * Server-only. Referensi: product.shopeepay.co.id → Get Started, Access Token,
 * Merchant Presented Mode, Notify Transaction Status, Common Objects.
 *
 * Adapter hanya aktif bila SHOPEEPAY_ENABLED=true DAN seluruh kredensial resmi
 * (hasil onboarding ShopeePay) tersedia. Tidak ada jalur berbasis token sesi
 * portal merchant atau pencocokan nominal.
 */
import { createHash, createHmac, createSign, createVerify, randomInt } from "node:crypto";

export type ShopeepayConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  /** Private key merchant (PEM PKIX) untuk menandatangani permintaan access token. */
  privateKey: string;
  /** Public key ShopeePay (PEM PKIX) untuk memverifikasi callback. */
  shopeepayPublicKey: string;
  merchantId: string;
  storeId: string;
  /** URL callback lengkap persis seperti yang didaftarkan ke ShopeePay (dipakai di signature). */
  callbackUrl: string;
  channelId: string;
  validitySeconds: number;
};

function pem(value: string | undefined): string {
  return (value ?? "").replace(/\\n/g, "\n").trim();
}

export function shopeepayConfig(env: Record<string, string | undefined> = process.env): ShopeepayConfig | null {
  if (env["SHOPEEPAY_ENABLED"]?.trim().toLowerCase() !== "true") return null;
  const mode = (env["SHOPEEPAY_ENV"]?.trim() || "sandbox").toLowerCase();
  const cfg: ShopeepayConfig = {
    baseUrl:
      env["SHOPEEPAY_BASE_URL"]?.trim() ||
      (mode === "live" || mode === "production"
        ? "https://api.snap.airpay.co.id"
        : "https://api.snap.uat.airpay.co.id"),
    clientId: env["SHOPEEPAY_CLIENT_ID"]?.trim() ?? "",
    clientSecret: env["SHOPEEPAY_CLIENT_SECRET"]?.trim() ?? "",
    privateKey: pem(env["SHOPEEPAY_PRIVATE_KEY"]),
    shopeepayPublicKey: pem(env["SHOPEEPAY_PUBLIC_KEY"]),
    merchantId: env["SHOPEEPAY_MERCHANT_ID"]?.trim() ?? "",
    storeId: env["SHOPEEPAY_STORE_ID"]?.trim() ?? "",
    callbackUrl: env["SHOPEEPAY_CALLBACK_URL"]?.trim() ?? "",
    channelId: env["SHOPEEPAY_CHANNEL_ID"]?.trim() || "PC",
    validitySeconds: Math.min(
      Math.max(Number(env["SHOPEEPAY_QR_VALIDITY_SECONDS"] ?? 1200) || 1200, 300),
      3600,
    ),
  };
  const required: (keyof ShopeepayConfig)[] = [
    "clientId",
    "clientSecret",
    "privateKey",
    "shopeepayPublicKey",
    "merchantId",
    "storeId",
    "callbackUrl",
  ];
  if (required.some((k) => !cfg[k])) {
    console.error("[shopeepay] SHOPEEPAY_ENABLED=true tetapi kredensial belum lengkap");
    return null;
  }
  return cfg;
}

/* ------------------------------ Format & signature ------------------------------ */

/** ISO-8601 dengan offset WIB, mis. 2026-10-29T13:05:00+07:00. */
export function snapTimestamp(date = new Date()): string {
  const wib = new Date(date.getTime() + 7 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${wib.getUTCFullYear()}-${p(wib.getUTCMonth() + 1)}-${p(wib.getUTCDate())}` +
    `T${p(wib.getUTCHours())}:${p(wib.getUTCMinutes())}:${p(wib.getUTCSeconds())}+07:00`
  );
}

/** Rupiah utuh → "10000.00". Rupiah tidak mendukung sen di ShopeePay. */
export function formatSnapAmount(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("INVALID_AMOUNT");
  return `${amount}.00`;
}

/** "10000.00" → 10000. Nilai bersen atau tidak valid → null (ditolak). */
export function parseSnapAmount(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{1,15})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) return null;
  if (m[2] && Number(m[2]) !== 0) return null;
  return Number(m[1]);
}

export function sha256Hex(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex").toLowerCase();
}

/** X-SIGNATURE untuk Access Token: SHA256withRSA(privateKey, clientId|timestamp). */
export function accessTokenSignature(clientId: string, timestamp: string, privateKey: string): string {
  const signer = createSign("RSA-SHA256");
  signer.update(`${clientId}|${timestamp}`);
  return signer.sign(privateKey, "base64");
}

/** X-SIGNATURE transaksional: HMAC-SHA512(clientSecret, METHOD:path:token:sha256(body):timestamp). */
export function transactionSignature(input: {
  method: string;
  path: string;
  accessToken: string;
  body: string;
  timestamp: string;
  clientSecret: string;
}): string {
  const stringToSign = [
    input.method.toUpperCase(),
    input.path,
    input.accessToken,
    sha256Hex(input.body),
    input.timestamp,
  ].join(":");
  return createHmac("sha512", input.clientSecret).update(stringToSign).digest("base64");
}

/** Verifikasi callback: SHA256withRSA(publicKey ShopeePay, POST:callbackUrl:sha256(raw):timestamp). */
export function verifyCallbackSignature(input: {
  rawBody: string;
  callbackUrl: string;
  timestamp: string | null;
  signature: string | null;
  publicKey: string;
}): boolean {
  if (!input.timestamp || !input.signature) return false;
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`POST:${input.callbackUrl}:${sha256Hex(input.rawBody)}:${input.timestamp}`);
    return verifier.verify(input.publicKey, input.signature, "base64");
  } catch {
    return false;
  }
}

/** Tolak callback dengan timestamp terlalu jauh (anti replay). */
export function timestampFresh(value: string | null, now = Date.now(), toleranceSeconds = 600): boolean {
  if (!value) return false;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return false;
  return Math.abs(now - t) <= toleranceSeconds * 1000;
}

/* ------------------------------ Status ------------------------------ */

export type ShopeepayStatus = "paid" | "pending" | "failed" | "refunded" | "cancelled" | "not_found";

/** latestTransactionStatus (Common Objects → Transaction Status). */
export function mapTransactionStatus(code: unknown): ShopeepayStatus {
  switch (String(code ?? "")) {
    case "00":
      return "paid";
    case "01":
    case "03":
      return "pending";
    case "04":
      return "refunded";
    case "05":
      return "cancelled";
    case "06":
      return "failed";
    case "07":
      return "not_found";
    default:
      return "pending";
  }
}

/* ------------------------------ Referensi pembayaran ------------------------------ */

/** partnerReferenceNo unik per QR: nomor pembayaran + sufiks bila QR dibuat ulang. Maks 64 karakter. */
export function buildPartnerReference(paymentNumber: string, attempt: number): string {
  const ref = attempt <= 0 ? paymentNumber : `${paymentNumber}-R${attempt}`;
  if (ref.length > 64) throw new Error("REFERENCE_TOO_LONG");
  return ref;
}

/** PAY-YYYYMMDD-NNNNNN dari partnerReferenceNo, atau null bila format asing. */
export function paymentNumberFromReference(ref: string): string | null {
  const m = /^(PAY-\d{8}-\d{6})(?:-R\d{1,4})?$/.exec(ref);
  return m ? m[1] : null;
}

/** Disimpan di payments.qr_reference (JSON) untuk pembayaran ShopeePay. */
export type ShopeepayStoredQr = {
  provider: "shopeepay";
  partnerReferenceNo: string;
  /** Seluruh referensi yang pernah diterbitkan untuk pembayaran ini (urut lama → baru). */
  references: string[];
  qrString: string;
  amount: number;
  fee: number;
  total: number;
  expiredAt: string;
  payUrl: string;
};

export type VerifiedNotification = {
  partnerReferenceNo: string;
  providerReference: string;
  amount: number;
  currency: string;
  merchantId: string;
  storeId: string;
  status: ShopeepayStatus;
};

/** Validasi bentuk body callback MPM (field tambahan diabaikan sesuai kebijakan backward compatible). */
export function parseNotification(payload: unknown): VerifiedNotification | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, any>;
  const amount = parseSnapAmount(p.amount?.value);
  const ref = typeof p.originalPartnerReferenceNo === "string" ? p.originalPartnerReferenceNo : "";
  if (!ref || ref.length > 64 || amount === null) return null;
  return {
    partnerReferenceNo: ref,
    providerReference: typeof p.originalReferenceNo === "string" ? p.originalReferenceNo.slice(0, 128) : "",
    amount,
    currency: String(p.amount?.currency ?? ""),
    merchantId: String(p.additionalInfo?.merchantId ?? p.merchantId ?? ""),
    storeId: String(p.externalStoreId ?? ""),
    status: mapTransactionStatus(p.latestTransactionStatus),
  };
}

/**
 * Aturan pelunasan. Pembayaran hanya boleh dilunasi bila SEMUA cocok:
 * referensi milik pembayaran ini, merchant & store kita, IDR, nominal persis,
 * dan status 00. Tidak ada pencocokan berdasarkan nominal/waktu saja.
 */
export function assessSettlement(input: {
  event: Pick<VerifiedNotification, "partnerReferenceNo" | "amount" | "currency" | "merchantId" | "storeId" | "status">;
  cfg: Pick<ShopeepayConfig, "merchantId" | "storeId">;
  issuedReferences: string[];
  expectedAmount: number;
}): { ok: true } | { ok: false; reason: string } {
  const { event, cfg } = input;
  if (!input.issuedReferences.includes(event.partnerReferenceNo)) return { ok: false, reason: "reference not issued" };
  if (event.merchantId && event.merchantId !== cfg.merchantId) return { ok: false, reason: "merchant mismatch" };
  if (event.storeId && event.storeId !== cfg.storeId) return { ok: false, reason: "store mismatch" };
  if (event.currency !== "IDR") return { ok: false, reason: "currency mismatch" };
  if (event.amount !== input.expectedAmount) return { ok: false, reason: "amount mismatch" };
  if (event.status !== "paid") return { ok: false, reason: `status ${event.status}` };
  return { ok: true };
}

export function parseStoredQr(value: string | null): ShopeepayStoredQr | null {
  if (!value) return null;
  try {
    const v = JSON.parse(value);
    if (v?.provider === "shopeepay" && typeof v.partnerReferenceNo === "string" && Array.isArray(v.references)) {
      return v as ShopeepayStoredQr;
    }
  } catch {
    return null;
  }
  return null;
}

/* ------------------------------ HTTP client ------------------------------ */

let tokenCache: { key: string; token: string; expiresAt: number } | null = null;

function externalId(): string {
  // Numerik, unik per hari per Client ID (maks 36).
  return `${Date.now()}${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
}

async function getAccessToken(cfg: ShopeepayConfig): Promise<string | null> {
  const key = `${cfg.baseUrl}|${cfg.clientId}`;
  if (tokenCache && tokenCache.key === key && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const timestamp = snapTimestamp();
  try {
    const res = await fetch(`${cfg.baseUrl}/v1.0/access-token/b2b`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TIMESTAMP": timestamp,
        "X-CLIENT-KEY": cfg.clientId,
        "X-SIGNATURE": accessTokenSignature(cfg.clientId, timestamp, cfg.privateKey),
      },
      body: JSON.stringify({ grantType: "client_credentials" }),
      signal: AbortSignal.timeout(15_000),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || json?.responseCode !== "2007300" || !json?.accessToken) {
      console.error("[shopeepay] access token gagal", res.status, json?.responseCode ?? "");
      return null;
    }
    const ttl = Math.max(Number(json.expiresIn ?? 900) || 900, 120);
    tokenCache = { key, token: String(json.accessToken), expiresAt: Date.now() + ttl * 1000 };
    return tokenCache.token;
  } catch (err) {
    console.error("[shopeepay] access token error:", (err as Error).name);
    return null;
  }
}

async function snapPost(cfg: ShopeepayConfig, path: string, body: unknown): Promise<{ status: number; json: any } | null> {
  const token = await getAccessToken(cfg);
  if (!token) return null;
  const raw = JSON.stringify(body);
  const timestamp = snapTimestamp();
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TIMESTAMP": timestamp,
        Authorization: `Bearer ${token}`,
        "X-SIGNATURE": transactionSignature({
          method: "POST",
          path,
          accessToken: token,
          body: raw,
          timestamp,
          clientSecret: cfg.clientSecret,
        }),
        "X-PARTNER-ID": cfg.clientId,
        "X-EXTERNAL-ID": externalId(),
        "CHANNEL-ID": cfg.channelId,
      },
      body: raw,
      signal: AbortSignal.timeout(20_000),
    });
    const json: any = await res.json().catch(() => null);
    if (res.status === 401) tokenCache = null;
    return { status: res.status, json };
  } catch (err) {
    console.error("[shopeepay] request error", path, (err as Error).name);
    return null;
  }
}

/** Create Dynamic QR for MPM (service 47). */
export async function createDynamicQr(
  cfg: ShopeepayConfig,
  input: { partnerReferenceNo: string; amount: number; validUntil: Date },
): Promise<{ qrContent: string; qrUrl: string | null } | null> {
  const res = await snapPost(cfg, "/v1.0/qr/qr-mpm-generate", {
    partnerReferenceNo: input.partnerReferenceNo,
    amount: { value: formatSnapAmount(input.amount), currency: "IDR" },
    merchantId: cfg.merchantId,
    validityPeriod: snapTimestamp(input.validUntil),
    additionalInfo: {
      externalStoreId: cfg.storeId,
      metadata: JSON.stringify({ field1: input.partnerReferenceNo }),
    },
  });
  const code = res?.json?.responseCode;
  const qr = res?.json?.qrContent;
  if (code !== "2004700" || typeof qr !== "string" || !qr.startsWith("000201")) {
    console.error("[shopeepay] generate QR gagal", res?.status ?? "network", code ?? "");
    return null;
  }
  return { qrContent: qr, qrUrl: typeof res?.json?.qrUrl === "string" ? res.json.qrUrl : null };
}

/** Check MPM Transaction Status (service 51) — sumber kebenaran status. */
export async function queryTransaction(
  cfg: ShopeepayConfig,
  input: { partnerReferenceNo: string; amount: number },
): Promise<
  | { ok: true; status: ShopeepayStatus; amount: number | null; currency: string; providerReference: string; merchantId: string; storeId: string }
  | { ok: false; retryable: boolean }
> {
  const res = await snapPost(cfg, "/v1.0/qr/qr-mpm-query", {
    originalPartnerReferenceNo: input.partnerReferenceNo,
    merchantId: cfg.merchantId,
    externalStoreId: cfg.storeId,
    serviceCode: "47",
    additionalInfo: { value: formatSnapAmount(input.amount) },
  });
  if (!res) return { ok: false, retryable: true };
  const code = String(res.json?.responseCode ?? "");
  if (code === "4045101") {
    return { ok: true, status: "not_found", amount: null, currency: "", providerReference: "", merchantId: "", storeId: "" };
  }
  if (code !== "2005100") return { ok: false, retryable: !code.startsWith("400") };
  const j = res.json;
  return {
    ok: true,
    status: mapTransactionStatus(j.latestTransactionStatus),
    amount: parseSnapAmount(j.amount?.value),
    currency: String(j.amount?.currency ?? "IDR"),
    providerReference: String(j.originalReferenceNo ?? ""),
    merchantId: String(j.additionalInfo?.merchantId ?? ""),
    storeId: String(j.additionalInfo?.externalStoreId ?? ""),
  };
}

/** Invalidate QR for MPM (service 77). Gagal tidak fatal: query tetap menjadi penentu. */
export async function invalidateQr(cfg: ShopeepayConfig, partnerReferenceNo: string, reason: string): Promise<boolean> {
  const res = await snapPost(cfg, "/v1.0/qr/qr-mpm-cancel", {
    originalPartnerReferenceNo: partnerReferenceNo,
    merchantId: cfg.merchantId,
    externalStoreId: cfg.storeId,
    reason: reason.slice(0, 256),
  });
  return res?.json?.responseCode === "2007700";
}

/* ------------------------------ Persistensi ------------------------------ */

export type PaymentEventStatus = "received" | "processed" | "duplicate" | "rejected" | "failed";

/**
 * Catat event secara idempoten (UNIQUE provider + external_event_id).
 * Mengembalikan "inserted", "duplicate", atau "error". Kegagalan pencatatan
 * tidak membatalkan pelunasan: RPC settle_gateway_payment sudah idempoten
 * (FOR UPDATE + already_settled), jadi efek finansial tetap tunggal.
 */
export async function recordShopeepayEvent(input: {
  eventId: string;
  paymentId: string | null;
  eventType: string;
  signatureValid: boolean;
  payloadHash: string | null;
  status: PaymentEventStatus;
  error?: string;
  /** Kolom tambahan (migrasi 20261029100000). Diabaikan bila migrasi belum diterapkan. */
  details?: {
    amount?: number | null;
    currency?: string | null;
    providerTransactionId?: string | null;
    paymentStatus?: string | null;
    eventAt?: string | null;
    metadata?: Record<string, unknown>;
  };
}): Promise<"inserted" | "duplicate" | "error"> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const base = {
    provider: "shopeepay",
    external_event_id: input.eventId.slice(0, 200),
    payment_id: input.paymentId,
    event_type: input.eventType.slice(0, 60),
    signature_valid: input.signatureValid,
    payload_hash: input.payloadHash,
    processing_status: input.status,
    processed_at: new Date().toISOString(),
    error: input.error?.slice(0, 500) ?? null,
  };
  const d = input.details;
  const extended = d
    ? {
        ...base,
        amount: d.amount ?? null,
        currency: d.currency ?? null,
        provider_transaction_id: d.providerTransactionId?.slice(0, 128) ?? null,
        payment_status: d.paymentStatus ?? null,
        event_at: d.eventAt ?? null,
        metadata: d.metadata ?? {},
      }
    : base;

  const write = (row: Record<string, unknown>) =>
    supabaseAdmin
      .from("payment_events")
      .upsert(row as any, { onConflict: "provider,external_event_id", ignoreDuplicates: true })
      .select("id");

  let { data, error } = await write(extended);
  // Kolom tambahan belum ada (migrasi belum diterapkan): tetap catat kolom inti.
  if (error && d && (error.code === "42703" || error.code === "PGRST204")) {
    ({ data, error } = await write(base));
  }
  if (error) {
    console.error("[shopeepay] catat payment_events gagal:", error.code ?? "", error.message);
    return "error";
  }
  return data && data.length ? "inserted" : "duplicate";
}

export async function settleShopeepayPayment(paymentId: string, providerRef: string, paidAmount: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("settle_gateway_payment" as any, {
    _payment_id: paymentId,
    _provider: "shopeepay",
    _provider_ref: providerRef,
    _paid_amount: paidAmount,
    _method: "qris",
  } as any);
  if (error) {
    console.error("[shopeepay] settle gagal:", error.message);
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const, result: data };
}

/** Event id untuk referensi QR yang diterbitkan; menjadi daftar referensi permanen. */
export function issuedEventId(ref: string): string {
  return `${ref}:qr.issued`;
}

/**
 * Seluruh referensi ShopeePay yang pernah diterbitkan untuk pembayaran ini,
 * dari qr_reference DAN payment_events. payment_events tetap menyimpan
 * referensi walau qr_reference tertimpa (mis. pembeli pindah ke SumoPod).
 */
export async function issuedReferences(payment: { id: string; payment_number: string; qr_reference: string | null }): Promise<string[]> {
  const set = new Set<string>(parseStoredQr(payment.qr_reference)?.references ?? []);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("payment_events")
    .select("external_event_id, created_at")
    .eq("provider", "shopeepay")
    .eq("payment_id", payment.id)
    .eq("event_type", "qr.issued")
    .order("created_at", { ascending: true })
    .limit(50);
  for (const row of data ?? []) {
    const ref = String((row as any).external_event_id).replace(/:qr\.issued$/, "");
    if (paymentNumberFromReference(ref) === payment.payment_number) set.add(ref);
  }
  // Hanya referensi milik nomor pembayaran ini yang sah.
  return [...set].filter((r) => paymentNumberFromReference(r) === payment.payment_number);
}

/** Efek samping pasca-lunas (notifikasi). Gagal tidak memengaruhi status pembayaran. */
async function afterSettled(paymentId: string) {
  try {
    const { dispatchServiceOrderAlerts } = await import("@/lib/telegram.server");
    await dispatchServiceOrderAlerts();
  } catch (err) {
    console.error("[telegram] dispatch gagal:", (err as Error).message);
  }
  try {
    const { dispatchEmails } = await import("@/lib/email-dispatch.server");
    await dispatchEmails(10);
  } catch (err) {
    console.error("[email] dispatch gagal:", (err as Error).message);
  }
  try {
    const { recordServerEvent } = await import("@/lib/analytics.server");
    await recordServerEvent({ event: "payment_success", path: `/pembayaran/${paymentId}` });
  } catch (err) {
    console.error("[analytics] catat konversi gagal:", (err as Error).message);
  }
}

export type SettleOutcome = { status: "paid" | "pending" | "failed" | "error"; reason?: string };

/**
 * Verifikasi server-to-server lalu lunasi. Dipakai oleh callback, tombol cek
 * pembeli, dan job rekonsiliasi — satu jalur, satu aturan.
 */
export async function verifyAndSettle(
  cfg: ShopeepayConfig,
  payment: { id: string; payment_number: string; status: string; expected_amount: number | string; qr_reference: string | null },
): Promise<SettleOutcome> {
  if (payment.status === "paid") return { status: "paid" };
  const references = await issuedReferences(payment);
  if (!references.length) return { status: "pending", reason: "no shopeepay reference" };
  const expected = Number(payment.expected_amount);

  // Referensi terbaru dulu; referensi lama tetap dicek karena pembeli bisa
  // memindai QR lama sebelum QR itu sempat di-invalidate.
  for (const ref of [...references].reverse()) {
    const q = await queryTransaction(cfg, { partnerReferenceNo: ref, amount: expected });
    if (!q.ok) return { status: "error", reason: "query failed" };
    if (q.status !== "paid") continue;

    const verdict = assessSettlement({
      event: {
        partnerReferenceNo: ref,
        amount: q.amount ?? -1,
        currency: q.currency,
        merchantId: q.merchantId,
        storeId: q.storeId,
        status: q.status,
      },
      cfg,
      issuedReferences: references,
      expectedAmount: expected,
    });
    const details = {
      amount: q.amount,
      currency: q.currency,
      providerTransactionId: q.providerReference || null,
      paymentStatus: q.status,
      metadata: { partnerReferenceNo: ref, source: "qr-mpm-query" },
    };
    if (!verdict.ok) {
      // Dana masuk tapi tidak sah dilunasi otomatis (mis. nominal beda): tandai
      // untuk ditinjau admin, jangan pernah dilunasi diam-diam.
      await recordShopeepayEvent({
        eventId: `${ref}:query:rejected:${verdict.reason}`,
        paymentId: payment.id,
        eventType: "payment.query",
        signatureValid: true,
        payloadHash: null,
        status: "rejected",
        error: verdict.reason,
        details,
      });
      return { status: "failed", reason: verdict.reason };
    }

    const settled = await settleShopeepayPayment(payment.id, q.providerReference || ref, expected);
    const already = settled.ok && (settled.result as any)?.already_settled === true;
    await recordShopeepayEvent({
      // Kegagalan diberi id unik per percobaan agar tidak menutupi keberhasilan berikutnya.
      eventId: settled.ok ? `${ref}:settle` : `${ref}:settle:failed:${Date.now()}`,
      paymentId: payment.id,
      eventType: "payment.settled",
      signatureValid: true,
      payloadHash: null,
      status: !settled.ok ? "failed" : already ? "duplicate" : "processed",
      error: settled.ok ? undefined : settled.error,
      details,
    });
    if (settled.ok && !already) await afterSettled(payment.id);
    return settled.ok ? { status: "paid" } : { status: "error", reason: "settle failed" };
  }
  return { status: "pending" };
}

/** Status pembayaran ShopeePay yang ditampilkan ke pembeli. */
export type BuyerPaymentState = "pending" | "paid" | "expired" | "failed" | "unavailable";

export function buyerStateFor(
  result: { status: "paid" | "pending" | "failed" | "error" },
  expiredAt: string | null,
  now = Date.now(),
): BuyerPaymentState {
  if (result.status === "paid") return "paid";
  if (result.status === "failed") return "failed";
  if (result.status === "error") return "unavailable";
  if (expiredAt && new Date(expiredAt).getTime() <= now) return "expired";
  return "pending";
}
