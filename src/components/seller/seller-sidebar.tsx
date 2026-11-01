import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  Package,
  PackagePlus,
  ReceiptText,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { SellerBadges } from "@/hooks/use-seller-badges";
import { cn } from "@/lib/utils";

type Item = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: keyof SellerBadges;
};

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Ringkasan",
    items: [{ to: "/seller", label: "Dashboard", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Penjualan",
    items: [
      { to: "/seller/pesanan", label: "Pesanan", icon: ReceiptText, badge: "orders" },
      { to: "/seller/produk", label: "Produk", icon: Package },
      { to: "/seller/jasa", label: "Jasa Saya", icon: BriefcaseBusiness },
      {
        to: "/seller/jasa-pesanan",
        label: "Pesanan Jasa",
        icon: ClipboardList,
        badge: "serviceOrders",
      },
      { to: "/seller/chat", label: "Chat", icon: MessageSquare, badge: "chats" },
    ],
  },
  {
    label: "Keuangan",
    items: [{ to: "/seller/keuangan", label: "Saldo & Pendapatan", icon: Wallet }],
  },
  {
    label: "Toko",
    items: [
      { to: "/seller/performa", label: "Performa", icon: BarChart3 },
      { to: "/seller/pengaturan", label: "Pengaturan Toko", icon: Settings },
    ],
  },
];

function Count({ value, className }: { value: number; className?: string }) {
  if (!value) return null;
  return (
    <span
      className={cn(
        "grid min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[11px] font-bold leading-5 text-destructive-foreground tabular-nums",
        className,
      )}
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}

/**
 * Sidebar seller (desktop, lg+). `storeCard` berisi identitas toko dari layout;
 * badge menampilkan pekerjaan yang menunggu seller.
 */
export function SellerSidebar({
  storeCard,
  badges,
  canSell,
}: {
  storeCard?: ReactNode;
  badges?: SellerBadges;
  canSell?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {storeCard ? <div className="border-b border-border p-4">{storeCard}</div> : null}
      {canSell ? (
        <div className="border-b border-border p-3">
          <Link
            to="/seller/produk/baru"
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <PackagePlus className="size-4" aria-hidden="true" />
            Tambah produk
          </Link>
        </div>
      ) : null}
      <nav aria-label="Navigasi seller" className="space-y-4 p-3">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <p className="px-3 text-[11px] font-semibold text-muted-foreground">{g.label}</p>
            <ul className="mt-1 space-y-0.5">
              {g.items.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    activeOptions={{ exact: item.exact ?? false }}
                    className={cn(
                      "group relative flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors",
                      "hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                    activeProps={{
                      className:
                        "bg-surface-selected font-semibold text-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-accent",
                      "aria-current": "page",
                    }}
                  >
                    <item.icon
                      className="size-[18px] shrink-0"
                      aria-hidden="true"
                      strokeWidth={1.85}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge && badges ? (
                      <>
                        <Count value={badges[item.badge]} />
                        {badges[item.badge] ? (
                          <span className="sr-only">, {badges[item.badge]} perlu tindakan</span>
                        ) : null}
                      </>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

const MOBILE_ITEMS: Item[] = [
  { to: "/seller", label: "Ringkasan", icon: LayoutDashboard, exact: true },
  { to: "/seller/pesanan", label: "Pesanan", icon: ReceiptText, badge: "orders" },
  { to: "/seller/produk", label: "Produk", icon: Package },
  { to: "/seller/jasa", label: "Jasa Saya", icon: BriefcaseBusiness },
  {
    to: "/seller/jasa-pesanan",
    label: "Pesanan Jasa",
    icon: ClipboardList,
    badge: "serviceOrders",
  },
  { to: "/seller/chat", label: "Chat", icon: MessageSquare, badge: "chats" },
  { to: "/seller/keuangan", label: "Keuangan", icon: Wallet },
  { to: "/seller/performa", label: "Performa", icon: BarChart3 },
  { to: "/seller/pengaturan", label: "Pengaturan", icon: Settings },
];

/** Navigasi seller untuk mobile/tablet (scroll horizontal, dengan badge). */
export function SellerMobileTabs({ badges }: { badges?: SellerBadges }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {MOBILE_ITEMS.map((item) => {
        const count = item.badge && badges ? badges[item.badge] : 0;
        return (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.exact ?? false }}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
            activeProps={{ className: "border-transparent bg-primary text-primary-foreground" }}
          >
            <item.icon className="size-4" aria-hidden="true" />
            {item.label}
            {count ? (
              <>
                <Count value={count} className="min-w-[18px] text-[10px] leading-[18px]" />
                <span className="sr-only">perlu tindakan</span>
              </>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
