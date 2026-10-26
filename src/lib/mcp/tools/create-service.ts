import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export default defineTool({
  name: "create_service",
  title: "Tambah layanan jasa",
  description:
    "Membuat layanan jasa baru lengkap dengan paket harga dan add-on opsional. Layanan dibuat sebagai draft kecuali status diisi.",
  inputSchema: {
    name: z.string().trim().min(3).max(120).describe("Nama layanan."),
    slug: z.string().trim().max(80).optional().describe("Slug URL; otomatis dari nama bila kosong."),
    category_id: z.string().uuid().optional().describe("ID kategori (lihat list_categories)."),
    short_description: z.string().trim().max(240).optional().describe("Deskripsi singkat."),
    description: z.string().trim().max(5000).optional().describe("Deskripsi lengkap."),
    requirements_note: z.string().trim().max(2000).optional().describe("Catatan kebutuhan dari pelanggan."),
    thumbnail_url: z.string().url().max(500).optional().describe("URL gambar layanan."),
    order_capacity: z.number().int().min(0).max(10000).optional().describe("Kapasitas pesanan aktif."),
    status: z.enum(["draft", "published", "archived"]).optional().describe("Status publikasi (default draft)."),
    default_revision_limit: z.number().int().min(0).max(50).optional().describe("Jatah revisi default."),
    default_sla_hours: z.number().int().min(1).max(8760).optional().describe("SLA default dalam jam."),
    packages: z
      .array(
        z.object({
          name: z.string().trim().min(2).max(120),
          description: z.string().trim().max(1000).optional(),
          price: z.number().int().min(0),
          estimated_days: z.number().int().min(1).max(365).optional(),
          free_revisions: z.number().int().min(0).max(50).optional(),
          sla_hours: z.number().int().min(0).max(8760).optional(),
          priority: z.enum(["normal", "priority", "express"]).optional(),
          is_active: z.boolean().optional(),
          sort_order: z.number().int().min(0).max(999).optional(),
        }),
      )
      .max(10)
      .optional()
      .describe("Paket harga layanan."),
    addons: z
      .array(
        z.object({
          name: z.string().trim().min(2).max(120),
          description: z.string().trim().max(1000).optional(),
          price: z.number().int().min(0),
          is_active: z.boolean().optional(),
          sort_order: z.number().int().min(0).max(999).optional(),
        }),
      )
      .max(20)
      .optional()
      .describe("Add-on opsional."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const slug = slugify(input.slug || input.name);
    if (!slug) return errorResult("Slug tidak valid, isi nama layanan yang mengandung huruf/angka.");

    const supabase = supabaseForUser(ctx);
    const { data: existing } = await supabase.from("services").select("id").eq("slug", slug).maybeSingle();
    if (existing) return errorResult(`Slug "${slug}" sudah dipakai layanan lain.`);

    const row = {
      name: input.name,
      slug,
      status: input.status ?? "draft",
      ...(input.category_id ? { category_id: input.category_id, academic_category_id: input.category_id } : {}),
      ...(input.short_description ? { short_description: input.short_description } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.requirements_note ? { requirements_note: input.requirements_note } : {}),
      ...(input.thumbnail_url ? { thumbnail_url: input.thumbnail_url } : {}),
      ...(input.order_capacity !== undefined ? { order_capacity: input.order_capacity } : {}),
      ...(input.default_revision_limit !== undefined ? { default_revision_limit: input.default_revision_limit } : {}),
      ...(input.default_sla_hours !== undefined ? { default_sla_hours: input.default_sla_hours } : {}),
    };

    const { data: service, error } = await supabase
      .from("services")
      .insert(row)
      .select("id, name, slug, status")
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!service) return errorResult("Layanan gagal dibuat atau akun tidak punya izin menambah layanan.");

    let packages: unknown[] = [];
    let addons: unknown[] = [];

    if (input.packages?.length) {
      const { data, error: pkgError } = await supabase
        .from("service_packages")
        .insert(
          input.packages.map((p, index) => ({
            service_id: service.id,
            name: p.name,
            description: p.description ?? null,
            price: p.price,
            estimated_days: p.estimated_days ?? 1,
            free_revisions: p.free_revisions ?? 0,
            sla_hours: p.sla_hours ?? null,
            priority: p.priority ?? "normal",
            is_active: p.is_active ?? true,
            sort_order: p.sort_order ?? index,
          })),
        )
        .select("id, name, price, estimated_days, is_active");
      if (pkgError) return errorResult(`Layanan dibuat (${service.slug}), tetapi paket gagal: ${pkgError.message}`);
      packages = data ?? [];
    }

    if (input.addons?.length) {
      const { data, error: addonError } = await supabase
        .from("service_addons")
        .insert(
          input.addons.map((a, index) => ({
            service_id: service.id,
            name: a.name,
            description: a.description ?? null,
            price: a.price,
            is_active: a.is_active ?? true,
            sort_order: a.sort_order ?? index,
          })),
        )
        .select("id, name, price, is_active");
      if (addonError) return errorResult(`Layanan dibuat (${service.slug}), tetapi add-on gagal: ${addonError.message}`);
      addons = data ?? [];
    }

    await supabase.rpc("write_audit_log", {
      _action: "service.create",
      _entity_type: "services",
      _entity_id: service.id,
      _after: { ...service, packages, addons } as never,
    });

    return jsonResult({ created: service, packages, addons });
  },
});