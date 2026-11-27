import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AtSign,
  BadgeCheck,
  Bookmark,
  Check,
  Copy,
  Film,
  Loader2,
  MessageCircle,
  Package,
  Plus,
  ReceiptText,
  Settings,
  Share2,
  Store,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TopupPanel } from "@/components/ebry/topup-panel";
import { formatRupiah } from "@/lib/format";
import { createProductInquiry, findMyStoreThread } from "@/lib/inquiries.functions";
import { getCustomerSummary, getMyCredit } from "@/lib/orders.functions";
import {
  deleteThreadPost,
  listThreadsFeed,
  reportThreadPost,
  toggleThreadBookmark,
  toggleThreadLike,
  toggleThreadRepost,
  toggleUserFollow,
  updateMySocialProfile,
} from "@/lib/social-threads.functions";
import type {
  AttachedCommerceItem,
  SocialAuthor,
  SocialMediaItem,
  ThreadPostItem,
  ThreadReportReason,
} from "@/lib/social-threads.shared";
import { cn, isRenderableImageUrl, optimizedMediaUrl } from "@/lib/utils";
import { ThreadCard, type ThreadCardActions } from "./thread-card";
import { ThreadComposerModal } from "./thread-composer";
import { ThreadCommerceCard } from "./thread-commerce-card";
import { ThreadImageLightbox } from "./thread-lightbox";
import { ThreadShareModal } from "./thread-share-card";

type ProfileTab = "threads" | "replies" | "reels" | "catalog" | "bookmarks";

/**
 * 100% authentic Meta Threads Profile View shared between:
 * - `/dashboard/profil` (logged-in user's own profile with Edit Profil, Wallet/Orders strip, Bookmarks, Compose)
 * - `/u/$handle` (public creator Link-in-Bio + Storefront + Threads + Reels)
 */
export function ThreadsProfileView({
  creator,
  threads,
  replies,
  reels,
  products,
  services,
  isAuthenticated,
  onRefresh,
}: {
  creator: SocialAuthor;
  threads: ThreadPostItem[];
  replies: ThreadPostItem[];
  reels: ThreadPostItem[];
  products: AttachedCommerceItem[];
  services: AttachedCommerceItem[];
  isAuthenticated: boolean;
  onRefresh?: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<ProfileTab>("threads");
  const [isFollowed, setIsFollowed] = useState(creator.isFollowedByMe);
  const [followersCount, setFollowersCount] = useState(creator.followersCount);
  const [editOpen, setEditOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ThreadPostItem | null>(null);
  const [quoteTarget, setQuoteTarget] = useState<ThreadPostItem | null>(null);
  const [sharePost, setSharePost] = useState<ThreadPostItem | null>(null);
  const [lightbox, setLightbox] = useState<{ items: SocialMediaItem[]; index: number } | null>(null);
  const [openingChat, setOpeningChat] = useState(false);
  const [copiedBio, setCopiedBio] = useState(false);

  useEffect(() => {
    setIsFollowed(creator.isFollowedByMe);
    setFollowersCount(creator.followersCount);
  }, [creator.isFollowedByMe, creator.followersCount]);

  const likeFn = useServerFn(toggleThreadLike);
  const repostFn = useServerFn(toggleThreadRepost);
  const bookmarkFn = useServerFn(toggleThreadBookmark);
  const followFn = useServerFn(toggleUserFollow);
  const deleteFn = useServerFn(deleteThreadPost);
  const reportFn = useServerFn(reportThreadPost);
  const findThreadFn = useServerFn(findMyStoreThread);
  const createInquiryFn = useServerFn(createProductInquiry);
  const listFeedFn = useServerFn(listThreadsFeed);
  const fetchCredit = useServerFn(getMyCredit);
  const fetchSummary = useServerFn(getCustomerSummary);

  // Own profile: load bookmarks lazily when tab === "bookmarks" + compact wallet/orders strip
  const bookmarksQ = useQuery({
    queryKey: ["threads-profile-bookmarks"],
    queryFn: () => listFeedFn({ data: { tab: "bookmarks" } }),
    enabled: creator.isSelf && isAuthenticated && tab === "bookmarks",
  });
  const creditQ = useQuery({
    queryKey: ["my-credit"],
    queryFn: () => fetchCredit({}),
    enabled: creator.isSelf && isAuthenticated,
    staleTime: 60_000,
  });
  const summaryQ = useQuery({
    queryKey: ["customer-summary"],
    queryFn: () => fetchSummary({}),
    enabled: creator.isSelf && isAuthenticated,
    staleTime: 60_000,
  });

  async function handleFollowToggle() {
    if (!isAuthenticated) {
      void navigate({ to: "/auth" });
      return;
    }
    const next = !isFollowed;
    setIsFollowed(next);
    setFollowersCount((c) => Math.max(0, c + (next ? 1 : -1)));
    const res = await followFn({ data: { targetUserId: creator.id } });
    if (!res.ok) {
      setIsFollowed(!next);
      setFollowersCount(creator.followersCount);
      toast.error(res.error);
      return;
    }
    toast.success(res.following ? `Mengikuti @${creator.handle}` : `Berhenti mengikuti @${creator.handle}`);
    onRefresh?.();
  }

  async function handleChatCreator() {
    if (!isAuthenticated) {
      void navigate({ to: "/auth" });
      return;
    }
    if (!creator.verifiedStore) {
      toast.info("Kreator ini belum membuka toko di Ebrystore.");
      return;
    }
    if (openingChat) return;
    setOpeningChat(true);
    try {
      const existing = await findThreadFn({ data: { storeId: creator.verifiedStore.id } });
      if (existing.id) {
        void navigate({ to: "/dashboard/chat/$id", params: { id: existing.id } });
        return;
      }
      const created = await createInquiryFn({
        data: {
          storeId: creator.verifiedStore.id,
          subject: `Halo @${creator.handle}`,
          body: `Halo ${creator.verifiedStore.name}, saya mengunjungi profil Threads Anda di Ebrystore dan ingin bertanya.`,
        },
      });
      if (!created.ok) {
        toast.error(created.error);
        return;
      }
      void navigate({ to: "/dashboard/chat/$id", params: { id: created.id } });
    } catch {
      toast.error("Gagal membuka percakapan.");
    } finally {
      setOpeningChat(false);
    }
  }

  function handleShareProfile() {
    const url = `${window.location.origin}/u/${creator.handle}`;
    void navigator.clipboard?.writeText(url);
    setCopiedBio(true);
    toast.success(`Link bio /u/${creator.handle} disalin!`);
    window.setTimeout(() => setCopiedBio(false), 1800);
  }

  const actions: ThreadCardActions = {
    onLike: (p) => {
      if (!isAuthenticated) {
        void navigate({ to: "/auth" });
        return;
      }
      void likeFn({ data: { postId: p.targetPostId } }).then(() => onRefresh?.());
    },
    onReply: (p) => {
      if (!isAuthenticated) {
        void navigate({ to: "/auth" });
        return;
      }
      setQuoteTarget(null);
      setReplyTarget(p);
      setComposeOpen(true);
    },
    onRepost: (p) => {
      if (!isAuthenticated) return;
      void repostFn({ data: { postId: p.targetPostId } }).then((res) => {
        if (res.ok) toast.success(res.reposted ? "Diposting ulang." : "Posting ulang dibatalkan.");
        onRefresh?.();
      });
    },
    onQuote: (p) => {
      if (!isAuthenticated) return;
      setReplyTarget(null);
      setQuoteTarget(p);
      setComposeOpen(true);
    },
    onBookmark: (p) => {
      if (!isAuthenticated) return;
      void bookmarkFn({ data: { postId: p.targetPostId } }).then((res) => {
        if (res.ok) toast.success(res.bookmarked ? "Utas disimpan." : "Dihapus dari tersimpan.");
        void queryClient.invalidateQueries({ queryKey: ["threads-profile-bookmarks"] });
        onRefresh?.();
      });
    },
    onFollow: (uid) => {
      if (!isAuthenticated) return;
      void followFn({ data: { targetUserId: uid } }).then(() => onRefresh?.());
    },
    onDelete: (pid) => {
      if (!isAuthenticated) return;
      void deleteFn({ data: { postId: pid } }).then((res) => {
        if (res.ok) toast.success("Utas dihapus.");
        onRefresh?.();
      });
    },
    onReport: (pid: string, reason: ThreadReportReason) => {
      void reportFn({ data: { postId: pid, reason, details: "" } }).then((res) => {
        if (res.ok) toast.success("Laporan diterima.");
      });
    },
    onOpenLightbox: (items, index) => setLightbox({ items, index }),
    onShare: (p) => setSharePost(p),
    onReplyCreated: () => onRefresh?.(),
  };

  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => {
    setAvatarFailed(false);
  }, [creator.avatarUrl]);
  const avatarImg =
    !avatarFailed && isRenderableImageUrl(creator.avatarUrl) ? creator.avatarUrl : null;
  const initial = (creator.displayName.trim()[0] ?? "E").toUpperCase();
  const catalogCount = products.length + services.length;

  const tabs: Array<{ id: ProfileTab; label: string }> = creator.isSelf
    ? [
        { id: "threads", label: "Utas" },
        { id: "replies", label: "Balasan" },
        { id: "reels", label: "Reels" },
        ...(catalogCount > 0 ? [{ id: "catalog" as const, label: "Katalog" }] : []),
        { id: "bookmarks", label: "Tersimpan" },
      ]
    : [
        { id: "threads", label: "Utas" },
        { id: "replies", label: "Balasan" },
        { id: "reels", label: "Reels" },
        { id: "catalog", label: `Katalog${catalogCount > 0 ? ` (${catalogCount})` : ""}` },
      ];

  return (
    <div className="mx-auto w-full max-w-[640px]">
      {/* Elevated Meta Threads Profile Column (edge-to-edge on mobile, rounded-3xl on desktop) */}
      <div className="threads-stage-column -mx-4 overflow-hidden border-y sm:mx-0 sm:rounded-[28px] sm:border">
        {/* Authentic Meta Threads Profile Header */}
        <header className="px-5 pb-4 pt-6 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-center gap-1.5">
                <h1 className="truncate font-display text-[23px] font-extrabold leading-tight tracking-tight text-foreground sm:text-[26px]">
                  {creator.displayName}
                </h1>
                {creator.verifiedStore ? (
                  <BadgeCheck
                    className="size-5 shrink-0 text-accent"
                    aria-label="Kreator dan toko terverifikasi"
                  />
                ) : null}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-[14.5px] font-medium text-foreground/90">
                  {creator.handle}
                </span>
                <span className="rounded-full bg-foreground/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  ebrystore.my.id
                </span>
              </div>
            </div>

            {/* Iconic Large 84px Circular Threads Profile Avatar */}
            <div className="relative size-[76px] shrink-0 sm:size-[84px]">
              <span className="grid size-full place-items-center overflow-hidden rounded-full border border-border/80 bg-surface-selected font-display text-2xl font-bold text-foreground shadow-xs">
                {avatarImg ? (
                  <img
                    src={optimizedMediaUrl(avatarImg, 240)}
                    alt={creator.displayName}
                    width={84}
                    height={84}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                    className="block size-full object-cover object-center"
                  />
                ) : (
                  initial
                )}
              </span>
            </div>
          </div>

          {/* Crisp Threads Bio */}
          {creator.bio ? (
            <p className="mt-3.5 whitespace-pre-line text-[15px] leading-[1.46] text-foreground">
              {creator.bio}
            </p>
          ) : creator.isSelf ? (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="mt-3 text-sm text-muted-foreground hover:text-foreground"
            >
              + Tambahkan bio singkat agar kreator dan pembeli mengenal Anda
            </button>
          ) : null}

          {/* Followers & Store link row (exact Threads subtle grey metadata row) */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[14px] text-muted-foreground">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="tabular-nums">
                <strong className="font-semibold text-foreground">{followersCount}</strong> pengikut
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                <strong className="font-semibold text-foreground">{creator.followingCount}</strong>{" "}
                mengikuti
              </span>
              {creator.verifiedStore ? (
                <>
                  <span aria-hidden="true">·</span>
                  <Link
                    to="/toko/$slug"
                    params={{ slug: creator.verifiedStore.slug }}
                    className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
                  >
                    <Store className="size-3.5" aria-hidden="true" />
                    <span>{creator.verifiedStore.name}</span>
                  </Link>
                </>
              ) : null}
            </div>

            {creator.isSelf ? (
              <Link
                to="/dashboard/pengaturan"
                aria-label="Pengaturan akun"
                className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              >
                <Settings className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
          </div>

          {/* Full-width Meta Threads 2-Button Action Row */}
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {creator.isSelf ? (
              <>
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-transparent px-4 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Edit profil
                </button>
                <button
                  type="button"
                  onClick={handleShareProfile}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-transparent px-4 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {copiedBio ? (
                    <>
                      <Check className="size-4 text-accent" aria-hidden="true" />
                      <span>Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="size-4" aria-hidden="true" />
                      <span>Bagikan profil</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleFollowToggle()}
                  className={cn(
                    "inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isFollowed
                      ? "border border-border bg-transparent text-foreground hover:bg-foreground/[0.04]"
                      : "bg-foreground text-background hover:opacity-90",
                  )}
                >
                  {isFollowed ? "Mengikuti" : "Ikuti"}
                </button>
                {creator.verifiedStore ? (
                  <button
                    type="button"
                    disabled={openingChat}
                    onClick={() => void handleChatCreator()}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-transparent px-4 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.04] disabled:opacity-60"
                  >
                    {openingChat ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <MessageCircle className="size-4 text-accent" aria-hidden="true" />
                    )}
                    <span>Chat Toko</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleShareProfile}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-transparent px-4 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.04]"
                  >
                    <Copy className="size-4" aria-hidden="true" />
                    <span>Salin Bio</span>
                  </button>
                )}
              </>
            )}
          </div>

          {/* Sleek Single-Line Marketplace Utility Strip (ONLY on own profile, zero bulky boxes) */}
          {creator.isSelf && isAuthenticated ? (
            <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setTopupOpen(true)}
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/[0.09]"
              >
                <Wallet className="size-3.5 text-accent" aria-hidden="true" />
                <span className="tabular-nums">{formatRupiah(creditQ.data?.balance ?? 0)}</span>
                <Plus className="size-3 text-muted-foreground" aria-hidden="true" />
              </button>
              <Link
                to="/dashboard/pesanan"
                search={{ filter: "all" }}
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/[0.09]"
              >
                <ReceiptText className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span>{summaryQ.data?.activeOrders ?? 0} Pesanan</span>
              </Link>
              <Link
                to="/dashboard/produk-saya"
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground/[0.05] px-3 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/[0.09]"
              >
                <Package className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span>{summaryQ.data?.entitlements ?? 0} Produk</span>
              </Link>
              <Link
                to="/seller"
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent/12 px-3 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
              >
                <Store className="size-3.5" aria-hidden="true" />
                <span>{creator.verifiedStore ? "Kelola Toko" : "Buka Toko"}</span>
              </Link>
            </div>
          ) : null}
        </header>

        {/* Authentic Full-Width Equal Threads Profile Tabs */}
        <nav
          role="tablist"
          aria-label="Tab profil Threads"
          className="grid border-b border-border/80"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  "threads-tab min-h-12 text-center text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Quick Compose bar at top of own "Utas" tab (authentic Threads own-profile UX!) */}
        {creator.isSelf && tab === "threads" ? (
          <div className="flex items-center gap-3 border-b border-border/75 px-5 py-3.5">
            <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-border/80 bg-surface-selected text-xs font-bold text-foreground">
              {avatarImg ? (
                <img src={optimizedMediaUrl(avatarImg, 96)} alt="" className="size-full object-cover" />
              ) : (
                initial
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                setReplyTarget(null);
                setQuoteTarget(null);
                setComposeOpen(true);
              }}
              className="flex min-h-10 flex-1 items-center text-left text-[15px] text-muted-foreground hover:text-foreground"
            >
              Apa yang baru?
            </button>
            <button
              type="button"
              onClick={() => {
                setReplyTarget(null);
                setQuoteTarget(null);
                setComposeOpen(true);
              }}
              className="min-h-9 rounded-xl border border-border px-4 text-xs font-semibold text-foreground hover:bg-foreground/[0.04]"
            >
              Posting
            </button>
          </div>
        ) : null}

        {/* Tab Contents */}
        {tab === "catalog" ? (
          <div className="space-y-2.5 p-5">
            {catalogCount === 0 ? (
              <div className="py-12 text-center">
                <Package className="mx-auto size-6 text-muted-foreground/60" aria-hidden="true" />
                <p className="mt-2.5 text-sm font-semibold text-foreground">Belum ada katalog</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Produk digital dan jasa dari @{creator.handle} akan tampil di sini.
                </p>
              </div>
            ) : (
              <>
                {products.map((p) => (
                  <ThreadCommerceCard key={p.id} item={p} readOnly={!isAuthenticated} />
                ))}
                {services.map((s) => (
                  <ThreadCommerceCard key={s.id} item={s} readOnly={!isAuthenticated} />
                ))}
              </>
            )}
          </div>
        ) : tab === "reels" ? (
          reels.length === 0 ? (
            <div className="py-14 text-center">
              <Film className="mx-auto size-6 text-muted-foreground/60" aria-hidden="true" />
              <p className="mt-2.5 text-sm font-semibold text-foreground">Belum ada video Reels</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Video demo produk atau jasa pendek akan muncul di tab ini.
              </p>
            </div>
          ) : (
            <div>
              {reels.map((post) => (
                <ThreadCard
                  key={post.id}
                  post={post}
                  actions={actions}
                  viewer={creator.isSelf ? creator : null}
                  readOnly={!isAuthenticated}
                />
              ))}
            </div>
          )
        ) : tab === "replies" ? (
          replies.length === 0 ? (
            <div className="py-14 text-center">
              <MessageCircle className="mx-auto size-6 text-muted-foreground/60" aria-hidden="true" />
              <p className="mt-2.5 text-sm font-semibold text-foreground">Belum ada balasan</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Balasan yang dikirim pada utas orang lain akan tampil di sini.
              </p>
            </div>
          ) : (
            <div>
              {replies.map((post) => (
                <ThreadCard
                  key={post.id}
                  post={post}
                  actions={actions}
                  viewer={creator.isSelf ? creator : null}
                  readOnly={!isAuthenticated}
                  allowInlineReplies={false}
                />
              ))}
            </div>
          )
        ) : tab === "bookmarks" ? (
          bookmarksQ.isPending ? (
            <div className="flex items-center justify-center py-14 text-xs text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              Memuat utas tersimpan...
            </div>
          ) : (bookmarksQ.data?.items?.length ?? 0) === 0 ? (
            <div className="py-14 text-center">
              <Bookmark className="mx-auto size-6 text-muted-foreground/60" aria-hidden="true" />
              <p className="mt-2.5 text-sm font-semibold text-foreground">Belum ada utas tersimpan</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Simpan utas atau referensi produk menarik untuk dibaca lagi nanti.
              </p>
            </div>
          ) : (
            <div>
              {(bookmarksQ.data?.items ?? []).map((post) => (
                <ThreadCard
                  key={post.id}
                  post={post}
                  actions={actions}
                  viewer={creator}
                />
              ))}
            </div>
          )
        ) : threads.length === 0 ? (
          <div className="py-14 text-center">
            <AtSign className="mx-auto size-6 text-muted-foreground/60" aria-hidden="true" />
            <p className="mt-2.5 text-sm font-semibold text-foreground">Belum ada utas</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {creator.isSelf
                ? "Bagikan pemikiran, review, atau tautkan produk digital pertama Anda."
                : `@${creator.handle} belum menerbitkan utas.`}
            </p>
            {creator.isSelf ? (
              <button
                type="button"
                onClick={() => setComposeOpen(true)}
                className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-foreground px-5 text-xs font-bold text-background hover:opacity-90"
              >
                <Plus className="size-4" aria-hidden="true" />
                <span>Tulis Utas Pertama</span>
              </button>
            ) : null}
          </div>
        ) : (
          <div>
            {threads.map((post) => (
              <ThreadCard
                key={post.id}
                post={post}
                actions={actions}
                viewer={creator.isSelf ? creator : null}
                readOnly={!isAuthenticated}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Profile Modal (own profile) */}
      {creator.isSelf ? (
        <ProfileEditModal
          open={editOpen}
          onOpenChange={setEditOpen}
          creator={creator}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ["social-bootstrap"] });
            void queryClient.invalidateQueries({ queryKey: ["threads-feed"] });
            onRefresh?.();
          }}
        />
      ) : null}

      {/* Topup Dialog (own profile) */}
      {creator.isSelf ? (
        <Dialog open={topupOpen} onOpenChange={setTopupOpen}>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-display text-base">Isi Saldo Ebrystore</DialogTitle>
              <DialogDescription className="text-xs">
                Top up saldo instan untuk checkout produk digital dan jasa.
              </DialogDescription>
            </DialogHeader>
            <TopupPanel
              onPaid={() => {
                void queryClient.invalidateQueries({ queryKey: ["my-credit"] });
                setTopupOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {/* Composer Modal */}
      {isAuthenticated ? (
        <ThreadComposerModal
          open={composeOpen}
          onOpenChange={setComposeOpen}
          me={creator.isSelf ? creator : null}
          replyTo={replyTarget}
          quotePost={quoteTarget}
          onPublished={() => {
            void queryClient.invalidateQueries({ queryKey: ["threads-feed"] });
            onRefresh?.();
          }}
        />
      ) : null}

      <ThreadShareModal
        post={sharePost}
        viewerHandle={creator.isSelf ? creator.handle : null}
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

function ProfileEditModal({
  open,
  onOpenChange,
  creator,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creator: SocialAuthor;
  onSaved: () => void;
}) {
  const updateFn = useServerFn(updateMySocialProfile);
  const [displayName, setDisplayName] = useState(creator.displayName);
  const [handle, setHandle] = useState(creator.handle);
  const [bio, setBio] = useState(creator.bio);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDisplayName(creator.displayName);
      setHandle(creator.handle);
      setBio(creator.bio);
    }
  }, [open, creator]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const res = await updateFn({ data: { handle, displayName, bio } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Profil diperbarui.");
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("Gagal menyimpan profil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl p-5">
        <DialogHeader>
          <DialogTitle className="font-display text-base">Edit profil</DialogTitle>
          <DialogDescription className="text-xs">
            Perubahan ini tampil di linimasa Threads serta tautan bio publik /u/{handle}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void submit(e)} className="space-y-3.5">
          <div>
            <label htmlFor="prof-name" className="text-xs font-semibold text-foreground">
              Nama
            </label>
            <input
              id="prof-name"
              required
              minLength={2}
              maxLength={60}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="prof-handle" className="text-xs font-semibold text-foreground">
              Username
            </label>
            <div className="mt-1 flex items-center rounded-xl border border-border bg-background px-3.5 focus-within:ring-2 focus-within:ring-ring">
              <span className="text-sm text-muted-foreground">@</span>
              <input
                id="prof-handle"
                required
                minLength={3}
                maxLength={28}
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                className="h-11 min-w-0 flex-1 bg-transparent pl-1 font-mono text-sm text-foreground outline-none"
              />
            </div>
          </div>
          <div>
            <label htmlFor="prof-bio" className="text-xs font-semibold text-foreground">
              Bio
            </label>
            <textarea
              id="prof-bio"
              rows={3}
              maxLength={160}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tulis keahlian, produk digital, atau karya Anda..."
              className="mt-1 w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="mt-1 text-right font-mono text-[11px] text-muted-foreground">
              {bio.length}/160
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-sm font-bold text-background hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            <span>Selesai</span>
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
