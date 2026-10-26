import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { authGuard, errorResult, jsonResult, supabaseForUser } from "../supabase";

const BUCKET = "product-files";
const MAX_BYTES = 100 * 1024 * 1024;

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

function decodeBase64(raw: string): Uint8Array {
  const cleaned = raw.includes(",") && raw.trim().startsWith("data:") ? raw.slice(raw.indexOf(",") + 1) : raw;
  const binary = atob(cleaned.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export default defineTool({
  name: "upload_product_file",
  title: "Unggah berkas produk digital",
  description:
    "Mengunggah berkas master ke sebuah produk digital, langsung ke penyimpanan privat, lalu mencatatnya sebagai versi/stok. Isi content_base64 (isi berkas dalam base64) ATAU source_url (berkas akan diunduh dari URL tersebut). Pada mode 'shared' berkas baru menjadi versi aktif; pada mode 'unique' setiap berkas menjadi satu slot stok.",
  inputSchema: {
    product_id: z.string().uuid().describe("ID produk digital tujuan."),
    filename: z.string().trim().min(1).max(180).describe("Nama berkas asli, termasuk ekstensi."),
    version: z.string().trim().min(1).max(40).default("v1").describe("Label versi berkas, misal v1."),
    content_base64: z.string().min(4).optional().describe("Isi berkas dalam base64 (boleh data URL)."),
    source_url: z.string().url().max(1000).optional().describe("URL sumber berkas bila tidak mengirim base64."),
    mime_type: z.string().trim().max(120).optional().describe("Tipe MIME berkas, contoh application/pdf."),
    make_active: z.boolean().default(true).describe("Jadikan versi aktif (mode shared). Diabaikan pada mode unique."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async (input, ctx) => {
    const denied = authGuard(ctx);
    if (denied) return denied;
    if (!input.content_base64 && !input.source_url) {
      return errorResult("Isi salah satu: content_base64 atau source_url.");
    }

    const supabase = supabaseForUser(ctx);
    const { data: product, error: productError } = await supabase
      .from("digital_products")
      .select("id, name, delivery_mode")
      .eq("id", input.product_id)
      .maybeSingle();
    if (productError) return errorResult(productError.message);
    if (!product) return errorResult("Produk tidak ditemukan atau akun tidak punya akses.");
    const unique = (product.delivery_mode ?? "shared") === "unique";

    let bytes: Uint8Array;
    let contentType = input.mime_type ?? "application/octet-stream";
    try {
      if (input.content_base64) {
        bytes = decodeBase64(input.content_base64);
      } else {
        const res = await fetch(input.source_url!);
        if (!res.ok) return errorResult(`Gagal mengunduh berkas dari source_url (HTTP ${res.status}).`);
        bytes = new Uint8Array(await res.arrayBuffer());
        if (!input.mime_type) contentType = res.headers.get("content-type") ?? contentType;
      }
    } catch {
      return errorResult("Isi berkas tidak valid. Pastikan base64 benar atau URL dapat diakses.");
    }
    if (bytes.byteLength === 0) return errorResult("Berkas kosong.");
    if (bytes.byteLength > MAX_BYTES) return errorResult("Ukuran berkas melebihi batas 100 MB.");

    const path = `${input.product_id}/${Date.now()}-${safeName(input.filename)}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: false });
    if (uploadError) return errorResult(`Unggahan gagal: ${uploadError.message}`);

    if (input.make_active && !unique) {
      await supabase.from("digital_product_files").update({ is_active: false }).eq("product_id", input.product_id);
    }

    const { data: inserted, error } = await supabase
      .from("digital_product_files")
      .insert({
        product_id: input.product_id,
        storage_path: path,
        original_name: input.filename,
        mime_type: contentType,
        size_bytes: bytes.byteLength,
        version: input.version,
        is_active: unique ? true : input.make_active,
      })
      .select("id, original_name, version, size_bytes, is_active, created_at")
      .maybeSingle();
    if (error || !inserted) {
      await supabase.storage.from(BUCKET).remove([path]);
      return errorResult(error?.message ?? "Berkas gagal dicatat; akun mungkin tidak punya izin kelola produk.");
    }

    if (input.make_active && !unique) {
      await supabase.from("digital_products").update({ version: input.version }).eq("id", input.product_id);
    }

    await supabase.rpc("write_audit_log", {
      _action: "product_file.upload",
      _entity_type: "digital_product",
      _entity_id: input.product_id,
      _before: null,
      _after: { file_id: inserted.id, version: input.version, size_bytes: bytes.byteLength, source: "mcp" },
      _reason: null,
      _ip: null,
      _trace_id: null,
    });

    return jsonResult({
      uploaded: inserted,
      product: { id: product.id, name: product.name, delivery_mode: product.delivery_mode ?? "shared" },
      note: unique ? "Berkas ditambahkan sebagai satu slot stok unik." : "Berkas tersimpan sebagai versi produk.",
    });
  },
});
