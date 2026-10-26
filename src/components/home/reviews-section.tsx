import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageSquareQuote, Quote } from "lucide-react";

import { StarRating } from "@/components/ebry/rating";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { listRecentReviews } from "@/lib/reviews.functions";

export function ReviewsSection() {
  const query = useQuery({
    queryKey: ["home-reviews"],
    queryFn: () => listRecentReviews(),
  });
  const [filter, setFilter] = useState<number | null>(null);

  const data = query.data;
  const items = data?.items ?? [];

  const distribution = useMemo(() => {
    const base: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of items) base[r.rating] = (base[r.rating] ?? 0) + 1;
    return base;
  }, [items]);

  const shown = filter ? items.filter((r) => r.rating === filter) : items;

  if (query.isLoading) {
    return (
      <section className="mx-auto w-full max-w-6xl px-4 pt-14">
        <div className="h-52 animate-pulse rounded-2xl border border-border bg-secondary/40" />
      </section>
    );
  }

  if (!items.length) return null;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pt-14" aria-labelledby="ulasan-pembeli">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-md">
            <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              <MessageSquareQuote className="size-3.5" aria-hidden="true" />
              Ulasan pembeli terverifikasi
            </span>
            <h2 id="ulasan-pembeli" className="mt-3 text-2xl font-bold tracking-tight">
              Dinilai langsung oleh pembeli Ebrystore
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Hanya pembeli dengan pesanan lunas yang bisa memberi rating, jadi angkanya nyata.
            </p>

            <div className="mt-5 flex items-center gap-4">
              <span className="text-4xl font-bold leading-none">{(data?.average ?? 0).toFixed(1)}</span>
              <div>
                <StarRating value={data?.average ?? 0} size="md" />
                <p className="mt-1 text-xs text-muted-foreground">{data?.total ?? 0} ulasan</p>
              </div>
            </div>
          </div>

          <div className="w-full max-w-sm space-y-2">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = distribution[star] ?? 0;
              const pct = items.length ? Math.round((count / items.length) * 100) : 0;
              const active = filter === star;
              return (
                <button
                  key={star}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(active ? null : star)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                    active ? "bg-accent/10" : "hover:bg-secondary",
                  )}
                >
                  <span className="w-10 shrink-0 font-medium">{star} ★</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <span
                      className="block h-full rounded-full bg-accent transition-[width] duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right text-xs text-muted-foreground">{count}</span>
                </button>
              );
            })}
            {filter ? (
              <Button variant="ghost" size="sm" onClick={() => setFilter(null)}>
                Tampilkan semua ulasan
              </Button>
            ) : null}
          </div>
        </div>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.slice(0, 6).map((review) => (
            <li
              key={review.id}
              className="group flex h-full flex-col rounded-2xl border border-border bg-background p-5 transition duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lifted"
            >
              <Quote className="size-5 text-accent/60" aria-hidden="true" />
              <StarRating value={review.rating} className="mt-3" />
              {review.title ? <p className="mt-2 text-sm font-semibold">{review.title}</p> : null}
              {review.body ? (
                <p className="mt-1 line-clamp-4 text-sm text-muted-foreground">{review.body}</p>
              ) : null}
              <div className="mt-auto pt-4">
                <p className="text-sm font-medium">{review.reviewer_name ?? "Pembeli Ebrystore"}</p>
                {review.product ? (
                  <Link
                    to="/produk/$slug"
                    params={{ slug: review.product.slug }}
                    className="mt-1 inline-block"
                  >
                    <Badge variant="secondary" className="group-hover:bg-accent/10">
                      {review.product.name}
                    </Badge>
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        {shown.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">Belum ada ulasan dengan {filter} bintang.</p>
        ) : null}
      </div>
    </section>
  );
}
