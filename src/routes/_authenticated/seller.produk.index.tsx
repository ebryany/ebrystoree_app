import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Package, PackagePlus } from "lucide-react";

import { AdminError, AdminLoading } from "@/components/admin/admin-ui";
import { InlineEmpty } from "@/components/ebry/cards";
import { StatusPill } from "@/components/ebry/status";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/format";
import { listMyStoreProducts, getMyInventorySummary } from "@/lib/seller.functions";

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

const MOD_LABEL: Record<string, { label: string; tone: string }> = {
  pending: { label: "Menunggu moderasi", tone: "waiting" },
  approved: { label: "Disetujui", tone: "success" },
  rejected: { label: "Ditolak", tone: "danger" },
};

function StockBadge({ mode, stock }: { mode: string; stock: number }) {
  if (mode === "shared") return null;
  if (stock === 0) {
    return (
      <Badge variant="destructive" className="gap-1 text-[10px]">
        <AlertTriangle className="size-3" aria-hidden="true" />
        Stok habis
      </Badge>
    );
  }
  if (stock <= 5) {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/40 text-[10px] text-amber-600">
        <Package className="size-3" aria-hidden="true" />
        Stok {stock}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1 text-[10px]">
      <Package className="size-3" aria-hidden="true" />
      Stok {stock}
    </Badge>
  );
}

function SellerProducts() {
  const fetchProducts = useServerFn(listMyStoreProducts);
  const fetchInventory = useServerFn(getMyInventorySummary);

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

  if (isPending) return <AdminLoading label="Memuat produk…" />;
  if (error || data?.error) return <AdminError message={data?.error ?? undefined} />;

  const items: any[] = data?.items ?? [];
  const inv = (inventoryQ.data as any)?.summary;

  return (
    <div className="space-y-4">
      {inv && (inv.out_of_stock > 0 || inv.low_stock > 0) && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-xs text-muted-foreground">
          <AlertTriangle
            className="mb-0.5 inline-block size-3.5 text-amber-500"
            aria-hidden="true"
          />{" "}
          {inv.out_of_stock > 0 && (
            <strong className="text-foreground">{inv.out_of_stock} produk stok habis.</strong>
          )}
          {inv.out_of_stock > 0 && inv.low_stock > 0 && " "}
          {inv.low_stock > 0 && (
            <span>
              {inv.low_stock} produk stok rendah (≤{inv.threshold}).
            </span>
          )}{" "}
          Tambah file atau kode agar produk bisa dibeli.
        </div>
      )}

      <section
        aria-labelledby="produk-heading"
        className="rounded-2xl border border-border bg-card"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id="produk-heading" className="text-sm font-bold text-foreground">
            Produk toko ({items.length})
          </h2>
          <Button asChild size="sm" className="min-h-11">
            <Link to="/seller/produk/baru">
              <PackagePlus className="size-4" aria-hidden="true" />
              Produk baru
            </Link>
          </Button>
        </div>

        {items.length === 0 ? (
          <InlineEmpty
            icon={PackagePlus}
            text="Belum ada produk. Tambahkan produk pertama Anda."
            actionLabel="Tambah"
            to="/seller/produk/baru"
          />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((p: any) => {
              const mod = MOD_LABEL[p.moderation_status] ?? {
                label: p.moderation_status,
                tone: "neutral",
              };
              const price = Number(p.discount_price ?? p.price);
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-surface-selected">
                    {p.thumbnail_url ? (
                      <img src={p.thumbnail_url} alt="" className="size-full object-cover" />
                    ) : (
                      <PackagePlus className="size-5 text-muted-foreground" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-semibold text-foreground">{p.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {p.status === "published"
                        ? "Tayang"
                        : p.status === "archived"
                          ? "Diarsipkan"
                          : "Draf"}{" "}
                      · {formatRupiah(price)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <StatusPill value={mod.tone as any} kind="raw" label={mod.label} />
                      <StockBadge
                        mode={p.delivery_mode ?? "shared"}
                        stock={Number(p.available_stock ?? 0)}
                      />
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm" className="min-h-10 shrink-0">
                    <Link to="/seller/produk/$id" params={{ id: p.id }}>
                      Kelola
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
