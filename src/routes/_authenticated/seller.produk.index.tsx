import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Package, PackagePlus, Search } from "lucide-react";

import { AdminError } from "@/components/admin/admin-ui";
import { CardSkeleton, EmptyState } from "@/components/ebry/states";
import { StatusPill } from "@/components/ebry/status";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRupiah } from "@/lib/format";
import { listMyStoreProducts, getMyInventorySummary } from "@/lib/seller.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/seller/produk/")({
  head: () => ({
    meta: [
      { title: "Produk Toko — Ebrystore" },
      { name: "description", content: "Kelola produk digital toko Anda." },
      { property: "og:title", content: "Produk Toko — Ebrystore" },
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
  if (stock === 0) return { text: "Stok habis", tone: "text-destructive" };
  if (stock <= 5) return { text: `Stok ${stock}`, tone: "text-warning-foreground" };
  return { text: `Stok ${stock}`, tone: "text-muted-foreground" };
}

function SellerProducts() {
  const fetchProducts = useServerFn(listMyStoreProducts);
  const fetchInventory = useServerFn(getMyInventorySummary);
  const [tab, setTab] = useState<TabKey>("all");
  const [q, setQ] = useState("");

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

  const items = (data?.items ?? []) as Product[];
  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.key, items.filter(t.match).length])),
    [items],
  ) as Record<TabKey, number>;
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    const match = TABS.find((t) => t.key === tab)!.match;
    return items.filter((p) => match(p) && (!term || p.name.toLowerCase().includes(term)));
  }, [items, tab, q]);

  const inv = (inventoryQ.data as { summary?: { low_stock: number; threshold: number } } | undefined)
    ?.summary;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold sm:text-xl">Produk</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length} produk · {counts.published} tayang
          </p>
        </div>
        <Button asChild className="min-h-11">
          <Link to="/seller/produk/baru">
            <PackagePlus className="size-4" aria-hidden="true" />
            Produk baru
          </Link>
        </Button>
      </header>

      {counts.stock > 0 || (inv?.low_stock ?? 0) > 0 ? (
        <div className="flex items-start gap-2.5 rounded-2xl border border-warning/40 bg-warning/10 p-3.5 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden="true" />
          <p className="text-muted-foreground">
            {counts.stock > 0 ? (
              <strong className="text-foreground">{counts.stock} produk stok habis. </strong>
            ) : null}
            {(inv?.low_stock ?? 0) > 0
              ? `${inv!.low_stock} produk stok rendah (≤${inv!.threshold}). `
              : null}
            Tambah file atau kode agar produk tetap bisa dibeli.
          </p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex flex-col gap-2 border-b border-border p-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            role="tablist"
            aria-label="Filter produk"
            className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  tab === t.key
                    ? "bg-surface-selected font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-surface hover:text-foreground",
                )}
              >
                {t.label}
                <span className="text-xs tabular-nums text-muted-foreground">{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <label className="relative block lg:w-64">
            <span className="sr-only">Cari produk</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama produk"
              className="min-h-11 pl-9"
            />
          </label>
        </div>

        <div className="p-3">
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
                  ? "Tambahkan produk pertama Anda. Produk tayang setelah lolos moderasi."
                  : "Coba tab lain atau ubah kata kunci."
              }
              action={
                items.length === 0 ? (
                  <Button asChild className="min-h-11">
                    <Link to="/seller/produk/baru">Tambah produk</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visible.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductCard({ p }: { p: Product }) {
  const modLabel = MOD_LABEL[p.moderation_status] ?? p.moderation_status;
  const price = Number(p.discount_price ?? p.price);
  const hasDiscount = p.discount_price != null && Number(p.discount_price) < Number(p.price);
  const stock = stockLabel(p);
  const statusText =
    p.status === "published" ? "Tayang" : p.status === "archived" ? "Diarsipkan" : "Draf";

  return (
    <li className="flex">
      <Link
        to="/seller/produk/$id"
        params={{ id: p.id }}
        className="group flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative block aspect-[4/3] overflow-hidden bg-surface-selected">
          {p.thumbnail_url ? (
            <img
              src={p.thumbnail_url}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
            />
          ) : (
            <span className="grid size-full place-items-center text-accent">
              <Package className="size-8" aria-hidden="true" />
            </span>
          )}
          <span
            className={cn(
              "absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
              p.status === "published"
                ? "bg-success text-white"
                : "bg-foreground/75 text-background",
            )}
          >
            {statusText}
          </span>
        </span>
        <span className="flex flex-1 flex-col gap-1.5 p-3">
          <span className="line-clamp-2 min-h-10 text-sm font-medium leading-snug text-foreground">
            {p.name}
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold tabular-nums text-price">{formatRupiah(price)}</span>
            {hasDiscount ? (
              <span className="text-[11px] tabular-nums text-muted-foreground line-through">
                {formatRupiah(Number(p.price))}
              </span>
            ) : null}
          </span>
          {stock ? <span className={cn("text-xs", stock.tone)}>{stock.text}</span> : null}
          <span className="mt-auto pt-1">
            <StatusPill
              value={p.moderation_status}
              kind="raw"
              label={modLabel}
              className="px-2 py-0.5 text-[11px]"
            />
          </span>
          {p.moderation_status === "rejected" && p.moderation_note ? (
            <span className="line-clamp-2 text-[11px] text-destructive">{p.moderation_note}</span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
