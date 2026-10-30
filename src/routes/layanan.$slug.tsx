import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { CalendarClock, Check, ClipboardList, RefreshCcw, ShieldCheck, Timer } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StickyActionBar, formatIDR } from "@/components/ebry/cards";
import { EmptyState } from "@/components/ebry/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getServiceDetail } from "@/lib/catalog.functions";
import { cn } from "@/lib/utils";
import { RouteError, routeFailureHead } from "@/components/route-fallback";
import { ogImageUrl } from "@/lib/seo-url";

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
    const desc = (
      s.short_description ?? "Pendampingan akademik Ebrystore dikerjakan pendamping terverifikasi."
    ).slice(0, 155);
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
        <Button
          asChild
          className="mt-6 min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          <Link to="/layanan">Kembali ke daftar layanan</Link>
        </Button>
      </main>
      <SiteFooter />
    </div>
  );
}

function DetailLayanan() {
  const { slug } = Route.useParams();
  // Analitik: jasa dilihat.
  useEffect(() => {
    void import("@/lib/analytics-track").then(({ trackEvent }) =>
      trackEvent("service_view", `/layanan/${slug}`),
    );
  }, [slug]);

  const { data } = useSuspenseQuery(detailQuery(slug));
  const s = data.service!;
  const packages = s.service_packages ?? [];
  const addons = s.service_addons ?? [];

  const [packageId, setPackageId] = useState<string | null>(packages[0]?.id ?? null);
  const [addonIds, setAddonIds] = useState<string[]>([]);

  const selectedPackage = packages.find((p) => p.id === packageId) ?? null;
  const selectedAddons = addons.filter((a) => addonIds.includes(a.id));
  const total =
    Number(selectedPackage?.price ?? 0) +
    selectedAddons.reduce((sum, a) => sum + Number(a.price), 0);

  const toggleAddon = (id: string) =>
    setAddonIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-10">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
          <Link to="/layanan" className="hover:text-foreground">
            Bantuan Tugas
          </Link>{" "}
          / <span className="text-foreground">{s.name}</span>
        </nav>

        <div className="mt-4 grid gap-8 lg:grid-cols-[1.25fr_1fr]">
          <div className="min-w-0">
            {s.thumbnail_url ? (
              <img
                src={s.thumbnail_url}
                alt={`Ilustrasi layanan ${s.name}`}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="aspect-video w-full rounded-2xl border border-border object-cover"
              />
            ) : null}

            <h1 className="mt-5 text-2xl font-bold sm:text-3xl">{s.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {s.short_description ??
                "Dikerjakan operator terverifikasi dengan progres yang bisa kamu pantau."}
            </p>

            <ul className="mt-4 flex flex-wrap gap-2">
              <li>
                <Badge variant="secondary" className="gap-1">
                  <ShieldCheck className="size-3.5" aria-hidden="true" /> Operator terverifikasi
                </Badge>
              </li>
              <li>
                <Badge variant="secondary" className="gap-1">
                  <RefreshCcw className="size-3.5" aria-hidden="true" /> Kuota revisi jelas
                </Badge>
              </li>
              <li>
                <Badge variant="secondary" className="gap-1">
                  <Timer className="size-3.5" aria-hidden="true" /> Progres terpantau
                </Badge>
              </li>
            </ul>

            <section aria-labelledby="paket-heading" className="mt-8">
              <h2 id="paket-heading" className="text-base font-semibold">
                1. Pilih paket
              </h2>
              {packages.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="Paket belum tersedia"
                  description="Paket untuk layanan ini sedang disiapkan tim kami."
                />
              ) : (
                <ul className="mt-3 space-y-3">
                  {packages.map((pkg) => {
                    const active = pkg.id === packageId;
                    return (
                      <li key={pkg.id}>
                        <button
                          type="button"
                          onClick={() => setPackageId(pkg.id)}
                          aria-pressed={active}
                          className={cn(
                            "press-scale flex w-full min-h-11 items-start gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            active
                              ? "border-accent bg-surface-selected/60"
                              : "border-border bg-card hover:border-accent/40",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
                              active
                                ? "border-accent bg-accent text-accent-foreground"
                                : "border-border",
                            )}
                            aria-hidden="true"
                          >
                            {active ? <Check className="size-3.5" /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-semibold">{pkg.name}</span>
                              <span className="text-sm font-bold">
                                {formatIDR(Number(pkg.price))}
                              </span>
                            </span>
                            {pkg.description ? (
                              <span className="mt-1 block text-sm text-muted-foreground">
                                {pkg.description}
                              </span>
                            ) : null}
                            <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <CalendarClock className="size-3.5" aria-hidden="true" />
                                Estimasi {pkg.estimated_days ?? "-"} hari
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <RefreshCcw className="size-3.5" aria-hidden="true" />
                                {pkg.free_revisions ?? 0} revisi gratis
                              </span>
                              {pkg.sla_hours ? (
                                <span className="inline-flex items-center gap-1">
                                  <Timer className="size-3.5" aria-hidden="true" />
                                  Respon {pkg.sla_hours} jam
                                </span>
                              ) : null}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {addons.length ? (
              <section aria-labelledby="addon-heading" className="mt-8">
                <h2 id="addon-heading" className="text-base font-semibold">
                  2. Tambahan (opsional)
                </h2>
                <ul className="mt-3 space-y-2">
                  {addons.map((addon) => {
                    const active = addonIds.includes(addon.id);
                    return (
                      <li key={addon.id}>
                        <button
                          type="button"
                          onClick={() => toggleAddon(addon.id)}
                          aria-pressed={active}
                          className={cn(
                            "press-scale flex w-full min-h-11 items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            active
                              ? "border-accent bg-surface-selected/60"
                              : "border-border bg-card hover:border-accent/40",
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{addon.name}</span>
                            {addon.description ? (
                              <span className="mt-0.5 block text-sm text-muted-foreground">
                                {addon.description}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-sm font-semibold">
                            +{formatIDR(Number(addon.price))}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {s.description ? (
              <section className="mt-8">
                <h2 className="text-base font-semibold">Tentang layanan ini</h2>
                <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                  {s.description}
                </p>
              </section>
            ) : null}

            {s.requirements_note ? (
              <section className="mt-8">
                <h2 className="text-base font-semibold">Yang perlu kamu siapkan</h2>
                <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                  {s.requirements_note}
                </p>
              </section>
            ) : null}

            <section className="mt-8">
              <h2 className="text-base font-semibold">Cara kerjanya</h2>
              <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                {[
                  "Pilih paket dan tambahan yang kamu butuhkan.",
                  "Isi kebutuhan pesanan, lalu bayar lewat DANA.",
                  "Tim kami verifikasi pembayaran maksimal 1x24 jam.",
                  "Operator mengerjakan dan kamu pantau progresnya sampai selesai.",
                ].map((step, i) => (
                  <li key={step} className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/10 font-mono text-xs font-semibold text-accent">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <aside className="h-fit rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-24">
            <h2 className="text-sm font-semibold">Ringkasan pesanan</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Paket</dt>
                <dd className="text-right font-medium">
                  {selectedPackage?.name ?? "Belum dipilih"}
                </dd>
              </div>
              {selectedAddons.map((a) => (
                <div key={a.id} className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">{a.name}</dt>
                  <dd className="text-right">{formatIDR(Number(a.price))}</dd>
                </div>
              ))}
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted-foreground">Estimasi selesai</dt>
                <dd className="text-right font-medium">
                  {selectedPackage?.estimated_days ? `${selectedPackage.estimated_days} hari` : "-"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
                <dt className="font-semibold">Total</dt>
                <dd className="text-lg font-bold">{formatIDR(total)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Harga final dihitung ulang oleh sistem saat checkout. Pembayaran manual DANA a.n.
              FEBRYANUS TAMBING.
            </p>
            <Button
              asChild
              className="mt-4 hidden w-full lg:inline-flex"
              disabled={!selectedPackage}
            >
              <Link
                to="/checkout/layanan/$slug"
                params={{ slug }}
                search={{ pkg: selectedPackage?.id, addons: addonIds.join(",") || undefined }}
              >
                Lanjut ke checkout
              </Link>
            </Button>
          </aside>
        </div>

        <StickyActionBar className="lg:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-muted-foreground">
                {selectedPackage?.name ?? "Pilih paket dulu"}
              </p>
              <p className="text-base font-bold">{formatIDR(total)}</p>
            </div>
            <Button asChild className="min-h-11 shrink-0" disabled={!selectedPackage}>
              <Link
                to="/checkout/layanan/$slug"
                params={{ slug }}
                search={{ pkg: selectedPackage?.id, addons: addonIds.join(",") || undefined }}
              >
                Lanjut ke checkout
              </Link>
            </Button>
          </div>
        </StickyActionBar>
      </main>
      <SiteFooter />
    </div>
  );
}
