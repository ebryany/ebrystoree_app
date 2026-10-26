import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star } from "lucide-react";

import { AdminError, AdminLoading } from "@/components/admin/admin-ui";
import { InlineEmpty } from "@/components/ebry/cards";
import { listStoreReviews } from "@/lib/seller.functions";

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

function shortDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value} dari 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={
            i <= value ? "size-3.5 fill-warning text-warning" : "size-3.5 text-muted-foreground/40"
          }
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function SellerPerformance() {
  const fetchReviews = useServerFn(listStoreReviews);
  const { data, isPending, error } = useQuery({
    queryKey: ["seller-reviews"],
    queryFn: () => fetchReviews({}),
  });

  if (isPending) return <AdminLoading label="Memuat performa…" />;
  if (error || data?.error) return <AdminError message={data?.error ?? undefined} />;

  const items: any[] = data?.items ?? [];
  const rating = data?.rating ?? 0;
  const ratingCount = data?.ratingCount ?? 0;

  return (
    <div className="space-y-4">
      <section
        className="rounded-2xl border border-border bg-card p-5"
        aria-label="Ringkasan rating"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Rating toko
        </p>
        {ratingCount > 0 ? (
          <>
            <p className="mt-1.5 text-3xl font-bold tabular-nums text-foreground">{rating}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <Stars value={Math.round(rating)} />
              <span className="text-xs text-muted-foreground">{ratingCount} ulasan</span>
            </div>
          </>
        ) : (
          <p className="mt-1.5 text-sm text-muted-foreground">Belum ada ulasan untuk toko Anda.</p>
        )}
      </section>

      <section
        className="rounded-2xl border border-border bg-card"
        aria-labelledby="ulasan-heading"
      >
        <h2
          id="ulasan-heading"
          className="border-b border-border px-4 py-3 text-sm font-bold text-foreground"
        >
          Ulasan terbaru
        </h2>

        {items.length === 0 ? (
          <InlineEmpty icon={Star} text="Ulasan dari pembeli akan muncul di sini." />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((r: any) => (
              <li key={r.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Stars value={Number(r.rating)} />
                    {r.title ? (
                      <p className="mt-1.5 line-clamp-1 text-sm font-semibold text-foreground">
                        {r.title}
                      </p>
                    ) : null}
                    {r.body ? (
                      <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                        {r.body}
                      </p>
                    ) : null}
                    <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                      {r.digital_products?.name ?? "Produk"} · {shortDate(r.created_at)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
