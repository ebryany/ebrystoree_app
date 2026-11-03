export type PackageLike = {
  price: number | string | null;
  estimated_days: number | null;
  is_active: boolean | null;
};

/** Ringkasan harga & estimasi dari paket aktif saja; null bila tidak ada data. */
export function summarizeServicePackages(packages: PackageLike[] | null | undefined) {
  const active = (packages ?? []).filter((p) => p.is_active !== false);
  const prices = active.map((p) => Number(p.price)).filter((n) => Number.isFinite(n) && n > 0);
  const days = active
    .map((p) => Number(p.estimated_days))
    .filter((n) => Number.isFinite(n) && n > 0);
  return {
    activeCount: active.length,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    minDays: days.length ? Math.min(...days) : null,
    maxDays: days.length ? Math.max(...days) : null,
  };
}
