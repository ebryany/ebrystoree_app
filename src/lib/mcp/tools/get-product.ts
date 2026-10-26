import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_digital_product",
  title: "Detail produk digital",
  description:
    "Menampilkan detail satu produk digital (harga, stok, mode pengiriman, ringkasan berkas stok, dan rata-rata rating) berdasarkan slug atau id.",
  inputSchema: {
    slug: z.string().trim().min(1).optional().describe("Slug produk."),
    id: z.string().uuid().optional().describe("ID produk."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ slug, id }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    if (!slug && !id) return errorResult("Isi salah satu: slug atau id produk.");
    const supabase = supabaseForUser(ctx);
    let query = supabase.from("digital_products").select("*").is("deleted_at", null).limit(1);
    query = id ? query.eq("id", id) : query.eq("slug", slug!);
    const { data, error } = await query.maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Produk tidak ditemukan.");

    const [{ data: files }, { data: reviews }] = await Promise.all([
      supabase
        .from("digital_product_files")
        .select("id, original_name, is_active, assigned_entitlement_id, version, size_bytes")
        .eq("product_id", data.id),
      supabase.from("product_reviews").select("rating").eq("product_id", data.id).eq("is_visible", true),
    ]);

    const list = files ?? [];
    const ratings = (reviews ?? []).map((r) => Number(r.rating));
    return jsonResult({
      product: data,
      files: {
        total: list.length,
        aktif: list.filter((f) => f.is_active).length,
        sudah_terkirim: list.filter((f) => f.assigned_entitlement_id).length,
        items: list,
      },
      rating: {
        jumlah: ratings.length,
        rata_rata: ratings.length ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)) : null,
      },
    });
  },
});