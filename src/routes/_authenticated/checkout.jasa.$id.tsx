import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronDown,
  Clock,
  ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Store,
  Undo2,
} from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StickyActionBar } from "@/components/ebry/cards";
import { CreditUseOption } from "@/components/checkout/credit-use-option";
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
const draftKey = (serviceId: string) => `ebry:jasa-req:${serviceId}`;

/** Sisipan cepat untuk info yang paling sering lupa ditulis pembeli. */
const QUICK_INSERTS = [
  { label: "Tenggat", text: "Tenggat yang saya harapkan: " },
  { label: "Format file", text: "Format file hasil: " },
  { label: "Referensi", text: "Referensi/contoh: " },
] as const;

const STOPWORDS = new Set([
  "yang",
  "dan",
  "atau",
  "untuk",
  "dengan",
  "dari",
  "akan",
  "jika",
  "bila",
  "berupa",
  "serta",
  "dalam",
  "pada",
  "anda",
  "kamu",
  "saya",
  "ingin",
  "mohon",
  "harap",
  "sudah",
  "tersebut",
  "seperti",
  "jelas",
  "lengkap",
  "detail",
  "data",
  "informasi",
]);

type ChecklistItem = { label: string; keywords: string[] };

/**
 * Pecah teks "yang perlu disiapkan" milik seller menjadi butir checklist.
 * Pemisah: baris baru, titik koma, bullet, atau koma. Kata kunci tiap butir
 * dipakai untuk menandai otomatis butir yang sudah disebut pembeli.
 */
function parseChecklist(source: string): ChecklistItem[] {
  const parts = source
    .split(/\r?\n|;|•|,\s+/)
    .map((part) =>
      part
        .replace(/^\s*(?:[-*–]|\d+[.)])\s*/, "")
        .trim()
        .replace(/[.:]+$/, ""),
    )
    .filter((part) => part.length >= 3);
  const unique = Array.from(new Set(parts)).slice(0, 8);
  return unique.map((label) => ({
    label,
    keywords: label
      .toLowerCase()
      .split(/[^a-z0-9à-ÿ]+/i)
      .filter((word) => word.length >= 4 && !STOPWORDS.has(word)),
  }));
}

function isCovered(item: ChecklistItem, text: string) {
  if (item.keywords.length === 0) return false;
  return item.keywords.some((word) => text.includes(word));
}

function CheckoutJasa() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fetchQuote = useServerFn(quoteMarketplaceServiceOrder);
  const createOrder = useServerFn(createMarketplaceServiceOrder);
  const applyCredit = useServerFn(applyCreditToOrder);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [requirements, setRequirements] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [useCredit, setUseCredit] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [stale, setStale] = useState(false);
  const [errors, setErrors] = useState<{ requirements?: string; agreement?: string }>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const agreementRef = useRef<HTMLInputElement>(null);
  const draftLoaded = useRef(false);

  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ["marketplace-service-quote", id],
    queryFn: () => fetchQuote({ data: { serviceId: id } }),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  // Draf kebutuhan disimpan per jasa agar tidak hilang saat tab tertutup.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(draftKey(id));
      if (saved) setRequirements(saved);
    } catch {
      /* localStorage tidak tersedia: abaikan */
    }
    draftLoaded.current = true;
  }, [id]);

  useEffect(() => {
    if (!draftLoaded.current) return;
    const handle = window.setTimeout(() => {
      try {
        if (requirements.trim()) window.localStorage.setItem(draftKey(id), requirements);
        else window.localStorage.removeItem(draftKey(id));
      } catch {
        /* kuota penuh / mode privat */
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [id, requirements]);

  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof marketplaceServiceCheckoutSchema.parse>[0]) =>
      createOrder({ data: marketplaceServiceCheckoutSchema.parse(input) }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setFeedback(result.error);
        setStale(Boolean(result.stale));
        return;
      }
      try {
        window.localStorage.removeItem(draftKey(id));
      } catch {
        /* abaikan */
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
  const checklist = useMemo(
    () => (quote ? parseChecklist(quote.agreement.requirements) : []),
    [quote],
  );
  const lowered = requirements.toLowerCase();
  const coveredCount = checklist.filter((item) => isCovered(item, lowered)).length;
  const busy = mutation.isPending || isFetching;
  const reqLength = requirements.trim().length;

  function focusField(el: HTMLElement | null) {
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }

  function insertSnippet(text: string) {
    const prefix = requirements && !requirements.endsWith("\n") ? "\n" : "";
    const next = `${requirements}${prefix}${text}`.slice(0, REQ_MAX);
    setRequirements(next);
    setErrors((prev) => ({ ...prev, requirements: undefined }));
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.length, next.length);
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quote || busy) return;

    const nextErrors: typeof errors = {};
    if (reqLength < REQ_MIN)
      nextErrors.requirements = `Tulis kebutuhan minimal ${REQ_MIN} karakter supaya seller bisa menilai pekerjaan.`;
    if (!accepted) nextErrors.agreement = "Centang persetujuan kesepakatan untuk melanjutkan.";
    setErrors(nextErrors);
    if (nextErrors.requirements) return focusField(textareaRef.current);
    if (nextErrors.agreement) return focusField(agreementRef.current);

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
      setFeedback("Periksa kembali isian formulir.");
      return;
    }
    setFeedback("");
    mutation.mutate(input.data);
  }

  function reloadQuote() {
    setAccepted(false);
    setFeedback("");
    setStale(false);
    void refetch();
  }

  if (isPending) {
    return (
      <Shell>
        <div role="status" className="space-y-4">
          <div className="h-10 w-48 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="h-96 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
            <div className="h-80 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
          </div>
          <span className="sr-only">Memuat kesepakatan dan biaya pesanan…</span>
        </div>
      </Shell>
    );
  }

  if (error || !quote) {
    return (
      <Shell>
        <div
          role="alert"
          className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center"
        >
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

  const { agreement } = quote;
  const thumb = quote.media.find((entry) => entry.kind === "image");
  const estimate = new Date(Date.now() + agreement.durationDays * 86_400_000).toLocaleDateString(
    "id-ID",
    { day: "numeric", month: "short", year: "numeric" },
  );
  const firstError = errors.requirements ?? errors.agreement;
  const ctaLabel = mutation.isPending ? (
    <>
      <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      Membuat pesanan…
    </>
  ) : (
    <>Lanjut ke pembayaran · {formatRupiah(quote.total)}</>
  );
  const chargeNote = useCredit
    ? "Saldo dipakai saat pesanan dibuat. Sisa tagihan dibayar di langkah berikutnya."
    : "Belum ada dana terpotong. Metode pembayaran dipilih di langkah berikutnya.";

  return (
    <Shell>
      <Link
        to="/jasa/$id"
        params={{ id }}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Kembali ke jasa
      </Link>

      <header className="mt-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Checkout jasa</h1>
        <ol
          className="flex flex-wrap items-center gap-1.5 text-xs font-medium"
          aria-label="Tahapan"
        >
          <StepChip index={1} label="Kesepakatan" active />
          <StepChip index={2} label="Pembayaran" />
          <StepChip index={3} label="Pengerjaan" />
          <StepChip index={4} label="Terima hasil" />
        </ol>
      </header>

      <form
        noValidate
        onSubmit={submit}
        className="mt-6 grid gap-6 pb-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:pb-0"
      >
        <div className="min-w-0 space-y-6">
          {/* ① Kebutuhan */}
          <section
            aria-labelledby="step-needs"
            className="rounded-2xl border border-border bg-card p-5 sm:p-6"
          >
            <SectionTitle id="step-needs" index={1}>
              Jelaskan kebutuhan Anda
            </SectionTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Seller membaca ini sebelum menyetujui pesanan. Jangan kirim kata sandi atau kredensial
              akun.
            </p>

            {checklist.length > 0 ? (
              <div className="mt-4 rounded-xl border border-border bg-surface p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold">Yang diminta seller</p>
                  <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
                    {coveredCount}/{checklist.length} tersebut
                  </p>
                </div>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label="Kelengkapan kebutuhan"
                  aria-valuemin={0}
                  aria-valuemax={checklist.length}
                  aria-valuenow={coveredCount}
                >
                  <div
                    className="h-full rounded-full bg-success transition-[width] duration-300 motion-reduce:transition-none"
                    style={{ width: `${(coveredCount / checklist.length) * 100}%` }}
                  />
                </div>
                <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {checklist.map((item) => {
                    const done = isCovered(item, lowered);
                    return (
                      <li key={item.label} className="flex min-w-0 items-start gap-2 text-sm">
                        <span
                          className={cn(
                            "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                            done
                              ? "border-success bg-success text-success-foreground"
                              : "border-border bg-card",
                          )}
                          aria-hidden="true"
                        >
                          {done ? <Check className="size-3" strokeWidth={3} /> : null}
                        </span>
                        <span
                          className={cn(
                            "min-w-0 break-words",
                            done ? "text-muted-foreground" : "text-foreground",
                          )}
                        >
                          {item.label}
                          <span className="sr-only">{done ? " (sudah disebut)" : " (belum)"}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2.5 text-[11px] text-muted-foreground">
                  Tanda centang otomatis dari kata yang Anda tulis, hanya sebagai pengingat.
                </p>
              </div>
            ) : null}

            <Label htmlFor="service-requirements" className="sr-only">
              Kebutuhan pekerjaan
            </Label>
            <Textarea
              id="service-requirements"
              ref={textareaRef}
              minLength={REQ_MIN}
              maxLength={REQ_MAX}
              rows={7}
              value={requirements}
              disabled={mutation.isPending}
              onChange={(event) => {
                setRequirements(event.target.value);
                if (errors.requirements && event.target.value.trim().length >= REQ_MIN)
                  setErrors((prev) => ({ ...prev, requirements: undefined }));
              }}
              aria-invalid={errors.requirements ? true : undefined}
              aria-describedby="requirements-meta requirements-error"
              placeholder="Contoh: Website profil untuk toko kue, 4 halaman (beranda, menu, tentang, kontak), warna cokelat-krem, logo sudah ada."
              className={cn(
                "mt-4 min-h-36 resize-y",
                errors.requirements && "border-destructive focus-visible:ring-destructive",
              )}
            />
            <div
              id="requirements-meta"
              className="mt-2 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex flex-wrap gap-1.5">
                {QUICK_INSERTS.map((chip) => {
                  const present = lowered.includes(chip.text.toLowerCase().slice(0, 10));
                  return (
                    <button
                      key={chip.label}
                      type="button"
                      disabled={present || mutation.isPending}
                      onClick={() => insertSnippet(chip.text)}
                      className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring sm:min-h-9"
                    >
                      {present ? (
                        <Check className="size-3.5" aria-hidden="true" />
                      ) : (
                        <Plus className="size-3.5" aria-hidden="true" />
                      )}
                      {chip.label}
                    </button>
                  );
                })}
              </div>
              <p
                className={cn(
                  "text-xs tabular-nums",
                  reqLength > 0 && reqLength < REQ_MIN
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {requirements.length}/{REQ_MAX}
                {requirements ? " · draf tersimpan" : ""}
              </p>
            </div>
            <p id="requirements-error" role="alert" className="mt-1.5 text-sm text-destructive">
              {errors.requirements ?? ""}
            </p>
          </section>

          {/* ② Kesepakatan */}
          <section
            aria-labelledby="step-agreement"
            className="rounded-2xl border border-border bg-card p-5 sm:p-6"
          >
            <SectionTitle id="step-agreement" index={2}>
              Cek kesepakatan
            </SectionTitle>
            <dl className="mt-4 divide-y divide-border rounded-xl border border-border">
              <AgreementRow label="Hasil yang Anda terima">{agreement.deliverable}</AgreementRow>
              <AgreementRow label="Tidak termasuk">{agreement.exclusions}</AgreementRow>
            </dl>
            <details className="group mt-2">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-medium text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                Lihat lingkup lengkap
                <ChevronDown
                  className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <dl className="mt-1 divide-y divide-border rounded-xl border border-border">
                <AgreementRow label="Lingkup pekerjaan">{agreement.scope}</AgreementRow>
                <AgreementRow label="Yang perlu Anda siapkan">
                  {agreement.requirements}
                </AgreementRow>
              </dl>
            </details>

            <label
              className={cn(
                "mt-4 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-sm has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5",
                errors.agreement ? "border-destructive" : "border-border",
              )}
            >
              <input
                ref={agreementRef}
                type="checkbox"
                checked={accepted}
                disabled={mutation.isPending}
                onChange={(event) => {
                  setAccepted(event.target.checked);
                  if (event.target.checked)
                    setErrors((prev) => ({ ...prev, agreement: undefined }));
                }}
                aria-invalid={errors.agreement ? true : undefined}
                aria-describedby="agreement-error"
                className="mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              />
              <span>
                Saya setuju dengan kesepakatan di atas: pengerjaan {agreement.durationDays} hari,{" "}
                {agreement.revisionLimit}x revisi, total {formatRupiah(quote.total)}.
              </span>
            </label>
            <p id="agreement-error" role="alert" className="mt-1.5 text-sm text-destructive">
              {errors.agreement ?? ""}
            </p>
          </section>
        </div>

        {/* Ringkasan */}
        <aside className="min-w-0">
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 lg:sticky lg:top-24">
            <div className="flex min-w-0 gap-3">
              <div className="size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-selected">
                {thumb ? (
                  <img
                    src={serviceMediaUrl(thumb.path)}
                    alt=""
                    decoding="async"
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="grid size-full place-items-center text-muted-foreground">
                    <ImageIcon className="size-5" aria-hidden="true" />
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="line-clamp-2 break-words font-semibold leading-snug">{quote.name}</p>
                <Link
                  to="/toko/$slug"
                  params={{ slug: quote.store.slug }}
                  className="mt-0.5 inline-flex max-w-full items-center gap-1 py-1 text-xs text-muted-foreground hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Store className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{quote.store.name}</span>
                </Link>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <Fact
                icon={CalendarClock}
                label="Pengerjaan"
                value={`${agreement.durationDays} hari`}
              />
              <Fact icon={RotateCcw} label="Revisi" value={`${agreement.revisionLimit}x`} />
              <Fact icon={Clock} label="Perkiraan" value={estimate} />
            </dl>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Perkiraan selesai bila seller menyetujui kebutuhan hari ini.
            </p>

            <Separator className="my-4" />
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Harga jasa</dt>
                <dd className="tabular-nums">{formatRupiah(quote.price)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Biaya admin</dt>
                <dd className="tabular-nums">{formatRupiah(quote.adminFee)}</dd>
              </div>
              <div className="flex items-end justify-between gap-4 pt-1">
                <dt className="font-medium">Total</dt>
                <dd className="font-display text-2xl font-bold tabular-nums">
                  {formatRupiah(quote.total)}
                </dd>
              </div>
            </dl>

            <CreditUseOption
              estimatedTotal={quote.total}
              enabled={useCredit}
              onEnabledChange={setUseCredit}
              className="mt-4"
            />

            {feedback ? (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                <p>{feedback}</p>
                {stale ? (
                  <button
                    type="button"
                    onClick={reloadQuote}
                    disabled={isFetching}
                    className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-medium underline-offset-2 hover:underline disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <RefreshCw
                      className={cn(
                        "size-3.5",
                        isFetching && "animate-spin motion-reduce:animate-none",
                      )}
                      aria-hidden="true"
                    />
                    Muat ulang harga
                  </button>
                ) : null}
              </div>
            ) : null}

            <Button
              type="submit"
              size="lg"
              className="mt-5 hidden min-h-11 w-full lg:inline-flex"
              disabled={busy}
            >
              {ctaLabel}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">{chargeNote}</p>

            <ul className="mt-4 space-y-2.5 border-t border-border pt-4 text-xs text-muted-foreground">
              <Assurance icon={ShieldCheck}>
                Dana ditahan Ebrystore dan baru diteruskan ke seller setelah Anda menerima hasil.
              </Assurance>
              <Assurance icon={Clock}>
                Seller merespons maksimal 24 jam. Ditolak atau tidak direspons, dana kembali penuh
                ke saldo.
              </Assurance>
              <Assurance icon={Undo2}>
                Lewat tenggat tanpa hasil? Batalkan sendiri dan dana kembali ke saldo.
              </Assurance>
            </ul>
          </div>
        </aside>

        <StickyActionBar className="lg:hidden">
          {firstError || feedback ? (
            <p role="alert" className="mb-2 line-clamp-2 text-xs text-destructive">
              {firstError ?? feedback}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-display text-lg font-bold tabular-nums">
                {formatRupiah(quote.total)}
              </p>
            </div>
            <Button type="submit" size="lg" className="ml-auto min-h-11 flex-1" disabled={busy}>
              {mutation.isPending ? ctaLabel : "Lanjut ke pembayaran"}
            </Button>
          </div>
        </StickyActionBar>
      </form>
    </Shell>
  );
}

function SectionTitle({ id, index, children }: { id: string; index: number; children: ReactNode }) {
  return (
    <h2 id={id} className="flex items-center gap-2.5 font-display text-base font-semibold">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {index}
      </span>
      {children}
    </h2>
  );
}

function AgreementRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 p-3.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap break-words text-sm">{children || "-"}</dd>
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/60 px-2 py-2">
      <Icon className="mx-auto size-4 text-primary" aria-hidden="true" />
      <dt className="mt-1 text-[11px] leading-tight text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-xs font-semibold leading-tight tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function Assurance({ icon: Icon, children }: { icon: typeof Clock; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

function StepChip({
  index,
  label,
  active = false,
}: {
  index: number;
  label: string;
  active?: boolean;
}) {
  return (
    <li
      aria-current={active ? "step" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "grid size-4 place-items-center rounded-full text-[10px] font-bold",
          active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {index}
      </span>
      {label}
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
