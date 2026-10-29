import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquareText, Package, ShoppingBag, Star } from "lucide-react";

import { AdminError, AdminLoading } from "@/components/admin/admin-ui";
import { EmptyState } from "@/components/ebry/states";
import { getSellerSummary, listStoreReviews } from "@/lib/seller.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/seller/performa")({
  head: () => ({
    meta: [
      { title: "Performa Toko — Ebrystore" },
      { name: "description", content: "Rating dan ulasan pembeli untuk toko digital Anda." },
      { property: "og:title", content: "Performa Toko — Ebrystore" },
      { property: "og:description", content: "Pantau rating dan ulasan toko Anda." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SellerPerformance,
});

type Review = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  created_at: string;
  digital_products?: { name?: string | null } | null;
};

function shortDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function Stars({ value, size = "size-3.5" }: { value: number; size?: string }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value} dari 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(size, i <= value ? "fill-warning text-warning" : "text-muted-foreground/40")}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function SellerPerformance() {
  const fetchReviews = useServerFn(listStoreReviews);
  const fetchSummary = useServerFn(getSellerSummary);
  const [star, setStar] = useState<number | "all">("all");

  const { data, isPending, error } = useQuery({
    queryKey: ["seller-reviews"],
    queryFn: () => fetchReviews({}),
  });
  // Key sama dengan ringkasan toko, jadi biasanya sudah ada di cache.
  const summaryQ = useQuery({ queryKey: ["seller-summary"], queryFn: () => fetchSummary({}) });

  const items = ((data?.items ?? []) as Review[]);
  // Distribusi dihitung dari ulasan yang dimuat (maks. 100 terbaru).
  const dist = useMemo(() => {
    const d = [0, 0, 0, 0, 0];
    for (const r of items) {
      const v = Math.min(5, Math.max(1, Math.round(Number(r.rating))));
      d[v - 1] += 1;
    }
    return d;
  }, [items]);
  const visible = star === "all" ? items : items.filter((r) => Math.round(Number(r.rating)) === star);

  if (isPending) return <AdminLoading label="Memuat performa…" />;
  if (error || data?.error) return <AdminError message={data?.error ?? undefined} />;

  const rating = data?.rating ?? 0;
  const ratingCount = data?.ratingCount ?? 0;
  const s = summaryQ.data?.summary;
  const withText = items.filter((r) => r.body || r.title).length;
  const positive = items.length ? Math.round(((dist[3] + dist[4]) / items.length) * 100) : 0;

  const kpis = [
    { icon: ShoppingBag, label: "Total terjual", value: s ? s.soldCount : "–" },
    { icon: Package, label: "Produk tayang", value: s ? `${s.productPublished}/${s.productTotal}` : "–" },
    { icon: Star, label: "Ulasan positif (4–5★)", value: items.length ? `${positive}%` : "–" },
    { icon: MessageSquareText, label: "Ulasan bertulisan", value: withText },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold sm:text-xl">Performa toko</h1>
        <p className="mt-1 text-sm text-muted-foreground">Rating, ulasan, dan penjualan toko Anda.</p>
      </header>

      <section
        aria-label="Ringkasan rating"
        className="grid overflow-hidden rounded-2xl border border-border bg-border gap-px md:grid-cols-[240px_minmax(0,1fr)]"
      >
        <div className="flex flex-col items-center justify-center bg-card p-5 text-center">
          <p className="text-4xl font-bold tabular-nums text-foreground">
            {ratingCount > 0 ? rating.toFixed(1) : "–"}
            <span className="text-base font-medium text-muted-foreground"> / 5</span>
          </p>
          <div className="mt-2">
            <Stars value={Math.round(rating)} size="size-4" />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {ratingCount > 0 ? `${ratingCount} ulasan` : "Belum ada ulasan"}
          </p>
        </div>
        <ul className="space-y-1.5 bg-card p-5">
          {[5, 4, 3, 2, 1].map((n) => {
            const count = dist[n - 1];
            const pct = items.length ? (count / items.length) * 100 : 0;
            return (
              <li key={n} className="flex items-center gap-3 text-xs">
                <span className="flex w-8 shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
                  {n}
                  <Star className="size-3 fill-warning text-warning" aria-hidden="true" />
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
                </span>
                <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">{count}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-card p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <k.icon className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{k.label}</span>
            </p>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-foreground">{k.value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-border bg-card" aria-labelledby="ulasan-heading">
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="ulasan-heading" className="px-1 text-sm font-bold text-foreground">
            Ulasan pembeli
          </h2>
          <div
            role="tablist"
            aria-label="Filter bintang"
            className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {(["all", 5, 4, 3, 2, 1] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={star === k}
                onClick={() => setStar(k)}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  star === k
                    ? "bg-surface-selected font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-surface hover:text-foreground",
                )}
              >
                {k === "all" ? "Semua" : `${k}★`}
                <span className="text-xs tabular-nums text-muted-foreground">
                  {k === "all" ? items.length : dist[k - 1]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={Star}
            className="m-3 border-0"
            title={items.length === 0 ? "Belum ada ulasan" : "Tidak ada ulasan di filter ini"}
            description={
              items.length === 0 ? "Ulasan dari pembeli akan muncul di sini." : "Pilih filter bintang lain."
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((r) => (
              <li key={r.id} className="flex gap-3 px-4 py-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warning/15 text-sm font-bold tabular-nums text-warning-foreground">
                  {Number(r.rating)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <Stars value={Number(r.rating)} />
                    <time dateTime={r.created_at} className="text-[11px] tabular-nums text-muted-foreground">
                      {shortDate(r.created_at)}
                    </time>
                  </div>
                  {r.title ? (
                    <p className="mt-1.5 line-clamp-1 text-sm font-semibold text-foreground">{r.title}</p>
                  ) : null}
                  {r.body ? (
                    <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
                  ) : null}
                  <p className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    <Package className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{r.digital_products?.name ?? "Produk"}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
