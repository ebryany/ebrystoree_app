import { Outlet, createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AnnouncementPopup } from "@/components/ebry/announcement-popup";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ThreadsDesktopRail, ThreadsMobileDock } from "@/components/threads/threads-nav-rail";
import { useSession } from "@/hooks/use-session";
import { listInquiryUnreadCounts } from "@/lib/inquiries.functions";
import { listMyNotifications } from "@/lib/orders.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardLayout,
});

const tabs = [
  { to: "/dashboard", label: "Threads", exact: true },
  { to: "/dashboard/profil", label: "Profil" },
  { to: "/dashboard/chat", label: "Chat" },
  { to: "/dashboard/pesanan", label: "Pesanan" },
  { to: "/dashboard/produk-saya", label: "Produk saya" },
  { to: "/dashboard/disukai", label: "Disukai" },
  { to: "/dashboard/po", label: "PO Custom" },
  { to: "/dashboard/notifikasi", label: "Notifikasi" },
  { to: "/dashboard/pengaturan", label: "Pengaturan" },
] as const;

function DashboardLayout() {
  const { user } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fetchNotifications = useServerFn(listMyNotifications);
  const fetchChatUnread = useServerFn(listInquiryUnreadCounts);
  const { data } = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => fetchNotifications({}),
    enabled: Boolean(user),
  });
  const { data: chatUnreadData } = useQuery({
    queryKey: ["inquiry-unread"],
    queryFn: () => fetchChatUnread({}),
    enabled: Boolean(user),
  });
  const unread = (((data as any)?.items ?? []) as any[]).filter((n) => !n.read_at).length;
  const unreadChats = (chatUnreadData?.items ?? []).reduce(
    (sum, item) => sum + (Number(item.unread) > 0 ? 1 : 0),
    0,
  );

  const isChatThreadMobile =
    pathname.startsWith("/dashboard/chat/") && pathname !== "/dashboard/chat/";
  const isThreadsSurface =
    pathname === "/dashboard" ||
    pathname === "/dashboard/" ||
    pathname.startsWith("/dashboard/profil") ||
    pathname.startsWith("/dashboard/thread/");

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />

      {/* Tab strip untuk tablet (md..lg) */}
      <div className="hidden border-b border-border bg-background md:block lg:hidden">
        <nav
          aria-label="Menu akun"
          className="mx-auto flex h-12 w-full max-w-6xl items-stretch gap-1 overflow-x-auto px-4"
        >
          {tabs.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              activeOptions={{ exact: "exact" in tab }}
              activeProps={{ className: "border-foreground text-foreground" }}
              inactiveProps={{ className: "border-transparent text-muted-foreground" }}
              className="flex items-center whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors hover:text-foreground"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Unified Desktop Sidebar Rail across ALL /dashboard/* pages (zero layout jump when switching menu!) */}
      <div className="mx-auto flex w-full max-w-[1360px] flex-1 items-start gap-6 px-4 pb-24 pt-2 sm:pt-5 md:pb-12 lg:px-6">
        <ThreadsDesktopRail unread={unread} unreadChats={unreadChats} />
        <main className="min-w-0 flex-1">
          <div className={isThreadsSurface ? "w-full" : "mx-auto w-full max-w-5xl"}>
            <Outlet />
          </div>
        </main>
      </div>

      {!isThreadsSurface ? (
        <div className="hidden md:block">
          <SiteFooter />
        </div>
      ) : null}

      {!isChatThreadMobile ? (
        <ThreadsMobileDock unread={unread} unreadChats={unreadChats} />
      ) : null}

      <AnnouncementPopup />
    </div>
  );
}
