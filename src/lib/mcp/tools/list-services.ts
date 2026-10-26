import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_services",
  title: "Daftar layanan jasa",
  description:
    "Menampilkan layanan jasa beserta paket dan add-on-nya. Pakai untuk melihat ID layanan/paket sebelum mengubah harga atau menambah paket.",
  inputSchema: {
    search: z.string().trim().max(80).optional().describe("Cari berdasarkan nama layanan."),
    status: z.enum(["all", "draft", "published", "archived"]).optional().describe("Filter status publikasi."),
    limit: z.number().int().min(1).max(50).optional().describe("Jumlah baris (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, status, limit }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("services")
      .select(
        "id, name, slug, status, category_id, short_description, description, requirements_note, order_capacity, thumbnail_url, default_revision_limit, default_sla_hours, updated_at, service_packages(id, name, description, price, estimated_days, free_revisions, sla_hours, priority, is_active, sort_order), service_addons(id, name, description, price, is_active, sort_order)",
      )
      .is("deleted_at", null);
    if (search) query = query.ilike("name", `%${search}%`);
    if (status && status !== "all") query = query.eq("status", status);
    const { data, error } = await query.order("updated_at", { ascending: false }).limit(limit ?? 20);
    if (error) return errorResult(error.message);
    return jsonResult({ items: data ?? [] });
  },
});