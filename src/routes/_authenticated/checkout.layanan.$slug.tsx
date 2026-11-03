import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import {
  AlertCircle,
  CalendarClock,
  Check,
  ChevronLeft,
  Loader2,
  Paperclip,
  RefreshCcw,
  ShieldAlert,
  Trash2,
  Upload,
} from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CardSkeleton, ErrorState } from "@/components/ebry/states";
import { StickyActionBar, formatIDR } from "@/components/ebry/cards";
import { getServiceDetail } from "@/lib/catalog.functions";
import {
  createAcademicOrder,
  createGeneralServiceOrder,
  listDraftAttachments,
  quoteAcademicOrder,
  registerAcademicAttachment,
  removeDraftAttachment,
} from "@/lib/academic.functions";
import {
  ATTACHMENT_TYPES,
  CITATION_STYLES,
  EDUCATION_LEVELS,
  FILE_FORMATS,
  LANGUAGES,
  OUTPUT_TYPES,
  SCOPE_FLAGS,
  URGENCY_LABEL,
  extraFieldsFor,
} from "@/lib/academic-form-config";
import {
  checkoutMissingItems,
  minDeadlineLocal,
  resolveInitialPackage,
  revisionLabel,
} from "@/lib/service-checkout";
import {
  GENERAL_ATTACHMENT_TYPES,
  displayCategoryOf,
  generalBriefMissing,
  looksLikeSecret,
  serviceFlowOf,
} from "@/lib/service-types";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { cn, isRenderableImageUrl } from "@/lib/utils";

const searchSchema = z.object({
  pkg: z.string().optional(),
  addons: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/checkout/layanan/$slug")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Checkout Layanan — Ebrystore" },
      {
        name: "description",
        content: "Lengkapi kebutuhan pesanan sebelum melakukan pembayaran di Ebrystore.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutLayanan,
});

const MAX_FILE = 20 * 1024 * 1024;

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function CheckoutLayanan() {
  const { slug } = Route.useParams();
  const fetchDetail = useServerFn(getServiceDetail);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["service-detail", slug],
    queryFn: () => fetchDetail({ data: { slug } }),
  });
  const service = data?.service as any;

  if (isPending) {
    return (
      <Shell>
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="mt-6">
          <CardSkeleton rows={4} />
        </div>
      </Shell>
    );
  }
  if (error || data?.error) {
    return (
      <Shell>
        <ErrorState
          title="Checkout belum bisa dimuat"
          description="Periksa koneksi lalu coba lagi."
          onRetry={() => void refetch()}
        />
      </Shell>
    );
  }
  if (!service) {
    return (
      <Shell>
        <ErrorState
          title="Layanan tidak tersedia"
          description="Layanan ini sudah tidak tayang atau belum bisa dipesan."
        />
        <Button asChild variant="outline" className="mt-4 min-h-11">
          <Link to="/layanan">Lihat layanan lain</Link>
        </Button>
      </Shell>
    );
  }

  return serviceFlowOf(service) === "academic" ? (
    <AcademicCheckout service={service} />
  ) : (
    <GeneralCheckout service={service} />
  );
}

/* ================= Alur jasa umum: website, desain, IT, konten, dll. ================= */

function GeneralCheckout({ service: s }: { service: any }) {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useSession();
  const submitOrder = useServerFn(createGeneralServiceOrder);
  const registerAttachment = useServerFn(registerAcademicAttachment);
  const fetchAttachments = useServerFn(listDraftAttachments);
  const dropAttachment = useServerFn(removeDraftAttachment);

  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const draftKey = useMemo(() => crypto.randomUUID(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const packages = (s.service_packages ?? []) as any[];
  const addons = (s.service_addons ?? []) as any[];
  const [packageId, setPackageId] = useState<string | null>(
    resolveInitialPackage(packages, search.pkg)?.id ?? null,
  );
  const [addonIds, setAddonIds] = useState<string[]>(
    search.addons
      ? search.addons.split(",").filter((id) => addons.some((a: any) => a.id === id))
      : [],
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deliverables, setDeliverables] = useState("");
  const [references, setReferences] = useState("");
  const [deadline, setDeadline] = useState("");
  const [noCredentialAccepted, setNoCredentialAccepted] = useState(false);
  const [attachmentType, setAttachmentType] = useState<string>("reference");
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const selectedPackage = packages.find((p) => p.id === packageId) ?? null;
  const selectedAddons = addons.filter((a) => addonIds.includes(a.id));
  const total =
    Number(selectedPackage?.price ?? 0) + selectedAddons.reduce((n, a) => n + Number(a.price), 0);
  const deadlineIso = deadline ? new Date(deadline).toISOString() : null;
  const secretWarning = looksLikeSecret([description, deliverables, references, note].join("\n"));
  const missing = generalBriefMissing({
    hasPackage: !!selectedPackage,
    title,
    description,
    deliverables,
    references,
    deadlineIso,
    noCredentialAccepted,
  });
  const missingSet = new Set(missing.map((m) => m.field));
  const invalid = (field: string) => showErrors && missingSet.has(field);

  const toggleAddon = (id: string) =>
    setAddonIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  function focusField(field: string) {
    const target = document.getElementById(field === "paket" ? "paket-heading" : field);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus({ preventScroll: true });
  }

  async function refreshAttachments() {
    const res: any = await fetchAttachments({ data: { draftKey } });
    setAttachments(res?.items ?? []);
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!user) return toast.error("Sesi berakhir. Masuk kembali untuk mengunggah.");
    if (file.size > MAX_FILE) return toast.error("Ukuran berkas maksimal 20 MB.");
    setUploading(true);
    const ext = file.name.includes(".") ? file.name.split(".").pop()!.slice(0, 8) : "bin";
    const path = `${user.id}/${draftKey}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("academic-order-attachments")
      .upload(path, file, { contentType: file.type || undefined });
    if (upErr) {
      setUploading(false);
      return toast.error("Berkas gagal diunggah. Coba lagi.");
    }
    const res: any = await registerAttachment({
      data: {
        draftKey,
        attachmentType: attachmentType as any,
        storagePath: path,
        originalName: file.name.slice(0, 200),
        mimeType: file.type || undefined,
        fileSize: file.size,
      },
    });
    setUploading(false);
    if (!res?.ok) return toast.error(res?.error ?? "Lampiran gagal disimpan.");
    toast.success("Lampiran ditambahkan.");
    void refreshAttachments();
  }

  async function handleRemoveAttachment(id: string) {
    const res: any = await dropAttachment({ data: { id } });
    if (!res?.ok) return toast.error("Lampiran gagal dihapus.");
    void refreshAttachments();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!selectedPackage || missing.length) {
      setShowErrors(true);
      toast.error(`Masih ada ${missing.length} isian yang perlu dilengkapi.`);
      focusField(missing[0]?.field ?? "paket");
      return;
    }
    if (secretWarning) {
      toast.error("Hapus kata sandi/token dari brief sebelum mengirim.");
      focusField("deskripsi");
      return;
    }
    setSubmitting(true);
    const result = await submitOrder({
      data: {
        serviceId: s.id,
        packageId: selectedPackage.id,
        addonIds,
        brief: {
          title: title.trim(),
          description: description.trim(),
          deliverables: deliverables.trim(),
          references: references.trim(),
          deadline_at: deadlineIso,
        },
        noCredentialAccepted: true,
        draftKey,
        idempotencyKey,
        note: note.trim() || undefined,
      },
    }).catch(() => ({ ok: false as const, error: "Koneksi terputus. Coba kirim lagi." }));
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Pesanan ${result.order_number} dibuat. Lanjutkan pembayaran.`);
    navigate({ to: "/dashboard/pesanan/$id", params: { id: result.order_id } });
  }

  const submitLabel = submitting ? "Membuat pesanan…" : "Buat pesanan";
  const hasAttachments = s.allows_attachments !== false;

  return (
    <Shell>
      <Link
        to="/layanan/$slug"
        params={{ slug }}
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Kembali ke layanan
      </Link>
      <CheckoutHeader
        title="Checkout jasa"
        desc="Ceritakan proyekmu. Harga dihitung ulang di server, instruksi pembayaran muncul setelah pesanan dibuat."
        steps={["Brief proyek", "Pembayaran", "Pengerjaan"]}
      />

      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8"
      >
        <div className="min-w-0 space-y-4">
          <ServiceSummary service={s} />

          <Card step={1} title="Paket" headingId="paket-heading">
            <PackagePicker
              packages={packages}
              selectedId={selectedPackage?.id ?? null}
              onSelect={setPackageId}
            />
            <AddonPicker addons={addons} selected={addonIds} onToggle={toggleAddon} />
          </Card>

          <Card step={2} title="Brief proyek">
            {s.requirements_note ? (
              <div className="rounded-xl bg-surface-selected/50 p-3 text-sm">
                <p className="font-medium">Yang perlu disiapkan</p>
                <p className="mt-1 whitespace-pre-line break-words text-muted-foreground">
                  {s.requirements_note}
                </p>
              </div>
            ) : null}
            <Field id="judul" label="Nama proyek" required invalid={invalid("judul")}>
              <Input
                id="judul"
                value={title}
                maxLength={200}
                className="min-h-11"
                aria-invalid={invalid("judul")}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Website company profile toko kue"
              />
            </Field>
            <Field
              id="deskripsi"
              label="Apa yang kamu butuhkan?"
              required
              invalid={invalid("deskripsi")}
              hint={`${description.trim().length}/4000 · minimal 20 karakter`}
            >
              <Textarea
                id="deskripsi"
                value={description}
                maxLength={4000}
                aria-invalid={invalid("deskripsi")}
                className="min-h-32"
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Jelaskan tujuan proyek, fitur atau isi yang diinginkan, dan target penggunanya."
              />
            </Field>
            <Field
              id="hasil"
              label="Hasil yang diharapkan"
              hint="Contoh: 5 halaman, file desain Figma, source code di ZIP."
            >
              <Textarea
                id="hasil"
                value={deliverables}
                maxLength={2000}
                onChange={(e) => setDeliverables(e.target.value)}
              />
            </Field>
            <Field
              id="referensi"
              label="Referensi atau contoh"
              hint="Tautan website, desain, atau aplikasi yang kamu suka. Satu per baris."
            >
              <Textarea
                id="referensi"
                value={references}
                maxLength={2000}
                onChange={(e) => setReferences(e.target.value)}
                placeholder="https://"
              />
            </Field>
            <Field
              id="tenggat"
              label="Target selesai"
              invalid={invalid("tenggat")}
              hint="Opsional. Kosongkan bila mengikuti estimasi paket."
            >
              <Input
                id="tenggat"
                type="datetime-local"
                className="min-h-11"
                min={minDeadlineLocal()}
                aria-invalid={invalid("tenggat")}
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </Field>
            {secretWarning ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
              >
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Brief tampaknya berisi kata sandi, token, atau kunci rahasia. Hapus dulu. Akses
                dibagikan lewat chat pesanan bila benar-benar diperlukan.
              </p>
            ) : null}
          </Card>

          {hasAttachments ? (
            <Card step={3} title="Lampiran" optional>
              <p className="text-sm text-muted-foreground">
                Logo, aset, dokumen kebutuhan, atau contoh desain. Maks. 20 MB per berkas.
              </p>
              <AttachmentUploader
                types={GENERAL_ATTACHMENT_TYPES}
                type={attachmentType}
                onTypeChange={setAttachmentType}
                inputRef={fileInput}
                uploading={uploading}
                onUpload={handleUpload}
                items={attachments}
                onRemove={handleRemoveAttachment}
              />
            </Card>
          ) : null}

          <Card step={hasAttachments ? 4 : 3} title="Konfirmasi">
            <p className="flex items-start gap-2 rounded-xl bg-surface-selected/50 p-3 text-sm text-muted-foreground">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
              <span>
                Jangan tulis kata sandi hosting, token Git, atau kredensial produksi di formulir
                ini. Bila akses diperlukan, tim akan memintanya lewat chat pesanan.
              </span>
            </p>
            <Agreement
              id="kredensial"
              checked={noCredentialAccepted}
              onChange={setNoCredentialAccepted}
              invalid={invalid("kredensial")}
            >
              Saya tidak mencantumkan kata sandi, token, atau kredensial apa pun di brief ini.
            </Agreement>
            <Field id="catatan" label="Catatan untuk admin">
              <Textarea
                id="catatan"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
              />
            </Field>
          </Card>
        </div>

        <aside className="min-w-0 self-start lg:sticky lg:top-24">
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <h2 className="font-display text-base font-semibold">Ringkasan pesanan</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row
                label={selectedPackage?.name ?? "Paket belum dipilih"}
                value={formatIDR(Number(selectedPackage?.price ?? 0))}
              />
              {selectedAddons.map((a: any) => (
                <Row key={a.id} label={a.name} value={formatIDR(Number(a.price))} />
              ))}
              <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
                <dt className="font-semibold">Subtotal</dt>
                <dd className="font-display text-2xl font-bold tabular-nums text-price">
                  {formatIDR(total)}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              Total final, termasuk biaya admin bila ada, dihitung sistem saat pesanan dibuat.
            </p>
            <MissingList show={showErrors} missing={missing} onFocus={focusField} />
            <Button
              type="submit"
              className="mt-4 hidden min-h-11 w-full lg:inline-flex"
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="mr-1 size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {submitLabel}
            </Button>
          </div>
        </aside>

        <StickyActionBar className="lg:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-muted-foreground">
                {missing.length ? `${missing.length} isian belum lengkap` : "Siap dipesan"}
              </p>
              <p className="text-base font-bold tabular-nums">{formatIDR(total)}</p>
            </div>
            <Button type="submit" className="min-h-11 shrink-0" disabled={submitting}>
              {submitLabel}
            </Button>
          </div>
        </StickyActionBar>
      </form>
    </Shell>
  );
}

/* ================= Alur akademik ================= */

function AcademicCheckout({ service }: { service: any }) {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useSession();
  const submitOrder = useServerFn(createAcademicOrder);
  const fetchQuote = useServerFn(quoteAcademicOrder);
  const registerAttachment = useServerFn(registerAcademicAttachment);
  const fetchAttachments = useServerFn(listDraftAttachments);
  const dropAttachment = useServerFn(removeDraftAttachment);

  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const draftKey = useMemo(() => crypto.randomUUID(), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const [packageId, setPackageId] = useState<string | null>(search.pkg ?? null);
  const [addonIds, setAddonIds] = useState<string[]>(
    search.addons ? search.addons.split(",").filter(Boolean) : [],
  );
  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Makassar";
    } catch {
      return "Asia/Makassar";
    }
  }, []);

  const [courseName, setCourseName] = useState("");
  const [studyProgram, setStudyProgram] = useState("");
  const [institution, setInstitution] = useState("");
  const [educationLevel, setEducationLevel] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lecturerInstructions, setLecturerInstructions] = useState("");
  const [deadline, setDeadline] = useState("");
  const [language, setLanguage] = useState("id");
  const [outputType, setOutputType] = useState("");
  const [fileFormat, setFileFormat] = useState("");
  const [citationStyle, setCitationStyle] = useState("");
  const [estimatedPages, setEstimatedPages] = useState("");
  const [specialNotes, setSpecialNotes] = useState("");
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [scopeFlags, setScopeFlags] = useState<string[]>([]);
  const [reviewerRequested, setReviewerRequested] = useState(false);
  const [integrityAccepted, setIntegrityAccepted] = useState(false);
  const [noCredentialAccepted, setNoCredentialAccepted] = useState(false);
  const [attachmentType, setAttachmentType] = useState<string>("assignment_instruction");
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [quote, setQuote] = useState<Record<string, any> | null>(null);
  const [quoteState, setQuoteState] = useState<"idle" | "loading" | "error">("idle");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const packages = (service?.service_packages ?? []) as any[];
  const addons = (service?.service_addons ?? []) as any[];
  const selectedPackage =
    packages.find((p) => p.id === packageId) ?? resolveInitialPackage(packages, null);
  const categorySlug: string | null = service?.categories?.slug ?? null;
  const extraFields = extraFieldsFor(categorySlug);
  const deadlineIso = deadline ? new Date(deadline).toISOString() : null;
  const reviewForced = !!service?.requires_quality_review;

  /* Estimasi harga selalu dari server. */
  useEffect(() => {
    if (!service || !selectedPackage) return;
    let active = true;
    setQuoteState("loading");
    void fetchQuote({
      data: {
        serviceId: service.id,
        packageId: selectedPackage.id,
        addonIds,
        deadline: deadlineIso,
        reviewerRequested: reviewerRequested || reviewForced,
      },
    })
      .then((res: any) => {
        if (!active) return;
        setQuote(res?.ok ? res.quote : null);
        setQuoteState(res?.ok ? "idle" : "error");
      })
      .catch(() => active && setQuoteState("error"));
    return () => {
      active = false;
    };
  }, [service?.id, selectedPackage?.id, addonIds.join(","), deadlineIso, reviewerRequested]);

  const s = service;
  const selectedAddons = addons.filter((a) => addonIds.includes(a.id));
  const allowedLevels: string[] = s.supported_education_levels ?? [];
  const levelOptions = allowedLevels.length
    ? EDUCATION_LEVELS.filter((l) => allowedLevels.includes(l.value))
    : EDUCATION_LEVELS;
  const localTotal =
    Number(selectedPackage?.price ?? 0) + selectedAddons.reduce((n, a) => n + Number(a.price), 0);
  const estimatedTotal = Number(quote?.total ?? localTotal);
  const missingExtras = extraFields.some((f) => f.required && !(extras[f.key] ?? "").trim());
  const missing = checkoutMissingItems({
    hasPackage: !!selectedPackage,
    courseName,
    studyProgram,
    educationLevel,
    title,
    description,
    deadlineIso,
    outputType,
    fileFormat,
    missingExtras,
    integrityAccepted,
    noCredentialAccepted,
  });
  const missingSet = new Set(missing.map((m) => m.field));
  const invalid = (field: string) => showErrors && missingSet.has(field);

  const toggleAddon = (id: string) =>
    setAddonIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleFlag = (value: string) =>
    setScopeFlags((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );

  function focusField(field: string) {
    const target =
      field === "extra"
        ? document.querySelector<HTMLElement>("[data-extra-required='true']")
        : document.getElementById(field === "paket" ? "paket-heading" : field);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (target && "focus" in target) (target as HTMLElement).focus({ preventScroll: true });
  }

  async function refreshAttachments() {
    const res: any = await fetchAttachments({ data: { draftKey } });
    setAttachments(res?.items ?? []);
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!user) return toast.error("Sesi berakhir. Masuk kembali untuk mengunggah.");
    if (file.size > MAX_FILE) return toast.error("Ukuran berkas maksimal 20 MB.");

    setUploading(true);
    const ext = file.name.includes(".") ? file.name.split(".").pop()!.slice(0, 8) : "bin";
    const path = `${user.id}/${draftKey}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("academic-order-attachments")
      .upload(path, file, { contentType: file.type || undefined });

    if (upErr) {
      setUploading(false);
      return toast.error("Berkas gagal diunggah. Coba lagi.");
    }

    const res: any = await registerAttachment({
      data: {
        draftKey,
        attachmentType: attachmentType as any,
        storagePath: path,
        originalName: file.name.slice(0, 200),
        mimeType: file.type || undefined,
        fileSize: file.size,
      },
    });
    setUploading(false);
    if (!res?.ok) return toast.error(res?.error ?? "Lampiran gagal disimpan.");
    toast.success("Lampiran ditambahkan.");
    void refreshAttachments();
  }

  async function handleRemoveAttachment(id: string) {
    const res: any = await dropAttachment({ data: { id } });
    if (!res?.ok) return toast.error("Lampiran gagal dihapus.");
    void refreshAttachments();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!selectedPackage || missing.length) {
      setShowErrors(true);
      toast.error(`Masih ada ${missing.length} isian yang perlu dilengkapi.`);
      focusField(missing[0]?.field ?? "paket");
      return;
    }
    setSubmitting(true);
    const result = await submitOrder({
      data: {
        serviceId: s.id,
        packageId: selectedPackage.id,
        addonIds,
        academic: {
          course_name: courseName.trim(),
          study_program: studyProgram.trim(),
          education_level: educationLevel as any,
          assignment_title: title.trim(),
          assignment_description: description.trim(),
          lecturer_instructions: lecturerInstructions.trim(),
          official_deadline_at: deadlineIso!,
          customer_timezone: timezone,
          language,
          output_type: outputType,
          file_format: fileFormat,
          citation_style: citationStyle,
          estimated_pages: estimatedPages,
          institution_name: institution.trim(),
          software_required: (extras.software ?? "").trim(),
          dataset_description: (extras.result_data ?? "").trim(),
          presentation_duration: extras.duration_minutes ?? "",
          special_notes: specialNotes.trim(),
          extra_fields: extras,
        },
        scopeFlags,
        reviewerRequested: reviewerRequested || reviewForced,
        integrityAccepted,
        noCredentialAccepted,
        draftKey,
        idempotencyKey,
        note: note.trim() || undefined,
      },
    }).catch(() => ({ ok: false as const, error: "Koneksi terputus. Coba kirim lagi." }));
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Pesanan ${result.order_number} dibuat. Lanjutkan pembayaran.`);
    navigate({ to: "/dashboard/pesanan/$id", params: { id: result.order_id } });
  }

  const submitLabel = submitting ? "Membuat pesanan…" : "Buat pesanan";

  return (
    <Shell>
      <Link
        to="/layanan/$slug"
        params={{ slug }}
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Kembali ke layanan
      </Link>
      <CheckoutHeader
        title="Checkout layanan akademik"
        desc="Isi kebutuhan pesanan. Instruksi pembayaran muncul setelah pesanan dibuat."
        steps={["Data tugas", "Pembayaran", "Pengerjaan"]}
      />

      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8"
      >
        <div className="min-w-0 space-y-4">
          <ServiceSummary service={s} />

          <Card step={1} title="Paket" headingId="paket-heading">
            <div role="radiogroup" aria-labelledby="paket-heading" className="space-y-2">
              {packages.map((pkg: any) => {
                const active = pkg.id === selectedPackage?.id;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPackageId(pkg.id)}
                    className={cn(
                      "flex min-h-11 w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-accent bg-surface-selected/60"
                        : "border-border bg-background hover:border-accent/40",
                    )}
                  >
                    <RadioDot active={active} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-words text-sm font-semibold">
                          {pkg.name}
                        </span>
                        <span className="shrink-0 text-sm font-bold tabular-nums">
                          {formatIDR(Number(pkg.price))}
                        </span>
                      </span>
                      <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {pkg.estimated_days ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="size-3.5" aria-hidden="true" />
                            {pkg.estimated_days} hari
                          </span>
                        ) : null}
                        <span className="inline-flex items-center gap-1">
                          <RefreshCcw className="size-3.5" aria-hidden="true" />
                          {revisionLabel(pkg.free_revisions)}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {addons.length ? (
              <fieldset className="mt-4">
                <legend className="text-sm font-medium">Tambahan (opsional)</legend>
                <div className="mt-2 space-y-2">
                  {addons.map((addon: any) => {
                    const active = addonIds.includes(addon.id);
                    return (
                      <button
                        key={addon.id}
                        type="button"
                        role="checkbox"
                        aria-checked={active}
                        onClick={() => toggleAddon(addon.id)}
                        className={cn(
                          "flex min-h-11 w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "border-accent bg-surface-selected/60"
                            : "border-border bg-background hover:border-accent/40",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "grid size-5 shrink-0 place-items-center rounded-md border",
                            active
                              ? "border-accent bg-accent text-accent-foreground"
                              : "border-border",
                          )}
                        >
                          {active ? <Check className="size-3.5" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 break-words text-sm font-medium">
                          {addon.name}
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          +{formatIDR(Number(addon.price))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}
          </Card>

          <Card step={2} title="Tentang tugas">
            {s.requirements_note ? (
              <div className="rounded-xl bg-surface-selected/50 p-3 text-sm">
                <p className="font-medium">Yang perlu disiapkan</p>
                <p className="mt-1 whitespace-pre-line break-words text-muted-foreground">
                  {s.requirements_note}
                </p>
              </div>
            ) : null}
            <Field id="judul" label="Judul tugas" required invalid={invalid("judul")}>
              <Input
                id="judul"
                value={title}
                maxLength={200}
                className="min-h-11"
                aria-invalid={invalid("judul")}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Analisis pengaruh promosi terhadap penjualan"
              />
            </Field>
            <Field
              id="deskripsi"
              label="Apa yang perlu dikerjakan?"
              required
              invalid={invalid("deskripsi")}
              hint={`${description.trim().length}/4000 · minimal 20 karakter`}
            >
              <Textarea
                id="deskripsi"
                value={description}
                maxLength={4000}
                aria-invalid={invalid("deskripsi")}
                className="min-h-32"
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Jelaskan konteks tugas, bagian yang perlu dibantu, dan hasil yang kamu harapkan."
              />
            </Field>
            <Field id="instruksi" label="Instruksi dosen">
              <Textarea
                id="instruksi"
                value={lecturerInstructions}
                maxLength={4000}
                onChange={(e) => setLecturerInstructions(e.target.value)}
                placeholder="Salin instruksi dari dosen bila ada."
              />
            </Field>
            {extraFields.length ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {extraFields.map((f) => {
                  const bad = showErrors && !!f.required && !(extras[f.key] ?? "").trim();
                  return (
                    <div
                      key={f.key}
                      className={f.type === "textarea" ? "sm:col-span-2" : undefined}
                    >
                      <Field
                        id={`extra-${f.key}`}
                        label={f.label}
                        required={f.required}
                        invalid={bad}
                      >
                        {f.type === "textarea" ? (
                          <Textarea
                            id={`extra-${f.key}`}
                            data-extra-required={bad ? "true" : undefined}
                            maxLength={1000}
                            aria-invalid={bad}
                            value={extras[f.key] ?? ""}
                            onChange={(e) => setExtras({ ...extras, [f.key]: e.target.value })}
                          />
                        ) : (
                          <Input
                            id={`extra-${f.key}`}
                            data-extra-required={bad ? "true" : undefined}
                            className="min-h-11"
                            maxLength={160}
                            aria-invalid={bad}
                            inputMode={f.type === "number" ? "numeric" : undefined}
                            placeholder={f.placeholder}
                            value={extras[f.key] ?? ""}
                            onChange={(e) =>
                              setExtras({
                                ...extras,
                                [f.key]:
                                  f.type === "number"
                                    ? e.target.value.replace(/\D/g, "")
                                    : e.target.value,
                              })
                            }
                          />
                        )}
                      </Field>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </Card>

          <Card step={3} title="Data akademik">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="matkul" label="Mata kuliah" required invalid={invalid("matkul")}>
                <Input
                  id="matkul"
                  value={courseName}
                  maxLength={120}
                  className="min-h-11"
                  aria-invalid={invalid("matkul")}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="Metodologi Penelitian"
                />
              </Field>
              <Field id="prodi" label="Program studi" required invalid={invalid("prodi")}>
                <Input
                  id="prodi"
                  value={studyProgram}
                  maxLength={120}
                  className="min-h-11"
                  aria-invalid={invalid("prodi")}
                  onChange={(e) => setStudyProgram(e.target.value)}
                  placeholder="Manajemen"
                />
              </Field>
              <Field id="jenjang" label="Jenjang" required invalid={invalid("jenjang")}>
                <Select value={educationLevel} onValueChange={setEducationLevel}>
                  <SelectTrigger
                    id="jenjang"
                    className="min-h-11"
                    aria-invalid={invalid("jenjang")}
                  >
                    <SelectValue placeholder="Pilih jenjang" />
                  </SelectTrigger>
                  <SelectContent>
                    {levelOptions.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="kampus" label="Institusi">
                <Input
                  id="kampus"
                  value={institution}
                  maxLength={160}
                  className="min-h-11"
                  onChange={(e) => setInstitution(e.target.value)}
                />
              </Field>
            </div>
          </Card>

          <Card step={4} title="Hasil dan tenggat">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="tenggat"
                label="Tenggat dari kampus"
                required
                invalid={invalid("tenggat")}
                hint={`Minimal 2 jam dari sekarang · ${timezone}`}
              >
                <Input
                  id="tenggat"
                  type="datetime-local"
                  className="min-h-11"
                  min={minDeadlineLocal()}
                  aria-invalid={invalid("tenggat")}
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </Field>
              <Field id="output" label="Bentuk hasil" required invalid={invalid("output")}>
                <Select value={outputType} onValueChange={setOutputType}>
                  <SelectTrigger id="output" className="min-h-11" aria-invalid={invalid("output")}>
                    <SelectValue placeholder="Pilih bentuk hasil" />
                  </SelectTrigger>
                  <SelectContent>
                    {OUTPUT_TYPES.filter(
                      (o) => !s.supported_outputs?.length || s.supported_outputs.includes(o.value),
                    ).map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="format" label="Format berkas" required invalid={invalid("format")}>
                <Select value={fileFormat} onValueChange={setFileFormat}>
                  <SelectTrigger id="format" className="min-h-11" aria-invalid={invalid("format")}>
                    <SelectValue placeholder="Pilih format" />
                  </SelectTrigger>
                  <SelectContent>
                    {FILE_FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="bahasa" label="Bahasa">
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger id="bahasa" className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="sitasi" label="Gaya sitasi">
                <Select
                  value={citationStyle || "none"}
                  onValueChange={(v) => setCitationStyle(v === "none" ? "" : v)}
                >
                  <SelectTrigger id="sitasi" className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tidak ditentukan</SelectItem>
                    {CITATION_STYLES.filter(
                      (c) =>
                        !s.supported_citation_styles?.length ||
                        s.supported_citation_styles.includes(c.value),
                    ).map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="halaman" label="Perkiraan halaman">
                <Input
                  id="halaman"
                  inputMode="numeric"
                  className="min-h-11"
                  value={estimatedPages}
                  onChange={(e) => setEstimatedPages(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </Field>
            </div>
            <Field id="catatan-khusus" label="Catatan khusus">
              <Textarea
                id="catatan-khusus"
                value={specialNotes}
                maxLength={1000}
                onChange={(e) => setSpecialNotes(e.target.value)}
              />
            </Field>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
              <Checkbox
                checked={reviewerRequested || reviewForced}
                onCheckedChange={(v) => setReviewerRequested(v === true)}
                disabled={reviewForced}
                className="mt-0.5"
              />
              <span className="text-sm">
                Minta pemeriksaan kualitas
                <span className="block text-xs text-muted-foreground">
                  {reviewForced
                    ? "Wajib untuk layanan ini."
                    : "Hasil dicek reviewer sebelum dikirim. Bisa menambah biaya."}
                </span>
              </span>
            </label>
          </Card>

          {s.allows_attachments !== false ? (
            <Card step={5} title="Lampiran" optional>
              <p className="text-sm text-muted-foreground">
                Instruksi, rubrik, template, draf, atau dataset. Maks. 20 MB per berkas.
              </p>
              <div className="grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)]">
                <Select value={attachmentType} onValueChange={setAttachmentType}>
                  <SelectTrigger aria-label="Jenis lampiran" className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ATTACHMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  ref={fileInput}
                  type="file"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={handleUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 justify-center"
                  disabled={uploading}
                  onClick={() => fileInput.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="mr-1 size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload className="mr-1 size-4" aria-hidden="true" />
                  )}
                  {uploading ? "Mengunggah…" : "Pilih berkas"}
                </Button>
              </div>
              {attachments.length ? (
                <ul className="space-y-2">
                  {attachments.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-3 rounded-xl border border-border p-2 pl-3"
                    >
                      <Paperclip
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{a.original_name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {ATTACHMENT_TYPES.find((t) => t.value === a.attachment_type)?.label ??
                            "Lampiran"}
                          {a.file_size ? ` · ${formatBytes(Number(a.file_size))}` : ""}
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11 shrink-0"
                        aria-label={`Hapus ${a.original_name}`}
                        onClick={() => handleRemoveAttachment(a.id)}
                      >
                        <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}

          <Card step={s.allows_attachments !== false ? 6 : 5} title="Integritas akademik">
            <p className="flex items-start gap-2 rounded-xl bg-surface-selected/50 p-3 text-sm text-muted-foreground">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
              <span>
                Kami membantu kamu memahami dan menyelesaikan tugas, bukan menggantikanmu. Kami
                tidak mengerjakan ujian atau kuis yang sedang berlangsung, tidak masuk ke akun
                kampus, dan tidak memalsukan data. Jangan kirim kata sandi, OTP, atau kredensial apa
                pun.
              </span>
            </p>
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">
                Centang bila permintaanmu mencakup salah satu hal ini
              </legend>
              {SCOPE_FLAGS.map((f) => (
                <label
                  key={f.value}
                  className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"
                >
                  <Checkbox
                    checked={scopeFlags.includes(f.value)}
                    onCheckedChange={() => toggleFlag(f.value)}
                  />
                  <span>{f.label}</span>
                </label>
              ))}
            </fieldset>
            {scopeFlags.length ? (
              <p
                role="status"
                className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
              >
                Permintaanmu akan ditinjau admin dulu dan bisa ditolak bila di luar cakupan layanan.
              </p>
            ) : null}
            <div className="space-y-2 border-t border-border pt-3">
              <Agreement
                id="integritas"
                checked={integrityAccepted}
                onChange={setIntegrityAccepted}
                invalid={invalid("integritas")}
              >
                Saya akan mempelajari dan mempertanggungjawabkan hasil pendampingan sendiri.
              </Agreement>
              <Agreement
                id="kredensial"
                checked={noCredentialAccepted}
                onChange={setNoCredentialAccepted}
                invalid={invalid("kredensial")}
              >
                Saya tidak akan mengirim kredensial akun, kata sandi, atau kode OTP.
              </Agreement>
            </div>
            <Field id="catatan" label="Catatan untuk admin">
              <Textarea
                id="catatan"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
              />
            </Field>
          </Card>
        </div>

        <aside className="min-w-0 self-start lg:sticky lg:top-24">
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <h2 className="font-display text-base font-semibold">Ringkasan pesanan</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row
                label={selectedPackage?.name ?? "Paket belum dipilih"}
                value={formatIDR(Number(selectedPackage?.price ?? 0))}
              />
              {selectedAddons.map((a: any) => (
                <Row key={a.id} label={a.name} value={formatIDR(Number(a.price))} />
              ))}
              {quote && Number(quote.urgency_fee) > 0 ? (
                <Row
                  label={`Biaya tenggat ${(URGENCY_LABEL[String(quote.urgency_level)] ?? quote.urgency_level).toLowerCase()}`}
                  value={formatIDR(Number(quote.urgency_fee))}
                />
              ) : null}
              {quote && Number(quote.reviewer_fee) > 0 ? (
                <Row label="Pemeriksaan kualitas" value={formatIDR(Number(quote.reviewer_fee))} />
              ) : null}
              {quote && Number(quote.admin_fee) > 0 ? (
                <Row label="Biaya admin" value={formatIDR(Number(quote.admin_fee))} />
              ) : null}
              <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
                <dt className="font-semibold">Total</dt>
                <dd className="flex items-center gap-2 font-display text-2xl font-bold tabular-nums text-price">
                  {quoteState === "loading" ? (
                    <Loader2
                      className="size-4 animate-spin text-muted-foreground"
                      aria-label="Menghitung ulang"
                    />
                  ) : null}
                  {formatIDR(estimatedTotal)}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              {quoteState === "error"
                ? "Total belum bisa dihitung ulang. Angka di atas perkiraan; total final dihitung saat pesanan dibuat."
                : "Total final dihitung ulang sistem saat pesanan dibuat."}
            </p>

            {showErrors && missing.length ? (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm"
              >
                <p className="flex items-center gap-1.5 font-semibold text-destructive">
                  <AlertCircle className="size-4" aria-hidden="true" />
                  Lengkapi {missing.length} isian
                </p>
                <ul className="mt-1">
                  {missing.map((m) => (
                    <li key={m.field}>
                      <button
                        type="button"
                        onClick={() => focusField(m.field)}
                        className="min-h-9 text-left text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        {m.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Button
              type="submit"
              className="mt-4 hidden min-h-11 w-full lg:inline-flex"
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="mr-1 size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {submitLabel}
            </Button>
          </div>
        </aside>

        <StickyActionBar className="lg:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-muted-foreground">
                {missing.length ? `${missing.length} isian belum lengkap` : "Siap dipesan"}
              </p>
              <p className="text-base font-bold tabular-nums">{formatIDR(estimatedTotal)}</p>
            </div>
            <Button type="submit" className="min-h-11 shrink-0" disabled={submitting}>
              {submitLabel}
            </Button>
          </div>
        </StickyActionBar>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main lang="id" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-6 pt-3 sm:pt-6">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

function CheckoutHeader({
  title,
  desc,
  steps,
}: {
  title: string;
  desc: string;
  steps: [string, string, string];
}) {
  return (
    <div className="mt-3 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{desc}</p>
      <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs font-medium">
        {steps.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            {i > 0 ? (
              <span className="text-muted-foreground/50" aria-hidden="true">
                →
              </span>
            ) : null}
            <span
              aria-current={i === 0 ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5",
                i === 0
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full text-[10px] font-bold",
                  i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {i + 1}
              </span>
              {label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ServiceSummary({ service: s }: { service: any }) {
  const category = displayCategoryOf(s);
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Layanan dipesan
      </h2>
      <div className="mt-3 flex min-w-0 gap-4">
        {isRenderableImageUrl(s.thumbnail_url) ? (
          <img
            src={s.thumbnail_url}
            alt=""
            className="size-20 shrink-0 rounded-xl border border-border object-cover sm:size-24"
          />
        ) : (
          <span
            className="grid size-20 shrink-0 place-items-center rounded-xl border border-border bg-secondary font-display text-3xl font-bold text-muted-foreground/40 sm:size-24"
            aria-hidden="true"
          >
            {(String(s.name ?? "").trim()[0] ?? "?").toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {category ? (
            <p className="inline-flex max-w-full items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
              <span className="truncate">{category.name}</span>
            </p>
          ) : null}
          <p className="mt-1 break-words font-display font-semibold leading-snug">{s.name}</p>
          {s.short_description ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{s.short_description}</p>
          ) : null}
          <Link
            to="/layanan/$slug"
            params={{ slug: s.slug }}
            className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Lihat detail layanan
          </Link>
        </div>
      </div>
    </section>
  );
}

function Card({
  step,
  title,
  optional,
  headingId,
  children,
}: {
  step: number;
  title: string;
  optional?: boolean;
  headingId?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5"
    >
      <h2
        id={headingId}
        tabIndex={headingId ? -1 : undefined}
        className="flex items-center gap-2 text-base font-semibold focus:outline-none"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
          {step}
        </span>
        {title}
        {optional ? (
          <span className="text-xs font-normal text-muted-foreground">(opsional)</span>
        ) : null}
      </h2>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  required,
  invalid,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  invalid?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className={cn(invalid && "text-destructive")}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </Label>
      {children}
      {invalid ? (
        <p className="text-xs text-destructive">Wajib diisi.</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function Agreement({
  id,
  checked,
  onChange,
  invalid,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl p-2 text-sm",
        invalid && "bg-destructive/5 text-destructive",
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        aria-invalid={invalid}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5"
      />
      <span>
        {children}
        <span className="text-destructive" aria-hidden="true">
          {" "}
          *
        </span>
      </span>
    </label>
  );
}

function RadioDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
        active ? "border-accent bg-accent text-accent-foreground" : "border-border",
      )}
    >
      {active ? <Check className="size-3.5" /> : null}
    </span>
  );
}

function PackagePicker({
  packages,
  selectedId,
  onSelect,
}: {
  packages: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div role="radiogroup" aria-labelledby="paket-heading" className="space-y-2">
      {packages.map((pkg: any) => {
        const active = pkg.id === selectedId;
        return (
          <button
            key={pkg.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(pkg.id)}
            className={cn(
              "flex min-h-11 w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-accent bg-surface-selected/60"
                : "border-border bg-background hover:border-accent/40",
            )}
          >
            <RadioDot active={active} />
            <span className="min-w-0 flex-1">
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0 break-words text-sm font-semibold">{pkg.name}</span>
                <span className="shrink-0 text-sm font-bold tabular-nums">
                  {formatIDR(Number(pkg.price))}
                </span>
              </span>
              {pkg.description ? (
                <span className="mt-1 block whitespace-pre-line break-words text-xs text-muted-foreground">
                  {pkg.description}
                </span>
              ) : null}
              <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {pkg.estimated_days ? (
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="size-3.5" aria-hidden="true" />
                    {pkg.estimated_days} hari
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <RefreshCcw className="size-3.5" aria-hidden="true" />
                  {revisionLabel(pkg.free_revisions)}
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function AddonPicker({
  addons,
  selected,
  onToggle,
}: {
  addons: any[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (!addons.length) return null;
  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-medium">Tambahan (opsional)</legend>
      <div className="mt-2 space-y-2">
        {addons.map((addon: any) => {
          const active = selected.includes(addon.id);
          return (
            <button
              key={addon.id}
              type="button"
              role="checkbox"
              aria-checked={active}
              onClick={() => onToggle(addon.id)}
              className={cn(
                "flex min-h-11 w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-accent bg-surface-selected/60"
                  : "border-border bg-background hover:border-accent/40",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-md border",
                  active ? "border-accent bg-accent text-accent-foreground" : "border-border",
                )}
              >
                {active ? <Check className="size-3.5" /> : null}
              </span>
              <span className="min-w-0 flex-1 break-words text-sm font-medium">{addon.name}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                +{formatIDR(Number(addon.price))}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function AttachmentUploader({
  types,
  type,
  onTypeChange,
  inputRef,
  uploading,
  onUpload,
  items,
  onRemove,
}: {
  types: readonly { value: string; label: string }[];
  type: string;
  onTypeChange: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  uploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  items: any[];
  onRemove: (id: string) => void;
}) {
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)]">
        <Select value={type} onValueChange={onTypeChange}>
          <SelectTrigger aria-label="Jenis lampiran" className="min-h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {types.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onUpload}
        />
        <Button
          type="button"
          variant="outline"
          className="min-h-11 justify-center"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-1 size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="mr-1 size-4" aria-hidden="true" />
          )}
          {uploading ? "Mengunggah…" : "Pilih berkas"}
        </Button>
      </div>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-xl border border-border p-2 pl-3"
            >
              <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{a.original_name}</span>
                <span className="block text-xs text-muted-foreground">
                  {types.find((t) => t.value === a.attachment_type)?.label ?? "Lampiran"}
                  {a.file_size ? ` · ${formatBytes(Number(a.file_size))}` : ""}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0"
                aria-label={`Hapus ${a.original_name}`}
                onClick={() => onRemove(a.id)}
              >
                <Trash2 className="size-4 text-destructive" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function MissingList({
  show,
  missing,
  onFocus,
}: {
  show: boolean;
  missing: { field: string; label: string }[];
  onFocus: (field: string) => void;
}) {
  if (!show || !missing.length) return null;
  return (
    <div
      role="alert"
      className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm"
    >
      <p className="flex items-center gap-1.5 font-semibold text-destructive">
        <AlertCircle className="size-4" aria-hidden="true" />
        Lengkapi {missing.length} isian
      </p>
      <ul className="mt-1">
        {missing.map((m) => (
          <li key={m.field}>
            <button
              type="button"
              onClick={() => onFocus(m.field)}
              className="min-h-11 text-left text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {m.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="min-w-0 break-words text-muted-foreground">{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  );
}
