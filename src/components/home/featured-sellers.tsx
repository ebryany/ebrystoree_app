import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Star } from "lucide-react";

import { SectionHeader } from "@/components/home/section-header";
import { listPopularSellers } from "@/lib/reviews.functions";
import { isRenderableImageUrl } from "@/lib/utils";

/** Penjual unggulan dalam grid statis; tersembunyi bila belum ada toko berulasan. */
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
        title="Penjual unggulan"
        desc="Diurutkan dari ulasan pembeli yang sudah menerima hasil."
      />
      <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {items.map((s) => {
          const logo = isRenderableImageUrl(s.logo_url) ? s.logo_url : null;
          return (
            <li key={s.id} className="min-w-0">
              <Link
                to="/toko/$slug"
                params={{ slug: s.slug }}
                className="group flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card p-3.5 transition-[border-color,box-shadow] duration-200 hover:border-accent/40 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                {logo ? (
                  <img
                    src={logo}
                    alt=""
                    loading="lazy"
                    className="size-12 shrink-0 rounded-xl border border-border object-cover"
                  />
                ) : (
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface-selected font-display text-lg font-bold text-accent">
                    {s.name.trim().slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold group-hover:text-accent">
                    {s.name}
                  </span>
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
                <ArrowUpRight
                  className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent"
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
