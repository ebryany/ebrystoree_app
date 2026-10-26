import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  deleteServiceAddon,
  deleteServicePackage,
  listServiceOptions,
  saveServiceAddon,
  saveServicePackage,
} from "@/lib/admin.functions";
import { formatRupiah } from "@/lib/format";

type PackageForm = {
  id?: string;
  name: string;
  description: string;
  price: string;
  estimatedDays: string;
  freeRevisions: string;
  slaHours: string;
  priority: "normal" | "priority" | "express";
  isActive: boolean;
  sortOrder: string;
};

type AddonForm = {
  id?: string;
  name: string;
  description: string;
  price: string;
  isActive: boolean;
  sortOrder: string;
};

const emptyPackage: PackageForm = {
  name: "",
  description: "",
  price: "",
  estimatedDays: "1",
  freeRevisions: "0",
  slaHours: "",
  priority: "normal",
  isActive: true,
  sortOrder: "0",
};

const emptyAddon: AddonForm = { name: "", description: "", price: "", isActive: true, sortOrder: "0" };

const digits = (v: string) => v.replace(/\D/g, "");

export function ServiceOptionsDialog({
  service,
  onOpenChange,
  canWrite,
}: {
  service: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  canWrite: boolean;
}) {
  const qc = useQueryClient();
  const fetchOptions = useServerFn(listServiceOptions);
  const savePkg = useServerFn(saveServicePackage);
  const delPkg = useServerFn(deleteServicePackage);
  const saveAdd = useServerFn(saveServiceAddon);
  const delAdd = useServerFn(deleteServiceAddon);

  const [pkgForm, setPkgForm] = useState<PackageForm | null>(null);
  const [addonForm, setAddonForm] = useState<AddonForm | null>(null);

  const serviceId = service?.id ?? "";
  const { data, isPending } = useQuery({
    queryKey: ["admin-service-options", serviceId],
    queryFn: () => fetchOptions({ data: { serviceId } }),
    enabled: Boolean(serviceId),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-service-options", serviceId] });
    void qc.invalidateQueries({ queryKey: ["admin-services"] });
  };

  const handle = (res: any, onOk: () => void) => {
    if (res?.forbidden) return toast.error(`Izin ${res.permission} dibutuhkan.`);
    if (!res?.ok) return toast.error(res?.message ?? "Gagal menyimpan.");
    toast.success(res.message);
    onOk();
    refresh();
  };

  const pkgMutation = useMutation({
    mutationFn: (payload: any) => savePkg({ data: payload }),
    onSuccess: (res) => handle(res, () => setPkgForm(null)),
    onError: (e: any) => toast.error(e?.message ?? "Gagal menyimpan paket."),
  });
  const pkgDelete = useMutation({
    mutationFn: (id: string) => delPkg({ data: { id } }),
    onSuccess: (res) => handle(res, () => {}),
  });
  const addonMutation = useMutation({
    mutationFn: (payload: any) => saveAdd({ data: payload }),
    onSuccess: (res) => handle(res, () => setAddonForm(null)),
    onError: (e: any) => toast.error(e?.message ?? "Gagal menyimpan add-on."),
  });
  const addonDelete = useMutation({
    mutationFn: (id: string) => delAdd({ data: { id } }),
    onSuccess: (res) => handle(res, () => {}),
  });

  const submitPackage = () => {
    if (!pkgForm) return;
    if (pkgForm.name.trim().length < 2) return toast.error("Nama paket minimal 2 karakter.");
    if (pkgForm.price === "") return toast.error("Harga paket wajib diisi.");
    pkgMutation.mutate({
      id: pkgForm.id,
      serviceId,
      name: pkgForm.name.trim(),
      description: pkgForm.description.trim(),
      price: Number(pkgForm.price),
      estimatedDays: Math.max(1, Number(pkgForm.estimatedDays || "1")),
      freeRevisions: Number(pkgForm.freeRevisions || "0"),
      slaHours: pkgForm.slaHours === "" ? null : Number(pkgForm.slaHours),
      priority: pkgForm.priority,
      isActive: pkgForm.isActive,
      sortOrder: Number(pkgForm.sortOrder || "0"),
    });
  };

  const submitAddon = () => {
    if (!addonForm) return;
    if (addonForm.name.trim().length < 2) return toast.error("Nama add-on minimal 2 karakter.");
    if (addonForm.price === "") return toast.error("Harga add-on wajib diisi.");
    addonMutation.mutate({
      id: addonForm.id,
      serviceId,
      name: addonForm.name.trim(),
      description: addonForm.description.trim(),
      price: Number(addonForm.price),
      isActive: addonForm.isActive,
      sortOrder: Number(addonForm.sortOrder || "0"),
    });
  };

  const packages = (data as any)?.packages ?? [];
  const addons = (data as any)?.addons ?? [];

  return (
    <Dialog open={service !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Paket &amp; add-on</DialogTitle>
          <DialogDescription>{service?.name}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="packages">
          <TabsList className="w-full">
            <TabsTrigger value="packages" className="flex-1">
              Paket ({packages.length})
            </TabsTrigger>
            <TabsTrigger value="addons" className="flex-1">
              Add-on ({addons.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="packages" className="space-y-3 pt-3">
            {canWrite ? (
              <Button size="sm" variant="outline" onClick={() => setPkgForm({ ...emptyPackage })}>
                <Plus className="mr-1 size-4" aria-hidden="true" /> Paket baru
              </Button>
            ) : null}

            {isPending ? (
              <p className="text-sm text-muted-foreground">Memuat…</p>
            ) : packages.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                Belum ada paket. Layanan tanpa paket tidak bisa dipesan pelanggan.
              </p>
            ) : (
              <ul className="space-y-2">
                {packages.map((p: any) => (
                  <li key={p.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {p.name} {p.is_active ? null : <span className="text-xs text-muted-foreground">(nonaktif)</span>}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatRupiah(Number(p.price))} · {p.estimated_days} hari · {p.free_revisions} revisi ·{" "}
                          {p.priority}
                        </p>
                      </div>
                      {canWrite ? (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setPkgForm({
                                id: p.id,
                                name: p.name,
                                description: p.description ?? "",
                                price: String(p.price),
                                estimatedDays: String(p.estimated_days),
                                freeRevisions: String(p.free_revisions),
                                slaHours: p.sla_hours != null ? String(p.sla_hours) : "",
                                priority: p.priority,
                                isActive: p.is_active,
                                sortOrder: String(p.sort_order ?? 0),
                              })
                            }
                          >
                            Ubah
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Hapus paket ${p.name}`}
                            onClick={() => pkgDelete.mutate(p.id)}
                          >
                            <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {pkgForm ? (
              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="pkg-name">Nama paket</Label>
                    <Input
                      id="pkg-name"
                      value={pkgForm.name}
                      maxLength={120}
                      onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pkg-price">Harga (Rp)</Label>
                    <Input
                      id="pkg-price"
                      inputMode="numeric"
                      value={pkgForm.price}
                      onChange={(e) => setPkgForm({ ...pkgForm, price: digits(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pkg-desc">Deskripsi</Label>
                  <Textarea
                    id="pkg-desc"
                    rows={2}
                    maxLength={1000}
                    value={pkgForm.description}
                    onChange={(e) => setPkgForm({ ...pkgForm, description: e.target.value })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="pkg-days">Estimasi (hari)</Label>
                    <Input
                      id="pkg-days"
                      inputMode="numeric"
                      value={pkgForm.estimatedDays}
                      onChange={(e) => setPkgForm({ ...pkgForm, estimatedDays: digits(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pkg-rev">Revisi gratis</Label>
                    <Input
                      id="pkg-rev"
                      inputMode="numeric"
                      value={pkgForm.freeRevisions}
                      onChange={(e) => setPkgForm({ ...pkgForm, freeRevisions: digits(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pkg-sla">SLA (jam)</Label>
                    <Input
                      id="pkg-sla"
                      inputMode="numeric"
                      value={pkgForm.slaHours}
                      onChange={(e) => setPkgForm({ ...pkgForm, slaHours: digits(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pkg-sort">Urutan</Label>
                    <Input
                      id="pkg-sort"
                      inputMode="numeric"
                      value={pkgForm.sortOrder}
                      onChange={(e) => setPkgForm({ ...pkgForm, sortOrder: digits(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Prioritas</Label>
                    <Select
                      value={pkgForm.priority}
                      onValueChange={(v) => setPkgForm({ ...pkgForm, priority: v as PackageForm["priority"] })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="priority">Prioritas</SelectItem>
                        <SelectItem value="express">Express</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch
                      id="pkg-active"
                      checked={pkgForm.isActive}
                      onCheckedChange={(v) => setPkgForm({ ...pkgForm, isActive: v })}
                    />
                    <Label htmlFor="pkg-active">Aktif</Label>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPkgForm(null)}>
                    Batal
                  </Button>
                  <Button size="sm" onClick={submitPackage} disabled={pkgMutation.isPending}>
                    {pkgMutation.isPending ? "Menyimpan…" : "Simpan paket"}
                  </Button>
                </div>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="addons" className="space-y-3 pt-3">
            {canWrite ? (
              <Button size="sm" variant="outline" onClick={() => setAddonForm({ ...emptyAddon })}>
                <Plus className="mr-1 size-4" aria-hidden="true" /> Add-on baru
              </Button>
            ) : null}

            {addons.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                Belum ada add-on.
              </p>
            ) : (
              <ul className="space-y-2">
                {addons.map((a: any) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {a.name} {a.is_active ? null : <span className="text-xs text-muted-foreground">(nonaktif)</span>}
                      </p>
                      <p className="text-sm text-muted-foreground">{formatRupiah(Number(a.price))}</p>
                    </div>
                    {canWrite ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setAddonForm({
                              id: a.id,
                              name: a.name,
                              description: a.description ?? "",
                              price: String(a.price),
                              isActive: a.is_active,
                              sortOrder: String(a.sort_order ?? 0),
                            })
                          }
                        >
                          Ubah
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Hapus add-on ${a.name}`}
                          onClick={() => addonDelete.mutate(a.id)}
                        >
                          <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {addonForm ? (
              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="add-name">Nama add-on</Label>
                    <Input
                      id="add-name"
                      value={addonForm.name}
                      maxLength={120}
                      onChange={(e) => setAddonForm({ ...addonForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="add-price">Harga (Rp)</Label>
                    <Input
                      id="add-price"
                      inputMode="numeric"
                      value={addonForm.price}
                      onChange={(e) => setAddonForm({ ...addonForm, price: digits(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="add-desc">Deskripsi</Label>
                  <Textarea
                    id="add-desc"
                    rows={2}
                    maxLength={1000}
                    value={addonForm.description}
                    onChange={(e) => setAddonForm({ ...addonForm, description: e.target.value })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="add-sort">Urutan</Label>
                    <Input
                      id="add-sort"
                      inputMode="numeric"
                      value={addonForm.sortOrder}
                      onChange={(e) => setAddonForm({ ...addonForm, sortOrder: digits(e.target.value) })}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch
                      id="add-active"
                      checked={addonForm.isActive}
                      onCheckedChange={(v) => setAddonForm({ ...addonForm, isActive: v })}
                    />
                    <Label htmlFor="add-active">Aktif</Label>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAddonForm(null)}>
                    Batal
                  </Button>
                  <Button size="sm" onClick={submitAddon} disabled={addonMutation.isPending}>
                    {addonMutation.isPending ? "Menyimpan…" : "Simpan add-on"}
                  </Button>
                </div>
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
