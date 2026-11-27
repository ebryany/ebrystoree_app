import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  Bookmark,
  Film,
  Heart,
  MessageCircle,
  Pause,
  Play,
  Plus,
  Repeat2,
  Send,
  ShoppingBag,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";

import { formatRupiah } from "@/lib/format";
import { recordReelView } from "@/lib/social-threads.functions";
import {
  formatCompactCount,
  formatVideoDuration,
  type ThreadPostItem,
} from "@/lib/social-threads.shared";
import { cn } from "@/lib/utils";
import { AuthorAvatar, type ThreadCardActions } from "./thread-card";
import { ThreadCommerceCard } from "./thread-commerce-card";

/**
 * Single vertical 9:16 Reel card with viewport-driven playback (`IntersectionObserver`),
 * off-screen pause (`visibilitychange`), muted autoplay with 1-tap unmute,
 * floating right-side Reels action stack, and shoppable Ebrystore product overlay.
 */
function ReelPlayerCard({
  post,
  actions,
  muted,
  onToggleMute,
  onOpenReplies,
  onOpenShare,
}: {
  post: ThreadPostItem;
  actions: ThreadCardActions;
  muted: boolean;
  onToggleMute: () => void;
  onOpenReplies: (post: ThreadPostItem) => void;
  onOpenShare: (post: ThreadPostItem) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewRecordedRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const recordViewFn = useServerFn(recordReelView);

  // Sync mute state
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  // Pause off-screen & pause when tab hidden (modern-web-guidance: efficient-background-processing)
  useEffect(() => {
    const el = containerRef.current;
    const video = videoRef.current;
    if (!el || !video) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const playSafe = () => {
      if (prefersReduced || userPaused) return;
      void video
        .play()
        .then(() => {
          setPlaying(true);
          if (!viewRecordedRef.current) {
            viewRecordedRef.current = true;
            void recordViewFn({ data: { postId: post.targetPostId } });
          }
        })
        .catch(() => setPlaying(false));
    };

    const pauseSafe = () => {
      video.pause();
      setPlaying(false);
    };

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.65 && document.visibilityState === "visible") {
          playSafe();
        } else {
          pauseSafe();
        }
      },
      { threshold: [0.25, 0.65, 0.9] },
    );

    const onVisibility = () => {
      if (document.visibilityState !== "visible") pauseSafe();
    };

    obs.observe(el);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      obs.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      video.pause();
    };
  }, [post.targetPostId, recordViewFn, userPaused]);

  function togglePlayTap() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      setUserPaused(false);
      void video
        .play()
        .then(() => setPlaying(true))
        .catch(() => {});
    } else {
      setUserPaused(true);
      video.pause();
      setPlaying(false);
    }
  }

  return (
    <article
      ref={containerRef}
      aria-label={`Reel dari @${post.author.handle}`}
      className="reels-card relative mx-auto flex h-[78dvh] max-h-[760px] min-h-[520px] w-full max-w-[440px] snap-start flex-col overflow-hidden rounded-2xl border border-border/80 bg-black shadow-[var(--elev-2)]"
    >
      {/* Video layer */}
      <video
        ref={videoRef}
        src={post.videoUrl ?? undefined}
        poster={post.videoPosterUrl ?? undefined}
        playsInline
        loop
        muted={muted}
        preload="metadata"
        onClick={togglePlayTap}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.duration > 0) setProgress((v.currentTime / v.duration) * 100);
        }}
        className="size-full cursor-pointer object-cover"
      />

      {/* Top gradient & sound / duration controls */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 via-black/25 to-transparent p-3.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-xs">
          <Film className="size-3.5 text-emerald-400" aria-hidden="true" />
          <span>Reels</span>
          {post.videoDurationSec ? (
            <span className="tabular-nums opacity-80">
              · {formatVideoDuration(post.videoDurationSec)}
            </span>
          ) : null}
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute();
          }}
          aria-label={muted ? "Aktifkan suara Reel" : "Bisukan suara Reel"}
          className="pointer-events-auto grid size-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur-xs transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {muted ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
        </button>
      </div>

      {/* Center play/pause indicator when paused */}
      {!playing ? (
        <button
          type="button"
          onClick={togglePlayTap}
          aria-label="Putar video Reel"
          className="absolute left-1/2 top-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur-xs transition-transform hover:scale-105"
        >
          <Play className="ml-1 size-7 fill-current" aria-hidden="true" />
        </button>
      ) : (
        <span className="sr-only" aria-live="polite">
          Video diputar
        </span>
      )}

      {/* Right-side iconic vertical Reels action bar */}
      <div className="absolute bottom-24 right-2.5 z-10 flex flex-col items-center gap-3">
        <div className="relative">
          <AuthorAvatar
            displayName={post.author.displayName}
            avatarUrl={post.author.avatarUrl}
            size="md"
            showFollowBadge={!post.author.isSelf && !post.author.isFollowedByMe}
            onFollowClick={() => actions.onFollow(post.author.id)}
          />
        </div>

        <button
          type="button"
          onClick={() => actions.onLike(post)}
          aria-label={post.viewerLiked ? "Batal suka" : "Sukai Reel"}
          aria-pressed={post.viewerLiked}
          className="flex flex-col items-center gap-0.5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-lg"
        >
          <span
            className={cn(
              "grid size-11 place-items-center rounded-full bg-black/45 backdrop-blur-xs transition-transform active:scale-90",
              post.viewerLiked && "text-rose-400",
            )}
          >
            <Heart className={cn("size-5", post.viewerLiked && "fill-current")} aria-hidden="true" />
          </span>
          <span className="text-[11px] font-semibold tabular-nums drop-shadow">
            {formatCompactCount(post.likesCount) || "Suka"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onOpenReplies(post)}
          aria-label="Buka balasan Reel"
          className="flex flex-col items-center gap-0.5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-lg"
        >
          <span className="grid size-11 place-items-center rounded-full bg-black/45 backdrop-blur-xs transition-transform active:scale-90">
            <MessageCircle className="size-5" aria-hidden="true" />
          </span>
          <span className="text-[11px] font-semibold tabular-nums drop-shadow">
            {formatCompactCount(post.repliesCount) || "Balas"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => actions.onRepost(post)}
          aria-label="Posting ulang Reel"
          className={cn(
            "flex flex-col items-center gap-0.5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-lg",
            post.viewerReposted && "text-emerald-300",
          )}
        >
          <span className="grid size-11 place-items-center rounded-full bg-black/45 backdrop-blur-xs transition-transform active:scale-90">
            <Repeat2 className="size-5" aria-hidden="true" />
          </span>
          <span className="text-[11px] font-semibold tabular-nums drop-shadow">
            {formatCompactCount(post.repostsCount + post.quotesCount) || "Repost"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => actions.onBookmark(post)}
          aria-label={post.viewerBookmarked ? "Hapus simpanan" : "Simpan Reel"}
          className="grid size-11 place-items-center rounded-full bg-black/45 text-white backdrop-blur-xs transition-transform active:scale-90"
        >
          <Bookmark className={cn("size-5", post.viewerBookmarked && "fill-current")} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => onOpenShare(post)}
          aria-label="Bagikan Reel"
          className="grid size-11 place-items-center rounded-full bg-black/45 text-white backdrop-blur-xs transition-transform active:scale-90"
        >
          <Send className="size-4" aria-hidden="true" />
        </button>
      </div>

      {/* Bottom-left metadata + Auto-DM pill + Shoppable Product overlay */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-4 pt-14 pr-16 text-white">
        <div className="pointer-events-auto space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              to="/u/$handle"
              params={{ handle: post.author.handle }}
              className="text-sm font-bold hover:underline"
            >
              @{post.author.handle}
            </Link>
            {post.author.verifiedStore ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/25 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                <BadgeCheck className="size-3" aria-hidden="true" />
                {post.author.verifiedStore.name}
              </span>
            ) : null}
            {post.viewsCount > 0 ? (
              <span className="text-[11px] tabular-nums text-white/75">
                · {formatCompactCount(post.viewsCount)} ditonton
              </span>
            ) : null}
          </div>

          {post.body ? (
            <p className="line-clamp-3 text-xs leading-relaxed text-white/95">{post.body}</p>
          ) : null}

          {post.autoDm ? (
            <button
              type="button"
              onClick={() => onOpenReplies(post)}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/90 px-3 py-1 text-[11px] font-bold text-slate-950 transition-opacity hover:opacity-95"
            >
              <Zap className="size-3.5" aria-hidden="true" />
              <span>Balas "{post.autoDm.keyword}" untuk Auto-DM Chat</span>
            </button>
          ) : null}

          {post.attachedCommerce ? (
            <div className="pt-1 text-foreground">
              <ThreadCommerceCard item={post.attachedCommerce} compact />
            </div>
          ) : null}
        </div>
      </div>

      {/* Thin bottom progress bar */}
      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
        <div
          className="h-full bg-emerald-400 transition-[width] duration-150"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>

      {playing ? (
        <button
          type="button"
          onClick={togglePlayTap}
          aria-label="Jeda video Reel"
          className="sr-only"
        >
          <Pause className="size-4" />
        </button>
      ) : null}
    </article>
  );
}

/**
 * Vertical Snap-Scroll Reels feed rendered inside the `Reels` tab of Ebrystore Threads.
 */
export function ThreadsReelsFeed({
  items,
  actions,
  onCreateReel,
  onOpenReplies,
  onOpenShare,
}: {
  items: ThreadPostItem[];
  actions: ThreadCardActions;
  onCreateReel: () => void;
  onOpenReplies: (post: ThreadPostItem) => void;
  onOpenShare: (post: ThreadPostItem) => void;
}) {
  const [muted, setMuted] = useState(true);

  if (items.length === 0) {
    return (
      <div className="space-y-3 px-6 py-12 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-surface-selected text-accent">
          <Film className="size-6" aria-hidden="true" />
        </span>
        <h2 className="font-display text-sm font-bold text-foreground">
          Belum ada Video Reels
        </h2>
        <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
          Unggah video demo singkat produk digital, preview template, atau proses pengerjaan jasa
          (MP4/WebM maks 30 MB) lengkap dengan tombol Beli & Chat langsung.
        </p>
        <button
          type="button"
          onClick={onCreateReel}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-foreground px-5 text-xs font-bold text-background hover:opacity-90"
        >
          <Plus className="size-4" aria-hidden="true" />
          <span>Unggah Reel Pertama</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 px-3 py-4 sm:px-5">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border/80 bg-surface/60 px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <ShoppingBag className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="truncate">Demo produk digital & jasa dalam format video vertikal.</span>
        </div>
        <button
          type="button"
          onClick={onCreateReel}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-xs font-bold text-background hover:opacity-90"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          <span>Buat Reel</span>
        </button>
      </div>

      <div className="space-y-5 snap-y snap-mandatory">
        {items.map((post) => (
          <ReelPlayerCard
            key={post.id}
            post={post}
            actions={actions}
            muted={muted}
            onToggleMute={() => setMuted((m) => !m)}
            onOpenReplies={onOpenReplies}
            onOpenShare={onOpenShare}
          />
        ))}
      </div>
    </div>
  );
}

/** Compact inline Reel player when a Reel appears inside the main Threads `Untuk Anda` / `Mengikuti` feed. */
export function InlineReelPreview({ post }: { post: ThreadPostItem }) {
  const [muted, setMuted] = useState(true);
  if (!post.videoUrl) return null;

  return (
    <div className="relative mt-2.5 max-w-[340px] overflow-hidden rounded-2xl border border-border/80 bg-black">
      <video
        src={post.videoUrl}
        poster={post.videoPosterUrl ?? undefined}
        controls
        playsInline
        muted={muted}
        preload="metadata"
        className="max-h-[460px] w-full object-cover"
      />
      <div className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-xs">
        <Film className="size-3 text-emerald-400" aria-hidden="true" />
        <span>Reel</span>
        {post.videoDurationSec ? (
          <span className="tabular-nums opacity-85">· {formatVideoDuration(post.videoDurationSec)}</span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? "Aktifkan suara" : "Bisukan suara"}
        className="absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
      >
        {muted ? <VolumeX className="size-3.5" aria-hidden="true" /> : <Volume2 className="size-3.5" aria-hidden="true" />}
      </button>
      {post.attachedCommerce ? (
        <div className="pointer-events-none absolute bottom-12 left-2.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white">
          {formatRupiah(
            post.attachedCommerce.kind === "product"
              ? (post.attachedCommerce.discountPrice ?? post.attachedCommerce.price)
              : post.attachedCommerce.price,
          )}
        </div>
      ) : null}
    </div>
  );
}
