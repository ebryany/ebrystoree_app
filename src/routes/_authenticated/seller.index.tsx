import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  MessageSquare,
  Package,
  PackagePlus,
  PackageX,
  Plus,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Star,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { AdminError, AdminLoading } from "@/components/admin/admin-ui";
import { StatTile } from "@/components/ebry/cards";
import { useSession } from "@/hooks/use-session";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { formatRupiah } from "@/lib/format";
import { listSellerInquiries } from "@/lib/inquiries.functions";
import { listMyServiceOrders } from "@/lib/marketplace-service.functions";
import { listOrderMonitoring } from "@/lib/order-monitoring.functions";
import { countServiceOrders } from "@/lib/seller-service-order-ui";
import { getMyInventorySummary, getMyStore, getSellerSummary } from "@/lib/seller.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/seller/")({
  head: () => ({
    meta: [
      { title: "Ringkasan Toko — Ebrystore" },
      { name: "description", content: "Ringkasan performa dan penjualan toko digital Anda." },
      { property: "og:title", content: "Ringkasan Toko — Ebrystore" },
      { property: "og:description", content: "Pantau penjualan, saldo, dan produk toko Anda." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SellerOverview,
});

function compactRupiah(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} jt`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} rb`;
  return String(value);
}

function shortDate(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

/** Grafik area 30 hari. Recharts hanya dirender setelah mount (aman untuk SSR). */
function TrendChart({ data }: { data: Array<{ date: string; total: number }> }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-[240px] animate-pulse rounded-lg bg-muted/50" />;

  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            minTickGap={16}
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={compactRupiah}
            width={54}
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "0.6rem",
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--muted-foreground)", fontSize: 12 }}
            labelFormatter={(v) => shortDate(String(v))}
            formatter={(value: number) => [formatRupiah(Number(value)), "Pendapatan"]}
          />
          {/* Linear, bukan monotone: hari tanpa penjualan tetap 0, tidak "menggelembung". */}
          <Area
            type="linear"
            dataKey="total"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="var(--chart-1)"
            fillOpacity={0.12}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type TodoItem = {
  label: string;
  value: number | null;
  icon: LucideIcon;
  to: string;
  /** Angka > 0 di sini berarti seller perlu bertindak (diberi warna). */
  urgent?: boolean;
};

/** Kotak "Perlu diproses" ala seller center: angka besar, klik langsung ke filter terkait. */
function TodoGrid({ items }: { items: TodoItem[] }) {
  return (
    <section aria-labelledby="todo-heading" className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 id="todo-heading" className="text-sm font-bold text-foreground">
          Perlu diproses
        </h2>
        <span className="text-xs text-muted-foreground">Klik untuk membuka daftar</span>
      </div>
      <ul className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 xl:grid-cols-6">
        {items.map((t) => {
          const active = t.urgent && (t.value ?? 0) > 0;
          return (
            <li key={t.label} className="bg-card">
              <Link
                to={t.to}
                className="group flex h-full min-h-[92px] flex-col justify-between gap-2 p-4 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "text-2xl font-bold leading-none tabular-nums",
                    active ? "text-destructive" : "text-foreground",
                  )}
                >
                  {t.value ?? "–"}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground group-hover:text-foreground">
                  <t.icon className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="line-clamp-2">{t.label}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SellerOverview() {
  const { user } = useSession();
  const fetchSummary = useServerFn(getSellerSummary);
  const fetchStore = useServerFn(getMyStore);
  const fetchMonitoring = useServerFn(listOrderMonitoring);
  const fetchServiceOrders = useServerFn(listMyServiceOrders);
  const fetchInquiries = useServerFn(listSellerInquiries);
  const fetchInventory = useServerFn(getMyInventorySummary);

  const { data, isPending, error } = useQuery({
    queryKey: ["seller-summary"],
    queryFn: () => fetchSummary({}),
    refetchOnWindowFocus: "always",
  });
  // Query key sama dengan halaman masing-masing supaya cache dipakai bersama.
  const storeQ = useQuery({ queryKey: ["my-store"], queryFn: () => fetchStore({}) });
  const monitoringQ = useQuery({
    queryKey: ["seller-monitoring", "actions", 1],
    queryFn: () => fetchMonitoring({ data: { scope: "seller", filter: "actions", page: 1 } }),
  });
  const serviceQ = useQuery({
    queryKey: ["my-service-orders"],
    queryFn: () => fetchServiceOrders({}),
  });
  const inquiriesQ = useQuery({
    queryKey: ["seller-inquiries", "all"],
    queryFn: () => fetchInquiries({ data: { status: "all" } }),
  });
  const inventoryQ = useQuery({
    queryKey: ["my-inventory-summary"],
    queryFn: () => fetchInventory({}),
  });

  // RLS orders menutup pesanan toko dari seller, jadi pemicunya notifikasi milik sendiri.
  useRealtimeRefresh({
    channel: "seller-dashboard",
    tables: ["notifications"],
    filter: user ? `recipient_id=eq.${user.id}` : undefined,
    keys: [["seller-summary"], ["my-store"], ["seller-monitoring"], ["my-service-orders"]],
    enabled: Boolean(user),
  });

  if (isPending) return <AdminLoading label="Memuat ringkasan…" />;
  if (error || data?.error) return <AdminError message="Ringkasan tidak dapat dimuat." />;

  const s = data?.summary;
  if (!s) return <AdminError message="Ringkasan toko tidak tersedia." />;

  const store = (storeQ.data as { store?: { slug?: string } } | undefined)?.store;
  const counts = monitoringQ.data?.counts;
  const serviceCounts = serviceQ.data ? countServiceOrders(serviceQ.data.items ?? []) : null;
  const inquiries = ((inquiriesQ.data as { items?: Array<{ status: string }> } | undefined)?.items ??
    null) as Array<{ status: string }> | null;
  const inv = (inventoryQ.data as { summary?: { out_of_stock: number } } | undefined)?.summary;

  const todos: TodoItem[] = [
    {
      label: "Pesanan perlu tindakan",
      value: counts?.delivery_blocked ?? null,
      icon: ReceiptText,
      to: "/seller/pesanan",
      urgent: true,
    },
    {
      label: "Pesanan jasa perlu tindakan",
      value: serviceCounts?.needs_action ?? null,
      icon: FileText,
      to: "/seller/jasa-pesanan",
      urgent: true,
    },
    {
      label: "Chat belum dijawab",
      value: inquiries ? inquiries.filter((i) => i.status === "open").length : null,
      icon: MessageSquare,
      to: "/seller/chat",
      urgent: true,
    },
    {
      label: "Stok habis",
      value: inv?.out_of_stock ?? null,
      icon: PackageX,
      to: "/seller/produk",
      urgent: true,
    },
    {
      label: "Menunggu penerimaan",
      value: counts?.awaiting_receipt ?? null,
      icon: Clock,
      to: "/seller/pesanan",
    },
    {
      label: "Refund aktif",
      value: counts?.refund_active ?? null,
      icon: RotateCcw,
      to: "/seller/pesanan",
      urgent: true,
    },
  ];

  const quickActions: Array<{ label: string; icon: LucideIcon; to: string; params?: object }> = [
    { label: "Tambah produk", icon: PackagePlus, to: "/seller/produk/baru" },
    { label: "Tambah jasa", icon: Plus, to: "/seller/jasa" },
    { label: "Tarik saldo", icon: Wallet, to: "/seller/keuangan" },
    { label: "Lihat ulasan", icon: Star, to: "/seller/performa" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatTile
          icon={Wallet}
          label="Saldo tersedia"
          value={formatRupiah(s.balance)}
          to="/seller/keuangan"
        />
        <StatTile
          icon={ShoppingBag}
          label="Pendapatan dilepas"
          value={formatRupiah(s.salesTotal)}
          tone="success"
        />
        <StatTile
          icon={Package}
          label="Produk tayang"
          value={`${s.productPublished}/${s.productTotal}`}
          to="/seller/produk"
        />
        <StatTile
          icon={Star}
          label="Rating toko"
          value={s.ratingCount > 0 ? `${s.rating} (${s.ratingCount})` : "Belum ada"}
          tone="warning"
          to="/seller/performa"
        />
      </div>

      <TodoGrid items={todos} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section
          className="rounded-2xl border border-border bg-card p-4 sm:p-5"
          aria-labelledby="tren-heading"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id="tren-heading"
                className="flex items-center gap-2 text-sm font-bold text-foreground"
              >
                <BarChart3 className="size-4 shrink-0 text-accent" aria-hidden="true" />
                Pendapatan 30 hari terakhir
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Hanya pendapatan yang sudah dilepas, bukan dana yang masih ditahan.
              </p>
            </div>
            <p className="text-right">
              <span className="block text-[11px] text-muted-foreground">Total 30 hari</span>
              <span className="text-base font-bold tabular-nums text-foreground">
                {formatRupiah(s.trend.reduce((sum, d) => sum + d.total, 0))}
              </span>
            </p>
          </div>
          <div className="mt-3">
            <TrendChart data={s.trend} />
          </div>
        </section>

        <div className="space-y-4">
          <section
            aria-labelledby="aksi-heading"
            className="rounded-2xl border border-border bg-card p-2"
          >
            <h2 id="aksi-heading" className="px-2 pb-1 pt-2 text-sm font-bold text-foreground">
              Aksi cepat
            </h2>
            <ul className="grid grid-cols-2 gap-1">
              {quickActions.map((a) => (
                <li key={a.label}>
                  <Link
                    to={a.to}
                    className="flex min-h-11 flex-col items-start gap-2 rounded-xl p-3 text-sm font-medium text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="grid size-9 place-items-center rounded-lg bg-surface-selected text-accent">
                      <a.icon className="size-4" aria-hidden="true" />
                    </span>
                    {a.label}
                  </Link>
                </li>
              ))}
            </ul>
            {store?.slug ? (
              <Link
                to="/toko/$slug"
                params={{ slug: store.slug }}
                className="mt-1 flex min-h-11 items-center justify-between gap-2 rounded-xl border-t border-border px-3 text-sm font-semibold text-accent hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Lihat halaman toko
                <ExternalLink className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
          </section>

          <section
            className="rounded-2xl border border-border bg-card"
            aria-labelledby="dana-heading"
          >
            <h2
              id="dana-heading"
              className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-bold text-foreground"
            >
              <ShieldCheck className="size-4 text-accent" aria-hidden="true" />
              Dana & produk
            </h2>
            <dl className="divide-y divide-border text-sm">
              {[
                ["Ditahan, menunggu penerimaan", formatRupiah(s.held)],
                ["Cadangan refund", formatRupiah(s.reserved)],
                ["Total produk", s.productTotal],
                ["Menunggu moderasi", s.productPending],
                ["Total terjual", s.soldCount],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
            <Link
              to="/seller/keuangan"
              className="flex min-h-11 items-center justify-between border-t border-border px-4 text-sm font-semibold text-accent hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Buka keuangan
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
