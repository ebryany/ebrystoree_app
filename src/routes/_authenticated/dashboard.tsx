import { Outlet, createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Home, Package, ReceiptText, Settings } from "lucide-react";

import { BottomNavigation, type BottomNavItem } from "@/components/ebry/bottom-nav";
import { DashboardSidebar } from "@/components/ebry/dashboard-sidebar";
import { AnnouncementPopup } from "@/components/ebry/announcement-popup";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { useSession } from "@/hooks/use-session";
import { listMyNotifications } from "@/lib/orders.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardLayout,
});

const tabs = [
  { to: "/dashboard", label: "Ringkasan", exact: true },
  { to: "/dashboard/pesanan", label: "Pesanan" },
  { to: "/dashboard/produk-saya", label: "Produk saya" },
  { to: "/dashboard/disukai", label: "Disukai" },
  { to: "/dashboard/po", label: "PO Custom" },
  { to: "/dashboard/chat", label: "Chat Produk" },
  { to: "/dashboard/notifikasi", label: "Notifikasi" },
  { to: "/dashboard/pengaturan", label: "Pengaturan" },
] as const;

function DashboardLayout() {
  const { user } = useSession();
  const fetchNotifications = useServerFn(listMyNotifications);
  const { data } = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => fetchNotifications({}),
    enabled: Boolean(user),
  });
  const unread = (((data as any)?.items ?? []) as any[]).filter((n) => !n.read_at).length;

  const bottomNav: BottomNavItem[] = [
    { to: "/dashboard", label: "Beranda", icon: Home, exact: true },
    { to: "/dashboard/pesanan", label: "Pesanan", icon: ReceiptText },
    { to: "/dashboard/produk-saya", label: "Produk", icon: Package },
    { to: "/dashboard/notifikasi", label: "Notifikasi", icon: Bell, badge: unread },
    { to: "/dashboard/pengaturan", label: "Akun", icon: Settings },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      {/* Tab strip — hanya di bawah lg (mobile & tablet), tidak berubah */}
      <div className="hidden border-b border-border bg-background md:block lg:hidden">
        <nav aria-label="Menu akun" className="mx-auto flex h-12 w-full max-w-6xl items-stretch gap-1 overflow-x-auto px-4">
          {tabs.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              activeOptions={{ exact: "exact" in tab }}
              activeProps={{ className: "border-accent text-accent" }}
              inactiveProps={{ className: "border-transparent text-muted-foreground" }}
              className="flex items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors hover:text-foreground"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      {/* Desktop (lg+): sidebar kiri permanen + konten luas. Mobile tidak terpengaruh. */}
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 items-start gap-8 px-4 pb-28 pt-5 md:pb-12 md:pt-8 lg:px-6">
        <aside className="sticky top-24 hidden w-60 shrink-0 lg:block">
          <DashboardSidebar unread={unread} />
        </aside>
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-6xl lg:mx-0">
            <Outlet />
          </div>
        </main>
      </div>
      <div className="hidden md:block">
        <SiteFooter />
      </div>
      <BottomNavigation items={bottomNav} ariaLabel="Navigasi akun" />
      <AnnouncementPopup />
    </div>
  );
}