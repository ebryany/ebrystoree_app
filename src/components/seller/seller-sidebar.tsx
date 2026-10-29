import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  Package,
  ReceiptText,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type Item = { to: string; label: string; icon: LucideIcon; exact?: boolean };

/**
 * Sidebar dashboard seller (desktop). Dirender dalam `hidden lg:block`,
 * sehingga tampilan mobile tidak terpengaruh.
 */
export function SellerSidebar() {
  const groups: { label: string; items: Item[] }[] = [
    {
      label: "Ringkasan",
      items: [{ to: "/seller", label: "Dashboard", icon: LayoutDashboard, exact: true }],
    },
    {
      label: "Penjualan",
      items: [
        { to: "/seller/pesanan", label: "Pesanan", icon: ReceiptText },
        { to: "/seller/produk", label: "Produk", icon: Package },
        { to: "/seller/jasa", label: "Jasa Saya", icon: BriefcaseBusiness },
        { to: "/seller/jasa-pesanan", label: "Pesanan Jasa", icon: ClipboardList },
        { to: "/seller/chat", label: "Chat", icon: MessageSquare },
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

  return (
    <nav aria-label="Navigasi seller" className="space-y-6">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {g.label}
          </p>
          <ul className="mt-2 space-y-0.5">
            {g.items.map((item) => (
              <li key={item.to + item.label}>
                <Link
                  to={item.to}
                  activeOptions={{ exact: item.exact ?? false }}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors",
                    "hover:bg-surface-selected hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                  activeProps={{ className: "bg-surface-selected font-semibold text-foreground" }}
                >
                  <item.icon
                    className="size-[18px] shrink-0"
                    aria-hidden="true"
                    strokeWidth={1.85}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Navigasi seller untuk mobile (scroll horizontal). */
export function SellerMobileTabs() {
  const items: Item[] = [
    { to: "/seller", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: "/seller/pesanan", label: "Pesanan", icon: ReceiptText },
    { to: "/seller/produk", label: "Produk", icon: Package },
    { to: "/seller/jasa", label: "Jasa Saya", icon: ReceiptText },
    { to: "/seller/jasa-pesanan", label: "Pesanan Jasa", icon: ReceiptText },
    { to: "/seller/chat", label: "Chat", icon: MessageSquare },
    { to: "/seller/keuangan", label: "Keuangan", icon: Wallet },
    { to: "/seller/performa", label: "Performa", icon: BarChart3 },
    { to: "/seller/pengaturan", label: "Pengaturan", icon: Settings },
  ];

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((item) => (
        <Link
          key={item.to + item.label}
          to={item.to}
          activeOptions={{ exact: item.exact ?? false }}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground"
          activeProps={{ className: "border-transparent bg-primary text-primary-foreground" }}
        >
          <item.icon className="size-4" aria-hidden="true" />
          {item.label}
        </Link>
      ))}
    </div>
  );
}
