import { useMemo, useState } from "react";
import { createFileRoute, Link, stripSearchParams, useNavigate } from "@tanstack/react-router";
import {
  infiniteQueryOptions,
  queryOptions,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";

import { PageShell } from "@/components/page-shell";
import { RouteError } from "@/components/route-fallback";
import { Button } from "@/components/ui/button";
import { ServiceTile } from "@/components/home/service-tile";
import { CardsSkeleton, SectionEmpty, SectionError } from "@/components/home/section-states";
import { CatalogFilters } from "@/components/catalog-filters";
import { listCatalogCategories, listPublicMarketplaceServices } from "@/lib/catalog.functions";

const PAGE_SIZE = 12;
type ServiceSort = "latest" | "price_asc" | "price_desc" | "fastest" | "most_revisions";

const SERVICE_SORT_OPTIONS: Array<{ value: ServiceSort; label: string }> = [
  { value: "latest", label: "Terbaru" },
  { value: "price_asc", label: "Harga terendah" },
  { value: "price_desc", label: "Harga tertinggi" },
  { value: "fastest", label: "Pengerjaan tercepat" },
  { value: "most_revisions", label: "Revisi terbanyak" },
];

const servicesQuery = (filters: { q: string; category: string }) =>
  infiniteQueryOptions({
    queryKey: ["seller-services", "infinite", PAGE_SIZE, filters.q, filters.category],
    queryFn: ({ pageParam }) =>
      listPublicMarketplaceServices({
        data: {
          page: pageParam,
          pageSize: PAGE_SIZE,
          q: filters.q || undefined,
          category: filters.category || undefined,
        },
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

const categoriesQuery = queryOptions({
  queryKey: ["categories", "service"],
  queryFn: () => listCatalogCategories({ data: { kind: "service" } }),
  staleTime: 5 * 60_000,
});

export const Route = createFileRoute("/layanan/")({
  validateSearch: (search: {
    q?: unknown;
    kategori?: unknown;
  }): { q?: string; kategori?: string } => ({
    q: typeof search.q === "string" ? search.q.slice(0, 80) : "",
    kategori: typeof search.kategori === "string" ? search.kategori.slice(0, 80) : "",
  }),
  search: { middlewares: [stripSearchParams({ q: "", kategori: "" })] },
  loaderDeps: ({ search }) => ({ q: search.q ?? "", category: search.kategori ?? "" }),
  head: () => ({
    meta: [
      { title: "Jasa Seller | Ebrystore" },
      {
        name: "description",
        content:
          "Lihat jasa seller Ebrystore yang sudah disetujui. Bandingkan toko, harga, durasi, revisi, dan kesepakatan pekerjaan.",
      },
      { property: "og:title", content: "Jasa Seller | Ebrystore" },
      {
        property: "og:description",
        content: "Katalog jasa seller dengan harga dan kesepakatan pekerjaan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureInfiniteQueryData(servicesQuery(deps)),
      context.queryClient.ensureQueryData(categoriesQuery),
    ]);
  },
  pendingMs: 200,
  pendingComponent: () => (
    <PageShell>
      <div className="mx-auto w-full max-w-7xl px-3 py-8 sm:px-6 lg:px-8 2xl:max-w-[88rem]">
        <CardsSkeleton count={3} />
      </div>
    </PageShell>
  ),
  errorComponent: () => (
    <RouteError message="Katalog layanan belum dapat dimuat. Muat ulang halaman untuk mencoba lagi." />
  ),
  component: HalamanLayanan,
});

function HalamanLayanan() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/layanan/" });
  const filters = { q: search.q ?? "", category: search.kategori ?? "" };
  const query = useSuspenseInfiniteQuery(servicesQuery(filters));
  const categories = useSuspenseQuery(categoriesQuery);
  const [sortBy, setSortBy] = useState<ServiceSort>("latest");

  const firstPage = query.data.pages[0];
  const rawItems = useMemo(
    () => query.data.pages.flatMap((page) => page.items),
    [query.data.pages],
  );

  const items = useMemo(() => {
    if (sortBy === "latest") return rawItems;
    const sorted = [...rawItems];
    if (sortBy === "price_asc") {
      sorted.sort((a, b) => Number(a.price) - Number(b.price));
    } else if (sortBy === "price_desc") {
      sorted.sort((a, b) => Number(b.price) - Number(a.price));
    } else if (sortBy === "fastest") {
      sorted.sort((a, b) => Number(a.agreement.durationDays) - Number(b.agreement.durationDays));
    } else if (sortBy === "most_revisions") {
      sorted.sort(
        (a, b) => Number(b.agreement.revisionLimit) - Number(a.agreement.revisionLimit),
      );
    }
    return sorted;
  }, [rawItems, sortBy]);

  const isFiltered = Boolean(filters.q || filters.category);
  const nextPageFailed =
    query.isFetchNextPageError || query.data.pages.slice(1).some((page) => Boolean(page.error));

  return (
    <PageShell>
      <div className="min-h-[60vh] bg-surface">
        <div className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-6 sm:py-7 lg:px-8 2xl:max-w-[88rem]">
          <nav
            aria-label="Breadcrumb"
            className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            <Link
              to="/"
              className="flex min-h-11 items-center rounded-md hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Beranda
            </Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page" className="text-foreground">
              Jasa seller
            </span>
          </nav>

          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Jasa dari seller
              </h1>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Bandingkan harga, durasi pengerjaan, dan jatah revisi. Dana ditahan sampai hasil
                Anda terima.
              </p>
            </div>
            <Button asChild variant="outline" className="min-h-11 shrink-0 rounded-control">
              <Link to="/produk">Cari produk siap pakai</Link>
            </Button>
          </div>

          <div className="rounded-2xl border border-border bg-card p-3.5 shadow-[var(--elev-1)] sm:p-5">
            <CatalogFilters
              q={filters.q}
              category={filters.category}
              categories={categories.data.items}
              placeholder="Cari jasa seller..."
              onChange={(next) =>
                void navigate({
                  search: (prev) => ({
                    q: next.q ?? prev.q ?? "",
                    kategori: next.category ?? prev.kategori ?? "",
                  }),
                  replace: true,
                })
              }
            />

            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5 border-t border-border pt-3.5">
              <p className="text-xs text-muted-foreground">
                Diskusikan kebutuhan lewat tombol Chat sebelum memesan.
              </p>
              <div className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-2 sm:w-auto">
                <label
                  htmlFor="layanan-sort"
                  className="shrink-0 text-xs font-medium text-muted-foreground sm:text-sm"
                >
                  Urutkan
                </label>
                <select
                  id="layanan-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as ServiceSort)}
                  className="min-h-11 min-w-0 max-w-full flex-1 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none"
                >
                  {SERVICE_SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {categories.data.error ? (
              <div className="mt-3">
                <SectionError
                  message={categories.data.error}
                  onRetry={() => {
                    void categories.refetch();
                  }}
                />
              </div>
            ) : null}
          </div>

          <section aria-label="Hasil katalog layanan" className="mt-6">
            {firstPage.error ? (
              <SectionError
                message={firstPage.error}
                onRetry={() => {
                  void query.refetch();
                }}
              />
            ) : items.length === 0 ? (
              <div className="space-y-3">
                <SectionEmpty
                  title={
                    isFiltered ? "Tidak ada layanan yang cocok." : "Belum ada layanan tersedia."
                  }
                  description={
                    isFiltered
                      ? "Coba kata kunci lain atau hapus filter pencarian."
                      : "Layanan yang sudah dipublikasikan akan tampil di katalog ini."
                  }
                />
                {isFiltered ? (
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() => {
                        setSortBy("latest");
                        void navigate({ search: { q: "", kategori: "" }, replace: true });
                      }}
                    >
                      Reset semua filter
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-base font-bold sm:text-lg">
                    {isFiltered ? "Hasil pencarian" : "Pilihan jasa seller"}
                  </h2>
                  <p className="text-sm tabular-nums text-muted-foreground" aria-live="polite">
                    {items.length} layanan ditampilkan
                  </p>
                </div>
                <ul
                  role="list"
                  className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                >
                  {items.map((item) => (
                    <li key={item.id} className="min-w-0">
                      <ServiceTile item={item} />
                    </li>
                  ))}
                </ul>
                {query.isFetchingNextPage ? (
                  <div className="mt-5">
                    <CardsSkeleton count={3} />
                  </div>
                ) : null}
                {nextPageFailed ? (
                  <div className="mt-5">
                    <SectionError
                      message="Layanan berikutnya gagal dimuat. Layanan sebelumnya tetap tersedia."
                      onRetry={() => {
                        void (query.isFetchNextPageError
                          ? query.fetchNextPage()
                          : query.refetch());
                      }}
                    />
                  </div>
                ) : query.hasNextPage ? (
                  <div className="mt-6 flex justify-center">
                    <Button
                      variant="outline"
                      className="min-h-11 rounded-control px-6"
                      onClick={() => {
                        void query.fetchNextPage();
                      }}
                      disabled={query.isFetchingNextPage}
                    >
                      {query.isFetchingNextPage ? "Memuat..." : "Muat lebih banyak"}
                    </Button>
                  </div>
                ) : (
                  <p className="mt-6 text-center text-sm text-muted-foreground">
                    Semua layanan sudah ditampilkan.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </PageShell>
  );
}
