import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShoppingCart, Store } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { addToCart } from "@/lib/cart-store";
import type { ProductCardItem } from "@/components/home/catalog-cards";
import { cn, isRenderableImageUrl } from "@/lib/utils";

/**
 * Kartu produk compact khusus rail horizontal homepage di mobile.
 *
 * Terpisah dari MarketplaceProductCard (yang dipakai katalog, toko, dan
 * beranda desktop) supaya perubahan mobile-homepage ini tidak menyentuh
 * halaman lain. Perbedaan dengan kartu besar:
 * - Gambar rasio 4:3 (kartu besar 1:1) agar tinggi rail hemat.
 * - Tombol keranjang jadi ikon 44px dengan accessible label; "Beli langsung"
 *   tetap berlabel penuh dan dominan.
 * - Tipografi lebih kecil (judul 12px, harga 14px) namun tetap terbaca.
 *
 * Seluruh aksi identik dengan kartu besar: addToCart dengan toast yang sama,
 * stretched-link ke /produk/$slug, badge diskon dari data nyata.
 */
export function CompactProductCard({ item }: { item: ProductCardItem }) {
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
  const discountPct = hasDiscount ? Math.round((1 - discountPrice / basePrice) * 100) : 0;
  const thumbnail = isRenderableImageUrl(item.thumbnail_url) ? item.thumbnail_url : null;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Media 4:3: lebih pendek dari kartu desktop supaya rail hemat ruang. */}
      <div className="relative aspect-[4/3] overflow-hidden border-b border-border bg-surface-selected">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center">
            <span className="font-display text-2xl font-bold text-muted-foreground/40">
              {(item.name.trim()[0] ?? "?").toUpperCase()}
            </span>
          </span>
        )}
        {hasDiscount ? (
          <span className="absolute right-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold tabular-nums text-accent-foreground shadow-sm">
            -{discountPct}%
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-2.5">
        <h3
          className="line-clamp-2 break-words text-xs font-semibold leading-snug text-foreground"
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

        {item.store_name ? (
          <p className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Store className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate" title={item.store_name}>
              {item.store_name}
            </span>
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-2">
          <span className="text-sm font-bold tabular-nums text-price">
            {validPrice
              ? new Intl.NumberFormat("id-ID", {
                  style: "currency",
                  currency: "IDR",
                  maximumFractionDigits: 0,
                }).format(price)
              : "Lihat harga"}
          </span>
          {hasDiscount ? (
            <s className="text-[11px] tabular-nums text-muted-foreground">
              <span className="sr-only">Harga sebelumnya </span>
              {new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                maximumFractionDigits: 0,
              }).format(basePrice)}
            </s>
          ) : null}
        </div>
      </div>

      {/* Aksi: keranjang jadi ikon 44px (accessible label), beli tetap berlabel.
          Kontainer relative z-10 di atas stretched-link. */}
      <div className="relative z-10 flex items-center gap-1.5 border-t border-border p-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
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
        </Button>
        <Button asChild className={cn("min-h-11 min-w-0 flex-1 text-sm")}>
          <Link to="/checkout/produk/$slug" params={{ slug: item.slug }}>
            Beli langsung
          </Link>
        </Button>
      </div>
    </article>
  );
}
