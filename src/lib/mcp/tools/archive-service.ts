import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "archive_service",
  title: "Arsip / hapus layanan jasa",
  description: "Mengarsipkan layanan agar tidak tampil di katalog, menghapusnya secara lunak, atau memulihkannya.",
  inputSchema: {
    id: z.string().uuid().describe("ID layanan."),
    mode: z
      .enum(["archive", "soft_delete", "restore"])
      .describe("archive = sembunyikan, soft_delete = hapus lunak, restore = kembalikan sebagai draft."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, mode }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const now = new Date().toISOString();
    const patch =
      mode === "archive"
        ? { status: "archived", updated_at: now }
        : mode === "soft_delete"
          ? { status: "archived", deleted_at: now, updated_at: now }
          : { status: "draft", deleted_at: null, updated_at: now };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("services")
      .update(patch)
      .eq("id", id)
      .select("id, name, slug, status, deleted_at")
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Layanan tidak ditemukan atau akun tidak punya izin mengubahnya.");
    await supabase.rpc("write_audit_log", {
      _action: mode === "soft_delete" ? "service.delete" : "service.update",
      _entity_type: "services",
      _entity_id: id,
      _after: data as never,
    });
    return jsonResult({ service: data, mode });
  },
});