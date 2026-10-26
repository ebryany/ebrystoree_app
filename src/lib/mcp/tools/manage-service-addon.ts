import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "manage_service_addon",
  title: "Kelola add-on layanan",
  description: "Menambah, mengubah, atau menghapus add-on (layanan tambahan berbayar) pada sebuah layanan jasa.",
  inputSchema: {
    action: z.enum(["create", "update", "delete"]).describe("Aksi yang dijalankan."),
    id: z.string().uuid().optional().describe("ID add-on (wajib untuk update/delete)."),
    service_id: z.string().uuid().optional().describe("ID layanan (wajib untuk create)."),
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    price: z.number().int().min(0).optional().describe("Harga add-on dalam rupiah."),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(999).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);

    if (input.action === "delete") {
      if (!input.id) return errorResult("id add-on wajib diisi untuk delete.");
      const { error } = await supabase.from("service_addons").delete().eq("id", input.id);
      if (error) return errorResult(error.message);
      await supabase.rpc("write_audit_log", {
        _action: "service_addon.delete",
        _entity_type: "service_addons",
        _entity_id: input.id,
      });
      return jsonResult({ deleted: input.id });
    }

    if (input.action === "create") {
      if (!input.service_id) return errorResult("service_id wajib diisi untuk create.");
      if (!input.name || input.price === undefined) return errorResult("name dan price wajib diisi untuk create.");
      const { data, error } = await supabase
        .from("service_addons")
        .insert({
          service_id: input.service_id,
          name: input.name,
          price: input.price,
          is_active: input.is_active ?? true,
          sort_order: input.sort_order ?? 0,
          ...(input.description !== undefined ? { description: input.description } : {}),
        })
        .select("id, service_id, name, description, price, is_active, sort_order")
        .maybeSingle();
      if (error) return errorResult(error.message);
      if (!data) return errorResult("Add-on gagal dibuat atau akun tidak punya izin.");
      await supabase.rpc("write_audit_log", {
        _action: "service_addon.create",
        _entity_type: "service_addons",
        _entity_id: data.id,
        _after: data as never,
      });
      return jsonResult({ created: data });
    }

    if (!input.id) return errorResult("id add-on wajib diisi untuk update.");
    const fields = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
      ...(input.sort_order !== undefined ? { sort_order: input.sort_order } : {}),
    };
    if (!Object.keys(fields).length) return errorResult("Tidak ada perubahan yang dikirim.");
    const { data, error } = await supabase
      .from("service_addons")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", input.id)
      .select("id, service_id, name, description, price, is_active, sort_order")
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Add-on tidak ditemukan atau akun tidak punya izin mengubahnya.");
    await supabase.rpc("write_audit_log", {
      _action: "service_addon.update",
      _entity_type: "service_addons",
      _entity_id: input.id,
      _after: data as never,
    });
    return jsonResult({ updated: data });
  },
});