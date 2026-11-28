import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { priceDetails } from "@/lib/format";
import { enforceRateLimit } from "./rate-limit.server";
import {
  REEL_MAX_BYTES,
  REEL_MAX_DURATION_SEC,
  THREAD_MAX_CHAIN,
  THREAD_MAX_CHARS,
  THREAD_MAX_MEDIA,
  extractHashtags,
  isSocialTableMissingError,
  matchesAutoDmKeyword,
  normalizeHandle,
  type AttachedCommerceItem,
  type EmbeddedQuotedPost,
  type SocialAuthor,
  type SocialMediaItem,
  type SuggestedCreator,
  type ThreadFeedCursor,
  type ThreadPollData,
  type ThreadPostItem,
  type TrendingHashtag,
} from "./social-threads.shared";

type Ctx = { supabase: any; userId: string };

const FEED_PAGE_SIZE = 20;

const REEL_MIME_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};

const mediaItemSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine(
      (u) => u.startsWith("/api/public/catalog-image/social/"),
      "URL gambar utas harus berasal dari unggahan resmi Ebrystore.",
    ),
  alt: z.string().trim().max(180).default(""),
});

const postSegmentSchema = z
  .object({
    body: z.string().trim().max(THREAD_MAX_CHARS).default(""),
    media: z.array(mediaItemSchema).max(THREAD_MAX_MEDIA).default([]),
    postKind: z.enum(["thread", "reel"]).default("thread"),
    videoUrl: z
      .string()
      .trim()
      .max(500)
      .refine(
        (u) => u.startsWith("/api/public/social-reel/"),
        "URL video Reel harus berasal dari unggahan resmi Ebrystore.",
      )
      .nullable()
      .optional(),
    videoPosterUrl: z
      .string()
      .trim()
      .max(500)
      .refine(
        (u) => u.startsWith("/api/public/catalog-image/social/"),
        "Poster video tidak valid.",
      )
      .nullable()
      .optional(),
    videoDurationSec: z.number().int().min(1).max(REEL_MAX_DURATION_SEC).nullable().optional(),
    attachedProductId: z.string().uuid().nullable().optional(),
    attachedServiceId: z.string().uuid().nullable().optional(),
    pollOptions: z.array(z.string().trim().min(1).max(60)).min(2).max(4).nullable().optional(),
    pollDurationHours: z.number().int().min(1).max(168).optional(),
    autoDmKeyword: z.string().trim().min(2).max(32).nullable().optional(),
    autoDmMessage: z.string().trim().min(3).max(500).nullable().optional(),
    freebieTitle: z.string().trim().min(2).max(120).nullable().optional(),
    freebieUrl: z
      .string()
      .trim()
      .max(500)
      .refine((u) => /^https?:\/\/[^/\s]+/i.test(u), "Tautan file gratis harus diawali https://.")
      .nullable()
      .optional(),
    freebieRequiresFollow: z.boolean().optional(),
  })
  .refine(
    (s) =>
      s.body.length > 0 ||
      s.media.length > 0 ||
      Boolean(s.videoUrl) ||
      Boolean(s.pollOptions?.length) ||
      Boolean(s.freebieUrl) ||
      Boolean(s.attachedProductId) ||
      Boolean(s.attachedServiceId),
    "Setiap utas harus berisi teks, foto, video Reel, polling, atau tautan produk/jasa.",
  );

const POST_SELECT_V2 =
  "id, author_id, parent_id, root_id, repost_of_id, is_repost_only, post_kind, " +
  "video_url, video_poster_url, video_duration_sec, views_count, " +
  "auto_dm_keyword, auto_dm_message, auto_dm_count, poll_options, poll_expires_at, " +
  "has_freebie, " +
  "body, media, hashtags, attached_product_id, attached_service_id, attached_store_id, " +
  "reply_policy, likes_count, replies_count, reposts_count, quotes_count, bookmarks_count, created_at";

const POST_SELECT_V1 =
  "id, author_id, parent_id, root_id, repost_of_id, is_repost_only, body, media, hashtags, " +
  "attached_product_id, attached_service_id, attached_store_id, reply_policy, " +
  "likes_count, replies_count, reposts_count, quotes_count, bookmarks_count, created_at";

function isMissingV2ColumnError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null | undefined;
  return String(e?.code ?? "") === "42703" || String(e?.message ?? "").includes("column");
}

/** Untyped admin client helper for `social_*` tables prior to Supabase generated type refresh. */
async function getAdminDb(): Promise<any> {
  const mod = await import("@/integrations/supabase/client.server");
  return mod.supabaseAdmin as any;
}

// Short-lived in-memory cache for OAuth profile photos (`auth.users.raw_user_meta_data`)
// when `profiles.avatar_url` has not been manually uploaded yet.
const OAUTH_AVATAR_CACHE = new Map<string, { url: string | null; expiresAt: number }>();

async function fetchOAuthAvatars(supabaseAdmin: any, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const now = Date.now();
  const toLookup: string[] = [];

  for (const uid of userIds.slice(0, 12)) {
    const cached = OAUTH_AVATAR_CACHE.get(uid);
    if (cached && cached.expiresAt > now) {
      if (cached.url) out.set(uid, cached.url);
    } else {
      toLookup.push(uid);
    }
  }

  if (toLookup.length) {
    await Promise.all(
      toLookup.map(async (uid) => {
        try {
          const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
          const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
          const raw =
            (typeof meta.avatar_url === "string" && meta.avatar_url) ||
            (typeof meta.picture === "string" && meta.picture) ||
            null;
          const safe = raw && /^https?:\/\//i.test(raw) ? raw : null;
          OAUTH_AVATAR_CACHE.set(uid, { url: safe, expiresAt: now + 5 * 60_000 });
          if (safe) out.set(uid, safe);
        } catch {
          OAUTH_AVATAR_CACHE.set(uid, { url: null, expiresAt: now + 60_000 });
        }
      }),
    );
  }

  return out;
}

/** Resolve optional authenticated user ID (for public routes `/t/$id` and `/u/$handle`). */
async function getOptionalViewerId(): Promise<string | null> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const authHeader = getRequest()?.headers?.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7).trim();
    if (!token || token.split(".").length !== 3) return null;
    const supabaseAdmin = await getAdminDb();
    const { data } = await supabaseAdmin.auth.getUser(token);
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Ensures caller has a public-safe `social_profiles` row (zero private contact data). */
async function ensureMySocialProfile(userId: string) {
  const supabaseAdmin = await getAdminDb();
  const { data: existing, error: selErr } = await supabaseAdmin
    .from("social_profiles")
    .select("user_id, handle, display_name, bio, followers_count, following_count")
    .eq("user_id", userId)
    .maybeSingle();

  if (selErr) {
    if (isSocialTableMissingError(selErr)) return { setupRequired: true as const, profile: null };
    throw selErr;
  }
  if (existing) return { setupRequired: false as const, profile: existing };

  const [{ data: baseProfile }, { data: store }] = await Promise.all([
    supabaseAdmin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    supabaseAdmin
      .from("stores")
      .select("name, slug, status")
      .eq("owner_id", userId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  const suffix = userId.replace(/-/g, "").slice(0, 5);
  const rawName = (baseProfile?.full_name || store?.name || "Pengguna Ebrystore").trim();
  const preferredBase = normalizeHandle(store?.slug || rawName, suffix);

  for (const candidate of [preferredBase, `${preferredBase.slice(0, 22)}_${suffix}`]) {
    const { data: inserted, error } = await supabaseAdmin
      .from("social_profiles")
      .insert({
        user_id: userId,
        handle: candidate,
        display_name: rawName.slice(0, 60),
        bio: "",
      })
      .select("user_id, handle, display_name, bio, followers_count, following_count")
      .maybeSingle();
    if (!error && inserted) return { setupRequired: false as const, profile: inserted };
    if (error && error.code !== "23505") {
      if (isSocialTableMissingError(error)) return { setupRequired: true as const, profile: null };
      break;
    }
  }

  const { data: fallback } = await supabaseAdmin
    .from("social_profiles")
    .select("user_id, handle, display_name, bio, followers_count, following_count")
    .eq("user_id", userId)
    .maybeSingle();

  return { setupRequired: false as const, profile: fallback };
}

/**
 * Hydrates public-safe `SocialAuthor` maps for a batch of user IDs (works for both signed-in and guest viewers).
 * Strictly reads only public display fields (`full_name`, `avatar_url`) and active `stores`.
 */
async function hydrateAuthors(
  userIds: string[],
  viewerId: string | null,
): Promise<Map<string, SocialAuthor>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  const map = new Map<string, SocialAuthor>();
  if (!uniqueIds.length) return map;

  const supabaseAdmin = await getAdminDb();

  const [{ data: socialRows }, { data: profileRows }, { data: storeRows }, followRes] =
    await Promise.all([
      supabaseAdmin
        .from("social_profiles")
        .select("user_id, handle, display_name, bio, followers_count, following_count")
        .in("user_id", uniqueIds),
      supabaseAdmin.from("profiles").select("id, full_name, avatar_url").in("id", uniqueIds),
      supabaseAdmin
        .from("stores")
        .select("id, owner_id, name, slug, logo_url, status")
        .in("owner_id", uniqueIds)
        .eq("status", "active"),
      viewerId
        ? supabaseAdmin
            .from("social_follows")
            .select("following_id")
            .eq("follower_id", viewerId)
            .in("following_id", uniqueIds)
        : Promise.resolve({ data: [] }),
    ]);

  const socialById = new Map<string, any>((socialRows ?? []).map((r: any) => [r.user_id, r]));
  const profileById = new Map<string, any>((profileRows ?? []).map((r: any) => [r.id, r]));
  const storeByOwner = new Map<string, any>((storeRows ?? []).map((s: any) => [s.owner_id, s]));
  const followingSet = new Set<string>((followRes.data ?? []).map((f: any) => f.following_id));

  const AVATAR_PREFIX = "/api/public/avatar/";
  const avatarPaths: string[] = [];
  const missingAvatarUserIds: string[] = [];
  for (const uid of uniqueIds) {
    const raw = profileById.get(uid)?.avatar_url as string | null | undefined;
    if (raw && raw.startsWith(AVATAR_PREFIX)) {
      avatarPaths.push(raw.slice(AVATAR_PREFIX.length));
    } else if (!raw) {
      missingAvatarUserIds.push(uid);
    }
  }
  const signedAvatars = new Map<string, string>();
  const [, oauthAvatars] = await Promise.all([
    avatarPaths.length
      ? (async () => {
          try {
            const { data: signed } = await supabaseAdmin.storage
              .from("avatars")
              .createSignedUrls(Array.from(new Set(avatarPaths)), 1800);
            for (const s of (signed ?? []) as Array<{ path?: string; signedUrl?: string }>) {
              if (s.path && s.signedUrl) signedAvatars.set(s.path, s.signedUrl);
            }
          } catch {
            /* fallback ke OAuth / inisial */
          }
        })()
      : Promise.resolve(),
    missingAvatarUserIds.length
      ? fetchOAuthAvatars(supabaseAdmin, missingAvatarUserIds)
      : Promise.resolve(new Map<string, string>()),
  ]);

  for (const uid of uniqueIds) {
    const sp = socialById.get(uid);
    const pr = profileById.get(uid);
    const st = storeByOwner.get(uid);

    const rawAvatar = pr?.avatar_url as string | null | undefined;
    let avatarUrl: string | null = null;
    if (rawAvatar) {
      if (rawAvatar.startsWith(AVATAR_PREFIX)) {
        avatarUrl = signedAvatars.get(rawAvatar.slice(AVATAR_PREFIX.length)) ?? null;
      } else if (/^(\/|https?:\/\/)/i.test(rawAvatar)) {
        avatarUrl = rawAvatar;
      }
    }
    if (!avatarUrl) avatarUrl = oauthAvatars.get(uid) ?? null;
    if (!avatarUrl && st?.logo_url) avatarUrl = st.logo_url;

    const displayName = (
      sp?.display_name ||
      pr?.full_name ||
      st?.name ||
      "Pengguna Ebrystore"
    ).trim();
    const suffix = uid.replace(/-/g, "").slice(0, 5);
    const handle = sp?.handle || normalizeHandle(st?.slug || displayName, suffix);

    map.set(uid, {
      id: uid,
      handle,
      displayName,
      avatarUrl,
      bio: String(sp?.bio ?? ""),
      followersCount: Number(sp?.followers_count ?? 0),
      followingCount: Number(sp?.following_count ?? 0),
      isFollowedByMe: followingSet.has(uid),
      isSelf: Boolean(viewerId && uid === viewerId),
      verifiedStore: st
        ? {
            id: st.id,
            name: st.name,
            slug: st.slug,
            logoUrl: st.logo_url ?? null,
          }
        : null,
    });
  }

  return map;
}

/** Hydrates authoritative commerce cards (products & approved services) in batch. */
async function hydrateCommerceAttachments(posts: any[]): Promise<{
  products: Map<string, AttachedCommerceItem>;
  services: Map<string, AttachedCommerceItem>;
}> {
  const productIds = Array.from(
    new Set(posts.map((p) => p.attached_product_id).filter((x): x is string => Boolean(x))),
  );
  const serviceIds = Array.from(
    new Set(posts.map((p) => p.attached_service_id).filter((x): x is string => Boolean(x))),
  );
  const products = new Map<string, AttachedCommerceItem>();
  const services = new Map<string, AttachedCommerceItem>();
  if (!productIds.length && !serviceIds.length) return { products, services };

  const supabaseAdmin = await getAdminDb();
  const [prodRes, svcRes] = await Promise.all([
    productIds.length
      ? supabaseAdmin
          .from("digital_products")
          .select("id, slug, name, price, discount_price, thumbnail_url, store_id, stores(name, slug)")
          .in("id", productIds)
          .eq("status", "published")
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    serviceIds.length
      ? supabaseAdmin
          .from("marketplace_services")
          .select("id, name, price, agreement, store_id, stores(name, slug)")
          .in("id", serviceIds)
          .eq("status", "approved")
      : Promise.resolve({ data: [] }),
  ]);

  for (const p of (prodRes.data ?? []) as any[]) {
    const pd = priceDetails(p.price, p.discount_price);
    products.set(p.id, {
      kind: "product",
      id: p.id,
      slug: p.slug,
      name: p.name,
      price: pd.basePrice,
      discountPrice: pd.hasDiscount ? pd.price : null,
      thumbnailUrl: p.thumbnail_url ?? null,
      storeId: p.store_id ?? null,
      storeName: p.stores?.name ?? null,
      storeSlug: p.stores?.slug ?? null,
    });
  }

  for (const s of (svcRes.data ?? []) as any[]) {
    services.set(s.id, {
      kind: "service",
      id: s.id,
      name: s.name,
      price: Number(s.price),
      durationDays: Number(s.agreement?.duration_days ?? s.agreement?.estimated_days ?? 1),
      revisionLimit: Number(s.agreement?.revision_limit ?? s.agreement?.revisions ?? 0),
      storeId: s.store_id ?? null,
      storeName: s.stores?.name ?? null,
      storeSlug: s.stores?.slug ?? null,
    });
  }

  return { products, services };
}

function parseMedia(raw: unknown): SocialMediaItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is { url: string; alt?: string } => Boolean(m && typeof m.url === "string"))
    .slice(0, THREAD_MAX_MEDIA)
    .map((m) => ({ url: m.url, alt: String(m.alt ?? "") }));
}

/** Hydrates raw `social_posts` rows into rich `ThreadPostItem` objects (supports guests + verified buyer badge + polls + freebies). */
async function hydrateThreadPosts(
  rawRows: any[],
  viewerId: string | null,
  options: { includeReplyPreviews?: boolean; parentProductId?: string | null } = {},
): Promise<ThreadPostItem[]> {
  const { includeReplyPreviews = true, parentProductId = null } = options;
  if (!rawRows.length) return [];
  const supabaseAdmin = await getAdminDb();

  const targetRefIds = Array.from(
    new Set(rawRows.map((r) => r.repost_of_id).filter((x): x is string => Boolean(x))),
  );
  const refById = new Map<string, any>();
  if (targetRefIds.length) {
    let refRes = await supabaseAdmin
      .from("social_posts")
      .select(`${POST_SELECT_V2}, deleted_at`)
      .in("id", targetRefIds);
    if (refRes.error && isMissingV2ColumnError(refRes.error)) {
      refRes = await supabaseAdmin
        .from("social_posts")
        .select(`${POST_SELECT_V1}, deleted_at`)
        .in("id", targetRefIds);
    }
    for (const ref of refRes.data ?? []) refById.set(ref.id, ref);
  }

  const effectivePosts: Array<{ row: any; target: any; quoted: any | null }> = [];
  for (const row of rawRows) {
    if (row.is_repost_only && row.repost_of_id) {
      const target = refById.get(row.repost_of_id);
      if (!target || target.deleted_at) continue;
      const nestedQuoted =
        !target.is_repost_only && target.repost_of_id ? refById.get(target.repost_of_id) ?? null : null;
      effectivePosts.push({ row, target, quoted: nestedQuoted });
    } else {
      const quoted = row.repost_of_id ? refById.get(row.repost_of_id) ?? null : null;
      effectivePosts.push({ row, target: row, quoted });
    }
  }
  if (!effectivePosts.length) return [];

  const allTargetIds = Array.from(new Set(effectivePosts.map((e) => e.target.id as string)));
  const pollPostIds = effectivePosts
    .filter((e) => Array.isArray(e.target.poll_options) && e.target.poll_options.length >= 2)
    .map((e) => e.target.id as string);

  const allPostsForCommerce = [
    ...effectivePosts.map((e) => e.target),
    ...effectivePosts.map((e) => e.quoted).filter(Boolean),
  ];

  // Collect preview replier user IDs for root posts with replies
  const replyPreviewMap = new Map<string, string[]>();
  const replyAuthorIds: string[] = [];
  if (includeReplyPreviews) {
    const withReplies = allTargetIds.filter((tid) => {
      const match = effectivePosts.find((e) => e.target.id === tid);
      return Number(match?.target.replies_count ?? 0) > 0;
    });
    if (withReplies.length) {
      const { data: recentReplies } = await supabaseAdmin
        .from("social_posts")
        .select("parent_id, author_id")
        .in("parent_id", withReplies)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(withReplies.length * 4);
      for (const rep of (recentReplies ?? []) as Array<{ parent_id: string; author_id: string }>) {
        const list = replyPreviewMap.get(rep.parent_id) ?? [];
        if (!list.includes(rep.author_id) && list.length < 3) {
          list.push(rep.author_id);
          replyPreviewMap.set(rep.parent_id, list);
          replyAuthorIds.push(rep.author_id);
        }
      }
    }
  }

  const allAuthorIds = [
    ...effectivePosts.map((e) => e.row.author_id),
    ...effectivePosts.map((e) => e.target.author_id),
    ...effectivePosts.map((e) => e.quoted?.author_id).filter(Boolean),
    ...replyAuthorIds,
  ];

  // Batch verified-buyer check against `digital_entitlements` when hydrating replies for a product thread
  const entitlementPromise =
    parentProductId && allAuthorIds.length
      ? supabaseAdmin
          .from("digital_entitlements")
          .select("user_id")
          .eq("product_id", parentProductId)
          .in("user_id", Array.from(new Set(allAuthorIds)))
      : Promise.resolve({ data: [] });

  const pollVotesPromise = pollPostIds.length
    ? supabaseAdmin
        .from("social_post_poll_votes")
        .select("post_id, user_id, option_index")
        .in("post_id", pollPostIds)
        .then((r: any) => r)
        .catch(() => ({ data: [] }))
    : Promise.resolve({ data: [] });

  // P0 #2: Freebie URLs live in isolated `social_post_freebies` table (service_role only)
  const freebiePostIds = effectivePosts
    .filter((e) => Boolean(e.target.has_freebie))
    .map((e) => e.target.id as string);
  const freebiesPromise = freebiePostIds.length
    ? supabaseAdmin
        .from("social_post_freebies")
        .select("post_id, title, url, requires_follow")
        .in("post_id", freebiePostIds)
        .then((r: any) => r)
        .catch(() => ({ data: [] }))
    : Promise.resolve({ data: [] });

  const [
    authorMap,
    commerce,
    likesRes,
    bookmarksRes,
    viewerRepostsRes,
    entitlementRes,
    pollVotesRes,
    freebiesRes,
  ] = await Promise.all([
    hydrateAuthors(allAuthorIds, viewerId),
    hydrateCommerceAttachments(allPostsForCommerce),
    viewerId
      ? supabaseAdmin
          .from("social_post_likes")
          .select("post_id")
          .eq("user_id", viewerId)
          .in("post_id", allTargetIds)
      : Promise.resolve({ data: [] }),
    viewerId
      ? supabaseAdmin
          .from("social_post_bookmarks")
          .select("post_id")
          .eq("user_id", viewerId)
          .in("post_id", allTargetIds)
      : Promise.resolve({ data: [] }),
    viewerId
      ? supabaseAdmin
          .from("social_posts")
          .select("repost_of_id")
          .eq("author_id", viewerId)
          .eq("is_repost_only", true)
          .is("deleted_at", null)
          .in("repost_of_id", allTargetIds)
      : Promise.resolve({ data: [] }),
    entitlementPromise,
    pollVotesPromise,
    freebiesPromise,
  ]);

  const likedSet = new Set<string>((likesRes.data ?? []).map((x: any) => x.post_id));
  const bookmarkedSet = new Set<string>((bookmarksRes.data ?? []).map((x: any) => x.post_id));
  const repostedSet = new Set<string>((viewerRepostsRes.data ?? []).map((x: any) => x.repost_of_id));
  const verifiedBuyerSet = new Set<string>((entitlementRes.data ?? []).map((x: any) => x.user_id));
  const freebieByPostId = new Map<
    string,
    { title: string; url: string; requires_follow: boolean }
  >((freebiesRes.data ?? []).map((f: any) => [f.post_id, f]));

  // Aggregate poll counts per post
  const pollVotesByPost = new Map<string, { counts: Map<number, number>; viewerOption: number | null }>();
  for (const v of (pollVotesRes.data ?? []) as Array<{
    post_id: string;
    user_id: string;
    option_index: number;
  }>) {
    let entry = pollVotesByPost.get(v.post_id);
    if (!entry) {
      entry = { counts: new Map(), viewerOption: null };
      pollVotesByPost.set(v.post_id, entry);
    }
    entry.counts.set(v.option_index, (entry.counts.get(v.option_index) ?? 0) + 1);
    if (viewerId && v.user_id === viewerId) entry.viewerOption = v.option_index;
  }

  const fallbackAuthor = (id: string): SocialAuthor => ({
    id,
    handle: `user_${id.slice(0, 6)}`,
    displayName: "Pengguna Ebrystore",
    avatarUrl: null,
    bio: "",
    followersCount: 0,
    followingCount: 0,
    isFollowedByMe: false,
    isSelf: Boolean(viewerId && id === viewerId),
    verifiedStore: null,
  });

  const attachOf = (p: any): AttachedCommerceItem | null => {
    if (p.attached_product_id) return commerce.products.get(p.attached_product_id) ?? null;
    if (p.attached_service_id) return commerce.services.get(p.attached_service_id) ?? null;
    return null;
  };

  return effectivePosts.map(({ row, target, quoted }) => {
    const targetAuthor = authorMap.get(target.author_id) ?? fallbackAuthor(target.author_id);
    const reposter = row.is_repost_only
      ? authorMap.get(row.author_id) ?? fallbackAuthor(row.author_id)
      : null;

    const quotedPost: EmbeddedQuotedPost | null = quoted
      ? {
          id: quoted.id,
          body: quoted.deleted_at ? "" : String(quoted.body ?? ""),
          media: quoted.deleted_at ? [] : parseMedia(quoted.media),
          createdAt: quoted.created_at,
          author: authorMap.get(quoted.author_id) ?? fallbackAuthor(quoted.author_id),
          attachedCommerce: quoted.deleted_at ? null : attachOf(quoted),
          deleted: Boolean(quoted.deleted_at),
        }
      : null;

    const previewIds = replyPreviewMap.get(target.id) ?? [];
    const replyPreviewAuthors = previewIds.map((uid) => {
      const a = authorMap.get(uid) ?? fallbackAuthor(uid);
      return { id: a.id, displayName: a.displayName, avatarUrl: a.avatarUrl };
    });

    // Hydrate interactive poll if present
    let poll: ThreadPollData | null = null;
    if (Array.isArray(target.poll_options) && target.poll_options.length >= 2) {
      const agg = pollVotesByPost.get(target.id);
      const options = (target.poll_options as string[]).slice(0, 4).map((label, idx) => ({
        index: idx,
        label: String(label),
        votes: agg?.counts.get(idx) ?? 0,
      }));
      const totalVotes = options.reduce((sum, o) => sum + o.votes, 0);
      const expiresAt = target.poll_expires_at ? String(target.poll_expires_at) : null;
      const expired = Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());
      poll = {
        options,
        totalVotes,
        viewerOption: agg?.viewerOption ?? null,
        expiresAt,
        expired,
      };
    }

    // Hydrate Auto-DM keyword trigger metadata (never leaks creator private template before trigger)
    const autoDm =
      target.auto_dm_keyword && String(target.auto_dm_keyword).trim()
        ? {
            keyword: String(target.auto_dm_keyword).trim(),
            triggeredCount: Number(target.auto_dm_count ?? 0),
          }
        : null;

    // P0 #2: Hydrate Freebie Lead Magnet from isolated `social_post_freebies` table
    let freebie: ThreadPostItem["freebie"] = null;
    const freebieRow = freebieByPostId.get(target.id);
    if (freebieRow) {
      const requiresFollow = freebieRow.requires_follow !== false;
      const unlocked =
        !requiresFollow || targetAuthor.isSelf || Boolean(viewerId && targetAuthor.isFollowedByMe);
      freebie = {
        title: String(freebieRow.title),
        requiresFollow,
        unlocked,
        url: unlocked ? String(freebieRow.url) : null,
      };
    }

    return {
      id: row.id,
      authorId: target.author_id,
      parentId: target.parent_id ?? null,
      rootId: target.root_id ?? null,
      repostOfId: target.repost_of_id ?? null,
      isRepostOnly: Boolean(row.is_repost_only),
      postKind: target.post_kind === "reel" ? "reel" : "thread",
      videoUrl: target.video_url ? String(target.video_url) : null,
      videoPosterUrl: target.video_poster_url ? String(target.video_poster_url) : null,
      videoDurationSec: target.video_duration_sec ? Number(target.video_duration_sec) : null,
      viewsCount: Number(target.views_count ?? 0),
      repostedBy: reposter
        ? {
            id: reposter.id,
            handle: reposter.handle,
            displayName: reposter.displayName,
            repostedAt: row.created_at,
          }
        : null,
      targetPostId: target.id,
      author: targetAuthor,
      body: String(target.body ?? ""),
      media: parseMedia(target.media),
      hashtags: Array.isArray(target.hashtags) ? target.hashtags : [],
      attachedCommerce: attachOf(target),
      quotedPost,
      poll,
      autoDm,
      freebie,
      isVerifiedBuyer: verifiedBuyerSet.has(target.author_id),
      replyPolicy: (target.reply_policy ?? "everyone") as ThreadPostItem["replyPolicy"],
      likesCount: Number(target.likes_count ?? 0),
      repliesCount: Number(target.replies_count ?? 0),
      repostsCount: Number(target.reposts_count ?? 0),
      quotesCount: Number(target.quotes_count ?? 0),
      bookmarksCount: Number(target.bookmarks_count ?? 0),
      viewerLiked: likedSet.has(target.id),
      viewerReposted: repostedSet.has(target.id),
      viewerBookmarked: bookmarkedSet.has(target.id),
      createdAt: target.created_at,
      feedSortAt: row.created_at,
      replyPreviewAuthors,
    };
  });
}

/**
 * Triggers automatic ManyChat-style DM into Ebrystore Chat (`product_inquiries`)
 * when a user replies with the creator's configured `auto_dm_keyword`.
 */
async function triggerAutoDmIfMatched(params: {
  replierId: string;
  replyBody: string;
  parentPost: any;
}): Promise<{ inquiryId: string; keyword: string; storeName: string } | null> {
  const { replierId, replyBody, parentPost } = params;
  if (!parentPost || parentPost.author_id === replierId) return null;
  if (!parentPost.auto_dm_keyword || !parentPost.auto_dm_message) return null;
  if (!matchesAutoDmKeyword(replyBody, parentPost.auto_dm_keyword)) return null;

  try {
    const supabaseAdmin = await getAdminDb();
    // Resolve creator's active store (required to route seller chat cleanly)
    let storeId: string | null = parentPost.attached_store_id ?? null;
    let storeName = "Tim Ebrystore";
    if (!storeId) {
      const { data: creatorStore } = await supabaseAdmin
        .from("stores")
        .select("id, name, is_platform")
        .eq("owner_id", parentPost.author_id)
        .eq("status", "active")
        .maybeSingle();
      if (creatorStore) {
        storeId = creatorStore.is_platform ? null : creatorStore.id;
        storeName = creatorStore.name;
      }
    } else {
      const { data: st } = await supabaseAdmin
        .from("stores")
        .select("id, name, is_platform")
        .eq("id", storeId)
        .maybeSingle();
      if (st) {
        storeName = st.name;
        if (st.is_platform) storeId = null;
      }
    }

    // Find existing open inquiry thread between replier & creator store, or create a new one
    let existingQuery = supabaseAdmin
      .from("product_inquiries")
      .select("id")
      .eq("user_id", replierId)
      .neq("status", "closed")
      .order("last_message_at", { ascending: false })
      .limit(1);
    existingQuery = storeId ? existingQuery.eq("store_id", storeId) : existingQuery.is("store_id", null);
    const { data: existingRows } = await existingQuery;
    let inquiryId: string | null = existingRows?.[0]?.id ?? null;

    if (!inquiryId) {
      const { data: createdInq } = await supabaseAdmin
        .from("product_inquiries")
        .insert({
          user_id: replierId,
          store_id: storeId,
          product_id: parentPost.attached_product_id ?? null,
          service_id: parentPost.attached_service_id ?? null,
          subject: `Info otomatis "${parentPost.auto_dm_keyword}" dari Threads`.slice(0, 150),
        })
        .select("id")
        .single();
      inquiryId = createdInq?.id ?? null;
    }
    if (!inquiryId) return null;

    // P0 #3: Atomic once-per-user Auto-DM claim (prevents spam & counter race conditions)
    const { data: claimed, error: claimErr } = await supabaseAdmin.rpc("claim_social_auto_dm", {
      _post_id: parentPost.id,
      _recipient_id: replierId,
      _inquiry_id: inquiryId,
    });
    if (claimErr || claimed !== true) {
      return null;
    }

    // Build authoritative product/service attachment card if linked on the parent post
    let attachment: Record<string, unknown> | null = null;
    if (parentPost.attached_product_id) {
      const { data: prod } = await supabaseAdmin
        .from("digital_products")
        .select("id, slug, name, price, discount_price, thumbnail_url, stores(name)")
        .eq("id", parentPost.attached_product_id)
        .eq("status", "published")
        .is("deleted_at", null)
        .maybeSingle();
      if (prod) {
        const pd = priceDetails(prod.price, prod.discount_price);
        attachment = {
          kind: "product",
          productId: prod.id,
          slug: prod.slug,
          name: prod.name,
          price: pd.basePrice,
          discountPrice: pd.hasDiscount ? pd.price : null,
          thumbnailUrl: prod.thumbnail_url ?? null,
          storeName: prod.stores?.name ?? storeName,
        };
      }
    } else if (parentPost.attached_service_id) {
      const { data: svc } = await supabaseAdmin
        .from("marketplace_services")
        .select("id, name, price, agreement, stores(name)")
        .eq("id", parentPost.attached_service_id)
        .eq("status", "approved")
        .maybeSingle();
      if (svc) {
        attachment = {
          kind: "service",
          serviceId: svc.id,
          name: svc.name,
          price: Number(svc.price),
          durationDays: Number(svc.agreement?.duration_days ?? 1),
          revisionLimit: Number(svc.agreement?.revision_limit ?? 0),
          storeName: svc.stores?.name ?? storeName,
        };
      }
    }

    await supabaseAdmin.from("product_inquiry_messages").insert({
      inquiry_id: inquiryId,
      sender_id: parentPost.author_id,
      sender_role: storeId ? "seller" : "staff",
      body: String(parentPost.auto_dm_message).slice(0, 2000),
      attachment,
    });

    await supabaseAdmin.from("notifications").insert({
      recipient_id: replierId,
      type: "product_inquiry",
      title: `Balasan otomatis dari ${storeName}`,
      message: String(parentPost.auto_dm_message).slice(0, 140),
      related_type: "product_inquiry",
      related_id: inquiryId,
    });

    return { inquiryId, keyword: String(parentPost.auto_dm_keyword), storeName };
  } catch (err) {
    console.error("[social-threads] auto-dm failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ============================================================================
// Authenticated Server Functions
// ============================================================================

export const getSocialBootstrap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    try {
      const ensured = await ensureMySocialProfile(userId);
      if (ensured.setupRequired) {
        return {
          setupRequired: true as const,
          me: null as SocialAuthor | null,
          trendingTags: [] as TrendingHashtag[],
          suggestedCreators: [] as SuggestedCreator[],
        };
      }

      const supabaseAdmin = await getAdminDb();

      const [meMap, recentPostsRes, activeStoresRes, myFollowingRes] = await Promise.all([
        hydrateAuthors([userId], userId),
        supabaseAdmin
          .from("social_posts")
          .select("hashtags")
          .is("deleted_at", null)
          .gte("created_at", new Date(Date.now() - 14 * 86_400_000).toISOString())
          .limit(250),
        supabaseAdmin
          .from("stores")
          .select("owner_id")
          .eq("status", "active")
          .neq("owner_id", userId)
          .order("created_at", { ascending: false })
          .limit(12),
        supabaseAdmin.from("social_follows").select("following_id").eq("follower_id", userId),
      ]);

      const tagCounts = new Map<string, number>();
      for (const row of (recentPostsRes.data ?? []) as Array<{ hashtags?: string[] }>) {
        for (const t of row.hashtags ?? []) {
          tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
        }
      }
      const trendingTags: TrendingHashtag[] = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([tag, count]) => ({ tag, count }));

      const alreadyFollowing = new Set<string>(
        (myFollowingRes.data ?? []).map((r: any) => r.following_id),
      );

      const { data: activePosters } = await supabaseAdmin
        .from("social_profiles")
        .select("user_id")
        .neq("user_id", userId)
        .order("followers_count", { ascending: false })
        .limit(10);

      const candidateIds = Array.from(
        new Set([
          ...((activeStoresRes.data ?? []).map((s: any) => s.owner_id) as string[]),
          ...((activePosters ?? []).map((p: any) => p.user_id) as string[]),
        ]),
      )
        .filter((uid) => uid && uid !== userId && !alreadyFollowing.has(uid))
        .slice(0, 5);

      const suggestedMap = await hydrateAuthors(candidateIds, userId);
      const suggestedCreators = candidateIds
        .map((uid) => suggestedMap.get(uid))
        .filter((a): a is SocialAuthor => Boolean(a));

      return {
        setupRequired: false as const,
        me: meMap.get(userId) ?? null,
        trendingTags,
        suggestedCreators,
      };
    } catch (err) {
      if (isSocialTableMissingError(err)) {
        return {
          setupRequired: true as const,
          me: null,
          trendingTags: [],
          suggestedCreators: [],
        };
      }
      return {
        setupRequired: false as const,
        me: null,
        trendingTags: [],
        suggestedCreators: [],
      };
    }
  });

export const updateMySocialProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        handle: z.string().trim().min(3).max(28),
        displayName: z.string().trim().min(2).max(60),
        bio: z.string().trim().max(160),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const normalized = normalizeHandle(data.handle, userId.slice(0, 4));
    if (!/^[a-z0-9._]{3,28}$/.test(normalized)) {
      return {
        ok: false as const,
        error: "Username hanya boleh huruf kecil, angka, titik, atau garis bawah (3-28 karakter).",
      };
    }
    const { error } = await supabase.from("social_profiles").upsert(
      {
        user_id: userId,
        handle: normalized,
        display_name: data.displayName,
        bio: data.bio,
      },
      { onConflict: "user_id" },
    );
    if (error) {
      if (error.code === "23505") {
        return { ok: false as const, error: "Username sudah digunakan pengguna lain." };
      }
      return { ok: false as const, error: "Profil sosial gagal disimpan." };
    }
    return { ok: true as const, handle: normalized };
  });

/** Cursor-paginated feed across For You, Following, Reels, Produk & Jasa, Bookmarks, and Mine. */
export const listThreadsFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        tab: z
          .enum(["for_you", "following", "reels", "commerce", "bookmarks", "mine"])
          .default("for_you"),
        tag: z.string().trim().max(40).optional(),
        q: z.string().trim().max(80).optional(),
        authorId: z.string().uuid().optional(),
        cursorCreatedAt: z.string().optional(),
        cursorId: z.string().uuid().optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    try {
      const supabaseAdmin = await getAdminDb();

      if (data.tab === "bookmarks") {
        let bq = supabase
          .from("social_post_bookmarks")
          .select("post_id, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(FEED_PAGE_SIZE + 1);
        if (data.cursorCreatedAt) bq = bq.lt("created_at", data.cursorCreatedAt);
        const { data: bRows, error: bErr } = await bq;
        if (bErr) {
          if (isSocialTableMissingError(bErr)) {
            return { items: [] as ThreadPostItem[], nextCursor: null as ThreadFeedCursor | null, setupRequired: true as const };
          }
          return { items: [] as ThreadPostItem[], nextCursor: null as ThreadFeedCursor | null, setupRequired: false as const };
        }
        const rows = (bRows ?? []) as Array<{ post_id: string; created_at: string }>;
        const hasMore = rows.length > FEED_PAGE_SIZE;
        const page = rows.slice(0, FEED_PAGE_SIZE);
        const postIds = page.map((r) => r.post_id);
        if (!postIds.length) {
          return { items: [] as ThreadPostItem[], nextCursor: null, setupRequired: false as const };
        }
        let postsRes = await supabaseAdmin
          .from("social_posts")
          .select(POST_SELECT_V2)
          .in("id", postIds)
          .is("deleted_at", null);
        if (postsRes.error && isMissingV2ColumnError(postsRes.error)) {
          postsRes = await supabaseAdmin
            .from("social_posts")
            .select(POST_SELECT_V1)
            .in("id", postIds)
            .is("deleted_at", null);
        }
        const byId = new Map<string, any>((postsRes.data ?? []).map((p: any) => [p.id, p]));
        const ordered = postIds.map((id) => byId.get(id)).filter(Boolean);
        const hydrated = await hydrateThreadPosts(ordered, userId);
        const last = page[page.length - 1];
        return {
          items: hydrated,
          nextCursor: hasMore && last ? { createdAt: last.created_at, id: last.post_id } : null,
          setupRequired: false as const,
        };
      }

      const buildFeedQuery = async (fields: string, includeReelsFilter: boolean) => {
        let query = supabaseAdmin
          .from("social_posts")
          .select(fields)
          .is("deleted_at", null)
          .is("parent_id", null)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(FEED_PAGE_SIZE + 1);

        if (data.cursorCreatedAt && data.cursorId) {
          query = query.or(
            `created_at.lt.${data.cursorCreatedAt},and(created_at.eq.${data.cursorCreatedAt},id.lt.${data.cursorId})`,
          );
        } else if (data.cursorCreatedAt) {
          query = query.lt("created_at", data.cursorCreatedAt);
        }

        if (data.authorId) {
          query = query.eq("author_id", data.authorId);
        } else if (data.tab === "mine") {
          query = query.eq("author_id", userId);
        } else if (data.tab === "reels" && includeReelsFilter) {
          query = query.eq("post_kind", "reel").not("video_url", "is", null);
        } else if (data.tab === "following") {
          const [{ data: socialFollows }, { data: storeFollows }] = await Promise.all([
            supabaseAdmin.from("social_follows").select("following_id").eq("follower_id", userId),
            supabaseAdmin.from("store_follows").select("stores(owner_id)").eq("user_id", userId),
          ]);
          const ids = Array.from(
            new Set([
              userId,
              ...((socialFollows ?? []).map((f: any) => f.following_id) as string[]),
              ...((storeFollows ?? []).map((sf: any) => sf.stores?.owner_id).filter(Boolean) as string[]),
            ]),
          );
          query = query.in("author_id", ids);
        } else if (data.tab === "commerce") {
          query = query
            .eq("is_repost_only", false)
            .or("attached_product_id.not.is.null,attached_service_id.not.is.null");
        }

        if (data.tag) {
          const cleanTag = data.tag.replace(/^#/, "").toLowerCase();
          if (cleanTag) query = query.contains("hashtags", [cleanTag]);
        }
        if (data.q) {
          const safeQ = data.q.replace(/[%_,]/g, " ").trim();
          if (safeQ) query = query.ilike("body", `%${safeQ}%`);
        }
        return query;
      };

      let { data: rawRows, error } = await buildFeedQuery(POST_SELECT_V2, true);
      if (error && isMissingV2ColumnError(error)) {
        if (data.tab === "reels") {
          return { items: [] as ThreadPostItem[], nextCursor: null, setupRequired: false as const };
        }
        const retry = await buildFeedQuery(POST_SELECT_V1, false);
        rawRows = retry.data;
        error = retry.error;
      }

      if (error) {
        if (isSocialTableMissingError(error)) {
          return { items: [] as ThreadPostItem[], nextCursor: null, setupRequired: true as const };
        }
        return { items: [] as ThreadPostItem[], nextCursor: null, setupRequired: false as const };
      }

      const rows = (rawRows ?? []) as any[];
      const hasMore = rows.length > FEED_PAGE_SIZE;
      const page = rows.slice(0, FEED_PAGE_SIZE);
      const hydrated = await hydrateThreadPosts(page, userId);
      const last = page[page.length - 1];

      return {
        items: hydrated,
        nextCursor: hasMore && last ? { createdAt: last.created_at, id: last.id } : null,
        setupRequired: false as const,
      };
    } catch (err) {
      if (isSocialTableMissingError(err)) {
        return { items: [] as ThreadPostItem[], nextCursor: null, setupRequired: true as const };
      }
      return { items: [] as ThreadPostItem[], nextCursor: null, setupRequired: false as const };
    }
  });

/** Fast inline replies loader (used when expanding connected thread lines directly in feed or Reels drawer). */
export const getThreadReplies = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ postId: z.string().uuid(), limit: z.number().int().min(1).max(40).default(12) }).parse(data),
  )
  .handler(async ({ data }) => {
    const viewerId = await getOptionalViewerId();
    try {
      const supabaseAdmin = await getAdminDb();
      const { data: parentRow } = await supabaseAdmin
        .from("social_posts")
        .select("id, attached_product_id")
        .eq("id", data.postId)
        .is("deleted_at", null)
        .maybeSingle();

      let repliesRes = await supabaseAdmin
        .from("social_posts")
        .select(POST_SELECT_V2)
        .eq("parent_id", data.postId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(data.limit);
      if (repliesRes.error && isMissingV2ColumnError(repliesRes.error)) {
        repliesRes = await supabaseAdmin
          .from("social_posts")
          .select(POST_SELECT_V1)
          .eq("parent_id", data.postId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(data.limit);
      }

      const hydrated = await hydrateThreadPosts([...(repliesRes.data ?? [])].reverse(), viewerId, {
        includeReplyPreviews: false,
        parentProductId: parentRow?.attached_product_id ?? null,
      });
      return { items: hydrated };
    } catch {
      return { items: [] as ThreadPostItem[] };
    }
  });

/** Full Thread detail loader (shared helper for authenticated `/dashboard/thread/$id` and public `/t/$id`). */
async function loadThreadDetailInternal(postId: string, viewerId: string | null) {
  const supabaseAdmin = await getAdminDb();
  let focalRes = await supabaseAdmin
    .from("social_posts")
    .select(POST_SELECT_V2)
    .eq("id", postId)
    .is("deleted_at", null)
    .maybeSingle();
  if (focalRes.error && isMissingV2ColumnError(focalRes.error)) {
    focalRes = await supabaseAdmin
      .from("social_posts")
      .select(POST_SELECT_V1)
      .eq("id", postId)
      .is("deleted_at", null)
      .maybeSingle();
  }

  if (focalRes.error) {
    if (isSocialTableMissingError(focalRes.error)) {
      return { setupRequired: true as const, ancestors: [] as ThreadPostItem[], post: null, replies: [] as ThreadPostItem[] };
    }
    return { setupRequired: false as const, ancestors: [] as ThreadPostItem[], post: null, replies: [] as ThreadPostItem[] };
  }
  const focalRaw = focalRes.data;
  if (!focalRaw) {
    return { setupRequired: false as const, ancestors: [] as ThreadPostItem[], post: null, replies: [] as ThreadPostItem[] };
  }

  const ancestorRows: any[] = [];
  let cursorParent = focalRaw.parent_id as string | null;
  for (let hop = 0; hop < 8 && cursorParent; hop++) {
    let pRes = await supabaseAdmin
      .from("social_posts")
      .select(POST_SELECT_V2)
      .eq("id", cursorParent)
      .is("deleted_at", null)
      .maybeSingle();
    if (pRes.error && isMissingV2ColumnError(pRes.error)) {
      pRes = await supabaseAdmin
        .from("social_posts")
        .select(POST_SELECT_V1)
        .eq("id", cursorParent)
        .is("deleted_at", null)
        .maybeSingle();
    }
    if (!pRes.data) break;
    ancestorRows.unshift(pRes.data);
    cursorParent = pRes.data.parent_id ?? null;
  }

  let repliesRes = await supabaseAdmin
    .from("social_posts")
    .select(POST_SELECT_V2)
    .eq("parent_id", focalRaw.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(80);
  if (repliesRes.error && isMissingV2ColumnError(repliesRes.error)) {
    repliesRes = await supabaseAdmin
      .from("social_posts")
      .select(POST_SELECT_V1)
      .eq("parent_id", focalRaw.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(80);
  }

  const repliesRaw = (repliesRes.data ?? []) as any[];
  const allRaw = [...ancestorRows, focalRaw, ...repliesRaw];
  const hydrated = await hydrateThreadPosts(allRaw, viewerId, {
    includeReplyPreviews: true,
    parentProductId: focalRaw.attached_product_id ?? null,
  });
  const byId = new Map(hydrated.map((item) => [item.id, item]));

  return {
    setupRequired: false as const,
    ancestors: ancestorRows.map((a) => byId.get(a.id)).filter((x): x is ThreadPostItem => Boolean(x)),
    post: byId.get(focalRaw.id) ?? null,
    replies: repliesRaw.map((r) => byId.get(r.id)).filter((x): x is ThreadPostItem => Boolean(x)),
  };
}

export const getThreadDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    try {
      return await loadThreadDetailInternal(data.id, userId);
    } catch (err) {
      if (isSocialTableMissingError(err)) {
        return { setupRequired: true as const, ancestors: [], post: null, replies: [] };
      }
      return { setupRequired: false as const, ancestors: [], post: null, replies: [] };
    }
  });

/** Public permalink loader (`/t/$id`): readable by guests & Meta Threads / WA / X link previews! */
export const getPublicThread = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const viewerId = await getOptionalViewerId();
    try {
      const detail = await loadThreadDetailInternal(data.id, viewerId);
      return { ...detail, isAuthenticated: Boolean(viewerId) };
    } catch {
      return {
        setupRequired: false as const,
        ancestors: [] as ThreadPostItem[],
        post: null,
        replies: [] as ThreadPostItem[],
        isAuthenticated: Boolean(viewerId),
      };
    }
  });

/** Public creator Link-in-Bio profile loader (`/u/$handle`): Threads + Reels + Verified Storefront in 1 URL. */
export const getPublicCreatorProfile = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ handle: z.string().trim().min(2).max(40) }).parse(data))
  .handler(async ({ data }) => {
    const viewerId = await getOptionalViewerId();
    const clean = data.handle.replace(/^@+/, "").toLowerCase();
    try {
      const supabaseAdmin = await getAdminDb();

      // Match by social_profiles.handle first, fallback to active stores.slug
      let userId: string | null = null;
      const { data: sp } = await supabaseAdmin
        .from("social_profiles")
        .select("user_id")
        .ilike("handle", clean)
        .maybeSingle();
      if (sp?.user_id) {
        userId = sp.user_id;
      } else {
        const { data: st } = await supabaseAdmin
          .from("stores")
          .select("owner_id")
          .eq("slug", clean)
          .eq("status", "active")
          .maybeSingle();
        userId = st?.owner_id ?? null;
      }

      if (!userId) {
        return {
          creator: null as SocialAuthor | null,
          threads: [] as ThreadPostItem[],
          replies: [] as ThreadPostItem[],
          reels: [] as ThreadPostItem[],
          products: [] as AttachedCommerceItem[],
          services: [] as AttachedCommerceItem[],
          isAuthenticated: Boolean(viewerId),
        };
      }

      const [authorMap, postsRes, repliesByAuthorRes] = await Promise.all([
        hydrateAuthors([userId], viewerId),
        (async () => {
          let r = await supabaseAdmin
            .from("social_posts")
            .select(POST_SELECT_V2)
            .eq("author_id", userId)
            .is("deleted_at", null)
            .is("parent_id", null)
            .order("created_at", { ascending: false })
            .limit(40);
          if (r.error && isMissingV2ColumnError(r.error)) {
            r = await supabaseAdmin
              .from("social_posts")
              .select(POST_SELECT_V1)
              .eq("author_id", userId)
              .is("deleted_at", null)
              .is("parent_id", null)
              .order("created_at", { ascending: false })
              .limit(40);
          }
          return r;
        })(),
        (async () => {
          let r = await supabaseAdmin
            .from("social_posts")
            .select(POST_SELECT_V2)
            .eq("author_id", userId)
            .is("deleted_at", null)
            .not("parent_id", "is", null)
            .order("created_at", { ascending: false })
            .limit(25);
          if (r.error && isMissingV2ColumnError(r.error)) {
            r = await supabaseAdmin
              .from("social_posts")
              .select(POST_SELECT_V1)
              .eq("author_id", userId)
              .is("deleted_at", null)
              .not("parent_id", "is", null)
              .order("created_at", { ascending: false })
              .limit(25);
          }
          return r;
        })(),
      ]);

      const creator = authorMap.get(userId) ?? null;
      const [hydratedPosts, hydratedReplies] = await Promise.all([
        hydrateThreadPosts(postsRes.data ?? [], viewerId),
        hydrateThreadPosts(repliesByAuthorRes.data ?? [], viewerId, { includeReplyPreviews: false }),
      ]);
      const reels = hydratedPosts.filter((p) => p.postKind === "reel" && Boolean(p.videoUrl));
      const threads = hydratedPosts.filter((p) => p.postKind !== "reel");

      let products: AttachedCommerceItem[] = [];
      let services: AttachedCommerceItem[] = [];
      if (creator?.verifiedStore?.id) {
        const storeId = creator.verifiedStore.id;
        const [prodRes, svcRes] = await Promise.all([
          supabaseAdmin
            .from("digital_products")
            .select("id, slug, name, price, discount_price, thumbnail_url, store_id")
            .eq("store_id", storeId)
            .eq("status", "published")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(12),
          supabaseAdmin
            .from("marketplace_services")
            .select("id, name, price, agreement, store_id")
            .eq("store_id", storeId)
            .eq("status", "approved")
            .order("created_at", { ascending: false })
            .limit(8),
        ]);
        products = (prodRes.data ?? []).map((p: any) => {
          const pd = priceDetails(p.price, p.discount_price);
          return {
            kind: "product" as const,
            id: p.id,
            slug: p.slug,
            name: p.name,
            price: pd.basePrice,
            discountPrice: pd.hasDiscount ? pd.price : null,
            thumbnailUrl: p.thumbnail_url ?? null,
            storeId,
            storeName: creator.verifiedStore!.name,
            storeSlug: creator.verifiedStore!.slug,
          };
        });
        services = (svcRes.data ?? []).map((s: any) => ({
          kind: "service" as const,
          id: s.id,
          name: s.name,
          price: Number(s.price),
          durationDays: Number(s.agreement?.duration_days ?? 1),
          revisionLimit: Number(s.agreement?.revision_limit ?? 0),
          storeId,
          storeName: creator.verifiedStore!.name,
          storeSlug: creator.verifiedStore!.slug,
        }));
      }

      return {
        creator,
        threads,
        replies: hydratedReplies,
        reels,
        products,
        services,
        isAuthenticated: Boolean(viewerId),
      };
    } catch {
      return {
        creator: null,
        threads: [],
        replies: [],
        reels: [],
        products: [],
        services: [],
        isAuthenticated: Boolean(viewerId),
      };
    }
  });

/** Create thread chain, Reel, Poll, Auto-DM trigger, Freebie lock, or Reply (auto-fires Auto-DM into Chat!). */
export const createThreadChain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        segments: z.array(postSegmentSchema).min(1).max(THREAD_MAX_CHAIN),
        parentId: z.string().uuid().nullable().optional(),
        quotePostId: z.string().uuid().nullable().optional(),
        replyPolicy: z.enum(["everyone", "followers", "mentioned"]).default("everyone"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const limited = await enforceRateLimit(userId, "social.post");
    if (limited) return { ok: false as const, error: limited.error };

    const ensured = await ensureMySocialProfile(userId);
    if (ensured.setupRequired) {
      console.error("[social-threads] social_* schema not applied yet");
      return {
        ok: false as const,
        error: "Layanan komunitas sedang dalam pemeliharaan singkat. Coba lagi beberapa saat lagi.",
      };
    }

    const supabaseAdmin = await getAdminDb();

    let rootId: string | null = null;
    let currentParentId: string | null = data.parentId ?? null;
    let notifyAuthorId: string | null = null;
    let parentPostRow: any = null;

    if (currentParentId) {
      let pRes = await supabaseAdmin
        .from("social_posts")
        .select(
          "id, author_id, root_id, reply_policy, body, attached_product_id, attached_service_id, attached_store_id, auto_dm_keyword, auto_dm_message, auto_dm_count",
        )
        .eq("id", currentParentId)
        .is("deleted_at", null)
        .maybeSingle();
      if (pRes.error && isMissingV2ColumnError(pRes.error)) {
        pRes = await supabaseAdmin
          .from("social_posts")
          .select("id, author_id, root_id, reply_policy, body")
          .eq("id", currentParentId)
          .is("deleted_at", null)
          .maybeSingle();
      }
      parentPostRow = pRes.data;
      if (!parentPostRow) {
        return { ok: false as const, error: "Utas yang ingin dibalas tidak ditemukan." };
      }
      if (parentPostRow.author_id !== userId && parentPostRow.reply_policy === "followers") {
        const { data: follows } = await supabaseAdmin
          .from("social_follows")
          .select("follower_id")
          .eq("follower_id", userId)
          .eq("following_id", parentPostRow.author_id)
          .maybeSingle();
        if (!follows) {
          return { ok: false as const, error: "Hanya pengikut penulis yang dapat membalas utas ini." };
        }
      } else if (parentPostRow.author_id !== userId && parentPostRow.reply_policy === "mentioned") {
        const myHandle = ensured.profile?.handle ? `@${ensured.profile.handle}` : "";
        if (!myHandle || !String(parentPostRow.body ?? "").toLowerCase().includes(myHandle.toLowerCase())) {
          return { ok: false as const, error: "Hanya akun yang disebut di utas ini yang dapat membalas." };
        }
      }
      rootId = parentPostRow.root_id ?? parentPostRow.id;
      if (parentPostRow.author_id !== userId) notifyAuthorId = parentPostRow.author_id;
    }

    let validQuoteId: string | null = null;
    if (data.quotePostId) {
      const { data: quoteTarget } = await supabaseAdmin
        .from("social_posts")
        .select("id, author_id, is_repost_only, repost_of_id")
        .eq("id", data.quotePostId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!quoteTarget) {
        return { ok: false as const, error: "Utas yang dikutip tidak ditemukan." };
      }
      validQuoteId =
        quoteTarget.is_repost_only && quoteTarget.repost_of_id
          ? quoteTarget.repost_of_id
          : quoteTarget.id;
      if (!notifyAuthorId && quoteTarget.author_id !== userId) {
        notifyAuthorId = quoteTarget.author_id;
      }
    }

    const createdRows: any[] = [];
    for (let idx = 0; idx < data.segments.length; idx++) {
      const seg = data.segments[idx];
      let validProductId: string | null = null;
      let validServiceId: string | null = null;
      let validStoreId: string | null = null;

      if (seg.attachedProductId) {
        const { data: prod } = await supabaseAdmin
          .from("digital_products")
          .select("id, store_id")
          .eq("id", seg.attachedProductId)
          .eq("status", "published")
          .is("deleted_at", null)
          .maybeSingle();
        if (!prod) return { ok: false as const, error: "Produk yang dilampirkan tidak aktif." };
        validProductId = prod.id;
        validStoreId = prod.store_id ?? null;
      } else if (seg.attachedServiceId) {
        const { data: svc } = await supabaseAdmin
          .from("marketplace_services")
          .select("id, store_id")
          .eq("id", seg.attachedServiceId)
          .eq("status", "approved")
          .maybeSingle();
        if (!svc) return { ok: false as const, error: "Jasa yang dilampirkan belum tayang." };
        validServiceId = svc.id;
        validStoreId = svc.store_id ?? null;
      }

      // Enforce Reel video path belongs to caller
      const safeVideoUrl =
        seg.videoUrl && seg.videoUrl.startsWith(`/api/public/social-reel/${userId}/`)
          ? seg.videoUrl
          : null;

      const hashtags = extractHashtags(seg.body);
      const hasFreebie = Boolean(idx === 0 && seg.freebieUrl && seg.freebieTitle);
      const v2Payload: Record<string, unknown> = {
        author_id: userId,
        parent_id: currentParentId,
        root_id: rootId,
        repost_of_id: idx === 0 ? validQuoteId : null,
        is_repost_only: false,
        post_kind: safeVideoUrl ? "reel" : seg.postKind,
        video_url: safeVideoUrl,
        video_poster_url: seg.videoPosterUrl ?? null,
        video_duration_sec: safeVideoUrl ? (seg.videoDurationSec ?? null) : null,
        auto_dm_keyword: idx === 0 && seg.autoDmKeyword ? seg.autoDmKeyword.trim() : null,
        auto_dm_message:
          idx === 0 && seg.autoDmKeyword && seg.autoDmMessage ? seg.autoDmMessage.trim() : null,
        poll_options: idx === 0 && seg.pollOptions?.length ? seg.pollOptions : null,
        poll_expires_at:
          idx === 0 && seg.pollOptions?.length
            ? new Date(Date.now() + (seg.pollDurationHours ?? 24) * 3_600_000).toISOString()
            : null,
        has_freebie: hasFreebie,
        body: seg.body,
        media: seg.media,
        hashtags,
        attached_product_id: validProductId,
        attached_service_id: validServiceId,
        attached_store_id: validStoreId,
        reply_policy: data.replyPolicy,
      };

      // P0 #1: Write via service_role after server-side auth, rate-limit, and reply_policy checks
      // (direct authenticated INSERT/UPDATE on social_posts is revoked to prevent counter spoofing).
      let insRes = await supabaseAdmin
        .from("social_posts")
        .insert(v2Payload)
        .select(POST_SELECT_V2)
        .single();

      // Backwards-compatible fallback if v2 columns aren't migrated yet
      if (insRes.error && isMissingV2ColumnError(insRes.error)) {
        const v1Payload = {
          author_id: userId,
          parent_id: currentParentId,
          root_id: rootId,
          repost_of_id: idx === 0 ? validQuoteId : null,
          is_repost_only: false,
          body: seg.body,
          media: seg.media,
          hashtags,
          attached_product_id: validProductId,
          attached_service_id: validServiceId,
          attached_store_id: validStoreId,
          reply_policy: data.replyPolicy,
        };
        insRes = await supabaseAdmin
          .from("social_posts")
          .insert(v1Payload)
          .select(POST_SELECT_V1)
          .single();
      }

      if (insRes.error || !insRes.data) {
        return { ok: false as const, error: "Gagal menerbitkan utas. Coba lagi." };
      }

      // P0 #2: Persist freebie URL in isolated service_role-only table
      if (hasFreebie && seg.freebieTitle && seg.freebieUrl) {
        await supabaseAdmin.from("social_post_freebies").upsert(
          {
            post_id: insRes.data.id,
            title: seg.freebieTitle.trim(),
            url: seg.freebieUrl.trim(),
            requires_follow: seg.freebieRequiresFollow ?? true,
          },
          { onConflict: "post_id" },
        );
      }

      createdRows.push(insRes.data);
      if (!rootId) rootId = insRes.data.id;
      currentParentId = insRes.data.id;
    }

    // Trigger Auto-DM into Chat if reply matched parent's keyword!
    let autoDmTriggered: { inquiryId: string; keyword: string; storeName: string } | null = null;
    if (parentPostRow && data.segments[0]?.body) {
      autoDmTriggered = await triggerAutoDmIfMatched({
        replierId: userId,
        replyBody: data.segments[0].body,
        parentPost: parentPostRow,
      });
    }

    if (notifyAuthorId && createdRows[0]) {
      try {
        const actorName = ensured.profile?.display_name || `@${ensured.profile?.handle || "pengguna"}`;
        await supabaseAdmin.from("notifications").insert({
          recipient_id: notifyAuthorId,
          type: "social_thread",
          title: data.parentId ? `${actorName} membalas utas Anda` : `${actorName} mengutip utas Anda`,
          message: String(data.segments[0]?.body || "Lihat utas terbaru di Ebrystore Threads.").slice(0, 140),
          related_type: "social_post",
          related_id: createdRows[0].id,
        });
      } catch {
        /* notifikasi opsional */
      }
    }

    const hydrated = await hydrateThreadPosts(createdRows, userId, {
      includeReplyPreviews: false,
      parentProductId: parentPostRow?.attached_product_id ?? null,
    });
    return {
      ok: true as const,
      posts: hydrated,
      firstPost: hydrated[0] ?? null,
      autoDmTriggered,
    };
  });

/** Direct signed upload URL for short vertical Reel videos (MP4/WebM up to 30 MB). */
export const prepareReelUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        mimeType: z.string().max(80),
        sizeBytes: z.number().int().min(1).max(REEL_MAX_BYTES),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const limited = await enforceRateLimit(userId, "social.upload");
    if (limited) return { ok: false as const, error: limited.error };

    const normalizedMime = data.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
    const ext = REEL_MIME_EXT[normalizedMime];
    if (!ext) {
      return { ok: false as const, error: "Format video Reel harus MP4 atau WebM." };
    }

    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const supabaseAdmin = await getAdminDb();
    const { data: signed, error } = await supabaseAdmin.storage
      .from("social-reels")
      .createSignedUploadUrl(path);
    if (error || !signed?.token) {
      return {
        ok: false as const,
        error: "Unggahan video Reel belum tersedia. Coba lagi beberapa saat lagi.",
      };
    }

    return {
      ok: true as const,
      bucket: "social-reels" as const,
      path,
      token: String(signed.token),
      mimeType: normalizedMime,
      publicUrl: `/api/public/social-reel/${path}`,
    };
  });

/** Upload a validated thread image (magic-byte + sharp decode via persistCatalogImage). */
export const uploadThreadImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ base64: z.string().min(32).max(5_000_000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const limited = await enforceRateLimit(userId, "social.upload");
    if (limited) return { ok: false as const, error: limited.error };

    const { persistCatalogImage } = await import("./banner-upload.server");
    const result = await persistCatalogImage(data.base64, `social/${userId}`);
    if (!result.ok) return { ok: false as const, error: result.error };
    return { ok: true as const, url: result.url };
  });

/** Atomic Poll vote via DB RPC. */
export const voteThreadPoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        postId: z.string().uuid(),
        optionIndex: z.number().int().min(0).max(3),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const limited = await enforceRateLimit(userId, "social.toggle");
    if (limited) return { ok: false as const, error: limited.error };
    const { data: res, error } = await supabase.rpc("vote_social_poll", {
      _post_id: data.postId,
      _option_index: data.optionIndex,
    });
    if (error) {
      const msg = String(error.message ?? "");
      if (msg.includes("POLL_EXPIRED")) {
        return { ok: false as const, error: "Polling ini sudah berakhir." };
      }
      return { ok: false as const, error: "Suara polling gagal disimpan." };
    }
    return {
      ok: true as const,
      viewerOption: Number(res?.viewer_option ?? data.optionIndex),
      counts: (res?.counts ?? []) as Array<{ index: number; votes: number }>,
      totalVotes: Number(res?.total_votes ?? 0),
    };
  });

/** Rate-limited Reels view counter (service_role RPC only; prevents anon inflation). */
export const recordReelView = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ postId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    try {
      const viewerId = await getOptionalViewerId();
      const subject = viewerId ? `reel-view:${viewerId}:${data.postId}` : `reel-view:anon:${data.postId}`;
      const limited = await enforceRateLimit(subject, "social.toggle");
      if (limited) return { ok: false as const, viewsCount: 0 };
      const supabaseAdmin = await getAdminDb();
      const { data: views } = await supabaseAdmin.rpc("increment_social_post_view", {
        _post_id: data.postId,
      });
      return { ok: true as const, viewsCount: Number(views ?? 0) };
    } catch {
      return { ok: false as const, viewsCount: 0 };
    }
  });

export const toggleThreadLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ postId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const limited = await enforceRateLimit(userId, "social.toggle");
    if (limited) return { ok: false as const, error: limited.error };
    const { data: res, error } = await supabase.rpc("toggle_social_post_like", {
      _post_id: data.postId,
    });
    if (error) return { ok: false as const, error: "Gagal memperbarui suka." };
    return {
      ok: true as const,
      liked: Boolean(res?.liked),
      likesCount: Number(res?.likes_count ?? 0),
    };
  });

export const toggleThreadRepost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ postId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const limited = await enforceRateLimit(userId, "social.toggle");
    if (limited) return { ok: false as const, error: limited.error };
    const { data: res, error } = await supabase.rpc("toggle_social_post_repost", {
      _post_id: data.postId,
    });
    if (error) return { ok: false as const, error: "Gagal memposting ulang utas." };
    return {
      ok: true as const,
      reposted: Boolean(res?.reposted),
      repostsCount: Number(res?.reposts_count ?? 0),
    };
  });

export const toggleThreadBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ postId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const limited = await enforceRateLimit(userId, "social.toggle");
    if (limited) return { ok: false as const, error: limited.error };
    const { data: res, error } = await supabase.rpc("toggle_social_post_bookmark", {
      _post_id: data.postId,
    });
    if (error) return { ok: false as const, error: "Gagal menyimpan utas." };
    return {
      ok: true as const,
      bookmarked: Boolean(res?.bookmarked),
      bookmarksCount: Number(res?.bookmarks_count ?? 0),
    };
  });

export const toggleUserFollow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ targetUserId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const limited = await enforceRateLimit(userId, "social.toggle");
    if (limited) return { ok: false as const, error: limited.error };
    await ensureMySocialProfile(userId);
    const { data: res, error } = await supabase.rpc("toggle_social_follow", {
      _target_user_id: data.targetUserId,
    });
    if (error) return { ok: false as const, error: "Gagal memperbarui status ikuti." };
    return {
      ok: true as const,
      following: Boolean(res?.following),
      followersCount: Number(res?.followers_count ?? 0),
    };
  });

export const deleteThreadPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ postId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    // P0 #1: Soft-delete via service_role with strict server-side `author_id = userId` ownership check
    const supabaseAdmin = await getAdminDb();
    const { error } = await supabaseAdmin
      .from("social_posts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.postId)
      .eq("author_id", userId)
      .is("deleted_at", null);
    if (error) return { ok: false as const, error: "Utas gagal dihapus." };
    return { ok: true as const };
  });

export const reportThreadPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        postId: z.string().uuid(),
        reason: z.enum(["spam", "scam", "harassment", "inappropriate", "other"]),
        details: z.string().trim().max(400).default(""),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const limited = await enforceRateLimit(userId, "social.report");
    if (limited) return { ok: false as const, error: limited.error };
    const { error } = await supabase.from("social_post_reports").upsert(
      {
        post_id: data.postId,
        reporter_id: userId,
        reason: data.reason,
        details: data.details,
      },
      { onConflict: "post_id,reporter_id" },
    );
    if (error) return { ok: false as const, error: "Laporan gagal dikirim." };
    return { ok: true as const };
  });
