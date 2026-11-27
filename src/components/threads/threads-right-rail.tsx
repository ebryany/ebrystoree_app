import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  Copy,
  Hash,
  MessagesSquare,
  Package,
  Plus,
  ReceiptText,
  Store,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { TopupPanel } from "@/components/ebry/topup-panel";
import { useSession } from "@/hooks/use-session";
import { formatRupiah } from "@/lib/format";
import { getCustomerSummary, getMyCredit } from "@/lib/orders.functions";
import type {
  SocialAuthor,
  SuggestedCreator,
  TrendingHashtag,
} from "@/lib/social-threads.shared";
import { AuthorAvatar } from "./thread-card";

/**
 * Redesigned Staff-grade right panel for Ebrystore Threads (`xl+`):
 * - Real OAuth + Storage avatar (fixes missing photo bug!) with clean creator identity header
 * - High-contrast modern monochrome Wallet Bar + 3 tactile quick-metric tiles
 * - Shareable Link-in-Bio (`/u/@handle`) card + real Suggested Creators & Trending Topics
 */
export function ThreadsRightRail({
  me,
  trendingTags,
  suggestedCreators,
  activeTag,
  onSelectTag,
  onFollowCreator,
}: {
  me: SocialAuthor | null;
  trendingTags: TrendingHashtag[];
  suggestedCreators: SuggestedCreator[];
  activeTag: string | null;
  onSelectTag: (tag: string | null) => void;
  onFollowCreator: (userId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [showTopup, setShowTopup] = useState(false);
  const [copiedBio, setCopiedBio] = useState(false);

  const fetchSummary = useServerFn(getCustomerSummary);
  const fetchCredit = useServerFn(getMyCredit);

  const { data: summary } = useQuery({
    queryKey: ["customer-summary"],
    queryFn: () => fetchSummary({}),
    staleTime: 60_000,
  });
  const { data: credit } = useQuery({
    queryKey: ["my-credit"],
    queryFn: () => fetchCredit({}),
    staleTime: 60_000,
  });

  const balance = credit?.balance ?? 0;
  const awaiting = summary?.awaitingPayment ?? 0;
  const activeOrders = summary?.activeOrders ?? 0;
  const entitlements = summary?.entitlements ?? 0;

  // Instant client fallback to Google OAuth photo if server avatar is still empty
  const sessionAvatar =
    (user?.user_metadata?.avatar_url as string | undefined) ||
    (user?.user_metadata?.picture as string | undefined) ||
    null;
  const resolvedAvatar = me?.avatarUrl || sessionAvatar;

  function handleCopyBio() {
    if (!me) return;
    const url = `${window.location.origin}/u/${me.handle}`;
    void navigator.clipboard?.writeText(url);
    setCopiedBio(true);
    toast.success(`Link bio /u/${me.handle} disalin.`);
    window.setTimeout(() => setCopiedBio(false), 1800);
  }

  return (
    <aside
      aria-label="Profil cepat, dompet, dan komunitas"
      className="sticky top-[80px] hidden w-[304px] shrink-0 space-y-4 xl:block"
    >
      {/* 1. Modern Creator + Wallet Studio Card */}
      <section className="overflow-hidden rounded-[26px] border border-border/80 bg-card shadow-[0_2px_14px_-6px_rgba(0,0,0,0.06)]">
        {/* Creator Identity Header */}
        {me ? (
          <div className="flex items-center gap-3 p-4">
            <Link to="/dashboard/profil" className="shrink-0 transition-transform hover:scale-[1.03]">
              <AuthorAvatar
                displayName={me.displayName}
                avatarUrl={resolvedAvatar}
                size="lg"
              />
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                to="/dashboard/profil"
                className="flex items-center gap-1 text-[14.5px] font-bold leading-snug text-foreground hover:underline"
              >
                <span className="truncate">{me.displayName}</span>
                {me.verifiedStore ? (
                  <BadgeCheck className="size-4 shrink-0 text-accent" aria-hidden="true" />
                ) : null}
              </Link>
              <p className="truncate text-xs text-muted-foreground">@{me.handle}</p>
            </div>
            <Link
              to="/dashboard/profil"
              aria-label="Buka halaman profil Threads"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground/[0.05] text-muted-foreground transition-colors hover:bg-foreground/[0.1] hover:text-foreground"
            >
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        ) : null}

        {/* Sleek High-Contrast Wallet Pill Strip */}
        <div className="px-3.5 pb-3.5">
          <div className="rounded-2xl bg-foreground p-3.5 text-background">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-medium opacity-75">
                  <Wallet className="size-3.5" aria-hidden="true" />
                  <span>Saldo Ebrystore</span>
                </p>
                <p className="mt-0.5 truncate font-display text-lg font-extrabold tracking-tight tabular-nums">
                  {formatRupiah(balance)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTopup((v) => !v)}
                className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-xl bg-background px-3 text-xs font-bold text-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                <span>Top up</span>
              </button>
            </div>
          </div>

          {showTopup ? (
            <div className="mt-3 rounded-2xl border border-border/80 bg-surface/60 p-3">
              <TopupPanel
                onPaid={() => {
                  void queryClient.invalidateQueries({ queryKey: ["my-credit"] });
                  setShowTopup(false);
                }}
              />
            </div>
          ) : null}

          {/* 3-Column Clean Activity Mini-Tiles */}
          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
            <Link
              to="/dashboard/pesanan"
              search={{ filter: awaiting > 0 ? "unpaid" : "all" }}
              className="group rounded-xl bg-foreground/[0.04] px-2.5 py-2 transition-colors hover:bg-foreground/[0.08]"
            >
              <ReceiptText className="size-3.5 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
              <p className="mt-1.5 text-sm font-bold leading-none tabular-nums text-foreground">
                {awaiting > 0 ? awaiting : activeOrders}
              </p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {awaiting > 0 ? "Tagihan" : "Pesanan"}
              </p>
            </Link>

            <Link
              to="/dashboard/produk-saya"
              className="group rounded-xl bg-foreground/[0.04] px-2.5 py-2 transition-colors hover:bg-foreground/[0.08]"
            >
              <Package className="size-3.5 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
              <p className="mt-1.5 text-sm font-bold leading-none tabular-nums text-foreground">
                {entitlements}
              </p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">Produk</p>
            </Link>

            <Link
              to="/dashboard/chat"
              className="group rounded-xl bg-foreground/[0.04] px-2.5 py-2 transition-colors hover:bg-foreground/[0.08]"
            >
              <MessagesSquare className="size-3.5 text-accent" aria-hidden="true" />
              <p className="mt-1.5 text-sm font-bold leading-none text-foreground">Chat</p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">Langsung</p>
            </Link>
          </div>
        </div>

        {/* Share Bio Link & Seller Footer Row */}
        {me ? (
          <div className="flex items-center justify-between gap-2 border-t border-border/70 bg-surface/35 px-4 py-2.5 text-xs">
            <button
              type="button"
              onClick={handleCopyBio}
              className="inline-flex min-h-8 min-w-0 items-center gap-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {copiedBio ? (
                <Check className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate font-mono text-[11px]">/u/{me.handle}</span>
            </button>
            <Link
              to="/seller"
              className="inline-flex min-h-8 shrink-0 items-center gap-1 font-semibold text-accent hover:underline"
            >
              <Store className="size-3.5" aria-hidden="true" />
              <span>{me.verifiedStore ? "Kelola Toko" : "Buka Toko"}</span>
            </Link>
          </div>
        ) : null}
      </section>

      {/* 2. Suggested Verified Creators & Active Stores */}
      {suggestedCreators.length > 0 ? (
        <section className="rounded-[24px] border border-border/75 bg-card/85 p-4">
          <h2 className="text-xs font-bold text-foreground">Kreator & Toko Disarankan</h2>
          <ul className="mt-3 space-y-3">
            {suggestedCreators.map((creator) => (
              <li key={creator.id} className="flex items-center gap-2.5">
                <Link to="/u/$handle" params={{ handle: creator.handle }} className="shrink-0">
                  <AuthorAvatar
                    displayName={creator.displayName}
                    avatarUrl={creator.avatarUrl}
                    size="sm"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    to="/u/$handle"
                    params={{ handle: creator.handle }}
                    className="flex items-center gap-1 hover:underline"
                  >
                    <span className="truncate text-[13px] font-semibold text-foreground">
                      {creator.handle}
                    </span>
                    {creator.verifiedStore ? (
                      <BadgeCheck
                        className="size-3.5 shrink-0 text-accent"
                        aria-label="Toko terverifikasi"
                      />
                    ) : null}
                  </Link>
                  <p className="truncate text-[11.5px] text-muted-foreground">
                    {creator.verifiedStore?.name ?? creator.displayName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onFollowCreator(creator.id)}
                  className={
                    creator.isFollowedByMe
                      ? "min-h-8 shrink-0 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
                      : "min-h-8 shrink-0 rounded-xl bg-foreground px-3 text-xs font-semibold text-background transition-opacity hover:opacity-90"
                  }
                >
                  {creator.isFollowedByMe ? "Mengikuti" : "Ikuti"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 3. Real Trending Hashtags */}
      {trendingTags.length > 0 ? (
        <section className="rounded-[24px] border border-border/75 bg-card/85 p-4">
          <h2 className="text-xs font-bold text-foreground">Topik sedang dibahas</h2>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {trendingTags.map((item) => {
              const active = activeTag === item.tag;
              return (
                <button
                  key={item.tag}
                  type="button"
                  onClick={() => onSelectTag(active ? null : item.tag)}
                  className={
                    active
                      ? "inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background"
                      : "inline-flex items-center gap-1 rounded-full bg-foreground/[0.05] px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.1]"
                  }
                >
                  <Hash className="size-3 opacity-70" aria-hidden="true" />
                  <span>{item.tag}</span>
                  <span className="tabular-nums opacity-65">{item.count}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </aside>
  );
}
