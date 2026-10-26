import { useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpRight,
  CreditCard,
  Package,
  ReceiptText,
  RefreshCw,
  Store,
  Users,
} from "lucide-react";

import { AdminError, AdminLoading, ForbiddenState, useAccess } from "@/components/admin/admin-ui";
import { StatusBadge, formatDateTime } from "@/components/admin/tx-ui";
import { RevenueTrendChart } from "@/components/admin/report-charts";
import { Button } from "@/components/ui/button";
import { getAdminOverview } from "@/lib/admin.functions";
import { OrderMonitoringList } from "@/components/ebry/order-monitoring";
import { getTransactionReport, listOrders } from "@/lib/admin-transaction.functions";
import { formatRupiah } from "@/lib/format";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard Admin | Ebrystore" },
      {
        name: "description",
        content: "Pantau transaksi, tinjau seller, dan kelola operasional marketplace Ebrystore.",
      },
    ],
  }),
  component: AdminOverview,
});

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function AdminOverview() {
  const access = useAccess();
  const can = (permission: string) =>
    access.isSuperAdmin || access.permissions.includes(permission);
  const [days, setDays] = useState(30);
  const fetchOverview = useServerFn(getAdminOverview);
  const fetchReport = useServerFn(getTransactionReport);
  const fetchOrders = useServerFn(listOrders);
  const overviewQ = useQuery({ queryKey: ["admin-overview"], queryFn: () => fetchOverview({}) });
  const reportQ = useQuery({
    queryKey: ["admin-dashboard-report", days],
    queryFn: () => fetchReport({ data: { days } }),
    enabled: can("reports.view"),
  });
  const ordersQ = useQuery({
    queryKey: ["admin-dashboard-orders"],
    queryFn: () => fetchOrders({ data: { sort: "newest", page: 1 } }),
    enabled: can("orders.view"),
  });

  useRealtimeRefresh({
    channel: "admin-dashboard",
    tables: ["orders", "payments", "refunds", "stores", "digital_products", "audit_logs"],
    keys: [["admin-overview"], ["admin-dashboard-report"], ["admin-dashboard-orders"]],
  });

  const refresh = () => {
    void overviewQ.refetch();
    if (can("reports.view")) void reportQ.refetch();
    if (can("orders.view")) void ordersQ.refetch();
  };
  const busy = overviewQ.isFetching || reportQ.isFetching || ordersQ.isFetching;
  const overview = overviewQ.data;
  const report = reportQ.data && !("forbidden" in reportQ.data) ? reportQ.data : null;
  const orders = ordersQ.data && !("forbidden" in ordersQ.data) ? ordersQ.data : null;
  const shortcuts = [
    { to: "/admin/orders", label: "Kelola pesanan", permission: "orders.view", icon: ReceiptText },
    { to: "/admin/produk", label: "Kelola produk", permission: "products.view", icon: Package },
    { to: "/admin/seller", label: "Tinjau seller", permission: "sellers.view", icon: Store },
    {
      to: "/admin/payments",
      label: "Verifikasi pembayaran",
      permission: "payments.view",
      icon: CreditCard,
    },
  ].filter((item) => can(item.permission));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Pantau bisnis. Dahulukan yang perlu ditangani.
          </p>
        </div>
        <Button variant="outline" className="min-h-11 bg-card" onClick={refresh} disabled={busy}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {busy ? "Memperbarui…" : "Perbarui data"}
        </Button>
      </header>

      {can("orders.view") ? <OrderMonitoringList scope="admin" /> : null}

      {overviewQ.isPending ? (
        <AdminLoading label="Memuat antrean dan ringkasan marketplace…" />
      ) : overviewQ.error ? (
        <AdminError message="Ringkasan belum dapat dimuat. Gunakan Perbarui data untuk mencoba kembali." />
      ) : overview?.forbidden ? (
        <ForbiddenState permission={overview.permission} />
      ) : overview ? (
        <>
          {overview.queues.length > 0 ? (
            <section
              className="overflow-hidden rounded-xl border border-border bg-card"
              aria-labelledby="queue-title"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 bg-primary px-4 py-4 text-primary-foreground sm:px-5">
                <h2 id="queue-title" className="text-base font-semibold">
                  Perlu ditangani
                </h2>
                <p className="text-xs">Antrean saat ini, seluruh periode</p>
              </div>
              <div className="grid divide-y divide-border sm:grid-cols-2 xl:grid-cols-4 xl:divide-y-0">
                {overview.queues.map((queue) => (
                  <Link
                    key={queue.to}
                    to={queue.to}
                    className="group flex min-h-28 items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <div>
                      <p className="text-3xl font-bold tabular-nums">
                        {queue.count === null
                          ? "Tidak tersedia"
                          : queue.count.toLocaleString("id-ID")}
                      </p>
                      <p className="mt-2 text-sm font-medium">{queue.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {queue.error ?? (queue.count === 0 ? "Tidak ada antrean" : "Buka antrean")}
                      </p>
                    </div>
                    <ArrowUpRight
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {can("reports.view") ? (
            <section aria-labelledby="business-title" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="business-title" className="text-lg font-semibold">
                    Ringkasan transaksi
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pesanan yang dibuat dalam {days} hari terakhir, tidak termasuk pesanan uji.
                  </p>
                </div>
                <div
                  className="flex gap-1 rounded-lg border border-border bg-card p-1"
                  role="group"
                  aria-label="Periode ringkasan"
                >
                  {[7, 30, 90].map((period) => (
                    <Button
                      key={period}
                      size="sm"
                      variant={days === period ? "default" : "ghost"}
                      className="min-h-11"
                      aria-pressed={days === period}
                      onClick={() => setDays(period)}
                    >
                      {period} hari
                    </Button>
                  ))}
                </div>
              </div>
              {reportQ.isPending ? (
                <AdminLoading label="Memuat ringkasan transaksi…" />
              ) : reportQ.error || !report ? (
                <AdminError message="Ringkasan transaksi belum dapat dimuat. Gunakan Perbarui data untuk mencoba kembali." />
              ) : (
                <>
                  <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      {
                        label: "Nilai pesanan dibayar",
                        value: formatRupiah(report.revenue),
                        hint: "Total pesanan dengan pembayaran tercatat",
                      },
                      {
                        label: "Pesanan masuk",
                        value: report.totalOrders.toLocaleString("id-ID"),
                        hint: `${report.paidOrders} pesanan sudah dibayar`,
                      },
                      {
                        label: "Setelah refund",
                        value: formatRupiah(report.netRevenue),
                        hint: "Nilai pesanan dibayar dikurangi refund selesai",
                      },
                      {
                        label: "Rasio pesanan dibayar",
                        value: `${report.conversion}%`,
                        hint: "Pesanan dibayar dibanding pesanan masuk",
                      },
                    ].map((metric) => (
                      <div
                        key={metric.label}
                        className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5"
                      >
                        <dt className="text-sm text-muted-foreground">{metric.label}</dt>
                        <dd className="mt-3 break-words text-2xl font-bold tabular-nums">
                          {metric.value}
                        </dd>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          {metric.hint}
                        </p>
                      </div>
                    ))}
                  </dl>
                  <Panel
                    title="Nilai pesanan dibayar per hari"
                    description="Dikelompokkan menurut tanggal pesanan dibuat, bukan tanggal pembayaran."
                    action={
                      <Button asChild variant="ghost" className="min-h-11">
                        <Link to="/admin/reports">Buka laporan</Link>
                      </Button>
                    }
                  >
                    {report.daily.length ? (
                      <RevenueTrendChart daily={report.daily} />
                    ) : (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        Belum ada pesanan pada periode ini. Pilih periode yang lebih panjang untuk
                        melihat aktivitas sebelumnya.
                      </p>
                    )}
                  </Panel>
                </>
              )}
            </section>
          ) : null}

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-5">
              {can("orders.view") ? (
                <Panel
                  title="Pesanan terbaru"
                  description="Lima pesanan terakhir, termasuk pesanan uji jika ada."
                  action={
                    <Button asChild variant="ghost" className="min-h-11">
                      <Link to="/admin/orders">Semua pesanan</Link>
                    </Button>
                  }
                >
                  {ordersQ.isPending ? (
                    <AdminLoading label="Memuat pesanan terbaru…" />
                  ) : ordersQ.error || !orders || orders.error ? (
                    <AdminError message={orders?.error ?? "Pesanan belum dapat dimuat."} />
                  ) : !orders.items.length ? (
                    <p className="py-6 text-sm text-muted-foreground">
                      Belum ada pesanan masuk. Pesanan pelanggan akan muncul di sini.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {orders.items
                        .slice(0, 5)
                        .map(
                          (order: {
                            id: string;
                            order_number: string;
                            created_at: string;
                            status: string;
                            total: number;
                          }) => (
                            <li key={order.id}>
                              <Link
                                to="/admin/orders/$id"
                                params={{ id: order.id }}
                                className="flex min-h-20 flex-wrap items-center justify-between gap-3 rounded-lg py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-surface"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold">{order.order_number}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {formatDateTime(order.created_at)}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                  <StatusBadge value={order.status} />
                                  <span className="text-sm font-semibold tabular-nums">
                                    {formatRupiah(Number(order.total))}
                                  </span>
                                </div>
                              </Link>
                            </li>
                          ),
                        )}
                    </ul>
                  )}
                </Panel>
              ) : null}
              <Panel
                title="Aktivitas admin terbaru"
                description="Perubahan yang tercatat di audit log."
                action={
                  can("audit_logs.view") ? (
                    <Button asChild variant="ghost" className="min-h-11">
                      <Link to="/admin/audit">Buka audit log</Link>
                    </Button>
                  ) : undefined
                }
              >
                {overview.auditError ? (
                  <AdminError message={overview.auditError} />
                ) : !overview.recentAudits.length ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    Belum ada aktivitas tercatat untuk akses akun ini.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {overview.recentAudits.map(
                      (audit: {
                        id: string;
                        action: string;
                        entity_type: string;
                        created_at: string;
                      }) => (
                        <li
                          key={audit.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-3"
                        >
                          <div className="min-w-0">
                            <p className="break-words text-sm font-medium">{audit.action}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {audit.entity_type}
                            </p>
                          </div>
                          <time
                            dateTime={audit.created_at}
                            className="text-xs text-muted-foreground"
                          >
                            {formatDateTime(audit.created_at)}
                          </time>
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </Panel>
            </div>
            <div className="space-y-5">
              {shortcuts.length ? (
                <Panel title="Akses cepat">
                  <nav aria-label="Akses cepat operasional" className="space-y-1">
                    {shortcuts.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        className="flex min-h-12 items-center gap-3 rounded-lg px-2 text-sm font-medium hover:bg-surface-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <item.icon
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        {item.label}
                      </Link>
                    ))}
                  </nav>
                </Panel>
              ) : null}
              <Panel title="Katalog & pengguna" description="Jumlah saat ini, seluruh periode.">
                <dl className="space-y-5">
                  {[
                    {
                      label: "Produk digital",
                      value: overview.counts.products,
                      hint:
                        overview.counts.publishedProducts === null
                          ? "Jumlah tayang tidak tersedia"
                          : `${overview.counts.publishedProducts} tayang`,
                      icon: Package,
                    },
                    {
                      label: "Layanan akademik",
                      value: overview.counts.services,
                      hint:
                        overview.counts.publishedServices === null
                          ? "Jumlah tayang tidak tersedia"
                          : `${overview.counts.publishedServices} tayang`,
                      icon: ReceiptText,
                    },
                    {
                      label: "Pengguna terdaftar",
                      value: overview.counts.users,
                      hint: "Akun pelanggan dan tim",
                      icon: Users,
                    },
                  ].map((metric) => (
                    <div key={metric.label} className="flex items-start gap-3">
                      <metric.icon
                        className="mt-1 size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <dt className="text-sm font-medium">{metric.label}</dt>
                        <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p>
                      </div>
                      <dd className="text-lg font-semibold tabular-nums">
                        {metric.value === null ? "N/A" : metric.value.toLocaleString("id-ID")}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
