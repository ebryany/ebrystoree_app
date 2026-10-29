import {
  Bell,
  BadgeCheck,
  CreditCard,
  Megaphone,
  MessageSquare,
  PackageCheck,
  RotateCcw,
  Store,
  TriangleAlert,
  Wallet,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NotificationTone = {
  icon: LucideIcon;
  label: string;
  /** kelas warna untuk wadah ikon */
  wrap: string;
};

const MAP: Array<{ match: RegExp; tone: NotificationTone }> = [
  {
    match: /payment|pembayaran|invoice|bayar/i,
    tone: { icon: CreditCard, label: "Pembayaran", wrap: "bg-primary/10 text-primary" },
  },
  {
    match: /refund/i,
    tone: { icon: RotateCcw, label: "Refund", wrap: "bg-destructive/10 text-destructive" },
  },
  {
    match: /order|pesanan|delivery|pengiriman/i,
    tone: { icon: PackageCheck, label: "Pesanan", wrap: "bg-accent/15 text-accent" },
  },
  {
    match: /po|chat|message|pesan/i,
    tone: { icon: MessageSquare, label: "Diskusi", wrap: "bg-primary/10 text-primary" },
  },
  {
    match: /maintenance/i,
    tone: { icon: Wrench, label: "Pemeliharaan", wrap: "bg-muted text-muted-foreground" },
  },
  {
    match: /announcement|promo|info/i,
    tone: { icon: Megaphone, label: "Pengumuman", wrap: "bg-accent/15 text-accent" },
  },
  {
    match: /verified|approved|selesai|complete/i,
    tone: { icon: BadgeCheck, label: "Selesai", wrap: "bg-accent/15 text-accent" },
  },
  {
    match: /reject|failed|gagal|ditolak|expired/i,
    tone: { icon: TriangleAlert, label: "Perhatian", wrap: "bg-destructive/10 text-destructive" },
  },
];

/** Tipe dengan prefiks pasti dicocokkan lebih dulu; MAP regex jadi cadangan. */
const PREFIX_TONE: Array<[RegExp, NotificationTone]> = [
  [/^(credit|payout)/, { icon: Wallet, label: "Saldo", wrap: "bg-success/12 text-success" }],
  [/^product_inquiry/, { icon: MessageSquare, label: "Chat", wrap: "bg-primary/10 text-primary" }],
  [/^seller\./, { icon: Store, label: "Toko", wrap: "bg-accent/15 text-accent" }],
  [/^service\./, { icon: PackageCheck, label: "Pesanan jasa", wrap: "bg-accent/15 text-accent" }],
];

export function notificationTone(type?: string | null): NotificationTone {
  const value = type ?? "";
  for (const [re, tone] of PREFIX_TONE) if (re.test(value)) return tone;
  for (const entry of MAP) if (entry.match.test(value)) return entry.tone;
  return { icon: Bell, label: "Notifikasi", wrap: "bg-muted text-muted-foreground" };
}

export type NotificationCategory = "pesanan" | "pembayaran" | "saldo" | "chat" | "toko" | "lainnya";

export const NOTIFICATION_CATEGORIES: Array<{ key: NotificationCategory; label: string; icon: LucideIcon }> = [
  { key: "pesanan", label: "Pesanan", icon: PackageCheck },
  { key: "pembayaran", label: "Pembayaran", icon: CreditCard },
  { key: "saldo", label: "Saldo & penarikan", icon: Wallet },
  { key: "chat", label: "Chat", icon: MessageSquare },
  { key: "toko", label: "Toko", icon: Store },
  { key: "lainnya", label: "Lainnya", icon: Megaphone },
];

export function notificationCategory(type?: string | null): NotificationCategory {
  const t = type ?? "";
  if (/^(order|service)\./.test(t)) return "pesanan";
  if (/^payment/.test(t)) return "pembayaran";
  if (/^(payout|credit|refund)/.test(t)) return "saldo";
  if (/^product_inquiry/.test(t)) return "chat";
  if (/^seller\./.test(t)) return "toko";
  return "lainnya";
}

type NotificationLike = {
  type?: string | null;
  title?: string | null;
  related_type?: string | null;
  related_id?: string | null;
};

export type NotificationHref = { to: string; params?: Record<string, string> };

/** Tipe pesanan jasa yang penerimanya seller (bukan pembeli). */
const SELLER_SERVICE_TYPES = new Set([
  "service.accepted",
  "service.revision_requested",
  "service.complaint_opened",
  "service.complaint_resumed",
]);

/**
 * Tujuan klik notifikasi. Tabel notifications tidak menyimpan peran penerima,
 * jadi peran disimpulkan dari tipe (dan judul untuk tipe yang dipakai bersama).
 * Hanya navigasi: halaman tujuan tetap menegakkan permission & RLS.
 */
export function notificationHref(n: NotificationLike, staff: boolean): NotificationHref | null {
  const id = n.related_id ?? "";
  const type = n.type ?? "";
  const title = n.title ?? "";
  switch (n.related_type) {
    case "payout":
      return staff && id ? { to: "/admin/payouts/$id", params: { id } } : { to: "/seller/keuangan" };
    case "payment":
      return staff && id ? { to: "/admin/payments/$id", params: { id } } : null;
    case "credit_ledger":
      return { to: "/dashboard/saldo" };
    case "store":
      return { to: "/seller" };
    case "product_inquiry":
      if (!id) return null;
      // "Balasan dari penjual" dikirim ke pembeli; sisanya ke seller.
      return /penjual/i.test(title)
        ? { to: "/dashboard/chat/$id", params: { id } }
        : { to: "/seller/chat/$id", params: { id } };
    case "order":
      if (SELLER_SERVICE_TYPES.has(type) || (type === "order.paid" && /jasa diterima/i.test(title)))
        return { to: "/seller/jasa-pesanan" };
      return id ? { to: "/dashboard/pesanan/$id", params: { id } } : null;
    default:
      return null;
  }
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} menit lalu`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { dateStyle: "medium" });
}

const PAYOUT_STAFF_ROLES = new Set(["finance", "admin", "super_admin"]);

/** Apakah penerima notifikasi termasuk pengelola payout (finance/admin)?
 *  Dipakai untuk menentukan tujuan tautan notifikasi payout: staff ke antrean
 *  finance, seller ke halaman keuangan miliknya. Tautan tidak memberi akses
 *  baru — permission & RLS tetap berlaku di halaman tujuan. */
export function isPayoutStaff(roles?: string[] | null): boolean {
  return (roles ?? []).some((role) => PAYOUT_STAFF_ROLES.has(role));
}

export function dayGroupLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const isSame = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (isSame(date, today)) return "Hari ini";
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (isSame(date, yest)) return "Kemarin";
  return date.toLocaleDateString("id-ID", { dateStyle: "medium" });
}
