import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import {
  Ban,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  ListChecks,
  MessagesSquare,
  PackageCheck,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  Store,
  Wallet,
} from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { StickyActionBar } from "@/components/ebry/cards";
import { OnlineDot, PresenceLabel } from "@/components/ebry/online-status";
import { ServiceChatButton } from "@/components/home/service-chat-button";
import { RouteError, routeFailureHead } from "@/components/route-fallback";
import { useStorePresence } from "@/hooks/use-store-presence";
import { getPublicMarketplaceService } from "@/lib/catalog.functions";
import { formatRupiah } from "@/lib/format";
import { serviceMediaUrl, type PublicMarketplaceService } from "@/lib/marketplace-service";
import { ogImageUrl } from "@/lib/seo-url";
import { cn, isRenderableImageUrl } from "@/lib/utils";

const detailQuery = (id: string) =>
  queryOptions({
    queryKey: ["marketplace-service-detail", id],
    queryFn: () => getPublicMarketplaceService({ data: { id } }),
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tombol aksi kartu penjual: ikon di atas label di HP, sebaris mulai sm (sama dengan /produk). */
const SELLER_ACTION =
  "h-auto min-h-11 w-full min-w-0 flex-col gap-0.5 px-1.5 py-1.5 text-xs sm:flex-row sm:gap-2 sm:px-3 sm:text-sm";

const monthYearFmt = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });
const fullDateFmt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const numberFmt = new Intl.NumberFormat("id-ID");

export const Route = createFileRoute("/jasa/$id")({
  loader: async ({ context, params }) => {
    if (!UUID_RE.test(params.id)) throw notFound();
    const result = await context.queryClient.ensureQueryData(detailQuery(params.id));
    if (result.error) throw new Error(result.error);
    if (!result.service) throw notFound();
    return result;
  },
  head: ({ loaderData, match, matches }) => {
    const failureHead = routeFailureHead([...matches, match], "Jasa tidak ditemukan | Ebrystore");
    if (failureHead) return failureHead;
    const s = loaderData?.service;
    if (!s) return {};
    const desc = s.agreement.scope.replace(/\s+/g, " ").slice(0, 155);
    const cover = s.media.find((m) => m.kind === "image");
    const image = cover ? ogImageUrl(serviceMediaUrl(cover.path)) : null;
    return {
      meta: [
        { title: `${s.name} — Jasa Ebrystore`.slice(0, 60) },
        { name: "description", content: desc },
        { property: "og:title", content: `${s.name} — Ebrystore` },
        { property: "og:description", content: desc },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(image
          ? [
              { property: "og:image", content: image },
              { property: "og:image:alt", content: s.name },
              { name: "twitter:image", content: image },
            ]
          : []),
      ],
    };
  },
  errorComponent: () => (
    <RouteError
      message="Jasa belum dapat dimuat. Muat ulang halaman untuk mencoba lagi."
      href="/layanan"
      linkLabel="Kembali ke jasa"
    />
  ),
  notFoundComponent: JasaTidakDitemukan,
  component: DetailJasa,
});

function JasaTidakDitemukan() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main lang="id" className="mx-auto w-full max-w-3xl flex-1 px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Jasa tidak ditemukan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Jasa mungkin sudah diarsipkan atau tokonya tidak aktif.
        </p>
        <Button asChild className="mt-6 min-h-11">
          <Link to="/layanan">Lihat jasa lain</Link>
        </Button>
      </main>
      <SiteFooter />
    </div>
  );
}

function DetailJasa() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(detailQuery(id));
  const s = data.service!;
  const stats = data.stats;
  const [active, setActive] = useState(0);
  const presence = useStorePresence(s.store.id, s.store.presence);

  useEffect(() => {
    void import("@/lib/analytics-track").then(({ trackEvent }) =>
      trackEvent("product_view", `/jasa/${id}`),
    );
  }, [id]);

  const { agreement, media } = s;
  const current = media[Math.min(active, Math.max(media.length - 1, 0))];
  const logo = isRenderableImageUrl(s.store.logo_url) ? s.store.logo_url : null;
  const completed = stats?.serviceCompleted ?? null;

  const specs: Array<{ label: string; value: ReactNode }> = [
    { label: "Kategori", value: s.category.name },
    { label: "Jenis", value: "Jasa dikerjakan seller (bukan produk instan)" },
    {
      label: "Lama pengerjaan",
      value: `${agreement.durationDays} hari setelah kebutuhan disetujui`,
    },
    {
      label: "Revisi",
      value: agreement.revisionLimit > 0 ? `${agreement.revisionLimit}x` : "Tidak termasuk revisi",
    },
    { label: "Hasil", value: "Dikirim lewat halaman pesanan, diterima setelah Anda setujui" },
    { label: "Pembayaran", value: "Dana ditahan sampai hasil diterima" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-4 sm:pt-6">
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Link to="/layanan" className="shrink-0 hover:text-foreground">
            Jasa seller
          </Link>
          <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
          <span className="shrink-0">{s.category.name}</span>
          <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate text-foreground">{s.name}</span>
        </nav>

        {/* ===== Blok utama: galeri + panel pesan ===== */}
        <section className="mt-3 overflow-hidden rounded-xl border border-border bg-card lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="min-w-0 border-b border-border bg-surface p-3 sm:p-5 lg:border-b-0 lg:border-r">
            <div className="lg:sticky lg:top-24">
              {current ? (
                current.kind === "image" ? (
                  <img
                    src={serviceMediaUrl(current.path)}
                    alt={current.alt || `Gambaran hasil ${s.name}`}
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    className="aspect-square w-full rounded-lg border border-border bg-card object-contain"
                  />
                ) : (
                  <video
                    src={serviceMediaUrl(current.path)}
                    controls
                    preload="metadata"
                    className="aspect-square w-full rounded-lg border border-border bg-card object-contain"
                  />
                )
              ) : (
                <div
                  className="grid aspect-square w-full place-items-center rounded-lg border border-border bg-surface-selected"
                  aria-hidden="true"
                >
                  <BriefcaseBusiness className="size-12 text-accent" />
                </div>
              )}

              {media.length > 1 ? (
                <ul className="mt-2 flex gap-1.5 overflow-x-auto" aria-label="Gambaran hasil">
                  {media.map((entry, index) => (
                    <li key={entry.path} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => setActive(index)}
                        aria-label={`Lihat gambaran ${index + 1}`}
                        aria-pressed={index === active}
                        className={cn(
                          "block size-14 overflow-hidden rounded-lg border-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                          index === active ? "border-primary" : "border-transparent opacity-70",
                        )}
                      >
                        {entry.kind === "image" ? (
                          <img
                            src={serviceMediaUrl(entry.path)}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        ) : (
                          <span className="grid size-full place-items-center bg-muted text-[10px] font-semibold">
                            Video
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <ul className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] leading-tight text-muted-foreground">
                <li className="rounded-lg border border-border bg-card px-1.5 py-2">
                  <ShieldCheck className="mx-auto mb-1 size-4 text-accent" aria-hidden="true" />
                  Dana ditahan
                </li>
                <li className="rounded-lg border border-border bg-card px-1.5 py-2">
                  <MessagesSquare className="mx-auto mb-1 size-4 text-accent" aria-hidden="true" />
                  Diskusi dulu
                </li>
                <li className="rounded-lg border border-border bg-card px-1.5 py-2">
                  <RotateCcw className="mx-auto mb-1 size-4 text-accent" aria-hidden="true" />
                  Bisa revisi
                </li>
              </ul>
            </div>
          </div>

          <div className="min-w-0 p-4 sm:p-6">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
              <PackageCheck className="size-3.5" aria-hidden="true" /> Jasa seller aktif
            </p>
            <h1 className="mt-2.5 break-words text-xl font-bold leading-snug sm:text-2xl">
              {s.name}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-muted-foreground">{s.category.name}</span>
              {completed != null ? (
                <>
                  <span className="h-4 w-px bg-border" aria-hidden="true" />
                  <span>
                    <span className="font-semibold">{numberFmt.format(completed)}</span>{" "}
                    <span className="text-muted-foreground">pesanan selesai</span>
                  </span>
                </>
              ) : null}
            </div>

            <div className="mt-4 rounded-lg bg-surface px-4 py-3">
              <p className="text-3xl font-bold tabular-nums text-price">{formatRupiah(s.price)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Biaya admin ditampilkan di halaman pemesanan.
              </p>
            </div>

            <dl className="mt-5 grid grid-cols-[84px_minmax(0,1fr)] gap-x-4 gap-y-5 text-sm sm:grid-cols-[104px_minmax(0,1fr)]">
              <dt className="text-muted-foreground">Pengerjaan</dt>
              <dd>
                <p className="font-medium">{agreement.durationDays} hari</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Dihitung setelah bayar &amp; kebutuhan disetujui seller
                </p>
              </dd>

              <dt className="text-muted-foreground">Revisi</dt>
              <dd className="font-medium">
                {agreement.revisionLimit > 0
                  ? `${agreement.revisionLimit}x revisi`
                  : "Tanpa revisi"}
              </dd>

              <dt className="text-muted-foreground">Jaminan</dt>
              <dd className="flex flex-wrap gap-x-4 gap-y-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-accent" aria-hidden="true" /> Dana ditahan
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ServerCog className="size-4 text-accent" aria-hidden="true" /> Harga dihitung
                  server
                </span>
              </dd>
            </dl>

            <OrderPreview durationDays={agreement.durationDays} />

            {/* CTA inline hanya ≥sm; mobile memakai sticky bar agar tidak ganda. */}
            <div className="mt-5 hidden gap-3 sm:grid sm:grid-cols-2">
              <ServiceChatButton
                serviceId={s.id}
                serviceName={s.name}
                storeName={s.store.name}
                className="min-h-11 border-primary text-primary hover:bg-primary/5 hover:text-primary"
              />
              <Button asChild className="min-h-11">
                <Link to="/checkout/jasa/$id" params={{ id: s.id }}>
                  Pesan sekarang
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* ===== Kartu toko: hanya statistik nyata ===== */}
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
                {logo ? (
                  <img
                    src={logo}
                    alt=""
                    loading="lazy"
                    className="size-16 rounded-full border border-border bg-surface object-cover sm:size-20"
                  />
                ) : (
                  <span
                    className="grid size-16 place-items-center rounded-full border border-border bg-surface-selected font-display text-2xl font-bold text-primary sm:size-20"
                    aria-hidden="true"
                  >
                    {(s.store.name.trim()[0] ?? "?").toUpperCase()}
                  </span>
                )}
                <OnlineDot presence={presence} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Dikerjakan oleh</p>
                <p className="truncate text-base font-semibold">{s.store.name}</p>
                <PresenceLabel presence={presence} className="mt-0.5" />
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <ServiceChatButton
                    serviceId={s.id}
                    serviceName={s.name}
                    storeName={s.store.name}
                    className={cn(
                      SELLER_ACTION,
                      "border-primary bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary",
                    )}
                  />
                  <Button asChild variant="outline" className={SELLER_ACTION}>
                    <Link to="/toko/$slug" params={{ slug: s.store.slug }}>
                      <Store className="size-4" aria-hidden="true" /> Kunjungi
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              {[
                {
                  label: "Jasa",
                  value: stats?.storeServices != null ? String(stats.storeServices) : "—",
                },
                {
                  label: "Selesai",
                  value:
                    stats?.storeCompleted != null ? numberFmt.format(stats.storeCompleted) : "—",
                },
                {
                  label: "Bergabung",
                  value: s.store.created_at
                    ? monthYearFmt.format(new Date(s.store.created_at))
                    : "—",
                },
                { label: "Durasi", value: `${agreement.durationDays} hari` },
                { label: "Revisi", value: `${agreement.revisionLimit}x` },
                { label: "Dana", value: "Ditahan" },
              ].map((row) => (
                <div key={row.label} className="flex min-w-0 items-baseline justify-between gap-2">
                  <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
                  <dd className="truncate text-right font-semibold tabular-nums text-price">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ===== Konten + sidebar ===== */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_288px] lg:items-start">
          <div className="min-w-0 space-y-4">
            <nav
              aria-label="Bagian halaman"
              className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 text-sm"
            >
              {[
                ["#spesifikasi-jasa", "Spesifikasi"],
                ["#kesepakatan-jasa", "Kesepakatan"],
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
              id="spesifikasi-jasa"
              aria-labelledby="spesifikasi-jasa-judul"
              className="scroll-mt-24 rounded-xl border border-border bg-card p-4 sm:p-5"
            >
              <h2 id="spesifikasi-jasa-judul" className="text-base font-semibold">
                Spesifikasi jasa
              </h2>
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
              id="kesepakatan-jasa"
              aria-labelledby="kesepakatan-jasa-judul"
              className="scroll-mt-24 rounded-xl border border-border bg-card p-4 sm:p-5"
            >
              <h2 id="kesepakatan-jasa-judul" className="text-base font-semibold">
                Kesepakatan pekerjaan
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ditetapkan seller dan berlaku saat Anda memesan.
              </p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <Term icon={ListChecks} label="Lingkup pekerjaan">
                  {agreement.scope}
                </Term>
                <Term icon={FileCheck2} label="Hasil yang diterima">
                  {agreement.deliverable}
                </Term>
                <Term icon={Ban} label="Tidak termasuk">
                  {agreement.exclusions}
                </Term>
                <Term icon={ClipboardList} label="Yang perlu Anda siapkan">
                  {agreement.requirements}
                </Term>
              </dl>
            </section>
          </div>

          <StoreServicesAside items={data.related} storeSlug={s.store.slug} />
        </div>

        {/* Sticky bar mobile: pusat tunggal aksi pesan di <sm. */}
        <StickyActionBar className="sm:hidden">
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-base font-bold tabular-nums text-price">
              {formatRupiah(s.price)}
            </p>
            <ServiceChatButton
              serviceId={s.id}
              serviceName={s.name}
              storeName={s.store.name}
              iconOnly
              className="size-11 shrink-0 px-0"
            />
            <Button asChild className="min-h-11 shrink-0 px-5">
              <Link to="/checkout/jasa/$id" params={{ id: s.id }}>
                Pesan sekarang
              </Link>
            </Button>
          </div>
        </StickyActionBar>
      </main>
      <SiteFooter />
    </div>
  );
}

/**
 * "Jika pesan hari ini": perkiraan paling cepat hasil dikirim, dihitung dari
 * lama pengerjaan. Tanggal dihitung di klien untuk menghindari mismatch hidrasi.
 */
function OrderPreview({ durationDays }: { durationDays: number }) {
  const [eta, setEta] = useState<string | null>(null);
  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() + durationDays);
    setEta(fullDateFmt.format(d));
  }, [durationDays]);

  const steps = [
    { icon: Wallet, label: "Bayar" },
    { icon: ClipboardList, label: "Kirim kebutuhan" },
    { icon: CalendarClock, label: "Dikerjakan" },
    { icon: BadgeCheck, label: "Terima hasil" },
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
            Hasil paling cepat sekitar{" "}
            <span className="font-semibold">{eta ?? `${durationDays} hari lagi`}</span>
          </span>
        </p>
        <p className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="font-semibold">Dana aman</span>, seller dibayar setelah hasil Anda
            terima
          </span>
        </p>
      </div>
      <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        {steps.map((step, i) => (
          <li key={step.label} className="flex min-w-0 items-center gap-1.5">
            {i > 0 ? <span className="h-px w-3 shrink-0 bg-primary/40" aria-hidden="true" /> : null}
            <step.icon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">{step.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Sidebar "Jasa lain dari toko" (data dari loader, tanpa request tambahan). */
function StoreServicesAside({
  items,
  storeSlug,
}: {
  items: PublicMarketplaceService[];
  storeSlug: string;
}) {
  if (items.length === 0) return null;
  return (
    <aside
      aria-labelledby="jasa-lain-toko"
      className="rounded-xl border border-border bg-card p-4 lg:sticky lg:top-24"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="jasa-lain-toko" className="text-sm font-semibold">
          Jasa lain dari toko
        </h2>
        <Link
          to="/toko/$slug"
          params={{ slug: storeSlug }}
          className="inline-flex min-h-11 items-center text-xs font-medium text-primary hover:underline"
        >
          Lihat semua
        </Link>
      </div>
      <ul className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
        {items.map((item) => {
          const cover = item.media.find((m) => m.kind === "image");
          return (
            <li key={item.id}>
              <Link
                to="/jasa/$id"
                params={{ id: item.id }}
                className="flex min-h-16 items-center gap-3 rounded-lg p-2 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {cover ? (
                  <img
                    src={serviceMediaUrl(cover.path)}
                    alt=""
                    loading="lazy"
                    className="size-14 shrink-0 rounded-md border border-border bg-surface object-cover"
                  />
                ) : (
                  <span className="grid size-14 shrink-0 place-items-center rounded-md border border-border bg-surface-selected text-accent">
                    <BriefcaseBusiness className="size-5" aria-hidden="true" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="line-clamp-2 text-xs font-medium leading-snug">{item.name}</span>
                  <span className="mt-1 block text-sm font-bold tabular-nums text-price">
                    {formatRupiah(item.price)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function Term({
  icon: Icon,
  label,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-background p-3.5">
      <dt className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1.5 whitespace-pre-wrap break-words text-sm">{children}</dd>
    </div>
  );
}
