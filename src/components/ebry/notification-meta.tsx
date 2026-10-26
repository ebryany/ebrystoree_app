import {
  Bell,
  BadgeCheck,
  CreditCard,
  Megaphone,
  MessageSquare,
  PackageCheck,
  RotateCcw,
  TriangleAlert,
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

export function notificationTone(type?: string | null): NotificationTone {
  const value = type ?? "";
  for (const entry of MAP) if (entry.match.test(value)) return entry.tone;
  return { icon: Bell, label: "Notifikasi", wrap: "bg-muted text-muted-foreground" };
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
