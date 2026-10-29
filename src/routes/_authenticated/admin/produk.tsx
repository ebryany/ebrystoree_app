import { cloneElement, isValidElement, useId, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileArchive, FolderTree, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  Pager,
  useCan,
} from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deleteProduct,
  listAdminProducts,
  listCategories,
  saveProduct,
  setProductStatus,
} from "@/lib/admin.functions";
import { Switch } from "@/components/ui/switch";
import { ProductFilesDialog } from "@/components/admin/product-files-dialog";
import { CategoryManagerDialog } from "@/components/admin/category-manager-dialog";
import { ImageUploader } from "@/components/admin/image-uploader";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/produk")({
  head: () => ({
    meta: [
      { title: "Produk Platform Store — Admin Ebrystore" },
      {
        name: "description",
        content:
          "Kelola katalog produk milik platform store Ebrystore: buat, ubah, terbitkan, dan arsipkan.",
      },
      { property: "og:title", content: "Produk Platform Store — Admin Ebrystore" },
      { property: "og:description", content: "Manajemen katalog produk platform store Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminProduk,
});

const PAGE_SIZE = 10;

type FormState = {
  id?: string;
  name: string;
  categoryId: string;
  shortDescription: string;
  description: string;
  thumbnailUrl: string;
  price: string;
  discountPrice: string;
  downloadLimit: string;
  validityDays: string;
  status: "draft" | "published" | "archived";
};

const emptyForm: FormState = {
  name: "",
  categoryId: "none",
  shortDescription: "",
  description: "",
  thumbnailUrl: "",
  price: "0",
  discountPrice: "",
  downloadLimit: "5",
  validityDays: "365",
  status: "draft",
};

function AdminProduk() {
  const qc = useQueryClient();
  const canCreate = useCan("products.create");
  const canUpdate = useCan("products.update");
  const canDelete = useCan("products.delete");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "draft" | "published" | "archived">("all");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<FormState | null>(null);
  const [filesTarget, setFilesTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);

  const fetchItems = useServerFn(listAdminProducts);
  const fetchCategories = useServerFn(listCategories);
  const save = useServerFn(saveProduct);
  const publish = useServerFn(setProductStatus);
  const remove = useServerFn(deleteProduct);

  const { data, isPending, error } = useQuery({
    queryKey: ["admin-products", search, status, page],
    queryFn: () => fetchItems({ data: { search, status, page, pageSize: PAGE_SIZE } }),
  });
  const { data: categories } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => fetchCategories({}),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin-products"] });
    void qc.invalidateQueries({ queryKey: ["admin-overview"] });
    void qc.invalidateQueries({ queryKey: ["admin-audit"] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: any) => save({ data: payload }),
    onSuccess: (res: any) => {
      if (res?.forbidden) return toast.error(`Izin ${res.permission} dibutuhkan.`);
      if (!res.ok) return toast.error(res.message);
      toast.success(res.message);
      setForm(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal menyimpan produk."),
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { id: string; status: "draft" | "published" | "archived" }) =>
      publish({ data: payload }),
    onSuccess: (res: any) => {
      if (res?.forbidden) return toast.error(`Izin ${res.permission} dibutuhkan.`);
      if (!res.ok) return toast.error(res.message);
      toast.success(res.message);
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: (res: any) => {
      if (res?.forbidden) return toast.error(`Izin ${res.permission} dibutuhkan.`);
      if (!res.ok) return toast.error(res.message);
      toast.success(res.message);
      setDeleteTarget(null);
      invalidate();
    },
  });

  const submit = () => {
    if (!form) return;
    if (form.name.trim().length < 3) return toast.error("Nama produk minimal 3 karakter.");
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) return toast.error("Harga tidak valid.");
    const discount = form.discountPrice === "" ? null : Number(form.discountPrice);
    if (discount !== null && (!Number.isFinite(discount) || discount >= price)) {
      return toast.error("Harga diskon harus lebih kecil dari harga normal.");
    }
    saveMutation.mutate({
      id: form.id,
      name: form.name.trim(),
      categoryId: form.categoryId === "none" ? null : form.categoryId,
      shortDescription: form.shortDescription.trim(),
      description: form.description.trim(),
      thumbnailUrl: form.thumbnailUrl.trim(),
      price: Math.round(price),
      discountPrice: discount === null ? null : Math.round(discount),
      downloadLimit: Number(form.downloadLimit) || 5,
      validityDays: Number(form.validityDays) || 365,
      status: form.status,
    });
  };

  const productCategories = (
    categories && !("forbidden" in categories && categories.forbidden)
      ? (categories as any).items
      : []
  ).filter((c: any) => c.kind === "product");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        crumb="Produk Platform Store"
        title="Produk Platform Store"
        description="Katalog produk milik platform Ebrystore, termasuk draft yang belum terbit. Produk seller dikelola lewat moderasi."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link to="/admin/seller/produk">
                <ShieldCheck className="mr-1 size-4" aria-hidden="true" />
                Moderasi Produk Seller
              </Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCategoryOpen(true)}>
              <FolderTree className="mr-1 size-4" aria-hidden="true" />
              Kategori
            </Button>
            {canCreate ? (
              <Button size="sm" onClick={() => setForm(emptyForm)}>
                <Plus className="mr-1 size-4" aria-hidden="true" />
                Produk baru
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <Input
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value.slice(0, 120));
          }}
          placeholder="Cari nama produk…"
          aria-label="Cari produk"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setPage(1);
            setStatus(v as typeof status);
          }}
        >
          <SelectTrigger aria-label="Filter status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Terbit</SelectItem>
            <SelectItem value="archived">Arsip</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <AdminLoading />
      ) : error ? (
        <AdminError />
      ) : data.forbidden ? (
        <ForbiddenState permission={data.permission} />
      ) : data.error ? (
        <AdminError message={data.error} />
      ) : data.items.length === 0 ? (
        <EmptyRow message="Belum ada produk yang cocok dengan filter ini." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Harga</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-64">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.slug}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {productCategories.find((c: any) => c.id === p.category_id)?.name ??
                          "Tanpa kategori"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === "published" ? "default" : "secondary"}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRupiah(p.price)}
                      {p.discount_price ? (
                        <span className="block text-xs text-muted-foreground">
                          Diskon {formatRupiah(p.discount_price)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {canUpdate ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setFilesTarget({ id: p.id, name: p.name })}
                            >
                              <FileArchive className="mr-1 size-4" aria-hidden="true" />
                              Berkas
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                statusMutation.mutate({
                                  id: p.id,
                                  status: p.status === "published" ? "draft" : "published",
                                })
                              }
                            >
                              {p.status === "published" ? "Unpublish" : "Publish"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Ubah ${p.name}`}
                              onClick={() =>
                                setForm({
                                  id: p.id,
                                  name: p.name,
                                  categoryId: p.category_id ?? "none",
                                  shortDescription: p.short_description ?? "",
                                  description: "",
                                  thumbnailUrl: p.thumbnail_url ?? "",
                                  price: String(p.price),
                                  discountPrice: p.discount_price ? String(p.discount_price) : "",
                                  downloadLimit: String(p.download_limit ?? 5),
                                  validityDays: String(p.validity_days ?? 365),
                                  status: p.status,
                                })
                              }
                            >
                              <Pencil className="size-4" aria-hidden="true" />
                            </Button>
                          </>
                        ) : null}
                        {canDelete ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Hapus ${p.name}`}
                            onClick={() => setDeleteTarget({ id: p.id, name: p.name })}
                          >
                            <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
        </>
      )}

      <CategoryManagerDialog kind="product" open={categoryOpen} onOpenChange={setCategoryOpen} />

      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Ubah produk digital" : "Produk digital baru"}</DialogTitle>
          </DialogHeader>
          {form ? (
            <div className="space-y-5">
              <FormSection
                title="Informasi produk"
                description="Nama dan deskripsi yang dilihat pelanggan di katalog."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nama produk">
                    <Input
                      value={form.name}
                      maxLength={120}
                      placeholder="Contoh: Template Skripsi Word"
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </Field>
                  <Field label="Kategori">
                    <Select
                      value={form.categoryId}
                      onValueChange={(v) => setForm({ ...form, categoryId: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Tanpa kategori</SelectItem>
                        {productCategories.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Deskripsi singkat">
                  <Input
                    value={form.shortDescription}
                    maxLength={240}
                    placeholder="Satu kalimat ringkas untuk kartu katalog"
                    onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
                  />
                </Field>
                <Field label="Deskripsi lengkap">
                  <Textarea
                    value={form.description}
                    maxLength={5000}
                    rows={4}
                    placeholder="Isi paket, format berkas, dan siapa yang cocok memakainya."
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </Field>
              </FormSection>

              <FormSection
                title="Gambar sampul"
                description="Unggah langsung dari perangkat. Rasio 4:3 atau persegi paling rapi."
              >
                <ImageUploader
                  label="Gambar produk"
                  folder="products"
                  value={form.thumbnailUrl}
                  onChange={(v) => setForm({ ...form, thumbnailUrl: v })}
                />
              </FormSection>

              <FormSection
                title="Harga & akses"
                description="Isi angka rupiah tanpa titik atau koma."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={`Harga (IDR) — ${formatRupiah(Number(form.price) || 0)}`}>
                    <Input
                      inputMode="numeric"
                      value={form.price}
                      onChange={(e) =>
                        setForm({ ...form, price: e.target.value.replace(/\D/g, "") })
                      }
                    />
                  </Field>
                  <Field
                    label={`Harga diskon — ${form.discountPrice ? formatRupiah(Number(form.discountPrice) || 0) : "tidak ada"}`}
                  >
                    <Input
                      inputMode="numeric"
                      value={form.discountPrice}
                      onChange={(e) =>
                        setForm({ ...form, discountPrice: e.target.value.replace(/\D/g, "") })
                      }
                    />
                  </Field>
                  <Field label="Batas unduhan">
                    <Input
                      inputMode="numeric"
                      value={form.downloadLimit}
                      onChange={(e) =>
                        setForm({ ...form, downloadLimit: e.target.value.replace(/\D/g, "") })
                      }
                    />
                  </Field>
                  <Field label="Masa berlaku (hari)">
                    <Input
                      inputMode="numeric"
                      value={form.validityDays}
                      onChange={(e) =>
                        setForm({ ...form, validityDays: e.target.value.replace(/\D/g, "") })
                      }
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection
                title="Publikasi"
                description="Draft hanya terlihat staf; terbit tampil di katalog publik."
              >
                <Field label="Status">
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v as FormState["status"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Terbit</SelectItem>
                      <SelectItem value="archived">Arsip</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </FormSection>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setForm(null)}>
              Batal
            </Button>
            <Button onClick={submit} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Menyimpan…" : "Simpan produk"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductFilesDialog product={filesTarget} onOpenChange={(o) => !o && setFilesTarget(null)} />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus produk?</AlertDialogTitle>
            <AlertDialogDescription>
              Produk “{deleteTarget?.name}” akan diarsipkan (soft delete) dan hilang dari katalog
              publik. Tindakan ini tercatat di audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {isValidElement(children) ? cloneElement(children as any, { id }) : children}
    </div>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card/60 p-4">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
