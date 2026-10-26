import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronLeft, ChevronRight, Send } from "lucide-react";

import { ServiceMediaEditor } from "@/components/seller/service-media-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatRupiah } from "@/lib/format";
import {
  marketplaceServiceAgreementSchema,
  marketplaceServiceDraftSchema,
  serviceMediaUrl,
  type MarketplaceServiceDraft,
  type MarketplaceServiceListing,
  type MarketplaceServiceMedia,
} from "@/lib/marketplace-service";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "info", label: "Informasi", hint: "Nama, kategori, dan harga jasa." },
  { key: "agreement", label: "Kesepakatan", hint: "Lingkup kerja yang dibaca pembeli." },
  { key: "media", label: "Media", hint: "Gambar atau video hasil pekerjaan." },
  { key: "review", label: "Tinjau", hint: "Periksa sekali lagi sebelum disimpan." },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

type DraftState = {
  name: string;
  categoryId: string;
  price: string;
  scope: string;
  exclusions: string;
  deliverable: string;
  requirements: string;
  durationDays: string;
  revisionLimit: string;
};

function initialState(listing: MarketplaceServiceListing | null): DraftState {
  return {
    name: listing?.name ?? "",
    categoryId: listing?.category_id ?? "",
    price: listing ? String(listing.price) : "",
    scope: listing?.agreement.scope ?? "",
    exclusions: listing?.agreement.exclusions ?? "",
    deliverable: listing?.agreement.deliverable ?? "",
    requirements: listing?.agreement.requirements ?? "",
    durationDays: listing ? String(listing.agreement.durationDays) : "",
    revisionLimit: listing ? String(listing.agreement.revisionLimit) : "",
  };
}

/** Validasi satu langkah memakai skema yang sama dengan penyimpanan. */
function stepError(step: StepKey, state: DraftState): string {
  if (step === "info") {
    const name = state.name.trim();
    if (name.length < 3) return "Nama jasa minimal 3 karakter.";
    if (name.length > 160) return "Nama jasa maksimal 160 karakter.";
    if (!state.categoryId) return "Pilih kategori jasa.";
    const price = Number(state.price);
    if (!Number.isInteger(price) || price < 1) return "Harga minimal Rp 1.";
    if (price > 1_000_000_000) return "Harga maksimal Rp 1.000.000.000.";
    return "";
  }
  if (step === "agreement") {
    const parsed = marketplaceServiceAgreementSchema.safeParse({
      scope: state.scope.trim(),
      exclusions: state.exclusions.trim(),
      deliverable: state.deliverable.trim(),
      requirements: state.requirements.trim(),
      durationDays: Number(state.durationDays),
      revisionLimit: Number(state.revisionLimit),
    });
    if (!parsed.success) {
      const path = parsed.error.issues[0]?.path[0];
      if (path === "scope") return "Lingkup pekerjaan minimal 10 karakter.";
      if (path === "exclusions") return "Bagian di luar scope minimal 3 karakter.";
      if (path === "deliverable") return "Hasil yang diserahkan minimal 3 karakter.";
      if (path === "requirements") return "Data yang dibutuhkan dari pembeli minimal 3 karakter.";
      if (path === "durationDays") return "Durasi harus bilangan bulat minimal 1 hari.";
      if (path === "revisionLimit") return "Jumlah revisi harus bilangan bulat minimal 0.";
      return "Periksa kesepakatan pekerjaan.";
    }
    return "";
  }
  return "";
}

export function ServiceDraftWizard({
  listing,
  categories,
  pending,
  onCancel,
  onSave,
}: {
  listing: MarketplaceServiceListing | null;
  categories: { id: string; name: string }[];
  pending: boolean;
  onCancel: () => void;
  onSave: (draft: MarketplaceServiceDraft) => void;
}) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<DraftState>(() => initialState(listing));
  const [media, setMedia] = useState<MarketplaceServiceMedia[]>(listing?.media ?? []);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [error, setError] = useState("");

  const current = STEPS[step].key;
  const categoryName = useMemo(
    () => categories.find((entry) => entry.id === state.categoryId)?.name ?? "Belum dipilih",
    [categories, state.categoryId],
  );

  function patch(next: Partial<DraftState>) {
    setState((prev) => ({ ...prev, ...next }));
    setError("");
  }

  function goNext() {
    const message = stepError(current, state);
    if (message) {
      setError(message);
      return;
    }
    setError("");
    setStep((prev) => Math.min(STEPS.length - 1, prev + 1));
  }

  function goBack() {
    setError("");
    setStep((prev) => Math.max(0, prev - 1));
  }

  function submit() {
    const parsed = marketplaceServiceDraftSchema.safeParse({
      ...(listing ? { id: listing.id, expectedVersion: listing.version } : {}),
      name: state.name.trim(),
      categoryId: state.categoryId,
      price: Number(state.price),
      media,
      agreement: {
        scope: state.scope.trim(),
        exclusions: state.exclusions.trim(),
        deliverable: state.deliverable.trim(),
        requirements: state.requirements.trim(),
        durationDays: Number(state.durationDays),
        revisionLimit: Number(state.revisionLimit),
      },
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Periksa kembali isian jasa.");
      return;
    }
    setError("");
    onSave(parsed.data);
  }

  const busy = pending || mediaBusy;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{listing ? "Edit jasa" : "Jasa baru"}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {listing
              ? "Perubahan jasa yang sudah disetujui akan dikembalikan ke draft untuk ditinjau ulang."
              : "Isi empat langkah berikut, lalu ajukan moderasi."}
          </p>
        </div>
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
          Langkah {step + 1} dari {STEPS.length}
        </span>
      </header>

      {/* Stepper: posisi dan progres alur. */}
      <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <ol aria-label="Langkah menambahkan jasa" className="flex min-w-max items-start">
          {STEPS.map((entry, index) => {
            const done = index < step;
            const active = index === step;
            const last = index === STEPS.length - 1;
            return (
              <li
                key={entry.key}
                aria-current={active ? "step" : undefined}
                className="flex w-[6.5rem] shrink-0 flex-col items-center sm:w-auto sm:min-w-0 sm:flex-1"
              >
                <div className="flex w-full items-center">
                  <span
                    className={cn(
                      "h-0.5 flex-1 rounded-full",
                      index === 0 ? "bg-transparent" : done || active ? "bg-accent" : "bg-border",
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      "z-10 grid size-9 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold transition-colors",
                      done
                        ? "border-accent bg-accent text-accent-foreground"
                        : active
                          ? "border-accent bg-card text-accent ring-4 ring-accent/15"
                          : "border-border bg-card text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="size-4" aria-hidden="true" /> : index + 1}
                  </span>
                  <span
                    className={cn(
                      "h-0.5 flex-1 rounded-full",
                      last ? "bg-transparent" : done ? "bg-accent" : "bg-border",
                    )}
                    aria-hidden="true"
                  />
                </div>
                <span
                  className={cn(
                    "mt-2 text-center text-[11px] leading-tight sm:text-xs",
                    active
                      ? "font-semibold text-foreground"
                      : done
                        ? "font-medium text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {entry.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{STEPS[step].hint}</p>

      <fieldset disabled={busy} className="mt-4 min-w-0">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current}
            initial={reduced ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduced ? undefined : { opacity: 0, x: -12 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-4"
          >
            {current === "info" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="jasa-name">Nama jasa</Label>
                  <Input
                    id="jasa-name"
                    value={state.name}
                    onChange={(event) => patch({ name: event.target.value })}
                    maxLength={160}
                    className="min-h-11"
                    placeholder="Contoh: Pembuatan makalah lengkap"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jasa-category">Kategori platform</Label>
                  <select
                    id="jasa-category"
                    value={state.categoryId}
                    onChange={(event) => patch({ categoryId: event.target.value })}
                    className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <option value="" disabled>
                      Pilih kategori jasa
                    </option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 sm:max-w-xs">
                  <Label htmlFor="jasa-price">Harga (IDR)</Label>
                  <Input
                    id="jasa-price"
                    type="number"
                    inputMode="numeric"
                    step={1}
                    min={1}
                    max={1_000_000_000}
                    value={state.price}
                    onChange={(event) => patch({ price: event.target.value })}
                    className="min-h-11 tabular-nums"
                    placeholder="50000"
                  />
                </div>
              </>
            ) : null}

            {current === "agreement" ? (
              <>
                {(
                  [
                    ["scope", "Lingkup pekerjaan", "Apa yang Anda kerjakan", 10],
                    ["exclusions", "Di luar scope", "Apa yang tidak termasuk", 3],
                    ["deliverable", "Hasil yang diserahkan", "Bentuk hasil akhir", 3],
                    ["requirements", "Data yang dibutuhkan dari pembeli", "Bahan dari pembeli", 3],
                  ] as const
                ).map(([field, label, placeholder, minLength]) => (
                  <div key={field} className="space-y-2">
                    <Label htmlFor={`jasa-${field}`}>{label}</Label>
                    <Textarea
                      id={`jasa-${field}`}
                      rows={3}
                      minLength={minLength}
                      maxLength={5000}
                      value={state[field]}
                      onChange={(event) => patch({ [field]: event.target.value })}
                      placeholder={placeholder}
                    />
                  </div>
                ))}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="jasa-durationDays">Durasi (hari)</Label>
                    <Input
                      id="jasa-durationDays"
                      type="number"
                      step={1}
                      min={1}
                      value={state.durationDays}
                      onChange={(event) => patch({ durationDays: event.target.value })}
                      className="min-h-11 tabular-nums"
                      placeholder="3"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="jasa-revisionLimit">Jumlah revisi</Label>
                    <Input
                      id="jasa-revisionLimit"
                      type="number"
                      step={1}
                      min={0}
                      value={state.revisionLimit}
                      onChange={(event) => patch({ revisionLimit: event.target.value })}
                      className="min-h-11 tabular-nums"
                      placeholder="1"
                    />
                  </div>
                </div>
              </>
            ) : null}

            {current === "media" ? (
              <ServiceMediaEditor
                listingId={listing?.id ?? null}
                value={media}
                onChange={setMedia}
                disabled={pending}
                onBusyChange={setMediaBusy}
              />
            ) : null}

            {current === "review" ? (
              <div className="space-y-4">
                <section className="rounded-xl border border-border bg-surface/60 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">Informasi</h3>
                      <p className="mt-1 break-words text-sm">{state.name || "Belum diisi"}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {categoryName} ·{" "}
                        {state.price ? formatRupiah(Number(state.price)) : "Harga belum diisi"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-10 shrink-0"
                      onClick={() => setStep(0)}
                    >
                      Ubah
                    </Button>
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-surface/60 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold">Kesepakatan</h3>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-10 shrink-0"
                      onClick={() => setStep(1)}
                    >
                      Ubah
                    </Button>
                  </div>
                  <dl className="mt-2 space-y-2 text-sm">
                    {(
                      [
                        ["Lingkup", state.scope],
                        ["Di luar scope", state.exclusions],
                        ["Hasil", state.deliverable],
                        ["Data dari pembeli", state.requirements],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                        <dd className="whitespace-pre-wrap break-words">
                          {value || "Belum diisi"}
                        </dd>
                      </div>
                    ))}
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {state.durationDays || "0"} hari · {state.revisionLimit || "0"} revisi
                    </p>
                  </dl>
                </section>

                <section className="rounded-xl border border-border bg-surface/60 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold">
                      Media ({media.length}/{5})
                    </h3>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-10 shrink-0"
                      onClick={() => setStep(2)}
                    >
                      Ubah
                    </Button>
                  </div>
                  {media.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Belum ada media. Jasa tanpa media tetap dapat diajukan, tetapi gambar membantu
                      pembeli memutuskan.
                    </p>
                  ) : (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {media.map((entry) => (
                        <li
                          key={entry.path}
                          className="size-16 overflow-hidden rounded-lg border border-border bg-card"
                        >
                          {entry.kind === "image" ? (
                            <img
                              src={serviceMediaUrl(entry.path)}
                              alt={entry.alt}
                              className="size-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span className="grid size-full place-items-center text-[11px] text-muted-foreground">
                              Video
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </fieldset>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {step > 0 ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={goBack}
          >
            <ChevronLeft className="mr-1 size-4" aria-hidden="true" />
            Kembali
          </Button>
        ) : (
          <Button type="button" variant="ghost" className="min-h-11" onClick={onCancel}>
            Batal
          </Button>
        )}

        {step < STEPS.length - 1 ? (
          <Button type="button" className="min-h-11" disabled={busy} onClick={goNext}>
            Lanjut
            <ChevronRight className="ml-1 size-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button type="button" className="min-h-11" disabled={busy} onClick={submit}>
            {mediaBusy ? (
              "Menunggu unggahan…"
            ) : pending ? (
              "Menyimpan…"
            ) : (
              <>
                <Send className="mr-1.5 size-4" aria-hidden="true" />
                Simpan jasa
              </>
            )}
          </Button>
        )}
      </div>
    </section>
  );
}
