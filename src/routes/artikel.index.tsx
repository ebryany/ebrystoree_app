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
      <main className="flex-1">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
            <div className="min-w-0">
              <div className="mb-5 flex items-center gap-3 text-xs font-bold uppercase text-accent">
                <span className="h-px w-9 bg-accent" aria-hidden="true" />
                Jurnal Ebrystore
              </div>
              <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
                Wawasan digital yang bisa langsung dipakai.
              </h1>
            </div>
            <p className="border-l-2 border-accent pl-5 text-sm leading-7 text-muted-foreground sm:text-base">
              Panduan ringkas tentang AI, produk digital, dan cara bekerja lebih efektif—ditulis dari pengalaman nyata.
            </p>
          </div>
        </header>

        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
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
                className="group grid overflow-hidden rounded-lg border border-border bg-card shadow-card transition-shadow hover:shadow-lifted lg:grid-cols-[1.4fr_1fr]"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-muted lg:aspect-auto lg:min-h-[25rem]">
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
                <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
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
                <section className="mt-14 border-t border-border pt-8">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase text-accent">Terbaru</p>
                      <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Bacaan lainnya</h2>
                    </div>
                    <BookOpen className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <div className="mt-7 grid gap-x-7 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                    {moreArticles.map((article, index) => (
                      <Link
                        key={article.id}
                        to="/artikel/$slug"
                        params={{ slug: article.slug }}
                        className="group border-t border-border pt-4"
                      >
                        <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
                          <span className="font-mono">{String(index + 2).padStart(2, "0")}</span>
                          <span>{article.reading_minutes} menit baca</span>
                        </div>
                        <div className="aspect-video overflow-hidden rounded-lg bg-muted">
                          {article.cover_url ? (
                            <img src={article.cover_url} alt={article.title} loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" />
                          ) : (
                            <div className="grid size-full place-items-center text-muted-foreground"><ImageIcon className="size-8" aria-hidden="true" /></div>
                          )}
                        </div>
                        <p className="mt-4 text-xs font-medium uppercase text-muted-foreground">{formatDate(article.published_at)}</p>
                        <h3 className="mt-2 text-lg font-bold leading-snug transition-colors group-hover:text-accent">{article.title}</h3>
                        {article.excerpt ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{article.excerpt}</p> : null}
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