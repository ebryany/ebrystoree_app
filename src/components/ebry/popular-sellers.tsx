import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star } from "lucide-react";

import { listPopularSellers, type PopularSeller } from "@/lib/reviews.functions";
import { OnlineDot, PresenceLabel } from "@/components/ebry/online-status";

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="flex items-center gap-0.5" aria-label={`Rating ${value.toFixed(1)} dari 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={`size-3.5 ${i < full ? "fill-warning text-warning" : "text-border"}`}
        />
      ))}
    </span>
  );
}

function SellerItems({
  items,
  hidden,
  animated = true,
}: {
  items: PopularSeller[];
  hidden?: boolean;
  animated?: boolean;
}) {
  return (
    <ul
      aria-hidden={hidden || undefined}
      className={
        animated
          ? "flex shrink-0 items-center gap-3 pr-3 animate-infinite-scroll group-hover:[animation-play-state:paused] motion-reduce:animate-none"
          : "flex flex-wrap items-center gap-3 px-4"
      }
    >
      {items.map((s) => (
        <li key={s.id} className="shrink-0">
          <Link
            to="/toko/$slug"
            params={{ slug: s.slug }}
            tabIndex={hidden ? -1 : undefined}
            className="flex min-h-11 w-56 items-center gap-3 rounded-xl border border-border bg-background p-3 transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="relative shrink-0">
              {s.logo_url ? (
                <img
                  src={s.logo_url}
                  alt=""
                  loading="lazy"
                  className="size-10 rounded-lg border border-border object-cover"
                />
              ) : (
                <span className="grid size-10 place-items-center rounded-lg bg-muted text-sm font-bold">
                  {s.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <OnlineDot
                presence={s.presence}
                className="-bottom-0.5 -right-0.5 size-3 ring-background sm:size-3"
              />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{s.name}</span>
              <PresenceLabel presence={s.presence} className="flex text-[11px]" />
              <span className="mt-0.5 flex items-center gap-1.5">
                <Stars value={s.rating} />
                <span className="text-xs tabular-nums text-muted-foreground">
                  {s.rating.toFixed(1)} ({s.reviews})
                </span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const MARQUEE_MIN = 4;

/** Pita penjual populer berjalan tanpa henti; berhenti saat hover / reduced-motion. */
export function PopularSellers() {
  const fetchSellers = useServerFn(listPopularSellers);
  const { data } = useQuery({
    queryKey: ["popular-sellers"],
    queryFn: () => fetchSellers(),
    staleTime: 5 * 60_000,
  });
  const items = data?.items ?? [];
  if (!items.length) return null;

  return (
    <section aria-labelledby="popular-sellers-heading" className="rounded-2xl bg-card py-3.5">
      <h2
        id="popular-sellers-heading"
        className="mb-3 flex items-center gap-2 px-4 text-base font-bold text-foreground sm:px-5 sm:text-lg"
      >
        <span className="h-4 w-1 rounded-full bg-accent" aria-hidden="true" />
        Penjual populer
      </h2>
      {/* Pita berjalan hanya masuk akal bila penjual cukup banyak; sedikit
          penjual dianimasikan justru tampak terpotong dan berulang. */}
      {items.length < MARQUEE_MIN ? (
        <SellerItems items={items} animated={false} />
      ) : (
        <div className="group flex w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent_0,black_48px,black_calc(100%-48px),transparent_100%)] sm:[mask-image:linear-gradient(to_right,transparent_0,black_128px,black_calc(100%-200px),transparent_100%)]">
          <SellerItems items={items} />
          <SellerItems items={items} hidden />
        </div>
      )}
    </section>
  );
}
