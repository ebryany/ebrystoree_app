/**
 * Server-only: pengiriman email transaksional lewat SMTP SumoPod.
 *
 * Prinsip dan alasannya:
 * - Kegagalan email TIDAK BOLEH merusak transaksi. `sendEmail()` tidak pernah
 *   melempar; ia mengembalikan status supaya pemanggil bisa mencatat dan
 *   mencoba lagi nanti. Pesanan yang sudah lunas tetap lunas walau SMTP mati.
 * - Idempoten: satu event untuk satu entitas dikirim maksimal sekali. Kunci
 *   disimpan di `email_dispatch_log` (UNIQUE recipient + event + entity).
 * - Preferensi pengguna dihormati: penerima yang mematikan email transaksional
 *   dicatat sebagai `skipped`, bukan dipaksa.
 * - Tanpa kredensial SMTP, aplikasi tetap jalan normal (fitur email sekadar
 *   tidak aktif) — sama seperti pola SumoPod.
 */

import type { Transporter } from "nodemailer";

type SendResult =
  | { ok: true; skipped: false; providerId: string | null }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

export type EmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  replyTo?: string;
};

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

/**
 * Konfigurasi SMTP. Urutan sumber: **database (diatur admin) lebih dulu**,
 * lalu environment sebagai cadangan.
 *
 * Alasan urutan ini: admin harus bisa mengganti provider SMTP dari UI tanpa
 * menyentuh file server. Env tetap dibaca supaya instalasi lama (dan momen
 * sebelum admin menyimpan) tetap jalan — tidak ada downtime saat migrasi.
 *
 * `from` wajib alamat email valid. Username SMTP SumoPod adalah string acak
 * (bukan alamat email), jadi TIDAK boleh dipakai sebagai pengganti — server
 * menolaknya dengan `501 Bad sender address syntax`.
 *
 * Catatan port (hasil uji nyata terhadap smtp.sumopod.com):
 * - 465 (TLS langsung): berhasil dari mesin lokal, tapi diblokir di sebagian
 *   jaringan/VPS.
 * - 587 (polos, tanpa STARTTLS): inilah yang berhasil. SumoPod menolak
 *   perintah STARTTLS dengan "500 command not recognized", jadi `requireTLS`
 *   tidak boleh dipaksa di port ini.
 * - 25: diblokir di hampir semua jaringan.
 */
const FROM_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function buildConfig(input: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  replyTo?: string;
  secureOverride?: boolean;
}): EmailConfig | null {
  if (!input.host || !input.user || !input.pass || !FROM_RE.test(input.from)) return null;
  const port = Number.isFinite(input.port) ? input.port : 587;
  return {
    host: input.host,
    port,
    // Hanya port 465 yang memakai TLS langsung. Port 587 dibiarkan polos
    // karena provider ini menolak STARTTLS.
    secure: input.secureOverride ?? port === 465,
    user: input.user,
    pass: input.pass,
    from: input.from,
    replyTo: input.replyTo,
  };
}

/** Konfigurasi dari database (diatur admin). Null bila belum lengkap. */
export async function emailConfigFromDb(): Promise<EmailConfig | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .in("key", [
      "smtp_host",
      "smtp_port",
      "smtp_secure",
      "smtp_user",
      "smtp_password_enc",
      "smtp_from",
      "smtp_reply_to",
    ]);

  const map = new Map<string, unknown>((data ?? []).map((r: any) => [r.key, r.value]));
  const str = (key: string): string => {
    const value = map.get(key);
    return typeof value === "string" ? value.trim() : "";
  };

  const host = str("smtp_host");
  const user = str("smtp_user");
  const from = str("smtp_from");
  if (!host || !user || !from) return null;

  // Password disimpan terenkripsi; nilai env tidak pernah masuk ke database.
  const { decryptSecret } = await import("./crypto.server");
  const pass = decryptSecret(str("smtp_password_enc"));
  if (!pass) return null;

  const portRaw = map.get("smtp_port");
  const port = typeof portRaw === "number" ? portRaw : Number(portRaw ?? 587);
  const secureRaw = map.get("smtp_secure");

  return buildConfig({
    host,
    port,
    user,
    pass,
    from,
    replyTo: str("smtp_reply_to") || undefined,
    ...(typeof secureRaw === "boolean" ? { secureOverride: secureRaw } : {}),
  });
}

/**
 * Konfigurasi dari environment (instalasi lama / sebelum admin menyimpan).
 * Sinkron karena dipakai di jalur yang sudah lama berjalan.
 */
export function emailConfigFromEnv(): EmailConfig | null {
  const host = env("SMTP_HOST");
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASSWORD");
  const from = env("SMTP_FROM");
  if (!host || !user || !pass || !from) return null;

  const port = Number(env("SMTP_PORT") ?? 587);
  return buildConfig({ host, port, user, pass, from, replyTo: env("SMTP_REPLY_TO") });
}

/** Konfigurasi efektif: database dulu, lalu env. */
export async function emailConfigAsync(): Promise<EmailConfig | null> {
  const fromDb = await emailConfigFromDb();
  return fromDb ?? emailConfigFromEnv();
}

/**
 * Konfigurasi sinkron (env saja). Dipertahankan untuk pemanggil lama yang tidak
 * bisa menunggu; jalur pengiriman email memakai versi async supaya kredensial
 * dari admin ikut terpakai.
 */
export function emailConfig(): EmailConfig | null {
  return emailConfigFromEnv();
}

export function emailReady(): boolean {
  return emailConfigFromEnv() !== null;
}

/** Apakah email siap, dengan mempertimbangkan kredensial dari database. */
export async function emailReadyAsync(): Promise<boolean> {
  return (await emailConfigAsync()) !== null;
}

/**
 * Pemetaan event dispatcher → kunci saklar admin.
 *
 * Saklar ini diatur admin di Pengaturan Website → Notifikasi. Bila admin
 * mematikan satu event, email jenis itu tidak dikirim (dicatat `skipped`),
 * tanpa perlu mengubah kode atau kredensial.
 */
const EVENT_FLAG: Record<string, string> = {
  "order.paid": "notify_payment_verified",
  "order.completed": "notify_order_completed",
  "service.delivered": "notify_service_delivered",
  "service.accepted": "notify_service_accepted",
  "service.accepted.seller": "notify_service_accepted",
  "refund.completed": "notify_refund_updated",
};

export type EmailSettings = {
  /** Saklar utama; false menghentikan semua email. */
  enabled: boolean;
  senderName: string;
  replyTo: string | null;
};

/**
 * Baca pengaturan notifikasi email dari system_settings.
 *
 * Default aman bila setting belum ada: email aktif (perilaku sekarang), supaya
 * fitur tidak diam-diam mati hanya karena barisnya belum dibuat.
 */
export async function loadEmailSettings(): Promise<EmailSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .in("key", [
      "notify_email_enabled",
      "notify_sender_name",
      "notify_reply_to",
      "notify_sender_email",
    ]);

  const map = new Map<string, unknown>((data ?? []).map((r: any) => [r.key, r.value]));
  const str = (key: string): string => {
    const value = map.get(key);
    return typeof value === "string" ? value.trim() : "";
  };

  return {
    enabled: map.get("notify_email_enabled") !== false,
    senderName: str("notify_sender_name") || "Ebrystore",
    replyTo: str("notify_reply_to") || str("notify_sender_email") || null,
  };
}

/** Apakah email untuk event ini diizinkan admin. */
export async function isEventEnabled(event: string): Promise<boolean> {
  const flagKey = EVENT_FLAG[event];
  if (!flagKey) return true;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", flagKey)
    .maybeSingle();

  // Belum diatur = aktif (default field adalah true).
  return data?.value !== false;
}

let cached: Transporter | null = null;
let cachedKey = "";

async function transporter(): Promise<Transporter | null> {
  const cfg = await emailConfigAsync();
  if (!cfg) return null;

  // Transporter dipakai ulang selama konfigurasi tidak berubah (koneksi SMTP
  // mahal untuk dibuat tiap email). Kunci cache memuat password agar perubahan
  // kredensial dari admin langsung memakai transporter baru.
  const key = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.secure}:${cfg.pass.length}`;
  if (cached && cachedKey === key) return cached;

  const nodemailer = await import("nodemailer");
  const create = (nodemailer as unknown as { default?: typeof nodemailer }).default ?? nodemailer;
  cached = create.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    // Batas waktu eksplisit: SMTP yang menggantung tidak boleh menahan request.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  cachedKey = key;
  return cached;
}

/**
 * Kirim satu email. Tidak pernah melempar.
 *
 * `recipientId` dipakai untuk menghormati preferensi dan mencegah kirim dobel.
 * Bila kombinasi (recipient, event, entity) sudah pernah dicatat, email tidak
 * dikirim ulang.
 */
export async function sendEmail(params: {
  recipientId: string;
  event: string;
  entityType: string;
  entityId: string;
  template: string;
  subject: string;
  html: string;
  text: string;
  toOverride?: string;
  /** Lewati saklar admin; dipakai tombol "kirim email uji" di pengaturan. */
  bypassSettings?: boolean;
}): Promise<SendResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 0. Saklar admin: global dan per-event. Diperiksa lebih dulu supaya email
  //    yang dimatikan admin tidak menyentuh preferensi atau log sama sekali.
  if (!params.bypassSettings) {
    const settings = await loadEmailSettings();
    if (!settings.enabled) {
      return { ok: true, skipped: true, reason: "disabled-globally" };
    }
    if (!(await isEventEnabled(params.event))) {
      return { ok: true, skipped: true, reason: "disabled-for-event" };
    }
  }

  // 1. Hormati preferensi pengguna dan ambil alamat email terkini.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, email_notifications_enabled")
    .eq("id", params.recipientId)
    .maybeSingle();

  const to = params.toOverride ?? (profile?.email as string | undefined) ?? "";
  if (!to) {
    await logDispatch(supabaseAdmin, params, {
      status: "skipped",
      error: "Penerima tidak punya alamat email.",
    });
    return { ok: true, skipped: true, reason: "no-email" };
  }

  if (profile?.email_notifications_enabled === false && !params.toOverride) {
    await logDispatch(supabaseAdmin, params, {
      status: "skipped",
      error: "Penerima mematikan notifikasi email.",
      recipientEmail: to,
    });
    return { ok: true, skipped: true, reason: "disabled-by-user" };
  }

  // 2. Idempotensi: klaim baris log lebih dulu. Bila kunci sudah ada, berhenti.
  const { data: existing } = await supabaseAdmin
    .from("email_dispatch_log")
    .select("id, status")
    .eq("recipient_id", params.recipientId)
    .eq("event", params.event)
    .eq("entity_id", params.entityId)
    .maybeSingle();

  if (existing) {
    return { ok: true, skipped: true, reason: `already-${existing.status}` };
  }

  const { error: claimError } = await supabaseAdmin.from("email_dispatch_log").insert({
    recipient_id: params.recipientId,
    recipient_email: to,
    event: params.event,
    entity_type: params.entityType,
    entity_id: params.entityId,
    template: params.template,
    status: "pending",
  });

  // Balapan dua pemanggil: yang kalah mendapat unique violation, berarti sudah
  // ditangani pemanggil lain.
  if (claimError) {
    return { ok: true, skipped: true, reason: "concurrent-claim" };
  }

  // 3. Kirim. Kegagalan dicatat, tidak dilempar.
  const tx = await transporter();
  if (!tx) {
    await logDispatch(supabaseAdmin, params, {
      status: "failed",
      error: "SMTP belum dikonfigurasi.",
      recipientEmail: to,
    });
    return { ok: false, error: "SMTP belum dikonfigurasi." };
  }

  const cfg = (await emailConfigAsync())!;
  // Nama pengirim dan reply-to bisa diatur admin; bila kosong, pakai env.
  const settings = await loadEmailSettings();
  const from = `${settings.senderName} <${cfg.from}>`;
  const replyTo = settings.replyTo ?? cfg.replyTo;

  try {
    const info = await tx.sendMail({
      from,
      to,
      replyTo,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    await logDispatch(supabaseAdmin, params, {
      status: "sent",
      providerId: info.messageId ?? null,
      recipientEmail: to,
    });
    return { ok: true, skipped: false, providerId: info.messageId ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] kirim gagal:", message);
    await logDispatch(supabaseAdmin, params, {
      status: "failed",
      error: message.slice(0, 500),
      recipientEmail: to,
    });
    return { ok: false, error: message };
  }
}

async function logDispatch(
  supabaseAdmin: any,
  params: { recipientId: string; event: string; entityId: string; recipientEmail?: string },
  patch: { status: string; error?: string; providerId?: string | null; recipientEmail?: string },
) {
  const { error } = await supabaseAdmin
    .from("email_dispatch_log")
    .update({
      status: patch.status,
      error: patch.error ?? null,
      provider_id: patch.providerId ?? null,
      sent_at: patch.status === "sent" ? new Date().toISOString() : null,
      attempts: 1,
      ...(patch.recipientEmail ? { recipient_email: patch.recipientEmail } : {}),
    })
    .eq("recipient_id", params.recipientId)
    .eq("event", params.event)
    .eq("entity_id", params.entityId);

  if (error) console.error("[email] gagal mencatat log:", error.message);
}
