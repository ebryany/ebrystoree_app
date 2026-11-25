import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, BookOpen, Clock3, ImageIcon, Search, X } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EmptyState,
  ErrorState,
  HeroSkeleton,
  ProductGridSkeleton,
} from "@/components/catalog-states";
import { listArticles } from "@/lib/articles.functions";
import { RouteError } from "@/components/route-fallback";
import { SecurityErrorView } from "@/components/security-error-page";

const articlesQuery = queryOptions({
  queryKey: ["articles", "public"],
  queryFn: () => listArticles({ data: { page: 0, pageSize: 24 } }),
});

export const Route = createFileRoute("/artikel/")({
  head: () => ({
    meta: [
      { title: "Artikel & Panduan | Ebrystore" },
      {
        name: "description",
        content:
          "Panduan praktis seputar produk digital, jasa seller, dan cara memakai layanan Ebrystore. Ditulis ringkas dan bisa langsung dipakai.",
      },
      { property: "og:title", content: "Artikel & Panduan | Ebrystore" },
      {
        property: "og:description",
        content: "Kumpulan panduan praktis produk digital dan layanan dari Ebrystore.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(articlesQuery),
  pendingMs: 200,
  pendingComponent: () => (
    <PageShell>
      <div className="min-h-[60vh] bg-surface">
        <div className="mx-auto w-full max-w-7xl space-y-8 px-3 py-8 sm:px-6 lg:px-8 2xl:max-w-[88rem]">
          <HeroSkeleton />
          <ProductGridSkeleton count={6} />
        </div>
      </div>
    </PageShell>
  ),
  errorComponent: () => (
    <RouteError message="Daftar artikel belum dapat dimuat. Muat ulang halaman untuk mencoba lagi." />
  ),
  notFoundComponent: () => (
    <SecurityErrorView
      status={404}
      title="Halaman tidak ditemukan."
      description="Tautan yang Anda buka mungkin keliru atau halaman sudah tidak tersedia."
      backTo="/artikel"
      backLabel="Lihat semua artikel"
    />
  ),
  component: ArtikelIndex,
});

type ArticleItem = {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  cover_url?: string | null;
  published_at?: string | null;
  reading_minutes?: number | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value));
}

function ArtikelIndex() {
  const { data } = useSuspenseQuery(articlesQuery);
  const [query, setQuery] = useState("");
  const items = useMemo(() => (data.items ?? []) as ArticleItem[], [data.items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((article) =>
      `${article.title} ${article.excerpt ?? ""}`.toLowerCase().includes(q),
    );
  }, [items, query]);

  const [featured, ...moreArticles] = filtered;

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
              Artikel
            </span>
          </nav>

          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Artikel & panduan
              </h1>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Panduan ringkas tentang AI, produk digital, dan cara memakai Ebrystore.
              </p>
            </div>

            {items.length > 0 ? (
              <div role="search" className="relative w-full min-w-0 sm:max-w-xs">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari artikel..."
                  aria-label="Cari artikel"
                  className="h-11 rounded-xl pl-9 pr-11 text-sm"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Hapus pencarian artikel"
                    className="absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {data.error ? (
            <ErrorState message={data.error} />
          ) : items.length === 0 ? (
            <div className="space-y-4">
              <EmptyState
                title="Belum ada artikel terbit"
                description="Tim kami sedang menyiapkan panduan pertama. Sementara itu, Anda dapat menjelajahi produk digital, jasa seller, atau membaca panduan cepat di Pusat bantuan."
                action={
                  <Button asChild className="min-h-11 rounded-control px-5">
                    <Link to="/produk">
                      Jelajahi produk
                      <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
                    </Link>
                  </Button>
                }
                secondaryAction={
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button asChild variant="outline" className="min-h-11 rounded-control px-5">
                      <Link to="/layanan">Lihat jasa seller</Link>
                    </Button>
                    <Button asChild variant="ghost" className="min-h-11 rounded-control px-4">
                      <Link to="/bantuan">Buka pusat bantuan</Link>
                    </Button>
                  </div>
                }
              />
            </div>
          ) : !featured ? (
            <EmptyState
              title="Artikel tidak ditemukan"
              description={`Belum ada artikel yang cocok dengan kata kunci "${query.trim()}".`}
              action={
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 rounded-control"
                  onClick={() => setQuery("")}
                >
                  Tampilkan semua artikel
                </Button>
              }
            />
          ) : (
            <>
              <Link
                key={featured.id}
                to="/artikel/$slug"
                params={{ slug: featured.slug }}
                className="group grid overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--elev-1)] transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid-cols-[1.35fr_1fr]"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-muted lg:aspect-auto lg:min-h-[20rem]">
                  {featured.cover_url ? (
                    <img
                      src={featured.cover_url}
                      alt={featured.title}
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.025] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                  ) : (
                    <div className="grid size-full place-items-center text-muted-foreground">
                      <ImageIcon className="size-10" aria-hidden="true" />
                    </div>
                  )}
                  <Badge className="absolute left-4 top-4 border-0 bg-background/90 text-foreground backdrop-blur-sm hover:bg-background/90">
                    Pilihan editor
                  </Badge>
                </div>
                <div className="flex min-w-0 flex-col justify-center p-5 sm:p-6 lg:p-8">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
                    <span>{formatDate(featured.published_at)}</span>
                    {featured.reading_minutes ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="size-3.5" aria-hidden="true" />{" "}
                          {featured.reading_minutes} menit baca
                        </span>
                      </>
                    ) : null}
                  </div>
                  <h2 className="mt-4 font-display text-2xl font-bold leading-tight transition-colors group-hover:text-primary sm:text-3xl">
                    {featured.title}
                  </h2>
                  {featured.excerpt ? (
                    <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                      {featured.excerpt}
                    </p>
                  ) : null}
                  <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary">
                    Baca artikel unggulan
                    <ArrowUpRight
                      className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </span>
                </div>
              </Link>

              {moreArticles.length ? (
                <section className="mt-8">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 font-display text-base font-bold sm:text-lg">
                      <BookOpen className="size-4 text-primary" aria-hidden="true" />
                      Bacaan lainnya
                    </h2>
                    <p className="text-sm tabular-nums text-muted-foreground">
                      {moreArticles.length} artikel
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                    {moreArticles.map((article) => (
                      <Link
                        key={article.id}
                        to="/artikel/$slug"
                        params={{ slug: article.slug }}
                        className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[var(--elev-1)] transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="aspect-video overflow-hidden bg-muted">
                          {article.cover_url ? (
                            <img
                              src={article.cover_url}
                              alt={article.title}
                              loading="lazy"
                              decoding="async"
                              className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.035] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                            />
                          ) : (
                            <div className="grid size-full place-items-center text-muted-foreground">
                              <ImageIcon className="size-8" aria-hidden="true" />
                            </div>
                          )}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col p-4">
                          <p className="text-xs text-muted-foreground">
                            {formatDate(article.published_at)}
                            {article.reading_minutes
                              ? ` · ${article.reading_minutes} menit baca`
                              : ""}
                          </p>
                          <h3 className="mt-1.5 line-clamp-2 text-base font-bold leading-snug transition-colors group-hover:text-primary">
                            {article.title}
                          </h3>
                          {article.excerpt ? (
                            <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground">
                              {article.excerpt}
                            </p>
                          ) : null}
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
