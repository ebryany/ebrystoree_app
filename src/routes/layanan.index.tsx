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
import { SellerServiceCard } from "@/components/home/seller-service-card";
import { CardsSkeleton, SectionEmpty, SectionError } from "@/components/home/section-states";
import { CatalogFilters } from "@/components/catalog-filters";
import { listCatalogCategories, listPublicMarketplaceServices } from "@/lib/catalog.functions";

const PAGE_SIZE = 6;
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
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
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
  const firstPage = query.data.pages[0];
  const items = query.data.pages.flatMap((page) => page.items);
  const isFiltered = Boolean(filters.q || filters.category);
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
            <span aria-current="page">Jasa seller</span>
          </nav>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Jasa dari seller</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Jasa yang sudah disetujui dari toko aktif. Periksa harga, durasi, revisi, dan
                lingkup pekerjaan sebelum memesan. Pembayaran dilakukan setelah pesanan dibuat.
              </p>
            </div>
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/produk">Cari produk siap pakai</Link>
            </Button>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <CatalogFilters
              q={filters.q}
              category={filters.category}
              categories={categories.data.items}
              placeholder="Cari jasa seller…"
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
          <section aria-label="Hasil katalog layanan" className="mt-7">
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
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() =>
                      void navigate({ search: { q: "", kategori: "" }, replace: true })
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
                    {isFiltered ? "Hasil pencarian" : "Pilihan jasa seller"}
                  </h2>
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    {items.length} layanan ditampilkan
                  </p>
                </div>
                <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => (
                    <li key={item.id} className="min-w-0">
                      <SellerServiceCard item={item} />
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
