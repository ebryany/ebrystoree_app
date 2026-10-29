import { Component, Suspense, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { GraduationCap } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { RouteError } from "@/components/route-fallback";
import { HomeHero } from "@/components/home/hero";
import { SellerJoinSection } from "@/components/home/home-hero";
import { ReviewMarqueeSection } from "@/components/home/review-marquee-section";
import { SellerServiceCard } from "@/components/home/seller-service-card";
import { MarketplaceServiceCard } from "@/components/home/catalog-cards";
import { CardsSkeleton, SectionEmpty, SectionError } from "@/components/home/section-states";
import { PRODUCT_GRID, SeeAllLink, Shelf } from "@/components/ebry/product-shelf";
import { cn } from "@/lib/utils";
import { PopularSellers } from "@/components/ebry/popular-sellers";
import { RecentlyViewedShelf } from "@/components/ebry/recently-viewed-shelf";
import {
  listProductShelves,
  listServices,
  listPublicMarketplaceServices,
  listCatalogCategories,
} from "@/lib/catalog.functions";
import { CategoryRail } from "@/components/home/category-rail";

const shelvesQuery = queryOptions({
  queryKey: ["storefront-shelves"],
  queryFn: () => listProductShelves(),
  staleTime: 60_000,
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
      context.queryClient.ensureQueryData(shelvesQuery),
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
            fallback={
              <div className="h-14 animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none" />
            }
            queryKey={homeCategoriesQuery.queryKey}
          >
            <CategoryRail />
          </SectionSuspense>
          {/* Rak-rak ala marketplace: tiap rak bisa di-swipe, 2 kartu per layar di HP. */}
          <div className="mt-4 space-y-4">
            <RecentlyViewedShelf />
            <SectionSuspense
              fallback={<CardsSkeleton count={4} />}
              queryKey={shelvesQuery.queryKey}
            >
              <ProductShelves />
            </SectionSuspense>
            <PopularSellers />
            <section
              aria-labelledby="jasa-heading"
              className="@container rounded-2xl bg-card py-3.5 sm:py-4"
            >
              <div className="flex min-h-11 items-center justify-between gap-3 px-4 sm:px-5">
                <h2
                  id="jasa-heading"
                  className="flex items-center gap-2 text-base font-bold text-foreground sm:text-lg"
                >
                  <span className="h-4 w-1 rounded-full bg-accent" aria-hidden="true" />
                  Jasa seller
                </h2>
                <SeeAllLink to="/layanan" />
              </div>
              <SectionSuspense
                fallback={<CardsSkeleton count={3} />}
                queryKey={sellerServicesQuery.queryKey}
              >
                <SellerServicesSection />
              </SectionSuspense>
            </section>
          </div>
          <div className="defer-render">
            <ReviewMarqueeSection />
            {/* Layanan platform disembunyikan saat belum ada paket aktif: menampilkan
                section berisi "belum ada layanan" lebih merugikan daripada tidak tampil. */}
            <PlatformServicesSection />
          </div>
        </div>

        {/* Penutup homepage: ajakan seller dalam kartu ber-gutter, sama dengan
            container katalog di atasnya. Section "Cara memesan" dihapus karena
            mengganggu; pusat bantuan tetap terjangkau lewat menu navigasi. */}
        <div className="defer-render w-full px-4 pb-14 sm:px-6 lg:px-8">
          <SellerJoinSection stores={proofStores} />
        </div>
      </div>
    </PageShell>
  );
}

/**
 * Rak produk beranda: Terlaris, Terbaru, lalu satu rak per kategori.
 * Rak kosong tidak dirender, jadi beranda tetap rapi saat katalog masih sedikit.
 */
function ProductShelves() {
  const query = useSuspenseQuery(shelvesQuery);
  const data = query.data;
  if (data.error) {
    return <SectionError message={data.error} onRetry={() => query.refetch()} />;
  }
  if (!data.latest.length) {
    return (
      <SectionEmpty
        title="Belum ada produk tersedia."
        description="Produk yang sudah dipublikasikan akan tampil di sini."
      />
    );
  }
  // Rak kategori dengan 1–3 produk terlihat kosong di desktop dan produknya
  // sudah muncul di grid terbaru, jadi hanya kategori yang cukup isi ditampilkan.
  const categoryShelves = data.shelves.filter((s) => s.items.length >= MIN_CATEGORY_SHELF);
  return (
    <>
      <Shelf
        title="Produk terlaris"
        items={data.bestSellers}
        ranked
        action={<SeeAllLink to="/produk" />}
      />
      {categoryShelves.map((s) => (
        <Shelf
          key={s.slug}
          title={s.name}
          items={s.items}
          action={<SeeAllLink to="/produk" kategori={s.slug} />}
        />
      ))}
      <Shelf
        title="Produk terbaru"
        items={data.latest}
        layout="grid"
        action={<SeeAllLink to="/produk" />}
      />
    </>
  );
}

const MIN_CATEGORY_SHELF = 4;

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
    // Grid sama dengan kartu produk supaya ukuran kartu seragam di seluruh beranda.
    <ul className={cn("mt-1 px-4 sm:px-5", PRODUCT_GRID)}>
      {query.data.items.map((item) => (
        <li key={item.id} className="min-w-0">
          <SellerServiceCard item={item} />
        </li>
      ))}
    </ul>
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
