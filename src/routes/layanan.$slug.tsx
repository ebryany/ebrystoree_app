import { useEffect, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  Briefcase,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardList,
  FileText,
  Hammer,
  MessagesSquare,
  PackageCheck,
  ServerCog,
  UserCheck,
  Wallet,
} from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StickyActionBar, formatIDR } from "@/components/ebry/cards";
import { EmptyState } from "@/components/ebry/states";
import { Button } from "@/components/ui/button";
import { SellerCard, SELLER_ACTION, joinedLabel, ratingLabel } from "@/components/ebry/seller-card";
import { StoreChatButton } from "@/components/store/social-buttons";
import { getServiceDetail } from "@/lib/catalog.functions";
import { cn, isRenderableImageUrl } from "@/lib/utils";
import { RouteError, routeFailureHead } from "@/components/route-fallback";
import { ogImageUrl } from "@/lib/seo-url";
import { summarizeServicePackages } from "@/lib/admin-service-list";
import { daysLabel, revisionLabel } from "@/lib/service-checkout";
import { displayCategoryOf, serviceFlowOf } from "@/lib/service-types";

const detailQuery = (slug: string) =>
  queryOptions({
    queryKey: ["service-detail", slug],
    queryFn: () => getServiceDetail({ data: { slug } }),
  });

export const Route = createFileRoute("/layanan/$slug")({
  loader: async ({ context, params }) => {
    const result = await context.queryClient.ensureQueryData(detailQuery(params.slug));
    if (result.error) throw new Error("Layanan tidak dapat dimuat.");
    if (!result.service) throw notFound();
    return result;
  },
  head: ({ loaderData, match, matches }) => {
    const failureHead = routeFailureHead(
      [...matches, match],
      "Layanan tidak ditemukan | Ebrystore",
    );
    if (failureHead) return failureHead;
    if (!loaderData?.service) return {};
    const s = loaderData.service;
    const desc = (s.short_description ?? `Pesan layanan ${s.name} di Ebrystore.`).slice(0, 155);
    return {
      meta: [
        { title: `${s.name} — Layanan Ebrystore`.slice(0, 60) },
        { name: "description", content: desc },
        { property: "og:title", content: `${s.name} — Layanan Ebrystore` },
        { property: "og:description", content: desc },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(ogImageUrl(s.thumbnail_url)
          ? [
              { property: "og:image", content: ogImageUrl(s.thumbnail_url)! },
              { name: "twitter:image", content: ogImageUrl(s.thumbnail_url)! },
            ]
          : []),
      ],
    };
  },
  errorComponent: () => (
    <RouteError
      message="Layanan belum dapat dimuat. Muat ulang halaman untuk mencoba lagi."
      href="/layanan"
      linkLabel="Kembali ke daftar layanan"
    />
  ),
  notFoundComponent: LayananTidakDitemukan,
  component: DetailLayanan,
});

function LayananTidakDitemukan() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main lang="id" className="mx-auto w-full max-w-3xl flex-1 px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Layanan tidak ditemukan</h1>
        <p className="mt-2 text-sm text-muted-foreground">Layanan mungkin sudah tidak tayang.</p>
        <Button asChild className="mt-6 min-h-11">
          <Link to="/layanan">Kembali ke daftar layanan</Link>
        </Button>
      </main>
      <SiteFooter />
    </div>
  );
}

const STEPS = [
  "Pilih paket, lalu isi kebutuhan pesanan di halaman checkout.",
  "Bayar sesuai total yang dihitung sistem, lalu unggah bukti bayar.",
  "Tim kami memverifikasi pembayaran dan meninjau kebutuhanmu.",
  "Pesanan dikerjakan. Status dan hasil bisa kamu lihat di dasbor pesanan.",
];

const GENERAL_STEPS = [
  "Pilih paket, lalu tulis brief proyek di halaman checkout.",
  "Bayar sesuai total yang dihitung sistem, lalu unggah bukti bayar.",
  "Setelah pembayaran diverifikasi, tim mulai mengerjakan proyekmu.",
  "Pantau progres, chat, dan terima hasil di dasbor pesanan.",
];

function DetailLayanan() {
  const { slug } = Route.useParams();
  useEffect(() => {
    void import("@/lib/analytics-track").then(({ trackEvent }) =>
      trackEvent("service_view", `/layanan/${slug}`),
    );
  }, [slug]);

  const { data } = useSuspenseQuery(detailQuery(slug));
  const s = data.service!;
  const packages = s.service_packages ?? [];
  const addons = s.service_addons ?? [];
  const summary = summarizeServicePackages(packages);
  const category = displayCategoryOf(s as any);
  const academic = serviceFlowOf(s as any) === "academic";

  const [packageId, setPackageId] = useState<string | null>(packages[0]?.id ?? null);
  const [addonIds, setAddonIds] = useState<string[]>([]);

  const selectedPackage = packages.find((p) => p.id === packageId) ?? null;
  const selectedAddons = addons.filter((a) => addonIds.includes(a.id));
  const total =
    Number(selectedPackage?.price ?? 0) +
    selectedAddons.reduce((sum, a) => sum + Number(a.price), 0);

  const toggleAddon = (id: string) =>
    setAddonIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const checkoutSearch = {
    pkg: selectedPackage?.id,
    addons: addonIds.join(",") || undefined,
  };
  const priceHeadline =
    summary.minPrice === null
      ? null
      : summary.minPrice === summary.maxPrice
        ? formatIDR(summary.minPrice)
        : `Mulai ${formatIDR(summary.minPrice)}`;
  const estimate = daysLabel(summary.minDays, summary.maxDays);
  const steps = academic ? STEPS : GENERAL_STEPS;
  const thumbnail = isRenderableImageUrl(s.thumbnail_url) ? s.thumbnail_url : null;
  const specs: Array<{ label: string; value: string }> = [
    { label: "Kategori", value: category?.name ?? "Jasa" },
    {
      label: "Formulir pesanan",
      value: academic ? "Akademik (data tugas & tenggat)" : "Brief proyek, referensi, lampiran",
    },
    { label: "Pilihan paket", value: packages.length ? `${packages.length} paket` : "Belum ada" },
    ...(estimate ? [{ label: "Estimasi", value: estimate }] : []),
    ...(addons.length ? [{ label: "Tambahan", value: `${addons.length} opsi` }] : []),
    { label: "Pembayaran", value: "Instruksi muncul setelah pesanan dibuat" },
    { label: "Hasil", value: "Dikirim lewat dasbor pesanan" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main lang="id" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-4 sm:pt-6">
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Link to="/layanan" className="shrink-0 hover:text-foreground">
            Layanan
          </Link>
          {category ? (
            <>
              <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
              <Link
                to="/layanan"
                search={{ kategori: category.slug }}
                className="shrink-0 hover:text-foreground"
              >
                {category.name}
              </Link>
            </>
          ) : null}
          <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate text-foreground">{s.name}</span>
        </nav>

        {/* Blok utama: media + panel pesan, sama seperti halaman produk. */}
        <section className="mt-3 overflow-hidden rounded-xl border border-border bg-card lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="min-w-0 border-b border-border bg-surface p-3 sm:p-5 lg:border-b-0 lg:border-r">
            <div className="lg:sticky lg:top-24">
              {thumbnail ? (
                <img
                  src={thumbnail}
                  alt={`Gambar layanan ${s.name}`}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="aspect-square w-full rounded-lg border border-border bg-card object-cover"
                />
              ) : (
                <div
                  className="grid aspect-square w-full place-items-center rounded-lg border border-border bg-secondary"
                  aria-hidden="true"
                >
                  <span className="font-display text-6xl font-bold text-muted-foreground/30">
                    {(s.name.trim()[0] ?? "?").toUpperCase()}
                  </span>
                </div>
              )}
              <ul className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] leading-tight text-muted-foreground">
                <li className="rounded-lg border border-border bg-card px-1.5 py-2">
                  <ServerCog className="mx-auto mb-1 size-4 text-accent" aria-hidden="true" />
                  Harga dihitung server
                </li>
                <li className="rounded-lg border border-border bg-card px-1.5 py-2">
                  <MessagesSquare className="mx-auto mb-1 size-4 text-accent" aria-hidden="true" />
                  Chat di pesanan
                </li>
                <li className="rounded-lg border border-border bg-card px-1.5 py-2">
                  <UserCheck className="mx-auto mb-1 size-4 text-accent" aria-hidden="true" />
                  Tercatat di akun
                </li>
              </ul>
            </div>
          </div>

          <div className="min-w-0 p-4 sm:p-6">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
              <Briefcase className="size-3.5" aria-hidden="true" />
              {category?.name ?? "Jasa dari platform"}
            </p>
            <h1 className="mt-2.5 break-words text-xl font-bold leading-snug sm:text-2xl">
              {s.name}
            </h1>
            {s.short_description ? (
              <p className="mt-1.5 text-sm text-muted-foreground">{s.short_description}</p>
            ) : null}

            <div className="mt-4 rounded-lg bg-surface px-4 py-3">
              <p className="text-3xl font-bold tabular-nums text-price">
                {selectedPackage ? formatIDR(total) : (priceHeadline ?? "Belum ada paket")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedPackage ? (
                  <>
                    Paket <span className="font-medium">{selectedPackage.name}</span>
                    {selectedAddons.length ? ` + ${selectedAddons.length} tambahan` : ""}
                    {priceHeadline && packages.length > 1
                      ? ` · semua paket ${priceHeadline.toLowerCase()}`
                      : ""}
                  </>
                ) : (
                  "Pilih paket untuk melihat harga."
                )}
              </p>
            </div>

            {packages.length === 0 ? (
              <EmptyState
                className="mt-5"
                icon={ClipboardList}
                title="Paket belum tersedia"
                description="Layanan ini belum bisa dipesan."
              />
            ) : (
              <dl className="mt-5 grid grid-cols-[84px_minmax(0,1fr)] gap-x-4 gap-y-5 text-sm sm:grid-cols-[104px_minmax(0,1fr)]">
                <dt id="label-paket" className="pt-3 text-muted-foreground">
                  Paket
                </dt>
                <dd>
                  <div
                    role="radiogroup"
                    aria-labelledby="label-paket"
                    className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2"
                  >
                    {packages.map((pkg) => {
                      const active = pkg.id === packageId;
                      return (
                        <button
                          key={pkg.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setPackageId(pkg.id)}
                          className={cn(
                            "min-h-11 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
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
                            {pkg.name}
                          </span>
                          <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                            {formatIDR(Number(pkg.price))}
                            {pkg.estimated_days ? ` · ${pkg.estimated_days} hari` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedPackage?.description ? (
                    <p className="mt-2 whitespace-pre-line break-words text-xs text-muted-foreground">
                      {selectedPackage.description}
                    </p>
                  ) : null}
                </dd>

                {addons.length ? (
                  <>
                    <dt id="label-tambahan" className="pt-3 text-muted-foreground">
                      Tambahan
                    </dt>
                    <dd>
                      <div
                        role="group"
                        aria-labelledby="label-tambahan"
                        className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2"
                      >
                        {addons.map((addon) => {
                          const active = addonIds.includes(addon.id);
                          return (
                            <button
                              key={addon.id}
                              type="button"
                              role="checkbox"
                              aria-checked={active}
                              onClick={() => toggleAddon(addon.id)}
                              className={cn(
                                "flex min-h-11 items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
                                active
                                  ? "border-primary bg-primary/5"
                                  : "border-border bg-card hover:border-primary/50",
                              )}
                            >
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
                                  active
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border",
                                )}
                              >
                                {active ? <Check className="size-3" /> : null}
                              </span>
                              <span className="min-w-0">
                                <span className="block break-words text-sm font-medium">
                                  {addon.name}
                                </span>
                                <span className="block text-xs tabular-nums text-muted-foreground">
                                  +{formatIDR(Number(addon.price))}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </dd>
                  </>
                ) : null}

                {selectedPackage ? (
                  <>
                    <dt className="text-muted-foreground">Pengerjaan</dt>
                    <dd>
                      <p className="font-medium">
                        {selectedPackage.estimated_days
                          ? `Estimasi ${selectedPackage.estimated_days} hari`
                          : "Estimasi menyesuaikan brief"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Dihitung sejak pembayaran terverifikasi ·{" "}
                        {revisionLabel(selectedPackage.free_revisions)}
                      </p>
                    </dd>
                  </>
                ) : null}
              </dl>
            )}

            {selectedPackage ? (
              <OrderPreview days={selectedPackage.estimated_days ?? null} academic={academic} />
            ) : null}

            {selectedPackage ? (
              <div className="mt-5 hidden sm:block">
                <Button asChild className="min-h-11 w-full">
                  <Link to="/checkout/layanan/$slug" params={{ slug }} search={checkoutSearch}>
                    Pesan paket {selectedPackage.name}
                  </Link>
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  {academic
                    ? "Total final dihitung sistem di checkout, termasuk biaya tambahan bila tenggat mendesak."
                    : "Total final dihitung sistem saat pesanan dibuat."}
                </p>
              </div>
            ) : null}
          </div>
        </section>

        {s.seller ? (
          <SellerCard
            store={s.seller}
            stats={[
              { label: "Penilaian", value: ratingLabel(s.sellerStats) },
              { label: "Jasa", value: s.sellerStats ? String(s.sellerStats.services) : "—" },
              { label: "Produk", value: s.sellerStats ? String(s.sellerStats.products) : "—" },
              { label: "Bergabung", value: joinedLabel(s.seller.created_at) },
              { label: "Pengerjaan", value: "Tim platform" },
              { label: "Pembayaran", value: "QRIS" },
            ]}
            chat={
              <StoreChatButton
                storeId={s.seller.id}
                storeName={s.seller.name}
                isPlatform={s.seller.is_platform}
                className={cn(
                  SELLER_ACTION,
                  "border-primary bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary",
                )}
              />
            }
            thirdAction={
              <Button asChild variant="outline" className={SELLER_ACTION}>
                <a href="#cara-pesan">
                  <ClipboardList className="size-4" aria-hidden="true" /> Cara pesan
                </a>
              </Button>
            }
          />
        ) : null}

        {/* Konten: tab bagian + spesifikasi + deskripsi + cara pesan. */}
        <div className="mt-4 min-w-0 space-y-4">
          <nav
            aria-label="Bagian halaman"
            className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 text-sm"
          >
            {[
              ["#spesifikasi-layanan", "Spesifikasi"],
              ...(s.description ? [["#deskripsi-layanan", "Deskripsi"]] : []),
              ...(packages.length > 1 ? [["#bandingkan-paket", "Bandingkan paket"]] : []),
              ["#cara-pesan", "Cara pesan"],
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

          <Panel id="spesifikasi-layanan" title="Spesifikasi layanan">
            <dl className="divide-y divide-border text-sm">
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
          </Panel>

          {s.description || s.requirements_note ? (
            <Panel id="deskripsi-layanan" title="Deskripsi layanan">
              {s.description ? (
                <p className="whitespace-pre-line break-words text-sm leading-7 text-muted-foreground">
                  {s.description}
                </p>
              ) : null}
              {s.requirements_note ? (
                <div className="mt-5 rounded-lg border border-border bg-surface p-4">
                  <h3 className="text-sm font-semibold">Yang perlu kamu siapkan</h3>
                  <p className="mt-2 whitespace-pre-line break-words text-sm leading-7 text-muted-foreground">
                    {s.requirements_note}
                  </p>
                </div>
              ) : null}
            </Panel>
          ) : null}

          {packages.length > 1 ? (
            <Panel id="bandingkan-paket" title="Bandingkan paket">
              <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Paket</th>
                      <th className="py-2 pr-3 font-medium">Estimasi</th>
                      <th className="py-2 pr-3 font-medium">Revisi</th>
                      <th className="py-2 text-right font-medium">Harga</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {packages.map((pkg) => (
                      <tr key={pkg.id} className={cn(pkg.id === packageId && "bg-primary/5")}>
                        <td className="py-2.5 pr-3 font-medium">
                          <button
                            type="button"
                            onClick={() => setPackageId(pkg.id)}
                            className="min-h-11 text-left hover:text-primary hover:underline"
                          >
                            {pkg.name}
                          </button>
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground">
                          {pkg.estimated_days ? `${pkg.estimated_days} hari` : "—"}
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground">
                          {revisionLabel(pkg.free_revisions)}
                        </td>
                        <td className="py-2.5 text-right font-semibold tabular-nums">
                          {formatIDR(Number(pkg.price))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : null}

          <Panel id="cara-pesan" title="Cara pemesanan">
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, i) => (
                <li key={step} className="rounded-lg border border-border bg-surface p-3">
                  <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <p className="mt-2 text-sm leading-relaxed">{step}</p>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        {selectedPackage ? (
          <StickyActionBar className="sm:hidden">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-muted-foreground">{selectedPackage.name}</p>
                <p className="truncate text-base font-bold tabular-nums text-price">
                  {formatIDR(total)}
                </p>
              </div>
              <Button asChild className="min-h-11 shrink-0 px-5">
                <Link to="/checkout/layanan/$slug" params={{ slug }} search={checkoutSearch}>
                  Pesan sekarang
                </Link>
              </Button>
            </div>
          </StickyActionBar>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}

function Panel({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-judul`}
      className="scroll-mt-24 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <h2 id={`${id}-judul`} className="text-base font-semibold">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const fullDateFmt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * "Jika pesan hari ini": perkiraan tanggal selesai dari estimasi paket.
 * Dihitung di klien agar tidak terjadi mismatch hidrasi. Ini perkiraan,
 * bukan janji: hitungan resmi mulai saat pembayaran terverifikasi.
 */
function OrderPreview({ days, academic }: { days: number | null; academic: boolean }) {
  const [eta, setEta] = useState<string | null>(null);
  useEffect(() => {
    if (!days) return setEta(null);
    const d = new Date();
    d.setDate(d.getDate() + days);
    setEta(fullDateFmt.format(d));
  }, [days]);

  const flow = [
    { icon: FileText, label: academic ? "Isi data tugas" : "Kirim brief" },
    { icon: Wallet, label: "Bayar" },
    { icon: Hammer, label: "Dikerjakan" },
    { icon: PackageCheck, label: "Terima hasil" },
  ];

  return (
    <section
      aria-label="Perkiraan jika pesan hari ini"
      className="mt-5 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        Jika pesan hari ini
      </p>
      <div className="mt-2 grid gap-3 text-sm min-[400px]:grid-cols-2">
        <p className="flex items-start gap-2">
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            {days ? (
              <>
                Perkiraan selesai sekitar{" "}
                <span className="font-semibold">{eta ?? `${days} hari`}</span>
              </>
            ) : (
              "Jadwal disepakati setelah brief ditinjau"
            )}
          </span>
        </p>
        <p className="flex items-start gap-2">
          <MessagesSquare className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="font-semibold">Chat & progres</span> langsung di halaman pesanan
          </span>
        </p>
      </div>
      <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        {flow.map((f, i) => (
          <li key={f.label} className="flex min-w-0 items-center gap-1.5">
            {i > 0 ? <span className="h-px w-3 shrink-0 bg-primary/40" aria-hidden="true" /> : null}
            <f.icon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">{f.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
