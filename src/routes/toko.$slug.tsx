import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import {
  BadgeCheck,
  CalendarDays,
  Clock,
  Heart,
  MessageCircle,
  Package,
  Pencil,
  Search,
  ShoppingBag,
  Star,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";

import { MarketplaceProductCard } from "@/components/home/catalog-cards";
import { SellerServiceCard } from "@/components/home/seller-service-card";
import { EmptyState } from "@/components/ebry/states";
import { PageShell } from "@/components/page-shell";
import { RouteError, routeFailureHead } from "@/components/route-fallback";
import { StoreProfileEditor, type StoreEditorDraft } from "@/components/store/store-profile-editor";
import {
  FollowStoreButton,
  StoreChatButton,
  formatCount,
  useStoreSocial,
} from "@/components/store/social-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
        ...(store?.logo_url ? [{ property: "og:image", content: store.logo_url }] : []),
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
      <div className="mx-auto w-full max-w-6xl px-4 py-8" role="status" aria-label="Memuat toko">
        <span className="sr-only">Memuat toko…</span>
        <div className="h-28 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-52 animate-pulse rounded-xl bg-muted motion-reduce:animate-none"
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

function StoreStat({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 truncate font-semibold tabular-nums text-accent">{children}</dd>
    </div>
  );
}

const SORT_LABEL: Record<SortKey, string> = {
  newest: "Terbaru",
  price_asc: "Harga terendah",
  price_desc: "Harga tertinggi",
  popular: "Terlaris",
};

function priceOf(item: { price: number | string; discount_price?: number | string | null }) {
  const base = Number(item.price);
  const discount = Number(item.discount_price);
  if (Number.isFinite(discount) && discount > 0 && discount < base) return discount;
  return Number.isFinite(base) ? base : 0;
}

function Storefront() {
  const router = useRouter();
  const { store, products, services, rating, soldCount, hasMoreProducts, isOwner } =
    Route.useLoaderData() as any;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
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

  const social = useStoreSocial(store.id).data?.social ?? null;
  // Ringkasan sosial juga menghitung produk platform untuk toko resmi.
  const ratingTotal = social ? social.rating_total : Number(rating.total) || 0;
  const ratingAverage = social ? social.rating_average : Number(rating.average) || 0;

  const [tab, setTab] = useState<StoreTab>("home");
  const tabs: Array<{ key: StoreTab; label: string; count?: number }> = [
    { key: "home", label: "Halaman Utama" },
    { key: "produk", label: "Produk", count: products.length },
    ...(services.length > 0
      ? [{ key: "jasa" as const, label: "Jasa", count: services.length }]
      : []),
  ];
  const showServices = tab !== "produk";
  const showProducts = tab !== "jasa";
  const productLimit = tab === "produk" ? Infinity : 8;

  return (
    <PageShell>
      <div className="min-h-[60vh] bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          {/* Header toko: identitas dan bukti yang bisa diverifikasi.
              Saat editor terbuka, header menampilkan DRAFT (pratinjau lokal);
              data publik di server belum berubah. */}
          <header className="grid gap-3 rounded-2xl border border-border bg-card p-3 sm:p-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:gap-6">
            {/* Kartu identitas: banner gelap + logo + aksi utama. Overlay hitam
                tetap dipakai di atas banner apa pun agar teks putih terbaca. */}
            <div className="relative isolate overflow-hidden rounded-xl bg-accent-gradient">
              {view.bannerUrl ? (
                <>
                  <img
                    src={view.bannerUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 -z-10 size-full object-cover"
                    style={{ objectPosition: `50% ${view.bannerPosition}%` }}
                  />
                  <div className="absolute inset-0 -z-10 bg-accent-gradient opacity-75" aria-hidden="true" />
                </>
              ) : null}
              <div className="p-4 text-white">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-white/80 bg-surface-selected text-2xl font-bold text-accent sm:size-[72px]">
                    {view.logoUrl ? (
                      <img src={view.logoUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <span aria-hidden="true">{initial}</span>
                    )}
                  </span>
                  <div className="min-w-0">
                    <h1 className="break-words text-lg font-bold leading-tight sm:text-xl">
                      {view.name}
                    </h1>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {store.is_platform ? (
                        <span className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-accent">
                          <BadgeCheck className="size-3" aria-hidden="true" />
                          Official
                        </span>
                      ) : null}
                      {isPreviewing ? (
                        <span className="rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-semibold">
                          Pratinjau
                        </span>
                      ) : null}
                      <span className="truncate text-xs text-white/90">/toko/{store.slug}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {isOwner ? (
                    // Hanya untuk pemilik toko aktif (isOwner dihitung server).
                    // Otorisasi diverifikasi ulang server saat simpan.
                    <Button
                      variant="outline"
                      className="col-span-2 min-h-11 border-white/70 bg-transparent text-white hover:bg-white/15 hover:text-white"
                      onClick={() => {
                        setDraft({
                          name: store.name ?? "",
                          description: store.description ?? "",
                          logoUrl: store.logo_url ?? "",
                          bannerUrl: store.banner_url ?? "",
                          bannerPosition: Number(store.banner_position ?? 50),
                        });
                        setEditorOpen(true);
                      }}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      Edit toko
                    </Button>
                  ) : (
                    <>
                      <FollowStoreButton
                        storeId={store.id}
                        className="w-full border border-white/70 bg-transparent text-white hover:bg-white/15 hover:text-white aria-pressed:bg-white/15"
                      />
                      <StoreChatButton
                        storeId={store.id}
                        storeName={store.name}
                        isPlatform={Boolean(store.is_platform)}
                        className="w-full border-white/70 bg-transparent text-white hover:bg-white/15 hover:text-white"
                      />
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Statistik nyata saja; angka sosial dimuat terpisah (klien). */}
            <div className="flex min-w-0 flex-col justify-center gap-3">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm min-[360px]:grid-cols-2 xl:grid-cols-3">
                <StoreStat icon={Package} label="Produk">
                  {products.length}
                  {services.length > 0 ? ` · ${services.length} jasa` : ""}
                </StoreStat>
                <StoreStat icon={Users} label="Pengikut">
                  {social ? formatCount(social.followers) : "–"}
                </StoreStat>
                <StoreStat icon={Heart} label="Disukai">
                  {social ? formatCount(social.likes) : "–"}
                </StoreStat>
                <StoreStat icon={Star} label="Penilaian">
                  {ratingTotal > 0 ? (
                    <>
                      {ratingAverage.toFixed(1)}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({formatCount(ratingTotal)} penilaian)
                      </span>
                    </>
                  ) : (
                    <span className="font-normal text-muted-foreground">Belum ada</span>
                  )}
                </StoreStat>
                <StoreStat icon={ShoppingBag} label="Terjual">
                  {soldCount > 0 ? formatCount(soldCount) : "0"}
                </StoreStat>
                {joined ? (
                  <StoreStat icon={CalendarDays} label="Bergabung">
                    {joined}
                  </StoreStat>
                ) : null}
              </dl>
              {view.description ? (
                <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                  {view.description}
                </p>
              ) : null}
              {whatsappHref ? (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 w-fit items-center gap-1.5 text-xs font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <MessageCircle className="size-4" aria-hidden="true" />
                  WhatsApp penjual
                </a>
              ) : null}
            </div>
          </header>

          {/* Tab toko. */}
          <nav
            aria-label="Bagian toko"
            className="mt-4 flex overflow-x-auto border-b border-border bg-card px-1 [scrollbar-width:none] sm:rounded-t-xl [&::-webkit-scrollbar]:hidden"
          >
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "min-h-11 shrink-0 border-b-2 px-4 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                  tab === t.key
                    ? "border-accent text-accent"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {t.count !== undefined ? (
                  <span className="ml-1 tabular-nums text-xs">({t.count})</span>
                ) : null}
              </button>
            ))}
          </nav>

          {/* Pencarian dan urutan dalam toko. */}
          {hasAnyListing ? (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
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
                  className="min-h-11 pl-9"
                  maxLength={80}
                />
              </div>
              <div
                role="group"
                aria-label="Urutkan listing"
                className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0"
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
            </div>
          ) : null}

          {noResult ? (
            <div className="mt-6">
              <EmptyState
                icon={Search}
                title="Tidak ada yang cocok"
                description={`Tidak ada produk atau jasa yang cocok dengan "${query.trim()}". Coba kata kunci lain.`}
              />
            </div>
          ) : null}

          {/* Jasa toko: ditampilkan sebelum produk karena jasa butuh keputusan lebih dulu. */}
          {!noResult && showServices && visibleServices.length > 0 ? (
            <section aria-labelledby="jasa-toko" className="mt-8">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 id="jasa-toko" className="text-base font-bold text-foreground">
                    Jasa dari toko ini
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Kesepakatan, durasi, dan revisi terlihat sebelum memesan.
                  </p>
                </div>
                <Link
                  to="/layanan"
                  className="shrink-0 text-xs font-semibold text-accent underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Lihat katalog jasa
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleServices.map((item: any) => (
                  <SellerServiceCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Produk toko. */}
          {!noResult && showProducts ? (
            <section aria-labelledby="produk-toko" className="mt-8">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 id="produk-toko" className="text-base font-bold text-foreground">
                    Produk digital
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    File atau akses langsung setelah pembayaran terverifikasi.
                  </p>
                </div>
                {isFiltered ? (
                  <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {visibleProducts.length} hasil
                  </p>
                ) : null}
              </div>
              {products.length === 0 ? (
                <div className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-4 py-10">
                  <Package className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">
                    Toko ini belum punya produk digital aktif.
                  </p>
                </div>
              ) : visibleProducts.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Tidak ada produk yang cocok dengan pencarian.
                </p>
              ) : (
                <>
                  {/* Grid berbasis lebar minimum, sama seperti katalog /produk:
                      kartu selalu 260px+ di semua lebar container, kolom bertambah
                      hanya jika ruang cukup. `grid-cols-4` tetap membuat kartu
                      ~360px pada container 1152px — terlalu lebar untuk CTA. */}
                  <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-3 sm:gap-4">
                    {visibleProducts.slice(0, productLimit).map((item: any) => (
                      <MarketplaceProductCard key={item.id} item={item} />
                    ))}
                  </div>
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

          {!hasAnyListing ? (
            <div className="mt-6">
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
            // Simpan SUDAH sukses di server. Tunggu loader mengambil data baru
            // sebelum membuang draft supaya header tidak flash ke data lama.
            // Kalau refetch gagal, draft TETAP dipertahankan: header masih
            // menampilkan nilai yang baru disimpan, dan pengguna tidak melihat
            // data lama yang menyesatkan. Draft akan dibuang saat refetch
            // berikutnya berhasil (mis. reload halaman).
            try {
              await router.invalidate();
              setDraft(null);
            } catch {
              // Sengaja tidak membuang draft. Data server sudah benar; hanya
              // pembacaan ulang yang gagal.
            }
          }}
        />
      ) : null}
    </PageShell>
  );
}
