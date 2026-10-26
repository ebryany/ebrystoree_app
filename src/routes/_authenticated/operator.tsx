import { Outlet, createFileRoute, Link } from "@tanstack/react-router";
import { Bell, ClipboardList, Compass, Home } from "lucide-react";

import { BottomNavigation, type BottomNavItem } from "@/components/ebry/bottom-nav";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/_authenticated/operator")({
  component: OperatorLayout,
});

const tabs = [
  { to: "/operator", label: "Tugas saya", exact: true },
  { to: "/dashboard", label: "Dashboard akun" },
  { to: "/dashboard/notifikasi", label: "Notifikasi" },
] as const;

const bottomNav: BottomNavItem[] = [
  { to: "/operator", label: "Tugas", icon: ClipboardList, exact: true },
  { to: "/dashboard", label: "Akun", icon: Home },
  { to: "/dashboard/notifikasi", label: "Notifikasi", icon: Bell },
  { to: "/layanan", label: "Layanan", icon: Compass },
];

function OperatorLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <div className="hidden border-b border-border bg-card/50 md:block">
        <nav aria-label="Menu operator" className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4">
          {tabs.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              activeOptions={{ exact: "exact" in tab }}
              activeProps={{ className: "border-accent text-foreground" }}
              inactiveProps={{ className: "border-transparent text-muted-foreground" }}
              className="whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors hover:text-foreground"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      <main id="konten-utama" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 md:pb-12 md:pt-8">
        <Outlet />
      </main>
      <BottomNavigation items={bottomNav} ariaLabel="Navigasi operator" />
    </div>
  );
}