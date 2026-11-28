import type { SocialAuthor, ThreadPostItem } from "./social-threads.shared";

export const THREADS_REPLY_LIVE_EVENT = "ebry:threads-reply-live";
export const THREADS_POST_DELETED_EVENT = "ebry:threads-post-deleted";
export const THREADS_REPLIES_RESYNC_EVENT = "ebry:threads-replies-resync";
export const THREADS_REALTIME_SIGNALS = "social_thread_realtime_signals";

export type ThreadsReplyLiveDetail = {
  parentId: string;
  rootId: string | null;
  postId: string;
  authorId: string | null;
};

export type ThreadsPostDeletedDetail = {
  postId: string;
  parentId: string | null;
};

export function dispatchThreadsReplyLive(detail: ThreadsReplyLiveDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ThreadsReplyLiveDetail>(THREADS_REPLY_LIVE_EVENT, { detail }));
}

export function dispatchThreadsPostDeleted(detail: ThreadsPostDeletedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ThreadsPostDeletedDetail>(THREADS_POST_DELETED_EVENT, { detail }),
  );
}

export function dispatchThreadsRepliesResync(parentId: string | null = null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(THREADS_REPLIES_RESYNC_EVENT, { detail: parentId }));
}

export function readThreadRealtimeSignal(row: Record<string, unknown> | null) {
  if (row?.kind === "deleted") return { kind: "deleted" } as const;
  if (!row || typeof row.post_id !== "string" || !row.post_id) return null;
  if (row.kind !== "poll") return null;
  return {
    kind: row.kind,
    postId: row.post_id,
    parentId: typeof row.parent_id === "string" ? row.parent_id : null,
  } as const;
}

function numOrKeep(nextVal: unknown, fallback: number): number {
  return typeof nextVal === "number" && Number.isFinite(nextVal) ? Math.max(0, nextVal) : fallback;
}

function patchAuthor(author: SocialAuthor, row: Record<string, unknown>): SocialAuthor {
  const userId = typeof row.user_id === "string" ? row.user_id : "";
  if (!userId || author.id !== userId) return author;

  const nextFollowers = numOrKeep(row.followers_count, author.followersCount);
  const nextFollowing = numOrKeep(row.following_count, author.followingCount);
  const nextDisplayName =
    typeof row.display_name === "string" && row.display_name.trim()
      ? row.display_name.trim()
      : author.displayName;
  const nextBio = typeof row.bio === "string" ? row.bio : row.bio === null ? "" : author.bio;

  if (
    nextFollowers === author.followersCount &&
    nextFollowing === author.followingCount &&
    nextDisplayName === author.displayName &&
    nextBio === author.bio
  ) {
    return author;
  }

  return {
    ...author,
    followersCount: nextFollowers,
    followingCount: nextFollowing,
    displayName: nextDisplayName,
    bio: nextBio,
  };
}

/**
 * Applies counter changes to the cache without refetching the feed.
 * Returns `null` if the post (or its underlying repost target) was soft-deleted.
 */
export function patchThreadPostFromRealtimeRow(
  item: ThreadPostItem,
  row: Record<string, unknown>,
): ThreadPostItem | null {
  const rowId = typeof row.id === "string" ? row.id : "";
  if (!rowId) return item;

  const isDeleted = row.deleted_at !== null && row.deleted_at !== undefined;
  const matchesSelf = item.id === rowId || item.targetPostId === rowId;

  if (matchesSelf) {
    if (isDeleted) return null;
    const nextLikes = numOrKeep(row.likes_count, item.likesCount);
    const nextReplies = numOrKeep(row.replies_count, item.repliesCount);
    const nextReposts = numOrKeep(row.reposts_count, item.repostsCount);
    const nextQuotes = numOrKeep(row.quotes_count, item.quotesCount);
    const nextViews = numOrKeep(row.views_count, item.viewsCount);
    const nextAutoDmCount = item.autoDm
      ? numOrKeep(row.auto_dm_count, item.autoDm.triggeredCount)
      : 0;

    const changed =
      nextLikes !== item.likesCount ||
      nextReplies !== item.repliesCount ||
      nextReposts !== item.repostsCount ||
      nextQuotes !== item.quotesCount ||
      nextViews !== item.viewsCount ||
      (item.autoDm && nextAutoDmCount !== item.autoDm.triggeredCount);

    if (!changed) return item;
    return {
      ...item,
      likesCount: nextLikes,
      repliesCount: nextReplies,
      repostsCount: nextReposts,
      quotesCount: nextQuotes,
      viewsCount: nextViews,
      autoDm: item.autoDm ? { ...item.autoDm, triggeredCount: nextAutoDmCount } : null,
    };
  }

  if (item.quotedPost && item.quotedPost.id === rowId && isDeleted && !item.quotedPost.deleted) {
    return {
      ...item,
      quotedPost: { ...item.quotedPost, deleted: true },
    };
  }

  return item;
}

/**
 * Applies a live `social_profiles` UPDATE row onto matching authors in a cached
 * `ThreadPostItem` (e.g. follower count changes when multiple users follow a creator).
 */
export function patchThreadAuthorFromProfileRow(
  item: ThreadPostItem,
  row: Record<string, unknown>,
): ThreadPostItem {
  const nextAuthor = patchAuthor(item.author, row);
  const nextQuotedAuthor = item.quotedPost ? patchAuthor(item.quotedPost.author, row) : null;

  if (nextAuthor === item.author && (!item.quotedPost || nextQuotedAuthor === item.quotedPost.author)) {
    return item;
  }

  return {
    ...item,
    author: nextAuthor,
    quotedPost:
      item.quotedPost && nextQuotedAuthor
        ? { ...item.quotedPost, author: nextQuotedAuthor }
        : item.quotedPost,
  };
}

/** Checks whether a Realtime poll vote or post row touches any currently visible post IDs. */
export function doesRealtimeEventMatchPostIds(
  table: string,
  row: Record<string, unknown> | null,
  postIds: ReadonlySet<string>,
): boolean {
  if (!row || postIds.size === 0) return false;
  if (table === THREADS_REALTIME_SIGNALS) {
    return typeof row.post_id === "string" && postIds.has(row.post_id);
  }
  if (table === "social_posts") {
    return (
      (typeof row.id === "string" && postIds.has(row.id)) ||
      (typeof row.parent_id === "string" && postIds.has(row.parent_id)) ||
      (typeof row.root_id === "string" && postIds.has(row.root_id))
    );
  }
  return false;
}
