import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "manage_service_package",
  title: "Kelola paket layanan",
  description:
    "Menambah, mengubah, atau menghapus paket harga sebuah layanan jasa (harga, estimasi hari, jatah revisi, SLA, prioritas, aktif/nonaktif).",
  inputSchema: {
    action: z.enum(["create", "update", "delete"]).describe("Aksi yang dijalankan."),
    id: z.string().uuid().optional().describe("ID paket (wajib untuk update/delete)."),
    service_id: z.string().uuid().optional().describe("ID layanan (wajib untuk create)."),
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    price: z.number().int().min(0).optional().describe("Harga paket dalam rupiah."),
    estimated_days: z.number().int().min(1).max(365).optional(),
    free_revisions: z.number().int().min(0).max(50).optional(),
    sla_hours: z.number().int().min(0).max(8760).optional(),
    priority: z.enum(["normal", "priority", "express"]).optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(999).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);

    if (input.action === "delete") {
      if (!input.id) return errorResult("id paket wajib diisi untuk delete.");
      const { error } = await supabase.from("service_packages").delete().eq("id", input.id);
      if (error) return errorResult(error.message);
      await supabase.rpc("write_audit_log", {
        _action: "service_package.delete",
        _entity_type: "service_packages",
        _entity_id: input.id,
      });
      return jsonResult({ deleted: input.id });
    }

    const fields = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.estimated_days !== undefined ? { estimated_days: input.estimated_days } : {}),
      ...(input.free_revisions !== undefined ? { free_revisions: input.free_revisions } : {}),
      ...(input.sla_hours !== undefined ? { sla_hours: input.sla_hours } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
      ...(input.sort_order !== undefined ? { sort_order: input.sort_order } : {}),
    };

    if (input.action === "create") {
      if (!input.service_id) return errorResult("service_id wajib diisi untuk create.");
      if (!input.name || input.price === undefined) return errorResult("name dan price wajib diisi untuk create.");
      const { data, error } = await supabase
        .from("service_packages")
        .insert({
          service_id: input.service_id,
          name: input.name,
          price: input.price,
          estimated_days: input.estimated_days ?? 1,
          free_revisions: input.free_revisions ?? 0,
          priority: input.priority ?? "normal",
          is_active: input.is_active ?? true,
          sort_order: input.sort_order ?? 0,
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.sla_hours !== undefined ? { sla_hours: input.sla_hours } : {}),
        })
        .select("id, service_id, name, price, estimated_days, free_revisions, sla_hours, priority, is_active, sort_order")
        .maybeSingle();
      if (error) return errorResult(error.message);
      if (!data) return errorResult("Paket gagal dibuat atau akun tidak punya izin.");
      await supabase.rpc("write_audit_log", {
        _action: "service_package.create",
        _entity_type: "service_packages",
        _entity_id: data.id,
        _after: data as never,
      });
      return jsonResult({ created: data });
    }

    if (!input.id) return errorResult("id paket wajib diisi untuk update.");
    if (!Object.keys(fields).length) return errorResult("Tidak ada perubahan yang dikirim.");
    const { data, error } = await supabase
      .from("service_packages")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", input.id)
      .select("id, service_id, name, price, estimated_days, free_revisions, sla_hours, priority, is_active, sort_order")
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Paket tidak ditemukan atau akun tidak punya izin mengubahnya.");
    await supabase.rpc("write_audit_log", {
      _action: "service_package.update",
      _entity_type: "service_packages",
      _entity_id: input.id,
      _after: data as never,
    });
    return jsonResult({ updated: data });
  },
});