/**
 * Pure domain contracts, parsers, and formatters shared between
 * Threads + Reels backend (`social-threads.functions.ts`) and React UI (`components/threads/*`).
 */

export const THREAD_MAX_CHARS = 500;
export const THREAD_MAX_MEDIA = 4;
export const THREAD_MAX_CHAIN = 5;
export const REEL_MAX_BYTES = 30 * 1024 * 1024;
export const REEL_MAX_DURATION_SEC = 180;

export type ThreadFeedTab = "for_you" | "following" | "reels" | "commerce" | "bookmarks" | "mine";
export type ThreadReplyPolicy = "everyone" | "followers" | "mentioned";
export type ThreadReportReason = "spam" | "scam" | "harassment" | "inappropriate" | "other";
export type ThreadPostKind = "thread" | "reel";

export type SocialAuthor = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  followersCount: number;
  followingCount: number;
  isFollowedByMe: boolean;
  isSelf: boolean;
  verifiedStore: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
  } | null;
};

export type SocialMediaItem = {
  url: string;
  alt: string;
};

export type AttachedCommerceItem =
  | {
      kind: "product";
      id: string;
      slug: string;
      name: string;
      price: number;
      discountPrice: number | null;
      thumbnailUrl: string | null;
      storeId: string | null;
      storeName: string | null;
      storeSlug: string | null;
    }
  | {
      kind: "service";
      id: string;
      name: string;
      price: number;
      durationDays: number;
      revisionLimit: number;
      storeId: string | null;
      storeName: string | null;
      storeSlug: string | null;
    };

export type ThreadPollData = {
  options: Array<{ index: number; label: string; votes: number }>;
  totalVotes: number;
  viewerOption: number | null;
  expiresAt: string | null;
  expired: boolean;
};

export type ThreadAutoDmData = {
  keyword: string;
  triggeredCount: number;
};

export type ThreadFreebieData = {
  title: string;
  requiresFollow: boolean;
  unlocked: boolean;
  /** Only populated by server when `unlocked === true` (enforces follow-gate server-side!). */
  url: string | null;
};

export type EmbeddedQuotedPost = {
  id: string;
  body: string;
  media: SocialMediaItem[];
  createdAt: string;
  author: SocialAuthor;
  attachedCommerce: AttachedCommerceItem | null;
  deleted: boolean;
};

export type ThreadPostItem = {
  id: string;
  authorId: string;
  parentId: string | null;
  rootId: string | null;
  repostOfId: string | null;
  isRepostOnly: boolean;
  postKind: ThreadPostKind;
  videoUrl: string | null;
  videoPosterUrl: string | null;
  videoDurationSec: number | null;
  viewsCount: number;
  /** When `isRepostOnly` is true, `repostedBy` holds the reposter and main fields represent the target post. */
  repostedBy: {
    id: string;
    handle: string;
    displayName: string;
    repostedAt: string;
  } | null;
  /** Real row ID of the target post (for like/reply/repost/bookmark actions). */
  targetPostId: string;
  author: SocialAuthor;
  body: string;
  media: SocialMediaItem[];
  hashtags: string[];
  attachedCommerce: AttachedCommerceItem | null;
  quotedPost: EmbeddedQuotedPost | null;
  poll: ThreadPollData | null;
  autoDm: ThreadAutoDmData | null;
  freebie: ThreadFreebieData | null;
  /** True when the reply author owns a verified digital entitlement for the thread's attached product. */
  isVerifiedBuyer: boolean;
  replyPolicy: ThreadReplyPolicy;
  likesCount: number;
  repliesCount: number;
  repostsCount: number;
  quotesCount: number;
  bookmarksCount: number;
  viewerLiked: boolean;
  viewerReposted: boolean;
  viewerBookmarked: boolean;
  createdAt: string;
  feedSortAt: string;
  /** Replies preview avatars/count shown under root post with vertical thread rail. */
  replyPreviewAuthors: Array<{ id: string; displayName: string; avatarUrl: string | null }>;
};

export type ThreadFeedCursor = {
  createdAt: string;
  id: string;
};

export type TrendingHashtag = {
  tag: string;
  count: number;
};

export type SuggestedCreator = SocialAuthor;

export type BodyToken =
  | { kind: "text"; value: string }
  | { kind: "hashtag"; value: string; tag: string }
  | { kind: "mention"; value: string; handle: string }
  | { kind: "url"; value: string; href: string };

const HASHTAG_RE = /#([a-zA-Z0-9_]{2,32})/g;
const BODY_TOKEN_RE = /(https?:\/\/[^\s<>"'`]+)|#([a-zA-Z0-9_]{2,32})|@([a-zA-Z0-9._]{3,28})/g;

/** Extract normalized unique lowercase hashtags from post body (max 8). */
export function extractHashtags(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of body.matchAll(HASHTAG_RE)) {
    const tag = (m[1] ?? "").toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 8) break;
  }
  return out;
}

/** Normalize user handle into `[a-z0-9._]{3,28}` safe format. */
export function normalizeHandle(raw: string, fallbackSuffix = "user"): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9._]+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .replace(/[._]{2,}/g, "_");
  const base = cleaned.length >= 3 ? cleaned.slice(0, 28) : `${cleaned || "ebry"}_${fallbackSuffix}`;
  return base.slice(0, 28).replace(/[^a-z0-9._]/g, "");
}

/** Case-insensitive keyword trigger check for Auto-DM ("MAU", "TEMPLATE", etc.). */
export function matchesAutoDmKeyword(replyBody: string, keyword: string | null | undefined): boolean {
  const cleanKey = (keyword ?? "").trim().toLowerCase();
  if (cleanKey.length < 2) return false;
  const normalizedBody = replyBody.trim().toLowerCase();
  if (!normalizedBody) return false;
  const escaped = cleanKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^a-z0-9_])${escaped}($|[^a-z0-9_])`, "i");
  return re.test(normalizedBody);
}

/** Safe tokenizer for Threads body: clickable #hashtag, @mention, and https:// links (zero HTML injection). */
export function tokenizeThreadBody(body: string): BodyToken[] {
  if (!body) return [];
  const tokens: BodyToken[] = [];
  let lastIndex = 0;

  for (const match of body.matchAll(BODY_TOKEN_RE)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      tokens.push({ kind: "text", value: body.slice(lastIndex, idx) });
    }
    const [full, url, tag, handle] = match;
    if (url) {
      const trimmed = url.replace(/[),.!?;:]+$/, "");
      const trailing = url.slice(trimmed.length);
      if (/^https?:\/\//i.test(trimmed)) {
        tokens.push({ kind: "url", value: trimmed, href: trimmed });
      } else {
        tokens.push({ kind: "text", value: trimmed });
      }
      if (trailing) tokens.push({ kind: "text", value: trailing });
    } else if (tag) {
      tokens.push({ kind: "hashtag", value: full, tag: tag.toLowerCase() });
    } else if (handle) {
      tokens.push({ kind: "mention", value: full, handle: handle.toLowerCase() });
    }
    lastIndex = idx + full.length;
  }

  if (lastIndex < body.length) {
    tokens.push({ kind: "text", value: body.slice(lastIndex) });
  }
  return tokens;
}

/** Concise Threads-style relative timestamp in Bahasa Indonesia (`Baru saja`, `5m`, `3j`, `2h`, `12 Nov`). */
export function formatRelativeThreadTime(iso: string, nowMs = Date.now()): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "";
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 45) return "Baru saja";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}j`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}h`;
  return new Date(ts).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export function formatCompactCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  if (count < 1000) return String(count);
  if (count < 1_000_000) {
    const k = count / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")} rb`;
  }
  const m = count / 1_000_000;
  return `${m.toFixed(1).replace(/\.0$/, "")} jt`;
}

export function formatVideoDuration(sec: number | null | undefined): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return "";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

export function buildPublicThreadUrl(
  origin: string,
  postId: string,
  refHandle?: string | null,
): string {
  const base = `${origin.replace(/\/$/, "")}/t/${postId}`;
  if (refHandle && /^[a-z0-9._]{3,28}$/i.test(refHandle)) {
    return `${base}?ref=${encodeURIComponent(refHandle.toLowerCase())}`;
  }
  return base;
}

export function isSocialTableMissingError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null | undefined;
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "");
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "42883" ||
    msg.includes("does not exist") ||
    msg.includes("Could not find the table")
  );
}
