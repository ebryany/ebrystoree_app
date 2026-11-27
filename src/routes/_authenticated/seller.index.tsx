import { lazy, Suspense, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  BriefcaseBusiness,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  MessageSquare,
  Package,
  PackagePlus,
  PackageX,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Star,
  Wallet,
  type LucideIcon,
} from "lucide-react";

const LazySellerTrendChart = lazy(() => import("@/components/seller/seller-trend-chart"));

import { AdminError, AdminLoading } from "@/components/admin/admin-ui";
import {
  SellerKpiCard,
  SellerKpiGrid,
  SellerPageHeader,
  SellerSectionCard,
} from "@/components/seller/seller-ui";
import { StatusPill } from "@/components/ebry/status";
import { Button } from "@/components/ui/button";
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
      { title: "Ringkasan Toko | Ebrystore" },
      { name: "description", content: "Ringkasan performa dan penjualan toko digital Anda." },
      { property: "og:title", content: "Ringkasan Toko | Ebrystore" },
      { property: "og:description", content: "Pantau penjualan, saldo, dan produk toko Anda." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SellerOverview,
});

/** Grafik area 30 hari. Chunk Recharts diunduh dinamis setelah mount agar SSR ringan. */
function TrendChart({ data }: { data: Array<{ date: string; total: number }> }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const placeholder = (
    <div className="h-[240px] animate-pulse rounded-lg bg-muted/50 motion-reduce:animate-none" />
  );
  if (!mounted) return placeholder;

  return (
    <Suspense fallback={placeholder}>
      <LazySellerTrendChart data={data} />
    </Suspense>
  );
}

type TodoItem = {
  label: string;
  value: number | null;
  icon: LucideIcon;
  to: string;
  /** Angka > 0 menandakan antrean kerja yang perlu segera ditindak seller. */
  urgent?: boolean;
};

function TodoGrid({ items }: { items: TodoItem[] }) {
  return (
    <SellerSectionCard
      title="Antrean perlu diproses"
      description="Prioritaskan item bernilai lebih dari 0 agar pengiriman dan layanan tetap lancar."
      headingId="todo-heading"
      bodyClassName="p-0"
    >
      <ul className="seller-queue-grid" data-cols="6">
        {items.map((t) => {
          const active = t.urgent && (t.value ?? 0) > 0;
          return (
            <li key={t.label} className="bg-card">
              <Link
                to={t.to}
                className={cn(
                  "group flex h-full min-h-[78px] flex-col justify-between gap-2 p-3 transition-colors hover:bg-surface active:bg-surface sm:min-h-[96px] sm:gap-2.5 sm:p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active && "bg-destructive/[0.03] hover:bg-destructive/[0.06]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-xl font-bold leading-none tabular-nums sm:text-2xl",
                      active ? "text-destructive" : "text-foreground",
                    )}
                  >
                    {t.value ?? "-"}
                  </span>
                  <t.icon
                    className={cn(
                      "size-4 shrink-0",
                      active ? "text-destructive" : "text-muted-foreground/70 group-hover:text-accent",
                    )}
                    aria-hidden="true"
                  />
                </div>
                <span className="line-clamp-2 text-xs font-medium leading-snug text-muted-foreground group-hover:text-foreground">
                  {t.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </SellerSectionCard>
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
  });
  // Query key sama dengan halaman masing-masing supaya cache dipakai bersama.
  const storeQ = useQuery({
    queryKey: ["my-store"],
    queryFn: () => fetchStore({}),
    staleTime: 5 * 60_000,
  });
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

  if (isPending) return <AdminLoading label="Memuat ringkasan..." />;
  if (error || data?.error) return <AdminError message="Ringkasan tidak dapat dimuat." />;

  const s = data?.summary;
  if (!s) return <AdminError message="Ringkasan toko tidak tersedia." />;

  const store = (storeQ.data as { store?: { name?: string; slug?: string; status?: string } } | undefined)
    ?.store;
  const counts = monitoringQ.data?.counts;
  const serviceCounts = serviceQ.data ? countServiceOrders(serviceQ.data.items ?? []) : null;
  const inquiries = ((inquiriesQ.data as { items?: Array<{ status: string }> } | undefined)?.items ??
    null) as Array<{ status: string }> | null;
  const inv = (inventoryQ.data as { summary?: { out_of_stock: number } } | undefined)?.summary;
  const openChats = inquiries ? inquiries.filter((i) => i.status === "open").length : null;

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
      value: openChats,
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

  const urgentTotal = todos
    .filter((t) => t.urgent)
    .reduce((sum, item) => sum + Number(item.value ?? 0), 0);
  const trendTotal30d = s.trend.reduce((sum, d) => sum + d.total, 0);
  const activeSaleDays = s.trend.filter((d) => d.total > 0).length;

  const quickActions: Array<{ label: string; hint: string; icon: LucideIcon; to: string }> = [
    { label: "Tambah produk", hint: "File atau kode digital", icon: PackagePlus, to: "/seller/produk/baru" },
    { label: "Kelola jasa", hint: "Buat atau edit jasa", icon: BriefcaseBusiness, to: "/seller/jasa" },
    { label: "Tarik saldo", hint: "Pencairan ke rekening", icon: Wallet, to: "/seller/keuangan" },
    { label: "Ulasan toko", hint: "Pantau rating pembeli", icon: Star, to: "/seller/performa" },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <SellerPageHeader
        title="Ringkasan Toko"
        description="Pantau antrean operasional, arus pendapatan yang dilepas, dan kesehatan katalog toko Anda."
        badge={
          store?.status === "active" ? (
            urgentTotal > 0 ? (
              <StatusPill
                value="waiting"
                kind="raw"
                label={`${urgentTotal} item perlu ditindak`}
              />
            ) : (
              <StatusPill value="success" kind="raw" label="Antrean terkendali" />
            )
          ) : null
        }
        actions={
          store?.status === "active" ? (
            <div className="hidden items-center gap-2 lg:flex">
              {store.slug ? (
                <Button asChild variant="outline" className="min-h-11">
                  <Link to="/toko/$slug" params={{ slug: store.slug }}>
                    <ExternalLink className="size-4" aria-hidden="true" />
                    Etalase
                  </Link>
                </Button>
              ) : null}
              <Button asChild className="min-h-11">
                <Link to="/seller/produk/baru">
                  <PackagePlus className="size-4" aria-hidden="true" />
                  Tambah produk
                </Link>
              </Button>
            </div>
          ) : null
        }
      />

      <SellerKpiGrid>
        <SellerKpiCard
          icon={Wallet}
          label="Saldo tersedia"
          value={formatRupiah(s.balance)}
          hint={s.held > 0 ? `Ditahan ${formatRupiah(s.held)}` : "Siap ditarik ke rekening"}
          to="/seller/keuangan"
        />
        <SellerKpiCard
          icon={ShoppingBag}
          label="Pendapatan dilepas"
          value={formatRupiah(s.salesTotal)}
          hint={`${s.soldCount.toLocaleString("id-ID")} transaksi terjual`}
          tone="success"
        />
        <SellerKpiCard
          icon={Package}
          label="Produk tayang"
          value={`${s.productPublished}/${s.productTotal}`}
          hint={s.productPending > 0 ? `${s.productPending} menunggu moderasi` : "Semua produk terproses"}
          to="/seller/produk"
        />
        <SellerKpiCard
          icon={Star}
          label="Rating toko"
          value={s.ratingCount > 0 ? `${s.rating} / 5` : "Belum ada"}
          hint={s.ratingCount > 0 ? `Dari ${s.ratingCount} ulasan pembeli` : "Menunggu ulasan pertama"}
          tone="warning"
          to="/seller/performa"
        />
      </SellerKpiGrid>

      <TodoGrid items={todos} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <SellerSectionCard
          title="Pendapatan 30 hari terakhir"
          description="Menghitung pendapatan yang sudah dilepas ke saldo toko, bukan dana ditahan."
          icon={BarChart3}
          headingId="tren-heading"
          action={
            <div className="text-right">
              <p className="text-[11px] font-medium text-muted-foreground">
                Total 30 hari ({activeSaleDays} hari aktif)
              </p>
              <p className="text-base font-bold tabular-nums text-foreground">
                {formatRupiah(trendTotal30d)}
              </p>
            </div>
          }
        >
          <TrendChart data={s.trend} />
        </SellerSectionCard>

        <div className="space-y-5">
          <SellerSectionCard
            title="Aksi cepat"
            headingId="aksi-heading"
            bodyClassName="p-2.5"
          >
            <ul className="grid grid-cols-2 gap-1.5">
              {quickActions.map((a) => (
                <li key={a.label}>
                  <Link
                    to={a.to}
                    className="flex min-h-[82px] flex-col justify-between gap-2 rounded-lg border border-transparent p-2.5 text-left transition-colors hover:border-border hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="grid size-8 place-items-center rounded-lg bg-surface-selected text-accent">
                      <a.icon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">{a.label}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{a.hint}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </SellerSectionCard>

          <SellerSectionCard
            title="Dana & inventaris"
            icon={ShieldCheck}
            headingId="dana-heading"
            bodyClassName="p-0"
            footer={
              <Link
                to="/seller/keuangan"
                className="flex min-h-11 items-center justify-between px-4 text-sm font-semibold text-accent transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                Buka saldo &amp; penarikan
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            }
          >
            <dl className="divide-y divide-border text-sm">
              {[
                ["Ditahan (menunggu penerimaan)", formatRupiah(s.held)],
                ["Cadangan refund", formatRupiah(s.reserved)],
                ["Total produk", s.productTotal.toLocaleString("id-ID")],
                ["Menunggu moderasi", s.productPending.toLocaleString("id-ID")],
                ["Total terjual", s.soldCount.toLocaleString("id-ID")],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <dt className="text-xs text-muted-foreground sm:text-sm">{label}</dt>
                  <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </SellerSectionCard>
        </div>
      </div>
    </div>
  );
}
