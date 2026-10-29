import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Package,
  Star,
  Store,
} from "lucide-react";

import { formatRupiah } from "@/lib/format";
import { cn, isRenderableImageUrl } from "@/lib/utils";

export type ProductTileItem = {
  id: string;
  name: string;
  slug: string;
  thumbnail_url: string | null;
  store_name?: string | null;
  store_logo_url?: string | null;
  store_rating?: number | null;
  is_official?: boolean;
  price: number | string;
  discount_price: number | string | null;
  sold_count?: number;
};

/** Ambang "Top Seller": produk di 3 besar rak terlaris atau sudah laku ≥ 10. */
const TOP_SELLER_MIN_SOLD = 10;

/**
 * Kartu produk standar marketplace (muat 2 kolom di 320px):
 * gambar 1:1 → nama 2 baris → harga penuh → harga coret + diskon → toko & terjual.
 * Semua info selalu tampil (tidak bergantung hover) supaya mudah dibandingkan.
 */
export function ProductTile({ item, rank }: { item: ProductTileItem; rank?: number }) {
  const base = Number(item.price);
  const disc = item.discount_price == null ? NaN : Number(item.discount_price);
  const hasDiscount = Number.isFinite(disc) && disc > 0 && disc < base;
  const price = hasDiscount ? disc : base;
  const discountPct = hasDiscount ? Math.round((1 - disc / base) * 100) : 0;
  const thumb = isRenderableImageUrl(item.thumbnail_url) ? item.thumbnail_url : null;
  const sold = item.sold_count ?? 0;
  const topSeller = rank == null && sold >= TOP_SELLER_MIN_SOLD;
  const official = Boolean(item.is_official);
  const sellerName = official ? (item.store_name ?? "Ebrystore") : item.store_name;

  return (
    <Link
      to="/produk/$slug"
      params={{ slug: item.slug }}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-[border-color,box-shadow] duration-200 hover:border-accent/40 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      {/* overflow-hidden wajib: tanpa itu aspect-ratio hanya batas minimum. */}
      <div className="relative aspect-square overflow-hidden bg-muted">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
          />
        ) : (
          <span className="grid size-full place-items-center bg-surface-selected">
            <span className="flex flex-col items-center gap-1.5 text-accent">
              <Package className="size-8" aria-hidden="true" />
              <span className="text-[11px] font-medium text-muted-foreground">Produk digital</span>
            </span>
          </span>
        )}

        <div className="absolute left-0 top-2 flex flex-col items-start gap-1">
          {rank ? (
            <span className="rounded-r-md bg-foreground px-2 py-0.5 text-[11px] font-bold tabular-nums text-background">
              #{rank}
            </span>
          ) : null}
          {official ? (
            <span className="rounded-r-md bg-warning px-2 py-0.5 text-[11px] font-semibold text-warning-foreground">
              Official
            </span>
          ) : topSeller ? (
            <span className="rounded-r-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
              Terlaris
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-2.5 sm:p-3">
        <p className="line-clamp-2 min-h-[2.75em] break-words text-[13px] leading-snug text-foreground transition-colors group-hover:text-accent sm:text-sm">
          {item.name}
        </p>
        <p className="mt-1.5 text-[15px] font-bold tabular-nums text-price sm:text-base">
          {formatRupiah(price)}
        </p>
        {hasDiscount ? (
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px]">
            <s className="truncate tabular-nums text-muted-foreground">
              <span className="sr-only">Harga sebelumnya </span>
              {formatRupiah(base)}
            </s>
            <span className="shrink-0 rounded bg-destructive/10 px-1 font-semibold text-destructive">
              -{discountPct}%
            </span>
          </p>
        ) : null}

        <div className="mt-auto space-y-1 pt-2 text-[11px] text-muted-foreground">
          {sellerName ? (
            <p className="flex min-w-0 items-center gap-1">
              {official ? (
                <BadgeCheck
                  className="size-3.5 shrink-0 text-accent"
                  aria-label="Toko resmi Ebrystore"
                />
              ) : (
                <Store className="size-3 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">{sellerName}</span>
            </p>
          ) : null}
          {item.store_rating || sold ? (
            <p className="flex items-center gap-1 tabular-nums">
              {item.store_rating && !official ? (
                <>
                  <Star className="size-3 shrink-0 fill-warning text-warning" aria-hidden="true" />
                  <span>
                    <span className="sr-only">Rating toko </span>
                    {item.store_rating.toFixed(1)}
                  </span>
                  {sold ? <span aria-hidden="true">·</span> : null}
                </>
              ) : null}
              {sold ? <span>{sold} terjual</span> : null}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

/** Grid produk responsif: 2 kolom di HP sampai 6 di layar lebar. */
export const PRODUCT_GRID =
  "grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

/** Tautan "Lihat semua" untuk kanan judul rak. */
export function SeeAllLink({ to, kategori }: { to: "/produk" | "/layanan"; kategori?: string }) {
  return (
    <Link
      to={to}
      search={kategori ? ({ kategori } as never) : undefined}
      className="flex min-h-11 items-center gap-1 text-xs font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Lihat semua <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}

/**
 * Lebar kartu per jumlah tampil, berbasis lebar RAK (container query), bukan
 * layar: rak di dashboard (ada sidebar) dan di home (lebar penuh) sama-sama pas.
 * Rumus: (100% - celah * (n-1)) / n, celah 0.75rem.
 */
export const SHELF_ITEM_WIDTH =
  "w-[calc((100%-0.75rem)/2)] @xl:w-[calc((100%-1.5rem)/3)] @3xl:w-[calc((100%-2.25rem)/4)] @5xl:w-[calc((100%-3rem)/5)] @6xl:w-[calc((100%-3.75rem)/6)] @7xl:w-[calc((100%-4.5rem)/7)]";

/** Panah geser untuk perangkat ber-mouse; di layar sentuh cukup swipe. */
export function ShelfArrows({ track }: { track: RefObject<HTMLUListElement | null> }) {
  const [edge, setEdge] = useState({ start: true, end: false });

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () =>
      setEdge({
        start: el.scrollLeft <= 4,
        end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
      });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [track]);

  // Semua kartu sudah terlihat: panah tidak berguna, jangan tampilkan.
  if (edge.start && edge.end) return null;

  const go = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };
  const btn =
    "grid size-9 place-items-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="hidden items-center gap-1.5 [@media(hover:hover)]:flex">
      <button
        type="button"
        className={btn}
        disabled={edge.start}
        onClick={() => go(-1)}
        aria-label="Geser ke kiri"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={btn}
        disabled={edge.end}
        onClick={() => go(1)}
        aria-label="Geser ke kanan"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function ShelfHeading({ id, title }: { id: string; title: string }) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-base font-bold text-foreground sm:text-lg">
      <span className="h-4 w-1 rounded-full bg-accent" aria-hidden="true" />
      {title}
    </h2>
  );
}

/** Rak horizontal: 2 kartu per layar di HP, bertambah mengikuti lebar rak. */
export function Shelf({
  title,
  items,
  ranked,
  onSeeAll,
  action,
  layout = "rail",
}: {
  title: string;
  items: ProductTileItem[];
  ranked?: boolean;
  onSeeAll?: () => void;
  /** Aksi kustom di kanan judul (mis. "Hapus riwayat"); menggantikan "Lihat semua". */
  action?: ReactNode;
  /** "rail" = geser horizontal; "grid" = beberapa baris penuh (feed rekomendasi). */
  layout?: "rail" | "grid";
}) {
  const track = useRef<HTMLUListElement>(null);
  if (!items.length) return null;
  const headingId = `shelf-${title.replace(/\W+/g, "-").toLowerCase()}`;
  if (layout === "grid") {
    return (
      <section aria-labelledby={headingId} className="rounded-2xl bg-card py-3.5 sm:py-4">
        <div className="flex min-h-11 items-center justify-between gap-3 px-4 sm:px-5">
          <ShelfHeading id={headingId} title={title} />
          {action}
        </div>
        <ul className={cn("mt-1 px-4 sm:px-5", PRODUCT_GRID)}>
          {items.map((item) => (
            <li key={item.id} className="min-w-0">
              <ProductTile item={item} />
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section aria-labelledby={headingId} className="@container rounded-2xl bg-card py-3.5 sm:py-4">
      <div className="flex min-h-11 items-center justify-between gap-3 px-4 sm:px-5">
        <ShelfHeading id={headingId} title={title} />
        <div className="flex items-center gap-3">
          {action ??
            (onSeeAll ? (
              <button
                type="button"
                onClick={onSeeAll}
                className="flex min-h-11 items-center gap-1 text-xs font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Lihat semua <ArrowRight className="size-3.5" aria-hidden="true" />
              </button>
            ) : null)}
          <ShelfArrows track={track} />
        </div>
      </div>
      <ul
        ref={track}
        className="mt-1 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 sm:scroll-px-5 sm:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <li key={item.id} className={cn("shrink-0 snap-start", SHELF_ITEM_WIDTH)}>
            <ProductTile item={item} rank={ranked ? i + 1 : undefined} />
          </li>
        ))}
      </ul>
    </section>
  );
}
