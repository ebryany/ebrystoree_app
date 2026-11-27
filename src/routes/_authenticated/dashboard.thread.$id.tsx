import { useCallback, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { AuthorAvatar, ThreadCard, type ThreadCardActions } from "@/components/threads/thread-card";
import { ThreadComposerModal } from "@/components/threads/thread-composer";
import { ThreadImageLightbox } from "@/components/threads/thread-lightbox";
import { ThreadShareModal } from "@/components/threads/thread-share-card";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import {
  deleteThreadPost,
  getSocialBootstrap,
  getThreadDetail,
  reportThreadPost,
  toggleThreadBookmark,
  toggleThreadLike,
  toggleThreadRepost,
  toggleUserFollow,
} from "@/lib/social-threads.functions";
import type {
  SocialMediaItem,
  ThreadPostItem,
  ThreadReportReason,
} from "@/lib/social-threads.shared";

export const Route = createFileRoute("/_authenticated/dashboard/thread/$id")({
  head: () => ({
    meta: [
      { title: "Detail Utas | Ebrystore Threads" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ThreadDetailPage,
});

function ThreadDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ThreadPostItem | null>(null);
  const [quoteTarget, setQuoteTarget] = useState<ThreadPostItem | null>(null);
  const [sharePost, setSharePost] = useState<ThreadPostItem | null>(null);
  const [lightbox, setLightbox] = useState<{ items: SocialMediaItem[]; index: number } | null>(null);

  const detailFn = useServerFn(getThreadDetail);
  const bootstrapFn = useServerFn(getSocialBootstrap);
  const likeFn = useServerFn(toggleThreadLike);
  const repostFn = useServerFn(toggleThreadRepost);
  const bookmarkFn = useServerFn(toggleThreadBookmark);
  const followFn = useServerFn(toggleUserFollow);
  const deleteFn = useServerFn(deleteThreadPost);
  const reportFn = useServerFn(reportThreadPost);

  const detailKey = useMemo(() => ["thread-detail", id], [id]);

  const detailQ = useQuery({
    queryKey: detailKey,
    queryFn: () => detailFn({ data: { id } }),
  });

  const bootstrapQ = useQuery({
    queryKey: ["social-bootstrap"],
    queryFn: () => bootstrapFn({}),
    staleTime: 60_000,
  });

  useRealtimeRefresh({
    channel: `thread-detail-${id}`,
    tables: ["social_posts"],
    keys: [detailKey],
    debounceMs: 250,
  });

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: detailKey });
    void queryClient.invalidateQueries({ queryKey: ["threads-feed"] });
  }, [detailKey, queryClient]);

  const actions: ThreadCardActions = useMemo(
    () => ({
      onLike: (p) => {
        void likeFn({ data: { postId: p.targetPostId } }).then((res) => {
          if (!res.ok) toast.error(res.error);
          invalidateAll();
        });
      },
      onReply: (p) => {
        setQuoteTarget(null);
        setReplyTarget(p);
        setComposeOpen(true);
      },
      onRepost: (p) => {
        void repostFn({ data: { postId: p.targetPostId } }).then((res) => {
          if (!res.ok) toast.error(res.error);
          else toast.success(res.reposted ? "Diposting ulang." : "Posting ulang dibatalkan.");
          invalidateAll();
        });
      },
      onQuote: (p) => {
        setReplyTarget(null);
        setQuoteTarget(p);
        setComposeOpen(true);
      },
      onBookmark: (p) => {
        void bookmarkFn({ data: { postId: p.targetPostId } }).then((res) => {
          if (!res.ok) toast.error(res.error);
          else toast.success(res.bookmarked ? "Utas disimpan." : "Dihapus dari tersimpan.");
          invalidateAll();
        });
      },
      onFollow: (uid) => {
        void followFn({ data: { targetUserId: uid } }).then((res) => {
          if (!res.ok) toast.error(res.error);
          else toast.success(res.following ? "Sekarang mengikuti." : "Berhenti mengikuti.");
          invalidateAll();
          void queryClient.invalidateQueries({ queryKey: ["social-bootstrap"] });
        });
      },
      onDelete: (pid) => {
        void deleteFn({ data: { postId: pid } }).then((res) => {
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Utas dihapus.");
          void queryClient.invalidateQueries({ queryKey: ["threads-feed"] });
          if (pid === id) {
            void navigate({ to: "/dashboard" });
          } else {
            invalidateAll();
          }
        });
      },
      onReport: (pid: string, reason: ThreadReportReason) => {
        void reportFn({ data: { postId: pid, reason, details: "" } }).then((res) => {
          if (!res.ok) toast.error(res.error);
          else toast.success("Laporan diterima.");
        });
      },
      onOpenLightbox: (items, index) => setLightbox({ items, index }),
      onShare: (p) => setSharePost(p),
    }),
    [
      bookmarkFn,
      deleteFn,
      followFn,
      id,
      invalidateAll,
      likeFn,
      navigate,
      queryClient,
      reportFn,
      repostFn,
    ],
  );

  const me = bootstrapQ.data?.me ?? null;
  const post = detailQ.data?.post ?? null;
  const ancestors = detailQ.data?.ancestors ?? [];
  const replies = detailQ.data?.replies ?? [];

  return (
    <div className="mx-auto w-full max-w-[640px]">
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[var(--elev-1)]">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/80 bg-card/95 px-4 py-3 backdrop-blur-md">
          <Link
            to="/dashboard"
            aria-label="Kembali ke Threads"
            className="grid size-9 place-items-center rounded-full text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
          <h1 className="font-display text-base font-bold text-foreground">Utas</h1>
        </header>

        {detailQ.isPending ? (
          <div className="flex items-center justify-center py-16 text-xs text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
            Memuat utas...
          </div>
        ) : !post ? (
          <div className="space-y-3 p-8 text-center">
            <p className="text-sm font-semibold text-foreground">Utas tidak ditemukan</p>
            <p className="text-xs text-muted-foreground">
              Utas mungkin telah dihapus oleh penulisnya.
            </p>
            <Link
              to="/dashboard"
              className="inline-flex min-h-10 items-center rounded-full bg-foreground px-4 text-xs font-bold text-background"
            >
              Kembali ke Linimasa
            </Link>
          </div>
        ) : (
          <div>
            {/* Ancestor thread chain */}
            {ancestors.map((anc, idx) => (
              <ThreadCard
                key={anc.id}
                post={anc}
                actions={actions}
                connectTop={idx > 0}
                connectBottom
              />
            ))}

            {/* Focal thread post */}
            <ThreadCard
              post={post}
              actions={actions}
              focal
              connectTop={ancestors.length > 0}
            />

            {/* Quick inline reply trigger */}
            <div className="border-b border-border/80 bg-surface/35 px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => {
                  setQuoteTarget(null);
                  setReplyTarget(post);
                  setComposeOpen(true);
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl text-left transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <AuthorAvatar
                  displayName={me?.displayName ?? "Anda"}
                  avatarUrl={me?.avatarUrl ?? null}
                  size="sm"
                />
                <span className="flex-1 text-sm text-muted-foreground">
                  Balas @{post.author.handle}...
                </span>
                <span className="inline-flex min-h-8 items-center gap-1 rounded-full bg-foreground px-3.5 text-xs font-bold text-background">
                  <MessageCircle className="size-3.5" aria-hidden="true" />
                  Balas
                </span>
              </button>
            </div>

            {/* Chronological replies */}
            <section aria-label="Balasan utas">
              <div className="border-b border-border/60 px-4 py-2.5 text-xs font-bold text-muted-foreground sm:px-5">
                Balasan ({replies.length})
              </div>
              {replies.length === 0 ? (
                <p className="px-5 py-10 text-center text-xs text-muted-foreground">
                  Belum ada balasan. Jadilah yang pertama menanggapi utas ini.
                </p>
              ) : (
                replies.map((reply: ThreadPostItem, rIdx: number) => (
                  <ThreadCard
                    key={reply.id}
                    post={reply}
                    actions={actions}
                    viewer={me}
                    connectTop={rIdx > 0}
                    connectBottom={rIdx < replies.length - 1}
                  />
                ))
              )}
            </section>
          </div>
        )}
      </div>

      <ThreadComposerModal
        open={composeOpen}
        onOpenChange={setComposeOpen}
        me={me}
        replyTo={replyTarget}
        quotePost={quoteTarget}
        onPublished={() => invalidateAll()}
      />

      <ThreadShareModal
        post={sharePost}
        viewerHandle={me?.handle}
        onClose={() => setSharePost(null)}
      />

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
