import { useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  HelpCircle,
  Mail,
  Phone,
  ShieldCheck,
  Store,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import {
  SellerAlertBanner,
  SellerField,
  SellerPageHeader,
  SellerSectionCard,
  slugifyStoreName,
} from "@/components/seller/seller-ui";
import { StatusPill } from "@/components/ebry/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { applyAsSeller } from "@/lib/seller.functions";
import { cn } from "@/lib/utils";

type ApplyErrors = {
  name?: string;
  slug?: string;
  contactPhone?: string;
  contactEmail?: string;
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ACTIVATION_STEPS = [
  {
    step: "1",
    title: "Kirim profil toko",
    detail: "Isi nama, alamat URL toko, deskripsi, dan kontak operasional.",
  },
  {
    step: "2",
    title: "Verifikasi admin",
    detail: "Tim meninjau kelengkapan profil sebelum toko diaktifkan.",
  },
  {
    step: "3",
    title: "Unggah katalog & jual",
    detail: "Tambah produk digital atau jasa, ajukan moderasi, lalu terima pesanan.",
  },
] as const;

const SELLER_FACTS = [
  {
    icon: ShieldCheck,
    title: "Moderasi sebelum tayang",
    detail: "Produk digital dan jasa ditinjau agar kualitas katalog tetap terjaga.",
  },
  {
    icon: Wallet,
    title: "Dana tercatat di saldo toko",
    detail: "Dana dilepas setelah pembeli konfirmasi penerimaan dan bisa ditarik ke rekening.",
  },
  {
    icon: Store,
    title: "Halaman etalase sendiri",
    detail: "Toko mendapat URL tetap di /toko/<slug> untuk dibagikan langsung ke pembeli.",
  },
] as const;

/**
 * Halaman penuh "Ajukan Seller" (onboarding pembukaan toko).
 * Menyediakan auto-slug, validasi aksesibel pasca-interaksi, pratinjau langsung
 * etalase toko, dan transparansi alur verifikasi tanpa klaim fiktif.
 */
export function SellerOnboarding() {
  const queryClient = useQueryClient();
  const apply = useServerFn(applyAsSeller);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [description, setDescription] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  const nameRef = useRef<HTMLInputElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const effectiveSlug = useMemo(
    () => (slugManual ? slug.trim().toLowerCase() : slugifyStoreName(name)),
    [slugManual, slug, name],
  );

  const validationErrors = useMemo<ApplyErrors>(() => {
    const next: ApplyErrors = {};
    const trimmedName = name.trim();
    if (trimmedName.length < 3) {
      next.name = "Nama toko minimal 3 karakter.";
    }
    if (slugManual && slug.trim().length > 0) {
      const candidate = slug.trim().toLowerCase();
      if (candidate.length < 3) {
        next.slug = "Slug toko minimal 3 karakter.";
      } else if (!SLUG_RE.test(candidate)) {
        next.slug = "Gunakan huruf kecil, angka, dan tanda hubung (-) tanpa spasi.";
      }
    }
    const cleanPhone = contactPhone.trim();
    if (cleanPhone.length > 0 && cleanPhone.replace(/\D/g, "").length < 8) {
      next.contactPhone = "Masukkan nomor WhatsApp yang valid (minimal 8 digit).";
    }
    const cleanEmail = contactEmail.trim();
    if (cleanEmail.length > 0 && !EMAIL_RE.test(cleanEmail)) {
      next.contactEmail = "Masukkan alamat email dengan format nama@domain.com.";
    }
    return next;
  }, [name, slug, slugManual, contactPhone, contactEmail]);

  const showError = (field: keyof ApplyErrors) =>
    submitted || touched[field] ? validationErrors[field] : undefined;

  const mutation = useMutation({
    mutationFn: async () =>
      apply({
        data: {
          name: name.trim(),
          slug: effectiveSlug.length >= 3 ? effectiveSlug : undefined,
          description: description.trim() || undefined,
          contactPhone: contactPhone.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
        },
      }),
    onSuccess: async (res: { ok?: boolean; error?: string }) => {
      if (!res?.ok) {
        const msg = res?.error ?? "Pengajuan gagal dikirim.";
        setLiveAnnouncement(msg);
        toast.error(msg);
        return;
      }
      toast.success("Pengajuan toko dikirim. Menunggu verifikasi admin.");
      await queryClient.invalidateQueries({ queryKey: ["my-store"] });
    },
    onError: () => {
      const msg = "Pengajuan gagal diproses. Periksa koneksi lalu coba lagi.";
      setLiveAnnouncement(msg);
      toast.error(msg);
    },
  });

  function handleBlur(field: keyof ApplyErrors) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const msg = validationErrors[field];
    if (msg) setLiveAnnouncement(msg);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(validationErrors).length > 0) {
      if (validationErrors.name) nameRef.current?.focus();
      else if (validationErrors.slug) slugRef.current?.focus();
      else if (validationErrors.contactPhone) phoneRef.current?.focus();
      else if (validationErrors.contactEmail) emailRef.current?.focus();
      const firstError =
        validationErrors.name ??
        validationErrors.slug ??
        validationErrors.contactPhone ??
        validationErrors.contactEmail ??
        "Periksa kembali formulir pengajuan.";
      setLiveAnnouncement(firstError);
      return;
    }
    mutation.mutate();
  }

  const previewName = name.trim() || "Nama Toko Anda";
  const previewSlug = effectiveSlug || "nama-toko";
  const previewDesc =
    description.trim() || "Deskripsi singkat toko dan produk digital yang Anda tawarkan akan tampil di sini.";
  const initials = previewName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="space-y-4 sm:space-y-6">
      <SellerPageHeader
        title="Ajukan Toko Seller"
        description="Daftarkan toko Anda untuk menjual produk digital dan jasa di Ebrystore. Semua pengajuan diverifikasi admin sebelum tayang."
        badge={<StatusPill value="waiting" kind="raw" label="Verifikasi manual" />}
      />

      {/* Mobile (< sm): ringkasan mekanisme dilipat agar input pertama langsung muncul di atas layar. */}
      <details className="group rounded-[var(--radius-panel)] border border-border bg-card text-xs text-muted-foreground sm:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3.5 font-semibold text-foreground [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0 text-accent" aria-hidden="true" />
            Mekanisme jualan &amp; pencairan saldo
          </span>
          <ChevronDown
            className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <ul className="space-y-2.5 border-t border-border px-3.5 py-3">
          {SELLER_FACTS.map((item) => (
            <li key={item.title} className="flex items-start gap-2.5">
              <item.icon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
              <div>
                <p className="font-semibold text-foreground">{item.title}</p>
                <p className="mt-0.5 leading-relaxed">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </details>

      {/* Tablet & desktop (sm+): 3 ringkasan mekanisme nyata platform. */}
      <div className="hidden gap-3 sm:grid sm:grid-cols-3">
        {SELLER_FACTS.map((item) => (
          <div
            key={item.title}
            className="flex items-start gap-3 rounded-[var(--radius-panel)] border border-border bg-card p-3.5"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-selected text-accent">
              <item.icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Mobile & tablet (< lg): kartu pratinjau ringkas di atas form agar perubahan nama & URL langsung terlihat. */}
      <div
        aria-label="Pratinjau ringkas toko"
        className="flex items-center gap-3 rounded-[var(--radius-panel)] border border-border bg-card p-3 shadow-[var(--elev-1)] lg:hidden"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-surface-selected font-display text-sm font-bold text-accent">
          {initials || <Store className="size-5" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-bold text-foreground">{previewName}</p>
          <p className="truncate font-mono text-[11px] text-accent">/toko/{previewSlug}</p>
        </div>
        <StatusPill value="waiting" kind="raw" label="Pratinjau" />
      </div>

      {/* Live region tunggal untuk pembaca layar saat error muncul pasca-interaksi. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(310px,0.8fr)]">
        <form onSubmit={handleSubmit} noValidate className="min-w-0 space-y-5">
          <SellerSectionCard
            title="1. Identitas toko"
            description="Nama dan tautan ini menjadi alamat publik etalase toko Anda."
            headingId="apply-identity-heading"
          >
            <div className="space-y-4">
              <SellerField
                id="store-name"
                label="Nama toko"
                required
                counter={`${name.length}/80`}
                hint="Minimal 3 karakter. Hindari kata yang meniru merek resmi pihak lain."
                error={showError("name")}
              >
                <Input
                  ref={nameRef}
                  id="store-name"
                  name="store_name"
                  value={name}
                  onChange={(e) => {
                    const next = e.target.value;
                    setName(next);
                    if (!slugManual) setSlug(slugifyStoreName(next));
                  }}
                  onBlur={() => handleBlur("name")}
                  placeholder="Contoh: Studio Template Nusantara"
                  required
                  minLength={3}
                  maxLength={80}
                  autoComplete="organization"
                  aria-invalid={showError("name") ? "true" : "false"}
                  aria-describedby={
                    showError("name") ? "store-name-hint store-name-error" : "store-name-hint"
                  }
                  className="seller-field-control min-h-11"
                />
              </SellerField>

              <SellerField
                id="store-slug"
                label="Alamat URL toko"
                counter={`${effectiveSlug.length}/60`}
                hint="Dibuat otomatis dari nama toko, atau ubah sesuai keinginan. Hanya huruf kecil, angka, dan tanda hubung (-)."
                error={showError("slug")}
              >
                <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                  <span className="flex shrink-0 items-center border-r border-border bg-surface px-3 font-mono text-xs text-muted-foreground">
                    /toko/
                  </span>
                  <input
                    ref={slugRef}
                    id="store-slug"
                    name="store_slug"
                    value={slugManual ? slug : effectiveSlug}
                    onChange={(e) => {
                      setSlugManual(true);
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                    }}
                    onBlur={() => handleBlur("slug")}
                    placeholder="studio-template-nusantara"
                    maxLength={60}
                    pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                    aria-invalid={showError("slug") ? "true" : "false"}
                    aria-describedby={
                      showError("slug") ? "store-slug-hint store-slug-error" : "store-slug-hint"
                    }
                    className="min-h-11 min-w-0 flex-1 bg-transparent px-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>
              </SellerField>

              <SellerField
                id="store-desc"
                label="Deskripsi toko"
                counter={`${description.length}/1000`}
                hint="Jelaskan jenis produk digital atau jasa yang Anda jual serta jam respons toko."
              >
                <Textarea
                  id="store-desc"
                  name="store_description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="Contoh: Menyediakan template presentasi, dokumen siap pakai, dan jasa desain grafis."
                  aria-invalid="false"
                  aria-describedby="store-desc-hint"
                  className="min-h-[104px]"
                />
              </SellerField>
            </div>
          </SellerSectionCard>

          <SellerSectionCard
            title="2. Kontak operasional"
            description="Digunakan untuk keperluan koordinasi verifikasi atau dukungan toko."
            headingId="apply-contact-heading"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <SellerField
                id="store-phone"
                label="Nomor WhatsApp"
                hint="Format angka lokal atau internasional, misal 081234567890."
                error={showError("contactPhone")}
              >
                <Input
                  ref={phoneRef}
                  id="store-phone"
                  name="contact_phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  onBlur={() => handleBlur("contactPhone")}
                  placeholder="08xxxxxxxxxx"
                  maxLength={30}
                  aria-invalid={showError("contactPhone") ? "true" : "false"}
                  aria-describedby={
                    showError("contactPhone")
                      ? "store-phone-hint store-phone-error"
                      : "store-phone-hint"
                  }
                  className="seller-field-control min-h-11"
                />
              </SellerField>

              <SellerField
                id="store-email"
                label="Email kontak toko"
                hint="Format: toko@domain.com. Kosongkan jika memakai email akun utama."
                error={showError("contactEmail")}
              >
                <Input
                  ref={emailRef}
                  id="store-email"
                  name="contact_email"
                  type="email"
                  autoComplete="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  onBlur={() => handleBlur("contactEmail")}
                  placeholder="halo@tokoanda.com"
                  maxLength={160}
                  aria-invalid={showError("contactEmail") ? "true" : "false"}
                  aria-describedby={
                    showError("contactEmail")
                      ? "store-email-hint store-email-error"
                      : "store-email-hint"
                  }
                  className="seller-field-control min-h-11"
                />
              </SellerField>
            </div>
          </SellerSectionCard>

          <div className="rounded-[var(--radius-panel)] border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <Clock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                <span>
                  Dengan mengirim formulir ini, pengajuan Anda masuk ke antrean peninjauan admin.
                  Status bisa dipantau langsung di halaman ini.
                </span>
              </p>
              <Button
                type="submit"
                className="min-h-11 w-full shrink-0 px-6 sm:w-auto"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Mengirim pengajuan..." : "Ajukan toko sekarang"}
              </Button>
            </div>
          </div>
        </form>

        {/* Kolom kanan: Pratinjau etalase penuh (desktop) + alur verifikasi nyata. */}
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-24" aria-label="Pratinjau dan alur aktivasi">
          <SellerSectionCard
            title="Pratinjau etalase toko"
            description="Tampilan awal identitas toko yang akan dilihat pembeli."
            headingId="apply-preview-heading"
            className="hidden lg:block"
            bodyClassName="p-0"
          >
            <div className="bg-hero-gradient h-20 w-full" aria-hidden="true" />
            <div className="px-4 pb-4">
              <div className="-mt-7 flex items-end justify-between gap-3">
                <span className="grid size-14 shrink-0 place-items-center rounded-xl border-2 border-card bg-surface-selected font-display text-base font-bold text-accent shadow-[var(--elev-1)]">
                  {initials || <Store className="size-6" aria-hidden="true" />}
                </span>
                <StatusPill value="waiting" kind="raw" label="Calon seller" />
              </div>
              <div className="mt-3 space-y-1">
                <p className="truncate font-display text-base font-bold text-foreground">
                  {previewName}
                </p>
                <p className="truncate font-mono text-xs text-accent">
                  app.ebrystore.my.id/toko/{previewSlug}
                </p>
              </div>
              <p className="mt-2.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                {previewDesc}
              </p>
              <div className="mt-3.5 flex flex-wrap gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                  {contactPhone.trim() || "WhatsApp belum diisi"}
                </span>
                <span className="inline-flex items-center gap-1.5 truncate">
                  <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{contactEmail.trim() || "Email akun utama"}</span>
                </span>
              </div>
            </div>
          </SellerSectionCard>

          <SellerSectionCard title="Alur aktivasi toko" headingId="apply-steps-heading">
            <ol className="space-y-3.5">
              {ACTIVATION_STEPS.map((item, idx) => (
                <li key={item.step} className="flex items-start gap-3">
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-md text-xs font-bold tabular-nums",
                      idx === 0
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface-selected text-accent",
                    )}
                  >
                    {item.step}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <details className="group mt-4 rounded-lg border border-border bg-surface/60 text-xs text-muted-foreground">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                <span>Hal yang perlu diperhatikan seller</span>
                <ChevronDown
                  className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <ul className="space-y-1.5 border-t border-border px-3 py-3 leading-relaxed">
                <li>1. Produk yang dijual harus legal, orisinal, dan siap diunduh atau diakses pembeli.</li>
                <li>2. Transaksi dan komunikasi wajib berlangsung di dalam platform Ebrystore.</li>
                <li>3. Setelah aktif, lengkapi logo, banner, dan rekening pencairan di menu toko.</li>
              </ul>
            </details>
          </SellerSectionCard>
        </aside>
      </div>
    </div>
  );
}

/**
 * Tampilan status khusus saat toko sudah diajukan tetapi belum berstatus `active`
 * (menunggu verifikasi, ditolak, atau ditangguhkan).
 */
export function StoreStatusBanner({
  store,
}: {
  store: {
    name: string;
    slug: string;
    status: string;
    verification_note?: string | null;
    suspended_reason?: string | null;
    created_at?: string | null;
  };
}) {
  const createdLabel = store.created_at
    ? new Date(store.created_at).toLocaleDateString("id-ID", { dateStyle: "medium" })
    : null;

  if (store.status === "pending") {
    return (
      <section
        aria-label="Status pengajuan toko"
        className="mb-5 overflow-hidden rounded-[var(--radius-panel)] border border-warning/45 bg-card shadow-[var(--elev-1)]"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-warning/10 px-4 py-3.5 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-warning/20 text-warning-foreground">
              <Clock className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Pengajuan toko sedang ditinjau admin
              </h2>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Toko <strong className="text-foreground">{store.name}</strong> (/toko/{store.slug})
                {createdLabel ? ` diajukan pada ${createdLabel}` : ""}. Penambahan produk dibuka
                otomatis begitu verifikasi disetujui.
              </p>
            </div>
          </div>
          <StatusPill value="waiting" kind="raw" label="Menunggu verifikasi" />
        </div>
        <ol className="grid gap-3 p-4 sm:grid-cols-3 sm:px-5">
          {[
            { label: "Pengajuan diterima", state: "done" as const },
            { label: "Peninjauan admin", state: "current" as const },
            { label: "Toko aktif & siap jual", state: "upcoming" as const },
          ].map((step) => (
            <li
              key={step.label}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-xs font-medium",
                step.state === "done"
                  ? "border-success/35 bg-success/8 text-foreground"
                  : step.state === "current"
                    ? "border-accent/45 bg-surface-selected text-foreground"
                    : "border-border bg-surface/50 text-muted-foreground",
              )}
            >
              {step.state === "done" ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
              ) : step.state === "current" ? (
                <Clock className="size-4 shrink-0 text-accent" aria-hidden="true" />
              ) : (
                <Store className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span>{step.label}</span>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  if (store.status === "suspended") {
    return (
      <SellerAlertBanner
        tone="danger"
        title="Toko sedang ditangguhkan"
        className="mb-5"
        action={
          <Button asChild variant="outline" size="sm" className="min-h-10">
            <Link to="/bantuan">
              <HelpCircle className="size-4" aria-hidden="true" />
              Hubungi bantuan
            </Link>
          </Button>
        }
      >
        <p>{store.suspended_reason || "Toko Anda sedang ditangguhkan oleh admin."}</p>
        <p className="mt-1">
          Katalog toko disembunyikan sementara. Anda masih dapat memantau riwayat keuangan di menu
          Saldo &amp; Penarikan.
        </p>
      </SellerAlertBanner>
    );
  }

  return (
    <SellerAlertBanner
      tone="warning"
      title="Pengajuan toko belum dapat disetujui"
      className="mb-5"
      action={
        <Button asChild variant="outline" size="sm" className="min-h-10">
          <Link to="/bantuan">
            <TriangleAlert className="size-4" aria-hidden="true" />
            Lihat panduan seller
          </Link>
        </Button>
      }
    >
      <p>
        {store.verification_note ||
          "Pengajuan toko ditolak. Periksa kembali kelengkapan profil atau hubungi tim dukungan."}
      </p>
    </SellerAlertBanner>
  );
}
