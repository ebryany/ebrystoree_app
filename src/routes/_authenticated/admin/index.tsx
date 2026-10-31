import { useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Package,
  Percent,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  Store,
  Undo2,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AdminError, AdminLoading, ForbiddenState, useAccess } from "@/components/admin/admin-ui";
import { StatusBadge, formatDateTime } from "@/components/admin/tx-ui";
import { RevenueTrendChart } from "@/components/admin/report-charts";
import { Button } from "@/components/ui/button";
import { getAdminOverview } from "@/lib/admin.functions";
import { OrderMonitoringList } from "@/components/ebry/order-monitoring";
import { getTransactionReport, listOrders } from "@/lib/admin-transaction.functions";
import { formatRupiah } from "@/lib/format";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { cn } from "@/lib/utils";

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

/** Ikon antrean berdasarkan tujuan tautan dari getAdminOverview. */
const QUEUE_ICON: Record<string, LucideIcon> = {
  "/admin/payments": CreditCard,
  "/admin/seller": Store,
  "/admin/seller/produk": Package,
  "/admin/refunds": Undo2,
};

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
    <section className="min-w-0 rounded-2xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm font-medium text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
    >
      {children}
      <ChevronRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

function relativeTime(iso: string, now: number) {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d} hari lalu` : formatDateTime(iso);
}

/** Salam sesuai jam lokal browser. */
function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
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
  const now = Date.now();
  const shortcuts = [
    { to: "/admin/orders", label: "Pesanan", permission: "orders.view", icon: ReceiptText },
    { to: "/admin/payments", label: "Pembayaran", permission: "payments.view", icon: CreditCard },
    { to: "/admin/topups", label: "Top up saldo", permission: "payments.view", icon: Wallet },
    { to: "/admin/payouts", label: "Payout seller", permission: "payouts.view", icon: Store },
    { to: "/admin/produk", label: "Produk", permission: "products.view", icon: Package },
    { to: "/admin/pengguna", label: "Pengguna", permission: "users.view", icon: Users },
  ].filter((item) => can(item.permission));

  const queues = overview && !overview.forbidden ? overview.queues : [];
  const pendingTotal = queues.reduce((s, q) => s + (q.count ?? 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{greeting()}</p>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
          {overview && !overview.forbidden ? (
            <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
              {pendingTotal > 0 ? (
                <>
                  <strong className="font-semibold text-foreground">
                    {pendingTotal.toLocaleString("id-ID")} hal
                  </strong>{" "}
                  menunggu tindakan Anda.
                </>
              ) : (
                "Semua antrean bersih."
              )}
            </p>
          ) : null}
        </div>
        <Button variant="outline" className="min-h-11 bg-card" onClick={refresh} disabled={busy}>
          <RefreshCw
            className={cn("size-4", busy && "animate-spin motion-reduce:animate-none")}
            aria-hidden="true"
          />
          {busy ? "Memperbarui…" : "Perbarui"}
        </Button>
      </header>

      {overviewQ.isPending ? (
        <AdminLoading label="Memuat antrean dan ringkasan marketplace…" />
      ) : overviewQ.error ? (
        <AdminError message="Ringkasan belum dapat dimuat. Gunakan Perbarui untuk mencoba kembali." />
      ) : overview?.forbidden ? (
        <ForbiddenState permission={overview.permission} />
      ) : overview ? (
        <>
          {/* Antrean kerja: kartu menyala hanya bila ada yang perlu ditangani. */}
          {queues.length > 0 ? (
            <section aria-labelledby="queue-title">
              <h2 id="queue-title" className="sr-only">
                Perlu ditangani
              </h2>
              <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
                {queues.map((queue) => {
                  const Icon = QUEUE_ICON[queue.to] ?? ArrowUpRight;
                  const hot = (queue.count ?? 0) > 0;
                  return (
                    <li key={queue.to}>
                      <Link
                        to={queue.to}
                        className={cn(
                          "group flex h-full min-h-28 flex-col justify-between gap-3 rounded-2xl border p-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                          hot
                            ? "border-warning/50 bg-warning/10 hover:bg-warning/15"
                            : "border-border bg-card hover:bg-surface-selected",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span
                            className={cn(
                              "grid size-10 place-items-center rounded-xl",
                              hot
                                ? "bg-warning/25 text-warning-foreground"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            <Icon className="size-5" aria-hidden="true" />
                          </span>
                          {hot ? (
                            <ArrowUpRight
                              className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none"
                              aria-hidden="true"
                            />
                          ) : (
                            <CheckCircle2 className="size-4 text-success" aria-label="Bersih" />
                          )}
                        </div>
                        <div>
                          <p className="text-2xl font-bold leading-none tabular-nums">
                            {queue.count === null ? "—" : queue.count.toLocaleString("id-ID")}
                          </p>
                          <p className="mt-1.5 text-sm font-medium">{queue.label}</p>
                          {queue.error ? (
                            <p className="mt-0.5 text-xs text-destructive">{queue.error}</p>
                          ) : null}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {can("orders.view") ? <OrderMonitoringList scope="admin" /> : null}

          {can("reports.view") ? (
            <section aria-labelledby="business-title" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="business-title" className="text-lg font-semibold">
                    Ringkasan transaksi
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Pesanan {days} hari terakhir, tanpa pesanan uji.
                  </p>
                </div>
                <div
                  className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1"
                  role="radiogroup"
                  aria-label="Periode ringkasan"
                >
                  {[7, 30, 90].map((period) => (
                    <button
                      key={period}
                      type="button"
                      role="radio"
                      aria-checked={days === period}
                      onClick={() => setDays(period)}
                      className={cn(
                        "min-h-11 rounded-lg px-3 text-sm font-medium tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                        days === period
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {period} hari
                    </button>
                  ))}
                </div>
              </div>
              {reportQ.isPending ? (
                <AdminLoading label="Memuat ringkasan transaksi…" />
              ) : reportQ.error || !report ? (
                <AdminError message="Ringkasan transaksi belum dapat dimuat. Gunakan Perbarui untuk mencoba kembali." />
              ) : (
                <>
                  <dl className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
                    {[
                      {
                        label: "Nilai pesanan dibayar",
                        value: formatRupiah(report.revenue),
                        hint: "Pesanan dengan pembayaran tercatat",
                        icon: Wallet,
                      },
                      {
                        label: "Pesanan masuk",
                        value: report.totalOrders.toLocaleString("id-ID"),
                        hint: `${report.paidOrders.toLocaleString("id-ID")} sudah dibayar`,
                        icon: ShoppingBag,
                      },
                      {
                        label: "Setelah refund",
                        value: formatRupiah(report.netRevenue),
                        hint: "Dikurangi refund selesai",
                        icon: Undo2,
                      },
                      {
                        label: "Rasio dibayar",
                        value: `${report.conversion}%`,
                        hint: "Dibayar ÷ pesanan masuk",
                        icon: Percent,
                      },
                    ].map((metric) => (
                      <div
                        key={metric.label}
                        className="min-w-0 rounded-2xl border border-border bg-card p-4"
                      >
                        <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                          <metric.icon className="size-4 shrink-0" aria-hidden="true" />
                          <span className="truncate">{metric.label}</span>
                        </dt>
                        <dd className="mt-2 break-words text-xl font-bold tabular-nums sm:text-2xl">
                          {metric.value}
                        </dd>
                        <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p>
                      </div>
                    ))}
                  </dl>
                  <Panel
                    title="Nilai pesanan dibayar per hari"
                    description="Menurut tanggal pesanan dibuat."
                    action={<PanelLink to="/admin/reports">Laporan</PanelLink>}
                  >
                    {report.daily.length ? (
                      <RevenueTrendChart daily={report.daily} />
                    ) : (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        Belum ada pesanan pada periode ini. Pilih periode yang lebih panjang.
                      </p>
                    )}
                  </Panel>
                </>
              )}
            </section>
          ) : null}

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-5">
              {can("orders.view") ? (
                <Panel
                  title="Pesanan terbaru"
                  action={<PanelLink to="/admin/orders">Semua</PanelLink>}
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
                    <ul className="-mx-2 -my-1">
                      {orders.items.slice(0, 5).map((order: any) => (
                        <li key={order.id}>
                          <Link
                            to="/admin/orders/$id"
                            params={{ id: order.id }}
                            className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-selected focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            <div className="min-w-0">
                              <p className="break-all font-mono text-xs font-semibold">
                                {order.order_number}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {order.customer?.full_name ?? order.customer?.email ?? "Pembeli"} ·{" "}
                                {relativeTime(order.created_at, now)}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <StatusBadge value={order.status} />
                              <span className="text-sm font-semibold tabular-nums">
                                {formatRupiah(Number(order.total))}
                              </span>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              ) : null}
            </div>

            <div className="min-w-0 space-y-5">
              {shortcuts.length ? (
                <Panel title="Akses cepat">
                  <nav
                    aria-label="Akses cepat operasional"
                    className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2"
                  >
                    {shortcuts.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        className="flex min-h-16 flex-col items-start justify-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:border-accent/50 hover:bg-surface-selected focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <item.icon className="size-4 text-accent" aria-hidden="true" />
                        {item.label}
                      </Link>
                    ))}
                  </nav>
                </Panel>
              ) : null}

              <Panel title="Katalog & pengguna">
                <dl className="grid grid-cols-3 gap-2 xl:grid-cols-1">
                  {[
                    {
                      label: "Produk digital",
                      value: overview.counts.products,
                      hint:
                        overview.counts.publishedProducts === null
                          ? null
                          : `${overview.counts.publishedProducts} tayang`,
                      icon: Package,
                    },
                    {
                      label: "Layanan akademik",
                      value: overview.counts.services,
                      hint:
                        overview.counts.publishedServices === null
                          ? null
                          : `${overview.counts.publishedServices} tayang`,
                      icon: ReceiptText,
                    },
                    {
                      label: "Pengguna",
                      value: overview.counts.users,
                      hint: "Pelanggan & tim",
                      icon: Users,
                    },
                  ].map((metric) => (
                    <div
                      key={metric.label}
                      className="flex min-w-0 flex-col gap-1 rounded-xl bg-muted/50 p-3 xl:flex-row xl:items-center xl:gap-3"
                    >
                      <metric.icon
                        className="hidden size-4 shrink-0 text-muted-foreground xl:block"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 xl:flex-1">
                        <dt className="truncate text-xs font-medium xl:text-sm">{metric.label}</dt>
                        {metric.hint ? (
                          <p className="truncate text-[11px] text-muted-foreground">
                            {metric.hint}
                          </p>
                        ) : null}
                      </div>
                      <dd className="order-first text-lg font-bold tabular-nums xl:order-none">
                        {metric.value === null ? "—" : metric.value.toLocaleString("id-ID")}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Panel>

              <Panel
                title="Aktivitas admin"
                action={
                  can("audit_logs.view") ? (
                    <PanelLink to="/admin/audit">Audit log</PanelLink>
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
                  <ol className="relative space-y-3 before:absolute before:bottom-1 before:left-[7px] before:top-1 before:w-px before:bg-border">
                    {overview.recentAudits.map(
                      (audit: {
                        id: string;
                        action: string;
                        entity_type: string;
                        created_at: string;
                      }) => (
                        <li key={audit.id} className="relative flex gap-3 pl-0">
                          <span
                            className="relative z-10 mt-1.5 grid size-[15px] shrink-0 place-items-center rounded-full border border-border bg-card"
                            aria-hidden="true"
                          >
                            <span className="size-1.5 rounded-full bg-accent" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="break-words font-mono text-xs font-medium">
                              {audit.action}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {audit.entity_type} ·{" "}
                              <time
                                dateTime={audit.created_at}
                                title={formatDateTime(audit.created_at)}
                              >
                                {relativeTime(audit.created_at, now)}
                              </time>
                            </p>
                          </div>
                        </li>
                      ),
                    )}
                  </ol>
                )}
              </Panel>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
