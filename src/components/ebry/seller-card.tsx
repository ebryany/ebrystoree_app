import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OnlineDot, PresenceLabel } from "@/components/ebry/online-status";
import { useStorePresence } from "@/hooks/use-store-presence";
import type { StorePresence } from "@/lib/store-presence";
import { isRenderableImageUrl } from "@/lib/utils";

/** Tombol aksi kartu penjual: ikon di atas label di HP, sebaris mulai sm. */
export const SELLER_ACTION =
  "h-auto min-h-11 w-full min-w-0 flex-col gap-0.5 px-1.5 py-1.5 text-xs sm:flex-row sm:gap-2 sm:px-3 sm:text-sm";

export type SellerCardStore = {
  id?: string;
  name: string;
  slug: string;
  is_platform: boolean;
  logo_url: string | null;
  created_at: string;
  presence?: StorePresence | null;
};

const monthYearFmt = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });

export function joinedLabel(createdAt: string) {
  return monthYearFmt.format(new Date(createdAt));
}

export function ratingLabel(stats: { rating: number | null; reviews: number } | null | undefined) {
  return stats?.rating != null ? `${stats.rating.toFixed(1)} ★ (${stats.reviews})` : "Belum ada";
}

/**
 * Kartu "Dijual oleh" bersama untuk halaman produk dan jasa. Hanya statistik
 * nyata; slot `chat` dan `thirdAction` diisi halaman pemakai.
 */
export function SellerCard({
  store,
  stats,
  chat,
  thirdAction,
  label = "Dijual oleh",
}: {
  store: SellerCardStore;
  stats: Array<{ label: string; value: string }>;
  chat: ReactNode;
  thirdAction: ReactNode;
  label?: string;
}) {
  const presence = useStorePresence(store.id, store.presence ?? null);
  return (
    <section
      aria-labelledby="penjual-judul"
      className="mt-4 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <h2 id="penjual-judul" className="sr-only">
        Penjual
      </h2>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-4 lg:w-[460px] lg:shrink-0 lg:border-r lg:border-border lg:pr-6">
          <div className="relative shrink-0">
            {isRenderableImageUrl(store.logo_url) ? (
              <img
                src={store.logo_url!}
                alt=""
                loading="lazy"
                className="size-16 rounded-full border border-border bg-surface object-cover sm:size-20"
              />
            ) : (
              <span
                className="grid size-16 place-items-center rounded-full border border-border bg-surface-selected font-display text-2xl font-bold text-primary sm:size-20"
                aria-hidden="true"
              >
                {(store.name.trim()[0] ?? "?").toUpperCase()}
              </span>
            )}
            <OnlineDot presence={presence} />
            {store.is_platform ? (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                Official
              </span>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-base font-semibold">{store.name}</span>
              {store.is_platform ? (
                <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Toko resmi" />
              ) : null}
            </p>
            <PresenceLabel presence={presence} className="mt-0.5" />
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {chat}
              <Button asChild variant="outline" className={SELLER_ACTION}>
                <Link to="/toko/$slug" params={{ slug: store.slug }}>
                  <Store className="size-4" aria-hidden="true" /> Kunjungi
                </Link>
              </Button>
              {thirdAction}
            </div>
          </div>
        </div>

        <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="flex min-w-0 items-baseline justify-between gap-2">
              <dt className="shrink-0 text-muted-foreground">{s.label}</dt>
              <dd className="truncate text-right font-semibold tabular-nums text-price">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
