import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export default defineTool({
  name: "manage_category",
  title: "Kelola kategori",
  description:
    "Membuat, mengubah, menonaktifkan, mengaktifkan kembali, atau mengarsipkan kategori produk atau layanan.",
  inputSchema: {
    action: z.enum(["create", "update", "deactivate", "activate", "soft_delete"]).describe("Aksi yang dilakukan."),
    id: z.string().uuid().optional().describe("ID kategori (wajib selain action create)."),
    name: z.string().trim().min(2).max(80).optional().describe("Nama kategori."),
    kind: z.enum(["product", "service"]).optional().describe("Jenis kategori (wajib saat create)."),
    slug: z.string().trim().max(80).optional().describe("Slug URL; otomatis dari nama bila kosong."),
    description: z.string().trim().max(500).optional().describe("Deskripsi kategori."),
    sort_order: z.number().int().min(0).max(999).optional().describe("Urutan tampil."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const supabase = supabaseForUser(ctx);

    if (input.action === "create") {
      if (!input.name || !input.kind) return errorResult("Nama dan kind wajib diisi saat membuat kategori.");
      const slug = slugify(input.slug || input.name);
      if (!slug) return errorResult("Slug tidak valid.");
      const { data: dup } = await supabase.from("categories").select("id").eq("slug", slug).maybeSingle();
      if (dup) return errorResult(`Slug "${slug}" sudah dipakai.`);
      const { data, error } = await supabase
        .from("categories")
        .insert({
          name: input.name,
          slug,
          kind: input.kind,
          is_active: true,
          ...(input.description ? { description: input.description } : {}),
          ...(input.sort_order !== undefined ? { sort_order: input.sort_order } : {}),
        })
        .select("id, name, slug, kind, is_active, sort_order")
        .maybeSingle();
      if (error) return errorResult(error.message);
      if (!data) return errorResult("Kategori gagal dibuat atau akun tidak punya izin.");
      await supabase.rpc("write_audit_log", {
        _action: "category.create",
        _entity_type: "categories",
        _entity_id: data.id,
        _before: null,
        _after: data,
        _reason: "mcp manage_category",
        _ip: null,
        _trace_id: null,
      });
      return jsonResult({ created: data });
    }

    if (!input.id) return errorResult("ID kategori wajib diisi.");
    const { data: before } = await supabase.from("categories").select("*").eq("id", input.id).maybeSingle();
    if (!before) return errorResult("Kategori tidak ditemukan.");

    const patch: Record<string, unknown> = {};
    if (input.action === "deactivate") patch['is_active'] = false;
    if (input.action === "activate") { patch['is_active'] = true; patch['deleted_at'] = null; }
    if (input.action === "soft_delete") { patch['deleted_at'] = new Date().toISOString(); patch['is_active'] = false; }
    if (input.action === "update") {
      if (input.name) { patch['name'] = input.name; }
      if (input.slug) patch['slug'] = slugify(input.slug);
      if (input.kind) patch['kind'] = input.kind;
      if (input.description !== undefined) patch['description'] = input.description;
      if (input.sort_order !== undefined) patch['sort_order'] = input.sort_order;
      if (!Object.keys(patch).length) return errorResult("Tidak ada perubahan yang dikirim.");
    }

    const { data, error } = await supabase
      .from("categories")
      .update(patch)
      .eq("id", input.id)
      .select("id, name, slug, kind, is_active, sort_order, deleted_at")
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Perubahan ditolak — akun tidak punya izin mengelola kategori.");
    await supabase.rpc("write_audit_log", {
      _action: `category.${input.action}`,
      _entity_type: "categories",
      _entity_id: input.id,
      _before: before,
      _after: data,
      _reason: "mcp manage_category",
      _ip: null,
      _trace_id: null,
    });
    return jsonResult({ updated: data });
  },
});
