import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { AuthorAvatar, ThreadCard, type ThreadCardActions } from "@/components/threads/thread-card";
import { ThreadComposerModal } from "@/components/threads/thread-composer";
import { ThreadImageLightbox } from "@/components/threads/thread-lightbox";
import { ThreadShareModal } from "@/components/threads/thread-share-card";
import {
  realtimeStatusKey,
  useRealtimeRefresh,
  type RealtimeConnectionStatus,
} from "@/hooks/use-realtime-refresh";
import {
  doesRealtimeEventMatchPostIds,
  dispatchThreadsRepliesResync,
  dispatchThreadsReplyLive,
  patchThreadAuthorFromProfileRow,
  patchThreadPostFromRealtimeRow,
  readThreadRealtimeSignal,
  THREADS_REALTIME_SIGNALS,
} from "@/lib/social-threads-realtime";
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

  const detailChannel = `thread-detail-${id}`;
  const realtimeStatusQ = useQuery<RealtimeConnectionStatus | undefined>({
    queryKey: realtimeStatusKey(detailChannel),
    queryFn: () => undefined,
    enabled: false,
  });

  const resyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relevantIdsRef = useRef<Set<string>>(new Set([id]));

  useEffect(() => {
    const ids = new Set<string>([id]);
    const data = detailQ.data;
    if (data?.post) {
      ids.add(data.post.id);
      ids.add(data.post.targetPostId);
      if (data.post.rootId) ids.add(data.post.rootId);
      if (data.post.quotedPost) ids.add(data.post.quotedPost.id);
    }
    for (const a of data?.ancestors ?? []) {
      ids.add(a.id);
      ids.add(a.targetPostId);
      if (a.quotedPost) ids.add(a.quotedPost.id);
    }
    for (const r of data?.replies ?? []) {
      ids.add(r.id);
      ids.add(r.targetPostId);
      if (r.quotedPost) ids.add(r.quotedPost.id);
    }
    relevantIdsRef.current = ids;
  }, [detailQ.data, id]);

  useEffect(() => {
    return () => {
      if (resyncTimerRef.current) clearTimeout(resyncTimerRef.current);
    };
  }, []);

  const scheduleDetailResync = useCallback(() => {
    if (resyncTimerRef.current) clearTimeout(resyncTimerRef.current);
    resyncTimerRef.current = setTimeout(() => {
      resyncTimerRef.current = null;
      void queryClient.invalidateQueries({ queryKey: detailKey });
    }, 260);
  }, [detailKey, queryClient]);

  useRealtimeRefresh({
    channel: detailChannel,
    tables: ["social_posts", "social_profiles", THREADS_REALTIME_SIGNALS],
    keys: [],
    debounceMs: 250,
    resyncOnJoin: true,
    onResync: () => {
      scheduleDetailResync();
      dispatchThreadsRepliesResync();
    },
    onEvent: (payload) => {
      const table = payload.table ?? "social_posts";
      if (table === "social_posts") {
        if (payload.eventType === "INSERT" && payload.new) {
          const row = payload.new;
          if (doesRealtimeEventMatchPostIds(table, row, relevantIdsRef.current)) {
            scheduleDetailResync();
            if (typeof row.parent_id === "string" && typeof row.id === "string") {
              dispatchThreadsReplyLive({
                parentId: row.parent_id,
                postId: row.id,
                rootId: typeof row.root_id === "string" ? row.root_id : null,
                authorId: typeof row.author_id === "string" ? row.author_id : null,
              });
            }
          }
          return;
        }
        if (payload.eventType === "UPDATE" && payload.new) {
          const row = payload.new;
          if (!doesRealtimeEventMatchPostIds(table, row, relevantIdsRef.current)) return;
          queryClient.setQueryData(detailKey, (old: any) => {
            if (!old) return old;
            const nextPost = old.post ? patchThreadPostFromRealtimeRow(old.post, row) : null;
            const nextAncestors = (old.ancestors ?? [])
              .map((a: ThreadPostItem) => patchThreadPostFromRealtimeRow(a, row))
              .filter(Boolean);
            const nextReplies = (old.replies ?? [])
              .map((r: ThreadPostItem) => patchThreadPostFromRealtimeRow(r, row))
              .filter(Boolean);
            return { ...old, post: nextPost, ancestors: nextAncestors, replies: nextReplies };
          });
        }
        return;
      }

      if (table === THREADS_REALTIME_SIGNALS) {
        const signal = readThreadRealtimeSignal(payload.new);
        if (!signal) return;
        if (signal.kind === "deleted") {
          scheduleDetailResync();
          dispatchThreadsRepliesResync();
          return;
        }
        if (
          relevantIdsRef.current.has(signal.postId) ||
          (signal.parentId && relevantIdsRef.current.has(signal.parentId))
        ) {
          scheduleDetailResync();
        }
        if (signal.parentId) dispatchThreadsRepliesResync(signal.parentId);
        return;
      }

      if (table === "social_profiles" && payload.eventType === "UPDATE" && payload.new) {
        const row = payload.new;
        queryClient.setQueryData(detailKey, (old: any) => {
          if (!old) return old;
          return {
            ...old,
            post: old.post ? patchThreadAuthorFromProfileRow(old.post, row) : null,
            ancestors: (old.ancestors ?? []).map((a: ThreadPostItem) =>
              patchThreadAuthorFromProfileRow(a, row),
            ),
            replies: (old.replies ?? []).map((r: ThreadPostItem) =>
              patchThreadAuthorFromProfileRow(r, row),
            ),
          };
        });
      }
    },
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
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border/80 bg-card/95 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              aria-label="Kembali ke Threads"
              className="grid size-9 place-items-center rounded-full text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
            <h1 className="font-display text-base font-bold text-foreground">Utas</h1>
          </div>
          {realtimeStatusQ.data === "subscribed" ? (
            <span
              title="Pembaruan langsung aktif"
              className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-400"
            >
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              Live
            </span>
          ) : null}
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
