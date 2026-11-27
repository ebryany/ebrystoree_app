import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, AtSign, Share2, Sparkles, Store } from "lucide-react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThreadCard, type ThreadCardActions } from "@/components/threads/thread-card";
import { ThreadImageLightbox } from "@/components/threads/thread-lightbox";
import { ThreadShareModal } from "@/components/threads/thread-share-card";
import { getPublicThread } from "@/lib/social-threads.functions";
import type { SocialMediaItem, ThreadPostItem } from "@/lib/social-threads.shared";

export const Route = createFileRoute("/t/$id")({
  loader: async ({ params }) => {
    return getPublicThread({ data: { id: params.id } });
  },
  head: ({ loaderData }) => {
    const post = loaderData?.post;
    const authorLabel = post ? `@${post.author.handle}` : "Ebrystore Threads";
    const snippet = post?.body?.slice(0, 140) || "Lihat utas dan produk digital di Ebrystore.";
    const title = post
      ? `${authorLabel}: "${snippet.slice(0, 56)}" | Ebrystore Threads`
      : "Utas Komunitas | Ebrystore Threads";
    const ogImg =
      post?.media[0]?.url ||
      (post?.attachedCommerce?.kind === "product" ? post.attachedCommerce.thumbnailUrl : null) ||
      undefined;
    return {
      meta: [
        { title },
        { name: "description", content: snippet },
        { property: "og:title", content: title },
        { property: "og:description", content: snippet },
        { property: "og:type", content: "article" },
        ...(ogImg ? [{ property: "og:image", content: ogImg }] : []),
        { name: "twitter:card", content: ogImg ? "summary_large_image" : "summary" },
      ],
    };
  },
  component: PublicThreadPage,
});

const NOOP = () => {};

function PublicThreadPage() {
  const data = Route.useLoaderData();
  const [sharePost, setSharePost] = useState<ThreadPostItem | null>(null);
  const [lightbox, setLightbox] = useState<{ items: SocialMediaItem[]; index: number } | null>(null);

  const post = data.post;
  const ancestors = data.ancestors ?? [];
  const replies = data.replies ?? [];

  const actions: ThreadCardActions = {
    onLike: NOOP,
    onReply: NOOP,
    onRepost: NOOP,
    onQuote: NOOP,
    onBookmark: NOOP,
    onFollow: NOOP,
    onDelete: NOOP,
    onOpenLightbox: (items, index) => setLightbox({ items, index }),
    onShare: (p) => setSharePost(p),
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[660px] flex-1 px-4 py-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link
            to={data.isAuthenticated ? "/dashboard" : "/"}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-foreground transition-colors hover:bg-surface"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            <span>{data.isAuthenticated ? "Kembali ke Threads" : "Jelajahi Ebrystore"}</span>
          </Link>

          {post ? (
            <button
              type="button"
              onClick={() => setSharePost(post)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-xs font-bold text-background hover:opacity-90"
            >
              <Share2 className="size-3.5" aria-hidden="true" />
              <span>Kartu Share PNG</span>
            </button>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[var(--elev-1)]">
          {!post ? (
            <div className="space-y-3 p-10 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-surface text-muted-foreground">
                <AtSign className="size-5" aria-hidden="true" />
              </span>
              <h1 className="font-display text-base font-bold text-foreground">
                Utas tidak ditemukan
              </h1>
              <p className="text-xs text-muted-foreground">
                Tautan utas mungkin sudah dihapus oleh penulisnya.
              </p>
              <Link
                to="/produk"
                className="inline-flex min-h-10 items-center rounded-full bg-foreground px-5 text-xs font-bold text-background"
              >
                Lihat Katalog Produk Digital
              </Link>
            </div>
          ) : (
            <div>
              {ancestors.map((anc, idx) => (
                <ThreadCard
                  key={anc.id}
                  post={anc}
                  actions={actions}
                  readOnly={!data.isAuthenticated}
                  allowInlineReplies={false}
                  connectTop={idx > 0}
                  connectBottom
                />
              ))}

              <ThreadCard
                post={post}
                actions={actions}
                focal
                readOnly={!data.isAuthenticated}
                allowInlineReplies={false}
                connectTop={ancestors.length > 0}
              />

              {/* Connected replies preview */}
              <section aria-label="Balasan utas">
                <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5 text-xs sm:px-5">
                  <span className="font-bold text-muted-foreground">
                    Balasan ({replies.length})
                  </span>
                  {data.isAuthenticated ? (
                    <Link
                      to="/dashboard/thread/$id"
                      params={{ id: post.targetPostId }}
                      className="font-semibold text-accent hover:underline"
                    >
                      Buka & Balas di Aplikasi
                    </Link>
                  ) : (
                    <Link to="/auth" className="font-semibold text-accent hover:underline">
                      Masuk untuk Membalas
                    </Link>
                  )}
                </div>

                {replies.length === 0 ? (
                  <p className="px-5 py-8 text-center text-xs text-muted-foreground">
                    Belum ada balasan. Masuk ke Ebrystore untuk memulai diskusi.
                  </p>
                ) : (
                  replies.map((reply, idx) => (
                    <ThreadCard
                      key={reply.id}
                      post={reply}
                      actions={actions}
                      readOnly={!data.isAuthenticated}
                      allowInlineReplies={false}
                      connectTop={idx > 0}
                      connectBottom={idx < replies.length - 1}
                    />
                  ))
                )}
              </section>
            </div>
          )}
        </div>

        {/* Viral Creator Acquisition Banner (converts visitors from Meta Threads / X / WA!) */}
        <section
          aria-label="Ajakan bergabung untuk kreator produk digital"
          className="mt-5 rounded-2xl border border-accent/35 bg-card p-5 shadow-[var(--elev-1)]"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
              <Sparkles className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-sm font-bold text-foreground">
                Punya template, e-book, source code, atau jasa digital?
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Di Ebrystore, toko produk digital, Auto-DM ke Chat, Video Reels, dan linimasa
                Threads sudah menyatu dalam satu tempat. Pengiriman file otomatis dan pembayaran
                QRIS instan.
              </p>
              <div className="mt-3.5 flex flex-wrap gap-2">
                <Link
                  to={data.isAuthenticated ? "/seller" : "/auth"}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-xs font-bold text-background hover:opacity-90"
                >
                  <Store className="size-3.5" aria-hidden="true" />
                  <span>Mulai Jualan Gratis</span>
                </Link>
                <Link
                  to="/produk"
                  className="inline-flex min-h-10 items-center rounded-full border border-border bg-surface px-4 text-xs font-semibold text-foreground hover:bg-surface-selected"
                >
                  Jelajahi Katalog
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />

      <ThreadShareModal post={sharePost} onClose={() => setSharePost(null)} />
      {lightbox ? (
        <ThreadImageLightbox
          items={lightbox.items}
          index={lightbox.index}
          onIndexChange={(next) => setLightbox((cur) => (cur ? { ...cur, index: next } : null))}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}
