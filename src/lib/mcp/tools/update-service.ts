import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "update_service",
  title: "Ubah layanan jasa",
  description:
    "Mengubah data layanan jasa: nama, deskripsi, kategori, status publikasi, kapasitas pesanan, jatah revisi default, dan SLA default.",
  inputSchema: {
    id: z.string().uuid().describe("ID layanan."),
    name: z.string().trim().min(3).max(120).optional(),
    short_description: z.string().trim().max(240).optional(),
    description: z.string().trim().max(5000).optional(),
    requirements_note: z.string().trim().max(2000).optional(),
    thumbnail_url: z.string().url().max(500).optional(),
    category_id: z.string().uuid().optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
    order_capacity: z.number().int().min(0).max(10000).nullable().optional(),
    default_revision_limit: z.number().int().min(0).max(50).optional(),
    default_sla_hours: z.number().int().min(1).max(8760).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, ...fields }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    if (!Object.keys(patch).length) return errorResult("Tidak ada perubahan yang dikirim.");
    const supabase = supabaseForUser(ctx);
    const { data: before } = await supabase.from("services").select("*").eq("id", id).maybeSingle();
    const { data, error } = await supabase
      .from("services")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id, name, slug, status, order_capacity, default_revision_limit, default_sla_hours")
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Layanan tidak ditemukan atau akun tidak punya izin mengubahnya.");
    await supabase.rpc("write_audit_log", {
      _action: "service.update",
      _entity_type: "services",
      _entity_id: id,
      _before: (before ?? null) as never,
      _after: data as never,
    });
    return jsonResult({ updated: data });
  },
});