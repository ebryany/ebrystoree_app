import { Component, Suspense, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronRight, GraduationCap } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { RouteError } from "@/components/route-fallback";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { HomeHero } from "@/components/home/hero";
import { SellerJoinSection } from "@/components/home/home-hero";
import { ReviewMarqueeSection } from "@/components/home/review-marquee-section";
import { SellerServiceCard } from "@/components/home/seller-service-card";
import { CompactProductCard } from "@/components/home/compact-product-card";
import { MarketplaceProductCard, MarketplaceServiceCard } from "@/components/home/catalog-cards";
import { CardsSkeleton, SectionEmpty, SectionError } from "@/components/home/section-states";
import { Button } from "@/components/ui/button";
import { listProducts, listServices, listPublicMarketplaceServices, listCatalogCategories } from "@/lib/catalog.functions";
import { CategoryRail } from "@/components/home/category-rail";

const productsQuery = queryOptions({
  queryKey: ["storefront-products", 12],
  queryFn: () => listProducts({ data: { pageSize: 12 } }),
});

const servicesQuery = queryOptions({
  queryKey: ["storefront-services", 3],
  queryFn: () => listServices({ data: { pageSize: 3 } }),
});

const sellerServicesQuery = queryOptions({
  queryKey: ["storefront-seller-services", 6],
  queryFn: () => listPublicMarketplaceServices({ data: { pageSize: 6 } }),
});

const homeCategoriesQuery = queryOptions({
  queryKey: ["categories", "service", "home"],
  queryFn: () => listCatalogCategories({ data: { kind: "service" } }),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ebrystore | Marketplace Produk Digital" },
      {
        name: "description",
        content:
          "Cari produk digital, bandingkan harga, dan lihat toko di Ebrystore. Tersedia juga layanan pendampingan akademik dari platform.",
      },
      {
        name: "keywords",
        content: "ebrystore, marketplace, produk digital, template, pendampingan akademik",
      },
      { property: "og:title", content: "Ebrystore | Marketplace Produk Digital" },
      {
        property: "og:description",
        content:
          "Pilih produk digital berdasarkan kategori, harga, dan toko. Pesanan tercatat di akunmu.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://ebrystore.my.id/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Ebrystore | Marketplace Produk Digital" },
      {
        name: "twitter:description",
        content: "Cari produk digital dan layanan pendampingan akademik di Ebrystore.",
      },
    ],
    links: [{ rel: "canonical", href: "https://ebrystore.my.id/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Ebrystore",
          url: "https://ebrystore.my.id/",
          inLanguage: "id-ID",
          description: "Marketplace produk digital dan layanan pendampingan akademik.",
          potentialAction: {
            "@type": "SearchAction",
            target: "https://ebrystore.my.id/produk?q={search_term_string}",
            "query-input": "required name=search_term_string",
          },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Ebrystore",
          url: "https://ebrystore.my.id/",
          description: "Platform produk digital dan layanan pendampingan akademik.",
        }),
      },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.allSettled([
      context.queryClient.ensureQueryData(productsQuery),
      context.queryClient.ensureQueryData(servicesQuery),
      context.queryClient.ensureQueryData(sellerServicesQuery),
      context.queryClient.ensureQueryData(homeCategoriesQuery),
    ]);
  },
  pendingMs: 200,
  pendingComponent: () => (
    <PageShell>
      <div className="bg-surface">
        <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
          <div className="pt-8">
            <CardsSkeleton count={6} />
          </div>
        </div>
      </div>
    </PageShell>
  ),
  component: Beranda,
  errorComponent: () => <RouteError />,
});

function Beranda() {
  // Bukti toko untuk section CTA seller: diambil dari katalog jasa yang memang
  // sudah dimuat homepage (tanpa query baru). De-duplikasi per slug, maks 6.
  const sellerServices = useSuspenseQuery(sellerServicesQuery);
  const proofStores = Array.from(
    new Map(
      (sellerServices.data.items ?? [])
        .map((item) => item.store)
        .filter((store): store is { name: string; slug: string } =>
          Boolean(store?.slug && store?.name),
        )
        .map((store) => [store.slug, store]),
    ).values(),
  ).slice(0, 6);

  return (
    <PageShell>
      {/* Hero pita lebar penuh: diletakkan di luar wadah berlebar tetap supaya
          latar gradiennya menyentuh tepi layar, bukan terkurung kotak. */}
      <HomeHero />
      <div className="bg-surface">
        {/* Lebar penuh dengan padding, sama seperti navbar: tepi kiri konten
            sejajar dengan logo di navbar, bukan lagi terkurung 1152px. */}
        <div className="w-full px-4 pb-10 pt-5 sm:px-6 sm:pt-6 lg:px-8">
          {/* Kategori jasa: pintu eksplorasi pertama setelah hero. Gagal/ kosong
              → tidak dirender (fallback minimal), navigasi tetap via /layanan. */}
          <SectionSuspense
            fallback={<div className="h-14 animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none" />}
            queryKey={homeCategoriesQuery.queryKey}
          >
            <CategoryRail />
          </SectionSuspense>
          <ReviewMarqueeSection />
          <section aria-labelledby="produk-heading" className="pt-8 sm:pt-10">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <div>
                <h2 id="produk-heading" className="text-xl font-bold sm:text-2xl">
                  Produk digital
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Lihat harga dan toko, lalu cek detail sebelum membeli.
                </p>
              </div>
              {/* Teks link, bukan tombol: aksi sekunder di header section. */}
              <Link
                to="/produk"
                className="group inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Lihat semua
                <ChevronRight
                  className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </Link>
            </div>
            <SectionSuspense
              fallback={<CardsSkeleton count={4} />}
              queryKey={productsQuery.queryKey}
            >
              <ProductsSection />
            </SectionSuspense>
          </section>
          <section aria-labelledby="jasa-heading" className="pt-8 sm:pt-10">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="jasa-heading" className="text-xl font-bold sm:text-2xl">
                  Jasa seller
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Bandingkan harga, durasi, dan kesepakatan jasa dari toko sebelum memesan.
                </p>
              </div>
              <Button asChild variant="outline" className="min-h-11 rounded-control">
                <Link to="/layanan">Semua jasa</Link>
              </Button>
            </div>
            <SectionSuspense
              fallback={<CardsSkeleton count={3} />}
              queryKey={sellerServicesQuery.queryKey}
            >
              <SellerServicesSection />
            </SectionSuspense>
          </section>
          {/* Layanan platform disembunyikan saat belum ada paket aktif: menampilkan
              section berisi "belum ada layanan" lebih merugikan daripada tidak tampil. */}
          <PlatformServicesSection />
        </div>

        {/* Penutup homepage: ajakan seller dalam kartu ber-gutter, sama dengan
            container katalog di atasnya. Section "Cara memesan" dihapus karena
            mengganggu; pusat bantuan tetap terjangkau lewat menu navigasi. */}
        <div className="w-full px-4 pb-14 sm:px-6 lg:px-8">
          <SellerJoinSection stores={proofStores} />
        </div>
      </div>
    </PageShell>
  );
}

/**
 * Deret kartu produk di beranda.
 *
 * Dua mode, dipilih dari JUMLAH item (bukan ditebak dari lebar layar):
 *
 * 1. Sedikit (<= 4 item): grid. Carousel dengan 2 kartu menyisakan ruang kosong
 *    selebar ~50% container dan menampilkan panah yang keduanya `disabled`,
 *    karena tidak ada yang bisa digulir. Grid membuat kartu mengisi baris
 *    dengan proporsi wajar, tanpa navigasi palsu.
 *
 * 2. Banyak (> 4 item): carousel. Kartu memakai lebar tetap dan sisanya
 *    digulir, sehingga tidak ada kartu yang membengkak memenuhi layar.
 *
 * Ambang 4 dipilih karena itu jumlah kolom maksimum di desktop: dengan <= 4
 * item semuanya muat satu baris sehingga tidak ada yang perlu digulir.
 */
function ProductsSection() {
  const query = useSuspenseQuery(productsQuery);
  if (query.data.error) {
    return <SectionError message={query.data.error} onRetry={() => query.refetch()} />;
  }
  if (query.data.items.length === 0) {
    return (
      <SectionEmpty
        title="Belum ada produk tersedia."
        description="Produk yang sudah dipublikasikan akan tampil di sini."
      />
    );
  }

  const items = query.data.items;
  const useGrid = items.length <= 4;

  return (
    <>
      {/* Mobile (<640px): rail scroll native tanpa JS carousel — kartu compact
          dengan snap, kartu berikutnya terlihat sebagian sebagai affordance
          swipe. Full-bleed -mx-4 supaya kartu pertama sejajar konten sambil
          menyisakan peek kartu berikutnya. */}
      <div
        role="region"
        aria-label="Daftar produk digital"
        tabIndex={0}
        className="relative -mx-4 snap-x snap-proximity overflow-x-auto overscroll-x-contain scroll-px-4 px-4 pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden"
      >
        <ul className="flex w-max gap-2.5">
          {items.map((item) => (
            <li key={item.id} className="w-[clamp(205px,68vw,252px)] shrink-0 snap-start">
              <CompactProductCard item={item} />
            </li>
          ))}
        </ul>
      </div>

      {/* Tablet/desktop (>=640px): perilaku existing dipertahankan — grid
          untuk <=4 produk, carousel dengan panah untuk lebih dari itu. */}
      {useGrid ? (
        <div className="hidden sm:flex flex-wrap justify-center gap-4">
          {items.map((item) => (
            <div key={item.id} className="w-[272px]">
              <MarketplaceProductCard item={item} variant="home" spotlight />
            </div>
          ))}
        </div>
      ) : (
        <div className="relative hidden sm:block">
          <Carousel opts={{ align: "start", slidesToScroll: 1 }} className="w-full">
            <CarouselContent className="-ml-4">
              {items.map((item) => (
                <CarouselItem
                  key={item.id}
                  className="basis-full pl-4 sm:basis-[288px]"
                >
                  <MarketplaceProductCard item={item} variant="home" spotlight />
                </CarouselItem>
              ))}
            </CarouselContent>
            {/* Panah melayang di tepi kiri/kanan, setengah keluar dari deret kartu. */}
            <CarouselPrevious className="-left-3 size-10 rounded-full border-border bg-card shadow-card hover:bg-surface-selected sm:-left-5" />
            <CarouselNext className="-right-3 size-10 rounded-full border-border bg-card shadow-card hover:bg-surface-selected sm:-right-5" />
          </Carousel>
        </div>
      )}
    </>
  );
}

function SellerServicesSection() {
  const query = useSuspenseQuery(sellerServicesQuery);
  if (query.data.error)
    return <SectionError message={query.data.error} onRetry={() => query.refetch()} />;
  if (!query.data.items.length)
    return (
      <SectionEmpty
        title="Belum ada jasa seller tersedia."
        description="Jasa yang disetujui dari toko dan kategori aktif akan tampil di sini."
      />
    );
  return (
    <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
      {query.data.items.map((item) => (
        // Sama seperti kartu produk: satu kolom di mobile, lebar tetap mulai sm.
        <div key={item.id} className="w-full sm:w-[272px]">
          <SellerServiceCard item={item} variant="home" />
        </div>
      ))}
    </div>
  );
}

/**
 * Layanan platform (pendampingan akademik).
 *
 * Section ini hanya tampil bila ada paket aktif. Saat katalognya kosong, tidak
 * ada yang dirender sama sekali, bukan menampilkan keadaan kosong ke pengunjung.
 */
function PlatformServicesSection() {
  const query = useSuspenseQuery(servicesQuery);
  if (query.data.error || query.data.items.length === 0) return null;
  return (
    <section
      aria-labelledby="layanan-heading"
      className="mt-10 border-t border-border pt-8 sm:mt-12"
    >
      <div className="mb-5 max-w-xl">
        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <GraduationCap className="size-4" aria-hidden="true" /> Layanan dari platform
        </p>
        <h2 id="layanan-heading" className="text-xl font-bold sm:text-2xl">
          Pendampingan akademik
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Berbeda dari produk siap pakai. Pilih paket, kirim kebutuhan, dan pantau progres
          pengerjaan.
        </p>
      </div>
      <div className="mx-auto grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {query.data.items.map((item) => (
          <MarketplaceServiceCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

type ErrorBoundaryProps = { children: ReactNode; onReset: () => void };
type ErrorBoundaryState = { hasError: boolean };

class SectionErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <SectionError
          message="Bagian ini gagal dimuat."
          onRetry={() => {
            this.props.onReset();
            this.setState({ hasError: false });
          }}
        />
      );
    }
    return this.props.children;
  }
}

function SectionSuspense({
  children,
  fallback,
  queryKey,
}: {
  children: ReactNode;
  fallback: ReactNode;
  queryKey: readonly unknown[];
}) {
  const queryClient = useQueryClient();
  return (
    <Suspense fallback={fallback}>
      <SectionErrorBoundary
        onReset={() => {
          void queryClient.resetQueries({ queryKey });
        }}
      >
        {children}
      </SectionErrorBoundary>
    </Suspense>
  );
}
