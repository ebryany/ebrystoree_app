import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ImagePlus, Loader2, Store } from "lucide-react";

import { AdminError, AdminLoading } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getMyStore, updateMyStore, uploadStoreAsset } from "@/lib/seller.functions";

export const Route = createFileRoute("/_authenticated/seller/pengaturan")({
  head: () => ({
    meta: [
      { title: "Pengaturan Toko — Ebrystore" },
      { name: "description", content: "Perbarui identitas, logo, dan banner toko digital Anda." },
      { property: "og:title", content: "Pengaturan Toko — Ebrystore" },
      { property: "og:description", content: "Kelola identitas toko Anda." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SellerSettings,
});

const MAX_BYTES = 3 * 1024 * 1024;

/**
 * Baca berkas gambar jadi base64 untuk diunggah lewat server function.
 * Batas 3 MB dicek di klien supaya pengguna tahu lebih awal; server tetap
 * memvalidasi ulang ukuran, format, dan dimensi.
 */
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

/** Unggahan satu aset toko (logo atau banner) dengan pratinjau. */
function AssetUploader({
  label,
  hint,
  kind,
  value,
  onChange,
  className,
  aspect,
}: {
  label: string;
  hint: string;
  kind: "logo" | "banner";
  value: string;
  onChange: (url: string) => void;
  className?: string;
  aspect: string;
}) {
  const upload = useServerFn(uploadStoreAsset);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("Ukuran gambar maksimal 3 MB.");
      return;
    }
    setBusy(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await upload({ data: { data: base64, kind } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onChange(result.url);
      toast.success(`${label} berhasil diunggah. Simpan untuk menerapkan.`);
    } catch {
      toast.error("Gambar gagal diunggah. Coba lagi.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className={className}>
        <div
          className={`relative overflow-hidden rounded-xl border border-dashed border-border bg-surface-selected ${aspect}`}
        >
          {value ? (
            <img src={value} alt="" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-xs text-muted-foreground">
              Belum ada gambar
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus className="mr-1.5 size-4" aria-hidden="true" />
            )}
            {busy ? "Mengunggah…" : value ? "Ganti gambar" : "Unggah gambar"}
          </Button>
          {value ? (
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => onChange("")}>
              Hapus
            </Button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          className="sr-only"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function SellerSettings() {
  const queryClient = useQueryClient();
  const fetchStore = useServerFn(getMyStore);
  const saveStore = useServerFn(updateMyStore);

  const { data, isPending, error } = useQuery({
    queryKey: ["my-store"],
    queryFn: () => fetchStore({}),
  });

  const store = data?.store as any;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [bannerPosition, setBannerPosition] = useState(50);
  const [phone, setPhone] = useState("");

  // Isi form setelah data toko termuat.
  useEffect(() => {
    if (!store) return;
    setName(store.name ?? "");
    setDescription(store.description ?? "");
    setLogoUrl(store.logo_url ?? "");
    setBannerUrl(store.banner_url ?? "");
    setBannerPosition(Number(store.banner_position ?? 50));
    setPhone(store.contact_phone ?? "");
  }, [store]);

  const mutation = useMutation({
    mutationFn: async () =>
      saveStore({
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
          logoUrl: logoUrl || undefined,
          bannerUrl: bannerUrl || undefined,
          bannerPosition,
          contactPhone: phone.trim() || undefined,
        },
      }),
    onSuccess: async (res: any) => {
      if (!res?.ok) {
        toast.error(res?.error ?? "Perubahan gagal disimpan.");
        return;
      }
      toast.success("Pengaturan toko tersimpan.");
      await queryClient.invalidateQueries({ queryKey: ["my-store"] });
    },
    onError: () => toast.error("Perubahan gagal disimpan. Coba lagi."),
  });

  if (isPending) return <AdminLoading label="Memuat pengaturan…" />;
  if (error || data?.error) return <AdminError message="Pengaturan tidak dapat dimuat." />;
  if (!store) return <AdminError message="Toko tidak ditemukan." />;

  return (
    <form
      className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim().length < 3) return toast.error("Nama toko minimal 3 karakter.");
        mutation.mutate();
      }}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-selected text-accent">
          <Store className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-foreground">Identitas toko</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Alamat toko tetap: /toko/{store.slug}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <AssetUploader
          label="Logo toko"
          hint="Tampil sebagai ikon toko. Persegi, minimal 200×200 px."
          kind="logo"
          value={logoUrl}
          onChange={setLogoUrl}
          aspect="aspect-square max-w-[9rem]"
        />
        <AssetUploader
          label="Banner toko"
          hint="Tampil di bagian atas halaman toko. Disarankan lebar (mis. 1200×300 px)."
          kind="banner"
          value={bannerUrl}
          onChange={setBannerUrl}
          aspect="aspect-[4/1]"
        />
      </div>

      {bannerUrl ? (
        <div className="space-y-1.5">
          <Label htmlFor="banner-fokus">Fokus banner (vertikal)</Label>
          <input
            id="banner-fokus"
            type="range"
            min={0}
            max={100}
            value={bannerPosition}
            onChange={(e) => setBannerPosition(Number(e.target.value))}
            className="h-11 w-full accent-accent"
          />
          <p className="text-xs text-muted-foreground">
            Atur bagian gambar yang terlihat bila bannernya tinggi. Nilai {bannerPosition}%.
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="toko-nama">Nama toko</Label>
        <Input
          id="toko-nama"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="toko-deskripsi">Deskripsi</Label>
        <Textarea
          id="toko-deskripsi"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Ceritakan produk yang Anda jual"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="toko-kontak">Nomor WhatsApp</Label>
        <Input
          id="toko-kontak"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={30}
          placeholder="08xxxxxxxxxx"
          inputMode="tel"
        />
      </div>

      <Button type="submit" className="min-h-11 w-full sm:w-auto" disabled={mutation.isPending}>
        {mutation.isPending ? "Menyimpan…" : "Simpan perubahan"}
      </Button>
    </form>
  );
}
