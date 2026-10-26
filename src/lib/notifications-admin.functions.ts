import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const authz = () => import("./authz.server");

type Ctx = { supabase: any; userId: string };

async function guard<T>(
  context: Ctx,
  permission: string,
  run: () => Promise<T>,
): Promise<T | { forbidden: true; permission: string }> {
  const helpers = await authz();
  try {
    await helpers.assertPermission(context, permission);
  } catch {
    return { forbidden: true as const, permission };
  }
  return run();
}

export const AUDIENCES = ["all", "role", "users"] as const;
export const NOTIF_TYPES = [
  { value: "announcement", label: "Pengumuman" },
  { value: "promo", label: "Promo" },
  { value: "maintenance", label: "Pemeliharaan" },
  { value: "info", label: "Informasi" },
] as const;

/** Cari penerima berdasarkan nama atau email untuk pengiriman tertarget. */
export const searchNotificationRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ search: z.string().trim().max(120).optional().default("") }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "notifications.broadcast", async () => {
      let q = (context as Ctx).supabase.from("profiles").select("id, full_name, email");
      if (data.search) q = q.or(`email.ilike.%${data.search}%,full_name.ilike.%${data.search}%`);
      const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(20);
      if (error) return { forbidden: false as const, items: [], error: "Daftar pengguna tidak dapat dimuat." };
      return {
        forbidden: false as const,
        items: (rows ?? []).map((r: any) => ({ id: r.id as string, name: (r.full_name as string) ?? "Tanpa nama", email: (r.email as string) ?? "" })),
        error: null,
      };
    }),
  );

/** Kirim notifikasi/pengumuman ke pengguna. Divalidasi ulang di database. */
export const sendAdminNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(3).max(120),
        message: z.string().trim().min(3).max(1000),
        type: z.string().trim().min(2).max(40).default("announcement"),
        audience: z.enum(AUDIENCES).default("all"),
        role: z.string().trim().max(30).nullable().optional(),
        userIds: z.array(z.string().uuid()).max(200).optional(),
        link: z.string().trim().max(200).nullable().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) =>
    guard(context as Ctx, "notifications.broadcast", async () => {
      const { data: result, error } = await (context as Ctx).supabase.rpc("admin_broadcast_notification", {
        _title: data.title,
        _message: data.message,
        _audience: data.audience,
        _role: data.audience === "role" ? (data.role ?? null) : null,
        _user_ids: data.audience === "users" ? (data.userIds ?? []) : null,
        _type: data.type,
        _link: data.link ?? null,
      });
      if (error) {
        const msg = String(error.message ?? "");
        if (msg.includes("FORBIDDEN")) return { forbidden: false as const, ok: false, recipients: 0, error: "Anda tidak berhak mengirim notifikasi." };
        if (msg.includes("INVALID")) return { forbidden: false as const, ok: false, recipients: 0, error: "Data pengiriman tidak lengkap." };
        return { forbidden: false as const, ok: false, recipients: 0, error: "Notifikasi gagal dikirim." };
      }
      return {
        forbidden: false as const,
        ok: true,
        recipients: Number((result as any)?.recipients ?? 0),
        error: null,
      };
    }),
  );

/** Riwayat pengiriman diambil dari audit log. */
export const listBroadcastHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    guard(context as Ctx, "notifications.broadcast", async () => {
      const { data, error } = await (context as Ctx).supabase
        .from("audit_logs")
        .select("id, created_at, after_json")
        .eq("action", "notification.broadcast_sent")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return { forbidden: false as const, items: [], error: "Riwayat tidak dapat dimuat." };
      return {
        forbidden: false as const,
        items: (data ?? []).map((r: any) => ({
          id: r.id as string,
          createdAt: r.created_at as string,
          title: (r.after_json?.title as string) ?? "-",
          audience: (r.after_json?.audience as string) ?? "-",
          role: (r.after_json?.role as string) ?? null,
          type: (r.after_json?.type as string) ?? "announcement",
          recipients: Number(r.after_json?.recipients ?? 0),
        })),
        error: null,
      };
    }),
  );
