import { useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Package,
  PackagePlus,
  ReceiptText,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { useScrollEdgeFade } from "@/components/seller/seller-ui";
import type { SellerBadges } from "@/hooks/use-seller-badges";
import { cn } from "@/lib/utils";

type Item = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: keyof SellerBadges;
};

/** Sumber kebenaran tunggal daftar menu Dashboard Seller (sidebar desktop & drawer navbar mobile). */
export const SELLER_NAV_GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Ringkasan",
    items: [{ to: "/seller", label: "Dashboard Toko", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Operasional",
    items: [
      { to: "/seller/pesanan", label: "Pesanan Produk", icon: ReceiptText, badge: "orders" },
      {
        to: "/seller/jasa-pesanan",
        label: "Pesanan Jasa",
        icon: ClipboardList,
        badge: "serviceOrders",
      },
      { to: "/seller/chat", label: "Chat Pembeli", icon: MessageSquare, badge: "chats" },
    ],
  },
  {
    label: "Katalog",
    items: [
      { to: "/seller/produk", label: "Produk Digital", icon: Package },
      { to: "/seller/jasa", label: "Jasa Saya", icon: BriefcaseBusiness },
    ],
  },
  {
    label: "Keuangan & Toko",
    items: [
      { to: "/seller/keuangan", label: "Saldo & Penarikan", icon: Wallet },
      { to: "/seller/performa", label: "Performa & Ulasan", icon: BarChart3 },
      { to: "/seller/pengaturan", label: "Pengaturan Toko", icon: Settings },
    ],
  },
];

function Count({ value, className }: { value: number; className?: string }) {
  if (!value) return null;
  return (
    <span
      className={cn(
        "grid min-w-5 place-items-center rounded-md bg-destructive px-1.5 text-[11px] font-bold leading-5 text-destructive-foreground tabular-nums",
        className,
      )}
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}

/**
 * Sidebar seller (desktop, lg+): kartu identitas toko, CTA tambah produk,
 * grup navigasi kerja dengan indikator aktif + badge antrean, serta tautan
 * kembali ke mode pembeli.
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
    <div className="overflow-hidden rounded-[var(--radius-panel)] border border-border bg-card shadow-[var(--elev-1)]">
      {storeCard ? <div className="border-b border-border p-4">{storeCard}</div> : null}
      {canSell ? (
        <div className="border-b border-border bg-surface/50 p-3">
          <Link
            to="/seller/produk/baru"
            className="flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <PackagePlus className="size-4" aria-hidden="true" />
            Tambah produk
          </Link>
        </div>
      ) : null}
      <nav aria-label="Navigasi seller" className="space-y-4 p-3">
        {SELLER_NAV_GROUPS.map((g) => (
          <div key={g.label}>
            <p className="px-3 text-[11px] font-semibold tracking-wide text-muted-foreground">
              {g.label}
            </p>
            <ul className="mt-1.5 space-y-0.5">
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
                        "bg-surface-selected font-semibold text-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-accent",
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
      <div className="border-t border-border p-3">
        <Link
          to="/dashboard"
          className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeftRight className="size-3.5 shrink-0" aria-hidden="true" />
          Beralih ke akun pembeli
        </Link>
      </div>
    </div>
  );
}

/**
 * Konten drawer hamburger Navbar untuk halaman Seller (dipakai langsung oleh
 * tombol hamburger tunggal di SiteHeader sehingga tidak ada dua menu hamburger).
 */
export function SellerNavbarDrawerContent({
  storeHeader,
  storeSlug,
  badges,
  canSell,
  onClose,
  onSignOut,
}: {
  storeHeader: ReactNode;
  storeSlug?: string;
  badges?: SellerBadges;
  canSell?: boolean;
  onClose: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border bg-surface/40 px-4 py-4">{storeHeader}</div>

      {canSell ? (
        <div className="border-b border-border px-4 py-3">
          <Link
            to="/seller/produk/baru"
            onClick={onClose}
            className="flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PackagePlus className="size-4" aria-hidden="true" />
            Tambah produk baru
          </Link>
        </div>
      ) : null}

      <nav aria-label="Menu dashboard seller" className="space-y-4 p-3">
        {SELLER_NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 text-[11px] font-semibold tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <ul className="mt-1 space-y-0.5">
              {group.items.map((item) => {
                const count = item.badge && badges ? badges[item.badge] : 0;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      activeOptions={{ exact: item.exact ?? false }}
                      onClick={onClose}
                      className="relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      activeProps={{
                        className:
                          "bg-surface-selected font-semibold text-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-accent",
                        "aria-current": "page",
                      }}
                    >
                      <item.icon className="size-[18px] shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {count > 0 ? (
                        <>
                          <Count value={count} />
                          <span className="sr-only">, {count} perlu tindakan</span>
                        </>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-auto space-y-1 border-t border-border bg-surface/50 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {canSell && storeSlug ? (
          <Link
            to="/toko/$slug"
            params={{ slug: storeSlug }}
            onClick={onClose}
            className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-semibold text-accent transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
            Lihat etalase toko
          </Link>
        ) : null}
        <Link
          to="/dashboard"
          onClick={onClose}
          className="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Beralih ke akun pembeli
        </Link>
        <button
          type="button"
          onClick={onSignOut}
          className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          Keluar
        </button>
      </div>
    </div>
  );
}

const MOBILE_ITEMS: Item[] = [
  { to: "/seller", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/seller/pesanan", label: "Pesanan", icon: ReceiptText, badge: "orders" },
  {
    to: "/seller/jasa-pesanan",
    label: "Pesanan Jasa",
    icon: ClipboardList,
    badge: "serviceOrders",
  },
  { to: "/seller/produk", label: "Produk", icon: Package },
  { to: "/seller/jasa", label: "Jasa Saya", icon: BriefcaseBusiness },
  { to: "/seller/chat", label: "Chat", icon: MessageSquare, badge: "chats" },
  { to: "/seller/keuangan", label: "Saldo", icon: Wallet },
  { to: "/seller/performa", label: "Performa", icon: BarChart3 },
  { to: "/seller/pengaturan", label: "Pengaturan", icon: Settings },
];

/**
 * Navigasi rute seller untuk tablet (md..lg).
 * Menggunakan elemen <nav> dan aria-current="page" karena memindahkan rute halaman.
 */
export function SellerMobileTabs({ badges }: { badges?: SellerBadges }) {
  const navRef = useRef<HTMLElement>(null);
  useScrollEdgeFade(navRef);

  return (
    <nav
      ref={navRef}
      aria-label="Navigasi halaman seller"
      className="ebry-tab-scroller -mx-4 flex gap-1.5 px-4 pb-1 lg:hidden"
    >
      {MOBILE_ITEMS.map((item) => {
        const count = item.badge && badges ? badges[item.badge] : 0;
        return (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.exact ?? false }}
            className="flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            activeProps={{
              className: "border-primary bg-primary text-primary-foreground",
              "aria-current": "page",
            }}
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
            {count ? (
              <>
                <Count value={count} className="min-w-[18px] text-[10px] leading-[18px]" />
                <span className="sr-only">perlu tindakan</span>
              </>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
