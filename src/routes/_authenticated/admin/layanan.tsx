import { cloneElement, isValidElement, useId, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
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
import { ImageUploader } from "@/components/admin/image-uploader";
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
  deleteService,
  listAdminServices,
  listCategories,
  saveService,
  setServiceStatus,
} from "@/lib/admin.functions";
import { ServiceOptionsDialog } from "@/components/admin/service-options-dialog";
import { CategoryManagerDialog } from "@/components/admin/category-manager-dialog";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/layanan")({
  head: () => ({
    meta: [
      { title: "Kelola Layanan Akademik — Admin Ebrystore" },
      {
        name: "description",
        content: "CRUD layanan akademik Ebrystore: buat, ubah, terbitkan, dan arsipkan layanan.",
      },
      { property: "og:title", content: "Kelola Layanan Akademik — Admin Ebrystore" },
      { property: "og:description", content: "Manajemen katalog layanan akademik Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminLayanan,
});

const PAGE_SIZE = 10;

type FormState = {
  id?: string;
  name: string;
  categoryId: string;
  shortDescription: string;
  description: string;
  thumbnailUrl: string;
  requirementsNote: string;
  orderCapacity: string;
  status: "draft" | "published" | "archived";
};

const emptyForm: FormState = {
  name: "",
  categoryId: "none",
  shortDescription: "",
  description: "",
  thumbnailUrl: "",
  requirementsNote: "",
  orderCapacity: "",
  status: "draft",
};

function AdminLayanan() {
  const qc = useQueryClient();
  const canCreate = useCan("services.create");
  const canUpdate = useCan("services.update");
  const canDelete = useCan("services.delete");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "draft" | "published" | "archived">("all");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<FormState | null>(null);
  const [optionsTarget, setOptionsTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);

  const fetchItems = useServerFn(listAdminServices);
  const fetchCategories = useServerFn(listCategories);
  const save = useServerFn(saveService);
  const publish = useServerFn(setServiceStatus);
  const remove = useServerFn(deleteService);

  const { data, isPending, error } = useQuery({
    queryKey: ["admin-services", search, status, page],
    queryFn: () => fetchItems({ data: { search, status, page, pageSize: PAGE_SIZE } }),
  });
  const { data: categories } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => fetchCategories({}),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin-services"] });
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
    onError: (e: any) => toast.error(e?.message ?? "Gagal menyimpan layanan."),
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
    if (form.name.trim().length < 3) return toast.error("Nama layanan minimal 3 karakter.");
    saveMutation.mutate({
      id: form.id,
      name: form.name.trim(),
      categoryId: form.categoryId === "none" ? null : form.categoryId,
      shortDescription: form.shortDescription.trim(),
      description: form.description.trim(),
      thumbnailUrl: form.thumbnailUrl.trim(),
      requirementsNote: form.requirementsNote.trim(),
      orderCapacity: form.orderCapacity === "" ? null : Number(form.orderCapacity),
      status: form.status,
    });
  };

  const serviceCategories = (
    categories && !("forbidden" in categories && categories.forbidden)
      ? (categories as any).items
      : []
  ).filter((c: any) => c.kind === "service");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        crumb="Layanan Akademik"
        title="Layanan akademik"
        description="Kelola layanan akademik beserta paket harga dan add-on."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setCategoryOpen(true)}>
              <FolderTree className="mr-1 size-4" aria-hidden="true" />
              Kategori jasa
            </Button>
            {canCreate ? (
              <Button size="sm" onClick={() => setForm(emptyForm)}>
                <Plus className="mr-1 size-4" aria-hidden="true" />
                Layanan baru
              </Button>
            ) : null}
          </div>
        }
      />
      <CategoryManagerDialog kind="service" open={categoryOpen} onOpenChange={setCategoryOpen} />

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <Input
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value.slice(0, 120));
          }}
          placeholder="Cari nama layanan…"
          aria-label="Cari layanan"
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
        <EmptyRow message="Belum ada layanan yang cocok dengan filter ini." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paket</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((s: any) => {
                  const packages = s.service_packages ?? [];
                  const cheapest = packages.length
                    ? Math.min(...packages.map((p: any) => Number(p.price)))
                    : null;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="max-w-64">
                        <p className="truncate font-medium">{s.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{s.slug}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.status === "published" ? "default" : "secondary"}>
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {packages.length} paket
                        {cheapest !== null ? (
                          <span className="block text-xs">mulai {formatRupiah(cheapest)}</span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setOptionsTarget({ id: s.id, name: s.name })}
                          >
                            Paket
                          </Button>
                          {canUpdate ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  statusMutation.mutate({
                                    id: s.id,
                                    status: s.status === "published" ? "draft" : "published",
                                  })
                                }
                              >
                                {s.status === "published" ? "Unpublish" : "Publish"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Ubah ${s.name}`}
                                onClick={() =>
                                  setForm({
                                    id: s.id,
                                    name: s.name,
                                    categoryId: s.category_id ?? "none",
                                    shortDescription: s.short_description ?? "",
                                    description: s.description ?? "",
                                    thumbnailUrl: s.thumbnail_url ?? "",
                                    requirementsNote: s.requirements_note ?? "",
                                    orderCapacity:
                                      s.order_capacity != null ? String(s.order_capacity) : "",
                                    status: s.status,
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
                              aria-label={`Hapus ${s.name}`}
                              onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
                            >
                              <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
        </>
      )}

      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Ubah layanan" : "Layanan baru"}</DialogTitle>
          </DialogHeader>
          {form ? (
            <div className="space-y-4">
              <Field label="Nama layanan">
                <Input
                  value={form.name}
                  maxLength={120}
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
                    {serviceCategories.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Deskripsi singkat">
                <Input
                  value={form.shortDescription}
                  maxLength={240}
                  onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
                />
              </Field>
              <Field label="Deskripsi lengkap">
                <Textarea
                  value={form.description}
                  maxLength={5000}
                  rows={4}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
              <Field label="Catatan kebutuhan dari pelanggan">
                <Textarea
                  value={form.requirementsNote}
                  maxLength={2000}
                  rows={3}
                  onChange={(e) => setForm({ ...form, requirementsNote: e.target.value })}
                />
              </Field>
              <ImageUploader
                label="Gambar layanan"
                folder="services"
                value={form.thumbnailUrl}
                onChange={(v) => setForm({ ...form, thumbnailUrl: v })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Kapasitas order">
                  <Input
                    inputMode="numeric"
                    value={form.orderCapacity}
                    onChange={(e) =>
                      setForm({ ...form, orderCapacity: e.target.value.replace(/\D/g, "") })
                    }
                  />
                </Field>
              </div>
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
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Batal
            </Button>
            <Button onClick={submit} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ServiceOptionsDialog
        service={optionsTarget}
        canWrite={canUpdate}
        onOpenChange={(o) => !o && setOptionsTarget(null)}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus layanan?</AlertDialogTitle>
            <AlertDialogDescription>
              Layanan “{deleteTarget?.name}” akan diarsipkan (soft delete). Tindakan ini tercatat di
              audit log.
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
