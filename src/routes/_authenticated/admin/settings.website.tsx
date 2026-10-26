import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Check, RotateCcw, Save, Search } from "lucide-react";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  ForbiddenState,
  useCan,
} from "@/components/admin/admin-ui";
import { DetailCard, formatDateTime } from "@/components/admin/tx-ui";
import { ActionResultDialog, type ActionResult } from "@/components/admin/action-result-dialog";
import { ImageUploader } from "@/components/admin/image-uploader";
import { BannerSlidesEditor } from "@/components/admin/banner-slides-editor";
import { EmailHealthPanel } from "@/components/admin/email-health-panel";
import { NavEditor } from "@/components/admin/nav-editor";
import { SettingsPreview } from "@/components/admin/settings-preview";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SETTING_SECTIONS,
  contrastWithWhite,
  validateField,
  type NavItem,
  type HomeBannerSlide,
  type SettingField,
} from "@/lib/website-settings";
import {
  getWebsiteSettings,
  resetWebsiteSection,
  saveWebsiteSection,
  uploadBannerImage,
} from "@/lib/website-settings.functions";

/** Pengelompokan bagian menurut risiko: konten, transaksi, sistem. */
const SECTION_GROUPS: { label: string; sections: { id: string; risky?: boolean }[] }[] = [
  {
    label: "Konten",
    sections: [
      { id: "umum" },
      { id: "branding" },
      { id: "kontak" },
      { id: "navigasi" },
      { id: "seo" },
      { id: "storefront" },
    ],
  },
  {
    label: "Transaksi",
    sections: [
      { id: "akademik" },
      { id: "transaksi", risky: true },
      { id: "marketplace", risky: true },
    ],
  },
  {
    label: "Sistem",
    sections: [
      { id: "notifikasi" },
      { id: "fitur", risky: true },
      { id: "maintenance", risky: true },
    ],
  },
];

export const Route = createFileRoute("/_authenticated/admin/settings/website")({
  head: () => ({
    meta: [
      { title: "Pengaturan Website — Admin Ebrystore" },
      {
        name: "description",
        content:
          "Kelola identitas, branding, navigasi, SEO, storefront, fitur, dan maintenance Ebrystore dari satu halaman.",
      },
      { property: "og:title", content: "Pengaturan Website — Admin Ebrystore" },
      {
        property: "og:description",
        content: "Konfigurasi website Ebrystore berbasis data nyata dan tercatat pada audit log.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WebsiteSettingsPage,
});

function WebsiteSettingsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const canView = useCan("settings.website.view");
  const canReset = useCan("settings.dangerous.update");
  const load = useServerFn(getWebsiteSettings);
  const save = useServerFn(saveWebsiteSection);
  const reset = useServerFn(resetWebsiteSection);
  const uploadBannerFile = useServerFn(uploadBannerImage);

  const [activeId, setActiveId] = useState(SETTING_SECTIONS[0].id);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [bannerBusyKeys, setBannerBusyKeys] = useState<string[]>([]);
  const [impactOpen, setImpactOpen] = useState(false);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmFieldOpen, setConfirmFieldOpen] = useState(false);
  const reduced = useReducedMotion();

  const { data, isPending, error } = useQuery({
    queryKey: ["website-settings"],
    queryFn: () => load({}),
  });

  const serverValues: Record<string, any> = (data as any)?.values ?? {};

  useEffect(() => {
    if (!data || (data as any).forbidden || (data as any).error) return;
    setDraft({ ...serverValues });
  }, [data]);

  const section = useMemo(() => SETTING_SECTIONS.find((s) => s.id === activeId)!, [activeId]);
  const canEdit = useCan(section.permission);

  // Field dikelompokkan berdasarkan metadata group; urutan grup mengikuti urutan
  // kemunculan pertama di registry agar tetap deterministik.
  const groupedFields = useMemo(() => {
    const groups: { name: string; fields: SettingField[] }[] = [];
    for (const field of section.fields) {
      const name = field.group ?? "";
      const existing = groups.find((group) => group.name === name);
      if (existing) existing.fields.push(field);
      else groups.push({ name, fields: [field] });
    }
    return groups;
  }, [section]);

  // Field yang nilainya berbeda dari default registry (bukan sekadar dari server).
  const changedKeys = useMemo(() => {
    const stored = new Set<string>((data as any)?.storedKeys ?? []);
    return stored;
  }, [data]);

  // Pencarian lintas bagian: label, key, help, dan nama bagian.
  const searchResults = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    const results: { section: (typeof SETTING_SECTIONS)[number]; field: SettingField }[] = [];
    for (const owner of SETTING_SECTIONS) {
      for (const field of owner.fields) {
        const haystack = [field.label, field.key, field.help ?? "", field.group ?? "", owner.label]
          .join(" ")
          .toLowerCase();
        if (haystack.includes(term)) results.push({ section: owner, field });
      }
    }
    return results.slice(0, 40);
  }, [search]);

  const dirtyKeys = section.fields
    .filter((f) => !f.readOnly)
    .filter((f) => JSON.stringify(draft[f.key]) !== JSON.stringify(serverValues[f.key]))
    .map((f) => f.key);

  const fieldErrors = Object.fromEntries(
    section.fields
      .map((f) => {
        if (f.readOnly) return null;
        const result = validateField(f, draft[f.key]);
        return result.ok ? null : ([f.key, result.error] as const);
      })
      .filter(Boolean) as [string, string][],
  );

  const saveMutation = useMutation({
    mutationFn: (payload: { section: string; values: Record<string, unknown> }) =>
      save({ data: payload }),
    onSuccess: (res: any) => {
      if (res?.forbidden) {
        setActionResult({
          status: "error",
          title: "Izin tidak mencukupi",
          description: `Perubahan ini memerlukan izin ${res.permission}.`,
        });
        setResultOpen(true);
        return;
      }
      if (!res?.ok) {
        setActionResult({
          status: "error",
          title: "Pengaturan gagal disimpan",
          description: res?.error ?? "Terjadi kesalahan saat menyimpan.",
          retry: { label: "Coba lagi", onClick: () => commitSave() },
        });
        setResultOpen(true);
        return;
      }
      setActionResult({
        status: "success",
        title: res.changed ? `${res.changed} pengaturan disimpan` : "Tidak ada perubahan",
        description: res.changed
          ? `Bagian ${section.label} sudah memakai nilai baru.`
          : "Nilai yang dikirim sama dengan yang tersimpan.",
        actions: [
          { label: "Lihat audit", onClick: () => void router.navigate({ to: "/admin/audit" }) },
        ],
      });
      setResultOpen(true);
      void qc.invalidateQueries({ queryKey: ["website-settings"] });
      void qc.invalidateQueries({ queryKey: ["public-website-settings"] });
      void router.invalidate();
    },
    onError: (e: any) => {
      setActionResult({
        status: "error",
        title: "Pengaturan gagal disimpan",
        description: e?.message ?? "Koneksi ke server terputus.",
        retry: { label: "Coba lagi", onClick: () => commitSave() },
      });
      setResultOpen(true);
    },
  });

  const resetMutation = useMutation({
    mutationFn: (payload: { section: string }) => reset({ data: payload }),
    onSuccess: (res: any) => {
      if (res?.forbidden) {
        setActionResult({
          status: "error",
          title: "Izin tidak mencukupi",
          description: `Reset memerlukan izin ${res.permission}.`,
        });
        setResultOpen(true);
        return;
      }
      if (!res?.ok) {
        setActionResult({
          status: "error",
          title: "Reset gagal dijalankan",
          description: res?.error ?? "Terjadi kesalahan saat reset.",
        });
        setResultOpen(true);
        return;
      }
      setActionResult({
        status: "success",
        title: "Pengaturan dikembalikan ke default",
        description: `Bagian ${section.label} kembali memakai nilai default registry.`,
      });
      setResultOpen(true);
      void qc.invalidateQueries({ queryKey: ["website-settings"] });
      void qc.invalidateQueries({ queryKey: ["public-website-settings"] });
      void router.invalidate();
    },
    onError: (e: any) => {
      setActionResult({
        status: "error",
        title: "Reset gagal dijalankan",
        description: e?.message ?? "Koneksi ke server terputus.",
      });
      setResultOpen(true);
    },
  });

  // Pengaman: perubahan belum disimpan tidak boleh hilang tanpa peringatan.
  useEffect(() => {
    if (dirtyKeys.length === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirtyKeys.length]);

  // Pintasan simpan yang lazim di layar pengaturan.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (canEdit && dirtyKeys.length > 0 && !saveMutation.isPending) onSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!canView) return <ForbiddenState permission="settings.website.view" />;
  if (isPending) return <AdminLoading />;
  if ((data as any)?.forbidden) return <ForbiddenState permission={(data as any).permission} />;
  if (error || (data as any)?.error)
    return <AdminError message={(data as any)?.error ?? "Pengaturan tidak dapat dimuat."} />;

  function setValue(key: string, value: unknown) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  /** Bagian berisiko: keputusan uang, fitur, atau marketplace. */
  const RISKY_SECTIONS = new Set(["transaksi", "fitur", "maintenance", "marketplace"]);

  function commitSave() {
    saveMutation.mutate({
      section: section.id,
      values: Object.fromEntries(dirtyKeys.map((k) => [k, draft[k]])),
    });
  }

  function onSave() {
    const invalid = Object.entries(fieldErrors)[0];
    if (invalid) return toast.error(invalid[1]);
    if (bannerBusyKeys.length) return toast.error("Tunggu unggahan gambar selesai.");
    const confirmField = section.fields.find((f) => f.confirm && dirtyKeys.includes(f.key));
    if (confirmField) {
      setConfirmFieldOpen(true);
      return;
    }
    // Ringkasan dampak untuk bagian berisiko, menggantikan simpan tanpa konteks.
    if (RISKY_SECTIONS.has(section.id) && dirtyKeys.length > 0) {
      setImpactOpen(true);
      return;
    }
    commitSave();
  }

  function onReset() {
    setConfirmResetOpen(true);
  }

  const lastChange = (data as any)?.lastChange;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Pengaturan Website"
        crumb="Pengaturan website"
        description="Semua nilai tersimpan di database, divalidasi di server, dan tercatat pada audit log."
      />

      {lastChange ? (
        <p className="text-xs text-muted-foreground">
          Perubahan terakhir {formatDateTime(lastChange.created_at)}
          {(data as any)?.actorName ? ` oleh ${(data as any).actorName}` : ""} ·{" "}
          {lastChange.reason ?? lastChange.action}
        </p>
      ) : null}

      {/* Pencarian field lintas bagian: hasil turun sebagai dropdown, tidak menggeser konten. */}
      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari pengaturan, mis. escrow, banner, refund"
          aria-label="Cari pengaturan"
          aria-expanded={Boolean(search.trim())}
          className="min-h-11 pl-9"
          maxLength={80}
        />
        <AnimatePresence>
          {search.trim() ? (
            <motion.div
              initial={reduced ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="absolute left-0 right-0 top-full z-40 mt-1 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg"
            >
              {searchResults.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">
                  Tidak ada pengaturan yang cocok.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {searchResults.map(({ section: owner, field }) => (
                    <li key={field.key}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveId(owner.id);
                          setSearch("");
                        }}
                        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{field.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {owner.label}
                            {field.group ? ` · ${field.group}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {field.isPublic ? "Tampil di situs" : "Internal"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_320px]">
        <nav aria-label="Bagian pengaturan" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          {/* Mobile: select agar sebelas bagian tidak menjadi baris geser panjang. */}
          <div className="lg:hidden">
            <Label htmlFor="pengaturan-bagian" className="sr-only">
              Pilih bagian pengaturan
            </Label>
            <Select
              value={activeId}
              onValueChange={(value) => {
                setActiveId(value);
                setSearch("");
              }}
            >
              <SelectTrigger id="pengaturan-bagian" className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SETTING_SECTIONS.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="hidden lg:flex lg:flex-col lg:gap-4">
            {SECTION_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {group.sections.map((entry) => {
                    const target = SETTING_SECTIONS.find((s) => s.id === entry.id);
                    if (!target) return null;
                    const sectionDirty = target.fields.some(
                      (f) =>
                        !f.readOnly &&
                        JSON.stringify(draft[f.key]) !== JSON.stringify(serverValues[f.key]),
                    );
                    const active = target.id === activeId;
                    return (
                      <button
                        key={target.id}
                        type="button"
                        onClick={() => {
                          setActiveId(target.id);
                          setSearch("");
                        }}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-10 w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${
                          active
                            ? "bg-primary/10 font-semibold text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{target.label}</span>
                        {entry.risky ? (
                          <span
                            className="shrink-0 text-[10px] font-semibold text-warning-foreground"
                            title="Menyentuh uang atau perilaku sistem"
                          >
                            !
                          </span>
                        ) : null}
                        {sectionDirty ? (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-warning"
                            aria-label="Ada perubahan belum disimpan"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="min-w-0 space-y-6">
          <DetailCard
            title={section.label}
            description={section.description}
            actions={
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {section.fields.length} pengaturan
                </span>
                {dirtyKeys.length > 0 ? (
                  <span className="rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-warning-foreground">
                    {dirtyKeys.length} diubah
                  </span>
                ) : null}
                {RISKY_SECTIONS.has(section.id) ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/5 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                    <AlertTriangle className="size-3" aria-hidden="true" />
                    Menyentuh uang/perilaku
                  </span>
                ) : null}
              </div>
            }
          >
            {!canEdit ? (
              <p className="mb-4 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                Anda hanya dapat melihat bagian ini. Perubahan memerlukan izin {section.permission}.
              </p>
            ) : null}

            {/* Panel khusus: kesehatan email + tombol uji. Hanya di bagian
                Notifikasi, karena di situlah saklar email diatur. */}
            {section.id === "notifikasi" ? (
              <div className="mb-6">
                <EmailHealthPanel />
              </div>
            ) : null}

            {/* Field dikelompokkan supaya bagian besar tidak jadi satu daftar panjang. */}
            <div className="space-y-6">
              {groupedFields.map((group) => (
                <section key={group.name} aria-label={group.name}>
                  {group.name ? (
                    <h3 className="mb-3 border-b border-border pb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {group.name}
                    </h3>
                  ) : null}
                  <div className="space-y-5">
                    {group.fields.map((field) => (
                      <FieldRow
                        key={field.key}
                        field={field}
                        value={draft[field.key]}
                        error={fieldErrors[field.key]}
                        disabled={!canEdit || field.readOnly || saveMutation.isPending}
                        changedFromDefault={changedKeys.has(field.key)}
                        onChange={(v) => setValue(field.key, v)}
                        uploadBannerFile={uploadBannerFile}
                        onBannerBusy={(busy) =>
                          setBannerBusyKeys((prev) =>
                            busy
                              ? prev.includes(field.key)
                                ? prev
                                : [...prev, field.key]
                              : prev.filter((k) => k !== field.key),
                          )
                        }
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button
                onClick={onSave}
                disabled={
                  !canEdit ||
                  !dirtyKeys.length ||
                  saveMutation.isPending ||
                  bannerBusyKeys.length > 0
                }
              >
                <Save className="mr-1 size-4" />
                {saveMutation.isPending ? "Menyimpan…" : "Simpan perubahan"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setDraft({ ...serverValues })}
                disabled={!dirtyKeys.length || saveMutation.isPending}
              >
                Batalkan perubahan
              </Button>
              {canReset ? (
                <Button variant="ghost" onClick={onReset} disabled={resetMutation.isPending}>
                  <RotateCcw className="mr-1 size-4" /> Reset ke default
                </Button>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {dirtyKeys.length
                  ? `${dirtyKeys.length} perubahan belum disimpan`
                  : "Tidak ada perubahan"}
              </span>
            </div>
          </DetailCard>
        </div>

        {/* Preview berdampingan pada layar lebar; menempel agar dampak terlihat saat mengubah. */}
        <aside className="hidden min-w-0 xl:block">
          <div className="sticky top-20">
            <SettingsPreview values={draft} />
          </div>
        </aside>
      </div>

      {/* Preview tetap tersedia di bawah pada layar lebih kecil. */}
      <div className="xl:hidden">
        <SettingsPreview values={draft} />
      </div>

      {/* Bilah simpan mengambang: simpan selalu terjangkau di bagian panjang. */}
      <AnimatePresence>
        {canEdit && dirtyKeys.length > 0 ? (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: 16 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="sticky bottom-0 z-30 -mx-4 mt-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium" role="status" aria-live="polite">
                {dirtyKeys.length} perubahan belum disimpan
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  · {section.label}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={saveMutation.isPending}
                  onClick={() => setDraft({ ...serverValues })}
                >
                  Batalkan
                </Button>
                <Button
                  className="min-h-11"
                  disabled={saveMutation.isPending || bannerBusyKeys.length > 0}
                  onClick={onSave}
                >
                  <Save className="mr-1 size-4" aria-hidden="true" />
                  {saveMutation.isPending ? "Menyimpan…" : "Simpan perubahan"}
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Konfirmasi field berisiko: dialog, bukan konfirmasi bawaan browser. */}
      <Dialog open={confirmFieldOpen} onOpenChange={setConfirmFieldOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning-foreground" aria-hidden="true" />
              Konfirmasi perubahan berisiko
            </DialogTitle>
            <DialogDescription>
              {section.fields.find((f) => f.confirm && dirtyKeys.includes(f.key))?.confirm ??
                "Perubahan ini memengaruhi perilaku sistem."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => setConfirmFieldOpen(false)}
            >
              Batal
            </Button>
            <Button
              className="min-h-11"
              onClick={() => {
                setConfirmFieldOpen(false);
                if (RISKY_SECTIONS.has(section.id) && dirtyKeys.length > 0) {
                  setImpactOpen(true);
                  return;
                }
                commitSave();
              }}
            >
              Lanjutkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Konfirmasi reset: dialog yang dapat dibaca, bukan konfirmasi bawaan browser. */}
      <Dialog open={confirmResetOpen} onOpenChange={setConfirmResetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning-foreground" aria-hidden="true" />
              Kembalikan ke nilai default?
            </DialogTitle>
            <DialogDescription>
              Seluruh {section.fields.length} pengaturan pada bagian {section.label} akan kembali ke
              nilai default registry. Tindakan ini tercatat pada audit log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={resetMutation.isPending}
              onClick={() => setConfirmResetOpen(false)}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              className="min-h-11"
              disabled={resetMutation.isPending}
              onClick={() => {
                setConfirmResetOpen(false);
                resetMutation.mutate({ section: section.id });
              }}
            >
              {resetMutation.isPending ? "Mereset…" : "Ya, reset ke default"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog hasil aksi: satu tempat untuk status proses, sukses, gagal, sebagian. */}
      <ActionResultDialog open={resultOpen} onOpenChange={setResultOpen} result={actionResult} />

      {/* Dialog dampak: muncul di depan mata, bukan mendorong konten. */}
      <Dialog open={impactOpen} onOpenChange={setImpactOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning-foreground" aria-hidden="true" />
              Periksa dampak sebelum menyimpan
            </DialogTitle>
            <DialogDescription>
              Bagian {section.label} mengubah perilaku sistem. Perubahan berikut akan diterapkan.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {dirtyKeys.map((key) => {
              const field = section.fields.find((f) => f.key === key);
              return (
                <li key={key} className="rounded-lg border border-border px-3 py-2">
                  <p className="text-sm font-medium">{field?.label ?? key}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="line-through">
                      {String(serverValues[key] ?? field?.default ?? "kosong")}
                    </span>
                    <span aria-hidden="true">→</span>
                    <span className="font-semibold text-foreground">{String(draft[key])}</span>
                  </p>
                </li>
              );
            })}
          </ul>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={saveMutation.isPending}
              onClick={() => setImpactOpen(false)}
            >
              Batal
            </Button>
            <Button
              className="min-h-11"
              disabled={saveMutation.isPending}
              onClick={() => {
                commitSave();
                setImpactOpen(false);
              }}
            >
              {saveMutation.isPending ? "Menyimpan…" : "Ya, terapkan perubahan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldRow({
  field,
  value,
  error,
  disabled,
  changedFromDefault,
  onChange,
  uploadBannerFile,
  onBannerBusy,
}: {
  field: SettingField;
  value: any;
  error?: string;
  disabled: boolean;
  changedFromDefault?: boolean;
  onChange: (value: unknown) => void;
  uploadBannerFile: (input: {
    data: { name: string; data: string };
  }) => Promise<{ ok?: boolean; url?: string; error?: string | null; forbidden?: boolean }>;
  onBannerBusy: (busy: boolean) => void;
}) {
  async function uploadBanner(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Gagal membaca file."));
      reader.readAsDataURL(file);
    });
    const res = await uploadBannerFile({
      data: { name: file.name, data: dataUrl.slice(dataUrl.indexOf(",") + 1) },
    });
    if (res?.forbidden) throw new Error("Izin settings.branding.update dibutuhkan.");
    if (!res?.ok || !res.url) throw new Error(res?.error ?? "Gagal mengunggah gambar.");
    return res.url;
  }
  const id = `field-${field.key}`;
  const describedBy = error ? `${id}-error` : field.help ? `${id}-help` : undefined;

  const label = (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        {/* Sifat publik menentukan apakah nilai terlihat pengunjung; admin perlu tahu. */}
        <span
          className={
            field.isPublic
              ? "rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent"
              : "rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          }
        >
          {field.isPublic ? "Tampil di situs" : "Internal"}
        </span>
        {field.enforcedInDatabase ? (
          <span className="rounded-full border border-warning/50 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning-foreground">
            Ditegakkan database
          </span>
        ) : null}
        {changedFromDefault ? (
          <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Diubah dari default
          </span>
        ) : null}
      </div>
      {field.help ? (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {field.help}
        </p>
      ) : null}
    </div>
  );

  if (field.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
        {label}
        <Switch
          id={id}
          className="shrink-0"
          checked={Boolean(value)}
          disabled={disabled}
          onCheckedChange={onChange}
        />
      </div>
    );
  }

  if (field.type === "banners") {
    return (
      <div className="space-y-3">
        {label}
        <BannerSlidesEditor
          slides={Array.isArray(value) ? (value as HomeBannerSlide[]) : []}
          disabled={disabled}
          onChange={onChange}
          uploadRemote={uploadBanner}
          onBusyChange={onBannerBusy}
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (field.type === "nav") {
    return (
      <div className="space-y-3">
        {label}
        <NavEditor
          items={(value ?? []) as NavItem[]}
          disabled={disabled}
          onChange={(next) => onChange(next)}
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {label}
      {field.type === "textarea" ? (
        <Textarea
          id={id}
          rows={3}
          value={String(value ?? "")}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "select" ? (
        <Select value={String(value ?? "")} disabled={disabled} onValueChange={onChange}>
          <SelectTrigger id={id} aria-describedby={describedBy}>
            <SelectValue placeholder="Pilih" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === "list" ? (
        <Input
          id={id}
          value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          placeholder="pisahkan dengan koma"
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      ) : field.type === "color" ? (
        <div className="flex flex-wrap items-center gap-3">
          <input
            id={id}
            type="color"
            className="h-9 w-14 shrink-0 cursor-pointer rounded border border-border bg-transparent"
            value={/^#[0-9a-fA-F]{6}$/.test(String(value ?? "")) ? String(value) : "#000000"}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
          <Input
            className="w-[140px] max-w-full font-mono"
            value={String(value ?? "")}
            disabled={disabled}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">
            Kontras teks putih {contrastWithWhite(String(value ?? "#000000")).toFixed(2)}:1
          </span>
        </div>
      ) : field.type === "url" &&
        (field.key.includes("logo") || field.key.startsWith("home_banner_")) ? (
        <ImageUploader
          value={String(value ?? "")}
          onChange={(url) => onChange(url)}
          folder={field.key.startsWith("home_banner_") ? "branding/home" : "branding"}
          label={field.label}
          hint="JPG, PNG, WEBP, atau AVIF maksimal 3 MB."
          disabled={disabled}
          uploadRemote={field.key.startsWith("home_banner_") ? uploadBanner : undefined}
          onBusyChange={field.key.startsWith("home_banner_") ? onBannerBusy : undefined}
        />
      ) : (
        <Input
          id={id}
          value={String(value ?? "")}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
