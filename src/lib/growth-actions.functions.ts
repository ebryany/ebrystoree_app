import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/**
 * Aksi tulis dashboard Pertumbuhan.
 *
 * Semua memeriksa izin di server; UI hanya menampilkan tombol yang boleh
 * dipakai. Pesan error dikembalikan dalam bahasa manusia, bukan kode database.
 */

async function assertGrowthAccess(ctx: Ctx): Promise<boolean> {
  const { data: roles } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  return (roles ?? []).some((r: any) =>
    ["admin", "super_admin", "support", "finance"].includes(r.role),
  );
}

async function assertArticleWrite(ctx: Ctx): Promise<boolean> {
  const { data: roles } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  return (roles ?? []).some((r: any) => ["admin", "super_admin"].includes(r.role));
}

/** Hapus kampanye. Riwayat kunjungan tetap utuh; yang hilang hanya definisinya. */
export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    if (!(await assertGrowthAccess(ctx))) {
      return { ok: false as const, error: "Anda tidak punya izin menghapus kampanye." };
    }

    // RPC memeriksa auth.uid() di dalam database, jadi harus lewat client
    // milik pengguna (JWT-nya ikut), bukan service role yang tanpa uid.
    const { error } = await ctx.supabase.rpc("delete_campaign", { _id: data.id });

    if (error) {
      if (error.message.includes("NOT_FOUND")) {
        return { ok: false as const, error: "Kampanye sudah tidak ada." };
      }
      console.error("[growth] delete_campaign gagal:", error.message);
      return { ok: false as const, error: "Kampanye gagal dihapus." };
    }
    return { ok: true as const };
  });

/** Ubah status kampanye (draft/active/paused/finished). */
export const setCampaignStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(3).max(120),
        channel: z.string().trim().min(2).max(40),
        utmSource: z.string().trim().min(1).max(120),
        utmCampaign: z.string().trim().min(1).max(120),
        utmMedium: z.string().trim().max(120).optional(),
        status: z.enum(["draft", "active", "paused", "finished"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    if (!(await assertGrowthAccess(ctx))) {
      return { ok: false as const, error: "Anda tidak punya izin mengubah kampanye." };
    }

    const { error } = await ctx.supabase.rpc("upsert_campaign", {
      _id: data.id,
      _name: data.name,
      _channel: data.channel,
      _utm_source: data.utmSource,
      _utm_medium: data.utmMedium ?? undefined,
      _utm_campaign: data.utmCampaign,
      _starts_at: undefined,
      _ends_at: undefined,
      _status: data.status,
      _note: undefined,
    } as never);

    if (error) {
      if (error.message.includes("duplicate key") || error.message.includes("unique")) {
        return {
          ok: false as const,
          error: `Kombinasi utm_source "${data.utmSource}" dan utm_campaign "${data.utmCampaign}" sudah dipakai kampanye lain.`,
        };
      }
      console.error("[growth] set_campaign_status gagal:", error.message);
      return { ok: false as const, error: "Status kampanye gagal diubah." };
    }
    return { ok: true as const };
  });

/** Tandai temuan SEO sebagai diabaikan, atau buka kembali. */
export const ignoreSeoIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        urlPath: z.string().trim().min(1).max(500),
        issueCode: z.string().trim().min(1).max(80),
        ignored: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    if (!(await assertGrowthAccess(ctx))) {
      return { ok: false as const, error: "Anda tidak punya izin mengubah temuan audit." };
    }

    const { error } = await ctx.supabase.rpc("ignore_seo_issue", {
      _url_path: data.urlPath,
      _issue_code: data.issueCode,
      _ignored: data.ignored,
    });

    if (error) {
      if (error.message.includes("NOT_FOUND")) {
        return { ok: false as const, error: "Temuan tidak ditemukan. Jalankan audit ulang." };
      }
      console.error("[growth] ignore_seo_issue gagal:", error.message);
      return { ok: false as const, error: "Temuan gagal diperbarui." };
    }
    return { ok: true as const };
  });

/** Pindahkan status editorial artikel (8 tahap) dengan riwayat tercatat. */
export const moveArticleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum([
          "idea",
          "outline",
          "draft",
          "review",
          "ready",
          "scheduled",
          "published",
          "archived",
        ]),
        note: z.string().trim().max(200).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    if (!(await assertArticleWrite(ctx))) {
      return { ok: false as const, error: "Hanya admin yang dapat memindahkan status artikel." };
    }

    const { data: result, error } = await ctx.supabase.rpc("set_article_status", {
      _article_id: data.id,
      _new_status: data.status,
      _note: data.note ?? undefined,
    } as never);

    if (error) {
      if (error.message.includes("FORBIDDEN")) {
        return { ok: false as const, error: "Anda tidak punya izin mengubah artikel." };
      }
      console.error("[growth] set_article_status gagal:", error.message);
      return { ok: false as const, error: "Status artikel gagal diubah." };
    }
    return { ok: true as const, changed: Boolean((result as any)?.changed) };
  });

/** Simpan checklist pra-terbit artikel. */
export const saveArticleChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        checklist: z.record(z.string(), z.boolean()),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    if (!(await assertArticleWrite(ctx))) {
      return { ok: false as const, error: "Hanya admin yang dapat mengubah checklist." };
    }

    const { error } = await ctx.supabase.rpc("save_article_checklist", {
      _article_id: data.id,
      _checklist: data.checklist,
    } as never);

    if (error) {
      console.error("[growth] save_article_checklist gagal:", error.message);
      return { ok: false as const, error: "Checklist gagal disimpan." };
    }
    return { ok: true as const };
  });
