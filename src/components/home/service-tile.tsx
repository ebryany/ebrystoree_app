import { Link } from "@tanstack/react-router";
import { BriefcaseBusiness, RotateCcw, ShieldCheck, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OnlineDot, PresenceLabel } from "@/components/ebry/online-status";
import { shortRupiah } from "@/components/ebry/product-shelf";
import { ServiceChatButton } from "@/components/home/service-chat-button";
import { formatRupiah } from "@/lib/format";
import { serviceMediaUrl, type PublicMarketplaceService } from "@/lib/marketplace-service";
import { isRenderableImageUrl } from "@/lib/utils";

/**
 * Kartu jasa seukuran kartu produk (ProductTile): bingkai, rasio gambar, dan
 * pita harga sama, jadi kedua grid beranda terlihat satu keluarga.
 * Bedanya mengikuti cara jasa dibeli: lama pengerjaan dan jatah revisi tampil
 * di depan, penjual (dengan status online) selalu terlihat karena pembeli
 * memilih orangnya, dan ada tombol chat untuk diskusi sebelum memesan.
 */
export function ServiceTile({ item }: { item: PublicMarketplaceService }) {
  const cover = item.media?.find((entry) => entry.kind === "image");
  const logo = isRenderableImageUrl(item.store.logo_url) ? item.store.logo_url : null;
  const presence = item.store.presence ?? null;

  return (
    <article className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/30 focus-within:border-foreground/30">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {cover ? (
          <img
            src={serviceMediaUrl(cover.path)}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
          />
        ) : (
          <span className="grid size-full place-items-center bg-surface-selected">
            <span className="flex flex-col items-center gap-1.5 text-accent">
              <BriefcaseBusiness className="size-8" aria-hidden="true" />
              <span className="text-[11px] font-medium text-muted-foreground">Jasa seller</span>
            </span>
          </span>
        )}

        <span className="absolute left-0 top-2 max-w-[85%] truncate rounded-r-md bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
          {item.category.name}
        </span>

        <span className="absolute bottom-2 right-0 rounded-l-full bg-success py-1 pl-2.5 pr-2 text-xs font-bold text-success-foreground">
          <span aria-hidden="true">{shortRupiah(item.price)}</span>
          <span className="sr-only">{formatRupiah(item.price)}</span>
        </span>
      </div>

      <div className="flex flex-1 flex-col p-2.5">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug transition-colors group-hover:text-accent">
          <Link
            to="/checkout/jasa/$id"
            params={{ id: item.id }}
            title={item.name}
            className="rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.name}
          </Link>
        </h3>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Timer className="size-3.5 shrink-0" aria-hidden="true" />
            {item.agreement.durationDays} hari
          </span>
          <span className="flex items-center gap-1">
            <RotateCcw className="size-3.5 shrink-0" aria-hidden="true" />
            {item.agreement.revisionLimit} revisi
          </span>
        </p>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-accent">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">Dana ditahan sampai selesai</span>
        </p>

        {/* Penjual di atas stretched-link supaya tautan tokonya tetap bisa diklik. */}
        <Link
          to="/toko/$slug"
          params={{ slug: item.store.slug }}
          className="relative z-10 mt-auto flex min-h-11 min-w-0 items-center gap-2 border-t border-border pt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="relative shrink-0">
            {logo ? (
              <img
                src={logo}
                alt=""
                loading="lazy"
                className="size-7 rounded-full border border-border object-cover"
              />
            ) : (
              <span className="grid size-7 place-items-center rounded-full bg-muted text-[11px] font-bold">
                {(item.store.name.trim()[0] ?? "?").toUpperCase()}
              </span>
            )}
            <OnlineDot
              presence={presence}
              className="-bottom-0.5 -right-0.5 size-2.5 sm:size-2.5"
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium hover:underline">
              {item.store.name}
            </span>
            <PresenceLabel presence={presence} className="flex max-w-full text-[10px]" />
          </span>
        </Link>
      </div>

      <div className="relative z-10 flex gap-2 px-2.5 pb-2.5">
        <ServiceChatButton
          serviceId={item.id}
          serviceName={item.name}
          storeName={item.store.name}
          iconOnly
          className="size-11 shrink-0 px-0"
        />
        <Button asChild className="min-h-11 min-w-0 flex-1 px-2">
          <Link to="/checkout/jasa/$id" params={{ id: item.id }}>
            Pesan
          </Link>
        </Button>
      </div>
    </article>
  );
}
