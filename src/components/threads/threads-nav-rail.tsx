import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AtSign,
  Bell,
  Film,
  Heart,
  Home,
  Menu,
  MessageSquarePlus,
  MessagesSquare,
  Package,
  Plus,
  ReceiptText,
  Settings,
  Store,
  UserRound,
  Wallet,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getMyStore } from "@/lib/seller.functions";
import { cn } from "@/lib/utils";

/**
 * Unified Staff-grade Meta Threads Desktop Icon Rail (`lg+`), consistent across
 * ALL `/dashboard/*` routes so switching between Threads, Chat, Pesanan, Produk,
 * Notifikasi, Profil, and Pengaturan never morphs or jumps the sidebar layout.
 */
export function ThreadsDesktopRail({
  unread = 0,
  unreadChats = 0,
}: {
  unread?: number;
  unreadChats?: number;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fetchStore = useServerFn(getMyStore);
  const { data: storeData } = useQuery({
    queryKey: ["my-store"],
    queryFn: () => fetchStore({}),
    staleTime: 5 * 60_000,
  });
  const storeActive = (storeData?.store as any)?.status === "active";

  const isHome =
    pathname === "/dashboard" ||
    pathname === "/dashboard/" ||
    pathname.startsWith("/dashboard/thread/");
  const isChat = pathname.startsWith("/dashboard/chat");
  const isOrders = pathname.startsWith("/dashboard/pesanan");
  const isProducts = pathname.startsWith("/dashboard/produk-saya");
  const isNotif = pathname.startsWith("/dashboard/notifikasi");
  const isProfile = pathname.startsWith("/dashboard/profil");
  const isMoreActive =
    pathname.startsWith("/dashboard/disukai") ||
    pathname.startsWith("/dashboard/po") ||
    pathname.startsWith("/dashboard/pengaturan");

  function handleComposeClick() {
    if (pathname === "/dashboard" || pathname === "/dashboard/") {
      window.dispatchEvent(new CustomEvent("ebry:threads-compose"));
      return;
    }
    void navigate({ to: "/dashboard" }).then(() => {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("ebry:threads-compose"));
      }, 120);
    });
  }

  const railBtn = (active: boolean) =>
    cn(
      "group relative grid size-11 place-items-center rounded-2xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active
        ? "bg-foreground/[0.08] text-foreground"
        : "text-muted-foreground/85 hover:bg-foreground/[0.05] hover:text-foreground",
    );

  return (
    <aside
      aria-label="Navigasi utama akun"
      className="sticky top-[80px] hidden h-[calc(100dvh-6rem)] max-h-[680px] w-[68px] shrink-0 flex-col items-center rounded-3xl border border-border/70 bg-card/85 py-3 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)] backdrop-blur-md lg:flex"
    >
      {/* Top Threads Brand Anchor */}
      <Link
        to="/dashboard"
        title="Beranda Threads"
        aria-label="Beranda Ebrystore Threads"
        className="mb-3 grid size-10 place-items-center rounded-2xl bg-foreground text-background transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AtSign className="size-5" strokeWidth={2.5} aria-hidden="true" />
      </Link>

      {/* Primary Icon Stack (consistent on every /dashboard/* page) */}
      <nav aria-label="Menu utama" className="flex flex-col items-center gap-1.5">
        <Link
          to="/dashboard"
          title="Beranda Threads"
          aria-label="Beranda Threads"
          aria-current={isHome ? "page" : undefined}
          className={railBtn(isHome)}
        >
          <Home className="size-[21px]" strokeWidth={isHome ? 2.35 : 1.9} aria-hidden="true" />
          {isHome ? (
            <span className="absolute -left-[13px] h-5 w-1 rounded-full bg-foreground" aria-hidden="true" />
          ) : null}
        </Link>

        <Link
          to="/dashboard/chat"
          title="Chat Produk"
          aria-label="Chat Produk"
          aria-current={isChat ? "page" : undefined}
          className={railBtn(isChat)}
        >
          <MessagesSquare
            className="size-[21px]"
            strokeWidth={isChat ? 2.35 : 1.9}
            aria-hidden="true"
          />
          {unreadChats > 0 ? (
            <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9.5px] font-bold text-destructive-foreground ring-2 ring-card">
              {unreadChats > 9 ? "9+" : unreadChats}
            </span>
          ) : null}
          {isChat ? (
            <span className="absolute -left-[13px] h-5 w-1 rounded-full bg-foreground" aria-hidden="true" />
          ) : null}
        </Link>

        <button
          type="button"
          onClick={handleComposeClick}
          title="Buat Utas atau Reel Baru"
          aria-label="Buat Utas atau Reel Baru"
          className="my-1 grid size-11 place-items-center rounded-2xl bg-foreground/[0.08] text-foreground transition-all hover:bg-foreground hover:text-background active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-5" strokeWidth={2.4} aria-hidden="true" />
        </button>

        <Link
          to="/dashboard/pesanan"
          search={{ filter: "all" }}
          title="Pesanan Saya"
          aria-label="Pesanan Saya"
          aria-current={isOrders ? "page" : undefined}
          className={railBtn(isOrders)}
        >
          <ReceiptText
            className="size-[21px]"
            strokeWidth={isOrders ? 2.35 : 1.9}
            aria-hidden="true"
          />
          {isOrders ? (
            <span className="absolute -left-[13px] h-5 w-1 rounded-full bg-foreground" aria-hidden="true" />
          ) : null}
        </Link>

        <Link
          to="/dashboard/produk-saya"
          title="Produk Saya"
          aria-label="Produk Saya"
          aria-current={isProducts ? "page" : undefined}
          className={railBtn(isProducts)}
        >
          <Package
            className="size-[21px]"
            strokeWidth={isProducts ? 2.35 : 1.9}
            aria-hidden="true"
          />
          {isProducts ? (
            <span className="absolute -left-[13px] h-5 w-1 rounded-full bg-foreground" aria-hidden="true" />
          ) : null}
        </Link>

        <Link
          to="/dashboard/notifikasi"
          title="Notifikasi"
          aria-label="Notifikasi"
          aria-current={isNotif ? "page" : undefined}
          className={railBtn(isNotif)}
        >
          <Bell className="size-[21px]" strokeWidth={isNotif ? 2.35 : 1.9} aria-hidden="true" />
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9.5px] font-bold text-destructive-foreground ring-2 ring-card">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
          {isNotif ? (
            <span className="absolute -left-[13px] h-5 w-1 rounded-full bg-foreground" aria-hidden="true" />
          ) : null}
        </Link>

        <Link
          to="/dashboard/profil"
          title="Profil Threads Saya"
          aria-label="Profil Threads Saya"
          aria-current={isProfile ? "page" : undefined}
          className={railBtn(isProfile)}
        >
          <UserRound
            className="size-[21px]"
            strokeWidth={isProfile ? 2.35 : 1.9}
            aria-hidden="true"
          />
          {isProfile ? (
            <span className="absolute -left-[13px] h-5 w-1 rounded-full bg-foreground" aria-hidden="true" />
          ) : null}
        </Link>
      </nav>

      {/* Bottom Seller & More Menu */}
      <div className="mt-auto flex flex-col items-center gap-1.5 border-t border-border/60 pt-3">
        <Link
          to="/seller"
          title={storeActive ? "Dashboard Toko" : "Buka Toko"}
          aria-label={storeActive ? "Dashboard Toko" : "Buka Toko"}
          className="grid size-11 place-items-center rounded-2xl text-accent transition-colors hover:bg-accent/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Store className="size-[21px]" strokeWidth={2} aria-hidden="true" />
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Menu lainnya"
              aria-label="Menu akun lainnya"
              className={railBtn(isMoreActive)}
            >
              <Menu className="size-[21px]" strokeWidth={2} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-56 rounded-2xl p-1.5">
            <DropdownMenuLabel className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Menu Lainnya
            </DropdownMenuLabel>
            <DropdownMenuItem asChild className="min-h-10 gap-2.5 rounded-xl">
              <Link to="/dashboard/disukai">
                <Heart className="size-4" /> Disukai & Diikuti
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="min-h-10 gap-2.5 rounded-xl">
              <Link to="/dashboard/po">
                <MessageSquarePlus className="size-4" /> PO Custom
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="min-h-10 gap-2.5 rounded-xl">
              <Link to="/dashboard/pengaturan">
                <Settings className="size-4" /> Pengaturan Akun
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="min-h-10 gap-2.5 rounded-xl">
              <Link to="/seller">
                <Store className="size-4 text-accent" />
                <span>{storeActive ? "Dashboard Seller" : "Buka Toko Gratis"}</span>
              </Link>
            </DropdownMenuItem>
            {storeActive ? (
              <DropdownMenuItem asChild className="min-h-10 gap-2.5 rounded-xl">
                <Link to="/seller/keuangan">
                  <Wallet className="size-4" /> Keuangan Toko
                </Link>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}

/**
 * Sleek edge-to-edge native Meta Threads mobile bottom dock (`< md`), consistent on all /dashboard/* routes.
 */
export function ThreadsMobileDock({
  unread = 0,
  unreadChats = 0,
}: {
  unread?: number;
  unreadChats?: number;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome =
    pathname === "/dashboard" ||
    pathname === "/dashboard/" ||
    pathname.startsWith("/dashboard/thread/");
  const isChat = pathname.startsWith("/dashboard/chat");
  const isOrders =
    pathname.startsWith("/dashboard/pesanan") || pathname.startsWith("/dashboard/produk-saya");
  const isProfile = pathname.startsWith("/dashboard/profil");

  function handleComposeClick() {
    if (pathname === "/dashboard" || pathname === "/dashboard/") {
      window.dispatchEvent(new CustomEvent("ebry:threads-compose"));
      return;
    }
    void navigate({ to: "/dashboard" }).then(() => {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("ebry:threads-compose"));
      }, 120);
    });
  }

  const slotClass = (active: boolean) =>
    cn(
      "relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      active ? "text-foreground" : "text-muted-foreground/80 hover:text-foreground",
    );

  return (
    <nav
      aria-label="Navigasi Threads mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto flex h-14 max-w-lg items-center px-1">
        <Link to="/dashboard" aria-label="Beranda Threads" className={slotClass(isHome)}>
          <Home className="size-[22px]" strokeWidth={isHome ? 2.4 : 1.85} aria-hidden="true" />
        </Link>

        <Link to="/dashboard/chat" aria-label="Chat" className={slotClass(isChat)}>
          <span className="relative">
            <MessagesSquare
              className="size-[22px]"
              strokeWidth={isChat ? 2.4 : 1.85}
              aria-hidden="true"
            />
            {unreadChats > 0 ? (
              <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9.5px] font-bold text-destructive-foreground ring-2 ring-background">
                {unreadChats > 9 ? "9+" : unreadChats}
              </span>
            ) : null}
          </span>
        </Link>

        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={handleComposeClick}
            aria-label="Buat utas atau Reel baru"
            className="grid h-10 w-13 place-items-center rounded-2xl bg-foreground/[0.08] text-foreground transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-5" strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>

        <Link
          to="/dashboard/pesanan"
          search={{ filter: "all" }}
          aria-label="Pesanan"
          className={slotClass(isOrders)}
        >
          <span className="relative">
            <ReceiptText
              className="size-[22px]"
              strokeWidth={isOrders ? 2.4 : 1.85}
              aria-hidden="true"
            />
            {unread > 0 ? (
              <span className="absolute -right-1.5 -top-1 size-2 rounded-full bg-destructive ring-2 ring-background" />
            ) : null}
          </span>
        </Link>

        <Link to="/dashboard/profil" aria-label="Profil Saya" className={slotClass(isProfile)}>
          <UserRound className="size-[22px]" strokeWidth={isProfile ? 2.4 : 1.85} aria-hidden="true" />
        </Link>
      </div>
    </nav>
  );
}

export { Film as ThreadsReelsIcon };
