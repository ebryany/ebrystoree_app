import { Component, Suspense, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Briefcase, FileText, ListChecks, MessagesSquare, Wallet } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { RouteError } from "@/components/route-fallback";
import { HomeHero } from "@/components/home/hero";
import { SellerJoinSection } from "@/components/home/home-hero";
import { FaqSection, TrackingPreviewSection } from "@/components/home/sections";
import { ReviewMarqueeSection } from "@/components/home/review-marquee-section";
import { ServiceTile } from "@/components/home/service-tile";
import { PlatformServiceCard, type PlatformServiceItem } from "@/components/home/catalog-cards";
import { CardsSkeleton, SectionEmpty, SectionError } from "@/components/home/section-states";
import { PRODUCT_GRID, SeeAllLink } from "@/components/ebry/product-shelf";
import { FeaturedSellers } from "@/components/home/featured-sellers";
import { ProductTabs, type ProductTab } from "@/components/home/product-tabs";
import { SectionHeader } from "@/components/home/section-header";
import { RecentlyViewedShelf } from "@/components/ebry/recently-viewed-shelf";
import {
  listProductShelves,
  listServices,
  listPublicMarketplaceServices,
  listCatalogCategories,
} from "@/lib/catalog.functions";
import { CategoryRail } from "@/components/home/category-rail";
import { useWebsiteSettings } from "@/hooks/use-website-settings";
import { SITE_ORIGIN } from "@/lib/seo-url";

const shelvesQuery = queryOptions({
  queryKey: ["storefront-shelves"],
  queryFn: () => listProductShelves(),
  staleTime: 60_000,
});

const servicesQuery = queryOptions({
  queryKey: ["storefront-services", 4],
  queryFn: () => listServices({ data: { pageSize: 4 } }),
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
          "Marketplace produk digital dan jasa: template, akun premium, jasa website, desain, IT, sampai akademik. Bandingkan harga dan toko, bayar lewat QRIS.",
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
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Ebrystore | Marketplace Produk Digital" },
      {
        name: "twitter:description",
        content: "Cari produk digital dan layanan pendampingan akademik di Ebrystore.",
      },
    ],
    // og:url dan canonical diisi root dari seo_canonical_base.
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Ebrystore",
          url: `${SITE_ORIGIN}/`,
          inLanguage: "id-ID",
          description: "Marketplace produk digital dan layanan pendampingan akademik.",
          potentialAction: {
            "@type": "SearchAction",
            target: `${SITE_ORIGIN}/produk?q={search_term_string}`,
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
          url: `${SITE_ORIGIN}/`,
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
  const settings = useWebsiteSettings();
  const showProducts = settings.storefront_show_products !== false;
  const showServices = settings.storefront_show_services !== false;
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
      <HomeHero />
      {/* Urutan mengikuti cara orang belanja: kategori, lanjut yang terakhir
          dilihat, katalog produk, lalu jasa, toko, ulasan, dan ajakan buka toko. */}
      <div className="w-full px-4 pb-16 pt-8 sm:px-6 sm:pt-10 lg:px-8">
        <div className="mx-auto w-full max-w-7xl space-y-10 sm:space-y-14 2xl:max-w-[88rem]">
          <SectionSuspense
            fallback={
              <div className="h-32 animate-pulse rounded-xl bg-muted/60 motion-reduce:animate-none" />
            }
            queryKey={homeCategoriesQuery.queryKey}
          >
            <CategoryRail />
          </SectionSuspense>
          <RecentlyViewedShelf />
          {showProducts ? (
            <SectionSuspense fallback={<CardsSkeleton count={6} />} queryKey={shelvesQuery.queryKey}>
              <ProductShelves />
            </SectionSuspense>
          ) : null}
        </div>
      </div>

      {/* Jasa di pita sendiri: alur jasa (brief, pengerjaan, serah terima)
          berbeda dari produk instan, jadi dipisah secara visual. */}
      {showServices ? (
        <div className="w-full border-y border-border bg-surface px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="mx-auto w-full max-w-7xl space-y-10 sm:space-y-12 2xl:max-w-[88rem]">
            <section aria-labelledby="jasa-heading">
              <SectionHeader
                id="jasa-heading"
                title="Jasa seller"
                desc="Dikerjakan seller sesuai kesepakatan. Dana ditahan sampai hasil Anda terima."
                action={<SeeAllLink to="/layanan" />}
              />
              <SectionSuspense
                fallback={<CardsSkeleton count={3} />}
                queryKey={sellerServicesQuery.queryKey}
              >
                <SellerServicesSection />
              </SectionSuspense>
            </section>
            {/* Layanan platform disembunyikan saat belum ada paket aktif. */}
            <PlatformServicesSection />
          </div>
        </div>
      ) : null}

      <div className="w-full px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:px-8">
        <div className="defer-render mx-auto w-full max-w-7xl space-y-10 sm:space-y-14 2xl:max-w-[88rem]">
          <FeaturedSellers />
          <ReviewMarqueeSection />
          {settings.feature_home_tracking_preview !== false ? (
            <TrackingPreviewSection />
          ) : null}
          {settings.feature_home_faq !== false ? <FaqSection /> : null}
          <SellerJoinSection stores={proofStores} />
        </div>
      </div>
    </PageShell>
  );
}

function sortAndFeatureItems<T extends { id: string; slug?: string; price?: number; sold_count?: number }>(
  items: T[],
  featuredKeys: unknown,
  defaultSort: unknown,
): T[] {
  const featured = new Set(
    Array.isArray(featuredKeys) ? featuredKeys.map((v) => String(v).trim()).filter(Boolean) : [],
  );
  const sorted = [...items];
  if (defaultSort === "price_asc") {
    sorted.sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0));
  } else if (defaultSort === "price_desc") {
    sorted.sort((a, b) => Number(b.price ?? 0) - Number(a.price ?? 0));
  } else if (defaultSort === "popular") {
    sorted.sort((a, b) => Number(b.sold_count ?? 0) - Number(a.sold_count ?? 0));
  }
  if (!featured.size) return sorted;
  return [
    ...sorted.filter((item) => featured.has(item.id) || (item.slug ? featured.has(item.slug) : false)),
    ...sorted.filter((item) => !featured.has(item.id) && !(item.slug ? featured.has(item.slug) : false)),
  ];
}

/**
 * Rak produk beranda: Terlaris, Terbaru, lalu satu rak per kategori.
 * Rak kosong tidak dirender, jadi beranda tetap rapi saat katalog masih sedikit.
 */
function ProductShelves() {
  const websiteSettings = useWebsiteSettings();
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
  const latestItems = sortAndFeatureItems(
    data.latest,
    websiteSettings.storefront_featured_products,
    websiteSettings.storefront_default_sort,
  );
  // Satu section bertab menggantikan rak bertumpuk. Tab kategori hanya untuk
  // kategori yang cukup isi; sisanya tetap muncul di tab "Terbaru".
  const tabs: ProductTab[] = [
    { key: "latest", label: "Terbaru", items: latestItems },
    ...(data.bestSellers.length
      ? [{ key: "best", label: "Terlaris", items: data.bestSellers, ranked: true }]
      : []),
    ...data.shelves
      .filter((s) => s.items.length >= MIN_CATEGORY_TAB)
      .map((s) => ({ key: `c-${s.slug}`, label: s.name, items: s.items, kategori: s.slug })),
  ];
  return <ProductTabs tabs={tabs} />;
}

const MIN_CATEGORY_TAB = 2;

function SellerServicesSection() {
  const websiteSettings = useWebsiteSettings();
  const query = useSuspenseQuery(sellerServicesQuery);
  if (query.data.error)
    return <SectionError message={query.data.error} onRetry={() => query.refetch()} />;
  if (!query.data.items.length) {
    return (
      <SectionEmpty
        title="Belum ada jasa seller tersedia."
        description="Jasa yang disetujui dari toko dan kategori aktif akan tampil di sini."
      />
    );
  }
  const serviceItems = sortAndFeatureItems(
    query.data.items,
    websiteSettings.storefront_featured_services,
    websiteSettings.storefront_default_sort,
  );
  return (
    <ul className={PRODUCT_GRID}>
      {serviceItems.map((item) => (
        <li key={item.id} className="min-w-0">
          <ServiceTile item={item} />
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
  const [first, ...rest] = query.data.items as PlatformServiceItem[];
  return (
    <section aria-labelledby="layanan-heading">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Briefcase className="size-4" aria-hidden="true" /> Layanan dari platform
      </p>
      <SectionHeader
        id="layanan-heading"
        title="Jasa dikerjakan tim Ebrystore"
        desc="Website, desain, IT, konten, sampai tugas akademik. Pilih paket, kirim brief, pantau progres."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="min-w-0 sm:col-span-2">
          <PlatformServiceCard item={first} featured />
        </div>
        <OrderFlowPanel />
        {rest.map((item) => (
          <PlatformServiceCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

const ORDER_FLOW = [
  {
    icon: ListChecks,
    title: "Pilih paket",
    desc: "Harga dan durasi tiap paket terlihat sejak awal.",
  },
  { icon: FileText, title: "Kirim brief", desc: "Tulis kebutuhan, lampirkan referensi atau aset." },
  { icon: Wallet, title: "Bayar", desc: "Total dihitung sistem, lalu unggah bukti bayar." },
  {
    icon: MessagesSquare,
    title: "Pantau & terima",
    desc: "Progres, chat, dan hasil ada di dasbor pesanan.",
  },
] as const;

function OrderFlowPanel() {
  return (
    <aside
      aria-labelledby="alur-jasa-heading"
      className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 sm:col-span-2 lg:col-span-1"
    >
      <h3 id="alur-jasa-heading" className="text-sm font-semibold">
        Cara pesan jasa
      </h3>
      <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {ORDER_FLOW.map((step, i) => (
          <li key={step.title} className="flex min-w-0 gap-3">
            <span className="relative grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface text-primary">
              <step.icon className="size-4" aria-hidden="true" />
              <span className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {i + 1}
              </span>
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{step.title}</span>
              <span className="block text-xs leading-relaxed text-muted-foreground">
                {step.desc}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <Link
        to="/layanan"
        className="mt-4 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:mt-auto"
      >
        Lihat semua jasa
      </Link>
    </aside>
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
