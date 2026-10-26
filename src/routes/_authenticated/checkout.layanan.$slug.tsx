import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { Paperclip, ShieldAlert, Trash2 } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminError, AdminLoading } from "@/components/admin/admin-ui";
import { StickyActionBar, formatIDR } from "@/components/ebry/cards";
import { getServiceDetail } from "@/lib/catalog.functions";
import {
  createAcademicOrder,
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
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  pkg: z.string().optional(),
  addons: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/checkout/layanan/$slug")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Checkout Pendampingan Akademik — Ebrystore" },
      { name: "description", content: "Lengkapi kebutuhan tugas sebelum melakukan pembayaran di Ebrystore." },
      { property: "og:title", content: "Checkout Pendampingan Akademik — Ebrystore" },
      { property: "og:description", content: "Ringkasan paket, tambahan, dan kebutuhan tugas Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutLayanan,
});

function CheckoutLayanan() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useSession();
  const fetchDetail = useServerFn(getServiceDetail);
  const submitOrder = useServerFn(createAcademicOrder);
  const fetchQuote = useServerFn(quoteAcademicOrder);
  const registerAttachment = useServerFn(registerAcademicAttachment);
  const fetchAttachments = useServerFn(listDraftAttachments);
  const dropAttachment = useServerFn(removeDraftAttachment);

  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const draftKey = useMemo(() => crypto.randomUUID(), []);
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
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data, isPending, error } = useQuery({
    queryKey: ["service-detail", slug],
    queryFn: () => fetchDetail({ data: { slug } }),
  });

  const service = data?.service as any;
  const packages = (service?.service_packages ?? []) as any[];
  const addons = (service?.service_addons ?? []) as any[];
  const activePackageId = packageId ?? packages[0]?.id ?? null;
  const selectedPackage = packages.find((p) => p.id === activePackageId) ?? null;
  const categorySlug: string | null = service?.categories?.slug ?? null;
  const extraFields = extraFieldsFor(categorySlug);
  const deadlineIso = deadline ? new Date(deadline).toISOString() : null;

  /* Estimasi harga selalu dari server. */
  useEffect(() => {
    if (!service || !selectedPackage) return;
    let active = true;
    void fetchQuote({
      data: {
        serviceId: service.id,
        packageId: selectedPackage.id,
        addonIds,
        deadline: deadlineIso,
        reviewerRequested,
      },
    }).then((res: any) => {
      if (!active) return;
      setQuote(res?.ok ? res.quote : null);
    });
    return () => {
      active = false;
    };
  }, [service?.id, selectedPackage?.id, addonIds.join(","), deadlineIso, reviewerRequested]);

  if (isPending) {
    return (
      <Shell>
        <AdminLoading label="Memuat layanan…" />
      </Shell>
    );
  }
  if (error || !data?.service) {
    return (
      <Shell>
        <AdminError message="Layanan tidak tersedia untuk dipesan." />
        <Button asChild variant="outline" className="mt-4">
          <Link to="/layanan">Kembali ke daftar layanan</Link>
        </Button>
      </Shell>
    );
  }

  const s = service;
  const selectedAddons = addons.filter((a) => addonIds.includes(a.id));
  const allowedLevels: string[] = s.supported_education_levels ?? [];
  const levelOptions = allowedLevels.length
    ? EDUCATION_LEVELS.filter((l) => allowedLevels.includes(l.value))
    : EDUCATION_LEVELS;
  const estimatedTotal = Number(
    quote?.total ?? Number(selectedPackage?.price ?? 0) + selectedAddons.reduce((n, a) => n + Number(a.price), 0),
  );
  const missingExtras = extraFields.some((f) => f.required && !(extras[f.key] ?? "").trim());
  const missingItems: string[] = [
    !selectedPackage && "Pilih paket layanan",
    courseName.trim().length < 2 && "Nama mata kuliah",
    studyProgram.trim().length < 2 && "Program studi",
    educationLevel === "" && "Jenjang pendidikan",
    title.trim().length < 3 && "Judul tugas",
    description.trim().length < 20 && "Deskripsi tugas (minimal 20 karakter)",
    !deadlineIso && "Tenggat resmi",
    outputType === "" && "Jenis keluaran",
    fileFormat === "" && "Format berkas",
    missingExtras && "Detail tambahan wajib pada kategori ini",
    !integrityAccepted && "Centang pernyataan integritas akademik",
    !noCredentialAccepted && "Centang pernyataan tanpa kredensial",
  ].filter(Boolean) as string[];
  const canSubmit = missingItems.length === 0;

  const toggleAddon = (id: string) =>
    setAddonIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleFlag = (value: string) =>
    setScopeFlags((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));

  async function refreshAttachments() {
    const res: any = await fetchAttachments({ data: { draftKey } });
    setAttachments(res?.items ?? []);
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!user) return toast.error("Sesi berakhir. Masuk kembali untuk mengunggah.");
    if (file.size > 20 * 1024 * 1024) return toast.error("Ukuran berkas maksimal 20 MB.");

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
    if (!selectedPackage || !canSubmit) {
      toast.error(`Lengkapi dulu: ${missingItems.slice(0, 3).join(", ")}${missingItems.length > 3 ? ", …" : ""}`);
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
        reviewerRequested,
        integrityAccepted,
        noCredentialAccepted,
        draftKey,
        idempotencyKey,
        note: note.trim() || undefined,
      },
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Pesanan ${result.order_number} dibuat. Lanjutkan pembayaran.`);
    navigate({ to: "/dashboard/pesanan/$id", params: { id: result.order_id } });
  }

  return (
    <Shell>
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <Link to="/layanan/$slug" params={{ slug }} className="hover:text-foreground">
          {s.name}
        </Link>{" "}
        / <span className="text-foreground">Checkout</span>
      </nav>
      <h1 className="mt-2 text-2xl font-bold">Checkout pendampingan akademik</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Harga final dihitung ulang di server. Ceritakan kebutuhan tugasmu agar pendamping akademik bisa
        langsung mulai.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-6 pb-28 lg:grid-cols-[1.3fr_1fr] lg:pb-0">
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold">1. Paket</h2>
            <ul className="mt-3 space-y-2">
              {packages.map((pkg: any) => {
                const active = pkg.id === activePackageId;
                return (
                  <li key={pkg.id}>
                    <button
                      type="button"
                      onClick={() => setPackageId(pkg.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full min-h-11 items-center justify-between gap-3 rounded-xl border p-4 text-left transition-colors",
                        active ? "border-accent bg-surface-selected/60" : "border-border hover:border-accent/40",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{pkg.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          Estimasi {pkg.estimated_days ?? "-"} hari · {pkg.free_revisions ?? 0} revisi gratis
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold">{formatIDR(Number(pkg.price))}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {addons.length ? (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-base font-semibold">2. Tambahan (opsional)</h2>
              <ul className="mt-3 space-y-2">
                {addons.map((addon: any) => {
                  const active = addonIds.includes(addon.id);
                  return (
                    <li key={addon.id}>
                      <button
                        type="button"
                        onClick={() => toggleAddon(addon.id)}
                        aria-pressed={active}
                        className={cn(
                          "flex w-full min-h-11 items-center justify-between gap-3 rounded-xl border p-4 text-left transition-colors",
                          active ? "border-accent bg-surface-selected/60" : "border-border hover:border-accent/40",
                        )}
                      >
                        <span className="text-sm font-medium">{addon.name}</span>
                        <span className="shrink-0 text-sm font-semibold">+{formatIDR(Number(addon.price))}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold">3. Data akademik</h2>
            {s.requirements_note ? (
              <p className="whitespace-pre-line rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
                {s.requirements_note}
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="matkul">Mata kuliah</Label>
                <Input id="matkul" value={courseName} maxLength={120} className="mt-1" required
                  onChange={(e) => setCourseName(e.target.value)} placeholder="Metodologi Penelitian" />
              </div>
              <div>
                <Label htmlFor="prodi">Program studi</Label>
                <Input id="prodi" value={studyProgram} maxLength={120} className="mt-1" required
                  onChange={(e) => setStudyProgram(e.target.value)} placeholder="Manajemen" />
              </div>
              <div>
                <Label htmlFor="kampus">Institusi (opsional)</Label>
                <Input id="kampus" value={institution} maxLength={160} className="mt-1"
                  onChange={(e) => setInstitution(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="jenjang">Jenjang</Label>
                <Select value={educationLevel} onValueChange={setEducationLevel}>
                  <SelectTrigger id="jenjang" className="mt-1">
                    <SelectValue placeholder="Pilih jenjang" />
                  </SelectTrigger>
                  <SelectContent>
                    {levelOptions.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="judul">Judul tugas</Label>
              <Input id="judul" value={title} maxLength={200} className="mt-1" required
                onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="deskripsi">Deskripsi tugas</Label>
              <Textarea id="deskripsi" value={description} maxLength={4000} required
                className="mt-1 min-h-28" onChange={(e) => setDescription(e.target.value)}
                placeholder="Jelaskan konteks tugas, cakupan, dan hasil yang Anda harapkan (min. 20 karakter)." />
            </div>
            <div>
              <Label htmlFor="instruksi">Instruksi dosen (opsional)</Label>
              <Textarea id="instruksi" value={lecturerInstructions} maxLength={4000} className="mt-1"
                onChange={(e) => setLecturerInstructions(e.target.value)} />
            </div>
            {extraFields.length ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {extraFields.map((f) => (
                  <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>
                    <Label htmlFor={`extra-${f.key}`}>
                      {f.label}
                      {f.required ? "" : " (opsional)"}
                    </Label>
                    {f.type === "textarea" ? (
                      <Textarea id={`extra-${f.key}`} className="mt-1" maxLength={1000}
                        value={extras[f.key] ?? ""}
                        onChange={(e) => setExtras({ ...extras, [f.key]: e.target.value })} />
                    ) : (
                      <Input id={`extra-${f.key}`} className="mt-1" maxLength={160}
                        inputMode={f.type === "number" ? "numeric" : undefined}
                        placeholder={f.placeholder}
                        value={extras[f.key] ?? ""}
                        onChange={(e) =>
                          setExtras({
                            ...extras,
                            [f.key]: f.type === "number" ? e.target.value.replace(/\D/g, "") : e.target.value,
                          })
                        } />
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold">4. Output dan tenggat</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="output">Bentuk hasil</Label>
                <Select value={outputType} onValueChange={setOutputType}>
                  <SelectTrigger id="output" className="mt-1"><SelectValue placeholder="Pilih output" /></SelectTrigger>
                  <SelectContent>
                    {OUTPUT_TYPES.filter(
                      (o) => !s.supported_outputs?.length || s.supported_outputs.includes(o.value),
                    ).map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="format">Format berkas</Label>
                <Select value={fileFormat} onValueChange={setFileFormat}>
                  <SelectTrigger id="format" className="mt-1"><SelectValue placeholder="Pilih format" /></SelectTrigger>
                  <SelectContent>
                    {FILE_FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="bahasa">Bahasa</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger id="bahasa" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sitasi">Gaya sitasi (opsional)</Label>
                <Select value={citationStyle || "none"} onValueChange={(v) => setCitationStyle(v === "none" ? "" : v)}>
                  <SelectTrigger id="sitasi" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tidak ditentukan</SelectItem>
                    {CITATION_STYLES.filter(
                      (c) => !s.supported_citation_styles?.length || s.supported_citation_styles.includes(c.value),
                    ).map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="halaman">Perkiraan halaman (opsional)</Label>
                <Input id="halaman" inputMode="numeric" className="mt-1" value={estimatedPages}
                  onChange={(e) => setEstimatedPages(e.target.value.replace(/\D/g, "").slice(0, 4))} />
              </div>
              <div>
                <Label htmlFor="tenggat">Tenggat resmi dari kampus</Label>
                <Input id="tenggat" type="datetime-local" className="mt-1" required value={deadline}
                  onChange={(e) => setDeadline(e.target.value)} />
                <p className="mt-1 text-xs text-muted-foreground">Zona waktu: {timezone}. Minimal 2 jam dari sekarang.</p>
              </div>
            </div>
            <div>
              <Label htmlFor="catatan-khusus">Catatan khusus (opsional)</Label>
              <Textarea id="catatan-khusus" value={specialNotes} maxLength={1000} className="mt-1"
                onChange={(e) => setSpecialNotes(e.target.value)} />
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-border p-3">
              <Checkbox checked={reviewerRequested} onCheckedChange={(v) => setReviewerRequested(v === true)}
                disabled={!!s.requires_quality_review} className="mt-0.5" />
              <span className="text-sm">
                Minta pemeriksaan kualitas (quality review)
                {s.requires_quality_review ? (
                  <span className="block text-xs text-muted-foreground">Wajib untuk layanan ini.</span>
                ) : null}
              </span>
            </label>
          </section>

          <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold">5. Lampiran (opsional)</h2>
            <p className="text-xs text-muted-foreground">
              Unggah instruksi tugas, rubrik, template, draf, atau dataset. Maksimal 20 MB per berkas.
            </p>
            <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
              <Select value={attachmentType} onValueChange={setAttachmentType}>
                <SelectTrigger aria-label="Jenis lampiran"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ATTACHMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="file" onChange={handleUpload} disabled={uploading} aria-label="Pilih berkas lampiran" />
            </div>
            {attachments.length ? (
              <ul className="space-y-2">
                {attachments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">{a.original_name}</span>
                    </span>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Hapus ${a.original_name}`}
                      onClick={() => handleRemoveAttachment(a.id)}>
                      <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold">6. Integritas akademik</h2>
            <p className="flex items-start gap-2 rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Ebrystore adalah layanan pendampingan akademik. Kami tidak mengerjakan ujian atau kuis yang sedang
              berlangsung, tidak mengakses akun kampus, dan tidak memalsukan data. Jangan mengirim kata sandi, OTP,
              atau kredensial apa pun.
            </p>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Apakah permintaan Anda mencakup hal berikut?</legend>
              {SCOPE_FLAGS.map((f) => (
                <label key={f.value} className="flex items-start gap-3 text-sm">
                  <Checkbox checked={scopeFlags.includes(f.value)} onCheckedChange={() => toggleFlag(f.value)}
                    className="mt-0.5" />
                  <span>{f.label}</span>
                </label>
              ))}
            </fieldset>
            {scopeFlags.length ? (
              <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                Permintaan Anda akan ditinjau admin terlebih dahulu sebelum dikerjakan dan dapat ditolak bila di luar
                cakupan layanan.
              </p>
            ) : null}
            <label className="flex items-start gap-3 text-sm">
              <Checkbox checked={integrityAccepted} onCheckedChange={(v) => setIntegrityAccepted(v === true)}
                className="mt-0.5" />
              <span>Saya memahami hasil pendampingan wajib saya pelajari dan pertanggungjawabkan sendiri.</span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox checked={noCredentialAccepted} onCheckedChange={(v) => setNoCredentialAccepted(v === true)}
                className="mt-0.5" />
              <span>Saya tidak akan mengirim kredensial akun, kata sandi, atau kode OTP apa pun.</span>
            </label>
            <div>
              <Label htmlFor="catatan">Catatan untuk admin (opsional)</Label>
              <Textarea id="catatan" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
                className="mt-1" />
            </div>
          </section>
        </div>

        <aside className="h-fit rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-24">
          <h2 className="text-sm font-semibold">Ringkasan</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{selectedPackage?.name ?? "Paket belum dipilih"}</dt>
              <dd>{formatIDR(Number(selectedPackage?.price ?? 0))}</dd>
            </div>
            {selectedAddons.map((a: any) => (
              <div key={a.id} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{a.name}</dt>
                <dd>{formatIDR(Number(a.price))}</dd>
              </div>
            ))}
            {quote && Number(quote.urgency_fee) > 0 ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">
                  Biaya urgensi ({URGENCY_LABEL[String(quote.urgency_level)] ?? quote.urgency_level})
                </dt>
                <dd>{formatIDR(Number(quote.urgency_fee))}</dd>
              </div>
            ) : null}
            {quote && Number(quote.reviewer_fee) > 0 ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Pemeriksaan kualitas</dt>
                <dd>{formatIDR(Number(quote.reviewer_fee))}</dd>
              </div>
            ) : null}
            {quote && Number(quote.admin_fee) > 0 ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Biaya admin</dt>
                <dd>{formatIDR(Number(quote.admin_fee))}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
              <dt>Perkiraan total</dt>
              <dd>{formatIDR(estimatedTotal)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Seluruh harga dihitung ulang di server saat pesanan dibuat. Pembayaran manual DANA a.n. FEBRYANUS TAMBING.
          </p>
          {missingItems.length ? (
            <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <p className="font-semibold">Belum bisa dipesan. Lengkapi:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                {missingItems.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button type="submit" className="mt-4 hidden w-full lg:inline-flex" disabled={submitting}>
            {submitting ? "Memproses…" : "Buat pesanan"}
          </Button>
          <Button asChild variant="ghost" className="mt-2 hidden w-full lg:inline-flex">
            <Link to="/layanan/$slug" params={{ slug }}>
              Batal
            </Link>
          </Button>
        </aside>

        <StickyActionBar className="lg:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-muted-foreground">{selectedPackage?.name ?? "Pilih paket"}</p>
              <p className="text-base font-bold">{formatIDR(estimatedTotal)}</p>
            </div>
            <Button type="submit" className="min-h-11 shrink-0" disabled={submitting}>
              {submitting ? "Memproses…" : "Buat pesanan"}
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
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      <SiteFooter />
    </div>
  );
}