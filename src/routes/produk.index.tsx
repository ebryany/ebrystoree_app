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
import { MarketplaceProductCard } from "@/components/home/catalog-cards";
import { CardsSkeleton, SectionEmpty, SectionError } from "@/components/home/section-states";
import { CatalogFilters } from "@/components/catalog-filters";
import { listCatalogCategories, listProducts } from "@/lib/catalog.functions";

const PAGE_SIZE = 12;
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
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <CardsSkeleton count={6} />
      </div>
    </PageShell>
  ),
  errorComponent: () => <RouteError message="Katalog produk belum dapat dimuat. Muat ulang halaman untuk mencoba lagi." />,
  component: HalamanProduk,
});

function HalamanProduk() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/produk/" });
  const filters = { q: search.q ?? "", category: search.kategori ?? "", store: search.toko ?? "" };
  const query = useSuspenseInfiniteQuery(productsQuery(filters));
  const categories = useSuspenseQuery(categoriesQuery);
  const firstPage = query.data.pages[0];
  const items = query.data.pages.flatMap((page) => page.items);
  const isFiltered = Boolean(filters.q || filters.category || filters.store);
  const nextPageFailed =
    query.isFetchNextPageError || query.data.pages.slice(1).some((page) => Boolean(page.error));

  return (
    <PageShell>
      <div className="min-h-[60vh] bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <nav
            aria-label="Breadcrumb"
            className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            <Link
              to="/"
              className="flex min-h-11 items-center rounded-md hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Beranda
            </Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Produk digital</span>
          </nav>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Produk digital</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Bandingkan produk dan toko. Cek isi, harga, serta ketentuan akses sebelum membeli.
              </p>
            </div>
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/layanan">Butuh pendampingan?</Link>
            </Button>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <CatalogFilters
              q={filters.q}
              category={filters.category}
              categories={categories.data.items}
              placeholder="Cari produk digital…"
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
          <section aria-label="Hasil katalog produk" className="mt-7">
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
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() =>
                      void navigate({ search: { q: "", kategori: "", toko: "" }, replace: true })
                    }
                  >
                    Reset semua filter
                  </Button>
                ) : null}
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">
                    {isFiltered ? "Hasil pencarian" : "Katalog produk"}
                  </h2>
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    {items.length} produk ditampilkan
                  </p>
                </div>
                {/* Grid berbasis lebar minimum, bukan jumlah kolom tetap.
                    Sebelumnya `xl:grid-cols-6` memaksa kartu ~170px pada
                    container 1152px, sehingga CTA hanya dapat ~70px dan
                    terpotong. `auto-fill` + `minmax(260px,1fr)` menjaga kartu
                    di rentang 260-320px dan menambah kolom hanya jika ruang
                    benar-benar cukup; baris terakhir tidak ikut melebar. */}
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-3 sm:gap-4">
                  {items.map((item) => (
                    <li key={item.id} className="flex min-w-0 flex-col">
                      <MarketplaceProductCard item={item} linkStore />
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
                        void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch());
                      }}
                    />
                  </div>
                ) : query.hasNextPage ? (
                  <div className="mt-6 flex justify-center">
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() => {
                        void query.fetchNextPage();
                      }}
                      disabled={query.isFetchingNextPage}
                    >
                      {query.isFetchingNextPage ? "Memuat…" : "Muat lebih banyak"}
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
