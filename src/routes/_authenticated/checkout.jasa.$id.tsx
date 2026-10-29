import { useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  CalendarClock,
  ClipboardList,
  FileCheck2,
  ListChecks,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Store,
  Wallet,
} from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StickyActionBar } from "@/components/ebry/cards";
import { CreditUseOption } from "@/components/checkout/credit-use-option";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { formatRupiah } from "@/lib/format";
import { marketplaceServiceCheckoutSchema, serviceMediaUrl } from "@/lib/marketplace-service";
import {
  createMarketplaceServiceOrder,
  quoteMarketplaceServiceOrder,
} from "@/lib/marketplace-service.functions";
import { applyCreditToOrder } from "@/lib/orders.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/checkout/jasa/$id")({
  head: () => ({
    meta: [{ title: "Checkout Jasa Seller | Ebrystore" }, { name: "robots", content: "noindex" }],
  }),
  component: CheckoutJasa,
});

const REQ_MIN = 10;
const REQ_MAX = 5000;

function CheckoutJasa() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fetchQuote = useServerFn(quoteMarketplaceServiceOrder);
  const createOrder = useServerFn(createMarketplaceServiceOrder);
  const applyCredit = useServerFn(applyCreditToOrder);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [requirements, setRequirements] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [useCredit, setUseCredit] = useState(false);
  const [activeMedia, setActiveMedia] = useState(0);
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ["marketplace-service-quote", id],
    queryFn: () => fetchQuote({ data: { serviceId: id } }),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof marketplaceServiceCheckoutSchema.parse>[0]) =>
      createOrder({ data: marketplaceServiceCheckoutSchema.parse(input) }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setFeedback(result.error);
        return;
      }
      // Saldo diterapkan setelah order terbentuk. Bila gagal, pesanan tetap ada
      // dan saldo masih bisa dipakai dari halaman pesanan.
      if (useCredit) {
        const applied = await applyCredit({ data: { orderId: result.order_id } });
        if (!applied.ok) {
          setFeedback(
            `Pesanan dibuat, tetapi saldo belum terpakai: ${applied.error} Buka halaman pesanan untuk memakai saldo.`,
          );
        }
      }
      await navigate({ to: "/dashboard/pesanan/$id", params: { id: result.order_id } });
    },
    onError: () =>
      setFeedback(
        "Pesanan belum terpastikan. Coba lagi tanpa menutup formulir, atau periksa daftar pesanan.",
      ),
  });
  const quote = data?.quote;
  const busy = mutation.isPending || isFetching;
  const reqLength = requirements.trim().length;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote || busy) return;

    // Analitik: pembeli mulai checkout jasa.
    void import("@/lib/analytics-track").then(({ trackEvent }) =>
      trackEvent("checkout_start", `/checkout/jasa/${id}`),
    );
    const input = marketplaceServiceCheckoutSchema.safeParse({
      serviceId: id,
      idempotencyKey,
      expectedVersion: quote.version,
      expectedTotal: quote.total,
      requirements,
      agreementAccepted: accepted,
    });
    if (!input.success) {
      setFeedback(
        reqLength < REQ_MIN
          ? `Tulis kebutuhan pekerjaan minimal ${REQ_MIN} karakter.`
          : "Centang persetujuan kesepakatan jasa terlebih dahulu.",
      );
      return;
    }
    setFeedback("");
    mutation.mutate(input.data);
  }

  function reloadQuote() {
    setAccepted(false);
    setFeedback("");
    void refetch();
  }

  if (isPending) {
    return (
      <Shell>
        <div role="status" className="space-y-4">
          <div className="h-32 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="h-96 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
            <div className="h-72 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
          </div>
          <span className="sr-only">Memuat kesepakatan dan biaya pesanan…</span>
        </div>
      </Shell>
    );
  }

  if (error || !quote) {
    return (
      <Shell>
        <div role="alert" className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="font-display text-lg font-semibold">Jasa tidak dapat dimuat</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {data?.error ?? "Periksa kembali status jasa atau koneksi Anda."}
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button className="min-h-11" disabled={isFetching} onClick={() => void refetch()}>
              Muat ulang
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/layanan">Kembali ke jasa</Link>
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  const media = quote.media;
  const current = media[Math.min(activeMedia, Math.max(media.length - 1, 0))];
  const { agreement } = quote;

  const submitLabel = mutation.isPending ? (
    <>
      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      Membuat pesanan…
    </>
  ) : (
    "Buat pesanan"
  );

  return (
    <Shell>
      <Link
        to="/layanan"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Kembali ke jasa
      </Link>

      <header className="mt-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Checkout jasa</h1>
        <ol className="mt-4 flex flex-wrap items-center gap-2 text-xs font-medium">
          <StepChip index={1} label="Kesepakatan" active />
          <StepChip index={2} label="Pembayaran" />
          <StepChip index={3} label="Pengerjaan" />
          <StepChip index={4} label="Terima hasil" />
        </ol>
      </header>

      <form
        onSubmit={submit}
        className="mt-6 grid gap-6 pb-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:pb-0"
      >
        <div className="min-w-0 space-y-6">
          {/* Jasa */}
          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="grid gap-0 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
              {current ? (
                <div className="border-b border-border bg-surface-selected sm:border-b-0 sm:border-r">
                  {current.kind === "image" ? (
                    <img
                      src={serviceMediaUrl(current.path)}
                      alt={current.alt}
                      decoding="async"
                      className="aspect-[4/3] w-full object-cover sm:aspect-square"
                    />
                  ) : (
                    <video
                      src={serviceMediaUrl(current.path)}
                      controls
                      preload="metadata"
                      className="aspect-[4/3] w-full object-cover sm:aspect-square"
                    />
                  )}
                  {media.length > 1 ? (
                    <ul className="flex gap-1.5 overflow-x-auto p-2" aria-label="Gambaran hasil">
                      {media.map((entry, index) => (
                        <li key={entry.path} className="shrink-0">
                          <button
                            type="button"
                            onClick={() => setActiveMedia(index)}
                            aria-label={`Lihat gambaran ${index + 1}`}
                            aria-pressed={index === activeMedia}
                            className={cn(
                              "block size-11 overflow-hidden rounded-lg border-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                              index === activeMedia ? "border-primary" : "border-transparent opacity-70",
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
                </div>
              ) : null}

              <div className="min-w-0 p-5 sm:p-6">
                <Badge variant="secondary">{quote.category.name}</Badge>
                <h2 className="mt-2 break-words font-display text-xl font-semibold leading-tight">
                  {quote.name}
                </h2>
                <Link
                  to="/toko/$slug"
                  params={{ slug: quote.store.slug }}
                  className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Store className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{quote.store.name}</span>
                </Link>

                <dl className="mt-3 grid grid-cols-2 gap-2">
                  <Fact icon={CalendarClock} label="Pengerjaan" value={`${agreement.durationDays} hari`} />
                  <Fact icon={RotateCcw} label="Revisi" value={`${agreement.revisionLimit}x`} />
                </dl>
                <p className="mt-4 font-display text-2xl font-bold tabular-nums">
                  {formatRupiah(quote.price)}
                </p>
              </div>
            </div>
          </section>

          {/* Kesepakatan */}
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 className="font-display font-semibold">Kesepakatan pekerjaan</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ditetapkan seller dan berlaku untuk pesanan ini.
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

          {/* Kebutuhan pembeli */}
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <Label htmlFor="service-requirements" className="font-display text-base font-semibold">
              Kebutuhan pekerjaan Anda
            </Label>
            <p id="requirements-help" className="mt-1 text-sm text-muted-foreground">
              Jelaskan detail sesuai yang diminta seller. Jangan kirim kata sandi atau kredensial
              akun.
            </p>
            <Textarea
              id="service-requirements"
              required
              minLength={REQ_MIN}
              maxLength={REQ_MAX}
              rows={6}
              value={requirements}
              disabled={mutation.isPending}
              onChange={(event) => setRequirements(event.target.value)}
              aria-describedby="requirements-help requirements-count"
              placeholder="Contoh: topik, jumlah halaman, format file, tenggat yang diinginkan…"
              className="mt-3 min-h-32 resize-y"
            />
            <p
              id="requirements-count"
              className={cn(
                "mt-2 text-right text-xs tabular-nums",
                reqLength > 0 && reqLength < REQ_MIN ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {reqLength < REQ_MIN ? `Minimal ${REQ_MIN} karakter · ` : ""}
              {requirements.length}/{REQ_MAX}
            </p>

            <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-3.5 text-sm has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
              <input
                type="checkbox"
                required
                checked={accepted}
                disabled={mutation.isPending}
                onChange={(event) => setAccepted(event.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              />
              <span>
                Saya menyetujui lingkup, pengecualian, hasil, durasi {agreement.durationDays} hari,{" "}
                {agreement.revisionLimit} revisi, dan total biaya di halaman ini.
              </span>
            </label>
          </section>

          <ul className="grid gap-3 sm:grid-cols-3">
            <Assurance
              icon={ShieldCheck}
              title="Dana ditahan"
              desc="Seller dibayar setelah Anda menerima hasil."
            />
            <Assurance
              icon={CalendarClock}
              title="Durasi jelas"
              desc="Dihitung setelah bayar & kebutuhan disetujui."
            />
            <Assurance icon={BadgeCheck} title="Harga final" desc="Dihitung ulang di server." />
          </ul>
        </div>

        {/* Ringkasan */}
        <aside className="min-w-0">
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 lg:sticky lg:top-24">
            <h2 className="font-display font-semibold">Ringkasan biaya</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Harga jasa</dt>
                <dd className="tabular-nums">{formatRupiah(quote.price)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Biaya admin</dt>
                <dd className="tabular-nums">{formatRupiah(quote.adminFee)}</dd>
              </div>
            </dl>
            <Separator className="my-4" />
            <div className="flex items-end justify-between gap-4">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-display text-2xl font-bold tabular-nums">
                {formatRupiah(quote.total)}
              </span>
            </div>

            <CreditUseOption
              estimatedTotal={quote.total}
              enabled={useCredit}
              onEnabledChange={setUseCredit}
              className="mt-4"
            />

            {feedback ? (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {feedback}
              </p>
            ) : null}

            <Button
              type="submit"
              size="lg"
              className="mt-5 hidden min-h-11 w-full lg:inline-flex"
              disabled={busy}
            >
              {submitLabel}
            </Button>
            <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <Wallet className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Metode pembayaran dipilih di halaman pesanan berikutnya.
            </p>

            <Separator className="my-4" />
            <div className="flex flex-wrap items-center justify-between gap-x-3 text-sm">
              <button
                type="button"
                onClick={reloadQuote}
                disabled={busy}
                className="inline-flex min-h-11 items-center gap-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              >
                <RefreshCw
                  className={cn("size-3.5", isFetching && "animate-spin motion-reduce:animate-none")}
                  aria-hidden="true"
                />
                Muat ulang harga
              </button>
              <Link
                to="/dashboard/pesanan"
                search={{ filter: "all" }}
                className="inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Pesanan saya
              </Link>
            </div>
          </div>
        </aside>

        <StickyActionBar className="lg:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-display text-lg font-bold tabular-nums">
                {formatRupiah(quote.total)}
              </p>
            </div>
            <Button type="submit" size="lg" className="ml-auto min-h-11 flex-1" disabled={busy}>
              {submitLabel}
            </Button>
          </div>
        </StickyActionBar>
      </form>
    </Shell>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
      <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-[11px] leading-tight text-muted-foreground">{label}</dt>
        <dd className="text-sm font-semibold leading-tight tabular-nums">{value}</dd>
      </div>
    </div>
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
      <dd className="mt-1.5 whitespace-pre-wrap break-words text-sm">{children || "-"}</dd>
    </div>
  );
}

function StepChip({ index, label, active = false }: { index: number; label: string; active?: boolean }) {
  return (
    <li
      aria-current={active ? "step" : undefined}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "grid size-5 place-items-center rounded-full text-[10px] font-bold",
          active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {index}
      </span>
      {label}
    </li>
  );
}

function Assurance({
  icon: Icon,
  title,
  desc,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
    </li>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>
      <SiteFooter />
    </div>
  );
}
