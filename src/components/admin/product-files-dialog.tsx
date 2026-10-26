import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Lock, Package, Trash2, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  createProductFileUpload,
  deleteProductFile,
  listProductFiles,
  registerProductFile,
  setProductFileActive,
  setProductDeliveryMode,
} from "@/lib/product-files.functions";

type Props = {
  product: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
};

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return "-";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ProductFilesDialog({ product, onOpenChange }: Props) {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState("v1");
  const [busy, setBusy] = useState(false);

  const fetchFiles = useServerFn(listProductFiles);
  const prepare = useServerFn(createProductFileUpload);
  const register = useServerFn(registerProductFile);
  const toggle = useServerFn(setProductFileActive);
  const remove = useServerFn(deleteProductFile);
  const setMode = useServerFn(setProductDeliveryMode);

  const productId = product?.id ?? null;
  const { data, isPending } = useQuery({
    queryKey: ["product-files", productId],
    queryFn: () => fetchFiles({ data: { productId: productId! } }),
    enabled: Boolean(productId),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["product-files", productId] });

  const deliveryMode: "shared" | "unique" = (data as any)?.deliveryMode ?? "shared";
  const availableStock: number = Number((data as any)?.availableStock ?? 0);
  const unique = deliveryMode === "unique";

  const modeMutation = useMutation({
    mutationFn: (mode: "shared" | "unique") => setMode({ data: { productId: productId!, mode } }),
    onSuccess: (res: any) => {
      if (res?.forbidden) return toast.error(`Izin ${res.permission} dibutuhkan.`);
      if (!res.ok) return toast.error(res.message);
      toast.success(res.message);
      invalidate();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (payload: { fileId: string; isActive: boolean }) => toggle({ data: payload }),
    onSuccess: (res: any) => {
      if (res?.forbidden) return toast.error(`Izin ${res.permission} dibutuhkan.`);
      if (!res.ok) return toast.error(res.message);
      toast.success(res.message);
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => remove({ data: { fileId } }),
    onSuccess: (res: any) => {
      if (res?.forbidden) return toast.error(`Izin ${res.permission} dibutuhkan.`);
      if (!res.ok) return toast.error(res.message);
      toast.success(res.message);
      invalidate();
    },
  });

  async function handleUpload() {
    const files = Array.from(fileInput.current?.files ?? []);
    if (!productId || files.length === 0) return toast.error("Pilih berkas terlebih dahulu.");
    if (version.trim().length < 1) return toast.error("Versi wajib diisi.");

    setBusy(true);
    try {
      let success = 0;
      for (const file of files) {
        const prep: any = await prepare({
          data: { productId, filename: file.name, sizeBytes: file.size },
        });
        if (prep?.forbidden) {
          toast.error(`Izin ${prep.permission} dibutuhkan.`);
          break;
        }
        if (!prep.ok) {
          toast.error(`${file.name}: ${prep.message}`);
          continue;
        }

        const { error } = await supabase.storage.from(prep.bucket).uploadToSignedUrl(prep.path, prep.token, file);
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
        if (res?.forbidden) {
          toast.error(`Izin ${res.permission} dibutuhkan.`);
          break;
        }
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

  const items: any[] = data && !(data as any).forbidden ? ((data as any).items ?? []) : [];

  return (
    <Dialog open={product !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Berkas master — {product?.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Mode pengiriman</p>
              <p className="text-xs text-muted-foreground">
                {unique
                  ? "Stok unik: setiap pembeli mendapat satu berkas berbeda dan produk habis saat stok nol."
                  : "Berkas bersama: semua pembeli mengunduh berkas versi aktif yang sama."}
              </p>
            </div>
            {unique ? (
              <Badge variant={availableStock > 0 ? "secondary" : "destructive"} className="shrink-0 gap-1">
                <Package className="size-3" aria-hidden="true" />
                Stok {availableStock}
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={unique ? "outline" : "default"}
              disabled={modeMutation.isPending}
              onClick={() => modeMutation.mutate("shared")}
            >
              Berkas bersama
            </Button>
            <Button
              size="sm"
              variant={unique ? "default" : "outline"}
              disabled={modeMutation.isPending}
              onClick={() => modeMutation.mutate("unique")}
            >
              Stok unik per pembeli
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-border p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <div className="space-y-1.5">
              <Label htmlFor="product-file">Berkas produk</Label>
              <Input id="product-file" type="file" multiple ref={fileInput} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-version">Versi</Label>
              <Input
                id="product-version"
                value={version}
                maxLength={40}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {unique
              ? "Setiap berkas yang diunggah menjadi satu slot stok. Pilih banyak berkas sekaligus untuk menambah stok."
              : "Berkas disimpan di bucket privat dan hanya dapat diunduh lewat tautan bertanda tangan milik pembeli."}
          </p>
          <Button onClick={handleUpload} disabled={busy} size="sm">
            <UploadCloud className="mr-1 size-4" aria-hidden="true" />
            {busy ? "Mengunggah…" : unique ? "Unggah & tambah stok" : "Unggah & jadikan versi aktif"}
          </Button>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{unique ? "Daftar stok berkas" : "Histori versi"}</h3>
          {isPending ? (
            <p className="text-sm text-muted-foreground">Memuat…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada berkas. Produk belum dapat dikirim ke pembeli.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{f.original_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.version} · {formatSize(f.size_bytes)} · {new Date(f.created_at).toLocaleDateString("id-ID")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {f.assigned_entitlement_id ? (
                      <Badge variant="outline">
                        <Lock className="mr-1 size-3" aria-hidden="true" />
                        Milik pembeli
                      </Badge>
                    ) : unique ? (
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
                        onClick={() => deleteMutation.mutate(f.id)}
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
      </DialogContent>
    </Dialog>
  );
}
