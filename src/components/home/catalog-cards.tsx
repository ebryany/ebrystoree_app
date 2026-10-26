import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Download,
  GraduationCap,
  PackageCheck,
  RefreshCcw,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Timer,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SpotLightItem } from "@/components/ui/spotlight";
import { addToCart } from "@/lib/cart-store";
import { cn, isRenderableImageUrl } from "@/lib/utils";

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export type ProductCardItem = {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  thumbnail_url: string | null;
  price: number | string;
  discount_price: number | string | null;
  store_name?: string | null;
  store_slug?: string | null;
  /** Diisi bila query menyertakan store_id; dipakai untuk mengelompokkan keranjang. */
  store_id?: string | null;
  is_official?: boolean;
};

export type ServiceCardItem = {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  thumbnail_url?: string | null;
  service_packages?: Array<{
    id: string;
    price: number | string;
    estimated_days: number | null;
    free_revisions: number | null;
    is_active: boolean | null;
  }> | null;
};

export function MarketplaceProductCard({
  item,
  variant = "default",
  spotlight = false,
  linkStore = false,
}: {
  item: ProductCardItem;
  variant?: "default" | "home";
  /** Efek cahaya mengikuti kursor. Opt-in agar halaman daftar tetap ringan. */
  spotlight?: boolean;
  /**
   * Jadikan nama toko sebagai tautan ke storefront. Dipakai halaman katalog,
   * yang sebelumnya menaruh tautan "Kunjungi toko" di luar kartu sehingga
   * terlihat lepas dari produknya.
   */
  linkStore?: boolean;
}) {
  const home = variant === "home";
  const [added, setAdded] = useState(false);
  const basePrice = Number(item.price);
  const discountPrice = Number(item.discount_price);
  const validPrice = Number.isFinite(basePrice) && basePrice >= 0;
  const hasDiscount =
    validPrice &&
    item.discount_price != null &&
    Number.isFinite(discountPrice) &&
    discountPrice > 0 &&
    discountPrice < basePrice;
  const price = hasDiscount ? discountPrice : basePrice;
  // Persen diskon dibulatkan ke bilangan bulat; hanya dihitung saat harga asal
  // benar-benar lebih besar supaya tidak ada pembagian nol atau angka negatif.
  const discountPct = hasDiscount ? Math.round((1 - discountPrice / basePrice) * 100) : 0;
  const thumbnail = isRenderableImageUrl(item.thumbnail_url) ? item.thumbnail_url : null;

  // Kerangka kartu, dari atas ke bawah:
  //   media -> identitas -> meta -> harga
  // Kartu di beranda memakai rasio media 1:1, sama seperti halaman katalog:
  // bentuknya lebih ringkas sehingga beberapa kartu muat dalam satu baris tanpa
  // terlihat besar, dan ukurannya konsisten di seluruh situs.
  const card = (
    <article
      className={cn(
        "group relative flex min-w-0 flex-col overflow-hidden border border-border bg-card @container",
        "transition-[transform,box-shadow,border-color] duration-200 ease-out motion-reduce:transition-colors motion-reduce:duration-150",
        "hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-card motion-reduce:hover:translate-y-0",
        "focus-within:-translate-y-0.5 focus-within:border-accent/50 focus-within:shadow-card motion-reduce:focus-within:translate-y-0",
        home ? "h-full rounded-xl" : "rounded-lg",
      )}
    >
      {/* Media: rasio 1:1 di semua varian. */}
      <div
        className={cn(
          "relative overflow-hidden border-b border-border bg-surface-selected",
          "aspect-square",
        )}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            width={320}
            height={213}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          // Tanpa gambar: huruf pertama nama produk sebagai penanda, bukan ikon
          // besar di tengah area kosong. Terlihat seperti kartu yang memang
          // belum punya sampul, bukan kartu yang gagal memuat gambar.
          <span className="flex size-full items-center justify-center">
            <span className="font-display text-3xl font-bold text-muted-foreground/40">
              {(item.name.trim()[0] ?? "?").toUpperCase()}
            </span>
          </span>
        )}

        {/* Badge diskon: pil tegas di sudut kanan atas, dengan latar aksen supaya
            terbaca sebagai penawaran, bukan hiasan. */}
        {hasDiscount ? (
          <span className="absolute right-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold tabular-nums text-accent-foreground shadow-sm">
            -{discountPct}%
          </span>
        ) : null}
      </div>

      <div className={cn("flex min-w-0 flex-1 flex-col", home ? "p-3.5" : "p-3")}>
        <h3
          className={cn(
            "line-clamp-2 break-words font-semibold leading-snug",
            home ? "text-sm sm:text-[0.95rem]" : "text-sm",
          )}
          title={item.name}
        >
          <Link
            to="/produk/$slug"
            params={{ slug: item.slug }}
            className="rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {item.name}
          </Link>
        </h3>

        {home && item.short_description ? (
          <p className="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">
            {item.short_description}
          </p>
        ) : null}

        {/* Meta hanya berisi toko. Label "Produk digital" dihapus karena muncul di
            semua kartu, jadi tidak membedakan apa pun dan hanya menambah baris.
            Klaim kesiapan ("siap unduh") juga tidak dipakai: file produk belum
            tentu sudah diunggah, itu urusan halaman detail.
            `relative z-10` menaikkan tautan toko di atas stretched-link judul
            (`after:inset-0`), supaya tetap bisa diklik tanpa nested anchor. */}
        {item.store_name ? (
          <p className="mt-2 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <Store className="size-3 shrink-0" aria-hidden="true" />
            {linkStore && item.store_slug ? (
              <Link
                to="/toko/$slug"
                params={{ slug: item.store_slug }}
                className="relative z-10 min-w-0 truncate rounded-sm hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={`Kunjungi ${item.store_name}`}
              >
                {item.store_name}
              </Link>
            ) : (
              <span className="truncate" title={item.store_name}>
                {item.store_name}
              </span>
            )}
            {item.is_official ? (
              <ShieldCheck className="size-3 shrink-0 text-accent" aria-hidden="true" />
            ) : null}
          </p>
        ) : null}

        {/* Blok harga: dipisah latar, bukan sekadar garis. Harga asal ditampilkan
            berdampingan (bukan bertumpuk) supaya tinggi kartu tidak bertambah. */}
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-3">
          <span
            className={cn(
              "font-bold tabular-nums text-price",
              home ? "text-lg sm:text-xl" : "text-base",
            )}
          >
            {validPrice ? idr.format(price) : "Lihat harga"}
          </span>
          {hasDiscount ? (
            <s className="text-xs tabular-nums text-muted-foreground">
              <span className="sr-only">Harga sebelumnya </span>
              {idr.format(basePrice)}
            </s>
          ) : null}
        </div>
      </div>

      {/* Dua CTA di luar area isi. Susunan ditentukan lebar KARTU (container
          query), bukan lebar viewport: pada katalog 4 kolom kartu hanya ~260px,
          dan dua tombol sebaris menyisakan ~100px per tombol sehingga label
          "Beli langsung" yang `whitespace-nowrap` terpotong. Di bawah 300px
          kartu, CTA ditumpuk; di atasnya baru sebaris. */}
      <div className="relative z-10 flex flex-col gap-2 border-t border-border p-3 @[300px]:flex-row">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-0 flex-1"
          aria-label={`Tambah ${item.name} ke keranjang`}
          onClick={() => {
            const result = addToCart({
              productId: item.id,
              slug: item.slug,
              name: item.name,
              thumbnailUrl: thumbnail,
              storeId: item.store_id ?? null,
              storeName: item.store_name ?? null,
              priceHint: validPrice ? price : 0,
            });
            if (result === "duplicate") {
              toast.info("Produk ini sudah ada di keranjang.");
              return;
            }
            if (result === "full") {
              toast.error("Keranjang penuh. Hapus beberapa item dulu.");
              return;
            }
            setAdded(true);
            window.setTimeout(() => setAdded(false), 1600);
            toast.success("Ditambahkan ke keranjang.", {
              action: {
                label: "Lihat",
                onClick: () => {
                  window.location.href = "/keranjang";
                },
              },
            });
          }}
        >
          <ShoppingCart className="size-4" aria-hidden="true" />
          <span>{added ? "Ditambahkan" : "Keranjang"}</span>
        </Button>
        <Button asChild className="min-h-11 min-w-0 flex-1">
          <Link to="/checkout/produk/$slug" params={{ slug: item.slug }}>
            Beli langsung
          </Link>
        </Button>
      </div>
    </article>
  );

  if (!spotlight) return card;

  return (
    <SpotLightItem radiusClass={home ? "rounded-xl" : "rounded-lg"} className="h-full">
      {card}
    </SpotLightItem>
  );
}

/**
 * Kartu jasa.
 *
 * Struktur disamakan dengan kartu produk: media di atas, identitas, meta,
 * lalu harga di posisi bawah. Sebelumnya kartu ini memakai tata letak mendatar
 * dengan harga di tengah, sehingga harga tidak berada di posisi yang sama dengan
 * kartu produk; itu menyulitkan pembeli membandingkan harga antar kartu.
 *
 * Harga memakai kata "Mulai" karena jasa bisa punya beberapa paket, dan yang
 * ditampilkan adalah paket termurah. Kata itu informasi, bukan hiasan: tanpa itu
 * pembeli mengira harga yang tampil adalah harga tetap.
 */
export function MarketplaceServiceCard({ item }: { item: ServiceCardItem }) {
  const packages = (item.service_packages ?? []).filter(
    (p) => p.is_active !== false && Number.isFinite(Number(p.price)) && Number(p.price) >= 0,
  );
  const cheapest = packages.length
    ? packages.reduce((a, b) => (Number(a.price) <= Number(b.price) ? a : b))
    : null;

  const thumbnail = isRenderableImageUrl(item.thumbnail_url ?? null) ? item.thumbnail_url : null;

  return (
    <article className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors duration-150 hover:border-accent/50 focus-within:border-accent/50 motion-reduce:transition-none">
      {/* Rasio media 1:1, sama seperti kartu produk, supaya kedua jenis kartu
          terlihat satu keluarga saat ditampilkan berdampingan. */}
      <div className="relative aspect-square overflow-hidden border-b border-border bg-surface-selected">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            width={320}
            height={320}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground/40">
            <GraduationCap className="size-8" aria-hidden="true" />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-3.5">
        <h3 className="line-clamp-2 break-words text-sm font-semibold leading-snug">
          <Link
            to="/layanan/$slug"
            params={{ slug: item.slug }}
            className="rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {item.name}
          </Link>
        </h3>

        {item.short_description ? (
          <p className="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">
            {item.short_description}
          </p>
        ) : null}

        {cheapest ? (
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {cheapest.estimated_days ? (
              <span className="flex items-center gap-1">
                <Timer className="size-3 shrink-0" aria-hidden="true" />
                {cheapest.estimated_days} hari
              </span>
            ) : null}
            {cheapest.free_revisions != null ? (
              <span className="flex items-center gap-1">
                <RefreshCcw className="size-3 shrink-0" aria-hidden="true" />
                {cheapest.free_revisions} revisi
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Harga di posisi yang sama seperti kartu produk: tepat di bawah isi,
            sebelum aksi. Label "Mulai" hanya muncul bila paketnya lebih dari satu. */}
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-3">
          {cheapest && packages.length > 1 ? (
            <span className="text-xs text-muted-foreground">Mulai</span>
          ) : null}
          <span className="font-bold tabular-nums text-price text-lg sm:text-xl">
            {cheapest ? idr.format(Number(cheapest.price)) : "Lihat paket"}
          </span>
        </div>
      </div>
    </article>
  );
}

export function ProductCard({ item }: { item: ProductCardItem }) {
  const hasDiscount = item.discount_price != null && Number(item.discount_price) > 0;
  const price = Number(hasDiscount ? item.discount_price : item.price);
  const discountPct = hasDiscount ? Math.round((1 - price / Number(item.price)) * 100) : 0;

  return (
    <Link
      to="/produk/$slug"
      params={{ slug: item.slug }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lifted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-secondary">
        {item.thumbnail_url ? (
          <img
            src={item.thumbnail_url}
            alt={`${item.name} — produk digital Ebrystore`}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-secondary-foreground">
            <Download className="size-8" aria-hidden="true" />
          </span>
        )}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-foreground/25 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
        {hasDiscount ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-foreground shadow-card">
            <Sparkles className="size-3" aria-hidden="true" />
            Hemat {discountPct}%
          </span>
        ) : null}
        <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1 text-[11px] font-semibold text-foreground backdrop-blur-sm">
          <PackageCheck className="size-3 text-primary" aria-hidden="true" />
          Terkirim otomatis
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug transition-colors group-hover:text-primary">
          {item.name}
        </h3>
        {item.store_name ? (
          <p className="mt-1.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <Store className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.store_name}</span>
            {item.is_official ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                <ShieldCheck className="size-3" aria-hidden="true" />
                Official
              </span>
            ) : null}
          </p>
        ) : null}
        {item.short_description ? (
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
            {item.short_description}
          </p>
        ) : null}

        <div className="mt-auto pt-4">
          <div className="flex items-end justify-between gap-3 border-t border-border/70 pt-4">
            <div className="min-w-0">
              {hasDiscount ? (
                <p className="text-xs text-muted-foreground line-through">
                  {idr.format(Number(item.price))}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Harga</p>
              )}
              <p className="truncate text-lg font-bold text-primary">{idr.format(price)}</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-3.5 py-2 text-xs font-semibold text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
              Lihat detail
              <ArrowRight
                className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function ServiceCard({ item }: { item: ServiceCardItem }) {
  const packages = (item.service_packages ?? []).filter((p) => p.is_active !== false);
  const cheapest = packages.length
    ? packages.reduce((a, b) => (Number(a.price) <= Number(b.price) ? a : b))
    : null;

  return (
    <Link
      to="/layanan/$slug"
      params={{ slug: item.slug }}
      className="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lifted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
    >
      <div className="flex items-start gap-3.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
          <Timer className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug transition-colors group-hover:text-primary">
            {item.name}
          </h3>
          {item.short_description ? (
            <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
              {item.short_description}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-secondary/60 px-4 py-3.5">
        <p className="text-xs text-muted-foreground">Mulai dari</p>
        <p className="mt-0.5 text-xl font-bold text-primary">
          {cheapest ? idr.format(Number(cheapest.price)) : "Belum ada paket"}
        </p>
      </div>

      {cheapest && (cheapest.estimated_days != null || cheapest.free_revisions != null) ? (
        <ul className="mt-3.5 flex flex-wrap gap-2">
          {cheapest.estimated_days != null ? (
            <li className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <Timer className="size-3.5 text-primary" aria-hidden="true" />
              Estimasi {cheapest.estimated_days} hari
            </li>
          ) : null}
          {cheapest.free_revisions != null ? (
            <li className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <RefreshCcw className="size-3.5 text-primary" aria-hidden="true" />
              {cheapest.free_revisions}x revisi gratis
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-auto pt-5">
        <span className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary/10 text-sm font-semibold text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
          Lihat paket layanan
          <ArrowRight
            className="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </div>
    </Link>
  );
}
