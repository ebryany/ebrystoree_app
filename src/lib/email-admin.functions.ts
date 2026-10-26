import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/**
 * Status konfigurasi email untuk ditampilkan di pengaturan admin.
 *
 * Sengaja TIDAK mengembalikan nilai kredensial apa pun; hanya keberadaannya,
 * host, port, dan alamat pengirim. Admin perlu tahu apakah SMTP siap tanpa
 * membuka rahasianya di UI.
 */
export const getEmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await (context as Ctx).supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", (context as Ctx).userId);
    const isStaff = (roles ?? []).some((r: any) =>
      ["admin", "super_admin", "support"].includes(r.role),
    );
    if (!isStaff) return { forbidden: true as const };

    // Konfigurasi efektif (database dulu, lalu env) supaya form admin menampilkan
    // nilai yang benar-benar dipakai. Password TIDAK pernah ikut dikembalikan.
    const { emailConfigAsync, emailConfigFromDb } = await import("./email.server");
    const cfg = await emailConfigAsync();
    const fromDb = await emailConfigFromDb();

    // Ringkasan pengiriman terakhir supaya admin bisa memantau kesehatan.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: recent } = await supabaseAdmin
      .from("email_dispatch_log")
      .select("status, created_at, error, template")
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: counts } = await supabaseAdmin.from("email_dispatch_log").select("status");

    const summary = { sent: 0, failed: 0, skipped: 0, pending: 0 };
    for (const row of (counts ?? []) as Array<{ status: string }>) {
      if (row.status in summary) summary[row.status as keyof typeof summary] += 1;
    }

    return {
      forbidden: false as const,
      ready: cfg !== null,
      /** Dari mana konfigurasi efektif berasal; ditampilkan ke admin. */
      source: fromDb ? ("database" as const) : ("environment" as const),
      host: cfg?.host ?? null,
      port: cfg?.port ?? null,
      secure: cfg?.secure ?? false,
      user: cfg?.user ?? "",
      // Alamat pengirim penuh aman ditampilkan: ia memang terlihat oleh penerima.
      from: cfg?.from ?? "",
      replyTo: cfg?.replyTo ?? "",
      recent: (recent ?? []) as Array<{
        status: string;
        created_at: string;
        error: string | null;
        template: string;
      }>,
      summary,
    };
  });

/**
 * Kirim email uji dari pengaturan admin.
 *
 * Memakai kerangka dan template asli supaya yang diuji benar-benar yang akan
 * dipakai pembeli. `bypassSettings` dipakai agar tombol uji tetap bekerja walau
 * saklar global sedang dimatikan — admin perlu bisa menguji sebelum mengaktifkan.
 */
export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        /** Kosong berarti pakai email admin yang sedang masuk. */
        recipient: z.string().trim().email().max(200).optional().or(z.literal("")),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;

    const { data: roles } = await ctx.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", ctx.userId);
    const isStaff = (roles ?? []).some((r: any) =>
      ["admin", "super_admin", "support"].includes(r.role),
    );
    if (!isStaff)
      return { ok: false as const, error: "Hanya staff yang dapat mengirim email uji." };

    const { emailReady, emailConfig } = await import("./email.server");
    if (!emailReady()) {
      return {
        ok: false as const,
        error: "SMTP belum dikonfigurasi di server (SMTP_HOST/SMTP_USER/SMTP_PASSWORD/SMTP_FROM).",
      };
    }

    // Tujuan: isian admin, atau email akun admin yang sedang masuk.
    let recipient = data.recipient?.trim() ?? "";
    if (!recipient) {
      const { data: profile } = await ctx.supabase
        .from("profiles")
        .select("email")
        .eq("id", ctx.userId)
        .maybeSingle();
      recipient = (profile?.email as string) ?? "";
    }
    if (!recipient) {
      return {
        ok: false as const,
        error: "Tidak ada alamat tujuan. Isi email uji atau lengkapi email akun.",
      };
    }

    // Isi email dibangun dari kerangka asli, dengan data contoh yang jelas
    // ditandai sebagai uji supaya tidak ada yang mengira transaksi nyata.
    const { renderEmail, renderEmailText } = await import("./email-layout");
    const layoutInput = {
      heading: "Ini email uji dari Ebrystore",
      intro:
        "Konfigurasi email berhasil terhubung. Email ini dikirim dari halaman pengaturan untuk memastikan tampilan dan pengiriman bekerja.",
      status: "success" as const,
      statusLabel: "Uji berhasil",
      details: [
        { label: "Jenis", value: "Email uji, bukan transaksi" },
        { label: "Pengirim", value: emailConfig()?.from ?? "-" },
        { label: "Waktu", value: new Date().toLocaleString("id-ID") },
      ],
      action: {
        label: "Buka dashboard",
        url: process.env["SITE_URL"] ?? "https://app.ebrystore.my.id",
      },
      note: "Bila email ini masuk folder spam, periksa pengaturan SPF dan DKIM domain.",
      preview: "Uji pengiriman email Ebrystore.",
      unsubscribeUrl: `${process.env["SITE_URL"] ?? "https://app.ebrystore.my.id"}/dashboard/pengaturan`,
      helpUrl: `${process.env["SITE_URL"] ?? "https://app.ebrystore.my.id"}/bantuan`,
    };

    const { sendEmail } = await import("./email.server");
    const result = await sendEmail({
      recipientId: ctx.userId,
      event: `test.${Date.now()}`,
      entityType: "test",
      entityId: crypto.randomUUID(),
      template: "test-email",
      subject: "Email uji dari Ebrystore",
      html: renderEmail(layoutInput),
      text: renderEmailText(layoutInput),
      toOverride: recipient,
      bypassSettings: true,
    });

    if (!result.ok) {
      return { ok: false as const, error: `Pengiriman gagal: ${result.error}` };
    }
    if (result.skipped) {
      return { ok: false as const, error: `Email tidak dikirim (${result.reason}).` };
    }
    return { ok: true as const, recipient, providerId: result.providerId };
  });

/* --------------------------- Konfigurasi SMTP dari admin --------------------------- */

async function assertStaff(ctx: Ctx): Promise<boolean> {
  const { data: roles } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  return (roles ?? []).some((r: any) => ["admin", "super_admin"].includes(r.role));
}

/**
 * Simpan konfigurasi SMTP dari UI admin.
 *
 * Password DIENKRIPSI sebelum disimpan (AES-256-GCM); database tidak pernah
 * memuatnya sebagai teks biasa. Mengosongkan password berarti mempertahankan
 * yang lama, supaya admin bisa mengubah host/port tanpa mengetik ulang.
 */
export const saveSmtpConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        host: z.string().trim().min(3).max(200),
        port: z.number().int().min(1).max(65535),
        secure: z.boolean(),
        user: z.string().trim().min(1).max(200),
        password: z.string().max(500).optional().or(z.literal("")),
        from: z.string().trim().email().max(200),
        replyTo: z.string().trim().email().max(200).optional().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    if (!(await assertStaff(ctx))) {
      return { ok: false as const, error: "Hanya admin yang dapat mengubah konfigurasi SMTP." };
    }

    const { encryptSecret, encryptionReady } = await import("./crypto.server");
    if (!encryptionReady()) {
      return {
        ok: false as const,
        error:
          "Kunci enkripsi tidak tersedia di server; kredensial tidak dapat disimpan dengan aman.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Password kosong = pertahankan yang tersimpan.
    let passwordEnc: string | null = null;
    if (data.password) {
      passwordEnc = encryptSecret(data.password);
      if (!passwordEnc) {
        return { ok: false as const, error: "Password gagal dienkripsi. Coba lagi." };
      }
    } else {
      const { data: existing } = await supabaseAdmin
        .from("system_settings")
        .select("value")
        .eq("key", "smtp_password_enc")
        .maybeSingle();
      const current = typeof existing?.value === "string" ? existing.value : "";
      if (!current) {
        return {
          ok: false as const,
          error: "Password SMTP wajib diisi untuk penyimpanan pertama.",
        };
      }
      passwordEnc = current;
    }

    const rows = [
      { key: "smtp_host", value: data.host, description: "Host SMTP (diatur admin)" },
      { key: "smtp_port", value: data.port, description: "Port SMTP" },
      { key: "smtp_secure", value: data.secure, description: "TLS langsung (true untuk port 465)" },
      { key: "smtp_user", value: data.user, description: "Username SMTP" },
      { key: "smtp_password_enc", value: passwordEnc, description: "Password SMTP terenkripsi" },
      { key: "smtp_from", value: data.from, description: "Alamat pengirim email" },
      { key: "smtp_reply_to", value: data.replyTo || "", description: "Alamat balasan" },
    ].map((r) => ({ ...r, is_public: false }));

    // Cast: `write_audit_log` menerima entity_id null, tapi tipe generated
    // Supabase menandainya non-null. Nilainya memang boleh null di database.
    const { error } = await supabaseAdmin
      .from("system_settings")
      .upsert(rows as never, { onConflict: "key" });
    if (error) {
      console.error("[email-admin] simpan SMTP gagal:", error.message);
      return { ok: false as const, error: "Konfigurasi SMTP gagal disimpan." };
    }

    await supabaseAdmin.rpc("write_audit_log", {
      _action: "settings.smtp_saved",
      _entity_type: "system_settings",
      _entity_id: undefined,
      _before: undefined,
      _after: { host: data.host, port: data.port, user: data.user, from: data.from },
      _reason: "Admin menyimpan konfigurasi SMTP",
      _ip: undefined,
      _trace_id: undefined,
    });

    return { ok: true as const };
  });

/**
 * Hapus konfigurasi SMTP dari database.
 *
 * Setelah dihapus, sistem kembali memakai kredensial dari environment server —
 * jadi menghapus TIDAK mematikan email bila env masih terisi.
 */
export const clearSmtpConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    if (!(await assertStaff(ctx))) {
      return { ok: false as const, error: "Hanya admin yang dapat menghapus konfigurasi SMTP." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const keys = [
      "smtp_host",
      "smtp_port",
      "smtp_secure",
      "smtp_user",
      "smtp_password_enc",
      "smtp_from",
      "smtp_reply_to",
    ];
    const { error } = await supabaseAdmin.from("system_settings").delete().in("key", keys);
    if (error) return { ok: false as const, error: "Konfigurasi SMTP gagal dihapus." };

    await supabaseAdmin.rpc("write_audit_log", {
      _action: "settings.smtp_cleared",
      _entity_type: "system_settings",
      _entity_id: undefined,
      _before: undefined,
      _after: undefined,
      _reason: "Admin menghapus konfigurasi SMTP dari database",
      _ip: undefined,
      _trace_id: undefined,
    });

    return { ok: true as const };
  });
