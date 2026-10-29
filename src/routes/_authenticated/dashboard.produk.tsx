import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Package, Search } from "lucide-react";

import { InlineEmpty, PageHeader, SegmentedFilter } from "@/components/ebry/cards";
import { CardSkeleton, ErrorState } from "@/components/ebry/states";
import { PopularSellers } from "@/components/ebry/popular-sellers";
import { ProductTile, Shelf } from "@/components/ebry/product-shelf";
import { RecentlyViewedShelf } from "@/components/ebry/recently-viewed-shelf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listCatalogCategories, listProducts, listProductShelves } from "@/lib/catalog.functions";

const PAGE_SIZE = 12;

export const Route = createFileRoute("/_authenticated/dashboard/produk")({
  head: () => ({
    meta: [
      { title: "Produk Digital — Dashboard Ebrystore" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardProduk,
});

function DashboardProduk() {
  const fetchProducts = useServerFn(listProducts);
  const fetchShelves = useServerFn(listProductShelves);
  const fetchCategories = useServerFn(listCatalogCategories);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");

  // Debounce pencarian supaya tidak query tiap ketikan.
  useEffect(() => {
    const id = setTimeout(() => setQ(input.trim()), 350);
    return () => clearTimeout(id);
  }, [input]);

  const filtered = Boolean(q || category);

  const categories = useQuery({
    queryKey: ["categories", "product"],
    queryFn: () => fetchCategories({ data: { kind: "product" } }),
    staleTime: 5 * 60_000,
  });

  const shelves = useQuery({
    queryKey: ["dashboard-product-shelves"],
    queryFn: () => fetchShelves(),
    staleTime: 60_000,
    enabled: !filtered,
  });

  // Mode cari/kategori: grid 2 kolom dengan paginasi.
  const results = useInfiniteQuery({
    queryKey: ["dashboard-products", q, category],
    queryFn: ({ pageParam }) =>
      fetchProducts({
        data: {
          page: pageParam,
          pageSize: PAGE_SIZE,
          q: q || undefined,
          category: category || undefined,
        },
      }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextPage,
    enabled: filtered,
  });

  const items = results.data?.pages.flatMap((p) => p.items) ?? [];
  const filterOptions = [
    { key: "", label: "Semua" },
    ...(categories.data?.items ?? []).map((c) => ({ key: c.slug, label: c.name })),
  ];

  function pickCategory(slug: string) {
    setCategory(slug);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Package}
        title="Produk digital"
        description="Pilih produk, bayar pakai saldo Ebrystore, dan akses langsung di Produk saya."
      />

      <section className="space-y-3 rounded-2xl bg-card p-4">
        <label className="relative block">
          <span className="sr-only">Cari produk digital</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Cari produk digital…"
            className="min-h-11 pl-9"
          />
        </label>
        {filterOptions.length > 1 ? (
          <SegmentedFilter options={filterOptions} value={category} onChange={setCategory} />
        ) : null}
      </section>

      {filtered ? (
        <section aria-labelledby="dash-product-heading" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="dash-product-heading" className="text-sm font-bold text-foreground">
              Hasil
            </h2>
            {items.length ? (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {items.length} produk
              </p>
            ) : null}
          </div>
          {results.isPending ? (
            <CardSkeleton rows={3} />
          ) : results.isError || results.data?.pages[0]?.error ? (
            <ErrorState onRetry={() => void results.refetch()} />
          ) : items.length === 0 ? (
            <div className="rounded-2xl bg-card">
              <InlineEmpty icon={Package} text="Tidak ada produk yang cocok." />
            </div>
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((item) => (
                  <li key={item.id} className="min-w-0">
                    <ProductTile item={item} />
                  </li>
                ))}
              </ul>
              {results.hasNextPage ? (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={results.isFetchingNextPage}
                    onClick={() => void results.fetchNextPage()}
                  >
                    {results.isFetchingNextPage ? "Memuat…" : "Muat lebih banyak"}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : (
        <>
          <RecentlyViewedShelf />
          <PopularSellers />
          {shelves.isPending ? (
            <CardSkeleton rows={3} />
          ) : shelves.isError || shelves.data?.error ? (
            <ErrorState onRetry={() => void shelves.refetch()} />
          ) : !shelves.data?.bestSellers.length && !shelves.data?.shelves.length ? (
            <div className="rounded-2xl bg-card">
              <InlineEmpty icon={Package} text="Belum ada produk tersedia." />
            </div>
          ) : (
            <>
              {shelves.data.bestSellers.length ? (
                <Shelf title="Produk terlaris" items={shelves.data.bestSellers} ranked />
              ) : null}
              {shelves.data.shelves.map((s) => (
                <Shelf
                  key={s.slug}
                  title={s.name}
                  items={s.items}
                  onSeeAll={() => pickCategory(s.slug)}
                />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
