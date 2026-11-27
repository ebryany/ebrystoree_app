import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, AtSign } from "lucide-react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThreadsProfileView } from "@/components/threads/threads-profile-view";
import { getPublicCreatorProfile } from "@/lib/social-threads.functions";

export const Route = createFileRoute("/u/$handle")({
  loader: async ({ params }) => {
    return getPublicCreatorProfile({ data: { handle: params.handle } });
  },
  head: ({ loaderData, params }) => {
    const creator = loaderData?.creator;
    const title = creator
      ? `${creator.displayName} (@${creator.handle}) | Ebrystore`
      : `@${params.handle} | Ebrystore`;
    const desc =
      creator?.bio ||
      `Profil kreator, utas Threads, Reels, dan produk digital milik @${params.handle} di Ebrystore.`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "profile" },
      ],
    };
  },
  component: PublicCreatorProfilePage,
});

/**
 * Public Creator Link-in-Bio + Storefront + Threads + Reels page (`/u/$handle`).
 * Shares the exact same Staff-grade Meta Threads Profile UI (`ThreadsProfileView`).
 */
function PublicCreatorProfilePage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const creator = data.creator;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[680px] flex-1 px-4 py-5">
        <div className="mb-3 flex items-center justify-between">
          <Link
            to={data.isAuthenticated ? "/dashboard" : "/"}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3.5 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/[0.1]"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            <span>{data.isAuthenticated ? "Kembali ke Threads" : "Jelajahi Ebrystore"}</span>
          </Link>
        </div>

        {!creator ? (
          <div className="space-y-3 rounded-3xl border border-border bg-card p-10 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-foreground/[0.06] text-muted-foreground">
              <AtSign className="size-5" aria-hidden="true" />
            </span>
            <h1 className="font-display text-base font-bold text-foreground">
              Profil kreator tidak ditemukan
            </h1>
            <Link
              to="/produk"
              className="inline-flex min-h-10 items-center rounded-xl bg-foreground px-5 text-xs font-bold text-background"
            >
              Jelajahi Katalog Ebrystore
            </Link>
          </div>
        ) : (
          <ThreadsProfileView
            creator={creator}
            threads={data.threads}
            replies={data.replies}
            reels={data.reels}
            products={data.products}
            services={data.services}
            isAuthenticated={data.isAuthenticated}
            onRefresh={() => void router.invalidate()}
          />
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
