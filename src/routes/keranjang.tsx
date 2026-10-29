import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShoppingCart, Store, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
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

export const Route = createFileRoute("/keranjang")({
  head: () => ({
    meta: [
      { title: "Keranjang — Ebrystore" },
      { name: "description", content: "Produk digital yang akan Anda beli." },
      { property: "og:title", content: "Keranjang — Ebrystore" },
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

  const validated = useMemo(() => ((data?.items ?? []) as any[]), [data?.items]);
  const byId = new Map(validated.map((v) => [cartLineKey(v.productId, v.variantId), v]));

  // Kelompokkan per toko: checkout tetap per item karena backend belum
  // mendukung multi-item dalam satu order.
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; items: any[] }>();
    for (const v of validated) {
      const key = v.storeId ?? "unknown";
      if (!map.has(key)) map.set(key, { name: v.storeName ?? "Toko", items: [] });
      map.get(key)!.items.push(v);
    }
    return Array.from(map.entries());
  }, [validated]);

  const availableItems = validated.filter((v) => v.available);
  const subtotal = availableItems.reduce((sum, v) => sum + Number(v.price ?? 0), 0);

  if (!ready) {
    return (
      <PageShell>
        <div className="px-4 py-16 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
          Memuat keranjang…
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <header className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-selected text-accent">
            <ShoppingCart className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">Keranjang</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Produk digital yang Anda pilih. Harga diperiksa ulang saat halaman ini dibuka.
            </p>
          </div>
        </header>

        {cart.items.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">Keranjang masih kosong.</p>
            <Button asChild className="mt-4 min-h-11">
              <Link to="/produk">Jelajahi produk</Link>
            </Button>
          </div>
        ) : isPending ? (
          <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Memeriksa ketersediaan produk…
          </div>
        ) : error || data?.error ? (
          <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {data?.error ?? "Keranjang tidak dapat diperiksa."}
            </p>
            <Button variant="outline" className="mt-4 min-h-11" onClick={() => refetch()}>
              Coba lagi
            </Button>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
              {groups.map(([storeId, group]) => (
                <section
                  key={storeId}
                  aria-labelledby={`store-${storeId}`}
                  className="overflow-hidden rounded-2xl border border-border bg-card"
                >
                  <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <Store className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <h2
                      id={`store-${storeId}`}
                      className="truncate text-sm font-bold text-foreground"
                    >
                      {group.name}
                    </h2>
                  </div>
                  <ul className="divide-y divide-border">
                    {group.items.map((item) => {
                      const key = cartLineKey(item.productId, item.variantId);
                      const hint = cart.items.find(
                        (c) => cartLineKey(c.productId, c.variantId) === key,
                      );
                      const variantLabel = item.variantName ?? hint?.variantName ?? null;
                      return (
                        <li key={key} className="flex items-start gap-3 px-4 py-4">
                          <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-selected">
                            {item.thumbnailUrl ? (
                              <img
                                src={item.thumbnailUrl}
                                alt=""
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
                            <Link
                              to="/produk/$slug"
                              params={{ slug: item.slug }}
                              className="line-clamp-2 text-sm font-semibold text-foreground underline-offset-4 hover:underline"
                            >
                              {item.name}
                            </Link>
                            {variantLabel ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Variasi: {variantLabel}
                              </p>
                            ) : null}
                            {item.available ? (
                              <p className="mt-1 text-sm font-semibold tabular-nums text-price">
                                {formatRupiah(Number(item.price))}
                                {item.hasDiscount ? (
                                  <s className="ml-2 text-xs font-normal text-muted-foreground">
                                    {formatRupiah(Number(item.basePrice))}
                                  </s>
                                ) : null}
                              </p>
                            ) : (
                              <p className="mt-1 flex items-center gap-1.5 text-xs text-warning-foreground">
                                <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                                {REASON_LABEL[item.reason] ?? "Produk tidak tersedia."}
                              </p>
                            )}
                            {hint &&
                            item.available &&
                            Number(hint.priceHint) !== Number(item.price) ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Harga berubah dari {formatRupiah(Number(hint.priceHint))}.
                              </p>
                            ) : null}
                          </div>

                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="min-h-11 min-w-11"
                              aria-label={`Hapus ${item.name} dari keranjang`}
                              onClick={() => {
                                removeFromCart(item.productId, item.variantId);
                                toast.success("Item dihapus dari keranjang.");
                              }}
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </Button>
                            {item.available ? (
                              <Button asChild size="sm" className="min-h-11">
                                <Link
                                  to="/checkout/produk/$slug"
                                  params={{ slug: item.slug }}
                                  search={item.variantId ? { variant: item.variantId } : {}}
                                >
                                  Beli
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

            <aside className="h-fit rounded-2xl border border-border bg-card p-4 lg:sticky lg:top-24">
              <h2 className="text-sm font-bold text-foreground">Ringkasan</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Item tersedia</dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    {availableItems.length} dari {cart.items.length}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="text-base font-bold tabular-nums text-price">
                    {formatRupiah(subtotal)}
                  </dd>
                </div>
              </dl>

              <p className="mt-3 rounded-lg bg-muted/50 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                Pembelian diproses per produk lewat checkout. Total akhir dan biaya admin dihitung
                server saat checkout, bukan dari halaman ini.
              </p>

              {availableItems.length > 0 ? (
                <Button asChild className="mt-3 min-h-11 w-full">
                  <Link
                    to="/checkout/produk/$slug"
                    params={{ slug: availableItems[0].slug }}
                    search={availableItems[0].variantId ? { variant: availableItems[0].variantId } : {}}
                  >
                    Lanjut ke checkout
                  </Link>
                </Button>
              ) : null}

              <Button asChild variant="ghost" className="mt-2 min-h-11 w-full">
                <Link to="/produk">Tambah produk lain</Link>
              </Button>
            </aside>
          </div>
        )}
      </div>
    </PageShell>
  );
}
