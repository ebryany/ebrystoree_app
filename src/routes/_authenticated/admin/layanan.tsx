import { cloneElement, isValidElement, useEffect, useId, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Archive,
  ExternalLink,
  FolderTree,
  ImageOff,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  Pager,
  SearchField,
  StatStrip,
  StatusTabs,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteService,
  getAdminServiceStats,
  listAdminServices,
  listCategories,
  saveService,
  setServiceStatus,
} from "@/lib/admin.functions";
import { ServiceOptionsDialog } from "@/components/admin/service-options-dialog";
import { CategoryManagerDialog } from "@/components/admin/category-manager-dialog";
import { formatRupiah } from "@/lib/format";
import { isRenderableImageUrl } from "@/lib/utils";
import { summarizeServicePackages } from "@/lib/admin-service-list";
import { isAcademicCategorySlug } from "@/lib/service-types";

export const Route = createFileRoute("/_authenticated/admin/layanan")({
  head: () => ({
    meta: [
      { title: "Manajemen Layanan — Admin Ebrystore" },
      {
        name: "description",
        content: "Kelola layanan, kategori, harga, publikasi, dan pesanan jasa Ebrystore.",
      },
      { property: "og:title", content: "Manajemen Layanan — Admin Ebrystore" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminLayanan,
});

const PAGE_SIZE = 10;

type ServiceStatus = "draft" | "published" | "archived";
type StatusFilter = "all" | ServiceStatus;
type SortKey = "updated_desc" | "created_desc" | "name_asc" | "name_desc";

const STATUS_LABEL: Record<ServiceStatus, string> = {
  draft: "Draft",
  published: "Aktif",
  archived: "Tidak aktif",
};

const SORT_LABEL: Record<SortKey, string> = {
  updated_desc: "Terakhir diubah",
  created_desc: "Terbaru dibuat",
  name_asc: "Nama A–Z",
  name_desc: "Nama Z–A",
};

type FormState = {
  id?: string;
  name: string;
  categoryId: string;
  shortDescription: string;
  description: string;
  thumbnailUrl: string;
  requirementsNote: string;
  orderCapacity: string;
  status: ServiceStatus;
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

const dateFmt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function AdminLayanan() {
  const qc = useQueryClient();
  const canCreate = useCan("services.create");
  const canUpdate = useCan("services.update");
  const canDelete = useCan("services.delete");

  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput.trim().slice(0, 120), 300);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("updated_desc");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<FormState | null>(null);
  const [optionsTarget, setOptionsTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);

  useEffect(() => setPage(1), [search, status, categoryId, sort]);

  const fetchItems = useServerFn(listAdminServices);
  const fetchStats = useServerFn(getAdminServiceStats);
  const fetchCategories = useServerFn(listCategories);
  const save = useServerFn(saveService);
  const publish = useServerFn(setServiceStatus);
  const remove = useServerFn(deleteService);

  const { data, isPending, error, isFetching } = useQuery({
    queryKey: ["admin-services", search, status, categoryId, sort, page],
    queryFn: () =>
      fetchItems({
        data: {
          search,
          status,
          categoryId: categoryId === "all" ? null : categoryId,
          sort,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
    placeholderData: keepPreviousData,
  });
  const stats = useQuery({
    queryKey: ["admin-services", "stats"],
    queryFn: () => fetchStats(),
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

  const handleResult = (res: any, after?: () => void) => {
    if (res?.forbidden) return toast.error(`Izin ${res.permission} dibutuhkan.`);
    if (!res?.ok) return toast.error(res?.message ?? "Aksi gagal.");
    toast.success(res.message);
    after?.();
    invalidate();
  };

  const saveMutation = useMutation({
    mutationFn: (payload: any) => save({ data: payload }),
    onSuccess: (res: any) => handleResult(res, () => setForm(null)),
    onError: (e: any) => toast.error(e?.message ?? "Gagal menyimpan layanan."),
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { id: string; status: ServiceStatus }) => publish({ data: payload }),
    onSuccess: (res: any) => handleResult(res),
    onError: () => toast.error("Status layanan gagal diubah."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: (res: any) => handleResult(res, () => setDeleteTarget(null)),
    onError: () => toast.error("Layanan gagal dihapus."),
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

  const serviceCategories: { id: string; name: string; slug?: string }[] = (
    categories && !("forbidden" in categories && categories.forbidden)
      ? (categories as any).items
      : []
  ).filter((c: any) => c.kind === "service");

  const openEdit = (s: any) =>
    setForm({
      id: s.id,
      name: s.name,
      categoryId: s.category_id ?? "none",
      shortDescription: s.short_description ?? "",
      description: s.description ?? "",
      thumbnailUrl: s.thumbnail_url ?? "",
      requirementsNote: s.requirements_note ?? "",
      orderCapacity: s.order_capacity != null ? String(s.order_capacity) : "",
      status: s.status,
    });

  const statsData =
    stats.data && !("forbidden" in stats.data && stats.data.forbidden) ? (stats.data as any) : null;
  const statValue = (v: number | null | undefined) =>
    stats.isPending ? "…" : v == null ? "—" : v.toLocaleString("id-ID");

  const actions: RowActions = {
    canUpdate,
    canDelete,
    busy: statusMutation.isPending,
    onEdit: openEdit,
    onPackages: (s) => setOptionsTarget({ id: s.id, name: s.name }),
    onStatus: (s, next) => statusMutation.mutate({ id: s.id, status: next }),
    onDelete: (s) => setDeleteTarget({ id: s.id, name: s.name }),
  };

  return (
    <div className="min-w-0 space-y-5">
      <AdminPageHeader
        crumb="Layanan"
        title="Manajemen Layanan"
        description="Kelola layanan, kategori, harga, publikasi, dan pesanan jasa Ebrystore."
        actions={
          canCreate ? (
            <Button className="min-h-11" onClick={() => setForm(emptyForm)}>
              <Plus className="mr-1 size-4" aria-hidden="true" />
              Tambah Layanan
            </Button>
          ) : null
        }
      />

      {stats.error || (stats.data as any)?.forbidden ? null : (
        <StatStrip
          items={[
            { label: "Total layanan", value: statValue(statsData?.total) },
            { label: "Aktif", value: statValue(statsData?.published), tone: "success" },
            { label: "Draft", value: statValue(statsData?.draft) },
            {
              label: "Menunggu moderasi",
              value: statValue(statsData?.pendingModeration),
              tone: statsData?.pendingModeration ? "warning" : "neutral",
              hint: "Jasa seller",
            },
            { label: "Tidak aktif", value: statValue(statsData?.archived) },
          ]}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="min-h-11" onClick={() => setCategoryOpen(true)}>
          <FolderTree className="mr-1 size-4" aria-hidden="true" />
          Kelola kategori
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link to="/admin/seller/jasa">Moderasi jasa seller</Link>
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link to="/admin/pengerjaan">Pesanan jasa</Link>
        </Button>
      </div>
      <CategoryManagerDialog kind="service" open={categoryOpen} onOpenChange={setCategoryOpen} />

      <section aria-label="Daftar layanan" className="space-y-3">
        <StatusTabs
          label="Filter status"
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          options={[
            { value: "all", label: "Semua" },
            { value: "published", label: "Aktif" },
            { value: "draft", label: "Draft" },
            { value: "archived", label: "Tidak aktif" },
          ]}
        />
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px_180px]">
          <SearchField
            id="admin-service-search"
            label="Cari layanan"
            placeholder="Cari nama layanan…"
            value={searchInput}
            onChange={setSearchInput}
          />
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="min-h-11 bg-card" aria-label="Filter kategori">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua kategori</SelectItem>
              {serviceCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="min-h-11 bg-card" aria-label="Urutkan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {SORT_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isPending ? (
          <AdminLoading label="Memuat layanan…" />
        ) : error ? (
          <AdminError message="Daftar layanan tidak dapat dimuat. Muat ulang halaman." />
        ) : data.forbidden ? (
          <ForbiddenState permission={data.permission} />
        ) : data.error ? (
          <AdminError message={data.error} />
        ) : data.items.length === 0 ? (
          <EmptyRow
            message={
              search || status !== "all" || categoryId !== "all"
                ? "Tidak ada layanan yang cocok dengan filter ini."
                : "Belum ada layanan. Tambahkan layanan pertama."
            }
          />
        ) : (
          <div className={isFetching ? "opacity-70 transition-opacity" : undefined}>
            <ul className="space-y-2 md:hidden">
              {data.items.map((s: any) => (
                <li key={s.id}>
                  <ServiceCard service={s} actions={actions} />
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Layanan</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Harga</TableHead>
                    <TableHead>Estimasi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Diubah</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((s: any) => {
                    const sum = summarizeServicePackages(s.service_packages);
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="max-w-72">
                          <div className="flex min-w-0 items-center gap-3">
                            <Thumb url={s.thumbnail_url} />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{s.name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {sum.activeCount} paket aktif
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{s.category?.name ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          <PriceText sum={sum} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          <EstimateText sum={sum} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={s.status} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {dateFmt.format(new Date(s.updated_at))}
                        </TableCell>
                        <TableCell className="text-right">
                          <RowMenu service={s} actions={actions} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
          </div>
        )}
      </section>

      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Ubah layanan" : "Tambah layanan"}</DialogTitle>
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
                    {serviceCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {isAcademicCategorySlug(
                    serviceCategories.find((c) => c.id === form.categoryId)?.slug,
                  )
                    ? "Formulir pemesanan: Akademik (data tugas, tenggat kampus, pernyataan integritas)."
                    : "Formulir pemesanan: Jasa umum (brief proyek, referensi, lampiran)."}
                </p>
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
                <Field label="Status">
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v as ServiceStatus })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Aktif</SelectItem>
                      <SelectItem value="archived">Tidak aktif</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">
                Harga dan estimasi diatur per paket lewat menu “Paket & harga”.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setForm(null)}>
              Batal
            </Button>
            <Button className="min-h-11" onClick={submit} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ServiceOptionsDialog
        service={optionsTarget}
        canWrite={canUpdate}
        onOpenChange={(o) => {
          if (!o) {
            setOptionsTarget(null);
            invalidate();
          }
        }}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus layanan?</AlertDialogTitle>
            <AlertDialogDescription>
              Layanan “{deleteTarget?.name}” disembunyikan dari katalog dan admin (soft delete).
              Pesanan lama tetap tersimpan. Tindakan ini tercatat di audit log.
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

type Summary = ReturnType<typeof summarizeServicePackages>;

type RowActions = {
  canUpdate: boolean;
  canDelete: boolean;
  busy: boolean;
  onEdit: (s: any) => void;
  onPackages: (s: any) => void;
  onStatus: (s: any, next: ServiceStatus) => void;
  onDelete: (s: any) => void;
};

function StatusBadge({ status }: { status: ServiceStatus }) {
  return (
    <Badge variant={status === "published" ? "default" : "secondary"} className="whitespace-nowrap">
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

function PriceText({ sum }: { sum: Summary }) {
  if (sum.minPrice === null) return <span className="text-muted-foreground">Belum ada paket</span>;
  if (sum.minPrice === sum.maxPrice) return <span>{formatRupiah(sum.minPrice)}</span>;
  return <span>Mulai {formatRupiah(sum.minPrice)}</span>;
}

function EstimateText({ sum }: { sum: Summary }) {
  if (sum.minDays === null) return <>—</>;
  if (sum.minDays === sum.maxDays) return <>{sum.minDays} hari</>;
  return (
    <>
      {sum.minDays}–{sum.maxDays} hari
    </>
  );
}

function Thumb({ url }: { url: string | null }) {
  return isRenderableImageUrl(url) ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      className="size-11 shrink-0 rounded-lg border border-border object-cover"
    />
  ) : (
    <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-border bg-muted text-muted-foreground">
      <ImageOff className="size-4" aria-hidden="true" />
    </span>
  );
}

function ServiceCard({ service: s, actions }: { service: any; actions: RowActions }) {
  const sum = summarizeServicePackages(s.service_packages);
  return (
    <article className="flex min-w-0 gap-3 rounded-xl border border-border bg-card p-3">
      <Thumb url={s.thumbnail_url} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 break-words text-sm font-semibold leading-snug">{s.name}</h3>
          <RowMenu service={s} actions={actions} />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <StatusBadge status={s.status} />
          <span className="truncate">{s.category?.name ?? "Tanpa kategori"}</span>
        </div>
        <p className="text-sm font-medium">
          <PriceText sum={sum} />
          {sum.minDays !== null ? (
            <span className="font-normal text-muted-foreground">
              {" "}
              · <EstimateText sum={sum} />
            </span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {sum.activeCount} paket aktif · diubah {dateFmt.format(new Date(s.updated_at))}
        </p>
      </div>
    </article>
  );
}

function RowMenu({ service: s, actions }: { service: any; actions: RowActions }) {
  const status = s.status as ServiceStatus;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label={`Aksi untuk ${s.name}`}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {actions.canUpdate ? (
          <DropdownMenuItem className="min-h-11" onSelect={() => actions.onEdit(s)}>
            <Pencil className="mr-2 size-4" aria-hidden="true" />
            Ubah detail
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem className="min-h-11" onSelect={() => actions.onPackages(s)}>
          <Package className="mr-2 size-4" aria-hidden="true" />
          Paket & harga
        </DropdownMenuItem>
        {status === "published" ? (
          <DropdownMenuItem asChild className="min-h-11">
            <a href={`/layanan/${s.slug}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 size-4" aria-hidden="true" />
              Lihat halaman publik
            </a>
          </DropdownMenuItem>
        ) : null}
        {actions.canUpdate ? (
          <>
            <DropdownMenuSeparator />
            {status !== "published" ? (
              <DropdownMenuItem
                className="min-h-11"
                disabled={actions.busy}
                onSelect={() => actions.onStatus(s, "published")}
              >
                <Upload className="mr-2 size-4" aria-hidden="true" />
                Publikasikan
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="min-h-11"
                disabled={actions.busy}
                onSelect={() => actions.onStatus(s, "draft")}
              >
                <Undo2 className="mr-2 size-4" aria-hidden="true" />
                Jadikan draft
              </DropdownMenuItem>
            )}
            {status !== "archived" ? (
              <DropdownMenuItem
                className="min-h-11"
                disabled={actions.busy}
                onSelect={() => actions.onStatus(s, "archived")}
              >
                <Archive className="mr-2 size-4" aria-hidden="true" />
                Nonaktifkan
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
        {actions.canDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="min-h-11 text-destructive focus:text-destructive"
              onSelect={() => actions.onDelete(s)}
            >
              <Trash2 className="mr-2 size-4" aria-hidden="true" />
              Hapus
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
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
