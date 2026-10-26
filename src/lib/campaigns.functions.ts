import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/**
 * Buat kampanye baru dari dashboard Pertumbuhan.
 *
 * Kombinasi utm_source + utm_campaign harus unik: kalau boleh duplikat,
 * atribusi menjadi ambigu dan angkanya tidak bisa dipercaya. Pelanggaran
 * keunikan dikembalikan sebagai pesan yang jelas, bukan error mentah.
 */
export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(3).max(120),
        channel: z.string().trim().min(2).max(40),
        utmSource: z.string().trim().min(1).max(120),
        utmMedium: z.string().trim().max(120).optional(),
        utmCampaign: z.string().trim().min(1).max(120),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;

    const { data: roles } = await ctx.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", ctx.userId);
    const allowed = (roles ?? []).some((r: any) => ["admin", "super_admin"].includes(r.role));
    if (!allowed) {
      return { ok: false as const, error: "Hanya admin yang dapat membuat kampanye." };
    }

    // RPC memeriksa auth.uid() di database, jadi dipanggil lewat client milik
    // pengguna (JWT ikut terkirim), bukan service role yang tidak punya uid.
    // RPC menerima NULL untuk parameter opsional, tapi tipe generated Supabase
    // menandainya non-null. Cast menyempitkan tanpa mengubah perilaku runtime.
    const { data: result, error } = await ctx.supabase.rpc("upsert_campaign", {
      _id: undefined,
      _name: data.name,
      _channel: data.channel,
      _utm_source: data.utmSource,
      _utm_medium: data.utmMedium ?? undefined,
      _utm_campaign: data.utmCampaign,
      _starts_at: undefined,
      _ends_at: undefined,
      _status: "active",
      _note: undefined,
    } as never);

    if (error) {
      // Keunikan UTM adalah aturan yang paling mungkin dilanggar; beri pesan
      // yang menjelaskan, bukan kode database.
      if (error.message.includes("duplicate key") || error.message.includes("unique")) {
        return {
          ok: false as const,
          error: `Kombinasi utm_source "${data.utmSource}" dan utm_campaign "${data.utmCampaign}" sudah dipakai kampanye lain.`,
        };
      }
      console.error("[campaigns] simpan gagal:", error.message);
      return { ok: false as const, error: "Kampanye gagal disimpan." };
    }

    return { ok: true as const, id: (result as { id?: string })?.id ?? null };
  });
