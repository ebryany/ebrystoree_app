import { memo, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  BarChart3,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Flag,
  Gift,
  Heart,
  Loader2,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Quote,
  Repeat2,
  Send,
  ShieldCheck,
  Store,
  Trash2,
  Unlock,
  UserCheck,
  UserPlus,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createThreadChain,
  getThreadReplies,
  voteThreadPoll,
} from "@/lib/social-threads.functions";
import {
  THREADS_POST_DELETED_EVENT,
  THREADS_REPLIES_RESYNC_EVENT,
  THREADS_REPLY_LIVE_EVENT,
  type ThreadsPostDeletedDetail,
  type ThreadsReplyLiveDetail,
} from "@/lib/social-threads-realtime";
import {
  buildPublicThreadUrl,
  formatCompactCount,
  formatRelativeThreadTime,
  tokenizeThreadBody,
  type SocialAuthor,
  type SocialMediaItem,
  type ThreadPollData,
  type ThreadPostItem,
  type ThreadReportReason,
} from "@/lib/social-threads.shared";
import { cn, isRenderableImageUrl, optimizedMediaUrl } from "@/lib/utils";
import { ThreadCommerceCard } from "./thread-commerce-card";
import { InlineReelPreview } from "./threads-reels";

export function AuthorAvatar({
  displayName,
  avatarUrl,
  size = "md",
  showFollowBadge = false,
  onFollowClick,
}: {
  displayName: string;
  avatarUrl: string | null;
  size?: "sm" | "md" | "lg";
  showFollowBadge?: boolean;
  onFollowClick?: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [avatarUrl]);
  const initial = (displayName.trim()[0] ?? "E").toUpperCase();
  const safeImg = !imgFailed && isRenderableImageUrl(avatarUrl) ? avatarUrl : null;
  const dims = size === "sm" ? "size-7 text-xs" : size === "lg" ? "size-11 text-base" : "size-10 text-sm";

  return (
    <span className={cn("relative block shrink-0", dims)}>
      <span className="grid size-full place-items-center overflow-hidden rounded-full border border-border/80 bg-surface-selected font-display font-bold text-foreground">
        {safeImg ? (
          <img
            src={optimizedMediaUrl(safeImg, 96)}
            alt={displayName}
            width={44}
            height={44}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="block size-full object-cover object-center"
          />
        ) : (
          initial
        )}
      </span>
      {showFollowBadge && onFollowClick ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onFollowClick();
          }}
          aria-label={`Ikuti ${displayName}`}
          className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-card bg-foreground text-background shadow-xs transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-3" strokeWidth={2.75} aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}

function ThreadBodyText({
  body,
  large = false,
  onTagClick,
}: {
  body: string;
  large?: boolean;
  onTagClick?: (tag: string) => void;
}) {
  const tokens = tokenizeThreadBody(body);
  if (!tokens.length) return null;

  return (
    <p
      className={cn(
        "whitespace-pre-line break-words text-foreground",
        large ? "text-[16px] leading-[1.52]" : "text-[15px] leading-[1.48]",
      )}
    >
      {tokens.map((tok, idx) => {
        if (tok.kind === "hashtag") {
          return (
            <button
              key={idx}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTagClick?.(tok.tag);
              }}
              className="rounded-xs font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {tok.value}
            </button>
          );
        }
        if (tok.kind === "mention") {
          return (
            <Link
              key={idx}
              to="/u/$handle"
              params={{ handle: tok.handle }}
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-accent hover:underline"
            >
              {tok.value}
            </Link>
          );
        }
        if (tok.kind === "url") {
          return (
            <a
              key={idx}
              href={tok.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="break-all text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
            >
              {tok.value}
            </a>
          );
        }
        return <span key={idx}>{tok.value}</span>;
      })}
    </p>
  );
}

function ThreadMediaStrip({
  media,
  onOpenLightbox,
}: {
  media: SocialMediaItem[];
  onOpenLightbox?: (items: SocialMediaItem[], index: number) => void;
}) {
  if (!media.length) return null;
  if (media.length === 1) {
    const first = media[0];
    return (
      <button
        type="button"
        onClick={() => onOpenLightbox?.(media, 0)}
        className="mt-2.5 block max-w-full overflow-hidden rounded-2xl border border-border/80 bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img
          src={optimizedMediaUrl(first.url, 800)}
          alt={first.alt || "Foto utas"}
          loading="lazy"
          decoding="async"
          className="max-h-[420px] w-auto max-w-full object-cover"
        />
      </button>
    );
  }

  return (
    <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
      {media.map((item, idx) => (
        <button
          key={`${item.url}-${idx}`}
          type="button"
          onClick={() => onOpenLightbox?.(media, idx)}
          className="relative h-60 w-[230px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border/80 bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-64 sm:w-[250px]"
        >
          <img
            src={optimizedMediaUrl(item.url, 640)}
            alt={item.alt || `Foto ${idx + 1}`}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-200 hover:scale-[1.02]"
          />
        </button>
      ))}
    </div>
  );
}

/** Interactive Poll card with optimistic vote percentages. */
function ThreadPollWidget({
  postId,
  initialPoll,
  readOnly = false,
}: {
  postId: string;
  initialPoll: ThreadPollData;
  readOnly?: boolean;
}) {
  const [poll, setPoll] = useState<ThreadPollData>(initialPoll);
  const [voting, setVoting] = useState(false);
  const voteFn = useServerFn(voteThreadPoll);

  useEffect(() => {
    setPoll(initialPoll);
  }, [initialPoll]);

  const showResults = poll.viewerOption !== null || poll.expired || readOnly;

  async function handleVote(optionIndex: number) {
    if (readOnly || poll.expired || voting) return;
    setVoting(true);
    const prev = poll;
    // Optimistic update
    const nextOptions = poll.options.map((opt) => {
      let votes = opt.votes;
      if (poll.viewerOption === opt.index) votes = Math.max(0, votes - 1);
      if (optionIndex === opt.index) votes += 1;
      return { ...opt, votes };
    });
    const nextTotal = nextOptions.reduce((s, o) => s + o.votes, 0);
    setPoll({ ...poll, options: nextOptions, totalVotes: nextTotal, viewerOption: optionIndex });

    try {
      const res = await voteFn({ data: { postId, optionIndex } });
      if (!res.ok) {
        setPoll(prev);
        toast.error(res.error);
        return;
      }
      setPoll((cur) => ({
        ...cur,
        viewerOption: res.viewerOption,
        totalVotes: res.totalVotes,
        options: cur.options.map((o) => {
          const hit = res.counts.find((c) => c.index === o.index);
          return hit ? { ...o, votes: hit.votes } : o;
        }),
      }));
    } catch {
      setPoll(prev);
      toast.error("Gagal menyimpan pilihan polling.");
    } finally {
      setVoting(false);
    }
  }

  return (
    <div className="mt-2.5 space-y-1.5 rounded-2xl border border-border/85 bg-surface/50 p-3">
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <BarChart3 className="size-3.5 text-accent" aria-hidden="true" />
          <span>Polling Komunitas</span>
        </span>
        <span className="tabular-nums">
          {poll.totalVotes} suara {poll.expired ? "· Selesai" : ""}
        </span>
      </div>

      <div className="space-y-1.5">
        {poll.options.map((opt) => {
          const pct = poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;
          const chosen = poll.viewerOption === opt.index;
          return (
            <button
              key={opt.index}
              type="button"
              disabled={readOnly || poll.expired || voting}
              onClick={() => void handleVote(opt.index)}
              className={cn(
                "relative flex min-h-10 w-full items-center justify-between gap-2 overflow-hidden rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                chosen
                  ? "border-accent bg-accent/10 text-foreground"
                  : "border-border bg-card text-foreground hover:bg-surface",
              )}
            >
              {showResults ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute inset-y-0 left-0 transition-all duration-300",
                    chosen ? "bg-accent/20" : "bg-muted/70",
                  )}
                  style={{ width: `${pct}%` }}
                />
              ) : null}
              <span className="relative z-[1] flex min-w-0 items-center gap-1.5">
                {chosen ? <Check className="size-3.5 shrink-0 text-accent" aria-hidden="true" /> : null}
                <span className="truncate">{opt.label}</span>
              </span>
              {showResults ? (
                <span className="relative z-[1] shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {pct}%
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Interactive Freebie Lead Magnet Lock card (server unlocks URL once viewer follows creator). */
function ThreadFreebieCard({
  post,
  onFollowUnlock,
  readOnly = false,
}: {
  post: ThreadPostItem;
  onFollowUnlock: () => void;
  readOnly?: boolean;
}) {
  if (!post.freebie) return null;
  const { title, unlocked, url } = post.freebie;

  return (
    <div className="mt-2.5 flex items-center justify-between gap-3 rounded-2xl border border-accent/35 bg-accent/8 px-3.5 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
          {unlocked ? (
            <Unlock className="size-4" aria-hidden="true" />
          ) : (
            <Gift className="size-4" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-accent">
            {unlocked ? "File Gratis Terbuka" : "Bonus Gratis Kreator"}
          </p>
          <p className="truncate text-xs font-semibold text-foreground">{title}</p>
        </div>
      </div>

      {unlocked && url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-xs font-bold text-background hover:opacity-90"
        >
          <span>Buka</span>
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      ) : readOnly ? (
        <Link
          to="/auth"
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-xs font-bold text-background hover:opacity-90"
        >
          <Lock className="size-3" aria-hidden="true" />
          <span>Masuk untuk Buka</span>
        </Link>
      ) : (
        <button
          type="button"
          onClick={onFollowUnlock}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-xs font-bold text-background hover:opacity-90"
        >
          <Lock className="size-3" aria-hidden="true" />
          <span>Ikuti & Buka</span>
        </button>
      )}
    </div>
  );
}

export type ThreadCardActions = {
  onLike: (post: ThreadPostItem) => void;
  onReply: (post: ThreadPostItem) => void;
  onRepost: (post: ThreadPostItem) => void;
  onQuote: (post: ThreadPostItem) => void;
  onBookmark: (post: ThreadPostItem) => void;
  onFollow: (authorId: string) => void;
  onDelete: (postId: string) => void;
  onReport?: (postId: string, reason: ThreadReportReason) => void;
  onTagClick?: (tag: string) => void;
  onAuthorClick?: (authorId: string) => void;
  onOpenLightbox?: (items: SocialMediaItem[], index: number) => void;
  onShare?: (post: ThreadPostItem) => void;
  onReplyCreated?: (parentPostId: string) => void;
};

/**
 * 100% authentic Meta Threads post card with:
 * - Inline expandable replies connected with continuous vertical Threads rail lines
 * - Inline quick-reply bar inside the rail + Auto-DM keyword trigger with 1-click "Buka Chat"
 * - Verified Buyer badge, Interactive Polls, Freebie Lead-Magnet Lock, Inline Reels, and Share Card
 */
export const ThreadCard = memo(function ThreadCard({
  post,
  actions,
  viewer,
  focal = false,
  connectTop = false,
  connectBottom = false,
  readOnly = false,
  allowInlineReplies = true,
}: {
  post: ThreadPostItem;
  actions: ThreadCardActions;
  viewer?: SocialAuthor | null;
  focal?: boolean;
  connectTop?: boolean;
  connectBottom?: boolean;
  /** Public unauthenticated preview mode (`/t/$id` or `/u/$handle`). */
  readOnly?: boolean;
  allowInlineReplies?: boolean;
}) {
  const navigate = useNavigate();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Inline expandable thread-line replies state
  const [repliesExpanded, setRepliesExpanded] = useState(false);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [inlineReplies, setInlineReplies] = useState<ThreadPostItem[]>([]);
  const [inlineDraft, setInlineDraft] = useState("");
  const [sendingInline, setSendingInline] = useState(false);

  const fetchRepliesFn = useServerFn(getThreadReplies);
  const createReplyFn = useServerFn(createThreadChain);
  const repliesRequest = useRef(0);

  const loadInlineReplies = useCallback(
    async (opts?: { silent?: boolean }) => {
      const request = ++repliesRequest.current;
      if (!opts?.silent) setLoadingReplies(true);
      try {
        const res = await fetchRepliesFn({ data: { postId: post.targetPostId, limit: 12 } });
        if (request === repliesRequest.current) setInlineReplies(res.items);
      } catch {
        if (!opts?.silent) toast.error("Balasan gagal dimuat.");
      } finally {
        if (!opts?.silent) setLoadingReplies(false);
      }
    },
    [fetchRepliesFn, post.targetPostId],
  );

  useEffect(() => {
    if (!repliesExpanded || readOnly) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void loadInlineReplies({ silent: true });
      }, 220);
    };
    const onLiveReply = (ev: Event) => {
      const detail = (ev as CustomEvent<ThreadsReplyLiveDetail>).detail;
      if (detail?.parentId === post.targetPostId) schedule();
    };
    const onResync = (ev: Event) => {
      const parentId = (ev as CustomEvent<string | null>).detail;
      if (parentId === null || parentId === post.targetPostId) schedule();
    };
    const onLiveDelete = (ev: Event) => {
      const detail = (ev as CustomEvent<ThreadsPostDeletedDetail>).detail;
      if (!detail?.postId || detail.parentId !== post.targetPostId) return;
      repliesRequest.current += 1;
      setInlineReplies((prev) =>
        prev.filter((r) => r.id !== detail.postId && r.targetPostId !== detail.postId),
      );
      schedule();
    };
    window.addEventListener(THREADS_REPLY_LIVE_EVENT, onLiveReply);
    window.addEventListener(THREADS_POST_DELETED_EVENT, onLiveDelete);
    window.addEventListener(THREADS_REPLIES_RESYNC_EVENT, onResync);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(THREADS_REPLY_LIVE_EVENT, onLiveReply);
      window.removeEventListener(THREADS_POST_DELETED_EVENT, onLiveDelete);
      window.removeEventListener(THREADS_REPLIES_RESYNC_EVENT, onResync);
    };
  }, [loadInlineReplies, post.targetPostId, readOnly, repliesExpanded]);

  const toggleInlineReplies = useCallback(() => {
    if (!allowInlineReplies || focal) return;
    if (repliesExpanded) {
      setRepliesExpanded(false);
      return;
    }
    setRepliesExpanded(true);
    void loadInlineReplies();
  }, [allowInlineReplies, focal, loadInlineReplies, repliesExpanded]);

  async function submitInlineReply(e: FormEvent) {
    e.preventDefault();
    const text = inlineDraft.trim();
    if (!text || sendingInline || readOnly) return;
    setSendingInline(true);
    try {
      const res = await createReplyFn({
        data: {
          segments: [{ body: text, media: [], postKind: "thread" }],
          parentId: post.targetPostId,
          replyPolicy: "everyone",
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setInlineDraft("");
      if (res.firstPost) {
        const reply = res.firstPost;
        setInlineReplies((prev) => (
          prev.some(({ id }) => id === reply.id) ? prev : [...prev, reply].slice(-12)
        ));
      }
      void loadInlineReplies({ silent: true });
      actions.onReplyCreated?.(post.targetPostId);

      if (res.autoDmTriggered) {
        const { inquiryId, keyword, storeName } = res.autoDmTriggered;
        toast.success(`Auto-DM "${keyword}" terkirim dari ${storeName} ke Chat Anda!`, {
          action: {
            label: "Buka Chat",
            onClick: () => {
              void navigate({ to: "/dashboard/chat/$id", params: { id: inquiryId } });
            },
          },
          duration: 8000,
        });
      } else {
        toast.success("Balasan terkirim.");
      }
    } catch {
      toast.error("Gagal mengirim balasan.");
    } finally {
      setSendingInline(false);
    }
  }

  function handleAutoDmShortcut() {
    if (!post.autoDm) return;
    if (readOnly) {
      void navigate({ to: "/auth" });
      return;
    }
    setInlineDraft(post.autoDm.keyword);
    if (!repliesExpanded && allowInlineReplies && !focal) {
      setRepliesExpanded(true);
      void loadInlineReplies();
    } else if (focal) {
      actions.onReply(post);
    }
  }

  function handleShareClick() {
    if (actions.onShare) {
      actions.onShare(post);
      return;
    }
    const url = buildPublicThreadUrl(window.location.origin, post.targetPostId, viewer?.handle);
    void navigator.clipboard?.writeText(url);
    toast.success("Tautan publik utas disalin.");
  }

  const showReplyRail =
    repliesExpanded ||
    (!focal && (connectBottom || post.replyPreviewAuthors.length > 0 || post.repliesCount > 0));
  const totalReposts = post.repostsCount + post.quotesCount;
  const effectiveRepliesCount = Math.max(post.repliesCount, inlineReplies.length);

  return (
    <article
      aria-label={`Utas dari ${post.author.displayName}`}
      className={cn(
        "relative px-4 py-3.5 transition-colors sm:px-5",
        !connectBottom && "border-b border-border/80",
        focal && "bg-card",
      )}
    >
      {/* Pure repost header */}
      {post.repostedBy ? (
        <div className="mb-2 flex items-center gap-2 pl-7 text-xs font-medium text-muted-foreground">
          <Repeat2 className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{post.repostedBy.displayName} memposting ulang</span>
        </div>
      ) : null}

      {/* Main post row */}
      <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-3">
        {/* Left avatar & vertical thread rail column */}
        <div className="flex flex-col items-center">
          {connectTop ? (
            <span className="-mt-3.5 mb-1.5 h-3.5 w-[2px] rounded-full bg-border" aria-hidden="true" />
          ) : null}

          <AuthorAvatar
            displayName={post.author.displayName}
            avatarUrl={post.author.avatarUrl}
            size={focal ? "lg" : "md"}
            showFollowBadge={!readOnly && !post.author.isSelf && !post.author.isFollowedByMe}
            onFollowClick={() => actions.onFollow(post.author.id)}
          />

          {showReplyRail ? (
            <span
              className="mt-2 min-h-5 w-[2px] flex-1 rounded-full bg-border/90"
              aria-hidden="true"
            />
          ) : null}

          {/* Collapsed replier avatars at foot of rail */}
          {!repliesExpanded && !focal && !connectBottom && post.replyPreviewAuthors.length > 0 ? (
            <button
              type="button"
              onClick={toggleInlineReplies}
              aria-label="Lihat balasan langsung di sini"
              className="mt-1.5 flex -space-x-1.5 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {post.replyPreviewAuthors.slice(0, 2).map((ra) => (
                <span
                  key={ra.id}
                  className="grid size-4 place-items-center overflow-hidden rounded-full border border-card bg-surface-selected text-[9px] font-bold text-foreground"
                >
                  {isRenderableImageUrl(ra.avatarUrl) ? (
                    <img
                      src={optimizedMediaUrl(ra.avatarUrl!, 96)}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    (ra.displayName[0] ?? "U").toUpperCase()
                  )}
                </span>
              ))}
            </button>
          ) : null}
        </div>

        {/* Right content column */}
        <div className="min-w-0">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <Link
                to="/u/$handle"
                params={{ handle: post.author.handle }}
                className="truncate text-[15px] font-bold text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs"
              >
                {post.author.handle}
              </Link>

              {post.author.verifiedStore ? (
                <Link
                  to="/toko/$slug"
                  params={{ slug: post.author.verifiedStore.slug }}
                  title={`Toko terverifikasi: ${post.author.verifiedStore.name}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/12 px-1.5 py-0.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/20"
                >
                  <BadgeCheck className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="max-w-[110px] truncate">{post.author.verifiedStore.name}</span>
                </Link>
              ) : null}

              {post.isVerifiedBuyer ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck className="size-3 shrink-0" aria-hidden="true" />
                  <span>Pembeli Terverifikasi</span>
                </span>
              ) : null}

              <Link
                to={readOnly ? "/t/$id" : "/dashboard/thread/$id"}
                params={{ id: post.targetPostId }}
                className="shrink-0 text-xs tabular-nums text-muted-foreground hover:underline"
                title={new Date(post.createdAt).toLocaleString("id-ID", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              >
                {formatRelativeThreadTime(post.createdAt)}
              </Link>
            </div>

            {!readOnly ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Opsi utas"
                    className="-mr-1.5 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <MoreHorizontal className="size-4" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 rounded-2xl p-1.5">
                  <DropdownMenuItem
                    className="min-h-10 gap-2.5 rounded-xl"
                    onSelect={() => actions.onBookmark(post)}
                  >
                    <Bookmark className="size-4" />
                    {post.viewerBookmarked ? "Hapus dari tersimpan" : "Simpan utas"}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="min-h-10 gap-2.5 rounded-xl" onSelect={handleShareClick}>
                    <Copy className="size-4" /> Bagikan / Kartu PNG
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="min-h-10 gap-2.5 rounded-xl">
                    <Link to="/u/$handle" params={{ handle: post.author.handle }}>
                      <UserCheck className="size-4" /> Profil @{post.author.handle}
                    </Link>
                  </DropdownMenuItem>
                  {post.author.verifiedStore ? (
                    <DropdownMenuItem asChild className="min-h-10 gap-2.5 rounded-xl">
                      <Link to="/toko/$slug" params={{ slug: post.author.verifiedStore.slug }}>
                        <Store className="size-4" /> Kunjungi toko
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  {!post.author.isSelf ? (
                    <DropdownMenuItem
                      className="min-h-10 gap-2.5 rounded-xl"
                      onSelect={() => actions.onFollow(post.author.id)}
                    >
                      {post.author.isFollowedByMe ? (
                        <>
                          <UserCheck className="size-4" /> Berhenti mengikuti
                        </>
                      ) : (
                        <>
                          <UserPlus className="size-4" /> Ikuti @{post.author.handle}
                        </>
                      )}
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  {post.author.isSelf ? (
                    <DropdownMenuItem
                      className="min-h-10 gap-2.5 rounded-xl text-destructive focus:text-destructive"
                      onSelect={() => setConfirmDeleteOpen(true)}
                    >
                      <Trash2 className="size-4" /> Hapus utas
                    </DropdownMenuItem>
                  ) : actions.onReport ? (
                    <DropdownMenuItem
                      className="min-h-10 gap-2.5 rounded-xl text-destructive focus:text-destructive"
                      onSelect={() => actions.onReport?.(post.targetPostId, "spam")}
                    >
                      <Flag className="size-4" /> Laporkan utas
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>

          {/* Post body */}
          {post.body ? (
            <div className="mt-1">
              <ThreadBodyText body={post.body} large={focal} onTagClick={actions.onTagClick} />
            </div>
          ) : null}

          {/* Auto-DM Keyword trigger pill ("ManyChat Native Bawaan") */}
          {post.autoDm ? (
            <button
              type="button"
              onClick={handleAutoDmShortcut}
              className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-left text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-500/15 dark:text-emerald-300"
            >
              <Zap className="size-3.5 shrink-0" aria-hidden="true" />
              <span>
                Balas <strong className="font-mono uppercase">"{post.autoDm.keyword}"</strong>{" "}
                untuk terima info & link otomatis di Chat
              </span>
              {post.autoDm.triggeredCount > 0 ? (
                <span className="text-[11px] tabular-nums opacity-80">
                  · {post.autoDm.triggeredCount} terkirim
                </span>
              ) : null}
            </button>
          ) : null}

          {/* Video Reel inline player */}
          {post.postKind === "reel" && post.videoUrl ? <InlineReelPreview post={post} /> : null}

          {/* Photo gallery */}
          <ThreadMediaStrip media={post.media} onOpenLightbox={actions.onOpenLightbox} />

          {/* Interactive Poll */}
          {post.poll ? (
            <ThreadPollWidget postId={post.targetPostId} initialPoll={post.poll} readOnly={readOnly} />
          ) : null}

          {/* Freebie / Lead Magnet Lock Card */}
          <ThreadFreebieCard
            post={post}
            readOnly={readOnly}
            onFollowUnlock={() => actions.onFollow(post.author.id)}
          />

          {/* Embedded Ebrystore Product or Service card */}
          {post.attachedCommerce ? (
            <div className="mt-2.5">
              <ThreadCommerceCard item={post.attachedCommerce} readOnly={readOnly} />
            </div>
          ) : null}

          {/* Quoted Thread Post */}
          {post.quotedPost ? (
            <div className="mt-2.5 overflow-hidden rounded-2xl border border-border/90 bg-surface/50 p-3">
              {post.quotedPost.deleted ? (
                <p className="text-xs italic text-muted-foreground">
                  Utas yang dikutip sudah dihapus.
                </p>
              ) : (
                <Link
                  to={readOnly ? "/t/$id" : "/dashboard/thread/$id"}
                  params={{ id: post.quotedPost.id }}
                  className="block space-y-1.5 focus-visible:outline-none"
                >
                  <div className="flex items-center gap-2">
                    <AuthorAvatar
                      displayName={post.quotedPost.author.displayName}
                      avatarUrl={post.quotedPost.author.avatarUrl}
                      size="sm"
                    />
                    <span className="truncate text-xs font-bold text-foreground">
                      {post.quotedPost.author.handle}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatRelativeThreadTime(post.quotedPost.createdAt)}
                    </span>
                  </div>
                  {post.quotedPost.body ? (
                    <p className="line-clamp-4 whitespace-pre-line break-words text-sm text-foreground/95">
                      {post.quotedPost.body}
                    </p>
                  ) : null}
                  {post.quotedPost.media.length > 0 ? (
                    <div className="flex gap-1.5 overflow-hidden pt-1">
                      {post.quotedPost.media.slice(0, 2).map((m, i) => (
                        <img
                          key={i}
                          src={optimizedMediaUrl(m.url, 360)}
                          alt={m.alt || "Foto kutipan"}
                          loading="lazy"
                          className="h-24 w-28 rounded-xl border border-border/70 object-cover"
                        />
                      ))}
                    </div>
                  ) : null}
                </Link>
              )}
            </div>
          ) : null}

          {/* Focal detail full timestamp */}
          {focal ? (
            <p className="mt-3 border-b border-border/70 pb-3 text-xs text-muted-foreground">
              {new Date(post.createdAt).toLocaleString("id-ID", {
                dateStyle: "long",
                timeStyle: "short",
              })}
              {post.replyPolicy === "followers"
                ? " · Hanya pengikut yang bisa membalas"
                : post.replyPolicy === "mentioned"
                  ? " · Hanya akun disebut yang bisa membalas"
                  : ""}
            </p>
          ) : null}

          {/* Threads action row */}
          <div className="-ml-2 mt-2 flex flex-wrap items-center gap-0.5">
            <button
              type="button"
              onClick={() => (readOnly ? void navigate({ to: "/auth" }) : actions.onLike(post))}
              aria-label={post.viewerLiked ? "Batal suka" : "Sukai utas"}
              aria-pressed={post.viewerLiked}
              className={cn(
                "press-scale inline-flex min-h-10 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                post.viewerLiked
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Heart
                className={cn(
                  "size-[19px] transition-transform",
                  post.viewerLiked && "threads-heart-pop fill-current",
                )}
                strokeWidth={1.85}
                aria-hidden="true"
              />
              {post.likesCount > 0 ? (
                <span className="tabular-nums">{formatCompactCount(post.likesCount)}</span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => {
                if (allowInlineReplies && !focal) {
                  toggleInlineReplies();
                } else if (readOnly) {
                  void navigate({ to: "/auth" });
                } else {
                  actions.onReply(post);
                }
              }}
              aria-label="Balas atau buka balasan utas"
              aria-expanded={allowInlineReplies && !focal ? repliesExpanded : undefined}
              className={cn(
                "press-scale inline-flex min-h-10 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                repliesExpanded ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <MessageCircle className="size-[19px]" strokeWidth={1.9} aria-hidden="true" />
              {effectiveRepliesCount > 0 ? (
                <span className="tabular-nums">{formatCompactCount(effectiveRepliesCount)}</span>
              ) : null}
            </button>

            {!readOnly ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Posting ulang atau kutip utas"
                    aria-pressed={post.viewerReposted}
                    className={cn(
                      "press-scale inline-flex min-h-10 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      post.viewerReposted
                        ? "text-accent"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Repeat2 className="size-[19px]" strokeWidth={1.9} aria-hidden="true" />
                    {totalReposts > 0 ? (
                      <span className="tabular-nums">{formatCompactCount(totalReposts)}</span>
                    ) : null}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48 rounded-2xl p-1.5">
                  <DropdownMenuItem
                    className="min-h-10 gap-2.5 rounded-xl"
                    onSelect={() => actions.onRepost(post)}
                  >
                    <Repeat2 className="size-4" />
                    {post.viewerReposted ? "Batalkan posting ulang" : "Posting ulang"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="min-h-10 gap-2.5 rounded-xl"
                    onSelect={() => actions.onQuote(post)}
                  >
                    <Quote className="size-4" /> Kutip utas
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}

            {!readOnly ? (
              <button
                type="button"
                onClick={() => actions.onBookmark(post)}
                aria-label={post.viewerBookmarked ? "Hapus simpanan" : "Simpan utas"}
                aria-pressed={post.viewerBookmarked}
                className={cn(
                  "press-scale inline-flex min-h-10 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  post.viewerBookmarked
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Bookmark
                  className={cn("size-[18px]", post.viewerBookmarked && "fill-current")}
                  strokeWidth={1.9}
                  aria-hidden="true"
                />
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleShareClick}
              aria-label="Bagikan tautan dan kartu utas"
              className="press-scale inline-flex min-h-10 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Send className="size-[17px]" strokeWidth={1.9} aria-hidden="true" />
            </button>
          </div>

          {/* Replies summary trigger: expands inline thread-line replies right in the feed! */}
          {!focal && (effectiveRepliesCount > 0 || post.likesCount > 0) ? (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {effectiveRepliesCount > 0 && allowInlineReplies ? (
                <button
                  type="button"
                  onClick={toggleInlineReplies}
                  className="inline-flex min-h-7 items-center gap-1 font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs"
                >
                  <span className="tabular-nums">
                    {repliesExpanded
                      ? "Sembunyikan balasan"
                      : `${effectiveRepliesCount} balasan`}
                  </span>
                  {repliesExpanded ? (
                    <ChevronUp className="size-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="size-3.5" aria-hidden="true" />
                  )}
                </button>
              ) : effectiveRepliesCount > 0 ? (
                <Link
                  to={readOnly ? "/t/$id" : "/dashboard/thread/$id"}
                  params={{ id: post.targetPostId }}
                  className="tabular-nums hover:underline"
                >
                  {effectiveRepliesCount} balasan
                </Link>
              ) : null}

              {effectiveRepliesCount > 0 && post.likesCount > 0 ? (
                <span aria-hidden="true">·</span>
              ) : null}

              {post.likesCount > 0 ? (
                <span className="tabular-nums">{post.likesCount} suka</span>
              ) : null}

              {repliesExpanded ? (
                <>
                  <span aria-hidden="true">·</span>
                  <Link
                    to={readOnly ? "/t/$id" : "/dashboard/thread/$id"}
                    params={{ id: post.targetPostId }}
                    className="font-semibold text-accent hover:underline"
                  >
                    Buka halaman utas
                  </Link>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Inline Expanded Replies WITH Connected Vertical Thread Lines */}
      {repliesExpanded && allowInlineReplies && !focal ? (
        <div className="mt-1 space-y-0" aria-label="Balasan utas terhubung">
          {loadingReplies ? (
            <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-3 pt-2">
              <div className="flex flex-col items-center">
                <span className="h-6 w-[2px] rounded-full bg-border" aria-hidden="true" />
              </div>
              <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                <span>Memuat balasan...</span>
              </div>
            </div>
          ) : (
            <>
              {inlineReplies.map((reply, rIdx) => {
                const isLastReply = rIdx === inlineReplies.length - 1;
                const keepRailDown = !isLastReply || !readOnly;
                return (
                  <div
                    key={reply.id}
                    className="grid grid-cols-[42px_minmax(0,1fr)] gap-3 pt-1"
                  >
                    {/* Continuous vertical thread connector line linking parent -> each reply */}
                    <div className="flex flex-col items-center">
                      <span className="-mt-1 mb-1 h-2.5 w-[2px] rounded-full bg-border" aria-hidden="true" />
                      <AuthorAvatar
                        displayName={reply.author.displayName}
                        avatarUrl={reply.author.avatarUrl}
                        size="sm"
                      />
                      {keepRailDown ? (
                        <span
                          className="mt-1.5 min-h-4 w-[2px] flex-1 rounded-full bg-border/85"
                          aria-hidden="true"
                        />
                      ) : null}
                    </div>

                    <div className="min-w-0 pb-2.5 pt-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link
                          to="/u/$handle"
                          params={{ handle: reply.author.handle }}
                          className="text-xs font-bold text-foreground hover:underline"
                        >
                          {reply.author.handle}
                        </Link>
                        {reply.author.verifiedStore ? (
                          <BadgeCheck
                            className="size-3.5 text-accent"
                            aria-label="Toko terverifikasi"
                          />
                        ) : null}
                        {reply.isVerifiedBuyer ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                            <ShieldCheck className="size-2.5" aria-hidden="true" />
                            Pembeli
                          </span>
                        ) : null}
                        <span className="text-[11px] text-muted-foreground">
                          {formatRelativeThreadTime(reply.createdAt)}
                        </span>
                      </div>

                      {reply.body ? (
                        <p className="mt-0.5 whitespace-pre-line break-words text-[13.5px] leading-relaxed text-foreground/95">
                          {reply.body}
                        </p>
                      ) : null}

                      {reply.attachedCommerce ? (
                        <div className="mt-1.5">
                          <ThreadCommerceCard item={reply.attachedCommerce} compact readOnly={readOnly} />
                        </div>
                      ) : null}

                      {!readOnly ? (
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                          <button
                            type="button"
                            onClick={() => {
                              setInlineReplies((prev) =>
                                prev.map((r) =>
                                  r.id === reply.id
                                    ? {
                                        ...r,
                                        viewerLiked: !r.viewerLiked,
                                        likesCount: Math.max(
                                          0,
                                          r.likesCount + (r.viewerLiked ? -1 : 1),
                                        ),
                                      }
                                    : r,
                                ),
                              );
                              actions.onLike(reply);
                            }}
                            className={cn(
                              "inline-flex items-center gap-1 font-medium hover:text-foreground",
                              reply.viewerLiked && "text-rose-600 dark:text-rose-400",
                            )}
                          >
                            <Heart
                              className={cn("size-3.5", reply.viewerLiked && "fill-current")}
                              aria-hidden="true"
                            />
                            {reply.likesCount > 0 ? (
                              <span className="tabular-nums">{reply.likesCount}</span>
                            ) : (
                              <span>Suka</span>
                            )}
                          </button>
                          <Link
                            to="/dashboard/thread/$id"
                            params={{ id: reply.targetPostId }}
                            className="hover:text-foreground hover:underline"
                          >
                            Balas
                          </Link>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {/* Inline quick-reply input at the bottom of the connected rail */}
              {!readOnly ? (
                <form
                  onSubmit={(e) => void submitInlineReply(e)}
                  className="grid grid-cols-[42px_minmax(0,1fr)] items-center gap-3 pt-1"
                >
                  <div className="flex flex-col items-center">
                    <span className="-mt-1 mb-1 h-2 w-[2px] rounded-full bg-border" aria-hidden="true" />
                    <AuthorAvatar
                      displayName={viewer?.displayName ?? "Anda"}
                      avatarUrl={viewer?.avatarUrl ?? null}
                      size="sm"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface/70 py-1 pl-3.5 pr-1.5 focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-ring/40">
                    <input
                      type="text"
                      value={inlineDraft}
                      maxLength={500}
                      onChange={(e) => setInlineDraft(e.target.value)}
                      placeholder={
                        post.autoDm
                          ? `Ketik "${post.autoDm.keyword}" untuk Auto-DM atau tulis balasan...`
                          : `Balas @${post.author.handle}...`
                      }
                      aria-label={`Tulis balasan cepat untuk @${post.author.handle}`}
                      className="h-8 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    <button
                      type="submit"
                      disabled={!inlineDraft.trim() || sendingInline}
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-foreground px-3 text-xs font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {sendingInline ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <span>Kirim</span>
                      )}
                    </button>
                  </div>
                </form>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {/* Accessible delete confirmation */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus utas ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Utas akan dihapus dari linimasa dan tidak dapat dipulihkan kembali.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-10 rounded-full">Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => actions.onDelete(post.id)}
              className="min-h-10 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
});
