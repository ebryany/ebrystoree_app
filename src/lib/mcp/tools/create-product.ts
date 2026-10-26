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
  name: "create_digital_product",
  title: "Tambah produk digital",
  description:
    "Membuat produk digital baru (nama, harga, deskripsi, kategori, mode pengiriman, batas unduhan, masa berlaku). Produk dibuat sebagai draft kecuali status diisi.",
  inputSchema: {
    name: z.string().trim().min(3).max(120).describe("Nama produk."),
    price: z.number().int().min(0).describe("Harga normal dalam rupiah."),
    slug: z.string().trim().max(80).optional().describe("Slug URL; otomatis dari nama bila kosong."),
    short_description: z.string().trim().max(300).optional().describe("Deskripsi singkat."),
    description: z.string().trim().max(5000).optional().describe("Deskripsi lengkap."),
    discount_price: z.number().int().min(0).optional().describe("Harga diskon."),
    category_id: z.string().uuid().optional().describe("ID kategori (lihat list_categories)."),
    status: z.enum(["draft", "published", "archived"]).optional().describe("Status publikasi (default draft)."),
    delivery_mode: z.enum(["shared", "unique"]).optional().describe("shared = file sama untuk semua, unique = satu file per pembeli."),
    download_limit: z.number().int().min(1).max(100).optional().describe("Batas unduhan (default 5)."),
    validity_days: z.number().int().min(1).max(3650).optional().describe("Masa berlaku akses hari (default 365)."),
    usage_notes: z.string().trim().max(2000).optional().describe("Catatan penggunaan."),
    thumbnail_url: z.string().url().max(500).optional().describe("URL gambar thumbnail."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    if (
      typeof input.discount_price === "number" &&
      input.discount_price >= input.price
    ) {
      return errorResult("Harga diskon harus lebih kecil dari harga normal.");
    }
    const slug = slugify(input.slug || input.name);
    if (!slug) return errorResult("Slug tidak valid, isi nama produk yang mengandung huruf/angka.");

    const supabase = supabaseForUser(ctx);
    const { data: existing } = await supabase
      .from("digital_products")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existing) return errorResult(`Slug "${slug}" sudah dipakai produk lain.`);

    const row = {
      name: input.name,
      slug,
      price: input.price,
      status: input.status ?? "draft",
      delivery_mode: input.delivery_mode ?? "shared",
      download_limit: input.download_limit ?? 5,
      validity_days: input.validity_days ?? 365,
      currency: "IDR",
      ...(input.discount_price !== undefined ? { discount_price: input.discount_price } : {}),
      ...(input.category_id ? { category_id: input.category_id } : {}),
      ...(input.short_description ? { short_description: input.short_description } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.usage_notes ? { usage_notes: input.usage_notes } : {}),
      ...(input.thumbnail_url ? { thumbnail_url: input.thumbnail_url } : {}),
    };

    const { data, error } = await supabase
      .from("digital_products")
      .insert(row)
      .select("id, name, slug, status, price, discount_price, delivery_mode, download_limit, validity_days")
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Produk gagal dibuat atau akun tidak punya izin menambah produk.");
    return jsonResult({
      created: data,
      note: "Produk masih tanpa file. Unggah file produk lewat dashboard admin agar bisa dikirim otomatis.",
    });
  },
});
