import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, ImagePlus, Loader2, Store } from "lucide-react";

import { AdminError, AdminLoading } from "@/components/admin/admin-ui";
import {
  SellerField,
  SellerPageHeader,
  SellerSectionCard,
} from "@/components/seller/seller-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getMyStore, updateMyStore, uploadStoreAsset } from "@/lib/seller.functions";

export const Route = createFileRoute("/_authenticated/seller/pengaturan")({
  head: () => ({
    meta: [
      { title: "Pengaturan Toko | Ebrystore" },
      { name: "description", content: "Perbarui identitas, logo, dan banner toko digital Anda." },
      { property: "og:title", content: "Pengaturan Toko | Ebrystore" },
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
      toast.success(`${label} berhasil diunggah. Klik Simpan perubahan untuk menerapkan.`);
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
      <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
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
        <div className="mt-2.5 flex flex-wrap gap-2">
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
            {busy ? "Mengunggah..." : value ? "Ganti gambar" : "Unggah gambar"}
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
    </div>
  );
}

function SellerSettings() {
  const queryClient = useQueryClient();
  const fetchStore = useServerFn(getMyStore);
  const saveStore = useServerFn(updateMyStore);
  const nameRef = useRef<HTMLInputElement>(null);

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
  const [nameError, setNameError] = useState<string | undefined>();

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

  if (isPending) return <AdminLoading label="Memuat pengaturan..." />;
  if (error || data?.error) return <AdminError message="Pengaturan tidak dapat dimuat." />;
  if (!store) return <AdminError message="Toko tidak ditemukan." />;

  return (
    <div className="space-y-5">
      <SellerPageHeader
        title="Pengaturan Toko"
        description={`Perbarui tampilan etalase publik dan informasi kontak untuk alamat tetap /toko/${store.slug}.`}
        actions={
          store.status === "active" ? (
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/toko/$slug" params={{ slug: store.slug }}>
                <ExternalLink className="size-4" aria-hidden="true" />
                Lihat etalase
              </Link>
            </Button>
          ) : null
        }
      />

      {/* Pratinjau langsung header etalase agar perubahan logo, banner, dan titik fokus terlihat real-time. */}
      <SellerSectionCard
        title="Pratinjau header etalase"
        description="Perubahan tampil langsung di bawah ini. Klik Simpan perubahan agar diterapkan ke halaman publik."
        headingId="preview-store-heading"
        bodyClassName="p-0"
      >
        <div className="relative h-28 w-full overflow-hidden bg-hero-gradient sm:h-36">
          {bannerUrl ? (
            <img
              src={bannerUrl}
              alt=""
              className="size-full object-cover"
              style={{ objectPosition: `50% ${bannerPosition}%` }}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-3.5 px-4 pb-4 sm:px-5">
          <span className="-mt-8 block h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-2 border-card bg-surface-selected text-accent shadow-[var(--elev-1)] sm:-mt-10 sm:h-20 sm:w-20">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="block h-full w-full object-cover object-center" />
            ) : (
              <span className="grid h-full w-full place-items-center">
                <Store className="size-7 sm:size-8" aria-hidden="true" />
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1 pt-2">
            <p className="truncate font-display text-base font-bold text-foreground">
              {name.trim() || store.name}
            </p>
            <p className="truncate font-mono text-xs text-muted-foreground">/toko/{store.slug}</p>
          </div>
        </div>
      </SellerSectionCard>

      <form
        noValidate
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length < 3) {
            setNameError("Nama toko minimal 3 karakter.");
            nameRef.current?.focus();
            return;
          }
          setNameError(undefined);
          mutation.mutate();
        }}
      >
        <SellerSectionCard
          title="Media etalase"
          description="Format JPG, PNG, WEBP, atau AVIF dengan ukuran maksimal 3 MB."
          headingId="media-store-heading"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <AssetUploader
              label="Logo toko"
              hint="Tampil sebagai ikon toko di katalog dan profil. Persegi, minimal 200x200 px."
              kind="logo"
              value={logoUrl}
              onChange={setLogoUrl}
              aspect="aspect-square max-w-[9rem]"
            />
            <AssetUploader
              label="Banner toko"
              hint="Tampil di bagian atas etalase. Disarankan rasio lebar 4:1 (misal 1200x300 px)."
              kind="banner"
              value={bannerUrl}
              onChange={setBannerUrl}
              aspect="aspect-[4/1]"
            />
          </div>

          {bannerUrl ? (
            <div className="mt-5 space-y-1.5 border-t border-border pt-4">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="banner-fokus">Titik fokus banner (vertikal)</Label>
                <span className="text-xs font-semibold tabular-nums text-foreground">
                  {bannerPosition}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Geser untuk memilih bagian gambar yang tampil di pratinjau atas.
              </p>
              <input
                id="banner-fokus"
                type="range"
                min={0}
                max={100}
                value={bannerPosition}
                onChange={(e) => setBannerPosition(Number(e.target.value))}
                className="h-11 w-full accent-accent"
              />
            </div>
          ) : null}
        </SellerSectionCard>

        <SellerSectionCard
          title="Identitas & kontak"
          description="Informasi ini ditampilkan di halaman publik toko dan digunakan saat koordinasi."
          icon={Store}
          headingId="identity-store-heading"
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <p className="text-xs text-muted-foreground">
                Alamat URL <span className="font-mono text-foreground">/toko/{store.slug}</span>{" "}
                bersifat tetap.
              </p>
              <Button
                type="submit"
                className="min-h-11 w-full sm:w-auto"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Menyimpan..." : "Simpan perubahan"}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <SellerField
              id="toko-nama"
              label="Nama toko"
              required
              counter={`${name.length}/80`}
              hint="Minimal 3 karakter, maksimal 80 karakter."
              error={nameError}
            >
              <Input
                ref={nameRef}
                id="toko-nama"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError && e.target.value.trim().length >= 3) setNameError(undefined);
                }}
                maxLength={80}
                required
                aria-invalid={nameError ? "true" : "false"}
                aria-describedby={nameError ? "toko-nama-hint toko-nama-error" : "toko-nama-hint"}
                className="seller-field-control min-h-11"
              />
            </SellerField>

            <SellerField
              id="toko-deskripsi"
              label="Deskripsi toko"
              counter={`${description.length}/1000`}
              hint="Ceritakan fokus produk/jasa dan informasi layanan yang perlu diketahui pembeli."
            >
              <Textarea
                id="toko-deskripsi"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Ceritakan produk yang Anda jual"
                aria-invalid="false"
                aria-describedby="toko-deskripsi-hint"
              />
            </SellerField>

            <SellerField
              id="toko-kontak"
              label="Nomor WhatsApp"
              hint="Format angka lokal atau internasional, contoh: 081234567890."
            >
              <Input
                id="toko-kontak"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={30}
                placeholder="08xxxxxxxxxx"
                inputMode="tel"
                autoComplete="tel"
                aria-invalid="false"
                aria-describedby="toko-kontak-hint"
                className="min-h-11"
              />
            </SellerField>
          </div>
        </SellerSectionCard>
      </form>
    </div>
  );
}
