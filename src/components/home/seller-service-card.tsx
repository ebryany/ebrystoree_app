import { Link } from "@tanstack/react-router";
import { Store, Timer, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ServiceChatButton } from "@/components/home/service-chat-button";
import { serviceMediaUrl, type PublicMarketplaceService } from "@/lib/marketplace-service";
import { cn } from "@/lib/utils";

const idr = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

/**
 * Kartu jasa seller di beranda.
 *
 * Dibuat ringkas supaya setara kartu produk:
 * - Isi kesepakatan (lingkup, pengecualian, hasil, kebutuhan) TIDAK lagi dibuka
 *   di dalam kartu. Accordion di kartu membuat tinggi kartu berubah-ubah dan
 *   mendorong baris di bawahnya; isinya sudah tersedia lengkap di halaman
 *   pemesanan, tempat pembeli memang perlu membacanya sebelum memutuskan.
 * - Harga dipindah ke bawah, tepat sebelum aksi, sama seperti kartu produk.
 * - Dua tombol disusun sebaris dan diletakkan di luar area isi, jadi tingginya
 *   tetap dan tidak ikut menghitung panjang teks.
 */
export function SellerServiceCard({ item }: { item: PublicMarketplaceService }) {
  const cover = item.media?.find((entry) => entry.kind === "image");

  return (
    <article
      className={cn(
        "group relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card",
        "transition-[transform,box-shadow,border-color] duration-200 ease-out motion-reduce:transition-colors motion-reduce:duration-150",
        "hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-card motion-reduce:hover:translate-y-0",
        "focus-within:-translate-y-0.5 focus-within:border-accent/50 focus-within:shadow-card motion-reduce:focus-within:translate-y-0",
      )}
    >
      {cover ? (
        <span className="block aspect-square overflow-hidden border-b border-border bg-surface-selected">
          <img
            src={serviceMediaUrl(cover.path)}
            alt={cover.alt}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        </span>
      ) : (
        /* Tanpa media: blok penanda inisial, rasio sama dengan kartu bergambar.
            Tanpa ini kartu kehilangan identitas visual dan tingginya diisi teks
            saja — terlihat seperti kartu rusak, bukan listing tanpa sampul
            (pola sama dengan fallback MarketplaceProductCard). */
        <span
          aria-hidden="true"
          className="block aspect-square border-b border-border bg-surface-selected"
        >
          <span className="flex size-full items-center justify-center">
            <span className="font-display text-3xl font-bold text-muted-foreground/40">
              {(item.name.trim()[0] ?? "?").toUpperCase()}
            </span>
          </span>
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col p-3.5">
        <p className="min-w-0 text-xs font-medium text-muted-foreground">{item.category.name}</p>

        <h3 className="mt-1 break-words text-sm font-semibold leading-snug">
          <Link
            to="/checkout/jasa/$id"
            params={{ id: item.id }}
            className="rounded-sm after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.name}
          </Link>
        </h3>

        {/* Toko berada di atas stretched-link supaya tautannya tetap bisa diklik. */}
        <Link
          to="/toko/$slug"
          params={{ slug: item.store.slug }}
          className="relative z-10 mt-1 flex w-fit min-w-0 items-center gap-1.5 text-xs text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Store className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{item.store.name}</span>
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Timer className="size-3.5" aria-hidden="true" />
            {item.agreement.durationDays} hari
          </span>
          <span className="flex items-center gap-1.5">
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {item.agreement.revisionLimit} revisi
          </span>
        </div>

        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-3">
          <span className="text-lg font-bold tabular-nums text-price sm:text-xl">
            {idr.format(item.price)}
          </span>
        </div>
      </div>

      {/* Aksi dipisah garis dan diletakkan di luar area isi, jadi tingginya tetap
          dan tidak ikut menghitung panjang teks di atasnya. */}
      <div className="flex flex-col gap-2 border-t border-border p-3 sm:flex-row">
        <ServiceChatButton
          serviceId={item.id}
          serviceName={item.name}
          storeName={item.store.name}
          className="min-h-11 min-w-0 flex-1"
        />
        <Button asChild className="min-h-11 min-w-0 flex-1">
          <Link to="/checkout/jasa/$id" params={{ id: item.id }}>
            Pesan
          </Link>
        </Button>
      </div>
    </article>
  );
}
