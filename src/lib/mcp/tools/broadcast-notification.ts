import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "broadcast_notification",
  title: "Kirim notifikasi",
  description: "Mengirim notifikasi/pengumuman ke semua pengguna, ke satu role tertentu, atau ke daftar pengguna tertentu.",
  inputSchema: {
    title: z.string().trim().min(3).max(150).describe("Judul notifikasi."),
    message: z.string().trim().min(3).max(1000).describe("Isi pesan."),
    audience: z.enum(["all", "role", "users"]).optional().describe("Sasaran (default all)."),
    role: z.enum(["customer", "operator", "support", "finance", "admin", "super_admin"]).optional().describe("Role sasaran bila audience = role."),
    user_ids: z.array(z.string().uuid()).max(200).optional().describe("Daftar user bila audience = users."),
    type: z.string().trim().max(40).optional().describe("Jenis notifikasi (default announcement)."),
    link: z.string().trim().max(300).optional().describe("Tautan tujuan bila ada."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ title, message, audience, role, user_ids, type, link }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const target = audience ?? "all";
    if (target === "role" && !role) return errorResult("role wajib diisi bila audience = role.");
    if (target === "users" && !user_ids?.length) return errorResult("user_ids wajib diisi bila audience = users.");
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("admin_broadcast_notification", {
      _title: title,
      _message: message,
      _audience: target,
      _role: role ?? null,
      _user_ids: user_ids ?? null,
      _type: type ?? null,
      _link: link ?? null,
    });
    if (error) return errorResult(error.message);
    return jsonResult({ result: data });
  },
});
