import { useEffect } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Clock3, ImageIcon, UserRound } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArticleContent } from "@/components/ebry/article-content";
import { ShareBar } from "@/components/ebry/share-bar";
import { HeroSkeleton } from "@/components/catalog-states";
import { RouteError, routeFailureHead } from "@/components/route-fallback";
import { getArticleBySlug } from "@/lib/articles.functions";

const articleQuery = (slug: string) =>
  queryOptions({
    queryKey: ["article", slug],
    queryFn: () => getArticleBySlug({ data: { slug } }),
  });

export const Route = createFileRoute("/artikel/$slug")({
  loader: async ({ context, params }) => {
    const result = await context.queryClient.ensureQueryData(articleQuery(params.slug));
    if (result.error) throw new Error("Artikel tidak dapat dimuat.");
    if (!result.article) throw notFound();
    return result;
  },
  head: ({ loaderData, match, matches }) => {
    const failureHead = routeFailureHead(
      [...matches, match],
      "Artikel tidak ditemukan | Ebrystore",
    );
    if (failureHead) return failureHead;
    const article = (loaderData as any)?.article;
    const title = article ? `${article.title} — Ebrystore` : "Artikel — Ebrystore";
    const description =
      article?.excerpt ?? "Panduan praktis dari Ebrystore seputar tugas kuliah dan produk digital.";
    return {
      meta: [
        { title },
        { name: "description", content: description.slice(0, 158) },
        { property: "og:title", content: title },
        { property: "og:description", content: description.slice(0, 158) },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  pendingMs: 200,
  pendingComponent: () => (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <HeroSkeleton />
      </main>
    </div>
  ),
  errorComponent: () => (
    <RouteError
      message="Artikel belum dapat dimuat. Muat ulang halaman untuk mencoba lagi."
      href="/artikel"
      linkLabel="Lihat semua artikel"
    />
  ),
  notFoundComponent: () => (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main lang="id" className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Artikel tidak ditemukan</h1>
        <p className="text-muted-foreground">
          Artikel mungkin sudah diarsipkan atau tautannya keliru.
        </p>
        <Button
          asChild
          className="min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          <Link to="/artikel">Lihat semua artikel</Link>
        </Button>
      </main>
      <SiteFooter />
    </div>
  ),
  component: ArtikelDetail,
});

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date(value));
}

function ArtikelDetail() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(articleQuery(slug));
  const article = data.article as any;
  const related = (data.related ?? []) as any[];

  // Analitik: artikel dibaca. Endpoint yang menaikkan view_count (hanya untuk
  // pengunjung non-bot), sehingga angka di dashboard berasal dari pembaca nyata.
  useEffect(() => {
    void import("@/lib/analytics-track").then(({ trackEvent }) =>
      trackEvent("article_view", `/artikel/${slug}`),
    );
  }, [slug]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <article>
          <header className="border-b border-border bg-surface">
            <div className="mx-auto w-full max-w-4xl px-4 py-8 text-center sm:py-14">
              <Link
                to="/artikel"
                className="inline-flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground transition-colors hover:text-accent"
              >
                <ArrowLeft className="size-4" aria-hidden="true" /> Jurnal Ebrystore
              </Link>
              {article.tags?.length ? (
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {article.tags.map((tag: string) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <h1 className="mx-auto mt-5 max-w-4xl text-3xl font-bold leading-tight sm:text-5xl">
                {article.title}
              </h1>
              {article.excerpt ? (
                <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                  {article.excerpt}
                </p>
              ) : null}
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <UserRound className="size-4" aria-hidden="true" />{" "}
                  {article.author_name ?? "Tim Ebrystore"}
                </span>
                <span aria-hidden="true">•</span>
                <span>{formatDate(article.published_at)}</span>
                <span aria-hidden="true">•</span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="size-4" aria-hidden="true" /> {article.reading_minutes} menit
                  baca
                </span>
              </div>
            </div>
          </header>

          <div className="mx-auto w-full max-w-5xl px-4 pt-8 sm:pt-12">
            {article.cover_url ? (
              <img
                src={article.cover_url}
                alt={article.title}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="aspect-[16/9] w-full rounded-lg border border-border object-cover shadow-card"
              />
            ) : (
              <div className="grid aspect-[16/9] w-full place-items-center rounded-lg border border-border bg-muted text-muted-foreground">
                <ImageIcon className="size-10" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 lg:grid-cols-[9rem_minmax(0,1fr)] lg:py-14">
            <aside className="hidden lg:block">
              <div className="sticky top-24 border-t border-border pt-4">
                <p className="text-xs font-bold uppercase text-muted-foreground">Sedang dibaca</p>
                <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <BookOpen className="size-4 text-accent" aria-hidden="true" />
                  {article.reading_minutes} menit
                </div>
              </div>
            </aside>
            <div className="min-w-0 max-w-3xl">
              <ArticleContent content={article.content ?? ""} />

              <div className="mt-12 border-y border-border py-6">
                <p className="text-sm font-bold">Bagikan panduan ini</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Kirim ke teman yang mungkin membutuhkannya.
                </p>
                <div className="mt-4">
                  <ShareBar title={article.title} text={article.excerpt ?? undefined} />
                </div>
              </div>
            </div>
          </div>
        </article>

        {related.length ? (
          <section className="border-t border-border bg-surface py-10 sm:py-14">
            <div className="mx-auto w-full max-w-5xl px-4">
              <p className="text-xs font-bold uppercase text-accent">Lanjut membaca</p>
              <h2 className="mt-2 text-2xl font-bold">Artikel lainnya</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {related.map((item) => (
                  <Link
                    key={item.id}
                    to="/artikel/$slug"
                    params={{ slug: item.slug }}
                    className="group rounded-lg border border-border bg-card p-5 transition-all hover:border-accent/50 hover:shadow-card"
                  >
                    <p className="font-bold leading-snug transition-colors group-hover:text-accent">
                      {item.title}
                    </p>
                    {item.excerpt ? (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {item.excerpt}
                      </p>
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
