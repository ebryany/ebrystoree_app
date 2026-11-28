import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUp,
  AtSign,
  Film,
  Hash,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  realtimeStatusKey,
  useRealtimeRefresh,
  type RealtimeConnectionStatus,
} from "@/hooks/use-realtime-refresh";
import { useSession } from "@/hooks/use-session";
import {
  dispatchThreadsPostDeleted,
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
  listThreadsFeed,
  reportThreadPost,
  toggleThreadBookmark,
  toggleThreadLike,
  toggleThreadRepost,
  toggleUserFollow,
} from "@/lib/social-threads.functions";
import type {
  SocialMediaItem,
  ThreadFeedTab,
  ThreadPostItem,
  ThreadPostKind,
  ThreadReportReason,
} from "@/lib/social-threads.shared";
import { cn } from "@/lib/utils";
import { ThreadCard, type ThreadCardActions } from "./thread-card";
import { InlineThreadPrompt, ThreadComposerModal } from "./thread-composer";
import { ThreadImageLightbox } from "./thread-lightbox";
import { ThreadShareModal } from "./thread-share-card";
import { ThreadsReelsFeed } from "./threads-reels";
import { ThreadsRightRail } from "./threads-right-rail";

const PRIMARY_TABS: Array<{ id: ThreadFeedTab; label: string; isReels?: boolean }> = [
  { id: "for_you", label: "Untuk Anda" },
  { id: "following", label: "Mengikuti" },
  { id: "reels", label: "Reels", isReels: true },
  { id: "commerce", label: "Katalog" },
];

/**
 * Staff-grade Meta Threads Web & Mobile feed replacing `/dashboard` home:
 * - Desktop: Centered floating feed switcher ABOVE a single elevated `rounded-[28px]` column
 *   + calm right utility column + iconic bottom-right floating `[+]` squircle compose button.
 * - Mobile: True native edge-to-edge hairline feed (`-mx-4 rounded-none`) with clean full-width tabs.
 */
export function ThreadsFeedView() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [tab, setTab] = useState<ThreadFeedTab>("for_you");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  const [liveNewCount, setLiveNewCount] = useState(0);

  // Composer states
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<ThreadPostKind>("thread");
  const [composeWithCommerce, setComposeWithCommerce] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ThreadPostItem | null>(null);
  const [quoteTarget, setQuoteTarget] = useState<ThreadPostItem | null>(null);

  // Overlays
  const [sharePost, setSharePost] = useState<ThreadPostItem | null>(null);
  const [reelCommentsPost, setReelCommentsPost] = useState<ThreadPostItem | null>(null);
  const [lightbox, setLightbox] = useState<{ items: SocialMediaItem[]; index: number } | null>(null);

  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  const bootstrapFn = useServerFn(getSocialBootstrap);
  const listFeedFn = useServerFn(listThreadsFeed);
  const likeFn = useServerFn(toggleThreadLike);
  const repostFn = useServerFn(toggleThreadRepost);
  const bookmarkFn = useServerFn(toggleThreadBookmark);
  const followFn = useServerFn(toggleUserFollow);
  const deleteFn = useServerFn(deleteThreadPost);
  const reportFn = useServerFn(reportThreadPost);

  const bootstrapQ = useQuery({
    queryKey: ["social-bootstrap"],
    queryFn: () => bootstrapFn({}),
    staleTime: 60_000,
  });

  const normalizedSearch = searchTerm.trim();
  const feedQueryKey = useMemo(
    () => ["threads-feed", tab, activeTag ?? "", normalizedSearch, authorFilter ?? ""],
    [tab, activeTag, normalizedSearch, authorFilter],
  );

  const feedQ = useInfiniteQuery({
    queryKey: feedQueryKey,
    initialPageParam: undefined as { createdAt: string; id: string } | undefined,
    queryFn: ({ pageParam }) =>
      listFeedFn({
        data: {
          tab,
          tag: activeTag ?? undefined,
          q: normalizedSearch || undefined,
          authorId: authorFilter ?? undefined,
          cursorCreatedAt: pageParam?.createdAt,
          cursorId: pageParam?.id,
        },
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  // Listen for global compose trigger dispatched by the desktop rail / mobile dock `+` button
  useEffect(() => {
    const onOpenEvent = () => {
      setReplyTarget(null);
      setQuoteTarget(null);
      setComposeMode(tab === "reels" ? "reel" : "thread");
      setComposeWithCommerce(false);
      setComposeOpen(true);
    };
    window.addEventListener("ebry:threads-compose", onOpenEvent);
    return () => window.removeEventListener("ebry:threads-compose", onOpenEvent);
  }, [tab]);

  const realtimeStatusQ = useQuery<RealtimeConnectionStatus | undefined>({
    queryKey: realtimeStatusKey("social-threads-live"),
    queryFn: () => undefined,
    enabled: false,
  });

  const pollSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visiblePostIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      if (pollSyncTimerRef.current) clearTimeout(pollSyncTimerRef.current);
    };
  }, []);

  const scheduleFeedResync = useCallback(() => {
    if (pollSyncTimerRef.current) clearTimeout(pollSyncTimerRef.current);
    pollSyncTimerRef.current = setTimeout(() => {
      pollSyncTimerRef.current = null;
      void queryClient.invalidateQueries({ queryKey: feedQueryKey });
    }, 350);
  }, [feedQueryKey, queryClient]);

  const patchFeedItems = useCallback(
    (updater: (item: ThreadPostItem) => ThreadPostItem | null) => {
      queryClient.setQueryData(feedQueryKey, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: (page.items as ThreadPostItem[])
              .map(updater)
              .filter((x): x is ThreadPostItem => Boolean(x)),
          })),
        };
      });
    },
    [feedQueryKey, queryClient],
  );

  useRealtimeRefresh({
    channel: "social-threads-live",
    tables: ["social_posts", "social_profiles", THREADS_REALTIME_SIGNALS],
    keys: [],
    enabled: Boolean(user?.id),
    debounceMs: 300,
    resyncOnJoin: true,
    onResync: () => {
      scheduleFeedResync();
      dispatchThreadsRepliesResync();
      void queryClient.invalidateQueries({ queryKey: ["social-bootstrap"] });
    },
    onEvent: (payload) => {
      const table = payload.table ?? "social_posts";
      const myId = bootstrapQ.data?.me?.id ?? user?.id;

      if (table === "social_posts") {
        if (payload.eventType === "INSERT" && payload.new) {
          const row = payload.new;
          if (!row.parent_id) {
            if (!myId || row.author_id !== myId) {
              if (visiblePostIdsRef.current.size === 0) {
                scheduleFeedResync();
              } else {
                setLiveNewCount((c) => c + 1);
              }
            }
            return;
          }
          // Live reply from any user -> emit to expanded inline rails & bump parent counter
          const parentId = typeof row.parent_id === "string" ? row.parent_id : "";
          const postId = typeof row.id === "string" ? row.id : "";
          if (parentId && postId) {
            dispatchThreadsReplyLive({
              parentId,
              rootId: typeof row.root_id === "string" ? row.root_id : null,
              postId,
              authorId: typeof row.author_id === "string" ? row.author_id : null,
            });
          }
          return;
        }

        if (payload.eventType === "UPDATE" && payload.new) {
          const row = payload.new;
          patchFeedItems((it) => patchThreadPostFromRealtimeRow(it, row));
          if (row.deleted_at && typeof row.id === "string") {
            dispatchThreadsPostDeleted({
              postId: row.id,
              parentId: typeof row.parent_id === "string" ? row.parent_id : null,
            });
          }
        }
        return;
      }

      if (table === "social_profiles" && payload.eventType === "UPDATE" && payload.new) {
        const row = payload.new;
        patchFeedItems((it) => patchThreadAuthorFromProfileRow(it, row));
        if (myId && row.user_id === myId) {
          void queryClient.invalidateQueries({ queryKey: ["social-bootstrap"] });
        }
        return;
      }

      if (table === THREADS_REALTIME_SIGNALS) {
        const signal = readThreadRealtimeSignal(payload.new);
        if (!signal) return;
        if (signal.kind === "deleted") {
          scheduleFeedResync();
          dispatchThreadsRepliesResync();
        } else {
          if (visiblePostIdsRef.current.has(signal.postId)) scheduleFeedResync();
          if (signal.parentId) dispatchThreadsRepliesResync(signal.parentId);
        }
      }
    },
  });

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feedQ;
  useEffect(() => {
    const el = loadMoreSentinelRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void fetchNextPage();
        }
      },
      { rootMargin: "320px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = useMemo(() => {
    const pages = feedQ.data?.pages ?? [];
    const seen = new Set<string>();
    const flat: ThreadPostItem[] = [];
    for (const p of pages) {
      for (const item of p.items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        flat.push(item);
      }
    }
    return flat;
  }, [feedQ.data?.pages]);

  useEffect(() => {
    const ids = new Set<string>();
    for (const item of items) {
      ids.add(item.id);
      ids.add(item.targetPostId);
      if (item.quotedPost) {
        ids.add(item.quotedPost.id);
      }
    }
    visiblePostIdsRef.current = ids;
  }, [items]);

  const activeReelCommentsPost = useMemo(() => {
    if (!reelCommentsPost) return null;
    return items.find((it) => it.id === reelCommentsPost.id) ?? null;
  }, [items, reelCommentsPost]);

  const setupRequired =
    Boolean(bootstrapQ.data?.setupRequired) ||
    Boolean(feedQ.data?.pages.some((p) => p.setupRequired));

  const handleLike = useCallback(
    async (post: ThreadPostItem) => {
      const targetId = post.targetPostId;
      const nextLiked = !post.viewerLiked;
      const delta = nextLiked ? 1 : -1;
      patchFeedItems((it) =>
        it.targetPostId === targetId
          ? { ...it, viewerLiked: nextLiked, likesCount: Math.max(0, it.likesCount + delta) }
          : it,
      );
      const res = await likeFn({ data: { postId: targetId } });
      if (!res.ok) {
        toast.error(res.error);
        void queryClient.invalidateQueries({ queryKey: feedQueryKey });
      }
    },
    [feedQueryKey, likeFn, patchFeedItems, queryClient],
  );

  const handleRepost = useCallback(
    async (post: ThreadPostItem) => {
      const targetId = post.targetPostId;
      const nextReposted = !post.viewerReposted;
      const delta = nextReposted ? 1 : -1;
      patchFeedItems((it) =>
        it.targetPostId === targetId
          ? {
            ...it,
            viewerReposted: nextReposted,
            repostsCount: Math.max(0, it.repostsCount + delta),
          }
          : it,
      );
      const res = await repostFn({ data: { postId: targetId } });
      if (!res.ok) {
        toast.error(res.error);
        void queryClient.invalidateQueries({ queryKey: feedQueryKey });
        return;
      }
      toast.success(res.reposted ? "Diposting ulang ke linimasa." : "Posting ulang dibatalkan.");
    },
    [feedQueryKey, patchFeedItems, queryClient, repostFn],
  );

  const handleBookmark = useCallback(
    async (post: ThreadPostItem) => {
      const targetId = post.targetPostId;
      const nextSaved = !post.viewerBookmarked;
      patchFeedItems((it) => {
        if (it.targetPostId !== targetId) return it;
        if (tab === "bookmarks" && !nextSaved) return null;
        return { ...it, viewerBookmarked: nextSaved };
      });
      const res = await bookmarkFn({ data: { postId: targetId } });
      if (!res.ok) {
        toast.error(res.error);
        void queryClient.invalidateQueries({ queryKey: feedQueryKey });
        return;
      }
      toast.success(res.bookmarked ? "Utas disimpan." : "Dihapus dari tersimpan.");
    },
    [bookmarkFn, feedQueryKey, patchFeedItems, queryClient, tab],
  );

  const handleFollow = useCallback(
    async (targetUserId: string) => {
      patchFeedItems((it) =>
        it.author.id === targetUserId
          ? { ...it, author: { ...it.author, isFollowedByMe: !it.author.isFollowedByMe } }
          : it,
      );
      const res = await followFn({ data: { targetUserId } });
      if (!res.ok) {
        toast.error(res.error);
        void queryClient.invalidateQueries({ queryKey: feedQueryKey });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: feedQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["social-bootstrap"] });
      toast.success(res.following ? "Sekarang mengikuti." : "Berhenti mengikuti.");
    },
    [feedQueryKey, followFn, patchFeedItems, queryClient],
  );

  const handleDelete = useCallback(
    async (postId: string) => {
      patchFeedItems((it) => (it.id === postId ? null : it));
      const res = await deleteFn({ data: { postId } });
      if (!res.ok) {
        toast.error(res.error);
        void queryClient.invalidateQueries({ queryKey: feedQueryKey });
        return;
      }
      toast.success("Utas dihapus.");
      void queryClient.invalidateQueries({ queryKey: ["threads-feed"] });
    },
    [deleteFn, feedQueryKey, patchFeedItems, queryClient],
  );

  const handleReport = useCallback(
    async (postId: string, reason: ThreadReportReason) => {
      const res = await reportFn({ data: { postId, reason, details: "" } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Laporan diterima tim moderasi.");
    },
    [reportFn],
  );

  const openNewComposer = useCallback((mode: ThreadPostKind, withCommerce = false) => {
    setReplyTarget(null);
    setQuoteTarget(null);
    setComposeMode(mode);
    setComposeWithCommerce(withCommerce);
    setComposeOpen(true);
  }, []);

  const cardActions: ThreadCardActions = useMemo(
    () => ({
      onLike: (p) => void handleLike(p),
      onReply: (p) => {
        setQuoteTarget(null);
        setReplyTarget(p);
        setComposeMode("thread");
        setComposeWithCommerce(false);
        setComposeOpen(true);
      },
      onRepost: (p) => void handleRepost(p),
      onQuote: (p) => {
        setReplyTarget(null);
        setQuoteTarget(p);
        setComposeMode("thread");
        setComposeWithCommerce(false);
        setComposeOpen(true);
      },
      onBookmark: (p) => void handleBookmark(p),
      onFollow: (uid) => void handleFollow(uid),
      onDelete: (pid) => void handleDelete(pid),
      onReport: (pid, r) => void handleReport(pid, r),
      onTagClick: (t) => {
        setActiveTag(t);
        setAuthorFilter(null);
      },
      onAuthorClick: (uid) => {
        setAuthorFilter(uid);
        setActiveTag(null);
      },
      onOpenLightbox: (mediaItems, idx) => setLightbox({ items: mediaItems, index: idx }),
      onShare: (p) => setSharePost(p),
      onReplyCreated: scheduleFeedResync,
    }),
    [handleBookmark, handleDelete, handleFollow, handleLike, handleReport, handleRepost, scheduleFeedResync],
  );

  const me = useMemo(() => {
    const base = bootstrapQ.data?.me ?? null;
    if (!base) return null;
    const sessionAvatar =
      (user?.user_metadata?.avatar_url as string | undefined) ||
      (user?.user_metadata?.picture as string | undefined) ||
      null;
    return base.avatarUrl || !sessionAvatar ? base : { ...base, avatarUrl: sessionAvatar };
  }, [bootstrapQ.data?.me, user]);

  return (
    <div className="flex w-full items-start justify-center gap-8">
      {/* Main Meta Threads Stage */}
      <div className="w-full min-w-0 max-w-[640px]">
        {/* Desktop Floating Top Switcher ABOVE the rounded column (Threads.net signature!) */}
        <div className="mb-3 hidden items-center justify-between gap-2 px-1 sm:flex">
          <div className="w-28 shrink-0" aria-hidden="true" />
          <nav
            role="tablist"
            aria-label="Kategori linimasa Threads"
            className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.045] p-1"
          >
            {PRIMARY_TABS.map((t) => {
              const selected = tab === t.id && !activeTag && !authorFilter;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => {
                    setTab(t.id);
                    setActiveTag(null);
                    setAuthorFilter(null);
                  }}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.isReels ? <Film className="size-3.5 text-accent" aria-hidden="true" /> : null}
                  <span>{t.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex w-28 shrink-0 items-center justify-end gap-1">
            {realtimeStatusQ.data === "subscribed" ? (
              <span
                title="Pembaruan langsung aktif"
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-400"
              >
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Live
              </span>
            ) : realtimeStatusQ.data === "reconnecting" ? (
              <span
                title="Menyambungkan pembaruan langsung"
                className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700 dark:text-amber-400"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
                Sync
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Cari utas"
              aria-expanded={searchOpen}
              className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <Search className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                setLiveNewCount(0);
                void feedQ.refetch();
                void bootstrapQ.refetch();
              }}
              aria-label="Segarkan linimasa"
              className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <RefreshCw
                className={cn("size-4", feedQ.isFetching && "animate-spin")}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        {/* Single Elevated Threads Column (edge-to-edge full-bleed on mobile, rounded-[28px] on desktop) */}
        <div className="threads-stage-column -mx-4 overflow-hidden border-y sm:mx-0 sm:rounded-[28px] sm:border">
          {/* Mobile Native Threads Sticky Header + Full-Width Underline Tabs */}
          <header className="sticky top-0 z-20 border-b border-border/75 bg-card/95 backdrop-blur-md sm:hidden">
            <div className="flex h-12 items-center justify-between px-4">
              <div className="flex w-14 items-center">
                {realtimeStatusQ.data === "subscribed" ? (
                  <span
                    title="Pembaruan langsung aktif"
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400"
                  >
                    <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                    Live
                  </span>
                ) : null}
              </div>
              <span className="inline-flex items-center gap-1.5 font-display text-[15px] font-bold tracking-tight text-foreground">
                <AtSign className="size-5" strokeWidth={2.5} aria-hidden="true" />
                <span>Threads</span>
              </span>
              <button
                type="button"
                onClick={() => setSearchOpen((v) => !v)}
                aria-label="Cari utas"
                className="grid size-9 place-items-center rounded-full text-muted-foreground hover:text-foreground"
              >
                <Search className="size-4" aria-hidden="true" />
              </button>
            </div>
            <nav
              role="tablist"
              aria-label="Kategori linimasa mobile"
              className="grid grid-cols-4 border-t border-border/50"
            >
              {PRIMARY_TABS.map((t) => {
                const selected = tab === t.id && !activeTag && !authorFilter;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => {
                      setTab(t.id);
                      setActiveTag(null);
                      setAuthorFilter(null);
                    }}
                    className={cn(
                      "threads-tab min-h-11 text-center text-[13px] font-semibold transition-colors",
                      selected ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </nav>
          </header>

          {/* Expandable clean search bar */}
          {searchOpen ? (
            <div className="border-b border-border/75 px-4 py-3 sm:px-5">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  autoFocus
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Cari utas, produk digital, atau topik..."
                  aria-label="Kata kunci pencarian utas"
                  className="h-10 w-full rounded-xl bg-foreground/[0.05] pl-10 pr-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
                {searchTerm ? (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    aria-label="Bersihkan pencarian"
                    className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Active #hashtag or creator filter chip */}
          {activeTag || authorFilter ? (
            <div className="flex items-center justify-between gap-2 border-b border-border/75 bg-foreground/[0.025] px-4 py-2.5 text-xs sm:px-5">
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                {activeTag ? (
                  <>
                    <Hash className="size-3.5 text-accent" aria-hidden="true" />
                    <span>Topik #{activeTag}</span>
                  </>
                ) : (
                  <span>Utas kreator terpilih</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  setActiveTag(null);
                  setAuthorFilter(null);
                }}
                className="inline-flex min-h-7 items-center gap-1 rounded-full bg-foreground/[0.07] px-2.5 text-xs font-semibold text-foreground hover:bg-foreground/[0.12]"
              >
                <X className="size-3" aria-hidden="true" />
                <span>Reset</span>
              </button>
            </div>
          ) : null}

          {/* Live Realtime new-posts pill */}
          {liveNewCount > 0 ? (
            <div className="flex justify-center border-b border-border/60 py-2.5">
              <button
                type="button"
                onClick={() => {
                  setLiveNewCount(0);
                  void feedQ.refetch();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-xs font-bold text-background shadow-sm transition-transform hover:scale-[1.02]"
              >
                <ArrowUp className="size-3.5" aria-hidden="true" />
                <span>{liveNewCount} utas baru</span>
              </button>
            </div>
          ) : null}

          {/* Inline "Apa yang baru?" composer bar (desktop & mobile, exact Meta Threads top row) */}
          {!setupRequired && tab !== "reels" ? (
            <InlineThreadPrompt
              me={me}
              onOpenCompose={() => openNewComposer("thread", false)}
              onOpenReel={() => openNewComposer("reel", false)}
              onOpenWithCommerce={() => openNewComposer("thread", true)}
            />
          ) : null}

          {/* Main Feed Content */}
          {setupRequired ? (
            <div className="space-y-3 px-6 py-14 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-foreground/[0.06] text-muted-foreground">
                <AtSign className="size-5" aria-hidden="true" />
              </span>
              <h2 className="font-display text-sm font-bold text-foreground">
                Linimasa sedang disiapkan
              </h2>
              <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
                Fitur komunitas sedang dalam pemeliharaan singkat. Silakan muat ulang halaman
                beberapa saat lagi.
              </p>
              <button
                type="button"
                onClick={() => {
                  void bootstrapQ.refetch();
                  void feedQ.refetch();
                }}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-4 text-xs font-semibold text-foreground hover:bg-foreground/[0.04]"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                <span>Muat ulang</span>
              </button>
            </div>
          ) : feedQ.isPending ? (
            <div className="divide-y divide-border/60">
              {[0, 1, 2].map((i) => (
                <div key={i} className="grid grid-cols-[42px_minmax(0,1fr)] gap-3 px-4 py-4 sm:px-5">
                  <div className="size-10 animate-pulse rounded-full bg-muted" />
                  <div className="space-y-2.5">
                    <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
                    <div className="h-3.5 w-full animate-pulse rounded bg-muted" />
                    <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : tab === "reels" ? (
            <>
              <ThreadsReelsFeed
                items={items}
                actions={cardActions}
                onCreateReel={() => openNewComposer("reel", false)}
                onOpenReplies={(p) => setReelCommentsPost(p)}
                onOpenShare={(p) => setSharePost(p)}
              />
              <div ref={loadMoreSentinelRef} className="p-3 text-center">
                {isFetchingNextPage ? (
                  <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Memuat Reel lainnya...
                  </span>
                ) : null}
              </div>
            </>
          ) : items.length === 0 ? (
            <div className="space-y-3 px-6 py-14 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-foreground/[0.05] text-muted-foreground">
                {tab === "commerce" ? (
                  <ShoppingBag className="size-5" aria-hidden="true" />
                ) : (
                  <AtSign className="size-5" aria-hidden="true" />
                )}
              </span>
              <h2 className="font-display text-sm font-bold text-foreground">
                {tab === "following"
                  ? "Belum ada utas dari akun yang diikuti"
                  : tab === "commerce"
                    ? "Belum ada utas produk atau jasa"
                    : "Mulai percakapan pertama"}
              </h2>
              <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
                {tab === "following"
                  ? "Ikuti kreator dan toko favorit Anda agar pembaruan mereka muncul di sini."
                  : "Bagikan ide, ulasan produk digital, demo Reel, atau polling komunitas."}
              </p>
              <button
                type="button"
                onClick={() => openNewComposer("thread", tab === "commerce")}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-foreground px-5 text-xs font-bold text-background hover:opacity-90"
              >
                <Plus className="size-4" aria-hidden="true" />
                <span>{tab === "commerce" ? "Bagikan Produk" : "Tulis Utas"}</span>
              </button>
            </div>
          ) : (
            <div>
              {items.map((post) => (
                <ThreadCard key={post.id} post={post} actions={cardActions} viewer={me} />
              ))}

              <div ref={loadMoreSentinelRef} className="p-5 text-center">
                {isFetchingNextPage ? (
                  <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Memuat utas lainnya...
                  </span>
                ) : hasNextPage ? (
                  <button
                    type="button"
                    onClick={() => void fetchNextPage()}
                    className="min-h-10 rounded-xl border border-border px-4 text-xs font-semibold text-foreground hover:bg-foreground/[0.04]"
                  >
                    Muat lebih banyak
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground/75">Anda sudah sampai akhir linimasa.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Calm Minimal Right Column (xl+) */}
      <ThreadsRightRail
        me={me}
        trendingTags={bootstrapQ.data?.trendingTags ?? []}
        suggestedCreators={bootstrapQ.data?.suggestedCreators ?? []}
        activeTag={activeTag}
        onSelectTag={(t) => {
          setActiveTag(t);
          setAuthorFilter(null);
        }}
        onFollowCreator={(uid) => void handleFollow(uid)}
      />

      {/* Iconic Threads.net Desktop Floating Bottom-Right Compose Squircle */}
      {!setupRequired ? (
        <button
          type="button"
          onClick={() => openNewComposer(tab === "reels" ? "reel" : "thread", false)}
          aria-label={tab === "reels" ? "Buat Video Reel baru" : "Buat utas baru"}
          className="fixed bottom-7 right-7 z-30 hidden h-14 w-17 place-items-center rounded-2xl border border-border/90 bg-card text-foreground shadow-[0_8px_28px_-8px_rgba(0,0,0,0.22)] transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid"
        >
          <Plus className="size-6" strokeWidth={2.2} aria-hidden="true" />
        </button>
      ) : null}

      {/* Full Composer Modal */}
      <ThreadComposerModal
        open={composeOpen}
        onOpenChange={setComposeOpen}
        me={me}
        replyTo={replyTarget}
        quotePost={quoteTarget}
        initialMode={composeMode}
        initialOpenCommerce={composeWithCommerce}
        onPublished={() => {
          void queryClient.invalidateQueries({ queryKey: ["threads-feed"] });
          void queryClient.invalidateQueries({ queryKey: ["social-bootstrap"] });
        }}
      />

      {/* Reels Comments Modal */}
      <Dialog open={Boolean(reelCommentsPost)} onOpenChange={(v) => !v && setReelCommentsPost(null)}>
        <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto rounded-2xl p-0">
          <DialogHeader className="border-b border-border px-5 py-3.5">
            <DialogTitle className="font-display text-base">Balasan & Diskusi Reel</DialogTitle>
            <DialogDescription className="text-xs">
              Tulis balasan langsung atau ketik kata kunci Auto-DM jika tersedia.
            </DialogDescription>
          </DialogHeader>
          {activeReelCommentsPost ? (
            <ThreadCard
              post={activeReelCommentsPost}
              actions={cardActions}
              viewer={me}
              allowInlineReplies
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Viral Share Card PNG Modal */}
      <ThreadShareModal
        post={sharePost}
        viewerHandle={me?.handle}
        onClose={() => setSharePost(null)}
      />

      {/* Native <dialog> Lightbox */}
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
