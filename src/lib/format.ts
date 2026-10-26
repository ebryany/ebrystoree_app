export function formatRupiah(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function effectivePrice(price: number, discountPrice: number | null): number {
  return discountPrice !== null && discountPrice < price ? discountPrice : price;
}