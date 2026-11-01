import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import {
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  Clock,
  MessageCircle,
  Package,
  Pencil,
  Search,
  Star,
  Store,
  X,
} from "lucide-react";

import { ServiceTile } from "@/components/home/service-tile";
import {
  GLASS_SECTION,
  PRODUCT_GRID,
  ProductTile,
  Shelf,
  type ProductTileItem,
} from "@/components/ebry/product-shelf";
import { EmptyState } from "@/components/ebry/states";
import { PageShell } from "@/components/page-shell";
import { RouteError, routeFailureHead } from "@/components/route-fallback";
import { ogImageUrl } from "@/lib/seo-url";
import { OnlineDot, PresenceLabel } from "@/components/ebry/online-status";
import { useStorePresence } from "@/hooks/use-store-presence";
import { StoreProfileEditor, type StoreEditorDraft } from "@/components/store/store-profile-editor";
import {
  FollowStoreButton,
  StoreChatButton,
  formatCount,
  useStoreSocial,
} from "@/components/store/social-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { priceDetails } from "@/lib/format";
import { getPublicStore } from "@/lib/seller.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/toko/$slug")({
  head: ({ loaderData, match, matches }) => {
    const failureHead = routeFailureHead([...matches, match], "Toko tidak ditemukan | Ebrystore");
    if (failureHead) return failureHead;
    const store = (loaderData as any)?.store;
    const title = store ? `${store.name} — Ebrystore` : "Toko tidak ditemukan — Ebrystore";
    const description =
      store?.description?.trim() ||
      (store
        ? `Belanja produk digital dan jasa dari ${store.name} di Ebrystore.`
        : "Toko di Ebrystore.");
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        ...(ogImageUrl(store?.logo_url)
          ? [{ property: "og:image", content: ogImageUrl(store?.logo_url)! }]
          : []),
        { name: "twitter:card", content: store?.logo_url ? "summary_large_image" : "summary" },
      ],
    };
  },
  loader: async ({ params }) => {
    const result = await getPublicStore({ data: { slug: params.slug } });
    if (result.error) throw new Error("Toko tidak dapat dimuat.");
    if (!result.store) throw notFound();
    return result;
  },
  pendingComponent: () => (
    <PageShell>
      <div
        className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6"
        role="status"
        aria-label="Memuat toko"
      >
        <span className="sr-only">Memuat toko…</span>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="h-28 animate-pulse bg-muted motion-reduce:animate-none sm:h-40" />
          <div className="space-y-3 p-4">
            <div className="-mt-12 size-20 rounded-full border-4 border-card bg-muted" />
            <div className="h-5 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="h-14 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
          </div>
        </div>
        <div className={cn("mt-6", PRODUCT_GRID)}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="aspect-[3/4] animate-pulse rounded-xl bg-muted motion-reduce:animate-none"
            />
          ))}
        </div>
      </div>
    </PageShell>
  ),
  errorComponent: () => (
    <RouteError message="Toko belum dapat dimuat. Muat ulang halaman untuk mencoba lagi." />
  ),
  notFoundComponent: () => (
    <PageShell>
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-12 text-center">
        <Store className="size-10 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold">Toko tidak ditemukan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Toko ini belum aktif atau tidak tersedia.
        </p>
        <Button asChild className="mt-5 min-h-11">
          <Link to="/">Kembali ke beranda</Link>
        </Button>
      </div>
    </PageShell>
  ),
  component: Storefront,
});

type SortKey = "newest" | "price_asc" | "price_desc" | "popular";
type StoreTab = "home" | "produk" | "jasa";

/** Satu angka ringkas di header: nilai besar di atas, label kecil di bawah. */
function StoreStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col-reverse items-center gap-0.5 px-1 py-2.5 text-center">
      <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1 truncate text-base font-bold tabular-nums text-foreground">
        {children}
      </dd>
    </div>
  );
}

function SectionHeading({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <h2
        id={id}
        className="flex items-center gap-2 text-base font-bold text-foreground sm:text-lg"
      >
        <span className="h-4 w-1 rounded-full bg-accent" aria-hidden="true" />
        {title}
      </h2>
      {children}
    </div>
  );
}

const SORT_LABEL: Record<SortKey, string> = {
  newest: "Terbaru",
  popular: "Terlaris",
  price_asc: "Harga terendah",
  price_desc: "Harga tertinggi",
};

/** Batas produk di tab "Beranda"; sisanya lewat tab Produk. */
const HOME_PRODUCT_LIMIT = 12;

function priceOf(item: { price: number | string; discount_price?: number | string | null }) {
  return priceDetails(item.price, item.discount_price).price;
}

// Di halaman toko sendiri baris penjual pada kartu tidak berguna, jadi
// store_name sengaja tidak diisi (ProductTile menyembunyikan barisnya).
function toTile(item: any): ProductTileItem {
  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    thumbnail_url: item.thumbnail_url ?? null,
    price: item.price,
    discount_price: item.discount_price ?? null,
    sold_count: Number(item.sold_count ?? 0),
  };
}

function Storefront() {
  const router = useRouter();
  const { store, products, services, rating, soldCount, hasMoreProducts, isOwner } =
    Route.useLoaderData() as any;
  const presence = useStorePresence(store?.id, store?.presence);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [descOpen, setDescOpen] = useState(false);
  // Editor kontekstual: draft terpisah dari data published (loader). Preview
  // hanya mengubah tampilan sesi ini; buyer lain dan SSR tetap melihat data
  // publik. Setelah simpan, editor memicu refetch loader via router invalidate.
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<StoreEditorDraft | null>(null);

  const view = draft ?? {
    name: store.name,
    description: store.description ?? "",
    logoUrl: store.logo_url ?? "",
    bannerUrl: store.banner_url ?? "",
    bannerPosition: Number(store.banner_position ?? 50),
  };

  const term = query.trim().toLowerCase();

  const visibleProducts = useMemo(() => {
    const filtered = term
      ? products.filter(
          (item: any) =>
            String(item.name).toLowerCase().includes(term) ||
            String(item.short_description ?? "")
              .toLowerCase()
              .includes(term),
        )
      : products;
    const sorted = [...filtered];
    if (sort === "price_asc") sorted.sort((a, b) => priceOf(a) - priceOf(b));
    else if (sort === "price_desc") sorted.sort((a, b) => priceOf(b) - priceOf(a));
    else if (sort === "popular")
      sorted.sort((a, b) => Number(b.sold_count ?? 0) - Number(a.sold_count ?? 0));
    return sorted;
  }, [products, term, sort]);

  // Rak terlaris hanya dari produk yang benar-benar pernah terjual.
  const bestSellers = useMemo(
    () =>
      products
        .filter((item: any) => Number(item.sold_count ?? 0) > 0)
        .sort((a: any, b: any) => Number(b.sold_count ?? 0) - Number(a.sold_count ?? 0))
        .slice(0, 10)
        .map(toTile),
    [products],
  );

  const visibleServices = useMemo(() => {
    if (!term) return services;
    return services.filter(
      (item: any) =>
        String(item.name).toLowerCase().includes(term) ||
        String(item.agreement?.scope ?? "")
          .toLowerCase()
          .includes(term),
    );
  }, [services, term]);

  const joined = store.created_at
    ? new Date(store.created_at).toLocaleDateString("id-ID", { month: "long", year: "numeric" })
    : null;
  const initial =
    String(view.name ?? "?")
      .trim()
      .charAt(0)
      .toUpperCase() || "?";
  const whatsapp = typeof store.contact_phone === "string" ? store.contact_phone.trim() : "";
  const whatsappHref = whatsapp ? `https://wa.me/${whatsapp.replace(/[^\d]/g, "")}` : null;
  const hasAnyListing = products.length > 0 || services.length > 0;
  const isFiltered = Boolean(term);
  const noResult = isFiltered && visibleProducts.length === 0 && visibleServices.length === 0;
  const isPreviewing = draft !== null;
  const description = String(view.description ?? "").trim();
  const longDescription = description.length > 140 || description.split("\n").length > 2;

  const social = useStoreSocial(store.id).data?.social ?? null;
  // Ringkasan sosial juga menghitung produk platform untuk toko resmi.
  const ratingTotal = social ? social.rating_total : Number(rating.total) || 0;
  const ratingAverage = social ? social.rating_average : Number(rating.average) || 0;

  const [tab, setTab] = useState<StoreTab>("home");
  const tabs: Array<{ key: StoreTab; label: string; count?: number }> = [
    { key: "home", label: "Beranda" },
    { key: "produk", label: "Produk", count: products.length },
    ...(services.length > 0
      ? [{ key: "jasa" as const, label: "Jasa", count: services.length }]
      : []),
  ];
  const showServices = tab !== "produk";
  const showProducts = tab !== "jasa";
  const productLimit = tab === "produk" || isFiltered ? Infinity : HOME_PRODUCT_LIMIT;
  const showBestSellers = tab === "home" && !isFiltered && bestSellers.length >= 3;

  const openEditor = () => {
    setDraft({
      name: store.name ?? "",
      description: store.description ?? "",
      logoUrl: store.logo_url ?? "",
      bannerUrl: store.banner_url ?? "",
      bannerPosition: Number(store.banner_position ?? 50),
    });
    setEditorOpen(true);
  };

  return (
    <PageShell>
      <div className="min-h-[60vh] bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
          {/* Header toko. Saat editor terbuka, header menampilkan DRAFT
              (pratinjau lokal); data publik di server belum berubah. */}
          <header className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="relative h-28 overflow-hidden sm:h-44" aria-hidden="true">
              {view.bannerUrl ? (
                <img
                  src={view.bannerUrl}
                  alt=""
                  className="size-full object-cover"
                  style={{ objectPosition: `50% ${view.bannerPosition}%` }}
                />
              ) : (
                <div className={cn("size-full", GLASS_SECTION)} />
              )}
            </div>

            <div className="grid gap-x-6 px-4 pb-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-6 sm:pb-5">
              <span className="relative -mt-10 w-fit sm:-mt-12">
                <span className="grid size-20 place-items-center overflow-hidden rounded-full border-4 border-card bg-surface-selected text-3xl font-bold text-accent shadow-sm sm:size-24">
                  {view.logoUrl ? (
                    <img src={view.logoUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <span aria-hidden="true">{initial}</span>
                  )}
                </span>
                <OnlineDot presence={presence} className="bottom-1.5 right-1.5" />
              </span>

              <div className="mt-2 min-w-0 sm:col-start-1">
                <h1 className="flex flex-wrap items-center gap-x-1.5 break-words text-xl font-bold leading-tight sm:text-2xl">
                  {view.name}
                  {store.is_platform ? (
                    <BadgeCheck className="size-5 shrink-0 text-accent" aria-label="Toko resmi" />
                  ) : null}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <PresenceLabel presence={presence} />
                  {store.is_platform ? (
                    <span className="rounded bg-accent/10 px-1.5 py-0.5 font-semibold text-accent">
                      Toko resmi Ebrystore
                    </span>
                  ) : null}
                  {isPreviewing ? (
                    <span className="rounded border border-border px-1.5 py-0.5 font-semibold">
                      Pratinjau
                    </span>
                  ) : null}
                  {joined ? (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="size-3.5" aria-hidden="true" />
                      {`Toko ini bergabung ${joined}`}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Aksi: di HP penuh lebar di bawah nama, di desktop sejajar nama. */}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:col-start-2 sm:row-start-2 sm:mt-2 sm:flex sm:self-start">
                {isOwner ? (
                  // Hanya untuk pemilik toko aktif (isOwner dihitung server).
                  // Otorisasi diverifikasi ulang server saat simpan.
                  <Button variant="outline" className="col-span-2 min-h-11" onClick={openEditor}>
                    <Pencil className="size-4" aria-hidden="true" />
                    Edit toko
                  </Button>
                ) : (
                  <>
                    <FollowStoreButton storeId={store.id} className="w-full sm:w-auto" />
                    <StoreChatButton
                      storeId={store.id}
                      storeName={store.name}
                      isPlatform={Boolean(store.is_platform)}
                      className="w-full sm:w-auto"
                    />
                  </>
                )}
              </div>

              {description ? (
                <div className="mt-3 max-w-3xl sm:col-span-2">
                  <p
                    id="deskripsi-toko"
                    className={cn(
                      "whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground",
                      longDescription && !descOpen && "line-clamp-2",
                    )}
                  >
                    {description}
                  </p>
                  {longDescription ? (
                    <button
                      type="button"
                      aria-expanded={descOpen}
                      aria-controls="deskripsi-toko"
                      onClick={() => setDescOpen((v) => !v)}
                      className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {descOpen ? "Ringkas" : "Selengkapnya"}
                      <ChevronDown
                        className={cn("size-3.5 transition-transform", descOpen && "rotate-180")}
                        aria-hidden="true"
                      />
                    </button>
                  ) : null}
                </div>
              ) : null}

              {/* Statistik nyata saja; angka sosial dimuat terpisah (klien). */}
              <dl className="mt-4 grid grid-cols-4 divide-x divide-border rounded-xl border border-border bg-surface sm:col-span-2 sm:max-w-2xl">
                <StoreStat
                  label={
                    ratingTotal > 0 ? `${formatCount(ratingTotal)} ulasan` : "Belum ada ulasan"
                  }
                >
                  <Star className="size-4 fill-warning text-warning" aria-hidden="true" />
                  {ratingTotal > 0 ? ratingAverage.toFixed(1) : "–"}
                </StoreStat>
                <StoreStat label="Terjual">
                  {soldCount > 0 ? formatCount(soldCount) : "0"}
                </StoreStat>
                <StoreStat label={services.length > 0 ? "Produk & jasa" : "Produk"}>
                  {products.length + services.length}
                </StoreStat>
                <StoreStat label="Pengikut">
                  {social ? formatCount(social.followers) : "–"}
                </StoreStat>
              </dl>

              {whatsappHref ? (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex min-h-11 w-fit items-center gap-1.5 text-xs font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring sm:col-span-2"
                >
                  <MessageCircle className="size-4" aria-hidden="true" />
                  Hubungi penjual via WhatsApp
                </a>
              ) : null}
            </div>
          </header>

          {/* Tab + pencarian + urutan dalam satu bilah. */}
          <div className="mt-3 rounded-2xl border border-border bg-card p-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <nav
                aria-label="Bagian toko"
                className="flex gap-1 rounded-xl bg-muted p-1 sm:w-auto"
              >
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    aria-pressed={tab === t.key}
                    onClick={() => setTab(t.key)}
                    className={cn(
                      "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring sm:flex-none",
                      tab === t.key
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.label}
                    {t.count !== undefined ? (
                      <span className="text-xs tabular-nums text-muted-foreground">{t.count}</span>
                    ) : null}
                  </button>
                ))}
              </nav>
              {hasAnyListing ? (
                <div className="relative min-w-0 flex-1 sm:ml-auto sm:max-w-xs">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Cari di toko ini"
                    aria-label="Cari di toko ini"
                    className="min-h-11 rounded-xl pl-9 pr-10 text-base sm:text-sm [&::-webkit-search-cancel-button]:hidden"
                    maxLength={80}
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Hapus pencarian"
                      className="absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center text-muted-foreground"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            {showProducts && products.length > 1 ? (
              <div
                role="group"
                aria-label="Urutkan produk"
                className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={sort === key}
                    onClick={() => setSort(key)}
                    className={cn(
                      "min-h-11 shrink-0 rounded-full border px-3.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                      sort === key
                        ? "border-transparent bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-accent/50 hover:text-foreground",
                    )}
                  >
                    {SORT_LABEL[key]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {noResult ? (
            <div className="mt-4">
              <EmptyState
                icon={Search}
                title="Tidak ada yang cocok"
                description={`Tidak ada produk atau jasa yang cocok dengan "${query.trim()}". Coba kata kunci lain.`}
              />
            </div>
          ) : null}

          <div className="mt-4 space-y-4">
            {showBestSellers ? (
              <Shelf
                title="Terlaris di toko ini"
                items={bestSellers}
                ranked
                onSeeAll={() => {
                  setTab("produk");
                  setSort("popular");
                }}
              />
            ) : null}

            {/* Jasa ditampilkan sebelum produk karena butuh keputusan lebih dulu. */}
            {!noResult && showServices && visibleServices.length > 0 ? (
              <section
                aria-labelledby="jasa-toko"
                className="rounded-2xl bg-card px-4 py-3.5 sm:px-5 sm:py-4"
              >
                <SectionHeading id="jasa-toko" title="Jasa dari toko ini">
                  <Link
                    to="/layanan"
                    className="flex min-h-11 shrink-0 items-center text-xs font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    Katalog jasa
                  </Link>
                </SectionHeading>
                <ul className={cn("mt-1", PRODUCT_GRID)}>
                  {visibleServices.map((item: any) => (
                    <li key={item.id} className="min-w-0">
                      <ServiceTile item={item} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {!noResult && showProducts ? (
              <section
                aria-labelledby="produk-toko"
                className="rounded-2xl bg-card px-4 py-3.5 sm:px-5 sm:py-4"
              >
                <SectionHeading
                  id="produk-toko"
                  title={
                    tab === "home" && sort === "newest" && !isFiltered
                      ? "Produk terbaru"
                      : "Produk digital"
                  }
                >
                  {isFiltered ? (
                    <p
                      className="shrink-0 text-xs tabular-nums text-muted-foreground"
                      aria-live="polite"
                    >
                      {visibleProducts.length} hasil
                    </p>
                  ) : null}
                </SectionHeading>
                {products.length === 0 ? (
                  <div className="mt-1 flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-10">
                    <Package className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">
                      Toko ini belum punya produk digital aktif.
                    </p>
                  </div>
                ) : visibleProducts.length === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">
                    Tidak ada produk yang cocok dengan pencarian.
                  </p>
                ) : (
                  <>
                    {/* Kartu dan grid sama dengan beranda dan /produk (ProductTile). */}
                    <ul className={cn("mt-1", PRODUCT_GRID)}>
                      {visibleProducts.slice(0, productLimit).map((item: any) => (
                        <li key={item.id} className="min-w-0">
                          <ProductTile item={toTile(item)} />
                        </li>
                      ))}
                    </ul>
                    {visibleProducts.length > productLimit ? (
                      <div className="mt-4 flex justify-center">
                        <Button
                          variant="outline"
                          className="min-h-11"
                          onClick={() => setTab("produk")}
                        >
                          Tampilkan semua {visibleProducts.length} produk
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
                {hasMoreProducts && !isFiltered ? (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3.5" aria-hidden="true" />
                    Menampilkan 48 produk terbaru. Produk lain tersedia lewat katalog.
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>

          {!hasAnyListing ? (
            <div className="mt-4">
              <EmptyState
                icon={Package}
                title="Toko ini belum menjual apa pun"
                description="Produk digital dan jasa yang disetujui akan muncul di sini."
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Editor kontekstual: dibuka pemilik toko dari tombol Edit. */}
      {isOwner && draft ? (
        <StoreProfileEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          store={{
            slug: store.slug,
            name: store.name ?? "",
            description: store.description ?? null,
            logo_url: store.logo_url ?? null,
            banner_url: store.banner_url ?? null,
            banner_position: store.banner_position ?? null,
          }}
          draft={draft}
          onDraftChange={setDraft}
          onSaved={async () => {
            // Simpan sudah sukses di server. Tunggu loader mengambil data baru
            // sebelum membuang draft supaya header tidak flash ke data lama.
            // Kalau refetch gagal, draft dipertahankan sampai refetch berikutnya.
            try {
              await router.invalidate();
              setDraft(null);
            } catch {
              // Data server sudah benar; hanya pembacaan ulang yang gagal.
            }
          }}
        />
      ) : null}
    </PageShell>
  );
}
