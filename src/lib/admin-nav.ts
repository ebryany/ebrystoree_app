import {
  BadgeCheck,
  Banknote,
  BarChart3,
  BookOpen,
  ClipboardList,
  CreditCard,
  FileClock,
  Globe,
  Hammer,
  LayoutDashboard,
  MessageSquarePlus,
  MessageSquareWarning,
  MessagesSquare,
  Package,
  PackageSearch,
  Receipt,
  Settings,
  ShieldCheck,
  Store,
  Timer,
  Undo2,
  Users,
  Wrench,
} from "lucide-react";

export type AdminNavItem = {
  to?: string;
  label: string;
  icon: typeof Package;
  permission: string;
  exact?: boolean;
  /** false = modul belum tersedia, ditampilkan sebagai roadmap item nonaktif */
  available: boolean;
};

export type AdminNavGroup = { label: string; items: AdminNavItem[] };

export const adminNav: AdminNavGroup[] = [
  {
    label: "Ringkasan",
    items: [
      {
        to: "/admin",
        label: "Dashboard",
        icon: LayoutDashboard,
        permission: "admin.dashboard.view",
        exact: true,
        available: true,
      },
    ],
  },
  {
    label: "Katalog",
    items: [
      {
        to: "/admin/produk",
        label: "Produk Platform Store",
        icon: Package,
        permission: "products.view",
        available: true,
      },
      {
        to: "/admin/layanan",
        label: "Layanan Akademik",
        icon: Wrench,
        permission: "services.view",
        available: true,
      },
      {
        to: "/admin/artikel",
        label: "Artikel",
        icon: BookOpen,
        permission: "articles.view",
        available: true,
      },
    ],
  },
  {
    label: "Marketplace",
    items: [
      {
        to: "/admin/seller",
        label: "Seller",
        icon: Store,
        permission: "sellers.view",
        available: true,
      },
      {
        to: "/admin/seller/produk",
        label: "Moderasi Produk",
        icon: PackageSearch,
        permission: "products.view",
        available: true,
      },
      {
        to: "/admin/seller/jasa",
        label: "Moderasi Jasa",
        icon: Wrench,
        permission: "services.view",
        available: true,
      },
      {
        to: "/admin/seller/laporan",
        label: "Laporan Marketplace",
        icon: BarChart3,
        permission: "sellers.view",
        available: true,
      },
    ],
  },
  {
    label: "Akses",
    items: [
      {
        to: "/admin/pengguna",
        label: "Pengguna & Peran",
        icon: Users,
        permission: "users.view",
        available: true,
      },
      {
        to: "/admin/izin",
        label: "Matriks Izin",
        icon: ShieldCheck,
        permission: "permissions.view",
        available: true,
      },
      {
        to: "/admin/audit",
        label: "Audit Log",
        icon: FileClock,
        permission: "audit_logs.view",
        available: true,
      },
    ],
  },
  {
    label: "Transaksi",
    items: [
      {
        to: "/admin/orders",
        label: "Order",
        icon: Receipt,
        permission: "orders.view",
        available: true,
      },
      {
        to: "/admin/chat",
        label: "Chat Produk",
        icon: MessagesSquare,
        permission: "orders.view",
        available: true,
      },
      {
        to: "/admin/payments",
        label: "Pembayaran",
        icon: CreditCard,
        permission: "payments.view",
        available: true,
      },
      {
        to: "/admin/refunds",
        label: "Refund",
        icon: Undo2,
        permission: "refunds.view",
        available: true,
      },
      {
        to: "/admin/payouts",
        label: "Payout Seller",
        icon: Banknote,
        permission: "payouts.view",
        available: true,
      },
      {
        to: "/admin/tasks",
        label: "Task Operasional",
        icon: ClipboardList,
        permission: "tasks.view",
        available: true,
      },
      {
        to: "/admin/reports",
        label: "Laporan",
        icon: BadgeCheck,
        permission: "reports.view",
        available: true,
      },
      {
        to: "/admin/settings/transactions",
        label: "Pengaturan Transaksi",
        icon: Settings,
        permission: "settings.view",
        available: true,
      },
      {
        to: "/admin/settings/security",
        label: "Keamanan",
        icon: ShieldCheck,
        permission: "settings.view",
        available: true,
      },
    ],
  },
  {
    // Layanan yang dijalankan operator platform (M-11: tidak di-seller-kan).
    label: "Layanan Platform",
    items: [
      {
        to: "/admin/pengerjaan",
        label: "Pengerjaan Jasa",
        icon: Hammer,
        permission: "orders.fulfill",
        available: true,
      },
      {
        to: "/admin/po",
        label: "PO Custom",
        icon: MessageSquarePlus,
        permission: "orders.view",
        available: true,
      },
    ],
  },
  {
    label: "Website",
    items: [
      {
        to: "/admin/settings/website",
        label: "Pengaturan Website",
        icon: Globe,
        permission: "settings.website.view",
        available: true,
      },
      {
        to: "/admin/jobs",
        label: "Job Terjadwal",
        icon: Timer,
        permission: "audit_logs.view",
        available: true,
      },
      {
        to: "/admin/notifikasi",
        label: "Kirim Notifikasi",
        icon: MessageSquareWarning,
        permission: "notifications.broadcast",
        available: true,
      },
    ],
  },
];

export const ROLE_LABELS: Record<string, string> = {
  customer: "Pelanggan",
  operator: "Operator",
  support: "Support",
  finance: "Finance",
  admin: "Admin",
  super_admin: "Super Admin",
};
