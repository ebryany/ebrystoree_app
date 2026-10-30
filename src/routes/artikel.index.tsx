import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowUpRight, BookOpen, Clock3, ImageIcon } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, HeroSkeleton, ProductGridSkeleton } from "@/components/catalog-states";
import { listArticles } from "@/lib/articles.functions";
import { RouteError } from "@/components/route-fallback";

const articlesQuery = queryOptions({
  queryKey: ["articles", "public"],
  queryFn: () => listArticles({ data: { page: 0, pageSize: 24 } }),
});

export const Route = createFileRoute("/artikel/")({
  head: () => ({
    meta: [
      { title: "Artikel & Panduan — Ebrystore" },
      {
        name: "description",
        content:
          "Panduan praktis seputar tugas kuliah, produk digital, dan cara memakai layanan Ebrystore — ditulis ringkas dan bisa langsung dipakai.",
      },
      { property: "og:title", content: "Artikel & Panduan — Ebrystore" },
      { property: "og:description", content: "Kumpulan panduan praktis tugas kuliah dan produk digital dari Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(articlesQuery),
  pendingMs: 200,
  pendingComponent: () => (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-8">
        <HeroSkeleton />
        <ProductGridSkeleton count={6} />
      </main>
    </div>
  ),
  errorComponent: () => <RouteError message="Daftar artikel belum dapat dimuat. Muat ulang halaman untuk mencoba lagi." />,
  notFoundComponent: () => (
    <main lang="id" className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-12 text-center">
      <h1 className="text-xl font-semibold">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-sm text-muted-foreground">Tautan mungkin keliru atau halaman sudah tidak tersedia.</p>
      <Link to="/artikel" className="mt-6 inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">Lihat semua artikel</Link>
    </main>
  ),
  component: ArtikelIndex,
});

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value));
}

function ArtikelIndex() {
  const { data } = useSuspenseQuery(articlesQuery);
  const items = (data.items ?? []) as any[];
  const [featured, ...moreArticles] = items;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 bg-surface">
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
            <span aria-current="page">Artikel</span>
          </nav>
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Artikel & panduan</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Panduan ringkas tentang AI, produk digital, dan cara memakai Ebrystore.
            </p>
          </div>
          {data.error ? (
            <ErrorState message={data.error} />
          ) : !featured ? (
            <EmptyState
              title="Belum ada artikel terbit"
              description="Tim kami sedang menyiapkan panduan pertama. Sementara itu, jelajahi katalog produk dan layanan."
            />
          ) : (
            <>
              <Link
                key={featured.id}
                to="/artikel/$slug"
                params={{ slug: featured.slug }}
                className="group grid overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid-cols-[1.4fr_1fr]"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-muted lg:aspect-auto lg:min-h-[20rem]">
                  {featured.cover_url ? (
                    <img
                      src={featured.cover_url}
                      alt={featured.title}
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                      className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"
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
                <div className="flex flex-col justify-center p-5 sm:p-6 lg:p-8">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
                    <span>{formatDate(featured.published_at)}</span>
                    <span aria-hidden="true">•</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="size-3.5" aria-hidden="true" /> {featured.reading_minutes} menit baca
                    </span>
                  </div>
                  <h2 className="mt-5 text-2xl font-bold leading-tight transition-colors group-hover:text-accent sm:text-3xl">
                    {featured.title}
                  </h2>
                  {featured.excerpt ? (
                    <p className="mt-4 line-clamp-4 text-sm leading-7 text-muted-foreground sm:text-base">{featured.excerpt}</p>
                  ) : null}
                  <span className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-accent">
                    Baca artikel unggulan
                    <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </div>
              </Link>

              {moreArticles.length ? (
                <section className="mt-8">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 font-semibold">
                      <BookOpen className="size-4 text-muted-foreground" aria-hidden="true" />
                      Bacaan lainnya
                    </h2>
                    <p className="text-sm text-muted-foreground">{moreArticles.length} artikel</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                    {moreArticles.map((article) => (
                      <Link
                        key={article.id}
                        to="/artikel/$slug"
                        params={{ slug: article.slug }}
                        className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="aspect-video overflow-hidden bg-muted">
                          {article.cover_url ? (
                            <img src={article.cover_url} alt={article.title} loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" />
                          ) : (
                            <div className="grid size-full place-items-center text-muted-foreground"><ImageIcon className="size-8" aria-hidden="true" /></div>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col p-4">
                          <p className="text-xs text-muted-foreground">
                            {formatDate(article.published_at)} · {article.reading_minutes} menit baca
                          </p>
                          <h3 className="mt-1.5 line-clamp-2 text-base font-bold leading-snug transition-colors group-hover:text-accent">{article.title}</h3>
                          {article.excerpt ? <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-muted-foreground">{article.excerpt}</p> : null}
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}