import { useState } from "react";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ExternalLink,
  Home,
  MessageSquare,
  Package,
  ReceiptText,
  Settings,
  Store,
  Wallet,
} from "lucide-react";

import { AdminLoading } from "@/components/admin/admin-ui";
import { ErrorState } from "@/components/ebry/states";
import { StatusPill } from "@/components/ebry/status";
import { OnlineDot, PresenceLabel } from "@/components/ebry/online-status";
import { useStorePresence } from "@/hooks/use-store-presence";
import { BottomNavigation, type BottomNavItem } from "@/components/ebry/bottom-nav";
import { DashboardSidebar } from "@/components/ebry/dashboard-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SellerOnboarding, StoreStatusBanner } from "@/components/seller/seller-onboarding";
import {
  SellerMobileTabs,
  SellerNavbarDrawerContent,
  SellerSidebar,
} from "@/components/seller/seller-sidebar";
import { useSession } from "@/hooks/use-session";
import { useSellerBadges } from "@/hooks/use-seller-badges";
import { listMyNotifications } from "@/lib/orders.functions";
import { getMyStore } from "@/lib/seller.functions";
import { cn, isRenderableImageUrl, optimizedMediaUrl } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/seller")({
  head: () => ({
    meta: [
      { title: "Dashboard Seller | Ebrystore" },
      { name: "description", content: "Kelola toko dan produk digital Anda di Ebrystore." },
      { property: "og:title", content: "Dashboard Seller | Ebrystore" },
      { property: "og:description", content: "Kelola toko dan produk Anda." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SellerLayout,
});

const STORE_STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Menunggu verifikasi", tone: "waiting" },
  active: { label: "Aktif", tone: "success" },
  suspended: { label: "Ditangguhkan", tone: "danger" },
  rejected: { label: "Ditolak", tone: "neutral" },
};

function SellerLayout() {
  const { user } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isMobileChatThread = /^\/seller\/chat\/[^/]+$/.test(pathname);
  const [openedAt] = useState(() => new Date().toISOString());
  const fetchStore = useServerFn(getMyStore);
  const fetchNotifications = useServerFn(listMyNotifications);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["my-store"],
    queryFn: () => fetchStore({}),
    staleTime: 5 * 60_000,
  });
  const { data: notifData } = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => fetchNotifications({}),
    enabled: Boolean(user),
  });
  const unread = (((notifData as any)?.items ?? []) as any[]).filter((n) => !n.read_at).length;

  const storeRecord = data?.store as { id?: string; status?: string } | null | undefined;
  const hasActiveStore = storeRecord?.status === "active";
  const badges = useSellerBadges(hasActiveStore);
  // Panggil satu kali di layout agar listener & query presence tidak duplikat.
  const ownPresence = useStorePresence(
    hasActiveStore ? storeRecord?.id : null,
    hasActiveStore ? { online: true, lastSeenAt: openedAt } : null,
  );

  // Toko aktif: 5 tab utama di bottom bar mobile; semua menu toko ada di drawer hamburger Navbar.
  const bottomNav: BottomNavItem[] = hasActiveStore
    ? [
      { to: "/seller", label: "Toko", icon: Store, exact: true },
      {
        to: "/seller/pesanan",
        label: "Pesanan",
        icon: ReceiptText,
        badge: badges.orders + badges.serviceOrders,
        match: ["/seller/jasa-pesanan"],
      },
      {
        to: "/seller/produk",
        label: "Produk",
        icon: Package,
        match: ["/seller/jasa"],
      },
      { to: "/seller/chat", label: "Chat", icon: MessageSquare, badge: badges.chats },
      { to: "/seller/keuangan", label: "Saldo", icon: Wallet },
    ]
    : [
      { to: "/dashboard", label: "Beranda", icon: Home, exact: true },
      { to: "/seller", label: "Toko", icon: Store, exact: true },
      { to: "/dashboard/pengaturan", label: "Akun", icon: Settings },
    ];

  if (isPending) {
    return (
      <div className="seller-mobile-shell flex min-h-dvh flex-col">
        <SiteHeader />
        <main className="flex-1">
          <AdminLoading label="Memuat data toko..." />
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (error || data?.error) {
    return (
      <div className="seller-mobile-shell flex min-h-dvh flex-col">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-12">
          <ErrorState
            title="Data toko gagal dimuat"
            description={data?.error ?? "Periksa koneksi internet lalu coba muat ulang."}
            onRetry={() => void refetch()}
          />
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (!data?.store) {
    return (
      <div className="seller-mobile-shell flex min-h-dvh flex-col">
        <SiteHeader />
        <div className="mx-auto flex w-full max-w-[1400px] flex-1 items-start gap-8 px-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] pt-4 md:pb-12 md:pt-8 lg:px-6">
          <aside className="sticky top-24 hidden w-60 shrink-0 lg:block">
            <DashboardSidebar unread={unread} />
          </aside>
          <main className="seller-workspace-main min-w-0 flex-1">
            <div className="mx-auto w-full max-w-6xl lg:mx-0">
              <SellerOnboarding />
            </div>
          </main>
        </div>
        <div className="hidden md:block">
          <SiteFooter />
        </div>
        <BottomNavigation items={bottomNav} ariaLabel="Navigasi toko" />
      </div>
    );
  }

  const store = data.store as any;
  const meta = STORE_STATUS[store.status] ?? { label: store.status, tone: "neutral" };
  const isActive = store.status === "active";

  const logo = isRenderableImageUrl(store.logo_url)
    ? optimizedMediaUrl(store.logo_url as string, 128)
    : null;

  const avatar = (size: "sm" | "md") => {
    const boxClass = size === "sm" ? "h-11 w-11" : "h-14 w-14";
    const radiusClass = size === "sm" ? "rounded-xl" : "rounded-2xl";
    const px = size === "sm" ? 44 : 56;
    return (
      <span className={cn("relative block shrink-0", boxClass)}>
        <span
          className={cn(
            "block h-full w-full overflow-hidden bg-surface-selected text-accent ring-1 ring-border/70",
            radiusClass,
          )}
        >
          {logo ? (
            <img
              src={logo}
              alt=""
              width={px}
              height={px}
              decoding="async"
              className="block h-full w-full object-cover object-center"
            />
          ) : (
            <span className="grid h-full w-full place-items-center">
              <Store className={size === "sm" ? "size-5" : "size-6"} aria-hidden="true" />
            </span>
          )}
        </span>
        {isActive ? (
          <OnlineDot
            presence={ownPresence}
            className={cn(
              "-bottom-0.5 -right-0.5 ring-2 ring-card",
              size === "sm" ? "size-3" : "size-3.5",
            )}
          />
        ) : null}
      </span>
    );
  };

  const viewStoreLink = (
    <Link
      to="/toko/$slug"
      params={{ slug: store.slug }}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-accent transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Lihat etalase
      <ExternalLink className="size-3.5" aria-hidden="true" />
    </Link>
  );

  // Kartu identitas toko di sidebar desktop (lg+) & header drawer mobile.
  const storeIdentity = (
    <div className="flex items-center gap-3">
      {avatar("md")}
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-bold text-foreground">{store.name}</p>
        {isActive ? (
          <PresenceLabel presence={ownPresence} className="mt-0.5 flex text-xs" />
        ) : (
          <div className="mt-1">
            <StatusPill value={meta.tone as any} kind="raw" label={meta.label} />
          </div>
        )}
      </div>
    </div>
  );

  const storeCard = (
    <div>
      {storeIdentity}
      {isActive ? <div className="-mb-2 -ml-2.5 mt-1.5">{viewStoreLink}</div> : null}
    </div>
  );

  const totalSellerBadge = badges.orders + badges.serviceOrders + badges.chats;

  return (
    <div className="seller-mobile-shell flex min-h-dvh flex-col">
      <SiteHeader
        mobileDrawerTitle="Dashboard Seller"
        mobileMenuBadge={isActive ? totalSellerBadge : undefined}
        chatTo="/seller/chat"
        mobileDrawer={({ close, signOut }) => (
          <SellerNavbarDrawerContent
            storeHeader={storeIdentity}
            storeSlug={store.slug}
            badges={badges}
            canSell={isActive}
            onClose={close}
            onSignOut={signOut}
          />
        )}
      />

      {/* Mobile & tablet (< lg): 1 baris identitas toko ringkas (tanpa tombol hamburger kedua;
          semua menu Dashboard Seller terbuka dari tombol hamburger tunggal di Navbar atas). */}
      {!isMobileChatThread ? (
        <div className="border-b border-border bg-card/90 lg:hidden">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2.5 px-4 py-2.5">
            <div className="flex items-center gap-3">
              {avatar("sm")}
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-bold leading-tight text-foreground">
                  {store.name}
                </p>
                {isActive ? (
                  <PresenceLabel presence={ownPresence} className="mt-0.5 flex text-xs" />
                ) : (
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    /toko/{store.slug}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {isActive ? (
                  viewStoreLink
                ) : (
                  <StatusPill value={meta.tone as any} kind="raw" label={meta.label} />
                )}
              </div>
            </div>
            {/* Di tablet (md..lg), BottomNavigation tersembunyi sehingga tab ringkas tampil di sini. */}
            {isActive ? (
              <div className="hidden md:block">
                <SellerMobileTabs badges={badges} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "mx-auto flex w-full max-w-[1400px] flex-1 items-start gap-6 px-3.5 pt-3.5 sm:px-4 md:pb-12 md:pt-6 lg:gap-8 lg:px-6 lg:pt-8",
          isMobileChatThread
            ? "pb-3"
            : "pb-[calc(5.75rem+env(safe-area-inset-bottom))]",
        )}
      >
        <aside className="sticky top-24 hidden max-h-[calc(100dvh-6.5rem)] w-64 shrink-0 overflow-y-auto lg:block">
          <SellerSidebar storeCard={storeCard} badges={badges} canSell={isActive} />
        </aside>
        <main className="seller-workspace-main min-w-0 flex-1">
          <div className="mx-auto w-full max-w-6xl lg:mx-0">
            {!isActive ? <StoreStatusBanner store={store} /> : null}
            <Outlet />
          </div>
        </main>
      </div>
      <div className="hidden md:block">
        <SiteFooter />
      </div>
      {!isMobileChatThread ? <BottomNavigation items={bottomNav} ariaLabel="Navigasi toko" /> : null}
    </div>
  );
}
