import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  PackageCheck,
  ShieldCheck,
  ShoppingCart,
  ShoppingBag,
  Sparkles,
  Store,
} from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { StickyActionBar } from "@/components/ebry/cards";
import { ProductReviewPanel } from "@/components/product/review-panel";
import { ProductInquiryButton } from "@/components/product/inquiry-dialog";
import { addToCart } from "@/lib/cart-store";
import { getProductDetail } from "@/lib/orders.functions";
import { effectivePrice, formatRupiah } from "@/lib/format";
import { isRenderableImageUrl } from "@/lib/utils";
import { recordProductView } from "@/lib/recently-viewed";
import { RouteError, routeFailureHead } from "@/components/route-fallback";

const detailQuery = (slug: string) =>
  queryOptions({
    queryKey: ["product-detail", slug],
    queryFn: () => getProductDetail({ data: { slug } }),
  });

export const Route = createFileRoute("/produk/$slug")({
  loader: async ({ context, params }) => {
    const result = await context.queryClient.ensureQueryData(detailQuery(params.slug));
    if (result.error) throw new Error("Produk tidak dapat dimuat.");
    if (!result.product) throw notFound();
    return result;
  },
  head: ({ loaderData, match, matches }) => {
    const failureHead = routeFailureHead([...matches, match], "Produk tidak ditemukan | Ebrystore");
    if (failureHead) return failureHead;
    if (!loaderData?.product) return {};
    const p = loaderData.product;
    const desc = (p.short_description ?? "Produk digital Ebrystore siap unduh.").slice(0, 155);
    return {
      meta: [
        { title: `${p.name} — Produk Digital Ebrystore`.slice(0, 60) },
        { name: "description", content: desc },
        { property: "og:title", content: `${p.name} — Ebrystore` },
        { property: "og:description", content: desc },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(p.thumbnail_url?.startsWith("https://")
          ? [
              { property: "og:image", content: p.thumbnail_url },
              { name: "twitter:image", content: p.thumbnail_url },
            ]
          : []),
      ],
    };
  },
  errorComponent: () => (
    <RouteError
      message="Produk belum dapat dimuat. Muat ulang halaman untuk mencoba lagi."
      href="/produk"
      linkLabel="Kembali ke katalog"
    />
  ),
  notFoundComponent: ProdukTidakDitemukan,
  component: DetailProduk,
});

function ProdukTidakDitemukan() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main lang="id" className="mx-auto w-full max-w-3xl flex-1 px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Produk tidak ditemukan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Produk mungkin sudah tidak diterbitkan.
        </p>
        <Button
          asChild
          className="mt-6 min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          <Link to="/produk">Kembali ke katalog</Link>
        </Button>
      </main>
      <SiteFooter />
    </div>
  );
}

function DetailProduk() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(detailQuery(slug));
  const p = data.product;

  // Analitik: produk dilihat. Hook dipanggil sebelum early-return agar urutan
  // hook tidak berubah antar render (aturan React).
  useEffect(() => {
    void import("@/lib/analytics-track").then(({ trackEvent }) =>
      trackEvent("product_view", `/produk/${slug}`),
    );
  }, [slug]);

  // Riwayat "Terakhir dilihat" (lokal di perangkat), ditampilkan di dashboard user.
  useEffect(() => {
    if (!p) return;
    const s = (p as any).stores as { name?: string } | null;
    recordProductView({
      id: p.id,
      name: p.name,
      slug: p.slug,
      thumbnail_url: p.thumbnail_url ?? null,
      price: Number(p.price),
      discount_price: p.discount_price == null ? null : Number(p.discount_price),
      store_name: s?.name ?? null,
    });
  }, [p]);

  if (!p) return null;
  const thumbnail = isRenderableImageUrl(p.thumbnail_url) ? p.thumbnail_url : null;
  const price = effectivePrice(
    Number(p.price),
    p.discount_price === null ? null : Number(p.discount_price),
  );
  const discounted = price < Number(p.price);
  const downloadLimit = p.download_limit ?? 5;
  const uniqueStock = (p as { delivery_mode?: string }).delivery_mode === "unique";
  const stock = Number((p as { available_stock?: number }).available_stock ?? 0);
  const soldOut = uniqueStock && stock < 1;
  const validityDays = p.validity_days ?? 365;
  const store = (p as any).stores as { name: string; slug: string; is_platform: boolean } | null;
  const isSellerProduct = Boolean(store && !store.is_platform);

  const highlights = [
    { icon: Download, label: `${downloadLimit}x unduh`, hint: "Kuota unduhan per pembelian" },
    { icon: Clock3, label: `${validityDays} hari akses`, hint: "Masa berlaku tautan unduhan" },
    { icon: ShieldCheck, label: "Rilis otomatis", hint: "Aktif setelah pembayaran diverifikasi" },
  ];

  // Tambah ke keranjang: logika sama dengan Product Card katalog (cart-store),
  // supaya CTA antar halaman konsisten. State "added" memberi umpan balik
  // tombol tanpa mengubah perilaku cart.
  const [cartAdded, setCartAdded] = useState(false);
  const handleAddToCart = () => {
    const result = addToCart({
      productId: p.id,
      slug: p.slug,
      name: p.name,
      thumbnailUrl: thumbnail,
      storeId: store?.slug ?? null,
      storeName: store?.name ?? null,
      priceHint: price,
    });
    if (result === "duplicate") {
      toast.info("Produk ini sudah ada di keranjang.");
      return;
    }
    if (result === "full") {
      toast.error("Keranjang penuh. Hapus beberapa item dulu.");
      return;
    }
    setCartAdded(true);
    window.setTimeout(() => setCartAdded(false), 1600);
    toast.success("Ditambahkan ke keranjang.", {
      action: {
        label: "Lihat",
        onClick: () => {
          window.location.href = "/keranjang";
        },
      },
    });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-5 sm:pt-8">
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Link to="/produk" className="hover:text-foreground">
            Produk digital
          </Link>
          <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate text-foreground">{p.name}</span>
        </nav>

        <section className="mt-4 border-y border-border bg-card sm:border sm:p-5 lg:grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-8">
          <div className="min-w-0 py-4 sm:py-0">
            {thumbnail ? (
              <img
                src={thumbnail}
                alt={`Pratinjau produk ${p.name}`}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="aspect-[4/3] w-full border border-border bg-surface object-contain"
              />
            ) : (
              <div
                className="grid aspect-[4/3] w-full place-items-center border border-border bg-secondary"
                aria-hidden="true"
              >
                <FileText className="size-10 text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="min-w-0 border-t border-border py-5 sm:pt-5 lg:border-l lg:border-t-0 lg:py-1 lg:pl-8">
            {/* Label menggambarkan status listing yang terbukti (published &
                lolos moderasi), bukan klaim verifikasi independen. */}
            <p className="inline-flex items-center gap-1.5 bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
              <PackageCheck className="size-3.5" aria-hidden="true" /> Produk digital aktif
            </p>
            <h1 className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">{p.name}</h1>
            {store ? (
              <Link
                to="/toko/$slug"
                params={{ slug: store.slug }}
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
              >
                <Store className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{store.name}</span>
                {store.is_platform ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    <ShieldCheck className="size-3" aria-hidden="true" />
                    Official
                  </span>
                ) : null}
              </Link>
            ) : null}
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {p.short_description ?? "Berkas digital siap unduh setelah pembayaran diverifikasi."}
            </p>

            <div className="mt-4 flex items-center gap-4 border-y border-border py-3 text-sm">
              <span className="font-semibold text-accent">{p.sold_count ?? 0} terjual</span>
              <span className="h-4 w-px bg-border" aria-hidden="true" />
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <ShieldCheck className="size-4 text-accent" aria-hidden="true" /> Akses tercatat
                di akun
              </span>
            </div>

            {/* Harga: harga aktif dominan; harga lama + persentase sekunder. */}
            <div className="mt-5">
              {discounted ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="line-through">{formatRupiah(Number(p.price))}</span>
                  <span className="bg-warning/20 px-2 py-0.5 text-xs font-semibold text-warning-foreground">
                    Hemat {Math.round((1 - price / Number(p.price)) * 100)}%
                  </span>
                </div>
              ) : null}
              <p className="mt-1 text-3xl font-bold text-primary">{formatRupiah(price)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Harga final dihitung ulang di server saat checkout.
              </p>
            </div>

            {/* Ringkasan pembelian: hanya ketentuan kritis untuk keputusan beli.
                Detail teknis lengkap ada di panel Spesifikasi — tidak duplikat. */}
            <dl className="mt-5 grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Pengiriman</dt>
              <dd className="font-medium">Otomatis setelah pembayaran terverifikasi</dd>
              {uniqueStock ? (
                <>
                  <dt className="text-muted-foreground">Ketersediaan</dt>
                  <dd className={soldOut ? "font-semibold text-destructive" : "font-medium"}>
                    {soldOut ? "Stok habis" : `Tersedia ${stock}`}
                  </dd>
                </>
              ) : null}
            </dl>

            <p className="mt-5 flex items-start gap-2 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
              Pembayaran aman melalui QRIS. Pesanan diproses setelah pembayaran terkonfirmasi.
            </p>
            {/* Tanya seller: satu instance per representasi. Mobile memakai
                versi full-width di sini; ≥sm memakai yang di dalam grid CTA
                di bawah — jangan dirender ganda di accessibility tree. */}
            <div className="mt-4 lg:hidden">
              <ProductInquiryButton
                productId={p.id}
                productName={p.name}
                isSellerProduct={isSellerProduct}
                className="w-full"
              />
            </div>
            {/* CTA pembelian inline hanya untuk ≥sm: pada mobile, satu-satunya
                kelompok CTA adalah sticky bar di bawah, sehingga tombol tidak
                tampil ganda. Tanya seller tetap tampil di semua ukuran sebagai
                aksi tersier. */}
            <div className="mt-5 hidden gap-3 sm:grid sm:grid-cols-2">
              {soldOut ? (
                <Button disabled className="sm:col-span-2">
                  Stok habis
                </Button>
              ) : (
                <>
                  <Button asChild className="min-h-11">
                    <Link to="/checkout/produk/$slug" params={{ slug }}>
                      <ShoppingBag className="size-4" aria-hidden="true" /> Beli langsung
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={handleAddToCart}
                    aria-label={`Tambah ${p.name} ke keranjang`}
                  >
                    <ShoppingCart className="size-4" aria-hidden="true" />
                    {cartAdded ? "Ditambahkan" : "Keranjang"}
                  </Button>
                </>
              )}
              <div className="sm:col-span-2">
                <ProductInquiryButton
                  productId={p.id}
                  productName={p.name}
                  isSellerProduct={isSellerProduct}
                  variant="ghost"
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Satu sumber kebenaran ketentuan akses & detail teknis. Kolom kiri
            halaman hanya menampilkan ringkasannya. Field opsional (versi,
            catatan pakai) tampil hanya jika seller mengisinya. */}
        <section className="mt-4 border border-border bg-card" aria-labelledby="spesifikasi-produk">
          <h2
            id="spesifikasi-produk"
            className="border-b border-border bg-surface px-5 py-4 text-base font-semibold"
          >
            Ketentuan akses &amp; spesifikasi
          </h2>
          <dl className="grid gap-x-8 gap-y-4 px-5 py-5 text-sm sm:grid-cols-2">
            {highlights.map((item) => (
              <div key={item.label} className="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
                <item.icon className="mt-0.5 size-4 text-accent" aria-hidden="true" />
                <div>
                  <dt className="font-semibold">{item.label}</dt>
                  <dd className="mt-0.5 text-muted-foreground">{item.hint}</dd>
                </div>
              </div>
            ))}
            {p.version ? (
              <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
                <Sparkles className="mt-0.5 size-4 text-accent" aria-hidden="true" />
                <div>
                  <dt className="font-semibold">Versi produk</dt>
                  <dd className="mt-0.5 text-muted-foreground">{p.version}</dd>
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-3">
              <CheckCircle2 className="mt-0.5 size-4 text-accent" aria-hidden="true" />
              <div>
                <dt className="font-semibold">Jenis produk</dt>
                <dd className="mt-0.5 text-muted-foreground">
                  {uniqueStock
                    ? "Berkas digital dengan stok unik per pembeli"
                    : "Berkas digital (kuota sama untuk semua pembeli)"}
                </dd>
              </div>
            </div>
          </dl>
        </section>

        <section className="mt-4 border border-border bg-card" aria-labelledby="deskripsi-produk">
          <h2
            id="deskripsi-produk"
            className="border-b border-border bg-surface px-5 py-4 text-base font-semibold"
          >
            Deskripsi produk
          </h2>
          <div className="space-y-7 px-5 py-6">
            <div>
              <h3 className="text-sm font-semibold">Tentang produk ini</h3>
              <p className="mt-2 max-w-4xl whitespace-pre-line text-sm leading-7 text-muted-foreground">
                {p.description ??
                  p.short_description ??
                  "Produk digital siap digunakan setelah pembayaran terverifikasi."}
              </p>
            </div>
            {p.usage_notes ? (
              <div>
                <h3 className="text-sm font-semibold">Cara pakai</h3>
                <p className="mt-2 max-w-4xl whitespace-pre-line text-sm leading-7 text-muted-foreground">
                  {p.usage_notes}
                </p>
              </div>
            ) : null}
          </div>
        </section>

        {/* Proses pembelian: ringkas, terpisah dari deskripsi seller. Dua baris
            kalimat cukup — stepper empat kolom menambah kepadatan tanpa informasi
            yang belum tercakup di kolom pembelian. */}
        <section
          className="mt-4 border border-border bg-card"
          aria-labelledby="proses-pembelian"
        >
          <h2
            id="proses-pembelian"
            className="border-b border-border bg-surface px-5 py-4 text-base font-semibold"
          >
            Proses pembelian
          </h2>
          <ol className="grid gap-3 px-5 py-5 text-sm text-muted-foreground sm:grid-cols-2">
            {[
              "Periksa detail produk lalu selesaikan checkout.",
              "Bayar lewat metode yang tersedia; sistem memverifikasi pembayaran.",
              "Produk tersedia di menu Produk saya setelah verifikasi.",
            ].map((step, i) => (
              <li key={step} className="flex gap-3 border-t border-border pt-3">
                <span className="font-mono text-xs font-bold text-accent">0{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <ProductReviewPanel productId={p.id} />

        {/* Sticky purchase bar mobile: pusat tunggal aksi pembelian di <lg.
            Harga di kiri (sumber data sama dengan area detail), keranjang ikon
            (label aksesibel eksplisit), Beli langsung primary. Tanpa nama produk
            supaya bar ringkas dan label tombol tidak berisiko terpotong. */}
        <StickyActionBar className="lg:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              {discounted ? (
                <s className="block text-xs tabular-nums text-muted-foreground">
                  <span className="sr-only">Harga sebelumnya </span>
                  {formatRupiah(Number(p.price))}
                </s>
              ) : null}
              <p className="truncate text-base font-bold tabular-nums text-primary">
                {formatRupiah(price)}
              </p>
            </div>
            {!soldOut ? (
              <Button
                variant="outline"
                size="icon"
                className="size-11 shrink-0"
                onClick={handleAddToCart}
                aria-label={`Tambah ${p.name} ke keranjang`}
              >
                <ShoppingCart className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
            {soldOut ? (
              <Button disabled className="min-h-11 shrink-0">
                Stok habis
              </Button>
            ) : (
              <Button asChild className="min-h-11 shrink-0 px-5">
                <Link to="/checkout/produk/$slug" params={{ slug }}>
                  Beli langsung
                </Link>
              </Button>
            )}
          </div>
        </StickyActionBar>
      </main>
      <SiteFooter />
    </div>
  );
}
