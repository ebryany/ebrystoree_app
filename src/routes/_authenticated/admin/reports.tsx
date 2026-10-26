import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { toast } from "sonner";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  useCan,
} from "@/components/admin/admin-ui";
import { DetailCard } from "@/components/admin/tx-ui";
import {
  DonutChart,
  RevenueTrendChart,
  StatusBarChart,
  CHART_PALETTE,
} from "@/components/admin/report-charts";
import { CountUp, LegendRow, MiniProgress } from "@/components/admin/report-widgets";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getTransactionReport } from "@/lib/admin-transaction.functions";
import { ORDER_STATUS_LABEL, ORDER_TYPE_LABEL } from "@/lib/transaction-labels";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({
    meta: [
      { title: "Laporan Transaksi — Admin Ebrystore" },
      {
        name: "description",
        content: "Ringkasan order, pembayaran, refund, dan performa operator Ebrystore.",
      },
      { property: "og:title", content: "Laporan Transaksi — Admin Ebrystore" },
      { property: "og:description", content: "Laporan transaksi Ebrystore berbasis data nyata." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminReports,
});

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function StatGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <dl>{children}</dl>
    </div>
  );
}

function AdminReports() {
  const canView = useCan("reports.view");
  const canExport = useCan("reports.export");
  const [days, setDays] = useState("30");

  const fetchReport = useServerFn(getTransactionReport);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-report", days],
    queryFn: () => fetchReport({ data: { days: Number(days) } }),
  });

  if (!canView) return <ForbiddenState permission="reports.view" />;
  if (isPending) return <AdminLoading />;
  if ((data as any)?.forbidden) return <ForbiddenState permission={(data as any).permission} />;
  if (error) return <AdminError message="Laporan tidak dapat dimuat." />;

  const r = data as any;

  const daily: Array<{ date: string; orders: number; revenue: number }> = r.daily ?? [];
  const byTypeEntries = Object.entries(r.byType ?? {}) as [string, any][];
  const typeData = byTypeEntries.map(([k, v]) => ({
    name: ORDER_TYPE_LABEL[k] ?? k,
    value: Number(v.revenue ?? 0),
  }));
  const statusData = Object.entries(r.byStatus ?? {}).map(([k, v]: [string, any]) => ({
    name: ORDER_STATUS_LABEL[k] ?? k,
    value: Number(v),
  }));
  const methodData = Object.entries(r.byMethod ?? {}).map(([k, v]: [string, any]) => ({
    name: k,
    value: Number(v),
  }));

  const exportCsv = () => {
    if (!r.daily?.length) return toast.error("Tidak ada data untuk diekspor.");
    const csv = [
      ["tanggal", "order", "pendapatan"],
      ...r.daily.map((d: any) => [d.date, d.orders, d.revenue]),
    ]
      .map((row: unknown[]) => row.join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-${days}-hari.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Laporan diunduh.");
  };

  const paymentMethodCount = methodData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Laporan"
        crumb="Laporan"
        description="Seluruh angka dihitung dari data transaksi nyata, tanpa data contoh."
        actions={
          canExport ? (
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="size-4" aria-hidden="true" /> Ekspor CSV
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Periode:</span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={days}
          onValueChange={(v) => {
            if (v) setDays(v);
          }}
          aria-label="Pilih periode laporan"
        >
          <ToggleGroupItem value="7">7 hari</ToggleGroupItem>
          <ToggleGroupItem value="30">30 hari</ToggleGroupItem>
          <ToggleGroupItem value="90">90 hari</ToggleGroupItem>
          <ToggleGroupItem value="180">180 hari</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Nilai transaksi</p>
          <p className="mt-2 text-3xl font-bold tabular-nums sm:text-4xl">
            <CountUp value={Number(r.revenue ?? 0)} format={(v) => formatRupiah(v)} />
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{days} hari terakhir</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Pendapatan bersih</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            <CountUp value={Number(r.netRevenue ?? 0)} format={(v) => formatRupiah(v)} />
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Konversi bayar</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            <CountUp value={Number(r.conversion ?? 0)} format={(v) => `${Math.round(v)}%`} />
          </p>
        </div>
      </div>

      <div className="grid gap-6 rounded-xl border border-border bg-card p-5 sm:grid-cols-3 sm:gap-4">
        <StatGroup title="Order">
          <StatRow label="Jumlah order" value={r.totalOrders ?? 0} />
          <StatRow label="Order terbayar" value={r.paidOrders ?? 0} />
        </StatGroup>
        <StatGroup title="Pembayaran">
          <StatRow label="Lunas" value={r.paymentPaid ?? 0} />
          <StatRow label="Menunggu verifikasi" value={r.waitingVerification ?? 0} />
          <StatRow label="Ditolak" value={r.paymentRejected ?? 0} />
          <StatRow label="Kedaluwarsa" value={r.paymentExpired ?? 0} />
        </StatGroup>
        <StatGroup title="Refund">
          <StatRow label="Diajukan" value={r.refundCount ?? 0} />
          <StatRow label="Nilai refund" value={formatRupiah(r.refunded ?? 0)} />
        </StatGroup>
      </div>

      <DetailCard
        title="Tren pendapatan & order"
        description="Area menampilkan nilai transaksi, garis menampilkan jumlah order per hari."
      >
        {!daily.length ? (
          <EmptyRow message="Belum ada transaksi pada periode ini." />
        ) : (
          <RevenueTrendChart daily={daily} />
        )}
      </DetailCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailCard
          title="Per jenis order"
          description="Donut: proporsi nilai transaksi. Tabel: angka eksak per jenis."
        >
          {!typeData.length ? (
            <EmptyRow message="Belum ada order pada periode ini." />
          ) : (
            <div className="grid items-center gap-4 lg:grid-cols-2">
              <DonutChart data={typeData} centerLabel="Total pendapatan" currency legend={false} />
              <ul className="min-w-0">
                {byTypeEntries.map(([k, v], i) => (
                  <LegendRow
                    key={k}
                    color={CHART_PALETTE[i % CHART_PALETTE.length]}
                    label={ORDER_TYPE_LABEL[k] ?? k}
                    detail={`${v.orders} order · ${formatRupiah(v.revenue)}`}
                  />
                ))}
              </ul>
            </div>
          )}
        </DetailCard>

        <DetailCard
          title="Metode pembayaran"
          description="Donut: proporsi jumlah pembayaran. Legenda: angka eksak."
        >
          {!methodData.length ? (
            <EmptyRow message="Belum ada pembayaran pada periode ini." />
          ) : (
            <div className="grid items-center gap-4 lg:grid-cols-2">
              <DonutChart
                data={methodData}
                valueLabel="pembayaran"
                centerLabel="Total pembayaran"
                legend={false}
              />
              <ul className="min-w-0">
                {methodData.map((d, i) => (
                  <LegendRow
                    key={d.name}
                    color={CHART_PALETTE[i % CHART_PALETTE.length]}
                    label={d.name}
                    detail={`${d.value} pembayaran`}
                  />
                ))}
                <li className="mt-1 border-t border-border pt-1.5 text-xs text-muted-foreground">
                  Total {paymentMethodCount} pembayaran
                </li>
              </ul>
            </div>
          )}
        </DetailCard>
      </div>

      <DetailCard
        title="Order per status"
        description="Jumlah order pada tiap status periode terpilih."
      >
        {!statusData.length ? (
          <EmptyRow message="Belum ada order pada periode ini." />
        ) : (
          <StatusBarChart data={statusData} showValues />
        )}
      </DetailCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailCard
          title="Performa operator"
          description="Berdasarkan penugasan pada periode terpilih."
        >
          {!Object.keys(r.operatorPerf ?? {}).length ? (
            <EmptyRow message="Belum ada penugasan operator." />
          ) : (
            <ul className="space-y-3">
              {Object.entries(r.operatorPerf).map(([k, v]: [string, any]) => (
                <li key={k} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-mono text-xs" title={k}>
                      {k}
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {v.completed}/{v.total} selesai
                    </span>
                  </div>
                  <MiniProgress
                    value={Number(v.completed ?? 0)}
                    max={Number(v.total ?? 0)}
                    className="mt-1.5"
                  />
                </li>
              ))}
            </ul>
          )}
        </DetailCard>

        <DetailCard title="Transaksi harian">
          {!r.daily?.length ? (
            <EmptyRow message="Belum ada transaksi pada periode ini." />
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="text-right">Order</TableHead>
                    <TableHead className="text-right">Pendapatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.daily.map((d: any) => (
                    <TableRow key={d.date}>
                      <TableCell>{d.date}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.orders}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRupiah(d.revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DetailCard>
      </div>
    </div>
  );
}
