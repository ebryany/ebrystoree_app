/**
 * Trust boundary upload aset ke bucket catalog-images: validasi server-side penuh
 * (ukuran, signature, decode sharp, dimensi) sebelum object disimpan
 * dengan path UUID baru (upsert:false). Dipakai banner home dan thumbnail produk;
 * bukan jalur upload katalog umum.
 */

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_DIMENSION = 8000;
const MAX_PIXELS = 16_000_000;

const FORMAT_EXT = new Map([
  ["jpeg", "jpg"],
  ["png", "png"],
  ["webp", "webp"],
  ["heif", "avif"],
]);

/** Signature sniffing; MIME deklarasi klien tidak dipercaya. */
function sniffFormat(bytes: Buffer): "jpeg" | "png" | "webp" | "avif" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "png";
  if (bytes.length >= 12 && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = bytes.subarray(8, 12).toString("latin1");
    if (brand === "avif" || brand === "avis") return "avif";
  }
  return null;
}

export type CatalogImageResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Simpan satu gambar ke catalog-images di bawah pathPrefix milik pemanggil.
 * persistBannerImage dan uploadProductImage memakai ini; prefix menandai pemilik
 * aset sehingga path proxy /api/public/catalog-image tetap dapat diverifikasi.
 */
export async function persistCatalogImage(
  base64: string,
  pathPrefix: string,
  maxBytes: number = MAX_BYTES,
): Promise<CatalogImageResult> {
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length) return { ok: false, error: "File gambar kosong." };
  if (bytes.length > maxBytes) return { ok: false, error: "Ukuran gambar maksimal 3 MB." };

  const sniffed = sniffFormat(bytes);
  if (!sniffed) return { ok: false, error: "Format gambar harus JPG, PNG, WEBP, atau AVIF." };

  const sharpModule = await import("sharp");
  const sharp = sharpModule.default ?? sharpModule;

  let meta: { format?: string; width?: number; height?: number; pages?: number };
  try {
    meta = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    return { ok: false, error: "Gambar tidak dapat dibaca." };
  }

  // sharp melaporkan AVIF sebagai format heif; sniffing ftyp memastikan brand avif/avis.
  if (meta.format !== (sniffed === "avif" ? "heif" : sniffed) || !FORMAT_EXT.has(meta.format ?? ""))
    return { ok: false, error: "Isi file tidak cocok dengan format gambar yang diizinkan." };
  if ((meta.pages ?? 1) > 1) return { ok: false, error: "Gambar animasi tidak didukung." };
  const { width, height } = meta;
  if (
    !width ||
    !height ||
    width < 1 ||
    height < 1 ||
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION ||
    width * height > MAX_PIXELS
  )
    return {
      ok: false,
      error: `Dimensi gambar maksimal ${MAX_DIMENSION} px per sisi dan ${MAX_PIXELS.toLocaleString("id-ID")} piksel.`,
    };

  try {
    await sharp(bytes, { failOn: "error", limitInputPixels: MAX_PIXELS }).toBuffer();
  } catch {
    return { ok: false, error: "Gambar tidak dapat dibaca." };
  }

  const ext = FORMAT_EXT.get(meta.format!)!;
  const path = `${pathPrefix}/${crypto.randomUUID()}.${ext}`;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const contentType = sniffed === "avif" ? "image/avif" : `image/${sniffed}`;
  const { error } = await supabaseAdmin.storage.from("catalog-images").upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (error) {
    console.error("[catalog-image] upload storage gagal:", error.message);
    return { ok: false, error: "Penyimpanan gambar gagal. Coba lagi." };
  }
  return { ok: true, url: `/api/public/catalog-image/${path}` };
}

export async function persistBannerImage(base64: string): Promise<CatalogImageResult> {
  return persistCatalogImage(base64, "branding/home");
}
