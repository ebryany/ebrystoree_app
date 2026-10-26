import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ImageOff } from "lucide-react";

import { ImageUploader } from "@/components/admin/image-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      { title: "Tambah Produk — Ebrystore" },
      { name: "description", content: "Tambahkan produk digital baru untuk toko Anda." },
      { property: "og:title", content: "Tambah Produk — Ebrystore" },
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
      toast.success("Produk dibuat. Ajukan moderasi agar tayang.");
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
    if (discountPrice !== "" && priceNumber > 0 && discountNumber >= priceNumber)
      next.discount = "Harga diskon harus lebih kecil dari harga normal.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    mutation.mutate();
  }

  return (
    <div className="min-w-0 space-y-5">
      <Link
        to="/seller/produk"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Kembali ke daftar produk
      </Link>

      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Tambah produk</h1>
        <p className="text-sm text-muted-foreground">
          Isi detail produk digital, periksa pratinjau kartu katalog, lalu ajukan moderasi.
        </p>
      </header>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form className="min-w-0 space-y-5" onSubmit={submit} noValidate>
          <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Informasi produk</h2>
              <p className="text-xs text-muted-foreground">
                Yang dilihat pembeli saat menemukan produk Anda di katalog.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="np-name">Nama produk</Label>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {name.length}/160
                </span>
              </div>
              <Input
                id="np-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Template CV Profesional"
                maxLength={160}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "np-name-error" : undefined}
              />
              {errors.name ? (
                <p id="np-name-error" role="alert" className="text-xs text-destructive">
                  {errors.name}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-category">Kategori</Label>
              <select
                id="np-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Tanpa kategori</option>
                {categoryItems.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {categories?.error ? (
                <p className="text-xs text-muted-foreground">{categories.error}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="np-short">Deskripsi singkat</Label>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {shortDescription.length}/300
                </span>
              </div>
              <Input
                id="np-short"
                value={shortDescription}
                onChange={(e) => setShortDesc(e.target.value)}
                maxLength={300}
                placeholder="Satu kalimat yang menjelaskan isi produk"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-desc">Deskripsi lengkap</Label>
              <Textarea
                id="np-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                maxLength={5000}
                placeholder="Jelaskan isi, format file, dan cara pemakaian produk"
              />
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Harga</h2>
              <p className="text-xs text-muted-foreground">
                Diskon opsional; harga akhir yang tampil di katalog dan dipakai saat checkout.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="np-price">Harga (Rp)</Label>
                <Input
                  id="np-price"
                  value={ribuan(price)}
                  onChange={(e) => setPrice(onlyDigits(e.target.value))}
                  inputMode="numeric"
                  placeholder="50.000"
                  className="tabular-nums"
                  aria-invalid={Boolean(errors.price)}
                  aria-describedby={errors.price ? "np-price-error" : undefined}
                />
                {errors.price ? (
                  <p id="np-price-error" role="alert" className="text-xs text-destructive">
                    {errors.price}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="np-disc">Harga diskon (opsional)</Label>
                <Input
                  id="np-disc"
                  value={ribuan(discountPrice)}
                  onChange={(e) => setDiscountPrice(onlyDigits(e.target.value))}
                  inputMode="numeric"
                  placeholder="35.000"
                  className="tabular-nums"
                  aria-invalid={Boolean(errors.discount)}
                  aria-describedby={errors.discount ? "np-disc-error" : undefined}
                />
                {errors.discount ? (
                  <p id="np-disc-error" role="alert" className="text-xs text-destructive">
                    {errors.discount}
                  </p>
                ) : null}
              </div>
            </div>
            {priceNumber > 0 ? (
              <p className="text-sm tabular-nums text-muted-foreground">
                Tampil di katalog:{" "}
                <span className="font-semibold text-foreground">{formatRupiah(finalPrice)}</span>
              </p>
            ) : null}
          </section>

          <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Pengaturan produk digital</h2>
              <p className="text-xs text-muted-foreground">
                Berlaku setelah pembeli memiliki produk. Ubah nilai ini bila produk butuh aturan
                lain.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="np-limit">Batas unduhan</Label>
                <Input
                  id="np-limit"
                  value={downloadLimit}
                  onChange={(e) => setDownloadLimit(onlyDigits(e.target.value))}
                  inputMode="numeric"
                  className="tabular-nums"
                />
                <p className="text-xs text-muted-foreground">
                  Kali unduhan per pembeli, 1 sampai 100.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="np-validity">Masa berlaku (hari)</Label>
                <Input
                  id="np-validity"
                  value={validityDays}
                  onChange={(e) => setValidityDays(onlyDigits(e.target.value))}
                  inputMode="numeric"
                  className="tabular-nums"
                />
                <p className="text-xs text-muted-foreground">
                  Masa akses pembeli sejak pembayaran.
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-thumb">Atau tempel URL gambar (opsional)</Label>
              <Input
                id="np-thumb"
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                maxLength={500}
                placeholder="https://"
                inputMode="url"
              />
              <p className="text-xs text-muted-foreground">
                Unggah file di atas atau tempel tautan gambar persegi; pratinjau di samping memakai
                gambar yang aktif.
              </p>
            </div>
            <Button type="submit" className="min-h-11 w-full" disabled={mutation.isPending}>
              {mutation.isPending ? "Membuat…" : "Buat produk & ajukan moderasi"}
            </Button>
          </section>
        </form>

        <aside
          className="min-w-0 space-y-3 lg:sticky lg:top-24 lg:self-start"
          aria-label="Pratinjau kartu katalog"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pratinjau pembeli
          </p>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="relative aspect-square border-b border-border bg-secondary">
              {thumbnailRenderable ? (
                <img src={thumbnailUrl.trim()} alt="" className="size-full object-cover" />
              ) : (
                <span className="grid size-full place-items-center text-muted-foreground">
                  <ImageOff className="size-6" aria-hidden="true" />
                </span>
              )}
            </div>
            <div className="space-y-1.5 p-3">
              <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold">{previewName}</p>
              {previewShort ? (
                <p className="line-clamp-2 text-xs text-muted-foreground">{previewShort}</p>
              ) : null}
              {finalPrice > 0 ? (
                <p className="pt-1 text-sm font-semibold tabular-nums">
                  {formatRupiah(finalPrice)}
                  {discountValid ? (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground line-through">
                      {formatRupiah(priceNumber)}
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Kartu inilah yang dilihat pembeli di katalog. Produk baru berstatus draft dan menunggu
            moderasi sebelum tayang.
          </p>
        </aside>
      </div>
    </div>
  );
}
