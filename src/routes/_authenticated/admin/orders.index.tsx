import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, useReducedMotion } from "motion/react";
import { ChevronDown, Download, GraduationCap, Package, Search, Store, Wallet } from "lucide-react";
import { toast } from "sonner";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  Pager,
  useCan,
} from "@/components/admin/admin-ui";
import { StoreChip, StatusBadge, formatDateTime } from "@/components/admin/tx-ui";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listOrders } from "@/lib/admin-transaction.functions";
import {
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/transaction-labels";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/orders/")({
  head: () => ({
    meta: [
      { title: "Daftar Order — Admin Ebrystore" },
      {
        name: "description",
        content:
          "Kelola order produk digital, jasa seller, dan pesanan akademik Ebrystore dalam satu papan kerja.",
      },
      { property: "og:title", content: "Daftar Order — Admin Ebrystore" },
      {
        property: "og:description",
        content: "Pencarian, filter, dan tindak lanjut order Ebrystore.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminOrders,
});

const PAGE_SIZE = 15;

/** Ikon jenis order: penanda cepat saat memindai daftar. */
const TYPE_ICON: Record<string, typeof Package> = {
  digital_product: Package,
  service: GraduationCap,
  marketplace_service: Store,
};

/**
 * Satu langkah berikutnya yang bisa dibaca admin dari baris tertutup.
 * Mengembalikan null bila order tidak menunggu tindakan.
 */
function nextAction(order: any): { label: string; tone: "action" | "waiting" | "danger" } | null {
  const paymentStatus = order.payment?.status ?? null;
  if (order.status === "payment_under_review" || paymentStatus === "waiting_verification") {
    return { label: "Verifikasi pembayaran", tone: "action" };
  }
  if (order.status === "awaiting_payment") {
    return { label: "Menunggu pembayaran pembeli", tone: "waiting" };
  }
  if (["refund_requested", "refund_processing"].includes(order.status)) {
    return { label: "Tinjau refund", tone: "danger" };
  }
  if (order.status === "disputed") {
    return { label: "Sengketa perlu keputusan", tone: "danger" };
  }
  if (order.order_type === "marketplace_service" && order.status === "paid") {
    return { label: "Pantau pengerjaan jasa", tone: "waiting" };
  }
  if (order.status === "completed") return null;
  return null;
}

function AdminOrders() {
  const canView = useCan("orders.view");
  const canExport = useCan("reports.export");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "amount_desc" | "amount_asc">("newest");
  const [page, setPage] = useState(1);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const reduced = useReducedMotion();

  const fetchOrders = useServerFn(listOrders);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-orders", search, status, type, paymentStatus, from, to, sort, page],
    queryFn: () =>
      fetchOrders({ data: { search, status, type, paymentStatus, from, to, sort, page } }),
  });

  useRealtimeRefresh({
    channel: "admin-orders",
    tables: ["orders", "payments", "order_status_histories"],
    keys: [["admin-orders"]],
    enabled: canView,
  });

  // Ringkasan kerja dihitung dari data halaman ini; tidak ada angka karangan.
  // Dihitung sebelum early return supaya urutan hook selalu sama.
  const items = useMemo<any[]>(() => (data as any)?.items ?? [], [data]);

  const summary = useMemo(() => {
    const needsVerification = items.filter(
      (o: any) =>
        o.status === "payment_under_review" || o.payment?.status === "waiting_verification",
    ).length;
    const inProgress = items.filter((o: any) =>
      ["paid", "waiting_assignment", "assigned", "in_progress", "queued"].includes(o.status),
    ).length;
    const refundActive = items.filter((o: any) =>
      ["refund_requested", "refund_processing", "disputed"].includes(o.status),
    ).length;
    const completed = items.filter((o: any) => o.status === "completed").length;
    return { needsVerification, inProgress, refundActive, completed };
  }, [items]);

  if (!canView) return <ForbiddenState permission="orders.view" />;
  if ((data as any)?.forbidden) return <ForbiddenState permission={(data as any).permission} />;

  const exportCsv = () => {
    if (!items.length) return toast.error("Tidak ada data untuk diekspor.");
    const header = ["nomor", "customer", "toko", "jenis", "status", "total", "dibuat"];
    const rows = items.map((o: any) => [
      o.order_number,
      o.customer?.email ?? o.user_id,
      o.storeName ?? "Platform",
      ORDER_TYPE_LABEL[o.order_type] ?? o.order_type,
      ORDER_STATUS_LABEL[o.status] ?? o.status,
      o.total,
      o.created_at,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c: unknown) => `"${String(c ?? "")}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-halaman-${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV halaman ini diunduh.");
  };

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Order"
        crumb="Order"
        description="Papan kerja order: produk digital, jasa seller, dan pesanan akademik."
        actions={
          canExport ? (
            <Button variant="outline" size="sm" className="min-h-10" onClick={exportCsv}>
              <Download className="size-4" aria-hidden="true" /> Ekspor CSV
            </Button>
          ) : null
        }
      />

      {/* Ringkasan kerja: angka yang membantu memutuskan, bukan hiasan. */}
      {data ? (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["Perlu verifikasi", summary.needsVerification, "text-warning-foreground"],
              ["Sedang berjalan", summary.inProgress, "text-accent"],
              ["Refund/sengketa", summary.refundActive, "text-destructive"],
              ["Selesai (halaman ini)", summary.completed, "text-success"],
            ] as const
          ).map(([label, value, tone]) => (
            <div key={label} className="rounded-xl border border-border bg-card px-3 py-2.5">
              <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
              <dd className={cn("mt-0.5 text-lg font-bold tabular-nums", tone)}>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {/* Filter utama: pencarian dan dua penyaring yang paling sering dipakai. */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Label htmlFor="order-search">Cari nomor order</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="order-search"
                value={search}
                placeholder="EBS-…"
                className="min-h-11 pl-9"
                onChange={(e) => reset(() => setSearch(e.target.value))}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="order-type">Jenis order</Label>
            <Select value={type} onValueChange={(v) => reset(() => setType(v))}>
              <SelectTrigger id="order-type" className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua jenis</SelectItem>
                <SelectItem value="digital_product">Produk digital</SelectItem>
                <SelectItem value="marketplace_service">Jasa seller</SelectItem>
                <SelectItem value="service">Pesanan akademik</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="order-status">Status order</Label>
            <Select value={status} onValueChange={(v) => reset(() => setStatus(v))}>
              <SelectTrigger id="order-status" className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAdvancedOpen((prev) => !prev)}
          aria-expanded={advancedOpen}
          className="flex min-h-10 items-center gap-1.5 rounded-lg text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronDown
            className={cn("size-4 transition-transform", advancedOpen && "rotate-180")}
            aria-hidden="true"
          />
          Filter lanjutan
        </button>

        {advancedOpen ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="order-payment">Status pembayaran</Label>
              <Select value={paymentStatus} onValueChange={(v) => reset(() => setPaymentStatus(v))}>
                <SelectTrigger id="order-payment" className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua pembayaran</SelectItem>
                  {Object.entries(PAYMENT_STATUS_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="order-from">Dari tanggal</Label>
              <Input
                id="order-from"
                type="date"
                value={from}
                className="min-h-11"
                onChange={(e) => reset(() => setFrom(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="order-to">Sampai tanggal</Label>
              <Input
                id="order-to"
                type="date"
                value={to}
                className="min-h-11"
                onChange={(e) => reset(() => setTo(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="order-sort">Urutkan</Label>
              <Select value={sort} onValueChange={(v) => reset(() => setSort(v as typeof sort))}>
                <SelectTrigger id="order-sort" className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Terbaru</SelectItem>
                  <SelectItem value="oldest">Terlama</SelectItem>
                  <SelectItem value="amount_desc">Nilai tertinggi</SelectItem>
                  <SelectItem value="amount_asc">Nilai terendah</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
      </div>

      {isPending ? (
        <AdminLoading />
      ) : error || (data as any)?.error ? (
        <AdminError message={(data as any)?.error ?? "Data order tidak dapat dimuat."} />
      ) : !items.length ? (
        <EmptyRow message="Belum ada order yang cocok dengan filter ini." />
      ) : (
        <>
          <ul aria-label="Daftar order" className="space-y-2">
            {items.map((o: any, index: number) => {
              const Icon = TYPE_ICON[o.order_type] ?? Package;
              const next = nextAction(o);
              const initial =
                String(o.customer?.full_name ?? o.customer?.email ?? "?")
                  .trim()
                  .charAt(0)
                  .toUpperCase() || "?";
              return (
                <motion.li
                  key={o.id}
                  initial={reduced ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.16,
                    ease: [0.16, 1, 0.3, 1],
                    delay: reduced ? 0 : index * 0.02,
                  }}
                >
                  <Link
                    to="/admin/orders/$id"
                    params={{ id: o.id }}
                    className={cn(
                      "block min-w-0 rounded-xl border bg-card px-4 py-3.5 transition-colors hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                      next?.tone === "action"
                        ? "border-warning/50"
                        : next?.tone === "danger"
                          ? "border-destructive/40"
                          : "border-border",
                    )}
                    aria-label={`Order ${o.order_number}`}
                  >
                    {/* Baris atas: identitas dan nilai. */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-surface-selected text-accent">
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="break-all font-mono text-xs font-semibold">
                            {o.order_number}
                          </p>
                          <p className="mt-0.5 truncate text-sm font-medium">
                            {ORDER_TYPE_LABEL[o.order_type] ?? o.order_type}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <StatusBadge value={o.status} />
                        <span className="text-sm font-bold tabular-nums text-price">
                          {formatRupiah(Number(o.total))}
                        </span>
                      </div>
                    </div>

                    {/* Baris tengah: pembeli, toko, waktu. */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="grid size-5 place-items-center rounded-full bg-surface-selected text-[10px] font-bold text-accent"
                          aria-hidden="true"
                        >
                          {initial}
                        </span>
                        {o.customer?.full_name ?? o.customer?.email ?? "Pembeli"}
                      </span>
                      <StoreChip name={o.storeName} />
                      <span className="tabular-nums">{formatDateTime(o.created_at)}</span>
                    </div>

                    {/* Baris bawah: langkah berikutnya, bila ada. */}
                    {next ? (
                      <p
                        className={cn(
                          "mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          next.tone === "action"
                            ? "border-warning/50 bg-warning/10 text-warning-foreground"
                            : next.tone === "danger"
                              ? "border-destructive/40 bg-destructive/5 text-destructive"
                              : "border-border bg-surface text-muted-foreground",
                        )}
                      >
                        {next.label}
                      </p>
                    ) : null}
                  </Link>
                </motion.li>
              );
            })}
          </ul>
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={(data as any)?.total ?? 0}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}
