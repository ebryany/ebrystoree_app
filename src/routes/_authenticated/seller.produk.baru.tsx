import { useMemo, useRef, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ImageOff } from "lucide-react";

import { ImageUploader } from "@/components/admin/image-uploader";
import {
  SellerField,
  SellerPageHeader,
  SellerSectionCard,
} from "@/components/seller/seller-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatRupiah } from "@/lib/format";
import { isRenderableImageUrl } from "@/lib/utils";
import {
  listProductCategories,
  saveMyProduct,
  uploadProductImage as uploadImage,
} from "@/lib/seller.functions";

export const Route = createFileRoute("/_authenticated/seller/produk/baru")({
  head: () => ({
    meta: [
      { title: "Tambah Produk | Ebrystore" },
      { name: "description", content: "Tambahkan produk digital baru untuk toko Anda." },
      { property: "og:title", content: "Tambah Produk | Ebrystore" },
      { property: "og:description", content: "Tambahkan produk baru." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewProduct,
});

const ribuan = (digits: string) =>
  digits ? new Intl.NumberFormat("id-ID").format(Number(digits)) : "";
const onlyDigits = (value: string) => value.replace(/\D/g, "").slice(0, 10);

type FormErrors = { name?: string; price?: string; discount?: string };

function NewProduct() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const save = useServerFn(saveMyProduct);
  const fetchCategories = useServerFn(listProductCategories);

  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [shortDescription, setShortDesc] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [discountPrice, setDiscountPrice] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [downloadLimit, setDownloadLimit] = useState("5");
  const [validityDays, setValidityDays] = useState("365");
  const [errors, setErrors] = useState<FormErrors>({});

  const { data: categories } = useQuery({
    queryKey: ["product-categories"],
    queryFn: () => fetchCategories({}),
  });
  const categoryItems = categories?.items ?? [];

  const priceNumber = Number(price || 0);
  const discountNumber = Number(discountPrice || 0);
  const discountValid = discountPrice !== "" && discountNumber > 0 && discountNumber < priceNumber;
  const finalPrice = discountValid ? discountNumber : priceNumber;
  const thumbnailRenderable = isRenderableImageUrl(thumbnailUrl.trim());

  const previewName = useMemo(() => name.trim() || "Nama produk Anda", [name]);
  const previewShort = shortDescription.trim();

  const mutation = useMutation({
    mutationFn: async () =>
      save({
        data: {
          name: name.trim(),
          shortDescription: shortDescription.trim() || undefined,
          description: description.trim() || undefined,
          price: priceNumber,
          discountPrice: discountValid ? discountNumber : undefined,
          thumbnailUrl: thumbnailUrl.trim() || undefined,
          downloadLimit: Number(downloadLimit) || 5,
          validityDays: Number(validityDays) || 365,
          categoryId: categoryId || undefined,
        },
      }),
    onSuccess: async (res: any) => {
      if (!res?.ok) return toast.error(res?.error ?? "Gagal membuat produk.");
      toast.success("Produk dibuat. Lengkapi file atau stok lalu ajukan moderasi.");
      await queryClient.invalidateQueries({ queryKey: ["my-store-products"] });
      navigate({ to: "/seller/produk/$id", params: { id: res.id } });
    },
    onError: () => toast.error("Gagal membuat produk."),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: FormErrors = {};
    if (name.trim().length < 3) next.name = "Nama produk minimal 3 karakter.";
    if (priceNumber <= 0) next.price = "Harga wajib lebih dari nol.";
    if (discountPrice !== "" && priceNumber > 0 && discountNumber >= priceNumber) {
      next.discount = "Harga diskon harus lebih kecil dari harga normal.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      if (next.name) nameRef.current?.focus();
      else if (next.price) priceRef.current?.focus();
      else if (next.discount) discountRef.current?.focus();
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="min-w-0 space-y-5">
      <SellerPageHeader
        title="Tambah Produk Digital"
        description="Isi informasi produk, periksa pratinjau kartu katalog, lalu unggah file dan ajukan moderasi."
        backTo="/seller/produk"
        backLabel="Kembali ke daftar produk"
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form className="min-w-0 space-y-5" onSubmit={submit} noValidate>
          <SellerSectionCard
            title="1. Informasi produk"
            description="Detail utama yang dibaca pembeli saat menemukan produk Anda di katalog."
            headingId="np-info-heading"
          >
            <div className="space-y-4">
              <SellerField
                id="np-name"
                label="Nama produk"
                required
                counter={`${name.length}/160`}
                hint="Gunakan judul yang spesifik agar mudah dicari pembeli."
                error={errors.name}
              >
                <Input
                  ref={nameRef}
                  id="np-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name && e.target.value.trim().length >= 3) {
                      setErrors((prev) => ({ ...prev, name: undefined }));
                    }
                  }}
                  placeholder="Contoh: Template CV Profesional ATS Friendly"
                  maxLength={160}
                  required
                  aria-invalid={errors.name ? "true" : "false"}
                  aria-describedby={errors.name ? "np-name-hint np-name-error" : "np-name-hint"}
                  className="seller-field-control min-h-11"
                />
              </SellerField>

              <SellerField
                id="np-category"
                label="Kategori"
                hint={categories?.error ?? "Pilih kategori yang paling sesuai dengan isi produk."}
              >
                <select
                  id="np-category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  aria-invalid="false"
                  aria-describedby="np-category-hint"
                  className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Tanpa kategori</option>
                  {categoryItems.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </SellerField>

              <SellerField
                id="np-short"
                label="Deskripsi singkat"
                counter={`${shortDescription.length}/300`}
                hint="Satu kalimat ringkas yang tampil pada kartu pratinjau katalog."
              >
                <Input
                  id="np-short"
                  value={shortDescription}
                  onChange={(e) => setShortDesc(e.target.value)}
                  maxLength={300}
                  placeholder="Contoh: Paket 5 desain CV siap edit format Word dan Figma"
                  aria-invalid="false"
                  aria-describedby="np-short-hint"
                  className="min-h-11"
                />
              </SellerField>

              <SellerField
                id="np-desc"
                label="Deskripsi lengkap"
                counter={`${description.length}/5000`}
                hint="Jelaskan isi file, format, syarat perangkat, dan cara pemakaian."
              >
                <Textarea
                  id="np-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  maxLength={5000}
                  placeholder="Jelaskan isi, format file, dan cara pemakaian produk"
                  aria-invalid="false"
                  aria-describedby="np-desc-hint"
                />
              </SellerField>
            </div>
          </SellerSectionCard>

          <SellerSectionCard
            title="2. Harga & diskon"
            description="Harga akhir ditampilkan di katalog dan dihitung ulang secara aman oleh server saat checkout."
            headingId="np-price-heading"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <SellerField
                id="np-price"
                label="Harga normal (Rp)"
                required
                hint="Masukkan angka rupiah tanpa titik, contoh: 50000."
                error={errors.price}
              >
                <Input
                  ref={priceRef}
                  id="np-price"
                  value={ribuan(price)}
                  onChange={(e) => {
                    setPrice(onlyDigits(e.target.value));
                    if (errors.price) setErrors((prev) => ({ ...prev, price: undefined }));
                  }}
                  inputMode="numeric"
                  placeholder="50.000"
                  required
                  aria-invalid={errors.price ? "true" : "false"}
                  aria-describedby={errors.price ? "np-price-hint np-price-error" : "np-price-hint"}
                  className="seller-field-control min-h-11 tabular-nums"
                />
              </SellerField>

              <SellerField
                id="np-disc"
                label="Harga diskon (Rp)"
                hint="Harus lebih rendah dari harga normal jika diisi."
                error={errors.discount}
              >
                <Input
                  ref={discountRef}
                  id="np-disc"
                  value={ribuan(discountPrice)}
                  onChange={(e) => {
                    setDiscountPrice(onlyDigits(e.target.value));
                    if (errors.discount) setErrors((prev) => ({ ...prev, discount: undefined }));
                  }}
                  inputMode="numeric"
                  placeholder="35.000"
                  aria-invalid={errors.discount ? "true" : "false"}
                  aria-describedby={
                    errors.discount ? "np-disc-hint np-disc-error" : "np-disc-hint"
                  }
                  className="seller-field-control min-h-11 tabular-nums"
                />
              </SellerField>
            </div>
            {priceNumber > 0 ? (
              <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-sm tabular-nums text-muted-foreground">
                Harga tampil di katalog:{" "}
                <strong className="font-bold text-price">{formatRupiah(finalPrice)}</strong>
              </p>
            ) : null}
          </SellerSectionCard>

          <SellerSectionCard
            title="3. Pengaturan akses & gambar"
            description="Atur batas unduhan, masa berlaku akses, dan thumbnail katalog produk."
            headingId="np-access-heading"
            footer={
              <div className="px-4 py-3.5 sm:px-5">
                <Button type="submit" className="min-h-11 w-full" disabled={mutation.isPending}>
                  {mutation.isPending ? "Membuat produk..." : "Simpan produk & lanjut atur file"}
                </Button>
              </div>
            }
          >
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <SellerField
                  id="np-limit"
                  label="Batas unduhan"
                  hint="Jumlah unduhan per pembeli (1 sampai 100 kali)."
                >
                  <Input
                    id="np-limit"
                    value={downloadLimit}
                    onChange={(e) => setDownloadLimit(onlyDigits(e.target.value))}
                    inputMode="numeric"
                    aria-invalid="false"
                    aria-describedby="np-limit-hint"
                    className="min-h-11 tabular-nums"
                  />
                </SellerField>

                <SellerField
                  id="np-validity"
                  label="Masa berlaku (hari)"
                  hint="Lama akses pembeli sejak pembayaran terverifikasi."
                >
                  <Input
                    id="np-validity"
                    value={validityDays}
                    onChange={(e) => setValidityDays(onlyDigits(e.target.value))}
                    inputMode="numeric"
                    aria-invalid="false"
                    aria-describedby="np-validity-hint"
                    className="min-h-11 tabular-nums"
                  />
                </SellerField>
              </div>

              <ImageUploader
                value={thumbnailUrl}
                onChange={setThumbnailUrl}
                folder="products"
                label="Gambar produk"
                hint="JPG, PNG, WEBP, atau AVIF, maksimal 3 MB."
                uploadRemote={async (file: File) => {
                  const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result));
                    reader.onerror = () => reject(new Error("Gagal membaca file."));
                    reader.readAsDataURL(file);
                  });
                  const res: any = await uploadImage({
                    data: { name: file.name, data: dataUrl.slice(dataUrl.indexOf(",") + 1) },
                  });
                  if (!res?.ok) throw new Error(res?.error ?? "Gagal mengunggah gambar.");
                  return res.url as string;
                }}
              />

              <SellerField
                id="np-thumb"
                label="URL gambar alternatif"
                hint="Gunakan jika gambar tidak diunggah dari tombol di atas."
              >
                <Input
                  id="np-thumb"
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                  maxLength={500}
                  placeholder="https://"
                  inputMode="url"
                  aria-invalid="false"
                  aria-describedby="np-thumb-hint"
                  className="min-h-11"
                />
              </SellerField>
            </div>
          </SellerSectionCard>
        </form>

        <aside
          className="min-w-0 space-y-3 lg:sticky lg:top-24 lg:self-start"
          aria-label="Pratinjau kartu katalog"
        >
          <SellerSectionCard
            title="Pratinjau pembeli"
            description="Tampilan kartu produk di katalog Ebrystore."
            headingId="np-preview-heading"
            bodyClassName="p-3"
          >
            <div className="overflow-hidden rounded-[var(--radius-panel)] border border-border bg-card">
              <div className="relative aspect-[4/3] overflow-hidden border-b border-border bg-surface-selected">
                {thumbnailRenderable ? (
                  <img src={thumbnailUrl.trim()} alt="" className="block h-full w-full object-cover object-center" />
                ) : (
                  <span className="grid size-full place-items-center text-muted-foreground">
                    <ImageOff className="size-6" aria-hidden="true" />
                  </span>
                )}
              </div>
              <div className="space-y-1.5 p-3.5">
                <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-foreground">
                  {previewName}
                </p>
                {previewShort ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{previewShort}</p>
                ) : null}
                {finalPrice > 0 ? (
                  <p className="flex items-baseline gap-1.5 pt-1 text-sm font-bold tabular-nums text-price">
                    <span>{formatRupiah(finalPrice)}</span>
                    {discountValid ? (
                      <span className="text-xs font-normal text-muted-foreground line-through">
                        {formatRupiah(priceNumber)}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Produk baru tersimpan sebagai draf. Setelah halaman berikutnya terbuka, unggah file
              atau stok lalu klik Ajukan moderasi.
            </p>
          </SellerSectionCard>
        </aside>
      </div>
    </div>
  );
}
