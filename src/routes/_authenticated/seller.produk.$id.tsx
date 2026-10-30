import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  Package,
  Trash2,
  UploadCloud,
  Code,
  AlertTriangle,
  KeyRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ProductVariantEditor } from "@/components/product/variant-editor";
import { StockInput } from "@/components/product/stock-input";
import { decodeAccount } from "@/lib/account-stock";
import type { DeliveryChoice } from "@/lib/product-files.functions";
import {
  archiveMyProduct,
  getMyProduct,
  saveMyProduct,
  submitMyProduct,
} from "@/lib/seller.functions";
import {
  listMyProductFiles,
  createMyFileUpload,
  registerMyFile,
  setMyFileActive,
  deleteMyFile,
  setMyDeliveryMode,
  ingestMyStockCodes,
  listMyStockCodes,
} from "@/lib/seller-files.functions";

export const Route = createFileRoute("/_authenticated/seller/produk/$id")({
  head: () => ({
    meta: [
      { title: "Kelola Produk — Ebrystore" },
      { name: "description", content: "Kelola produk digital toko Anda." },
      { property: "og:title", content: "Kelola Produk — Ebrystore" },
      { property: "og:description", content: "Kelola produk toko Anda." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditProduct,
});

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return "-";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function EditProduct() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchProduct = useServerFn(getMyProduct);
  const save = useServerFn(saveMyProduct);
  const submit = useServerFn(submitMyProduct);
  const archive = useServerFn(archiveMyProduct);

  const { data, isPending: isLoading } = useQuery({
    queryKey: ["my-product", id],
    queryFn: () => fetchProduct({ data: { productId: id } }),
  });
  const product = (data as any)?.product as any;

  const [name, setName] = useState("");
  const [shortDescription, setShortDesc] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [discountPrice, setDiscountPrice] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");

  useEffect(() => {
    if (!product) return;
    setName(product.name ?? "");
    setShortDesc(product.short_description ?? "");
    setDescription(product.description ?? "");
    setPrice(String(product.price ?? ""));
    setDiscountPrice(product.discount_price != null ? String(product.discount_price) : "");
    setThumbnailUrl(product.thumbnail_url ?? "");
  }, [product]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      save({
        data: {
          id,
          name: name.trim(),
          shortDescription: shortDescription.trim() || undefined,
          description: description.trim() || undefined,
          price: Number(price) || 0,
          discountPrice: discountPrice ? Number(discountPrice) : undefined,
          thumbnailUrl: thumbnailUrl.trim() || undefined,
        },
      }),
    onSuccess: async (res: any) => {
      if (!res?.ok) return toast.error(res?.error ?? "Gagal menyimpan.");
      toast.success("Produk disimpan.");
      await queryClient.invalidateQueries({ queryKey: ["my-product", id] });
      await queryClient.invalidateQueries({ queryKey: ["my-store-products"] });
    },
    onError: () => toast.error("Gagal menyimpan produk."),
  });

  const submitMutation = useMutation({
    mutationFn: async () => submit({ data: { productId: id } }),
    onSuccess: async (res: any) => {
      if (!res?.ok) return toast.error(res?.error ?? "Gagal mengajukan.");
      toast.success("Produk diajukan untuk moderasi.");
      await queryClient.invalidateQueries({ queryKey: ["my-product", id] });
      await queryClient.invalidateQueries({ queryKey: ["my-store-products"] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => archive({ data: { productId: id } }),
    onSuccess: async (res: any) => {
      if (!res?.ok) return toast.error(res?.error ?? "Gagal menghapus.");
      toast.success("Produk dihapus.");
      await queryClient.invalidateQueries({ queryKey: ["my-store-products"] });
      navigate({ to: "/seller/produk" });
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Memuat produk…
      </div>
    );
  }

  if (!product) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Produk tidak ditemukan.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        to="/seller/produk"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Kembali ke daftar produk
      </Link>

      {product.moderation_status === "rejected" && product.moderation_note ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3.5 text-xs text-muted-foreground">
          <strong className="text-foreground">Ditolak:</strong> {product.moderation_note}
        </div>
      ) : null}

      {product.moderation_status === "pending" ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-xs text-muted-foreground">
          <strong className="text-foreground">Menunggu moderasi</strong> — produk belum tayang
          sampai disetujui admin.
        </div>
      ) : null}

      <form
        className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length < 3) return toast.error("Nama produk minimal 3 karakter.");
          saveMutation.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="p-name">Nama produk</Label>
          <Input
            id="p-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-short">Deskripsi singkat</Label>
          <Input
            id="p-short"
            value={shortDescription}
            onChange={(e) => setShortDesc(e.target.value)}
            maxLength={300}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-desc">Deskripsi lengkap</Label>
          <Textarea
            id="p-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            maxLength={5000}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="p-price">Harga (Rp)</Label>
            <Input
              id="p-price"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-disc">Harga diskon (opsional)</Label>
            <Input
              id="p-disc"
              value={discountPrice}
              onChange={(e) => setDiscountPrice(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-thumb">URL gambar (opsional)</Label>
          <Input
            id="p-thumb"
            value={thumbnailUrl}
            onChange={(e) => setThumbnailUrl(e.target.value)}
            maxLength={500}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="min-h-11" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Menyimpan…" : "Simpan"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={submitMutation.isPending || product.status === "archived"}
            onClick={() => submitMutation.mutate()}
          >
            Ajukan moderasi
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={archiveMutation.isPending}
            onClick={() => {
              if (confirm("Hapus produk ini? Tindakan ini menyembunyikannya dari katalog."))
                archiveMutation.mutate();
            }}
          >
            Hapus
          </Button>
        </div>
      </form>

      <ProductVariantEditor
        productId={id}
        deliveryMode={product.delivery_mode}
        moderationNotice
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["my-product", id] });
          void queryClient.invalidateQueries({ queryKey: ["my-store-products"] });
        }}
      />

      <SellerFilesSection productId={id} />
    </div>
  );
}

/* ========================= Section File & Pengiriman ========================= */

function SellerFilesSection({ productId }: { productId: string }) {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState("v1");
  const [busy, setBusy] = useState(false);

  const fetchFiles = useServerFn(listMyProductFiles);
  const prepare = useServerFn(createMyFileUpload);
  const register = useServerFn(registerMyFile);
  const toggle = useServerFn(setMyFileActive);
  const remove = useServerFn(deleteMyFile);
  const setMode = useServerFn(setMyDeliveryMode);
  const ingestCodes = useServerFn(ingestMyStockCodes);
  const fetchCodes = useServerFn(listMyStockCodes);

  const { data, isPending } = useQuery({
    queryKey: ["my-product-files", productId],
    queryFn: () => fetchFiles({ data: { productId } }),
  });

  const codesQuery = useQuery({
    queryKey: ["my-stock-codes", productId],
    queryFn: () => fetchCodes({ data: { productId } }),
    enabled: ["code", "account"].includes((data as any)?.deliveryMode),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["my-product-files", productId] });
    void qc.invalidateQueries({ queryKey: ["my-stock-codes", productId] });
    void qc.invalidateQueries({ queryKey: ["my-store-products"] });
    // Mode kirim memengaruhi editor variasi di atas.
    void qc.invalidateQueries({ queryKey: ["my-product", productId] });
  };

  const deliveryMode: DeliveryChoice = (data as any)?.deliveryMode ?? "shared";
  const isStockCode = deliveryMode === "code" || deliveryMode === "account";
  const availableStock: number = Number((data as any)?.availableStock ?? 0);
  const forbidden = (data as any)?.forbidden === true;

  const modeMutation = useMutation({
    mutationFn: (mode: DeliveryChoice) => setMode({ data: { productId, mode } }),
    onSuccess: (res: any) => {
      if (!res.ok) return toast.error(res.message);
      toast.success(res.message);
      invalidate();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (payload: { fileId: string; isActive: boolean }) => toggle({ data: payload }),
    onSuccess: (res: any) => {
      if (!res.ok) return toast.error(res.message);
      toast.success(res.message);
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => remove({ data: { fileId } }),
    onSuccess: (res: any) => {
      if (!res.ok) return toast.error(res.message);
      toast.success(res.message);
      invalidate();
    },
  });

  const codesMutation = useMutation({
    mutationFn: (codes: string[]) => ingestCodes({ data: { productId, codes } }),
  });

  async function addStock(codes: string[]): Promise<boolean> {
    try {
      const res: any = await codesMutation.mutateAsync(codes);
      if (!res.ok) {
        toast.error(res.message);
        return false;
      }
      toast.success(res.message);
      invalidate();
      return true;
    } catch {
      toast.error("Gagal menyimpan stok.");
      return false;
    }
  }

  async function handleUpload() {
    const files = Array.from(fileInput.current?.files ?? []);
    if (files.length === 0) return toast.error("Pilih berkas terlebih dahulu.");
    if (version.trim().length < 1) return toast.error("Versi wajib diisi.");

    setBusy(true);
    try {
      let success = 0;
      for (const file of files) {
        const prep: any = await prepare({
          data: { productId, filename: file.name, sizeBytes: file.size },
        });
        if (!prep.ok) {
          toast.error(`${file.name}: ${prep.message}`);
          continue;
        }

        const { error } = await supabase.storage
          .from(prep.bucket)
          .uploadToSignedUrl(prep.path, prep.token, file);
        if (error) {
          toast.error(`${file.name}: unggahan gagal.`);
          continue;
        }

        const res: any = await register({
          data: {
            productId,
            path: prep.path,
            originalName: file.name,
            mimeType: file.type || null,
            sizeBytes: file.size,
            version: version.trim(),
            makeActive: true,
          },
        });
        if (!res.ok) {
          toast.error(`${file.name}: ${res.message}`);
          continue;
        }
        success += 1;
      }
      if (success > 0) toast.success(`${success} berkas tersimpan.`);
      if (fileInput.current) fileInput.current.value = "";
      invalidate();
    } finally {
      setBusy(false);
    }
  }

  if (forbidden) return null;

  const items: any[] = (data as any)?.items ?? [];
  const codeItems: any[] = (codesQuery.data as any)?.items ?? [];

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-base font-semibold">File & Pengiriman</h2>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
        <AlertTriangle className="mb-1 inline-block size-3.5 text-amber-500" aria-hidden="true" />{" "}
        Menambah, menghapus, atau mengubah file akan me-reset status moderasi ke{" "}
        <strong>pending</strong>. Produk tidak tayang sampai disetujui kembali.
      </div>

      {/* Mode pengiriman */}
      <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Mode pengiriman</p>
            <p className="text-xs text-muted-foreground">
              {deliveryMode === "shared" &&
                "Berkas bersama: semua pembeli mengunduh berkas versi aktif yang sama."}
              {deliveryMode === "unique" &&
                "Stok unik: setiap pembeli mendapat satu berkas berbeda. Produk habis saat stok nol."}
              {deliveryMode === "code" &&
                "Kode/link: setiap pembeli mendapat satu kode unik (serial key, voucher, dll)."}
              {deliveryMode === "account" &&
                "Akun: setiap pembeli mendapat satu akun (email + password) yang tinggal disalin."}
            </p>
          </div>
          {(deliveryMode === "unique" || isStockCode) && (
            <Badge
              variant={availableStock > 0 ? "secondary" : "destructive"}
              className="shrink-0 gap-1"
            >
              <Package className="size-3" aria-hidden="true" />
              Stok {availableStock}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={deliveryMode === "shared" ? "default" : "outline"}
            disabled={modeMutation.isPending}
            onClick={() => modeMutation.mutate("shared")}
          >
            Berkas bersama
          </Button>
          <Button
            size="sm"
            variant={deliveryMode === "unique" ? "default" : "outline"}
            disabled={modeMutation.isPending}
            onClick={() => modeMutation.mutate("unique")}
          >
            Stok unik
          </Button>
          <Button
            size="sm"
            variant={deliveryMode === "code" ? "default" : "outline"}
            disabled={modeMutation.isPending}
            onClick={() => modeMutation.mutate("code")}
          >
            <Code className="mr-1 size-3.5" aria-hidden="true" />
            Kode/Link
          </Button>
          <Button
            size="sm"
            variant={deliveryMode === "account" ? "default" : "outline"}
            disabled={modeMutation.isPending}
            onClick={() => modeMutation.mutate("account")}
          >
            <KeyRound className="mr-1 size-3.5" aria-hidden="true" />
            Akun
          </Button>
        </div>
      </div>

      {/* Upload file (shared & unique) */}
      {!isStockCode && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <div className="space-y-1.5">
              <Label htmlFor="seller-file">Berkas produk</Label>
              <Input
                id="seller-file"
                type="file"
                multiple={deliveryMode === "unique"}
                ref={fileInput}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seller-version">Versi</Label>
              <Input
                id="seller-version"
                value={version}
                maxLength={40}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {deliveryMode === "unique"
              ? "Setiap berkas yang diunggah menjadi satu slot stok. Pilih banyak berkas sekaligus untuk menambah stok."
              : "Berkas disimpan di bucket privat dan hanya dapat diunduh lewat tautan bertanda tangan milik pembeli."}
          </p>
          <Button onClick={handleUpload} disabled={busy} size="sm" className="min-h-11">
            <UploadCloud className="mr-1 size-4" aria-hidden="true" />
            {busy
              ? "Mengunggah…"
              : deliveryMode === "unique"
                ? "Unggah & tambah stok"
                : "Unggah & jadikan versi aktif"}
          </Button>
        </div>
      )}

      {/* Daftar file */}
      {!isStockCode && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">
            {deliveryMode === "unique" ? "Daftar stok berkas" : "Histori versi"}
          </h3>
          {isPending ? (
            <p className="text-sm text-muted-foreground">Memuat…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada berkas. Produk belum dapat dikirim ke pembeli.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{f.original_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.version} · {formatSize(f.size_bytes)} ·{" "}
                      {new Date(f.created_at).toLocaleDateString("id-ID")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {f.assigned_entitlement_id ? (
                      <Badge variant="outline">
                        <Lock className="mr-1 size-3" aria-hidden="true" />
                        Milik pembeli
                      </Badge>
                    ) : deliveryMode === "unique" ? (
                      f.is_active ? (
                        <>
                          <Badge variant="secondary">Tersedia</Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toggleMutation.mutate({ fileId: f.id, isActive: false })}
                          >
                            Nonaktifkan
                          </Button>
                        </>
                      ) : (
                        <>
                          <Badge variant="outline">Nonaktif</Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toggleMutation.mutate({ fileId: f.id, isActive: true })}
                          >
                            Jadikan stok
                          </Button>
                        </>
                      )
                    ) : f.is_active ? (
                      <Badge>
                        <CheckCircle2 className="mr-1 size-3" aria-hidden="true" />
                        Aktif
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleMutation.mutate({ fileId: f.id, isActive: true })}
                      >
                        Aktifkan
                      </Button>
                    )}
                    {f.assigned_entitlement_id ? null : (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Hapus ${f.original_name}`}
                        onClick={() => {
                          if (confirm(`Hapus berkas "${f.original_name}"?`))
                            deleteMutation.mutate(f.id);
                        }}
                      >
                        <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Input stock codes (mode code) */}
      {isStockCode && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <StockInput
            key={deliveryMode}
            kind={deliveryMode === "account" ? "account" : "code"}
            pending={codesMutation.isPending}
            onSubmit={addStock}
          />

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">
              {deliveryMode === "account" ? "Daftar akun" : "Daftar kode"} ({codeItems.length})
            </h3>
            {codesQuery.isPending ? (
              <p className="text-sm text-muted-foreground">Memuat…</p>
            ) : codeItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada stok. Tambahkan stok agar produk bisa dibeli.
              </p>
            ) : (
              <div className="max-h-60 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        {deliveryMode === "account" ? "Login" : "Kode"}
                      </th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-left font-medium">Ditambahkan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codeItems.map((c: any) => (
                      <tr key={c.id} className="border-t border-border">
                        <td className="max-w-[16rem] truncate px-3 py-1.5 font-mono">
                          {decodeAccount(c.code)?.login ?? c.code}
                        </td>
                        <td className="px-3 py-1.5">
                          <Badge
                            variant={c.status === "available" ? "secondary" : "outline"}
                            className="text-[10px]"
                          >
                            {c.status === "available"
                              ? "Tersedia"
                              : c.status === "assigned"
                                ? "Terjual"
                                : c.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {new Date(c.created_at).toLocaleDateString("id-ID")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
