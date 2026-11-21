/**
 * Optimasi gambar raster on-the-fly untuk proxy media publik (`/api/public/catalog-image/*`
 * dan `/api/public/service-media/*`).
 *
 * Keamanan & efisiensi cache Cloudflare:
 * - Lebar hanya menerima daftar tetap (`ALLOWED_IMAGE_WIDTHS`) agar penyerang tidak
 *   bisa memecah cache CDN atau menghabiskan CPU lewat `?w=101`, `?w=102`, dst.
 * - `limitInputPixels` mencegah decompression bomb pada PNG/WebP raksasa.
 * - Tanpa `?w=` maupun `?fmt=webp`, payload asli dikembalikan apa adanya untuk
 *   kompatibilitas penuh dengan pemanggil lama.
 * - Bila `sharp` gagal memproses buffer tertentu, fallback aman ke gambar asli.
 */

export const ALLOWED_IMAGE_WIDTHS = [96, 128, 240, 360, 480, 640, 800, 1200] as const;
export type AllowedImageWidth = (typeof ALLOWED_IMAGE_WIDTHS)[number];

const ALLOWED_SET = new Set<number>(ALLOWED_IMAGE_WIDTHS);

export function parseImageTransform(requestUrl: string | undefined): {
  width: AllowedImageWidth | null;
  webp: boolean;
} {
  if (!requestUrl) return { width: null, webp: false };
  try {
    const parsed = new URL(requestUrl, "https://local.invalid");
    const rawW = parsed.searchParams.get("w");
    const rawFmt = (parsed.searchParams.get("f") ?? parsed.searchParams.get("fmt"))?.toLowerCase();
    const numericW = rawW ? Number.parseInt(rawW, 10) : NaN;
    const width = ALLOWED_SET.has(numericW) ? (numericW as AllowedImageWidth) : null;
    const webp = rawFmt === "webp" || width !== null;
    return { width, webp };
  } catch {
    return { width: null, webp: false };
  }
}

export async function optimizeRasterImage(
  rawBuffer: ArrayBuffer,
  originalContentType: string,
  requestUrl: string | undefined,
): Promise<{ body: BodyInit; contentType: string; fallback: boolean }> {
  const { width, webp } = parseImageTransform(requestUrl);
  if (!width && !webp) {
    return { body: rawBuffer, contentType: originalContentType, fallback: false };
  }

  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default ?? sharpModule;
    let pipeline = sharp(Buffer.from(rawBuffer), { limitInputPixels: 40_000_000 }).rotate();
    if (width) {
      pipeline = pipeline.resize({ width, withoutEnlargement: true });
    }
    const output = await pipeline.webp({ quality: 80, effort: 4 }).toBuffer();
    return { body: new Uint8Array(output), contentType: "image/webp", fallback: false };
  } catch (err) {
    console.error("[image-optimize] sharp gagal:", err instanceof Error ? err.message : err);
    return { body: rawBuffer, contentType: originalContentType, fallback: true };
  }
}
