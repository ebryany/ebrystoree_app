export function formatRupiah(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
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
  const discount =
    discountPrice == null || !Number.isFinite(Number(discountPrice)) ? null : Number(discountPrice);
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
