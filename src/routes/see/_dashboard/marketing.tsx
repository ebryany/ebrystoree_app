import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AdminError } from "@/components/admin/admin-ui";
import {
  EmptyWell,
  FunnelStep,
  LoadingPanels,
  MetricCard,
  RankedBarList,
  Reveal,
  SectionCard,
  TrafficTrendChart,
} from "@/components/growth/primitives";
import { getAnalyticsRange } from "@/lib/growth.functions";

export const Route = createFileRoute("/see/_dashboard/marketing")({
  component: MarketingPanel,
});

/**
 * Panel Marketing.
 *
 * Menjawab M1 (dari mana pengunjung), M2 (halaman apa yang bekerja), dan M4
 * (di langkah mana orang berhenti). Angka dihitung dari `analytics_daily`
 * yang sudah teragregasi supaya halaman tetap ringan.
 */
function MarketingPanel() {
  const fetchRange = useServerFn(getAnalyticsRange);
  const { data, isPending, error } = useQuery({
    queryKey: ["growth-range", 30],
    queryFn: () => fetchRange({ data: { days: 30 } }),
    staleTime: 60_000,
  });

  if (isPending) return <LoadingPanels cards={3} />;
  if (error) return <AdminError message="Data marketing tidak dapat dimuat." />;

  const rows = ((data as any)?.rows ?? []) as Array<{
    day: string;
    metric: string;
    dimension: string;
    value: number;
  }>;

  if (rows.length === 0) {
    return (
      <Reveal>
        <SectionCard
          title="Belum ada data kunjungan"
          description="Tracking sudah aktif dan menunggu kunjungan pertama."
        >
          <EmptyWell>
            Data marketing muncul setelah pengunjung membuka halaman publik. Cukup tunggu ada
            kunjungan, lalu sumber, halaman populer, dan funnel terisi otomatis.
          </EmptyWell>
        </SectionCard>
      </Reveal>
    );
  }

  const total = (metric: string) =>
    rows.filter((r) => r.metric === metric).reduce((sum, r) => sum + Number(r.value), 0);

  // M1: dari mana pengunjung datang
  const sources = rows
    .filter((r) => r.metric === "sources")
    .reduce<Record<string, number>>((acc, r) => {
      acc[r.dimension || "langsung"] = (acc[r.dimension || "langsung"] ?? 0) + Number(r.value);
      return acc;
    }, {});
  const sourceItems = Object.entries(sources)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, value]) => ({ label, value }));

  // M2: halaman apa yang paling menarik
  const pages = rows
    .filter((r) => r.metric === "top_pages")
    .reduce<Record<string, number>>((acc, r) => {
      acc[r.dimension] = (acc[r.dimension] ?? 0) + Number(r.value);
      return acc;
    }, {});
  const pageItems = Object.entries(pages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, value]) => ({ label, value }));

  // M4: funnel checkout
  const funnel = rows
    .filter((r) => r.metric === "funnel")
    .reduce<Record<string, number>>((acc, r) => {
      acc[r.dimension] = (acc[r.dimension] ?? 0) + Number(r.value);
      return acc;
    }, {});
  const checkoutStart = funnel["checkout_start"] ?? 0;
  const paymentSuccess = funnel["payment_success"] ?? 0;
  const hasFunnel = checkoutStart > 0 || paymentSuccess > 0;
  const conversion = checkoutStart > 0 ? Math.round((paymentSuccess / checkoutStart) * 100) : 0;

  const daily = rows
    .filter((r) => r.metric === "page_views")
    .map((r) => ({ day: r.day, value: Number(r.value) }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const pageViews = total("page_views");
  const visitors = total("unique_visitors");

  return (
    <Reveal>
      <div className="space-y-6">
        <dl className="grid gap-3 sm:grid-cols-3">
          <MetricCard
            label="Kunjungan"
            value={pageViews}
            hint="Halaman dibuka dalam 30 hari terakhir"
          />
          <MetricCard label="Pengunjung unik" value={visitors} hint="Perkiraan orang, bukan klik" />
          <MetricCard
            label="Konversi checkout"
            value={conversion}
            format={(v) => `${Math.round(v)}%`}
            hint={
              hasFunnel
                ? `${paymentSuccess.toLocaleString("id-ID")} pembayaran dari ${checkoutStart.toLocaleString("id-ID")} checkout`
                : "Menunggu aktivitas checkout pertama"
            }
            tone={conversion >= 50 ? "success" : "default"}
          />
        </dl>

        <SectionCard
          title="Bagaimana tren kunjungan 30 hari terakhir?"
          description="Satu titik per hari, dari halaman publik yang benar-benar dibuka."
        >
          {daily.length > 0 ? (
            <TrafficTrendChart daily={daily} />
          ) : (
            <EmptyWell>Belum ada data harian.</EmptyWell>
          )}
        </SectionCard>

        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard
            title="Dari mana pengunjung datang?"
            description="Pangsa tiap sumber terhadap total kunjungan berlabel sumber."
          >
            {sourceItems.length > 0 ? (
              <RankedBarList items={sourceItems} />
            ) : (
              <EmptyWell>
                Belum ada sumber kunjungan tercatat. Tautan ber-UTM dari halaman Kampanye akan
                muncul di sini.
              </EmptyWell>
            )}
          </SectionCard>

          <SectionCard
            title="Halaman apa yang paling banyak dibuka?"
            description="Sepuluh halaman teratas menurut jumlah kunjungan."
          >
            {pageItems.length > 0 ? (
              <RankedBarList items={pageItems} />
            ) : (
              <EmptyWell>Belum ada data halaman.</EmptyWell>
            )}
          </SectionCard>
        </div>

        <SectionCard
          title="Di langkah mana orang berhenti?"
          description="Perbandingan jumlah orang yang mulai checkout dan yang menyelesaikan pembayaran."
        >
          {hasFunnel ? (
            <div className="space-y-4">
              <FunnelStep
                label="Mulai checkout"
                value={checkoutStart}
                max={Math.max(checkoutStart, paymentSuccess, 1)}
              />
              <FunnelStep
                label="Pembayaran berhasil"
                value={paymentSuccess}
                max={Math.max(checkoutStart, paymentSuccess, 1)}
                hint={`Konversi ${conversion}% dari checkout. Angka pembayaran dicatat server, jadi tidak bisa dipalsukan dari browser.`}
              />
            </div>
          ) : (
            <EmptyWell>
              Belum ada aktivitas checkout tercatat. Funnel terisi saat pembeli membuka checkout dan
              menyelesaikan pembayaran.
            </EmptyWell>
          )}
        </SectionCard>
      </div>
    </Reveal>
  );
}
