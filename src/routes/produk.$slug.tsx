import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BadgeCheck,
  CalendarClock,
  ChevronRight,
  Download,
  FileText,
  KeyRound,
  PackageCheck,
  Send,
  ServerCog,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  Ticket,
  UserCheck,
  Wallet,
} from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { StickyActionBar } from "@/components/ebry/cards";
import { OPEN_REVIEW_EVENT, ProductReviewPanel } from "@/components/product/review-panel";
import { ProductInquiryButton } from "@/components/product/inquiry-dialog";
import { ProductDescription } from "@/components/product/product-description";
import { LikeProductButton } from "@/components/store/social-buttons";
import { addToCart } from "@/lib/cart-store";
import { getProductDetail, type ProductVariant } from "@/lib/orders.functions";
import { listProducts } from "@/lib/catalog.functions";
import { listProductReviews } from "@/lib/reviews.functions";
import { effectivePrice, formatRupiah } from "@/lib/format";
import { cn, isRenderableImageUrl } from "@/lib/utils";
import { recordProductView } from "@/lib/recently-viewed";
import { RouteError, routeFailureHead } from "@/components/route-fallback";
import { ogImageUrl } from "@/lib/seo-url";

const detailQuery = (slug: string) =>
  queryOptions({
    queryKey: ["product-detail", slug],
    queryFn: () => getProductDetail({ data: { slug } }),
  });

type Delivery = "file" | "code" | "account";

/** Tombol aksi kartu penjual: ikon di atas label di HP, sebaris mulai sm. */
const SELLER_ACTION =
  "h-auto min-h-11 w-full min-w-0 flex-col gap-0.5 px-1.5 py-1.5 text-xs sm:flex-row sm:gap-2 sm:px-3 sm:text-sm";

function openReviewForm() {
  window.dispatchEvent(new Event(OPEN_REVIEW_EVENT));
  document.getElementById("ulasan-produk")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const monthYearFmt = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });
const fullDateFmt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

type DetailStore = {
  name: string;
  slug: string;
  is_platform: boolean;
  logo_url: string | null;
  created_at: string;
} | null;

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
    const image = ogImageUrl(p.thumbnail_url);
    return {
      meta: [
        { title: `${p.name} — Produk Digital Ebrystore`.slice(0, 60) },
        { name: "description", content: desc },
        { property: "og:title", content: `${p.name} — Ebrystore` },
        { property: "og:description", content: desc },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(image
          ? [
              { property: "og:image", content: image },
              { property: "og:image:alt", content: p.name },
              { name: "twitter:image", content: image },
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

  // Semua hook dipanggil sebelum early-return agar urutan hook stabil.
  useEffect(() => {
    void import("@/lib/analytics-track").then(({ trackEvent }) =>
      trackEvent("product_view", `/produk/${slug}`),
    );
  }, [slug]);

  useEffect(() => {
    if (!p) return;
    const s = p.seller as DetailStore;
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

  const variants: ProductVariant[] = p?.variants ?? [];
  const [variantId, setVariantId] = useState<string | null>(variants[0]?.id ?? null);
  const selectedVariant = variants.find((v) => v.id === variantId) ?? variants[0] ?? null;
  const [cartAdded, setCartAdded] = useState(false);

  // Ringkasan rating di header berbagi cache dengan panel ulasan (query key sama).
  const reviews = useQuery({
    queryKey: ["product-reviews", p?.id ?? ""],
    queryFn: () => listProductReviews({ data: { productId: p!.id } }),
    enabled: Boolean(p),
  });

  if (!p) return null;

  const thumbnail = isRenderableImageUrl(p.thumbnail_url) ? p.thumbnail_url : null;
  // Harga tampilan mengikuti variasi terpilih; harga final tetap dihitung server.
  const basePrice = Number(selectedVariant ? selectedVariant.price : p.price);
  const baseDiscount = selectedVariant ? selectedVariant.discount_price : p.discount_price;
  const price = effectivePrice(basePrice, baseDiscount === null ? null : Number(baseDiscount));
  const discounted = price < basePrice;
  const discountPct = discounted ? Math.round((1 - price / basePrice) * 100) : 0;
  const checkoutSearch = selectedVariant ? { variant: selectedVariant.id } : {};
  const downloadLimit = p.download_limit ?? 5;
  const delivery: Delivery =
    p.delivery_mode === "code"
      ? (p as { code_kind?: string }).code_kind === "account"
        ? "account"
        : "code"
      : "file";
  const uniqueStock = p.delivery_mode === "unique" || delivery !== "file";
  const stock = Number(p.available_stock ?? 0);
  const soldOut = uniqueStock && stock < 1;
  const validityDays = p.validity_days ?? 365;
  const store = p.seller as DetailStore;
  const stats = p.sellerStats;
  const category = (p as { categories?: { name: string; slug: string } | null }).categories ?? null;
  const isSellerProduct = Boolean(store && !store.is_platform);
  const reviewTotal = reviews.data?.total ?? 0;
  const reviewAverage = reviews.data?.average ?? 0;

  const handleAddToCart = () => {
    const result = addToCart({
      productId: p.id,
      variantId: selectedVariant?.id ?? null,
      variantName: selectedVariant?.name ?? null,
      slug: p.slug,
      name: p.name,
      thumbnailUrl: thumbnail,
      storeId: store?.slug ?? null,
      storeName: store?.name ?? null,
      priceHint: price,
    });
    if (result === "duplicate") {
      toast.info(
        selectedVariant
          ? `Variasi ${selectedVariant.name} sudah ada di keranjang.`
          : "Produk ini sudah ada di keranjang.",
      );
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

  const specs: Array<{ label: string; value: ReactNode }> = [
    {
      label: "Kategori",
      value: category ? (
        <Link
          to="/produk"
          search={{ kategori: category.slug }}
          className="font-medium text-primary hover:underline"
        >
          {category.name}
        </Link>
      ) : (
        "Produk digital"
      ),
    },
    {
      label: "Jenis produk",
      value:
        delivery === "account"
          ? "Akun (satu akun per pembeli)"
          : delivery === "code"
            ? "Kode/link (satu per pembeli)"
            : uniqueStock
              ? "Stok unik per pembeli"
              : "Berkas digital (kuota sama per pembeli)",
    },
    ...(delivery === "file" ? [{ label: "Kuota unduhan", value: `${downloadLimit}x per pembelian` }] : []),
    { label: "Masa akses", value: `${validityDays} hari sejak pembayaran terverifikasi` },
    ...(p.version ? [{ label: "Versi", value: p.version }] : []),
    ...(variants.length ? [{ label: "Pilihan variasi", value: `${variants.length} variasi` }] : []),
    { label: "Pengiriman", value: "Langsung terkirim ke menu Produk saya setelah transaksi selesai" },
    ...(uniqueStock ? [{ label: "Stok", value: soldOut ? "Habis" : `${stock} tersedia` }] : []),
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-4 sm:pt-6">
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Link to="/produk" className="shrink-0 hover:text-foreground">
            Produk digital
          </Link>
          {category ? (
            <>
              <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
              <Link
                to="/produk"
                search={{ kategori: category.slug }}
                className="shrink-0 hover:text-foreground"
              >
                {category.name}
              </Link>
            </>
          ) : null}
          <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate text-foreground">{p.name}</span>
        </nav>

        {/* ===== Blok utama: galeri + panel beli ===== */}
        <section className="mt-3 overflow-hidden rounded-xl border border-border bg-card lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="min-w-0 border-b border-border bg-surface p-3 sm:p-5 lg:border-b-0 lg:border-r">
            <div className="lg:sticky lg:top-24">
              {thumbnail ? (
                <img
                  src={thumbnail}
                  alt={`Pratinjau produk ${p.name}`}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="aspect-square w-full rounded-lg border border-border bg-card object-contain"
                />
              ) : (
                <div
                  className="grid aspect-square w-full place-items-center rounded-lg border border-border bg-secondary"
                  aria-hidden="true"
                >
                  <FileText className="size-12 text-muted-foreground" />
                </div>
              )}
              <ul className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] leading-tight text-muted-foreground">
                <li className="rounded-lg border border-border bg-card px-1.5 py-2">
                  <Wallet className="mx-auto mb-1 size-4 text-accent" aria-hidden="true" />
                  Banyak metode bayar
                </li>
                <li className="rounded-lg border border-border bg-card px-1.5 py-2">
                  <BadgeCheck className="mx-auto mb-1 size-4 text-accent" aria-hidden="true" />
                  Rilis otomatis
                </li>
                <li className="rounded-lg border border-border bg-card px-1.5 py-2">
                  <UserCheck className="mx-auto mb-1 size-4 text-accent" aria-hidden="true" />
                  Tercatat di akun
                </li>
              </ul>
            </div>
          </div>

          <div className="min-w-0 p-4 sm:p-6">
            {/* Label = status listing yang terbukti (published & lolos moderasi). */}
            <p className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
              <PackageCheck className="size-3.5" aria-hidden="true" /> Produk digital aktif
            </p>
            <h1 className="mt-2.5 text-xl font-bold leading-snug sm:text-2xl">{p.name}</h1>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {reviewTotal > 0 ? (
                <a
                  href="#ulasan-produk"
                  className="inline-flex items-center gap-1 font-semibold hover:text-primary"
                >
                  <Star className="size-4 fill-aurora text-aurora" aria-hidden="true" />
                  {reviewAverage.toFixed(1)}
                  <span className="font-normal text-muted-foreground">
                    ({reviewTotal} ulasan)
                  </span>
                </a>
              ) : (
                <span className="text-muted-foreground">Belum ada ulasan</span>
              )}
              <span className="h-4 w-px bg-border" aria-hidden="true" />
              <span>
                <span className="font-semibold">{p.sold_count ?? 0}</span>{" "}
                <span className="text-muted-foreground">terjual</span>
              </span>
              <LikeProductButton productId={p.id} className="-my-2 ml-auto" />
            </div>

            {/* Harga: aktif dominan, harga lama + persentase sekunder. */}
            <div className="mt-4 rounded-lg bg-surface px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-3xl font-bold tabular-nums text-price">{formatRupiah(price)}</p>
                {discounted ? (
                  <>
                    <s className="text-sm tabular-nums text-muted-foreground">
                      <span className="sr-only">Harga sebelumnya </span>
                      {formatRupiah(basePrice)}
                    </s>
                    <span className="rounded bg-accent px-1.5 py-0.5 text-xs font-bold tabular-nums text-accent-foreground">
                      -{discountPct}%
                    </span>
                  </>
                ) : null}
              </div>
              {selectedVariant ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Harga untuk variasi <span className="font-medium">{selectedVariant.name}</span>
                </p>
              ) : null}
            </div>

            <dl className="mt-5 grid grid-cols-[84px_minmax(0,1fr)] gap-x-4 gap-y-5 text-sm sm:grid-cols-[104px_minmax(0,1fr)]">
              {variants.length > 0 ? (
                <>
                  <dt id="label-variasi" className="pt-3 text-muted-foreground">
                    Variasi
                  </dt>
                  <dd>
                    <div
                      role="radiogroup"
                      aria-labelledby="label-variasi"
                      className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2"
                    >
                      {variants.map((v) => {
                        const active = v.id === selectedVariant?.id;
                        const vPrice = effectivePrice(
                          Number(v.price),
                          v.discount_price === null ? null : Number(v.discount_price),
                        );
                        return (
                          <button
                            key={v.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => setVariantId(v.id)}
                            className={cn(
                              "relative min-h-11 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
                              active
                                ? "border-primary bg-primary/5"
                                : "border-border bg-card hover:border-primary/50",
                            )}
                          >
                            <span
                              className={cn(
                                "line-clamp-2 break-words text-sm font-medium",
                                active && "text-primary",
                              )}
                            >
                              {v.name}
                            </span>
                            <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                              {formatRupiah(vPrice)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </dd>
                </>
              ) : null}

              <dt className="text-muted-foreground">Pengiriman</dt>
              <dd>
                <p className="font-medium">Instan setelah pembayaran terverifikasi</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Ke menu Produk saya · {downloadLimit}x unduh · akses {validityDays} hari
                </p>
              </dd>

              <dt className="text-muted-foreground">Jaminan</dt>
              <dd className="flex flex-wrap gap-x-4 gap-y-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-accent" aria-hidden="true" /> QRIS resmi
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ServerCog className="size-4 text-accent" aria-hidden="true" /> Harga dihitung
                  server
                </span>
              </dd>

              {uniqueStock ? (
                <>
                  <dt className="text-muted-foreground">Stok</dt>
                  <dd className={soldOut ? "font-semibold text-destructive" : "font-medium"}>
                    {soldOut ? "Stok habis" : `Tersedia ${stock}`}
                  </dd>
                </>
              ) : null}
            </dl>

            <AccessPreview
              variantName={selectedVariant?.name ?? null}
              validityDays={validityDays}
              downloadLimit={downloadLimit}
              delivery={delivery}
            />

            {/* CTA inline hanya ≥sm; mobile memakai sticky bar agar tidak ganda. */}
            <div className="mt-5 hidden gap-3 sm:grid sm:grid-cols-2">
              {soldOut ? (
                <Button disabled className="min-h-11 sm:col-span-2">
                  Stok habis
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="min-h-11 border-primary text-primary hover:bg-primary/5 hover:text-primary"
                    onClick={handleAddToCart}
                    aria-label={`Tambah ${p.name} ke keranjang`}
                  >
                    <ShoppingCart className="size-4" aria-hidden="true" />
                    {cartAdded ? "Ditambahkan" : "Masukkan keranjang"}
                  </Button>
                  <Button asChild className="min-h-11">
                    <Link to="/checkout/produk/$slug" params={{ slug }} search={checkoutSearch}>
                      Beli sekarang
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* ===== Kartu toko: hanya statistik nyata ===== */}
        {store ? (
          <section
            aria-labelledby="penjual-judul"
            className="mt-4 rounded-xl border border-border bg-card p-4 sm:p-5"
          >
            <h2 id="penjual-judul" className="sr-only">
              Penjual
            </h2>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
              <div className="flex min-w-0 items-center gap-4 lg:w-[460px] lg:shrink-0 lg:border-r lg:border-border lg:pr-6">
                <div className="relative shrink-0">
                  {isRenderableImageUrl(store.logo_url) ? (
                    <img
                      src={store.logo_url!}
                      alt=""
                      loading="lazy"
                      className="size-16 rounded-full border border-border bg-surface object-cover sm:size-20"
                    />
                  ) : (
                    <span
                      className="grid size-16 place-items-center rounded-full border border-border bg-surface-selected font-display text-2xl font-bold text-primary sm:size-20"
                      aria-hidden="true"
                    >
                      {(store.name.trim()[0] ?? "?").toUpperCase()}
                    </span>
                  )}
                  {store.is_platform ? (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                      Official
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Dijual oleh</p>
                  <p className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-base font-semibold">{store.name}</span>
                    {store.is_platform ? (
                      <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Toko resmi" />
                    ) : null}
                  </p>
                  {/* Di HP ikon di atas label supaya tiga tombol muat sampai 320px. */}
                  <div className="mt-2.5 grid grid-cols-3 gap-2">
                    <ProductInquiryButton
                      productId={p.id}
                      productName={p.name}
                      isSellerProduct={isSellerProduct}
                      label="Chat"
                      className={cn(SELLER_ACTION, "border-primary bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary")}
                    />
                    <Button asChild variant="outline" className={SELLER_ACTION}>
                      <Link to="/toko/$slug" params={{ slug: store.slug }}>
                        <Store className="size-4" aria-hidden="true" /> Kunjungi
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={SELLER_ACTION}
                      onClick={openReviewForm}
                    >
                      <Star className="size-4" aria-hidden="true" /> Ulasan
                    </Button>
                  </div>
                </div>
              </div>

              <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                {[
                  {
                    label: "Penilaian",
                    value:
                      stats?.rating != null
                        ? `${stats.rating.toFixed(1)} ★ (${stats.reviews})`
                        : "Belum ada",
                  },
                  { label: "Produk", value: stats ? String(stats.products) : "—" },
                  {
                    label: "Terjual",
                    value: stats ? new Intl.NumberFormat("id-ID").format(stats.sold) : "—",
                  },
                  { label: "Bergabung", value: monthYearFmt.format(new Date(store.created_at)) },
                  { label: "Pengiriman", value: "Otomatis" },
                  { label: "Pembayaran", value: "QRIS" },
                ].map((s) => (
                  <div key={s.label} className="flex min-w-0 items-baseline justify-between gap-2">
                    <dt className="shrink-0 text-muted-foreground">{s.label}</dt>
                    <dd className="truncate text-right font-semibold tabular-nums text-price">
                      {s.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        ) : null}

        {/* ===== Konten + sidebar ===== */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_288px] lg:items-start">
          <div className="min-w-0 space-y-4">
            <nav
              aria-label="Bagian halaman"
              className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 text-sm"
            >
              {[
                ["#spesifikasi-produk", "Spesifikasi"],
                ["#deskripsi-produk", "Deskripsi"],
                ["#ulasan-produk", `Ulasan${reviewTotal ? ` (${reviewTotal})` : ""}`],
              ].map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  className="flex min-h-11 shrink-0 items-center rounded-lg px-4 font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
                >
                  {label}
                </a>
              ))}
            </nav>

            <section
              className="scroll-mt-24 rounded-xl border border-border bg-card p-4 sm:p-5"
              aria-labelledby="spesifikasi-produk"
              id="spesifikasi-produk"
            >
              <h2 className="text-base font-semibold">Spesifikasi produk</h2>
              <dl className="mt-3 divide-y divide-border text-sm">
                {specs.map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 py-2.5 sm:grid-cols-[160px_minmax(0,1fr)]"
                  >
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd className="break-words">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section
              className="scroll-mt-24 rounded-xl border border-border bg-card p-4 sm:p-5"
              aria-labelledby="deskripsi-produk-judul"
              id="deskripsi-produk"
            >
              <h2 id="deskripsi-produk-judul" className="text-base font-semibold">
                Deskripsi produk
              </h2>
              <div className="mt-4">
                <ProductDescription
                  text={
                    p.description ??
                    p.short_description ??
                    "Produk digital siap digunakan setelah pembayaran terverifikasi."
                  }
                />
              </div>
              {p.usage_notes ? (
                <div className="mt-6 rounded-lg border border-border bg-surface p-4">
                  <h3 className="text-sm font-semibold">Cara pakai</h3>
                  <p className="mt-2 whitespace-pre-line break-words text-sm leading-7 text-muted-foreground">
                    {p.usage_notes}
                  </p>
                </div>
              ) : null}
            </section>

            <ProductReviewPanel productId={p.id} />
          </div>

          {store ? <StoreProductsAside storeSlug={store.slug} currentId={p.id} /> : null}
        </div>

        {/* Sticky bar mobile: pusat tunggal aksi beli di <sm. */}
        <StickyActionBar className="sm:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              {discounted ? (
                <s className="block text-xs tabular-nums text-muted-foreground">
                  <span className="sr-only">Harga sebelumnya </span>
                  {formatRupiah(basePrice)}
                </s>
              ) : null}
              <p className="truncate text-base font-bold tabular-nums text-price">
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
                <Link to="/checkout/produk/$slug" params={{ slug }} search={checkoutSearch}>
                  Beli sekarang
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

/**
 * "Yang kamu dapat": pratinjau hak akses konkret bila membeli hari ini —
 * tanggal akses berakhir dihitung dari masa akses produk, bukan teks generik.
 * Tanggal dihitung di klien (useEffect) untuk menghindari mismatch hidrasi.
 */
function AccessPreview({
  variantName,
  validityDays,
  downloadLimit,
  delivery,
}: {
  variantName: string | null;
  validityDays: number;
  downloadLimit: number;
  delivery: Delivery;
}) {
  const [expiry, setExpiry] = useState<string | null>(null);
  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + validityDays);
    setExpiry(fullDateFmt.format(d));
  }, [validityDays]);

  const steps = [
    { icon: Wallet, label: "Bayar" },
    { icon: BadgeCheck, label: "Transaksi selesai" },
    { icon: Send, label: "Produk langsung terkirim" },
  ];
  const DeliveryIcon = delivery === "account" ? KeyRound : delivery === "code" ? Ticket : Download;

  return (
    <section
      aria-label="Yang kamu dapat jika beli hari ini"
      className="mt-5 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        Jika beli hari ini
      </p>
      <div className="mt-2 grid gap-3 text-sm min-[400px]:grid-cols-2">
        <p className="flex items-start gap-2">
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            Akses{variantName ? ` ${variantName}` : ""} aktif sampai{" "}
            <span className="font-semibold">{expiry ?? `${validityDays} hari`}</span>
          </span>
        </p>
        <p className="flex items-start gap-2">
          <DeliveryIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          {delivery === "account" ? (
            <span>
              <span className="font-semibold">Akun siap pakai</span>, tinggal salin email &amp; password
            </span>
          ) : delivery === "code" ? (
            <span>
              <span className="font-semibold">Kode/link</span>, tinggal salin dari Produk saya
            </span>
          ) : (
            <span>
              <span className="font-semibold">{downloadLimit}x</span> unduhan, tersimpan di akunmu
            </span>
          )}
        </p>
      </div>
      <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        {steps.map((s, i) => (
          <li key={s.label} className="flex min-w-0 items-center gap-1.5">
            {i > 0 ? <span className="h-px w-3 shrink-0 bg-primary/40" aria-hidden="true" /> : null}
            <s.icon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">{s.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Sidebar "Produk lain dari toko": data nyata dari pencarian katalog per toko. */
function StoreProductsAside({ storeSlug, currentId }: { storeSlug: string; currentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["store-products-aside", storeSlug],
    queryFn: () => listProducts({ data: { store: storeSlug, pageSize: 7 } }),
    staleTime: 60_000,
  });
  const items = (data?.items ?? []).filter((i) => i.id !== currentId).slice(0, 6);

  if (!isLoading && items.length === 0) return null;

  return (
    <aside
      aria-labelledby="produk-lain-toko"
      className="rounded-xl border border-border bg-card p-4 lg:sticky lg:top-24"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="produk-lain-toko" className="text-sm font-semibold">
          Produk lain dari toko
        </h2>
        <Link
          to="/toko/$slug"
          params={{ slug: storeSlug }}
          className="inline-flex min-h-11 items-center text-xs font-medium text-primary hover:underline"
        >
          Lihat semua
        </Link>
      </div>
      {isLoading ? (
        <div className="mt-2 space-y-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
          ))}
        </div>
      ) : (
        <ul className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
          {items.map((item) => {
            const thumb = isRenderableImageUrl(item.thumbnail_url) ? item.thumbnail_url : null;
            const base = Number(item.price);
            const final = effectivePrice(
              base,
              item.discount_price == null ? null : Number(item.discount_price),
            );
            return (
              <li key={item.id}>
                <Link
                  to="/produk/$slug"
                  params={{ slug: item.slug }}
                  className="flex min-h-16 items-center gap-3 rounded-lg p-2 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      loading="lazy"
                      className="size-14 shrink-0 rounded-md border border-border bg-surface object-cover"
                    />
                  ) : (
                    <span className="grid size-14 shrink-0 place-items-center rounded-md border border-border bg-surface-selected text-sm font-bold text-muted-foreground/50">
                      {(item.name.trim()[0] ?? "?").toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-xs font-medium leading-snug">
                      {item.name}
                    </span>
                    <span className="mt-1 block text-sm font-bold tabular-nums text-price">
                      {formatRupiah(final)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
