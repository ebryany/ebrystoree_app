/**
 * Server-only: enkripsi nilai rahasia yang disimpan di database.
 *
 * Dipakai untuk kredensial SMTP yang diatur admin dari UI (bukan env), supaya
 * password provider tidak tersimpan sebagai teks biasa di `system_settings`.
 *
 * Algoritma: AES-256-GCM.
 * - GCM memberi autentikasi terenkripsi: nilai yang diubah di database akan
 *   gagal didekripsi, bukan diam-diam dipakai.
 * - IV acak per enkripsi (12 byte, standar GCM), disimpan bersama ciphertext.
 * - Format keluaran: `v1:<iv-base64>:<tag-base64>:<ciphertext-base64>` supaya
 *   versi skema bisa dinaikkan tanpa mematahkan nilai lama.
 *
 * Sumber kunci:
 * 1. `SETTINGS_ENCRYPTION_KEY` (base64 32 byte) bila diset — ini yang utama.
 * 2. Bila tidak ada, kunci diturunkan dari `SUPABASE_SERVICE_ROLE_KEY` dengan
 *    HKDF. Alasannya: kunci itu sudah rahasia, server-only, dan tidak pernah
 *    dikirim ke klien; menurunkannya membuat fitur ini bekerja tanpa menuntut
 *    setup tambahan. Konsekuensinya: mengganti service role key membuat nilai
 *    lama tidak bisa didekripsi (admin cukup menyimpan ulang kredensialnya).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

function derivedKey(): Buffer | null {
  const explicit = process.env["SETTINGS_ENCRYPTION_KEY"]?.trim();
  if (explicit) {
    try {
      const key = Buffer.from(explicit, "base64");
      if (key.length === 32) return key;
      console.error("[crypto] SETTINGS_ENCRYPTION_KEY harus 32 byte base64; memakai turunan.");
    } catch {
      console.error("[crypto] SETTINGS_ENCRYPTION_KEY tidak dapat dibaca; memakai turunan.");
    }
  }

  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim();
  if (!serviceKey) return null;

  // HKDF sederhana: SHA-256 dari konteks tetap + kunci. Deterministik supaya
  // nilai yang sudah disimpan tetap bisa didekripsi antar restart.
  return createHash("sha256").update(`ebrystore:settings:v1:${serviceKey}`).digest();
}

export function encryptionReady(): boolean {
  return derivedKey() !== null;
}

/** Enkripsi teks; mengembalikan null bila kunci tidak tersedia. */
export function encryptSecret(plain: string): string | null {
  const key = derivedKey();
  if (!key) return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/** Dekripsi teks; mengembalikan null bila gagal atau format tidak dikenal. */
export function decryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const key = derivedKey();
  if (!key) return null;

  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;

  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const data = Buffer.from(parts[3], "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    // Nilai rusak atau kunci berubah. Bukan kesalahan fatal: pemanggil akan
    // jatuh ke konfigurasi env, dan admin bisa menyimpan ulang kredensialnya.
    console.error("[crypto] dekripsi gagal: nilai rusak atau kunci berubah.");
    return null;
  }
}

/** Apakah sebuah nilai tampak sebagai ciphertext dari modul ini. */
export function isEncrypted(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith(`${VERSION}:`));
}
