import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, BarChart3, FileText, Megaphone, Search, TrendingUp } from "lucide-react";

import { AdminError } from "@/components/admin/admin-ui";
import { RevenueTrendChart } from "@/components/admin/report-charts";
import {
  EmptyWell,
  LoadingPanels,
  MetricCard,
  RankedBarList,
  Reveal,
  SectionCard,
  StatusPill,
} from "@/components/growth/primitives";
import { formatRupiah } from "@/lib/format";
import { getAnalyticsRange, getGrowthSummary } from "@/lib/growth.functions";

export const Route = createFileRoute("/see/_dashboard/")({
  component: GrowthOverview,
});

/**
 * Ringkasan Pertumbuhan.
 *
 * Susunan mengikuti pertanyaan operasional, dari yang paling mendesak:
 * trafik, penjualan, lalu kondisi konten/SEO/kampanye. Setiap angka berasal
 * dari tabel nyata; keadaan kosong menjelaskan cara mengisinya.
 */
function GrowthOverview() {
  const fetchRange = useServerFn(getAnalyticsRange);
  const fetchSummary = useServerFn(getGrowthSummary);

  const range = useQuery({
    queryKey: ["growth-range", 30],
    queryFn: () => fetchRange({ data: { days: 30 } }),
    staleTime: 60_000,
  });
  const summary = useQuery({
    queryKey: ["growth-summary", 30],
    queryFn: () => fetchSummary({ data: { days: 30 } }),
    staleTime: 60_000,
  });

  if (range.isPending || summary.isPending) return <LoadingPanels />;
  if (range.error || summary.error) {
    return (
      <AdminError message="Ringkasan tidak dapat dimuat. Muat ulang halaman untuk mencoba lagi." />
    );
  }

  const rows = ((range.data as any)?.rows ?? []) as Array<{
    day: string;
    metric: string;
    dimension: string;
    value: number;
  }>;
  const s = summary.data as any;
  if (s?.forbidden) return <AdminError message="Anda tidak punya akses." />;

  const total = (metric: string) =>
    rows.filter((r) => r.metric === metric).reduce((sum, r) => sum + Number(r.value), 0);

  const pageViews = total("page_views");
  const visitors = total("unique_visitors");
  const hasTraffic = rows.length > 0;

  const seo = s?.seo ?? { pagesChecked: 0, pagesWithIssues: 0, totalIssues: 0 };
  const content = s?.articles ?? {
    total: 0,
    published: 0,
    scheduled: 0,
    inReview: 0,
    totalViews: 0,
  };
  const campaigns = s?.campaigns ?? { total: 0, active: 0 };

  // Tren kunjungan harian untuk grafik.
  const daily = rows
    .filter((r) => r.metric === "page_views")
    .map((r) => ({ day: r.day, value: Number(r.value) }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const sources = rows
    .filter((r) => r.metric === "sources")
    .reduce<Record<string, number>>((acc, r) => {
      acc[r.dimension || "langsung"] = (acc[r.dimension || "langsung"] ?? 0) + Number(r.value);
      return acc;
    }, {});
  const topSources = Object.entries(sources)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value]) => ({ label, value }));

  const orders = Number(s?.orders ?? 0);
  const ordersPaid = Number(s?.ordersPaid ?? 0);
  const revenue = Number(s?.revenue ?? 0);

  return (
    <Reveal>
      <div className="space-y-6">
        {/* Angka utama periode 30 hari */}
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Kunjungan"
            value={pageViews}
            hint="Halaman dibuka dalam 30 hari terakhir"
          />
          <MetricCard
            label="Pengunjung unik"
            value={visitors}
            hint={`Dari ${new Set(rows.map((r) => r.day)).size} hari yang punya data`}
          />
          <MetricCard
            label="Order masuk"
            value={orders}
            hint={`${ordersPaid.toLocaleString("id-ID")} sudah lunas`}
          />
          <MetricCard
            label="Nilai transaksi"
            value={revenue}
            format={formatRupiah}
            hint="Hanya order yang benar-benar lunas"
          />
        </dl>

        {!hasTraffic ? (
          <SectionCard
            title="Trafik belum tercatat"
            description="Tracking sudah aktif dan menunggu kunjungan pertama."
          >
            <EmptyWell>
              Data mulai terisi setelah ada pengunjung membuka halaman publik. Setelah itu grafik
              tren, sumber kunjungan, dan funnel checkout muncul di sini secara otomatis.
            </EmptyWell>
          </SectionCard>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <SectionCard
              title="Bagaimana tren kunjungan 30 hari terakhir?"
              description="Satu titik per hari, dihitung dari halaman yang dibuka pengunjung."
            >
              {daily.length > 0 ? (
                <RevenueTrendChart
                  daily={daily.map((d) => ({ date: d.day, orders: 0, revenue: d.value }))}
                />
              ) : (
                <EmptyWell>Belum ada data harian.</EmptyWell>
              )}
            </SectionCard>

            <SectionCard
              title="Dari mana pengunjung datang?"
              description="Lima sumber teratas dalam 30 hari terakhir."
            >
              {topSources.length > 0 ? (
                <RankedBarList items={topSources} maxItems={5} />
              ) : (
                <EmptyWell>
                  Sumber kunjungan belum tercatat. Tautan ber-UTM dari halaman Kampanye akan
                  terhitung di sini.
                </EmptyWell>
              )}
            </SectionCard>
          </div>
        )}

        {/* Kondisi tiap modul: satu kartu ringkas dengan tautan ke bagiannya */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ModuleCard
            to="/see/konten"
            icon={FileText}
            title="Konten"
            metric={String(content.total)}
            metricLabel="artikel"
            rows={[
              { label: "Terbit", value: String(content.published) },
              { label: "Dijadwalkan", value: String(content.scheduled) },
              { label: "Total dibaca", value: Number(content.totalViews).toLocaleString("id-ID") },
            ]}
            empty={content.total === 0}
            emptyHint="Board editorial terisi setelah ada artikel."
          />
          <ModuleCard
            to="/see/seo"
            icon={Search}
            title="SEO"
            metric={String(seo.pagesChecked)}
            metricLabel="halaman diperiksa"
            rows={[
              { label: "Halaman bermasalah", value: String(seo.pagesWithIssues) },
              { label: "Total temuan", value: String(seo.totalIssues) },
            ]}
            empty={seo.pagesChecked === 0}
            emptyHint="Jalankan audit dari halaman SEO untuk mengisi."
            badge={
              seo.totalIssues > 0 ? (
                <StatusPill tone="warning">{seo.totalIssues} temuan</StatusPill>
              ) : seo.pagesChecked > 0 ? (
                <StatusPill tone="success">Bersih</StatusPill>
              ) : null
            }
          />
          <ModuleCard
            to="/see/kampanye"
            icon={Megaphone}
            title="Kampanye"
            metric={String(campaigns.total)}
            metricLabel="kampanye"
            rows={[{ label: "Aktif", value: String(campaigns.active) }]}
            empty={campaigns.total === 0}
            emptyHint="Buat kampanye untuk melacak asal kunjungan."
            badge={
              campaigns.active > 0 ? (
                <StatusPill tone="accent">{campaigns.active} aktif</StatusPill>
              ) : null
            }
          />
          <ModuleCard
            to="/see/marketing"
            icon={BarChart3}
            title="Marketing"
            metric={String(new Set(rows.map((r) => r.day)).size)}
            metricLabel="hari ada data"
            rows={[
              { label: "Kunjungan", value: pageViews.toLocaleString("id-ID") },
              { label: "Pengunjung unik", value: visitors.toLocaleString("id-ID") },
            ]}
            empty={!hasTraffic}
            emptyHint="Halaman marketing terisi setelah ada kunjungan."
          />
        </div>

        {/* Panel penjualan lengkap */}
        <SectionCard
          title="Berapa order dan nilainya?"
          description="Semua order dalam 30 hari terakhir, dihitung dari tabel orders."
          action={
            <StatusPill tone={orders > 0 ? "success" : "neutral"}>
              {orders > 0 ? "Ada aktivitas" : "Belum ada order"}
            </StatusPill>
          }
        >
          {orders === 0 ? (
            <EmptyWell>
              Belum ada order dalam 30 hari terakhir. Setelah ada pembeli, angka order, order lunas,
              dan nilai transaksi muncul di sini.
            </EmptyWell>
          ) : (
            <dl className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="Order" value={orders} />
              <MetricCard label="Order lunas" value={ordersPaid} tone="success" />
              <MetricCard label="Nilai transaksi" value={revenue} format={formatRupiah} />
            </dl>
          )}
        </SectionCard>
      </div>
    </Reveal>
  );
}

/** Kartu ringkas satu modul: angka utama + dua baris rincian + tautan buka. */
function ModuleCard({
  to,
  icon: Icon,
  title,
  metric,
  metricLabel,
  rows,
  empty,
  emptyHint,
  badge,
}: {
  to: string;
  icon: typeof TrendingUp;
  title: string;
  metric: string;
  metricLabel: string;
  rows: Array<{ label: string; value: string }>;
  empty: boolean;
  emptyHint: string;
  badge?: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/50 hover:bg-surface-selected/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-selected text-accent">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="truncate text-sm font-semibold text-foreground">{title}</span>
        </span>
        <ArrowUpRight
          className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent"
          aria-hidden="true"
        />
      </div>

      <p className="mt-3.5 text-2xl font-bold tabular-nums text-foreground">{metric}</p>
      <p className="text-xs text-muted-foreground">{metricLabel}</p>

      {empty ? (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{emptyHint}</p>
      ) : (
        <dl className="mt-3.5 space-y-1.5 border-t border-border pt-3.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-2">
              <dt className="truncate text-[11px] text-muted-foreground">{row.label}</dt>
              <dd className="shrink-0 tabular-nums text-xs font-medium text-foreground">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {badge ? <div className="mt-3.5">{badge}</div> : null}
    </Link>
  );
}
