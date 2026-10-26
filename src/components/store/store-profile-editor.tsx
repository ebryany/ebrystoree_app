import { useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, ImagePlus, Loader2, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { updateMyStore, uploadStoreAsset } from "@/lib/seller.functions";
import { cn } from "@/lib/utils";

/**
 * Editor kontekstual tampilan toko: dibuka langsung dari tombol "Edit toko"
 * di storefront, tanpa perpindahan ke dashboard.
 *
 * Tiga state dipisah tegas:
 * - Published: data toko dari loader (sumber kebenaran publik).
 * - Draft: salinan yang diedit di form; tidak pernah menyentuh cache publik.
 * - Preview: representasi draft yang dikirim ke header storefront via callback.
 *
 * Simpan memakai `updateMyStore` — mutation yang sama dengan dashboard seller —
 * jadi aturan validasi, ownership (`owner_id = userId`), dan guard URL gambar
 * tidak diduplikasi. Upload memakai `uploadStoreAsset` (rate-limited, bucket
 * toko sendiri, toko aktif diperlukan).
 */

const MAX_BYTES = 3 * 1024 * 1024;

export type StoreEditorDraft = {
  name: string;
  description: string;
  logoUrl: string;
  bannerUrl: string;
  bannerPosition: number;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Berkas tidak dapat dibaca."));
    reader.readAsDataURL(file);
  });
}

function AssetField({
  label,
  hint,
  kind,
  value,
  busy,
  onPick,
  onClear,
  aspect,
}: {
  label: string;
  hint: string;
  kind: "logo" | "banner";
  value: string;
  busy: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
  aspect: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className={cn("relative overflow-hidden rounded-xl border border-dashed border-border bg-surface-selected", aspect)}>
        {value ? (
          <img src={value} alt="" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center text-xs text-muted-foreground">
            Belum ada gambar
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="mr-1.5 size-4" aria-hidden="true" />}
          {busy ? "Mengunggah…" : value ? "Ganti" : "Unggah"}
        </Button>
        {value ? (
          <Button type="button" variant="ghost" className="min-h-11" onClick={onClear}>
            Hapus
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <span className="sr-only">{kind === "logo" ? "Logo toko" : "Banner toko"}</span>
    </div>
  );
}

export function StoreProfileEditor({
  open,
  onOpenChange,
  store,
  draft,
  onDraftChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: {
    slug: string;
    name: string;
    description: string | null;
    logo_url: string | null;
    banner_url: string | null;
    banner_position: number | null;
  };
  draft: StoreEditorDraft;
  onDraftChange: (next: SetStateAction<StoreEditorDraft | null>) => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(updateMyStore);
  const upload = useServerFn(uploadStoreAsset);
  const [uploading, setUploading] = useState<"logo" | "banner" | null>(null);
  // Pratinjau instan: object URL dari file lokal, ditampilkan SEBELUM unggahan
  // selesai. Dibersihkan saat diganti/dibongkar agar memori tidak bocor.
  const [localPreview, setLocalPreview] = useState<{ logo?: string; banner?: string }>({});
  const localPreviewRef = useRef(localPreview);
  localPreviewRef.current = localPreview;
  const [closingAttempt, setClosingAttempt] = useState(false);
  // Penanda komponen masih terpasang. Upload bisa selesai setelah editor
  // ditutup; hasilnya tidak boleh menghidupkan kembali draft (state zombie).
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);
  // Token per upload: hasil upload lama yang datang terlambat tidak boleh
  // menimpa pilihan gambar yang lebih baru.
  const uploadToken = useRef<{ logo: number; banner: number }>({ logo: 0, banner: 0 });

  /** Update draft secara fungsional; null (editor tertutup) diabaikan. */
  const patchDraft = (patch: Partial<StoreEditorDraft>) => {
    onDraftChange((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const dirty = useMemo(() => {
    return (
      draft.name.trim() !== store.name ||
      (draft.description.trim() || "") !== (store.description ?? "") ||
      draft.logoUrl !== (store.logo_url ?? "") ||
      draft.bannerUrl !== (store.banner_url ?? "")
    );
  }, [draft, store]);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          logoUrl: draft.logoUrl || undefined,
          bannerUrl: draft.bannerUrl || undefined,
          bannerPosition: draft.bannerPosition,
        },
      }),
    onSuccess: async (res: any) => {
      if (!res?.ok) {
        toast.error(res?.error ?? "Perubahan gagal disimpan.");
        return;
      }
      toast.success("Tampilan toko diperbarui.");
      for (const url of Object.values(localPreviewRef.current)) {
        if (url) URL.revokeObjectURL(url);
      }
      setLocalPreview({});
      // Storefront publik memakai loader route; invalidasi menyegarkan data
      // published setelah simpan supaya preview = publik.
      await queryClient.invalidateQueries({ queryKey: ["product-detail"] });
      // onSaved menunggu refetch loader storefront. Kalau refetch gagal,
      // editor sudah tertutup dengan benar (data server sukses) tetapi draft
      // di parent dipertahankan agar header tidak menampilkan data lama.
      await onSaved();
      onOpenChange(false);
    },
    onError: () => toast.error("Perubahan gagal disimpan. Draft kamu masih ada."),
  });

  async function pickAsset(kind: "logo" | "banner", file: File) {
    if (file.size > MAX_BYTES) {
      toast.error("Ukuran gambar maksimal 3 MB.");
      return;
    }
    const urlField = kind === "logo" ? "logoUrl" : "bannerUrl";
    // Token unik per pemilihan: hasil unggahan sebelumnya yang selesai
    // belakangan akan diabaikan, tidak menimpa pilihan terbaru.
    const token = ++uploadToken.current[kind];

    // Pratinjau instan dari file lokal. URL sebelumnya di-revoke DI LUAR
    // updater (updater harus murni, tanpa efek samping).
    const prevLocal = localPreviewRef.current[kind];
    if (prevLocal) URL.revokeObjectURL(prevLocal);
    const objectUrl = URL.createObjectURL(file);
    setLocalPreview((p) => ({ ...p, [kind]: objectUrl }));
    patchDraft({ [urlField]: objectUrl });

    setUploading(kind);
    try {
      const base64 = await fileToBase64(file);
      const result = await upload({ data: { data: base64, kind } });

      // Editor sudah ditutup / pilihan sudah diganti saat menunggu: abaikan
      // hasil ini sepenuhnya dan bersihkan object URL milik percobaan ini.
      if (!mountedRef.current || uploadToken.current[kind] !== token) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      if (!result.ok) {
        toast.error(result.error);
        URL.revokeObjectURL(objectUrl);
        setLocalPreview((p) => {
          const next = { ...p };
          delete next[kind];
          return next;
        });
        // Kembalikan ke aset published, bukan ke object URL yang sudah mati.
        patchDraft({ [urlField]: kind === "logo" ? (store.logo_url ?? "") : (store.banner_url ?? "") });
        return;
      }

      // Sukses: ganti object URL dengan URL server permanen.
      URL.revokeObjectURL(objectUrl);
      setLocalPreview((p) => {
        const next = { ...p };
        delete next[kind];
        return next;
      });
      patchDraft({ [urlField]: result.url });
      toast.success(`${kind === "logo" ? "Logo" : "Banner"} terunggah. Klik Simpan untuk menerapkan.`);
    } catch {
      if (!mountedRef.current || uploadToken.current[kind] !== token) return;
      toast.error("Gambar gagal diunggah. Coba lagi.");
      URL.revokeObjectURL(objectUrl);
      setLocalPreview((p) => {
        const next = { ...p };
        delete next[kind];
        return next;
      });
      patchDraft({ [urlField]: kind === "logo" ? (store.logo_url ?? "") : (store.banner_url ?? "") });
    } finally {
      if (mountedRef.current && uploadToken.current[kind] === token) {
        setUploading(null);
      }
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && dirty && !closingAttempt) {
          setClosingAttempt(true);
          return;
        }
        setClosingAttempt(false);
        // Batal/tutup: batalkan semua unggahan yang masih berjalan dan buang
        // object URL pratinjau. Hasil upload yang datang terlambat akan
        // diabaikan oleh pengecekan token di pickAsset.
        if (!next) {
          uploadToken.current.logo++;
          uploadToken.current.banner++;
          for (const url of Object.values(localPreviewRef.current)) {
            if (url) URL.revokeObjectURL(url);
          }
          setLocalPreview({});
        }
        onOpenChange(next);
      }}
    >
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Store className="size-4 text-accent" aria-hidden="true" />
            Edit tampilan toko
          </SheetTitle>
          <SheetDescription>
            Perbarui informasi yang dilihat pengunjung toko Anda.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <AssetField
              label="Logo toko"
              hint="Persegi, minimal 200×200 px, maks 3 MB."
              kind="logo"
              value={draft.logoUrl}
              busy={uploading === "logo"}
              onPick={(f) => void pickAsset("logo", f)}
              onClear={() => onDraftChange({ ...draft, logoUrl: "" })}
              aspect="aspect-square max-w-[8rem]"
            />
            <AssetField
              label="Banner toko"
              hint="Lebar, maks 3 MB. Posisi fokus diatur di dashboard."
              kind="banner"
              value={draft.bannerUrl}
              busy={uploading === "banner"}
              onPick={(f) => void pickAsset("banner", f)}
              onClear={() => onDraftChange({ ...draft, bannerUrl: "" })}
              aspect="aspect-[16/9]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="store-name">Nama toko</Label>
            <Input
              id="store-name"
              value={draft.name}
              maxLength={80}
              onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
              aria-describedby="store-name-hint"
            />
            <p id="store-name-hint" className="text-xs text-muted-foreground">
              Minimal 3 karakter. Alamat /toko/{store.slug} tidak berubah.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="store-desc">Deskripsi toko</Label>
            <Textarea
              id="store-desc"
              rows={4}
              maxLength={1000}
              value={draft.description}
              onChange={(e) => onDraftChange({ ...draft, description: e.target.value })}
              placeholder="Ceritakan singkat tentang toko Anda"
            />
          </div>

          {/* Preview lokal: murni di sesi editor ini. Draft tidak pernah masuk
              cache TanStack Query publik — callback hanya mengubah state React
              halaman storefront milik seller sendiri. */}
          <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted-foreground">
            Perubahan tampil sebagai pratinjau di halaman toko Anda, belum publik
            sampai disimpan.
          </p>
        </div>

        <SheetFooter className="flex-row items-center justify-between gap-2 border-t border-border px-5 py-3">
          <a
            href="/seller/pengaturan"
            className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Pengaturan lanjutan
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => {
                if (dirty) setClosingAttempt(true);
                else onOpenChange(false);
              }}
            >
              Batal
            </Button>
            <Button
              type="button"
              disabled={
                mutation.isPending ||
                uploading !== null ||
                // Jangan pernah mengirim blob: ke server: URL itu hanya hidup
                // di tab ini dan akan ditolak/dianggap rusak oleh validasi.
                draft.logoUrl.startsWith("blob:") ||
                draft.bannerUrl.startsWith("blob:") ||
                draft.name.trim().length < 3
              }
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {mutation.isPending
                ? "Menyimpan…"
                : uploading
                  ? "Menunggu unggahan…"
                  : "Simpan perubahan"}
            </Button>
          </div>
        </SheetFooter>

        {/* Konfirmasi keluar dengan draft belum disimpan. */}
        {closingAttempt ? (
          <div
            role="alertdialog"
            aria-label="Perubahan belum disimpan"
            className="absolute inset-0 z-10 grid place-items-center bg-background/80 px-6 p-6 backdrop-blur-sm"
          >
            <div className="w-full max-w-xs rounded-xl border border-border bg-card p-4 text-center shadow-card">
              <p className="text-sm font-semibold">Perubahan belum disimpan</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Yakin ingin keluar? Perubahan pada pratinjau akan dibuang.
              </p>
              <div className="mt-3 flex justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setClosingAttempt(false);
                    onOpenChange(false);
                  }}
                >
                  Buang perubahan
                  <span className="sr-only"> dan keluar editor</span>
                </Button>
                <Button type="button" onClick={() => setClosingAttempt(false)}>
                  Lanjut mengedit
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
