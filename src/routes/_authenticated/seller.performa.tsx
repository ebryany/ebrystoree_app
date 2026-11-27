import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquareText, Package, ShoppingBag, Star } from "lucide-react";

import { AdminError, AdminLoading } from "@/components/admin/admin-ui";
import {
  SellerFilterTabs,
  SellerKpiCard,
  SellerKpiGrid,
  SellerPageHeader,
  SellerSectionCard,
} from "@/components/seller/seller-ui";
import { EmptyState } from "@/components/ebry/states";
import { getSellerSummary, listStoreReviews } from "@/lib/seller.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/seller/performa")({
  head: () => ({
    meta: [
      { title: "Performa Toko | Ebrystore" },
      { name: "description", content: "Rating dan ulasan pembeli untuk toko digital Anda." },
      { property: "og:title", content: "Performa Toko | Ebrystore" },
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

type StarFilter = "all" | 5 | 4 | 3 | 2 | 1;

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
  const [star, setStar] = useState<StarFilter>("all");

  const { data, isPending, error } = useQuery({
    queryKey: ["seller-reviews"],
    queryFn: () => fetchReviews({}),
  });
  // Key sama dengan ringkasan toko, jadi biasanya sudah ada di cache.
  const summaryQ = useQuery({ queryKey: ["seller-summary"], queryFn: () => fetchSummary({}) });

  const items = useMemo(() => (data?.items ?? []) as Review[], [data?.items]);
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

  if (isPending) return <AdminLoading label="Memuat performa..." />;
  if (error || data?.error) return <AdminError message={data?.error ?? undefined} />;

  const rating = data?.rating ?? 0;
  const ratingCount = data?.ratingCount ?? 0;
  const s = summaryQ.data?.summary;
  const withText = items.filter((r) => r.body || r.title).length;
  const positive = items.length ? Math.round(((dist[3] + dist[4]) / items.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <SellerPageHeader
        title="Performa & Ulasan"
        description="Pantau skor rating, distribusi bintang, serta masukan langsung dari pembeli toko Anda."
      />

      <SellerKpiGrid>
        <SellerKpiCard
          icon={ShoppingBag}
          label="Total terjual"
          value={s ? s.soldCount.toLocaleString("id-ID") : "-"}
          hint="Produk digital terselesaikan"
        />
        <SellerKpiCard
          icon={Package}
          label="Produk tayang"
          value={s ? `${s.productPublished}/${s.productTotal}` : "-"}
          hint="Aktif dibanding total katalog"
          to="/seller/produk"
        />
        <SellerKpiCard
          icon={Star}
          label="Ulasan positif (4-5)"
          value={items.length ? `${positive}%` : "-"}
          hint="Dari ulasan terbaru yang dimuat"
          tone="warning"
        />
        <SellerKpiCard
          icon={MessageSquareText}
          label="Ulasan bertulisan"
          value={withText.toLocaleString("id-ID")}
          hint="Menyertakan judul atau komentar"
          tone="success"
        />
      </SellerKpiGrid>

      <section
        aria-label="Ringkasan rating toko"
        className="grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-border bg-border shadow-[var(--elev-1)] md:grid-cols-[240px_minmax(0,1fr)]"
      >
        <div className="flex flex-col items-center justify-center bg-card p-6 text-center">
          <p className="font-display text-4xl font-bold tabular-nums text-foreground">
            {ratingCount > 0 ? rating.toFixed(1) : "-"}
            <span className="text-base font-medium text-muted-foreground"> / 5</span>
          </p>
          <div className="mt-2">
            <Stars value={Math.round(rating)} size="size-4" />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {ratingCount > 0 ? `${ratingCount.toLocaleString("id-ID")} ulasan` : "Belum ada ulasan"}
          </p>
        </div>
        <ul className="space-y-1 bg-card p-4 sm:p-5" aria-label="Distribusi rating, klik untuk filter">
          {([5, 4, 3, 2, 1] as const).map((n) => {
            const count = dist[n - 1];
            const pct = items.length ? (count / items.length) * 100 : 0;
            const selected = star === n;
            return (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => setStar(selected ? "all" : n)}
                  aria-pressed={selected}
                  className={cn(
                    "flex min-h-9 w-full items-center gap-3 rounded-lg px-2 text-xs transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected && "bg-surface-selected font-semibold",
                  )}
                >
                  <span className="flex w-9 shrink-0 items-center gap-1 tabular-nums text-foreground">
                    {n}
                    <Star className="size-3 fill-warning text-warning" aria-hidden="true" />
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-warning transition-[width] duration-300 motion-reduce:transition-none"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
                    {count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <SellerSectionCard
        title="Ulasan pembeli"
        description="Klik tab bintang atau baris distribusi di atas untuk menyaring ulasan."
        headingId="ulasan-heading"
        bodyClassName="p-0"
      >
        <div className="border-b border-border px-3 py-2 sm:px-4">
          <SellerFilterTabs<StarFilter>
            ariaLabel="Filter bintang ulasan"
            value={star}
            onChange={setStar}
            items={[
              { key: "all", label: "Semua", count: items.length },
              { key: 5, label: "5 Bintang", count: dist[4] },
              { key: 4, label: "4 Bintang", count: dist[3] },
              { key: 3, label: "3 Bintang", count: dist[2] },
              { key: 2, label: "2 Bintang", count: dist[1] },
              { key: 1, label: "1 Bintang", count: dist[0] },
            ]}
          />
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={Star}
            className="m-4 border-0"
            title={items.length === 0 ? "Belum ada ulasan" : "Tidak ada ulasan di filter ini"}
            description={
              items.length === 0
                ? "Ulasan dari pembeli akan muncul di sini setelah pesanan selesai."
                : "Pilih filter bintang lain untuk melihat ulasan lainnya."
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((r, index) => (
              <li key={r.id} className={cn("flex gap-3.5 px-4 py-4 sm:px-5", index >= 6 && "cv-row")}>
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning/18 text-sm font-bold tabular-nums text-warning-foreground">
                  {Number(r.rating)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <Stars value={Number(r.rating)} />
                    <time
                      dateTime={r.created_at}
                      className="text-[11px] tabular-nums text-muted-foreground"
                    >
                      {shortDate(r.created_at)}
                    </time>
                  </div>
                  {r.title ? (
                    <p className="mt-1.5 line-clamp-1 text-sm font-semibold text-foreground">
                      {r.title}
                    </p>
                  ) : null}
                  {r.body ? (
                    <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                      {r.body}
                    </p>
                  ) : null}
                  <p className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <Package className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{r.digital_products?.name ?? "Produk"}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SellerSectionCard>
    </div>
  );
}
