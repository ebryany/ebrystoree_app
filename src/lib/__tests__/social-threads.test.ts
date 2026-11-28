import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  doesRealtimeEventMatchPostIds,
  patchThreadAuthorFromProfileRow,
  patchThreadPostFromRealtimeRow,
  readThreadRealtimeSignal,
} from "../social-threads-realtime";
import {
  buildPublicThreadUrl,
  extractHashtags,
  formatCompactCount,
  formatRelativeThreadTime,
  formatVideoDuration,
  isSocialTableMissingError,
  matchesAutoDmKeyword,
  normalizeHandle,
  tokenizeThreadBody,
  type ThreadPostItem,
} from "../social-threads.shared";

describe("Threads shared domain parsers and formatters", () => {
  it("extracts normalized unique hashtags up to 8", () => {
    const body =
      "Baru rilis #TemplateWeb #templateweb #UIKit #Desain #Code #React #Supabase #Tailwind #Vite #Extra";
    const tags = extractHashtags(body);
    expect(tags).toHaveLength(8);
    expect(tags[0]).toBe("templateweb");
    expect(tags).toContain("uikit");
    expect(tags).not.toContain("extra");
  });

  it("normalizes user handles safely into lowercase [a-z0-9._]", () => {
    expect(normalizeHandle("  @Jimmy Market!!  ")).toBe("jimmy_market");
    expect(normalizeHandle("...a...")).toMatch(/^[a-z0-9._]{3,28}$/);
    expect(normalizeHandle("Toko.Digital-99")).toBe("toko.digital_99");
  });

  it("matches Auto-DM trigger keywords cleanly on word boundaries", () => {
    expect(matchesAutoDmKeyword("MAU kak!", "MAU")).toBe(true);
    expect(matchesAutoDmKeyword("saya mau dong template nya", "MAU")).toBe(true);
    expect(matchesAutoDmKeyword("terima kasih ya", "MAU")).toBe(false);
    expect(matchesAutoDmKeyword("mauka", "MAU")).toBe(false);
  });

  it("tokenizes hashtags, mentions, and https links safely without accepting javascript URLs", () => {
    const tokens = tokenizeThreadBody(
      "Cek #promo dari @jimmymarket di https://app.ebrystore.my.id/produk. Bukan javascript:alert(1)",
    );
    expect(tokens.some((t) => t.kind === "hashtag" && t.tag === "promo")).toBe(true);
    expect(tokens.some((t) => t.kind === "mention" && t.handle === "jimmymarket")).toBe(true);
    expect(
      tokens.some((t) => t.kind === "url" && t.href === "https://app.ebrystore.my.id/produk"),
    ).toBe(true);
    expect(tokens.some((t) => t.kind === "url" && t.href.startsWith("javascript:"))).toBe(false);
  });

  it("formats concise relative time, video duration, public share URL, and compact Indonesian counts", () => {
    const now = new Date("2026-11-27T12:00:00Z").getTime();
    expect(formatRelativeThreadTime("2026-11-27T11:59:40Z", now)).toBe("Baru saja");
    expect(formatRelativeThreadTime("2026-11-27T11:45:00Z", now)).toBe("15m");
    expect(formatRelativeThreadTime("2026-11-27T09:00:00Z", now)).toBe("3j");
    expect(formatRelativeThreadTime("2026-11-25T12:00:00Z", now)).toBe("2h");

    expect(formatVideoDuration(65)).toBe("1:05");
    expect(formatVideoDuration(9)).toBe("0:09");
    expect(buildPublicThreadUrl("https://app.ebrystore.my.id/", "abc-123", "Jimmy_Market")).toBe(
      "https://app.ebrystore.my.id/t/abc-123?ref=jimmy_market",
    );

    expect(formatCompactCount(0)).toBe("");
    expect(formatCompactCount(42)).toBe("42");
    expect(formatCompactCount(1500)).toBe("1.5 rb");
    expect(formatCompactCount(2_300_000)).toBe("2.3 jt");
  });

  it("detects missing table errors cleanly for pre-migration resilience", () => {
    expect(isSocialTableMissingError({ code: "42P01" })).toBe(true);
    expect(isSocialTableMissingError({ code: "PGRST205" })).toBe(true);
    expect(isSocialTableMissingError({ message: "relation social_posts does not exist" })).toBe(
      true,
    );
    expect(isSocialTableMissingError({ code: "23505" })).toBe(false);
  });
});

describe("Threads & Reels SQL migration security and realtime contracts", () => {
  const sqlV1 = readFileSync(
    "supabase/migrations/20261127140000_social_threads.sql",
    "utf8",
  );
  const sqlV2 = readFileSync(
    "supabase/migrations/20261127150000_social_threads_reels_interactive.sql",
    "utf8",
  );

  it("enables RLS on every social table including poll votes, freebies, and auto-dm ledger", () => {
    for (const table of [
      "social_profiles",
      "social_posts",
      "social_post_likes",
      "social_post_bookmarks",
      "social_follows",
      "social_post_reports",
    ]) {
      expect(sqlV1).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
    }
    expect(sqlV2).toContain("ALTER TABLE public.social_post_poll_votes ENABLE ROW LEVEL SECURITY;");
    expect(sqlV2).toContain("ALTER TABLE public.social_post_freebies ENABLE ROW LEVEL SECURITY;");
    expect(sqlV2).toContain(
      "ALTER TABLE public.social_post_auto_dm_deliveries ENABLE ROW LEVEL SECURITY;",
    );
    expect(sqlV2).toContain("REVOKE INSERT, UPDATE, DELETE ON public.social_posts FROM PUBLIC, anon, authenticated;");
    expect(sqlV2).toContain("REVOKE ALL ON public.social_post_freebies FROM PUBLIC, anon, authenticated;");
    expect(sqlV2).toContain("REVOKE ALL ON FUNCTION public.increment_social_post_view(uuid) FROM PUBLIC, anon, authenticated;");
    expect(sqlV2).toContain("CREATE OR REPLACE FUNCTION public.claim_social_auto_dm");
    expect(sqlV2).toContain("idx_product_inquiry_messages_client_id");
    expect(sqlV2).toContain("'social-reels'");
  });

  it("hardens SECURITY DEFINER toggle and poll RPCs with search_path and auth.uid() checks", () => {
    for (const fn of [
      "toggle_social_post_like",
      "toggle_social_post_bookmark",
      "toggle_social_post_repost",
      "toggle_social_follow",
    ]) {
      expect(sqlV1).toContain(`CREATE OR REPLACE FUNCTION public.${fn}`);
    }
    expect(sqlV2).toContain("CREATE OR REPLACE FUNCTION public.vote_social_poll");
    expect(sqlV2).toContain("CREATE OR REPLACE FUNCTION public.increment_social_post_view");
    expect(sqlV1).toContain("SET search_path = public");
    expect(sqlV2).toContain("SET search_path = public");
    expect(sqlV1).toContain("v_uid uuid := auth.uid();");
    expect(sqlV2).toContain("v_uid uuid := auth.uid();");
  });

  it("registers social_posts into supabase_realtime idempotently", () => {
    expect(sqlV1).toContain("tablename = 'social_posts'");
    expect(sqlV1).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.social_posts;");
  });
});

describe("Threads, Reels & Public Viral Routes security + engineering contracts", () => {
  const serverSrc = readFileSync("src/lib/social-threads.functions.ts", "utf8");
  const reelProxySrc = readFileSync("src/routes/api/public/social-reel.$.tsx", "utf8");
  const lightboxSrc = readFileSync("src/components/threads/thread-lightbox.tsx", "utf8");
  const composerSrc = readFileSync("src/components/threads/thread-composer.tsx", "utf8");
  const feedSrc = readFileSync("src/components/threads/threads-feed.tsx", "utf8");
  const cardSrc = readFileSync("src/components/threads/thread-card.tsx", "utf8");
  const reelsSrc = readFileSync("src/components/threads/threads-reels.tsx", "utf8");
  const shareSrc = readFileSync("src/components/threads/thread-share-card.tsx", "utf8");
  const railSrc = readFileSync("src/components/threads/threads-right-rail.tsx", "utf8");
  const publicThreadSrc = readFileSync("src/routes/t.$id.tsx", "utf8");
  const publicCreatorSrc = readFileSync("src/routes/u.$handle.tsx", "utf8");
  const profileViewSrc = readFileSync("src/components/threads/threads-profile-view.tsx", "utf8");
  const navRailSrc = readFileSync("src/components/threads/threads-nav-rail.tsx", "utf8");
  const myProfileRouteSrc = readFileSync("src/routes/_authenticated/dashboard.profil.tsx", "utf8");
  const dashboardIndexSrc = readFileSync(
    "src/routes/_authenticated/dashboard.index.tsx",
    "utf8",
  );
  const dashboardLayoutSrc = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");
  const stylesSrc = readFileSync("src/styles.css", "utf8");

  it("never exposes profiles.email or profiles.phone and enforces server-side Freebie gate + Auto-DM", () => {
    expect(serverSrc).toContain("requireSupabaseAuth");
    expect(serverSrc).toContain("enforceRateLimit");
    expect(serverSrc).toContain("persistCatalogImage");
    expect(serverSrc).toContain('await import("@/integrations/supabase/client.server")');
    expect(serverSrc).toContain("triggerAutoDmIfMatched");
    expect(serverSrc).toContain("claim_social_auto_dm");
    expect(serverSrc).toContain("social_post_freebies");
    expect(serverSrc).toContain("digital_entitlements");
    expect(serverSrc).toContain("url: unlocked ? String(freebieRow.url) : null");
    expect(serverSrc).not.toMatch(/\.from\("profiles"\)\s*\.select\([^)]*(email|phone)/);
  });

  it("streams Reels with strict UUID path regex and HTTP Range support", () => {
    expect(reelProxySrc).toContain("Accept-Ranges");
    expect(reelProxySrc).toContain("Content-Range");
    expect(reelProxySrc).toContain("social-reels");
    expect(reelProxySrc).toContain("X-Content-Type-Options");
  });

  it("follows modern-web-guidance for modal <dialog>, field-sizing, and off-screen content-visibility", () => {
    expect(lightboxSrc).toContain("<dialog");
    expect(lightboxSrc).toContain("dialog.showModal()");
    expect(lightboxSrc).toContain('closedby: "any"');
    expect(lightboxSrc).toContain("getBoundingClientRect()");
    expect(lightboxSrc).not.toContain('role="dialog"');
    expect(lightboxSrc).not.toContain("aria-modal");
    expect(stylesSrc).toContain("dialog:modal");
    expect(stylesSrc).toContain("overscroll-behavior: contain");
    expect(stylesSrc).toContain("field-sizing: content");
    expect(stylesSrc).toContain("content-visibility: auto");
    expect(composerSrc).toContain("threads-textarea");
    expect(reelsSrc).toContain("reels-card");
    expect(reelsSrc).toContain("IntersectionObserver");
  });

  it("provides inline rail replies, public /t/$id + /u/$handle routes, and Share Card PNG", () => {
    expect(cardSrc).toContain("getThreadReplies");
    expect(cardSrc).toContain("Pembeli Terverifikasi");
    expect(cardSrc).toContain("ThreadPollWidget");
    expect(cardSrc).toContain("ThreadFreebieCard");
    expect(publicThreadSrc).toContain("getPublicThread");
    expect(publicCreatorSrc).toContain("ThreadsProfileView");
    expect(myProfileRouteSrc).toContain("ThreadsProfileView");
    expect(profileViewSrc).toContain("Edit profil");
    expect(navRailSrc).toContain("ThreadsDesktopRail");
    expect(navRailSrc).toContain("ThreadsMobileDock");
    expect(shareSrc).toContain("renderShareCardToCanvas");
    expect(dashboardIndexSrc).toContain("<ThreadsFeedView />");
    expect(dashboardLayoutSrc).toContain("isChatThreadMobile");
    expect(dashboardLayoutSrc).toContain("ThreadsDesktopRail");
    expect(dashboardLayoutSrc).toContain("ThreadsMobileDock");
  });

  it("contains zero em dashes and never leaks internal SQL/migration/Supabase details to users", () => {
    for (const src of [
      lightboxSrc,
      composerSrc,
      feedSrc,
      cardSrc,
      reelsSrc,
      shareSrc,
      railSrc,
      profileViewSrc,
      navRailSrc,
      myProfileRouteSrc,
      publicThreadSrc,
      publicCreatorSrc,
      dashboardIndexSrc,
    ]) {
      expect(src).not.toContain("\u2014");
    }
    for (const src of [feedSrc, serverSrc, publicThreadSrc, publicCreatorSrc]) {
      expect(src).not.toContain("20261127140000_social_threads.sql");
      expect(src).not.toContain("20261127150000_social_threads_reels_interactive.sql");
      expect(src).not.toContain("Skema Database");
      expect(src).not.toContain("Supabase produksi");
    }
  });
});

describe("Chat principal engineering upgrade contracts", () => {
  const inquiriesSrc = readFileSync("src/lib/inquiries.functions.ts", "utf8");
  const threadSrc = readFileSync("src/components/inquiry/inquiry-thread.tsx", "utf8");
  const windowSrc = readFileSync("src/components/chat/chat-window.tsx", "utf8");
  const splitSrc = readFileSync("src/components/chat/chat-split.tsx", "utf8");

  it("enforces server-side idempotency and 0ms optimistic reconciliation on send", () => {
    expect(inquiriesSrc).toContain("clientMessageId");
    expect(inquiriesSrc).toContain("lookupRecentClientMessage");
    expect(threadSrc).toContain("clientMessageId: tempId");
    expect(threadSrc).toContain("realtimeStatusKey(realtimeChannel)");
  });

  it("provides Realtime telemetry, ArrowUp quick-edit, Ctrl+F search, and Ctrl+K switcher", () => {
    expect(windowSrc).toContain("realtimeStatus");
    expect(windowSrc).toContain("lastEditableMessage");
    expect(windowSrc).toContain('event.key === "ArrowUp"');
    expect(windowSrc).toContain('e.key.toLowerCase() === "f"');
    expect(splitSrc).toContain('e.key.toLowerCase() === "k"');
  });
});

describe("Threads multi-user realtime patching and publication contracts", () => {
  const rtHookSrc = readFileSync("src/hooks/use-realtime-refresh.ts", "utf8");
  const sqlRt = readFileSync(
    "supabase/migrations/20261128003000_social_threads_realtime_full.sql",
    "utf8",
  );
  const feedSrc = readFileSync("src/components/threads/threads-feed.tsx", "utf8");
  const cardSrc = readFileSync("src/components/threads/thread-card.tsx", "utf8");
  const profileSrc = readFileSync("src/components/threads/threads-profile-view.tsx", "utf8");

  const samplePost: ThreadPostItem = {
    id: "post-1",
    authorId: "user-a",
    targetPostId: "post-1",
    parentId: null,
    rootId: null,
    repostOfId: null,
    isRepostOnly: false,
    postKind: "thread",
    videoUrl: null,
    videoPosterUrl: null,
    videoDurationSec: null,
    viewsCount: 10,
    autoDm: { keyword: "MAU", triggeredCount: 1 },
    poll: null,
    freebie: null,
    isVerifiedBuyer: false,
    body: "Halo dunia",
    media: [],
    hashtags: [],
    replyPolicy: "everyone",
    likesCount: 3,
    repliesCount: 1,
    repostsCount: 2,
    quotesCount: 0,
    bookmarksCount: 0,
    createdAt: "2026-11-27T10:00:00Z",
    feedSortAt: "2026-11-27T10:00:00Z",
    author: {
      id: "user-a",
      handle: "kreator_a",
      displayName: "Kreator A",
      avatarUrl: null,
      bio: "Bio lama",
      followersCount: 12,
      followingCount: 3,
      isFollowedByMe: false,
      isSelf: false,
      verifiedStore: null,
    },
    repostedBy: null,
    quotedPost: {
      id: "quote-1",
      body: "Post dikutip",
      media: [],
      createdAt: "2026-11-27T09:00:00Z",
      author: {
        id: "user-b",
        handle: "kreator_b",
        displayName: "Kreator B",
        avatarUrl: null,
        bio: "",
        followersCount: 4,
        followingCount: 2,
        isFollowedByMe: false,
        isSelf: false,
        verifiedStore: null,
      },
      attachedCommerce: null,
      deleted: false,
    },
    attachedCommerce: null,
    viewerLiked: false,
    viewerBookmarked: false,
    viewerReposted: false,
    replyPreviewAuthors: [],
  };

  it("patches counters in-place on multi-user UPDATE and removes soft-deleted posts", () => {
    const updated = patchThreadPostFromRealtimeRow(samplePost, {
      id: "post-1",
      likes_count: 9,
      replies_count: 4,
      reposts_count: 5,
      quotes_count: 2,
      views_count: 42,
      auto_dm_count: 3,
      deleted_at: null,
    });
    expect(updated).not.toBeNull();
    expect(updated?.likesCount).toBe(9);
    expect(updated?.repliesCount).toBe(4);
    expect(updated?.repostsCount).toBe(5);
    expect(updated?.quotesCount).toBe(2);
    expect(updated?.viewsCount).toBe(42);
    expect(updated?.autoDm?.triggeredCount).toBe(3);

    const deleted = patchThreadPostFromRealtimeRow(samplePost, {
      id: "post-1",
      deleted_at: "2026-11-27T12:00:00Z",
    });
    expect(deleted).toBeNull();

    const quoteDeleted = patchThreadPostFromRealtimeRow(samplePost, {
      id: "quote-1",
      deleted_at: "2026-11-27T12:05:00Z",
    });
    expect(quoteDeleted?.quotedPost?.deleted).toBe(true);
  });

  it("patches creator follower count and matches visible post IDs for poll votes", () => {
    const patched = patchThreadAuthorFromProfileRow(samplePost, {
      user_id: "user-a",
      followers_count: 25,
      bio: "Bio baru",
    });
    expect(patched.author.followersCount).toBe(25);
    expect(patched.author.bio).toBe("Bio baru");

    const ids = new Set(["post-1", "quote-1"]);
    expect(doesRealtimeEventMatchPostIds("social_thread_realtime_signals", { post_id: "post-1" }, ids)).toBe(
      true,
    );
    expect(doesRealtimeEventMatchPostIds("social_thread_realtime_signals", { post_id: "other" }, ids)).toBe(
      false,
    );
    expect(doesRealtimeEventMatchPostIds("social_posts", { parent_id: "post-1" }, ids)).toBe(true);
  });

  it("does not use post metadata to handle delete signals", () => {
    expect(readThreadRealtimeSignal({ kind: "deleted", post_id: "ignored" })).toEqual({
      kind: "deleted",
    });
    expect(readThreadRealtimeSignal({ kind: "poll", post_id: "post-1", user_id: "ignored" })).toEqual({
      kind: "poll",
      postId: "post-1",
      parentId: null,
    });
    expect(readThreadRealtimeSignal({ kind: "poll" })).toBeNull();
  });

  it("wires Threads consumers to sanitized Realtime signals instead of raw votes", () => {
    const signalSql = readFileSync(
      "supabase/migrations/20261128010000_social_threads_realtime_signals.sql",
      "utf8",
    );
    expect(rtHookSrc).toContain("table: payload.table ?? table");
    expect(sqlRt).toContain("'social_posts', 'social_profiles'");
    expect(sqlRt).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.%I");
    expect(signalSql).toContain("DROP TABLE public.social_post_poll_votes");
    expect(signalSql).toContain("REVOKE SELECT ON public.social_post_poll_votes FROM PUBLIC, anon, authenticated");
    expect(signalSql).toContain("ADD TABLE public.social_thread_realtime_signals");
    expect(signalSql.slice(0, signalSql.indexOf("ALTER TABLE"))).not.toMatch(/user_id|option_index/);
    expect(feedSrc).toContain("patchThreadPostFromRealtimeRow");
    expect(feedSrc).toContain("dispatchThreadsReplyLive");
    expect(cardSrc).toContain("THREADS_REPLY_LIVE_EVENT");
    expect(profileSrc).toContain("useRealtimeRefresh");
    for (const source of [feedSrc, profileSrc]) {
      expect(source).toContain("onResync:");
      expect(source).not.toContain('"social_post_poll_votes"');
    }
  });
});
