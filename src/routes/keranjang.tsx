import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ShoppingCart, Store, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { RecentlyViewedShelf } from "@/components/ebry/recently-viewed-shelf";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import {
  cartLineKey,
  hydrateCart,
  removeFromCart,
  setCartOwner,
  useCart,
} from "@/lib/cart-store";
import { validateCartItems } from "@/lib/cart.functions";
import { formatRupiah } from "@/lib/format";
import { optimizedMediaUrl } from "@/lib/utils";

export const Route = createFileRoute("/keranjang")({
  head: () => ({
    meta: [
      { title: "Keranjang | Ebrystore" },
      { name: "description", content: "Produk digital yang akan Anda beli di Ebrystore." },
      { property: "og:title", content: "Keranjang | Ebrystore" },
      { property: "og:description", content: "Periksa produk sebelum melanjutkan pembelian." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CartPage,
});

const REASON_LABEL: Record<string, string> = {
  PRODUCT_GONE: "Produk sudah tidak tersedia.",
  NOT_PUBLISHED: "Produk sedang tidak dijual.",
  STORE_INACTIVE: "Toko sedang tidak aktif.",
  VARIANT_GONE: "Variasi ini sudah tidak tersedia. Pilih variasi lain di halaman produk.",
  VARIANT_REQUIRED: "Produk ini sekarang punya variasi. Pilih variasi di halaman produk.",
};

type ValidatedCartItem = {
  productId: string;
  variantId?: string | null;
  variantName?: string | null;
  name?: string;
  slug?: string;
  thumbnailUrl?: string | null;
  storeId?: string | null;
  storeName?: string | null;
  storeSlug?: string | null;
  price?: number;
  basePrice?: number;
  hasDiscount?: boolean;
  available: boolean;
  reason?: string | null;
};

function CartPage() {
  const { user } = useSession();
  const [ready, setReady] = useState(false);
  const cart = useCart();

  // Keranjang dibaca dari localStorage setelah hidrasi, lalu di-key per akun
  // supaya isi keranjang pengguna lain tidak terbaca di perangkat yang sama.
  useEffect(() => {
    setCartOwner(user?.id ?? null);
    hydrateCart();
    setReady(true);
  }, [user?.id]);

  const lines = useMemo(
    () => cart.items.map((it) => ({ productId: it.productId, variantId: it.variantId ?? null })),
    [cart.items],
  );
  const fetchValidation = useServerFn(validateCartItems);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["cart-validation", lines],
    queryFn: () => fetchValidation({ data: { items: lines } }),
    enabled: ready && lines.length > 0,
  });

  const validated = useMemo(
    () => ((data?.items ?? []) as ValidatedCartItem[]),
    [data?.items],
  );
  const byId = useMemo(
    () => new Map(validated.map((v) => [cartLineKey(v.productId, v.variantId), v])),
    [validated],
  );

  // Kelompokkan per toko: checkout tetap per item karena backend belum
  // mendukung multi-item dalam satu order.
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; slug: string | null; items: ValidatedCartItem[] }>();
    for (const v of validated) {
      const key = v.storeId ?? "unknown";
      if (!map.has(key)) {
        map.set(key, {
          name: v.storeName ?? "Toko",
          slug: v.storeSlug ?? null,
          items: [],
        });
      }
      map.get(key)!.items.push(v);
    }
    return Array.from(map.entries());
  }, [validated]);

  const availableItems = validated.filter((v) => v.available);
  const unavailableItems = validated.filter((v) => !v.available);
  const subtotal = availableItems.reduce((sum, v) => sum + Number(v.price ?? 0), 0);
  const totalSavings = availableItems.reduce((sum, v) => {
    if (!v.hasDiscount) return sum;
    const diff = Number(v.basePrice ?? 0) - Number(v.price ?? 0);
    return sum + (diff > 0 ? diff : 0);
  }, 0);

  function removeUnavailable() {
    if (unavailableItems.length === 0) return;
    for (const item of unavailableItems) {
      removeFromCart(item.productId, item.variantId);
    }
    toast.success(`${unavailableItems.length} item tidak tersedia dihapus dari keranjang.`);
  }

  if (!ready) {
    return (
      <PageShell>
        <div className="min-h-[60vh] bg-surface">
          <div className="mx-auto w-full max-w-7xl px-3 py-16 text-center text-sm text-muted-foreground sm:px-6 lg:px-8 2xl:max-w-[88rem]">
            Memuat keranjang...
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="min-h-[60vh] bg-surface">
        <div className="mx-auto w-full max-w-7xl px-3 pb-16 pt-5 sm:px-6 sm:pt-7 lg:px-8 2xl:max-w-[88rem]">
          <nav
            aria-label="Breadcrumb"
            className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            <Link
              to="/"
              className="flex min-h-11 items-center rounded-md hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Beranda
            </Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page" className="text-foreground">
              Keranjang
            </span>
          </nav>

          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-selected text-primary">
                <ShoppingCart className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Keranjang belanja
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Produk digital yang Anda simpan. Harga dan ketersediaan diperiksa ulang dari
                  server saat halaman ini dibuka.
                </p>
              </div>
            </div>

            {cart.items.length > 0 ? (
              <p className="text-sm font-medium tabular-nums text-muted-foreground">
                {cart.items.length} item tersimpan
              </p>
            ) : null}
          </header>

          {cart.items.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-border bg-card px-5 py-10 text-center shadow-[var(--elev-1)] sm:px-8 sm:py-12">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface-selected text-primary">
                <ShoppingCart className="size-7" aria-hidden="true" />
              </span>
              <h2 className="mt-4 font-display text-lg font-bold text-foreground sm:text-xl">
                Keranjang masih kosong
              </h2>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
                Simpan produk digital yang ingin Anda bandingkan di sini, atau langsung cari jasa
                seller sesuai kebutuhan Anda.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                <Button asChild className="min-h-11 rounded-control px-5">
                  <Link to="/produk">
                    Jelajahi produk
                    <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="min-h-11 rounded-control px-5">
                  <Link to="/layanan">Lihat jasa seller</Link>
                </Button>
              </div>
            </div>
          ) : isPending ? (
            <div className="mt-6 rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-[var(--elev-1)]">
              Memeriksa ketersediaan produk...
            </div>
          ) : error || data?.error ? (
            <div className="mt-6 rounded-2xl border border-border bg-card p-8 text-center shadow-[var(--elev-1)]">
              <p className="text-sm text-muted-foreground">
                {data?.error ?? "Keranjang tidak dapat diperiksa."}
              </p>
              <Button variant="outline" className="mt-4 min-h-11" onClick={() => void refetch()}>
                Coba lagi
              </Button>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 space-y-5">
                {unavailableItems.length > 0 ? (
                  <div
                    role="status"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-[var(--elev-1)]"
                  >
                    <p className="flex min-w-0 items-center gap-2 text-warning-foreground">
                      <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                      <span>
                        {unavailableItems.length} item di keranjang sedang tidak tersedia untuk
                        checkout.
                      </span>
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 max-w-full shrink-0 whitespace-normal text-center"
                      onClick={removeUnavailable}
                    >
                      Hapus item tidak tersedia
                    </Button>
                  </div>
                ) : null}

                {groups.map(([storeId, group]) => (
                  <section
                    key={storeId}
                    aria-labelledby={`store-${storeId}`}
                    className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--elev-1)]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 sm:px-4">
                      <div className="flex min-w-0 items-center gap-2">
                        <Store className="size-4 shrink-0 text-primary" aria-hidden="true" />
                        <h2 id={`store-${storeId}`} className="min-w-0 truncate text-sm font-bold">
                          {group.slug ? (
                            <Link
                              to="/toko/$slug"
                              params={{ slug: group.slug }}
                              className="inline-flex min-h-11 items-center text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {group.name}
                            </Link>
                          ) : (
                            <span className="inline-flex min-h-11 items-center text-foreground">
                              {group.name}
                            </span>
                          )}
                        </h2>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {group.items.length} produk
                      </span>
                    </div>

                    <ul className="divide-y divide-border">
                      {group.items.map((item) => {
                        const key = cartLineKey(item.productId, item.variantId);
                        const hint = cart.items.find(
                          (c) => cartLineKey(c.productId, c.variantId) === key,
                        );
                        const itemName = item.name ?? hint?.name ?? "Produk tidak tersedia";
                        const itemSlug = item.slug ?? hint?.slug ?? null;
                        const variantLabel = item.variantName ?? hint?.variantName ?? null;
                        return (
                          <li
                            key={key}
                            className="flex flex-col gap-3 px-3 py-4 sm:flex-row sm:items-start sm:px-4"
                          >
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-selected sm:size-14">
                                {item.thumbnailUrl ? (
                                  <img
                                    src={optimizedMediaUrl(item.thumbnailUrl, 128)}
                                    alt=""
                                    width={56}
                                    height={56}
                                    loading="lazy"
                                    decoding="async"
                                    className="size-full object-cover"
                                  />
                                ) : (
                                  <ShoppingCart
                                    className="size-5 text-muted-foreground"
                                    aria-hidden="true"
                                  />
                                )}
                              </span>

                              <div className="min-w-0 flex-1">
                                {itemSlug && item.available ? (
                                  <Link
                                    to="/produk/$slug"
                                    params={{ slug: itemSlug }}
                                    className="inline-flex min-h-11 items-center break-words text-sm font-semibold leading-snug text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    <span className="line-clamp-2">{itemName}</span>
                                  </Link>
                                ) : (
                                  <p className="break-words text-sm font-semibold leading-snug text-foreground">
                                    {itemName}
                                  </p>
                                )}

                                {variantLabel ? (
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    Variasi: {variantLabel}
                                  </p>
                                ) : null}

                                {item.available ? (
                                  <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-bold tabular-nums text-price">
                                    <span>{formatRupiah(Number(item.price))}</span>
                                    {item.hasDiscount && item.basePrice != null ? (
                                      <s className="text-xs font-normal text-muted-foreground">
                                        {formatRupiah(Number(item.basePrice))}
                                      </s>
                                    ) : null}
                                  </p>
                                ) : (
                                  <p className="mt-1 flex items-start gap-1.5 text-xs text-warning-foreground">
                                    <TriangleAlert
                                      className="mt-0.5 size-3.5 shrink-0"
                                      aria-hidden="true"
                                    />
                                    <span>
                                      {(item.reason && REASON_LABEL[item.reason]) ??
                                        "Produk tidak tersedia."}
                                    </span>
                                  </p>
                                )}

                                {hint &&
                                item.available &&
                                Number(hint.priceHint) !== Number(item.price) ? (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Harga diperbarui dari {formatRupiah(Number(hint.priceHint))}.
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:flex-col sm:items-end">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="min-h-11 min-w-11 text-muted-foreground hover:text-destructive"
                                aria-label={`Hapus ${itemName} dari keranjang`}
                                onClick={() => {
                                  removeFromCart(item.productId, item.variantId);
                                  toast.success("Item dihapus dari keranjang.");
                                }}
                              >
                                <Trash2 className="size-4" aria-hidden="true" />
                              </Button>
                              {item.available && itemSlug ? (
                                <Button
                                  asChild
                                  size="sm"
                                  className="min-h-11 max-w-full whitespace-normal rounded-control px-4 text-center"
                                >
                                  <Link
                                    to="/checkout/produk/$slug"
                                    params={{ slug: itemSlug }}
                                    search={item.variantId ? { variant: item.variantId } : {}}
                                  >
                                    Beli sekarang
                                  </Link>
                                </Button>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}

                {byId.size < cart.items.length ? (
                  <p className="text-xs text-muted-foreground">
                    Sebagian item tidak dapat diperiksa. Muat ulang halaman untuk mencoba lagi.
                  </p>
                ) : null}
              </div>

              <aside className="h-fit min-w-0 rounded-2xl border border-border bg-card p-4 shadow-[var(--elev-1)] sm:p-5 lg:sticky lg:top-24">
                <h2 className="font-display text-base font-bold text-foreground">
                  Ringkasan belanja
                </h2>
                <dl className="mt-3.5 space-y-2.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Item tersedia</dt>
                    <dd className="font-semibold tabular-nums text-foreground">
                      {availableItems.length} dari {cart.items.length}
                    </dd>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Jumlah toko</dt>
                    <dd className="font-semibold tabular-nums text-foreground">{groups.length}</dd>
                  </div>
                  {totalSavings > 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <dt className="text-muted-foreground">Total hemat</dt>
                      <dd className="font-semibold tabular-nums text-primary">
                        -{formatRupiah(totalSavings)}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <dt className="font-medium text-foreground">Estimasi total</dt>
                    <dd className="text-lg font-bold tabular-nums text-price">
                      {formatRupiah(subtotal)}
                    </dd>
                  </div>
                </dl>

                <p className="mt-3.5 rounded-xl bg-surface p-3 text-xs leading-relaxed text-muted-foreground">
                  Pembelian diproses per produk lewat checkout. Total akhir dan biaya admin dihitung
                  server saat checkout.
                </p>

                {availableItems.length > 0 && availableItems[0].slug ? (
                  <Button
                    asChild
                    className="mt-4 min-h-11 w-full whitespace-normal rounded-control text-center"
                  >
                    <Link
                      to="/checkout/produk/$slug"
                      params={{ slug: availableItems[0].slug }}
                      search={
                        availableItems[0].variantId ? { variant: availableItems[0].variantId } : {}
                      }
                    >
                      Lanjut ke checkout
                    </Link>
                  </Button>
                ) : null}

                <Button
                  asChild
                  variant="outline"
                  className="mt-2.5 min-h-11 w-full whitespace-normal rounded-control text-center"
                >
                  <Link to="/produk">Tambah produk lain</Link>
                </Button>
              </aside>
            </div>
          )}

          <div className="mt-10">
            <RecentlyViewedShelf title="Terakhir Anda lihat" />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
