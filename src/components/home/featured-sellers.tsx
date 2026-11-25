import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star } from "lucide-react";

import { SectionHeader } from "@/components/home/section-header";
import { listPopularSellers } from "@/lib/reviews.functions";
import { isRenderableImageUrl, optimizedMediaUrl } from "@/lib/utils";
import { OnlineDot, PresenceLabel } from "@/components/ebry/online-status";

/** Toko pilihan diurutkan dari ulasan pembeli nyata; tersembunyi bila belum ada toko berulasan. */
export function FeaturedSellers() {
  const fetchSellers = useServerFn(listPopularSellers);
  const { data } = useQuery({
    queryKey: ["popular-sellers"],
    queryFn: () => fetchSellers(),
    staleTime: 5 * 60_000,
  });
  const items = (data?.items ?? []).slice(0, 8);
  if (!items.length) return null;

  return (
    <section aria-labelledby="featured-sellers-heading">
      <SectionHeader
        id="featured-sellers-heading"
        title="Toko pilihan"
        desc="Diurutkan dari ulasan pembeli yang sudah menerima hasil."
      />
      <div className="-mx-3 overflow-x-auto overscroll-x-contain px-3 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:overflow-visible lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul
          role="list"
          className="flex snap-x snap-mandatory gap-3 lg:grid lg:grid-cols-4 lg:gap-3"
        >
          {items.map((s) => {
            const logo = isRenderableImageUrl(s.logo_url) ? s.logo_url : null;
            return (
              <li key={s.id} className="w-[15.5rem] shrink-0 snap-start lg:w-auto">
                <Link
                  to="/toko/$slug"
                  params={{ slug: s.slug }}
                  className="group relative flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-[var(--elev-1)] transition-[border-color,box-shadow] duration-150 hover:border-primary/40 hover:shadow-[var(--elev-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  <span className="relative shrink-0">
                    {logo ? (
                      <img
                        src={optimizedMediaUrl(logo, 128)}
                        alt=""
                        width={48}
                        height={48}
                        loading="lazy"
                        decoding="async"
                        className="size-12 rounded-xl border border-border object-cover"
                      />
                    ) : (
                      <span className="grid size-12 place-items-center rounded-xl bg-surface-selected font-display text-lg font-bold text-primary">
                        {s.name.trim().slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <OnlineDot
                      presence={s.presence}
                      className="-bottom-0.5 -right-0.5 size-3 sm:size-3"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground group-hover:text-primary">
                      {s.name}
                    </span>
                    <PresenceLabel presence={s.presence} className="flex text-[11px]" />
                    <span className="mt-0.5 flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                      <Star className="size-3.5 fill-warning text-warning" aria-hidden="true" />
                      <span>
                        <span className="sr-only">Rating </span>
                        {s.rating.toFixed(1)}
                      </span>
                      <span aria-hidden="true">·</span>
                      {s.reviews} ulasan
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
