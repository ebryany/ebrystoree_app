import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, ChevronLeft, ChevronRight, Package, Star } from "lucide-react";

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

/**
 * Gaya kaca (glassmorphism) untuk kartu dan rak. Dipasang per halaman lewat
 * <ProductGlass>, jadi beranda dan /produk tetap memakai kartu biasa.
 */
const GlassContext = createContext(false);

export function ProductGlass({ children }: { children: ReactNode }) {
  return <GlassContext.Provider value>{children}</GlassContext.Provider>;
}

// Resep sama dengan kartu saldo (LiquidGlassCard): kaca tipis, blur kuat, kilau tepi dalam.
const GLASS_TILE =
  "border-white/40 bg-card/35 backdrop-blur-lg backdrop-saturate-150 shadow-[inset_3px_3px_3px_0_oklch(1_0_0/55%),inset_-3px_-3px_3px_0_oklch(1_0_0/35%),0_18px_40px_-16px_oklch(0.42_0.06_205/38%),0_4px_12px_-4px_oklch(0.22_0.03_205/18%)] hover:border-white/80 dark:border-white/10 dark:bg-white/5 dark:shadow-[inset_1px_1px_1px_0_oklch(1_0_0/12%),0_12px_32px_-14px_oklch(0_0_0/60%)] dark:hover:border-white/25";

// Latar sama dengan kartu saldo: gradasi teal pucat + dua bulatan buram sebagai bidang yang di-blur kaca.
export const GLASS_SECTION =
  "bg-[radial-gradient(circle_at_8%_0%,oklch(0.86_0.07_190/70%),transparent_40%),radial-gradient(circle_at_95%_100%,oklch(0.88_0.06_205/65%),transparent_45%),linear-gradient(150deg,oklch(0.97_0.02_195),oklch(0.94_0.03_190)_50%,oklch(0.96_0.02_205))] dark:bg-[radial-gradient(circle_at_8%_0%,oklch(0.4_0.07_190/50%),transparent_40%),radial-gradient(circle_at_95%_100%,oklch(0.38_0.06_205/45%),transparent_45%),linear-gradient(150deg,oklch(0.26_0.04_200),oklch(0.22_0.03_203))]";

/** Ambang "Top Seller": produk di 3 besar rak terlaris atau sudah laku ≥ 10. */
const TOP_SELLER_MIN_SOLD = 10;

/** Format ringkas ala marketplace: 280000 -> "280rb", 1500000 -> "1,5jt". */
function shortRupiah(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}jt`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}rb`;
  return String(n);
}

function MiniStars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="flex items-center gap-0.5" aria-label={`Rating toko ${value.toFixed(1)} dari 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={cn("size-3", i < full ? "fill-warning text-warning" : "text-border")}
        />
      ))}
    </span>
  );
}

/**
 * Kartu produk ringkas (muat 2 kolom di 320px).
 * - Label kiri atas: "Top Seller" (laris) dan "Official" (toko resmi Ebrystore).
 * - Harga ringkas di pita kanan bawah gambar; diskon tampil sebagai persen.
 * - Baris penjual (logo, centang, bintang): di perangkat dengan hover muncul saat
 *   kartu disorot; di layar sentuh selalu tampil karena tidak ada hover.
 */
export function ProductTile({ item, rank }: { item: ProductTileItem; rank?: number }) {
  const base = Number(item.price);
  const disc = item.discount_price == null ? NaN : Number(item.discount_price);
  const hasDiscount = Number.isFinite(disc) && disc > 0 && disc < base;
  const price = hasDiscount ? disc : base;
  const discountPct = hasDiscount ? Math.round((1 - disc / base) * 100) : 0;
  const thumb = isRenderableImageUrl(item.thumbnail_url) ? item.thumbnail_url : null;
  const sold = item.sold_count ?? 0;
  const topSeller = (rank != null && rank <= 3) || sold >= TOP_SELLER_MIN_SOLD;
  const official = Boolean(item.is_official);
  const logo = isRenderableImageUrl(item.store_logo_url) ? item.store_logo_url : null;
  const sellerName = official ? (item.store_name ?? "Ebrystore") : item.store_name;
  const hasSeller = Boolean(sellerName);
  const glass = useContext(GlassContext);

  return (
    <Link
      to="/produk/$slug"
      params={{ slug: item.slug }}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        glass ? GLASS_TILE : "border-border bg-card hover:border-foreground/30",
      )}
    >
      {/* overflow-hidden wajib: tanpa itu aspect-ratio hanya batas minimum dan
          gambar tinggi ikut memanjangkan bingkai (kartu jadi tidak sejajar). */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
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

        {/* Label status, bertumpuk di kiri atas seperti pita. */}
        <div className="absolute left-0 top-2 flex flex-col items-start gap-1">
          {rank ? (
            <span className="rounded-r-md bg-foreground px-2 py-0.5 text-[11px] font-bold tabular-nums text-background">
              #{rank}
            </span>
          ) : null}
          {topSeller ? (
            <span className="rounded-r-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
              Top Seller
            </span>
          ) : null}
          {official ? (
            <span className="rounded-r-md bg-warning px-2 py-0.5 text-[11px] font-semibold text-warning-foreground">
              Official
            </span>
          ) : null}
        </div>

        {/* Pita harga kanan bawah; nominal lengkap tetap ada untuk pembaca layar. */}
        <span className="absolute bottom-2 right-0 flex items-center gap-1 rounded-l-full bg-success py-1 pl-2.5 pr-2 text-xs font-bold text-success-foreground">
          <span aria-hidden="true">{shortRupiah(price)}</span>
          <span className="sr-only">{formatRupiah(price)}</span>
          {hasDiscount ? (
            <span className="rounded bg-success-foreground/20 px-1 text-[10px] font-semibold">
              -{discountPct}%
            </span>
          ) : null}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-2.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug transition-colors group-hover:text-accent">
          {item.name}
        </p>
        {sold ? <p className="mt-1 text-[11px] text-muted-foreground">{sold} terjual</p> : null}

        {hasSeller ? (
          /* grid-rows 0fr -> 1fr: animasi tinggi tanpa angka tetap. Hanya
             perangkat ber-hover yang menyembunyikannya lebih dulu. */
          <div className="mt-auto grid grid-rows-[1fr] transition-[grid-template-rows] duration-200 motion-reduce:transition-none [@media(hover:hover)]:grid-rows-[0fr] [@media(hover:hover)]:group-hover:grid-rows-[1fr] [@media(hover:hover)]:group-focus-visible:grid-rows-[1fr]">
            <div className="min-h-0 overflow-hidden">
              <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                {logo ? (
                  <img
                    src={logo}
                    alt=""
                    loading="lazy"
                    className="size-7 shrink-0 rounded-full border border-border object-cover"
                  />
                ) : (
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                      official ? "bg-primary text-primary-foreground" : "bg-muted",
                    )}
                  >
                    {(sellerName?.trim()[0] ?? "?").toUpperCase()}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="flex items-center gap-1">
                    <span className="truncate text-xs font-medium">{sellerName}</span>
                    {/* Centang khusus toko resmi platform agar tetap bermakna. */}
                    {official ? (
                      <BadgeCheck
                        className="size-3.5 shrink-0 text-accent"
                        aria-label="Toko resmi Ebrystore"
                      />
                    ) : null}
                  </span>
                  {official ? (
                    // Produk owner dijamin platform; bintang dari sedikit ulasan justru menyesatkan.
                    <span className="mt-0.5 block text-[10px] font-medium text-accent">
                      Dijamin Ebrystore
                    </span>
                  ) : item.store_rating ? (
                    <span className="mt-0.5 flex items-center gap-1">
                      <MiniStars value={item.store_rating} />
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {item.store_rating.toFixed(1)}
                      </span>
                    </span>
                  ) : item.store_rating === null ? (
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      Belum ada ulasan
                    </span>
                  ) : null}
                </span>
              </div>
            </div>
          </div>
        ) : null}
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
  const glass = useContext(GlassContext);
  const surface = glass ? GLASS_SECTION : "bg-card";
  if (!items.length) return null;
  const headingId = `shelf-${title.replace(/\W+/g, "-").toLowerCase()}`;
  if (layout === "grid") {
    return (
      <section aria-labelledby={headingId} className={cn("rounded-2xl py-3.5 sm:py-4", surface)}>
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
    <section aria-labelledby={headingId} className={cn("@container rounded-2xl py-3.5 sm:py-4", surface)}>
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
