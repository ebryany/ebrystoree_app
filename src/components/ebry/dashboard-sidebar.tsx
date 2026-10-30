import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  Heart,
  LayoutDashboard,
  MessagesSquare,
  Package,
  ReceiptText,
  Settings,
  MessageSquarePlus,
  MessageSquare,
  Store,
  UserRound,
  BarChart3,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { getMyStore } from "@/lib/seller.functions";
import { cn } from "@/lib/utils";

type SidebarItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: number;
};

type SidebarGroup = {
  label: string;
  items: SidebarItem[];
};

/**
 * Sidebar navigasi desktop untuk dashboard customer.
 * Hanya dirender pada layar lg+ (dibungkus `hidden lg:block` oleh pemanggil),
 * sehingga tampilan mobile tidak terpengaruh sama sekali.
 */
export function DashboardSidebar({ unread = 0 }: { unread?: number }) {
  const fetchStore = useServerFn(getMyStore);
  const { data, isPending } = useQuery({ queryKey: ["my-store"], queryFn: () => fetchStore({}) });
  const hasStore = Boolean(data?.store);
  const storeActive = hasStore && (data?.store as any)?.status === "active";

  const sellerItems: SidebarItem[] = storeActive
    ? [
        { to: "/seller", label: "Dashboard Toko", icon: Store, exact: true },
        { to: "/seller/pesanan", label: "Pesanan Toko", icon: ReceiptText },
        { to: "/seller/produk", label: "Produk Toko", icon: Package },
        { to: "/seller/jasa", label: "Jasa Saya", icon: ReceiptText },
        { to: "/seller/jasa-pesanan", label: "Pesanan Jasa", icon: ReceiptText },
        { to: "/seller/chat", label: "Chat Pelanggan", icon: MessageSquare },
        { to: "/seller/keuangan", label: "Keuangan", icon: Wallet },
        { to: "/seller/performa", label: "Performa", icon: BarChart3 },
        { to: "/seller/pengaturan", label: "Pengaturan Toko", icon: Settings },
      ]
    : [
        {
          to: "/seller",
          label: isPending ? "Toko" : hasStore ? "Toko Saya" : "Buka Toko",
          icon: Store,
        },
      ];

  const groups: SidebarGroup[] = [
    {
      label: "Menu",
      items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true }],
    },
    {
      label: "Aktivitas",
      items: [
        { to: "/dashboard/pesanan", label: "Pesanan", icon: ReceiptText },
        { to: "/dashboard/produk-saya", label: "Produk Saya", icon: Package },
        { to: "/dashboard/disukai", label: "Disukai & Diikuti", icon: Heart },
        { to: "/dashboard/po", label: "PO Custom", icon: MessageSquarePlus },
        { to: "/dashboard/chat", label: "Chat Produk", icon: MessagesSquare },
        { to: "/dashboard/notifikasi", label: "Notifikasi", icon: Bell, badge: unread },
      ],
    },
    {
      label: "Toko Saya",
      items: sellerItems,
    },
    {
      label: "Akun",
      items: [
        { to: "/dashboard/pengaturan", label: "Profil Saya", icon: UserRound },
        { to: "/dashboard/pengaturan", label: "Pengaturan", icon: Settings },
      ],
    },
  ];

  return (
    <nav aria-label="Navigasi akun desktop" className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </p>
          <ul className="mt-2 space-y-0.5">
            {group.items.map((item) => (
              <li key={item.label}>
                <Link
                  to={item.to}
                  activeOptions={{ exact: item.exact ?? false }}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-selected hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  activeProps={{ className: "bg-surface-selected font-semibold text-foreground" }}
                >
                  <item.icon
                    className="size-[18px] shrink-0"
                    aria-hidden="true"
                    strokeWidth={1.85}
                  />
                  <span className="truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-5 text-destructive-foreground">
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
