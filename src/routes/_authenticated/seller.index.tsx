import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { BarChart3, Package, ShoppingBag, Star, Wallet } from "lucide-react";

import { AdminError, AdminLoading } from "@/components/admin/admin-ui";
import { StatTile } from "@/components/ebry/cards";
import { useSession } from "@/hooks/use-session";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { formatRupiah } from "@/lib/format";
import { getSellerSummary } from "@/lib/seller.functions";

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
          <defs>
            <linearGradient id="sellerTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
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
          <Area
            type="monotone"
            dataKey="total"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#sellerTrendFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function SellerOverview() {
  const { user } = useSession();
  const fetchSummary = useServerFn(getSellerSummary);
  const { data, isPending, error } = useQuery({
    queryKey: ["seller-summary"],
    queryFn: () => fetchSummary({}),
    refetchOnWindowFocus: "always",
  });
  // RLS orders menutup pesanan toko dari seller, jadi pemicunya notifikasi milik sendiri.
  useRealtimeRefresh({
    channel: "seller-dashboard",
    tables: ["notifications"],
    filter: user ? `recipient_id=eq.${user.id}` : undefined,
    keys: [["seller-summary"], ["my-store"]],
    enabled: Boolean(user),
  });

  if (isPending) return <AdminLoading label="Memuat ringkasan…" />;
  if (error || data?.error) return <AdminError message="Ringkasan tidak dapat dimuat." />;

  const s = data?.summary;
  if (!s) return <AdminError message="Ringkasan toko tidak tersedia." />;

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

      <p className="text-sm text-muted-foreground">
        Menunggu penerimaan: {formatRupiah(s.held)}. Cadangan refund: {formatRupiah(s.reserved)}.
      </p>

      <section
        className="rounded-2xl border border-border bg-card p-4 sm:p-5"
        aria-labelledby="tren-heading"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <h2 id="tren-heading" className="text-sm font-bold text-foreground">
            Pendapatan 30 hari terakhir
          </h2>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Dihitung dari pendapatan yang sudah dilepas ke buku besar, bukan pembayaran yang masih
          ditahan.
        </p>
        <div className="mt-3">
          <TrendChart data={s.trend} />
        </div>
      </section>

      <section
        className="rounded-2xl border border-border bg-card"
        aria-labelledby="produk-ringkas"
      >
        <h2
          id="produk-ringkas"
          className="border-b border-border px-4 py-3 text-sm font-bold text-foreground"
        >
          Ringkasan produk
        </h2>
        <dl className="divide-y divide-border">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <dt className="text-sm text-muted-foreground">Total produk</dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">{s.productTotal}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <dt className="text-sm text-muted-foreground">Menunggu moderasi</dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">
              {s.productPending}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <dt className="text-sm text-muted-foreground">Total terjual</dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">{s.soldCount}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
