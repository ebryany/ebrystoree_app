import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "update_digital_product",
  title: "Ubah produk digital",
  description:
    "Mengubah harga, harga diskon, status publikasi, deskripsi singkat, batas unduhan, atau masa berlaku sebuah produk digital. Hanya berhasil bila akun punya izin kelola produk.",
  inputSchema: {
    id: z.string().uuid().describe("ID produk digital yang diubah."),
    price: z.number().int().min(0).optional().describe("Harga normal dalam rupiah."),
    discount_price: z.number().int().min(0).nullable().optional().describe("Harga diskon; null untuk menghapus."),
    status: z.enum(["draft", "published", "archived"]).optional().describe("Status publikasi."),
    short_description: z.string().trim().max(300).optional().describe("Deskripsi singkat."),
    download_limit: z.number().int().min(1).max(100).optional().describe("Batas unduhan per pembeli."),
    validity_days: z.number().int().min(1).max(3650).optional().describe("Masa berlaku akses (hari)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, ...fields }, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    if (!Object.keys(patch).length) return errorResult("Tidak ada perubahan yang dikirim.");
    if (
      typeof patch['discount_price'] === "number" &&
      typeof patch['price'] === "number" &&
      patch['discount_price'] >= patch['price']
    ) {
      return errorResult("Harga diskon harus lebih kecil dari harga normal.");
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("digital_products")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id, name, slug, status, price, discount_price, download_limit, validity_days")
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Produk tidak ditemukan atau akun tidak punya izin mengubahnya.");
    return jsonResult({ updated: data });
  },
});