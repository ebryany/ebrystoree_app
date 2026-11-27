import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Loader2,
  MessageCircle,
  Package,
  Search,
  ShoppingCart,
  Store,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { addToCart } from "@/lib/cart-store";
import { formatRupiah } from "@/lib/format";
import {
  createProductInquiry,
  findMyStoreThread,
  searchShareableCatalog,
} from "@/lib/inquiries.functions";
import type { AttachedCommerceItem } from "@/lib/social-threads.shared";
import { cn, isRenderableImageUrl, optimizedMediaUrl } from "@/lib/utils";

/**
 * Interactive Ebrystore Product or Service card embedded directly inside a Threads post.
 * Connects Social Media Threads -> Marketplace Catalog -> WhatsApp-style Direct Chat in 1 tap.
 */
export function ThreadCommerceCard({
  item,
  compact = false,
  readOnly = false,
  onRemove,
}: {
  item: AttachedCommerceItem;
  compact?: boolean;
  readOnly?: boolean;
  onRemove?: () => void;
}) {
  const navigate = useNavigate();
  const findThreadFn = useServerFn(findMyStoreThread);
  const createThreadFn = useServerFn(createProductInquiry);
  const [openingChat, setOpeningChat] = useState(false);

  function handleInstantBuy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (item.kind === "product") {
      addToCart({
        productId: item.id,
        slug: item.slug,
        name: item.name,
        thumbnailUrl: item.thumbnailUrl,
        storeId: item.storeId,
        storeName: item.storeName,
        priceHint: item.discountPrice ?? item.price,
      });
      toast.success("Produk dimasukkan ke keranjang.");
      void navigate({ to: "/keranjang" });
      return;
    }
    void navigate({ to: "/jasa/$id", params: { id: item.id } });
  }

  async function handleStartChat(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly) {
      void navigate({ to: "/auth" });
      return;
    }
    if (openingChat) return;
    setOpeningChat(true);
    try {
      const existing = await findThreadFn({
        data:
          item.kind === "product"
            ? { productId: item.id, storeId: item.storeId ?? undefined }
            : { serviceId: item.id, storeId: item.storeId ?? undefined },
      });
      if (existing.id) {
        void navigate({ to: "/dashboard/chat/$id", params: { id: existing.id } });
        return;
      }
      const created = await createThreadFn({
        data:
          item.kind === "product"
            ? {
                productId: item.id,
                subject: `Tanya produk: ${item.name}`.slice(0, 150),
                body: `Halo, saya melihat produk "${item.name}" dari utas di Ebrystore Threads. Apakah masih tersedia?`,
              }
            : {
                serviceId: item.id,
                subject: `Tanya jasa: ${item.name}`.slice(0, 150),
                body: `Halo, saya tertarik dengan jasa "${item.name}" dari utas di Ebrystore Threads. Boleh diskusi detailnya?`,
              },
      });
      if (!created.ok) {
        toast.error(created.error);
        return;
      }
      void navigate({ to: "/dashboard/chat/$id", params: { id: created.id } });
    } catch {
      toast.error("Gagal membuka percakapan dengan toko.");
    } finally {
      setOpeningChat(false);
    }
  }

  const isProduct = item.kind === "product";
  const thumb =
    isProduct && isRenderableImageUrl(item.thumbnailUrl) ? item.thumbnailUrl : null;
  const displayPrice = isProduct ? (item.discountPrice ?? item.price) : item.price;

  return (
    <div
      className={cn(
        "group/commerce relative flex items-center gap-3 overflow-hidden rounded-2xl border border-border/90 bg-surface/70 p-2.5 transition-colors hover:border-border hover:bg-surface",
        compact && "p-2",
      )}
    >
      <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-border/70 bg-card text-accent">
        {thumb ? (
          <img
            src={optimizedMediaUrl(thumb, 128)}
            alt={item.name}
            width={56}
            height={56}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : isProduct ? (
          <Package className="size-5" aria-hidden="true" />
        ) : (
          <BriefcaseBusiness className="size-5" aria-hidden="true" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <span className="uppercase tracking-wide text-accent">
            {isProduct ? "Produk Digital" : "Jasa Seller"}
          </span>
          {item.storeName ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex min-w-0 items-center gap-1 truncate">
                <Store className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.storeName}</span>
              </span>
            </>
          ) : null}
        </div>

        <p className="mt-0.5 line-clamp-1 text-sm font-semibold text-foreground">{item.name}</p>

        <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-bold tabular-nums text-price">
            {formatRupiah(displayPrice)}
          </span>
          {isProduct && item.discountPrice !== null && item.discountPrice < item.price ? (
            <span className="text-xs tabular-nums text-muted-foreground line-through">
              {formatRupiah(item.price)}
            </span>
          ) : null}
          {!isProduct && item.durationDays ? (
            <span className="text-xs text-muted-foreground">
              {item.durationDays} hari · {item.revisionLimit} revisi
            </span>
          ) : null}
        </div>
      </div>

      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Hapus lampiran produk atau jasa"
          className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            disabled={openingChat}
            onClick={(e) => void handleStartChat(e)}
            aria-label={`Chat toko mengenai ${item.name}`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-surface-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {openingChat ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <MessageCircle className="size-3.5 text-accent" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">Chat</span>
          </button>

          <button
            type="button"
            onClick={handleInstantBuy}
            aria-label={isProduct ? `Beli cepat ${item.name}` : `Pesan jasa ${item.name}`}
            className="inline-flex min-h-9 items-center gap-1 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ShoppingCart className="size-3.5" aria-hidden="true" />
            <span>Beli</span>
          </button>

          {!compact ? (
            isProduct ? (
              <Link
                to="/produk/$slug"
                params={{ slug: item.slug }}
                aria-label={`Lihat detail ${item.name}`}
                className="hidden min-h-9 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-surface-selected sm:inline-flex"
              >
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            ) : (
              <Link
                to="/jasa/$id"
                params={{ id: item.id }}
                aria-label={`Lihat detail ${item.name}`}
                className="hidden min-h-9 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-surface-selected sm:inline-flex"
              >
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            )
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Modal picker allowing any user to tag an active Ebrystore Product or Service inside a Threads post. */
export function ThreadCommercePickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (item: AttachedCommerceItem) => void;
}) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"product" | "service">("product");
  const searchCatalog = useServerFn(searchShareableCatalog);

  const { data, isPending } = useQuery({
    queryKey: ["threads-shareable-catalog", q.trim()],
    queryFn: () => searchCatalog({ data: { q: q.trim() || undefined } }),
    enabled: open,
    staleTime: 30_000,
  });

  const products = data?.products ?? [];
  const services = data?.services ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="font-display text-base">
            Tautkan Produk atau Jasa ke Utas
          </DialogTitle>
          <DialogDescription className="text-xs">
            Harga dan detail katalog diambil otomatis dari server Ebrystore agar selalu akurat.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 p-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama produk digital atau jasa..."
              aria-label="Cari katalog Ebrystore"
              className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div role="tablist" aria-label="Jenis katalog" className="flex gap-2">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "product"}
              onClick={() => setTab("product")}
              className={cn(
                "min-h-9 rounded-full px-3.5 text-xs font-semibold transition-colors",
                tab === "product"
                  ? "bg-foreground text-background"
                  : "bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              Produk Digital ({products.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "service"}
              onClick={() => setTab("service")}
              className={cn(
                "min-h-9 rounded-full px-3.5 text-xs font-semibold transition-colors",
                tab === "service"
                  ? "bg-foreground text-background"
                  : "bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              Jasa Seller ({services.length})
            </button>
          </div>

          <div className="max-h-72 space-y-1.5 overflow-y-auto overscroll-contain pr-1">
            {isPending ? (
              <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                Memuat katalog...
              </div>
            ) : tab === "product" ? (
              products.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  Tidak ada produk aktif yang cocok.
                </p>
              ) : (
                products.map((p: any) => (
                  <button
                    key={p.productId}
                    type="button"
                    onClick={() => {
                      onPick({
                        kind: "product",
                        id: p.productId,
                        slug: p.slug,
                        name: p.name,
                        price: p.price,
                        discountPrice: p.discountPrice,
                        thumbnailUrl: p.thumbnailUrl,
                        storeId: null,
                        storeName: p.storeName,
                        storeSlug: null,
                      });
                      onOpenChange(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-card text-accent">
                      {isRenderableImageUrl(p.thumbnailUrl) ? (
                        <img
                          src={optimizedMediaUrl(p.thumbnailUrl!, 96)}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <Package className="size-4" aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {p.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {p.storeName ?? "Ebrystore"} ·{" "}
                        <strong className="tabular-nums text-price">
                          {formatRupiah(p.discountPrice ?? p.price)}
                        </strong>
                      </span>
                    </span>
                  </button>
                ))
              )
            ) : services.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Tidak ada jasa aktif yang cocok.
              </p>
            ) : (
              services.map((s: any) => (
                <button
                  key={s.serviceId}
                  type="button"
                  onClick={() => {
                    onPick({
                      kind: "service",
                      id: s.serviceId,
                      name: s.name,
                      price: s.price,
                      durationDays: s.durationDays,
                      revisionLimit: s.revisionLimit,
                      storeId: null,
                      storeName: s.storeName,
                      storeSlug: null,
                    });
                    onOpenChange(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-border bg-card text-accent">
                    <BriefcaseBusiness className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {s.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.storeName ?? "Seller Ebrystore"} ·{" "}
                      <strong className="tabular-nums text-price">{formatRupiah(s.price)}</strong> ·{" "}
                      {s.durationDays} hari
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
