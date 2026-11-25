import { useMemo, useState } from "react";
import { createFileRoute, Link, stripSearchParams, useNavigate } from "@tanstack/react-router";
import {
  infiniteQueryOptions,
  queryOptions,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { BadgeCheck, Tag } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { RouteError } from "@/components/route-fallback";
import { Button } from "@/components/ui/button";
import { PRODUCT_GRID, ProductTile } from "@/components/ebry/product-shelf";
import { CardsSkeleton, SectionEmpty, SectionError } from "@/components/home/section-states";
import { CatalogFilters } from "@/components/catalog-filters";
import { listCatalogCategories, listProducts } from "@/lib/catalog.functions";
import { priceDetails } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;
type ProductSort = "latest" | "popular" | "price_asc" | "price_desc" | "discount_desc";

const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: "latest", label: "Terbaru" },
  { value: "popular", label: "Terlaris" },
  { value: "price_asc", label: "Harga terendah" },
  { value: "price_desc", label: "Harga tertinggi" },
  { value: "discount_desc", label: "Diskon terbesar" },
];

const productsQuery = (filters: { q: string; category: string; store: string }) =>
  infiniteQueryOptions({
    queryKey: ["products", "infinite", PAGE_SIZE, filters.q, filters.category, filters.store],
    queryFn: ({ pageParam }) =>
      listProducts({
        data: {
          page: pageParam,
          pageSize: PAGE_SIZE,
          q: filters.q || undefined,
          category: filters.category || undefined,
          store: filters.store || undefined,
        },
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

const categoriesQuery = queryOptions({
  queryKey: ["categories", "product"],
  queryFn: () => listCatalogCategories({ data: { kind: "product" } }),
  staleTime: 5 * 60_000,
});

export const Route = createFileRoute("/produk/")({
  validateSearch: (search: {
    q?: unknown;
    kategori?: unknown;
    toko?: unknown;
  }): { q?: string; kategori?: string; toko?: string } => ({
    q: typeof search.q === "string" ? search.q.slice(0, 80) : "",
    kategori: typeof search.kategori === "string" ? search.kategori.slice(0, 80) : "",
    toko: typeof search.toko === "string" ? search.toko.slice(0, 80) : "",
  }),
  search: { middlewares: [stripSearchParams({ q: "", kategori: "", toko: "" })] },
  loaderDeps: ({ search }) => ({
    q: search.q ?? "",
    category: search.kategori ?? "",
    store: search.toko ?? "",
  }),
  head: () => ({
    meta: [
      { title: "Produk Digital | Ebrystore" },
      {
        name: "description",
        content:
          "Cari produk digital berdasarkan kategori dan toko. Periksa harga serta detail produk sebelum membeli di Ebrystore.",
      },
      { property: "og:title", content: "Produk Digital | Ebrystore" },
      {
        property: "og:description",
        content: "Katalog produk digital dari berbagai toko di Ebrystore.",
      },
    ],
  }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureInfiniteQueryData(productsQuery(deps)),
      context.queryClient.ensureQueryData(categoriesQuery),
    ]);
  },
  pendingMs: 200,
  pendingComponent: () => (
    <PageShell>
      <div className="mx-auto w-full max-w-7xl px-3 py-8 sm:px-6 lg:px-8 2xl:max-w-[88rem]">
        <CardsSkeleton count={6} />
      </div>
    </PageShell>
  ),
  errorComponent: () => (
    <RouteError message="Katalog produk belum dapat dimuat. Muat ulang halaman untuk mencoba lagi." />
  ),
  component: HalamanProduk,
});

function HalamanProduk() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/produk/" });
  const filters = { q: search.q ?? "", category: search.kategori ?? "", store: search.toko ?? "" };
  const query = useSuspenseInfiniteQuery(productsQuery(filters));
  const categories = useSuspenseQuery(categoriesQuery);
  const [sortBy, setSortBy] = useState<ProductSort>("latest");
  const [onlyOfficial, setOnlyOfficial] = useState(false);
  const [onlyDiscount, setOnlyDiscount] = useState(false);

  const firstPage = query.data.pages[0];
  const rawItems = useMemo(
    () => query.data.pages.flatMap((page) => page.items),
    [query.data.pages],
  );

  const items = useMemo(() => {
    let list = rawItems;
    if (onlyOfficial) list = list.filter((item) => Boolean(item.is_official));
    if (onlyDiscount) {
      list = list.filter((item) => priceDetails(item.price, item.discount_price).hasDiscount);
    }
    if (sortBy === "latest") return list;
    const sorted = [...list];
    if (sortBy === "popular") {
      sorted.sort((a, b) => Number(b.sold_count ?? 0) - Number(a.sold_count ?? 0));
    } else if (sortBy === "price_asc") {
      sorted.sort(
        (a, b) =>
          priceDetails(a.price, a.discount_price).price -
          priceDetails(b.price, b.discount_price).price,
      );
    } else if (sortBy === "price_desc") {
      sorted.sort(
        (a, b) =>
          priceDetails(b.price, b.discount_price).price -
          priceDetails(a.price, a.discount_price).price,
      );
    } else if (sortBy === "discount_desc") {
      sorted.sort(
        (a, b) =>
          priceDetails(b.price, b.discount_price).discountPercent -
          priceDetails(a.price, a.discount_price).discountPercent,
      );
    }
    return sorted;
  }, [rawItems, onlyOfficial, onlyDiscount, sortBy]);

  const isFiltered = Boolean(
    filters.q || filters.category || filters.store || onlyOfficial || onlyDiscount,
  );
  const nextPageFailed =
    query.isFetchNextPageError || query.data.pages.slice(1).some((page) => Boolean(page.error));

  function resetAll() {
    setOnlyOfficial(false);
    setOnlyDiscount(false);
    setSortBy("latest");
    void navigate({ search: { q: "", kategori: "", toko: "" }, replace: true });
  }

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
              Produk digital
            </span>
          </nav>

          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Produk digital
              </h1>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Bandingkan produk dan toko. Cek isi, harga, serta ketentuan akses sebelum membeli.
              </p>
            </div>
            <Button asChild variant="outline" className="min-h-11 shrink-0 rounded-control">
              <Link to="/layanan">Lihat jasa seller</Link>
            </Button>
          </div>

          <div className="rounded-2xl border border-border bg-card p-3.5 shadow-[var(--elev-1)] sm:p-5">
            <CatalogFilters
              q={filters.q}
              category={filters.category}
              categories={categories.data.items}
              placeholder="Cari produk digital..."
              onChange={(next) =>
                void navigate({
                  search: (prev) => ({
                    q: next.q ?? prev.q ?? "",
                    kategori: next.category ?? prev.kategori ?? "",
                    toko: prev.toko ?? "",
                  }),
                  replace: true,
                })
              }
            />

            {/* Toolbar standar marketplace: filter cepat & urutkan hasil. */}
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5 border-t border-border pt-3.5">
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter cepat">
                <button
                  type="button"
                  aria-pressed={onlyOfficial}
                  onClick={() => setOnlyOfficial((v) => !v)}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm",
                    onlyOfficial
                      ? "border-primary bg-surface-selected text-primary"
                      : "border-border bg-card text-foreground hover:border-primary/40",
                  )}
                >
                  <BadgeCheck className="size-4 shrink-0" aria-hidden="true" />
                  <span>Official</span>
                </button>
                <button
                  type="button"
                  aria-pressed={onlyDiscount}
                  onClick={() => setOnlyDiscount((v) => !v)}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm",
                    onlyDiscount
                      ? "border-primary bg-surface-selected text-primary"
                      : "border-border bg-card text-foreground hover:border-primary/40",
                  )}
                >
                  <Tag className="size-4 shrink-0" aria-hidden="true" />
                  <span>Sedang diskon</span>
                </button>
              </div>

              <div className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-2 sm:w-auto">
                <label
                  htmlFor="produk-sort"
                  className="shrink-0 text-xs font-medium text-muted-foreground sm:text-sm"
                >
                  Urutkan
                </label>
                <select
                  id="produk-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as ProductSort)}
                  className="min-h-11 min-w-0 max-w-full flex-1 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none"
                >
                  {SORT_OPTIONS.map((opt) => (
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

            {filters.store ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <span className="min-w-0 break-words text-sm">Filter toko: {filters.store}</span>
                <Button
                  variant="ghost"
                  className="min-h-11"
                  onClick={() =>
                    void navigate({ search: (prev) => ({ ...prev, toko: "" }), replace: true })
                  }
                >
                  Hapus filter toko
                </Button>
              </div>
            ) : null}
          </div>

          <section aria-label="Hasil katalog produk" className="mt-6">
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
                  title={isFiltered ? "Tidak ada produk yang cocok." : "Belum ada produk tersedia."}
                  description={
                    isFiltered
                      ? "Coba kata kunci lain atau hapus filter pencarian."
                      : "Produk yang sudah dipublikasikan akan tampil di katalog ini."
                  }
                />
                {isFiltered ? (
                  <div className="flex justify-center">
                    <Button variant="outline" className="min-h-11" onClick={resetAll}>
                      Reset semua filter
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-base font-bold sm:text-lg">
                    {isFiltered ? "Hasil pencarian" : "Katalog produk"}
                  </h2>
                  <p className="text-sm tabular-nums text-muted-foreground" aria-live="polite">
                    {items.length} produk ditampilkan
                  </p>
                </div>
                <ul role="list" className={PRODUCT_GRID}>
                  {items.map((item) => (
                    <li key={item.id} className="min-w-0">
                      <ProductTile item={item} />
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
                      message="Produk berikutnya gagal dimuat. Produk sebelumnya tetap tersedia."
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
                    Semua produk sudah ditampilkan.
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
