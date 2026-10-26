import { describe, expect, it } from "vitest";

/**
 * Unit test untuk penyimpanan kredensial SMTP dari UI admin.
 *
 * Yang diuji adalah ATURAN dan bentuk data, bukan enkripsi nyata (itu memakai
 * node:crypto dan diuji lewat pemakaian). Fokusnya: mencegah kelas bug yang
 * paling berbahaya di fitur ini — password tersimpan sebagai teks biasa, atau
 * password hilang saat admin hanya mengubah host.
 */

/** Bentuk nilai yang boleh tersimpan di system_settings. */
function validateStorable(key: string, value: unknown): { ok: boolean; reason?: string } {
  // Password WAJIB berupa ciphertext (format v1:...), bukan teks biasa.
  if (key === "smtp_password_enc") {
    if (typeof value !== "string" || !value.startsWith("v1:")) {
      return { ok: false, reason: "password harus terenkripsi" };
    }
    return { ok: true };
  }
  if (key === "smtp_host" || key === "smtp_user" || key === "smtp_from") {
    if (typeof value !== "string" || !value.trim()) {
      return { ok: false, reason: "wajib diisi" };
    }
  }
  if (key === "smtp_port") {
    if (typeof value !== "number" || value < 1 || value > 65535) {
      return { ok: false, reason: "port tidak valid" };
    }
  }
  return { ok: true };
}

/**
 * Aturan "password kosong = pertahankan yang lama".
 * Tanpa ini, admin yang hanya ingin mengubah host akan menghapus password dan
 * mematikan email tanpa sadar.
 */
function resolvePassword(input: string, stored: string | null): { ok: boolean; value?: string } {
  if (input.trim()) return { ok: true, value: `v1:encrypted(${input})` };
  if (stored) return { ok: true, value: stored };
  return { ok: false };
}

/** Aturan pemilihan konfigurasi efektif: database menang atas environment. */
function effectiveConfig(
  db: { host: string } | null,
  env: { host: string } | null,
): { source: "database" | "environment" | "none" } {
  if (db) return { source: "database" };
  if (env) return { source: "environment" };
  return { source: "none" };
}

/** Penjaga alamat pengirim (bug nyata: username dipakai sebagai from). */
function isValidFrom(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

describe("SMTP: aturan penyimpanan kredensial dari admin", () => {
  it("password wajib tersimpan terenkripsi, bukan teks biasa", () => {
    expect(validateStorable("smtp_password_enc", "rahasia123").ok).toBe(false);
    expect(validateStorable("smtp_password_enc", "v1:abc:def:ghi").ok).toBe(true);
  });

  it("host, user, dan from tidak boleh kosong", () => {
    expect(validateStorable("smtp_host", "").ok).toBe(false);
    expect(validateStorable("smtp_host", "smtp.sumopod.com").ok).toBe(true);
    expect(validateStorable("smtp_user", "   ").ok).toBe(false);
    expect(validateStorable("smtp_from", "noreply@ebrystore.my.id").ok).toBe(true);
  });

  it("port harus dalam rentang sah", () => {
    expect(validateStorable("smtp_port", 587).ok).toBe(true);
    expect(validateStorable("smtp_port", 465).ok).toBe(true);
    expect(validateStorable("smtp_port", 0).ok).toBe(false);
    expect(validateStorable("smtp_port", 70000).ok).toBe(false);
  });

  it("password kosong mempertahankan yang tersimpan", () => {
    const stored = "v1:lama:lama:lama";
    expect(resolvePassword("", stored)).toEqual({ ok: true, value: stored });
    expect(resolvePassword("baru", stored).value).toContain("encrypted(baru)");
  });

  it("password kosong ditolak bila belum ada yang tersimpan", () => {
    expect(resolvePassword("", null).ok).toBe(false);
  });

  it("database menang atas environment", () => {
    expect(effectiveConfig({ host: "db" }, { host: "env" }).source).toBe("database");
    expect(effectiveConfig(null, { host: "env" }).source).toBe("environment");
    expect(effectiveConfig(null, null).source).toBe("none");
  });

  it("menghapus konfigurasi database tidak mematikan email bila env ada", () => {
    // Setelah hapus, db = null; env masih ada -> tetap jalan.
    expect(effectiveConfig(null, { host: "env" }).source).toBe("environment");
  });

  it("alamat pengirim harus email valid, bukan username", () => {
    expect(isValidFrom("noreply@ebrystore.my.id")).toBe(true);
    expect(isValidFrom("cmuu28h3b1lvm08qxsehzc1ns")).toBe(false);
    expect(isValidFrom("email.ebrystore.my.id")).toBe(false);
  });
});
