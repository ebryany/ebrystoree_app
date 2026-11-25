import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Flame, Tag } from "lucide-react";

import {
  ProductTile,
  ShelfArrows,
  type ProductTileItem,
} from "@/components/ebry/product-shelf";
import { priceDetails } from "@/lib/format";

const MIN_PROMO_ITEMS = 2;

/**
 * Pita Promo Hemat & Terlaris ala rak "Kejar Diskon" Tokopedia / Itemku.
 * Hanya dirender bila benar-benar ada minimal 2 produk diskon atau terlaris
 * dari database; persentase maksimal dihitung dari harga nyata, bukan angka fiktif.
 */
export function PromoDealsShelf({
  discounted,
  bestSellers,
}: {
  discounted: ProductTileItem[];
  bestSellers: ProductTileItem[];
}) {
  const track = useRef<HTMLUListElement>(null);

  const useDiscount = discounted.length >= MIN_PROMO_ITEMS;
  const items = useDiscount ? discounted : bestSellers;
  if (items.length < MIN_PROMO_ITEMS) return null;

  const maxDiscount = useDiscount
    ? Math.max(
        0,
        ...items.map((item) => priceDetails(item.price, item.discount_price).discountPercent),
      )
    : 0;

  const heading = useDiscount ? "Promo hemat hari ini" : "Paling banyak dibeli";
  const subtitle =
    useDiscount && maxDiscount > 0
      ? `Potongan harga langsung hingga ${maxDiscount}% dari toko aktif.`
      : "Produk yang paling sering dibeli dan terverifikasi.";
  const Icon = useDiscount ? Tag : Flame;

  return (
    <section
      aria-labelledby="promo-shelf-heading"
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--elev-1)]"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        {/* Panel jangkar kiri (desktop) / pita atas (mobile) memakai ink-teal Ebrystore;
            teks selalu terang (#faf8f3) karena gradien hero gelap di mode terang maupun gelap. */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-hero-gradient p-4 text-[#faf8f3] sm:p-5 lg:flex-col lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#faf8f3]/85">
              <Icon className="size-3.5" aria-hidden="true" />
              {useDiscount ? "Penawaran aktif" : "Terlaris"}
            </p>
            <h2
              id="promo-shelf-heading"
              className="mt-1.5 font-display text-lg font-bold leading-snug tracking-tight text-[#faf8f3] sm:text-xl"
            >
              {heading}
            </h2>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-[#faf8f3]/85">
              {subtitle}
            </p>
          </div>
          <Link
            to="/produk"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-control bg-[#faf8f3] px-4 text-xs font-semibold text-[#003f42] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#faf8f3] focus-visible:ring-offset-2 focus-visible:ring-offset-[#003f42]"
          >
            Lihat semua
          </Link>
        </div>

        {/* Rak geser horizontal produk promo. */}
        <div className="min-w-0 p-3.5 sm:p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              Menampilkan {Math.min(items.length, 10)} produk pilihan
            </p>
            <ShelfArrows track={track} />
          </div>
          <ul
            ref={track}
            role="list"
            className="relative flex snap-x snap-mandatory items-stretch gap-2.5 overflow-x-auto overscroll-x-contain pb-1 sm:gap-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {items.slice(0, 10).map((item, i) => (
              <li
                key={item.id}
                className="w-[10.25rem] shrink-0 snap-start sm:w-[11.5rem] lg:w-[12rem]"
              >
                <ProductTile item={item} rank={!useDiscount ? i + 1 : undefined} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
