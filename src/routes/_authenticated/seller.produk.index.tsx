import { useDeferredValue, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Package, PackagePlus, Search, X } from "lucide-react";

import { AdminError } from "@/components/admin/admin-ui";
import {
  SellerAlertBanner,
  SellerFilterTabs,
  SellerMobileSegment,
  SellerPageHeader,
  SellerSectionCard,
} from "@/components/seller/seller-ui";
import { CardSkeleton, EmptyState } from "@/components/ebry/states";
import { StatusPill } from "@/components/ebry/status";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRupiah, priceDetails } from "@/lib/format";
import { listMyStoreProducts, getMyInventorySummary } from "@/lib/seller.functions";
import { cn, optimizedMediaUrl } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/seller/produk/")({
  head: () => ({
    meta: [
      { title: "Produk Toko | Ebrystore" },
      { name: "description", content: "Kelola produk digital toko Anda." },
      { property: "og:title", content: "Produk Toko | Ebrystore" },
      { name: "og:description", content: "Kelola produk toko Anda." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SellerProducts,
});

// StatusPill menurunkan warna dari nilai status mentah (pending/approved/rejected).
const MOD_LABEL: Record<string, string> = {
  pending: "Menunggu moderasi",
  approved: "Disetujui",
  rejected: "Ditolak",
};

type Product = {
  id: string;
  name: string;
  price: number;
  discount_price: number | null;
  status: string;
  moderation_status: string;
  moderation_note: string | null;
  thumbnail_url: string | null;
  delivery_mode: string | null;
  available_stock: number | null;
};

const TABS = [
  { key: "all", label: "Semua", match: () => true },
  { key: "published", label: "Tayang", match: (p: Product) => p.status === "published" },
  { key: "review", label: "Moderasi", match: (p: Product) => p.moderation_status === "pending" },
  {
    key: "fix",
    label: "Perlu perbaikan",
    match: (p: Product) => p.moderation_status === "rejected",
  },
  {
    key: "stock",
    label: "Stok habis",
    match: (p: Product) => p.delivery_mode !== "shared" && Number(p.available_stock ?? 0) === 0,
  },
  { key: "draft", label: "Draf & arsip", match: (p: Product) => p.status !== "published" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function stockLabel(p: Product) {
  if ((p.delivery_mode ?? "shared") === "shared") return null;
  const stock = Number(p.available_stock ?? 0);
  if (stock === 0) return { text: "Stok habis", tone: "text-destructive font-semibold" };
  if (stock <= 5) return { text: `Stok tersisa ${stock}`, tone: "text-warning-foreground font-medium" };
  return { text: `Stok ${stock}`, tone: "text-muted-foreground" };
}

function SellerProducts() {
  const fetchProducts = useServerFn(listMyStoreProducts);
  const fetchInventory = useServerFn(getMyInventorySummary);
  const [tab, setTab] = useState<TabKey>("all");
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);

  const { data, isPending, error } = useQuery({
    queryKey: ["my-store-products"],
    queryFn: () => fetchProducts({}),
  });
  const inventoryQ = useQuery({
    queryKey: ["my-inventory-summary"],
    queryFn: () => fetchInventory({}),
  });
  // RLS digital_products mengirim hanya baris milik toko sendiri, termasuk keputusan moderasi.
  useRealtimeRefresh({
    channel: "seller-products",
    tables: ["digital_products"],
    keys: [["my-store-products"], ["my-inventory-summary"]],
  });

  const items = useMemo(() => (data?.items ?? []) as Product[], [data?.items]);
  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.key, items.filter(t.match).length])),
    [items],
  ) as Record<TabKey, number>;
  const visible = useMemo(() => {
    const term = deferredQ.trim().toLowerCase();
    const match = TABS.find((t) => t.key === tab)!.match;
    return items.filter((p) => match(p) && (!term || p.name.toLowerCase().includes(term)));
  }, [items, tab, deferredQ]);

  const inv = (
    inventoryQ.data as { summary?: { low_stock: number; threshold: number } } | undefined
  )?.summary;

  return (
    <div className="space-y-4 sm:space-y-5">
      <SellerMobileSegment
        ariaLabel="Pilih katalog toko"
        items={[
          { to: "/seller/produk", label: "Produk Digital" },
          { to: "/seller/jasa", label: "Jasa Saya" },
        ]}
      />

      <SellerPageHeader
        title="Produk Digital"
        description={`${items.length.toLocaleString("id-ID")} total produk · ${counts.published.toLocaleString("id-ID")} aktif tayang di etalase toko Anda.`}
        actions={
          <Button asChild className="min-h-11">
            <Link to="/seller/produk/baru">
              <PackagePlus className="size-4" aria-hidden="true" />
              Tambah produk
            </Link>
          </Button>
        }
      />

      {counts.stock > 0 || (inv?.low_stock ?? 0) > 0 ? (
        <SellerAlertBanner tone="warning" title="Perhatian ketersediaan stok">
          {counts.stock > 0 ? (
            <strong className="text-foreground">{counts.stock} produk stok habis. </strong>
          ) : null}
          {(inv?.low_stock ?? 0) > 0
            ? `${inv!.low_stock} produk stok rendah (<= ${inv!.threshold}). `
            : null}
          Tambahkan file atau stok kode baru agar produk tetap bisa dibeli.
        </SellerAlertBanner>
      ) : null}

      <SellerSectionCard bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-border p-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
          <SellerFilterTabs<TabKey>
            ariaLabel="Filter status produk"
            value={tab}
            onChange={setTab}
            items={TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key] }))}
          />
          <label className="relative block shrink-0 lg:w-64">
            <span className="sr-only">Cari produk</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama produk..."
              className="min-h-11 pl-9 pr-9"
            />
            {q ? (
              <button
                type="button"
                aria-label="Hapus pencarian"
                onClick={() => setQ("")}
                className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </label>
        </div>

        <div className="p-3 sm:p-4">
          {isPending ? (
            <CardSkeleton rows={2} />
          ) : error || data?.error ? (
            <AdminError message={data?.error ?? undefined} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={PackagePlus}
              className="border-0"
              title={items.length === 0 ? "Belum ada produk" : "Tidak ada produk di filter ini"}
              description={
                items.length === 0
                  ? "Tambahkan produk digital pertama Anda. Produk tayang setelah lolos moderasi."
                  : "Coba pindah ke tab lain atau ubah kata kunci pencarian."
              }
              action={
                items.length === 0 ? (
                  <Button asChild className="min-h-11">
                    <Link to="/seller/produk/baru">Tambah produk</Link>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => {
                      setTab("all");
                      setQ("");
                    }}
                  >
                    Tampilkan semua produk
                  </Button>
                )
              }
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {visible.map((p, index) => (
                <ProductCard key={p.id} p={p} index={index} />
              ))}
            </ul>
          )}
        </div>
      </SellerSectionCard>
    </div>
  );
}

function ProductCard({ p, index }: { p: Product; index: number }) {
  const modLabel = MOD_LABEL[p.moderation_status] ?? p.moderation_status;
  const { price, hasDiscount } = priceDetails(p.price, p.discount_price);
  const stock = stockLabel(p);
  const statusText =
    p.status === "published" ? "Tayang" : p.status === "archived" ? "Diarsipkan" : "Draf";

  return (
    <li className={cn("flex", index >= 4 && "cv-card")}>
      {/* Reflow mobile (< sm): kartu baris horizontal padat; tablet/desktop (sm+): kartu grid visual. */}
      <Link
        to="/seller/produk/$id"
        params={{ id: p.id }}
        className="group flex w-full flex-row items-stretch gap-3 overflow-hidden rounded-[var(--radius-panel)] border border-border bg-card p-3 transition-[border-color,box-shadow] hover:border-accent/50 hover:shadow-[var(--elev-2)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-col sm:gap-0 sm:p-0"
      >
        <span className="relative block size-20 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-selected sm:aspect-[4/3] sm:size-auto sm:w-full sm:rounded-none sm:border-0 sm:border-b">
          {p.thumbnail_url ? (
            <img
              src={optimizedMediaUrl(p.thumbnail_url, 480)}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
            />
          ) : (
            <span className="grid size-full place-items-center text-accent">
              <Package className="size-6 sm:size-8" aria-hidden="true" />
            </span>
          )}
          <span
            className={cn(
              "absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold sm:left-2.5 sm:top-2.5 sm:rounded-md sm:px-2 sm:text-[11px]",
              p.status === "published"
                ? "bg-success text-success-foreground"
                : "bg-foreground/80 text-background",
            )}
          >
            {statusText}
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1 sm:gap-1.5 sm:p-3.5">
          <span className="line-clamp-2 text-sm font-semibold leading-snug text-foreground sm:min-h-[2.5rem]">
            {p.name}
          </span>
          <span className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-sm font-bold tabular-nums text-price">{formatRupiah(price)}</span>
            {hasDiscount ? (
              <span className="text-[11px] tabular-nums text-muted-foreground line-through">
                {formatRupiah(Number(p.price))}
              </span>
            ) : null}
          </span>
          {stock ? <span className={cn("text-xs", stock.tone)}>{stock.text}</span> : null}
          <span className="mt-auto flex items-center justify-between gap-2 pt-1 sm:pt-2">
            <StatusPill
              value={p.moderation_status}
              kind="raw"
              label={modLabel}
              className="px-2 py-0.5 text-[11px]"
            />
            <span className="shrink-0 text-xs font-semibold text-accent opacity-85 group-hover:opacity-100">
              Kelola
            </span>
          </span>
          {p.moderation_status === "rejected" && p.moderation_note ? (
            <span className="line-clamp-2 rounded-md bg-destructive/8 px-2 py-1 text-[11px] text-destructive">
              {p.moderation_note}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
