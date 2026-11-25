import { Link } from "@tanstack/react-router";
import { BriefcaseBusiness, RotateCcw, ShieldCheck, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OnlineDot, PresenceLabel } from "@/components/ebry/online-status";
import { formatCategoryLabel } from "@/components/home/category-rail";
import { ServiceChatButton } from "@/components/home/service-chat-button";
import { formatRupiah } from "@/lib/format";
import { serviceMediaUrl, type PublicMarketplaceService } from "@/lib/marketplace-service";
import { isRenderableImageUrl, optimizedMediaUrl } from "@/lib/utils";

/**
 * Kartu jasa seller satu bahasa visual dengan ProductTile:
 * - Foto cover dengan label kategori kontras tinggi di kiri atas.
 * - Judul, harga penuh dalam format Rupiah, lama pengerjaan, revisi, dan jaminan dana ditahan.
 * - Identitas toko + status online serta tombol Chat & Pesan langsung aktif di atas stretched-link.
 */
export function ServiceTile({ item }: { item: PublicMarketplaceService }) {
  const cover = item.media?.find((entry) => entry.kind === "image");
  const logo = isRenderableImageUrl(item.store.logo_url) ? item.store.logo_url : null;
  const presence = item.store.presence ?? null;
  const categoryLabel = formatCategoryLabel(item.category.name);

  return (
    <article className="group relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[var(--elev-1)] transition-[border-color,box-shadow] duration-150 hover:border-primary/40 hover:shadow-[var(--elev-2)] focus-within:border-primary/40 motion-reduce:transition-none">
      <div className="relative aspect-[16/10] overflow-hidden border-b border-border/60 bg-surface-selected">
        {cover ? (
          <img
            src={optimizedMediaUrl(serviceMediaUrl(cover.path), 480)}
            alt=""
            width={480}
            height={300}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <span className="grid size-full place-items-center bg-surface-selected">
            <span className="flex flex-col items-center gap-1.5 text-primary">
              <BriefcaseBusiness className="size-8" aria-hidden="true" />
              <span className="text-[11px] font-medium text-muted-foreground">Jasa seller</span>
            </span>
          </span>
        )}

        <span className="absolute left-2.5 top-2.5 max-w-[calc(100%-1.25rem)] truncate rounded-md border border-border/80 bg-card/95 px-2 py-0.5 text-[11px] font-semibold text-foreground shadow-sm">
          {categoryLabel}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
          <Link
            to="/jasa/$id"
            params={{ id: item.id }}
            title={item.name}
            className="rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.name}
          </Link>
        </h3>

        <p className="mt-1.5 text-base font-bold tabular-nums text-price">
          {formatRupiah(item.price)}
        </p>

        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-0.5 font-medium text-foreground">
            <Timer className="size-3 shrink-0 text-primary" aria-hidden="true" />
            {item.agreement.durationDays} hari
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-0.5 font-medium text-foreground">
            <RotateCcw className="size-3 shrink-0 text-primary" aria-hidden="true" />
            {item.agreement.revisionLimit} revisi
          </span>
        </p>

        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-primary">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">Dana ditahan sampai selesai</span>
        </p>

        {/* Tautan toko dinaikkan di atas stretched-link agar bisa diklik terpisah. */}
        <Link
          to="/toko/$slug"
          params={{ slug: item.store.slug }}
          className="relative z-10 mt-auto flex min-h-11 min-w-0 items-center gap-2 border-t border-border/70 pt-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="relative shrink-0">
            {logo ? (
              <img
                src={optimizedMediaUrl(logo, 96)}
                alt=""
                width={28}
                height={28}
                loading="lazy"
                decoding="async"
                className="size-7 rounded-full border border-border object-cover"
              />
            ) : (
              <span className="grid size-7 place-items-center rounded-full bg-surface-selected text-[11px] font-bold text-primary">
                {(item.store.name.trim()[0] ?? "?").toUpperCase()}
              </span>
            )}
            <OnlineDot
              presence={presence}
              className="-bottom-0.5 -right-0.5 size-2.5 sm:size-2.5"
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-foreground hover:underline">
              {item.store.name}
            </span>
            <PresenceLabel presence={presence} className="flex max-w-full text-[10px]" />
          </span>
        </Link>
      </div>

      <div className="relative z-10 flex gap-2 px-3 pb-3">
        <ServiceChatButton
          serviceId={item.id}
          serviceName={item.name}
          storeName={item.store.name}
          iconOnly
          className="size-11 shrink-0 px-0"
        />
        <Button asChild className="min-h-11 min-w-0 flex-1 px-3">
          <Link to="/checkout/jasa/$id" params={{ id: item.id }}>
            Pesan jasa
          </Link>
        </Button>
      </div>
    </article>
  );
}
