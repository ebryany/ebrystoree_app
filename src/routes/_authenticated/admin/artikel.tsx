import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { ImageUploader } from "@/components/admin/image-uploader";
import { deleteArticle, listAdminArticles, saveArticle, setArticleStatus } from "@/lib/articles.functions";

export const Route = createFileRoute("/_authenticated/admin/artikel")({
  head: () => ({
    meta: [
      { title: "Kelola Artikel — Admin Ebrystore" },
      { name: "description", content: "Tulis, terbitkan, dan kelola artikel panduan Ebrystore." },
      { property: "og:title", content: "Kelola Artikel — Admin Ebrystore" },
      { property: "og:description", content: "Manajemen artikel dan panduan Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminArtikel,
});

const PAGE_SIZE = 10;

type FormState = {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverUrl: string;
  tags: string;
  status: "draft" | "published" | "archived";
};

const emptyForm: FormState = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  coverUrl: "",
  tags: "",
  status: "draft",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draf",
  published: "Terbit",
  archived: "Arsip",
};

function AdminArtikel() {
  const qc = useQueryClient();
  const canView = useCan("articles.view");
  const canCreate = useCan("articles.create");
  const canUpdate = useCan("articles.update");
  const canDelete = useCan("articles.delete");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "draft" | "published" | "archived">("all");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const fetchItems = useServerFn(listAdminArticles);
  const save = useServerFn(saveArticle);
  const publish = useServerFn(setArticleStatus);
  const remove = useServerFn(deleteArticle);

  const { data, isPending, error } = useQuery({
    queryKey: ["admin-articles", search, status, page],
    queryFn: () => fetchItems({ data: { search, status, page, pageSize: PAGE_SIZE } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-articles"] });
    qc.invalidateQueries({ queryKey: ["articles"] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: FormState) =>
      save({
        data: {
          id: payload.id,
          title: payload.title.trim(),
          slug: payload.slug.trim() || undefined,
          excerpt: payload.excerpt.trim() || undefined,
          content: payload.content.trim(),
          coverUrl: payload.coverUrl.trim() || undefined,
          tags: payload.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 6),
          status: payload.status,
        },
      }),
    onSuccess: (res: any) => {
      if (res?.forbidden) return toast.error("Anda tidak memiliki izin untuk aksi ini.");
      if (!res?.ok) return toast.error(res?.message ?? "Gagal menyimpan artikel.");
      toast.success(res.message);
      setForm(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal menyimpan artikel."),
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { id: string; status: "draft" | "published" | "archived" }) => publish({ data: payload }),
    onSuccess: (res: any) => {
      if (res?.forbidden) return toast.error("Anda tidak memiliki izin untuk aksi ini.");
      if (!res?.ok) return toast.error(res?.message ?? "Gagal mengubah status.");
      toast.success(res.message);
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: (res: any) => {
      if (res?.forbidden) return toast.error("Anda tidak memiliki izin untuk aksi ini.");
      if (!res?.ok) return toast.error(res?.message ?? "Gagal menghapus artikel.");
      toast.success(res.message);
      setDeleteTarget(null);
      invalidate();
    },
  });

  if (!canView) return <ForbiddenState permission="articles.view" />;
  if ((data as any)?.forbidden) return <ForbiddenState permission="articles.view" />;

  const items = ((data as any)?.items ?? []) as any[];
  const total = ((data as any)?.total ?? 0) as number;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        crumb="Konten"
        title="Artikel & Panduan"
        description="Tulis panduan singkat, terbitkan, lalu bagikan tautannya ke pelanggan."
        actions={
          canCreate ? (
            <Button onClick={() => setForm({ ...emptyForm })} className="press-scale">
              <Plus className="mr-2 size-4" aria-hidden="true" /> Artikel baru
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Cari judul artikel…"
          className="sm:max-w-xs"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as typeof status);
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            <SelectItem value="draft">Draf</SelectItem>
            <SelectItem value="published">Terbit</SelectItem>
            <SelectItem value="archived">Arsip</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <AdminLoading label="Memuat artikel…" />
      ) : error ? (
        <AdminError message="Daftar artikel tidak dapat dimuat." />
      ) : items.length === 0 ? (
        <EmptyRow message="Belum ada artikel. Mulai dari satu panduan singkat yang paling sering ditanyakan pelanggan." />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Judul</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Terbit</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">/{item.slug}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.status === "published" ? "default" : "secondary"}>
                        {STATUS_LABEL[item.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.published_at ? new Date(item.published_at).toLocaleDateString("id-ID") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {item.status === "published" ? (
                          <Button asChild size="icon" variant="ghost" title="Lihat publik">
                            <Link to="/artikel/$slug" params={{ slug: item.slug }} target="_blank">
                              <ExternalLink className="size-4" aria-hidden="true" />
                            </Link>
                          </Button>
                        ) : null}
                        {canUpdate ? (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              title={item.status === "published" ? "Jadikan draf" : "Terbitkan"}
                              onClick={() =>
                                statusMutation.mutate({
                                  id: item.id,
                                  status: item.status === "published" ? "draft" : "published",
                                })
                              }
                            >
                              {item.status === "published" ? (
                                <EyeOff className="size-4" aria-hidden="true" />
                              ) : (
                                <Eye className="size-4" aria-hidden="true" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Ubah"
                              onClick={() =>
                                setForm({
                                  id: item.id,
                                  title: item.title,
                                  slug: item.slug,
                                  excerpt: item.excerpt ?? "",
                                  content: item.content ?? "",
                                  coverUrl: item.cover_url ?? "",
                                  tags: (item.tags ?? []).join(", "),
                                  status: item.status,
                                })
                              }
                            >
                              <Pencil className="size-4" aria-hidden="true" />
                            </Button>
                          </>
                        ) : null}
                        {canDelete ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Hapus"
                            onClick={() => setDeleteTarget({ id: item.id, title: item.title })}
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

          <div className="grid gap-3 md:hidden">
            {items.map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.title}</p>
                    <p className="truncate text-xs text-muted-foreground">/{item.slug}</p>
                  </div>
                  <Badge variant={item.status === "published" ? "default" : "secondary"}>
                    {STATUS_LABEL[item.status]}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {canUpdate ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setForm({
                            id: item.id,
                            title: item.title,
                            slug: item.slug,
                            excerpt: item.excerpt ?? "",
                            content: item.content ?? "",
                            coverUrl: item.cover_url ?? "",
                            tags: (item.tags ?? []).join(", "),
                            status: item.status,
                          })
                        }
                      >
                        Ubah
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          statusMutation.mutate({
                            id: item.id,
                            status: item.status === "published" ? "draft" : "published",
                          })
                        }
                      >
                        {item.status === "published" ? "Jadikan draf" : "Terbitkan"}
                      </Button>
                    </>
                  ) : null}
                  {canDelete ? (
                    <Button size="sm" variant="ghost" onClick={() => setDeleteTarget({ id: item.id, title: item.title })}>
                      Hapus
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <Pager page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </>
      )}

      <Dialog open={Boolean(form)} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Ubah artikel" : "Artikel baru"}</DialogTitle>
          </DialogHeader>
          {form ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="a-title">Judul</Label>
                <Input
                  id="a-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Cara menyusun bab metodologi dalam 3 hari"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-excerpt">Ringkasan</Label>
                <Textarea
                  id="a-excerpt"
                  rows={2}
                  value={form.excerpt}
                  onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                  placeholder="Satu-dua kalimat yang muncul di kartu artikel dan pratinjau tautan."
                />
              </div>
              <ImageUploader
                value={form.coverUrl}
                onChange={(v) => setForm({ ...form, coverUrl: v })}
                folder="articles"
                label="Gambar sampul"
                hint="Rasio 16:9, maksimal 3 MB."
              />
              <div className="space-y-2">
                <Label htmlFor="a-content">Isi artikel</Label>
                <Textarea
                  id="a-content"
                  rows={14}
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder={"## Subjudul\n\nParagraf pembuka.\n\n- poin pertama\n- poin kedua\n\n> Catatan penting"}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Format didukung: ## subjudul, - daftar, 1. daftar bernomor, &gt; kutipan, **tebal**, *miring*, `kode`,
                  [tautan](https://…), --- pemisah.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="a-tags">Tag (pisahkan koma)</Label>
                  <Input
                    id="a-tags"
                    value={form.tags}
                    onChange={(e) => setForm({ ...form, tags: e.target.value })}
                    placeholder="skripsi, produktivitas"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v as FormState["status"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draf</SelectItem>
                      <SelectItem value="published">Terbit</SelectItem>
                      <SelectItem value="archived">Arsip</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Batal
            </Button>
            <Button
              disabled={saveMutation.isPending || !form?.title.trim() || form.content.trim().length < 20}
              onClick={() => form && saveMutation.mutate(form)}
            >
              {saveMutation.isPending ? "Menyimpan…" : "Simpan artikel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus artikel?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title}” akan diarsipkan dan tidak lagi tampil di halaman publik.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}