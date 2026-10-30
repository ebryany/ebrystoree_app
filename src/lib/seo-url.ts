/** Domain publik produksi; dipakai untuk og:url, canonical, dan gambar pratinjau. */
export const SITE_ORIGIN = "https://app.ebrystore.my.id";

const CATALOG_PREFIX = "/api/public/catalog-image/";

/** Path relatif → URL absolut. Crawler (WhatsApp, Facebook) tidak membaca path relatif. */
export function absoluteUrl(path: string, origin: string = SITE_ORIGIN): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${origin.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * URL gambar pratinjau link. Gambar katalog diarahkan ke versi kecil (JPEG ≤1200px)
 * karena WhatsApp mengabaikan gambar berukuran besar.
 */
export function ogImageUrl(src: string | null | undefined, origin: string = SITE_ORIGIN): string | null {
  const value = src?.trim();
  if (!value) return null;
  if (value.startsWith(CATALOG_PREFIX)) {
    return absoluteUrl(`/api/public/og-image/${value.slice(CATALOG_PREFIX.length)}`, origin);
  }
  if (value.startsWith("https://")) return value;
  if (value.startsWith("/")) return absoluteUrl(value, origin);
  return null;
}
