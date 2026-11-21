export function formatRupiah(
  value: number | null | undefined,
  currency = "IDR",
): string {
  if (value === null || value === undefined) return "-";
  const safeCurrency = /^[A-Z]{3}$/.test(currency) ? currency : "IDR";
  return new Intl.NumberFormat(safeCurrency === "IDR" ? "id-ID" : "en-US", {
    style: "currency",
    currency: safeCurrency,
    maximumFractionDigits: safeCurrency === "IDR" ? 0 : 2,
  }).format(value);
}

/** Format tanggal/waktu sesuai pengaturan admin (site_timezone, site_date_format, site_time_format, site_language). */
export function formatConfiguredDateTime(
  value: Date | string | number,
  options?: {
    locale?: string;
    timeZone?: string;
    dateFormat?: string;
    timeFormat?: string;
  },
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const locale = options?.locale === "en" ? "en-US" : "id-ID";
  const timeZone = options?.timeZone || "Asia/Jakarta";
  const hour12 = options?.timeFormat === "12h";
  const dateStyle =
    options?.dateFormat === "long"
      ? "long"
      : options?.dateFormat === "short"
        ? "short"
        : "medium";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle,
      timeStyle: "short",
      timeZone,
      hour12,
    }).format(date);
  } catch {
    return date.toLocaleString("id-ID");
  }
}

/** Harga yang ditagih. Aturannya sama dengan checkout SQL (`v_unit := CASE WHEN ...`). */
export function effectivePrice(price: number, discountPrice: number | null): number {
  return discountPrice !== null && discountPrice < price ? discountPrice : price;
}

export type PriceDetails = {
  /** Harga yang dibayar pembeli. */
  price: number;
  /** Harga sebelum diskon. */
  basePrice: number;
  hasDiscount: boolean;
  discountPercent: number;
};

/** Untuk tampilan: menerima nilai mentah dari Supabase (number, string, atau null). */
export function priceDetails(price: unknown, discountPrice: unknown): PriceDetails {
  const basePrice = Number.isFinite(Number(price)) ? Number(price) : 0;
  // Diskon negatif ditolak CHECK di DB; abaikan agar tampilan tidak mengarang potongan.
  const discount =
    discountPrice == null || !Number.isFinite(Number(discountPrice)) || Number(discountPrice) < 0
      ? null
      : Number(discountPrice);
  const finalPrice = effectivePrice(basePrice, discount);
  const hasDiscount = finalPrice < basePrice;
  return {
    price: finalPrice,
    basePrice,
    hasDiscount,
    discountPercent:
      hasDiscount && basePrice > 0 ? Math.round((1 - finalPrice / basePrice) * 100) : 0,
  };
}
