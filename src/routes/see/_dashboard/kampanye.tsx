import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Copy,
  Loader2,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { AdminError, AdminLoading, useCan } from "@/components/admin/admin-ui";
import { EmptyWell, SectionCard, StatusPill } from "@/components/growth/primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { getAttribution, listCampaigns } from "@/lib/growth.functions";
import { createCampaign } from "@/lib/campaigns.functions";
import { deleteCampaign, setCampaignStatus } from "@/lib/growth-actions.functions";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/see/_dashboard/kampanye")({
  component: CampaignWorkspace,
});

/**
 * Ruang kerja Kampanye.
 *
 * Bentuk halaman mengikuti pekerjaannya: tabel kampanye adalah konten utama,
 * karena tugas harian di sini adalah memantau dan menyesuaikan yang sudah ada.
 * Pembuatan dan pengubahan dilakukan di dialog supaya tabel tetap padat.
 */

const CHANNELS = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "google", label: "Google" },
  { value: "email", label: "Email" },
  { value: "lainnya", label: "Lainnya" },
];

const STATUS_LABEL: Record<string, string> = {
  draft: "Draf",
  active: "Aktif",
  paused: "Dijeda",
  finished: "Selesai",
};

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "accent"> = {
  draft: "neutral",
  active: "success",
  paused: "warning",
  finished: "neutral",
};

type Campaign = {
  id: string;
  name: string;
  channel: string;
  status: string;
  utm_source: string;
  utm_medium: string | null;
  utm_campaign: string;
  kunjungan: number;
  pengunjung: number;
  order: number;
};

type FormState = {
  id?: string;
  name: string;
  channel: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  status: "draft" | "active" | "paused" | "finished";
};

const EMPTY_FORM: FormState = {
  name: "",
  channel: "instagram",
  utmSource: "instagram",
  utmMedium: "social",
  utmCampaign: "",
  status: "active",
};

function buildUtmLink(form: FormState): string {
  if (!form.utmSource || !form.utmCampaign) return "";
  const origin = typeof window !== "undefined" ? window.location.origin : "https://ebrystore.my.id";
  const params = new URLSearchParams({ utm_source: form.utmSource });
  if (form.utmMedium) params.set("utm_medium", form.utmMedium);
  params.set("utm_campaign", form.utmCampaign);
  return `${origin}/?${params.toString()}`;
}

function CampaignWorkspace() {
  const queryClient = useQueryClient();
  const canWrite = useCan("admin.dashboard.view");

  const fetchCampaigns = useServerFn(listCampaigns);
  const fetchAttribution = useServerFn(getAttribution);
  const saveNew = useServerFn(createCampaign);
  const saveStatus = useServerFn(setCampaignStatus);
  const removeCampaign = useServerFn(deleteCampaign);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [form, setForm] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);

  const campaigns = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => fetchCampaigns({}),
    staleTime: 30_000,
  });
  const attribution = useQuery({
    queryKey: ["attribution", 30],
    queryFn: () => fetchAttribution({ data: { days: 30 } }),
    staleTime: 60_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    void queryClient.invalidateQueries({ queryKey: ["attribution"] });
    void queryClient.invalidateQueries({ queryKey: ["growth-summary"] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: FormState) =>
      saveNew({
        data: {
          name: payload.name.trim(),
          channel: payload.channel,
          utmSource: payload.utmSource.trim(),
          utmMedium: payload.utmMedium.trim() || undefined,
          utmCampaign: payload.utmCampaign.trim(),
        },
      }),
    onSuccess: (res: any) => {
      if (!res?.ok) return toast.error(res?.error ?? "Kampanye gagal disimpan.");
      toast.success("Kampanye dibuat.");
      setForm(null);
      invalidate();
    },
    onError: () => toast.error("Kampanye gagal disimpan."),
  });

  const statusMutation = useMutation({
    mutationFn: (payload: FormState & { id: string }) =>
      saveStatus({
        data: {
          id: payload.id,
          name: payload.name.trim(),
          channel: payload.channel,
          utmSource: payload.utmSource.trim(),
          utmMedium: payload.utmMedium.trim() || undefined,
          utmCampaign: payload.utmCampaign.trim(),
          status: payload.status,
        },
      }),
    onSuccess: (res: any) => {
      if (!res?.ok) return toast.error(res?.error ?? "Kampanye gagal diubah.");
      toast.success("Kampanye diperbarui.");
      setForm(null);
      invalidate();
    },
    onError: () => toast.error("Kampanye gagal diubah."),
  });

  const quickStatusMutation = useMutation({
    mutationFn: (payload: { campaign: Campaign; status: FormState["status"] }) =>
      saveStatus({
        data: {
          id: payload.campaign.id,
          name: payload.campaign.name,
          channel: payload.campaign.channel,
          utmSource: payload.campaign.utm_source,
          utmMedium: payload.campaign.utm_medium ?? undefined,
          utmCampaign: payload.campaign.utm_campaign,
          status: payload.status,
        },
      }),
    onSuccess: (res: any) => {
      if (!res?.ok) return toast.error(res?.error ?? "Status gagal diubah.");
      toast.success("Status kampanye diperbarui.");
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeCampaign({ data: { id } }),
    onSuccess: (res: any) => {
      if (!res?.ok) return toast.error(res?.error ?? "Kampanye gagal dihapus.");
      toast.success("Kampanye dihapus.");
      setDeleteTarget(null);
      invalidate();
    },
  });

  const items = useMemo(
    () => ((campaigns.data as any)?.items ?? []) as Campaign[],
    [campaigns.data],
  );
  const attr = (attribution.data as any)?.result;
  const perSumber = (attr?.per_sumber ?? []) as Array<{
    sumber: string;
    order: number;
    nilai: number;
  }>;

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("id");
    return items.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!term) return true;
      return (
        c.name.toLocaleLowerCase("id").includes(term) ||
        c.utm_source.toLocaleLowerCase("id").includes(term) ||
        c.utm_campaign.toLocaleLowerCase("id").includes(term)
      );
    });
  }, [items, search, statusFilter]);

  if (campaigns.isPending || attribution.isPending) {
    return <AdminLoading label="Memuat kampanye…" />;
  }
  if (campaigns.error || attribution.error) {
    return <AdminError message="Data kampanye tidak dapat dimuat." />;
  }

  const totalVisits = items.reduce((s, c) => s + Number(c.kunjungan ?? 0), 0);
  const totalOrders = items.reduce((s, c) => s + Number(c.order ?? 0), 0);
  const totalValue = perSumber.reduce((s, x) => s + Number(x.nilai ?? 0), 0);
  const activeCount = items.filter((c) => c.status === "active").length;

  return (
    <div className="space-y-5">
      {/* Strip ringkas: satu baris, bukan empat kartu besar */}
      <dl className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-border bg-card px-4 py-3.5 sm:px-5">
        {[
          { label: "Kampanye", value: String(items.length) },
          { label: "Aktif", value: String(activeCount) },
          { label: "Kunjungan", value: totalVisits.toLocaleString("id-ID") },
          { label: "Order", value: totalOrders.toLocaleString("id-ID") },
          { label: "Nilai order", value: formatRupiah(totalValue) },
        ].map((s) => (
          <div key={s.label} className="flex items-baseline gap-2">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="tabular-nums text-sm font-semibold text-foreground">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Konten utama: tabel kampanye */}
        <section className="min-w-0 rounded-xl border border-border bg-card">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama atau UTM…"
                  className="min-h-11 pl-9"
                  aria-label="Cari kampanye"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="min-h-11 w-full sm:w-36" aria-label="Filter status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua status</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="paused">Dijeda</SelectItem>
                  <SelectItem value="draft">Draf</SelectItem>
                  <SelectItem value="finished">Selesai</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {canWrite ? (
              <Button className="min-h-11 shrink-0" onClick={() => setForm({ ...EMPTY_FORM })}>
                <Plus className="mr-1.5 size-4" aria-hidden="true" />
                Kampanye baru
              </Button>
            ) : null}
          </header>

          {items.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyWell>
                Belum ada kampanye. Buat satu kampanye, sebarkan tautan ber-UTM-nya, lalu kunjungan
                dan ordernya terhitung di sini.
              </EmptyWell>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 sm:p-5">
              <EmptyWell>
                Tidak ada kampanye yang cocok dengan pencarian. Coba kata kunci atau filter lain.
              </EmptyWell>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-0">Kampanye</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                    <TableHead className="w-24 text-right">Kunjungan</TableHead>
                    <TableHead className="hidden w-24 text-right lg:table-cell">
                      Pengunjung
                    </TableHead>
                    <TableHead className="w-20 text-right">Order</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => {
                    const konversi =
                      Number(c.kunjungan) > 0
                        ? Math.round((Number(c.order) / Number(c.kunjungan)) * 100)
                        : 0;
                    const link = buildUtmLink({
                      name: c.name,
                      channel: c.channel,
                      utmSource: c.utm_source,
                      utmMedium: c.utm_medium ?? "",
                      utmCampaign: c.utm_campaign,
                      status: c.status as FormState["status"],
                    });
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="min-w-0">
                          <span
                            className="block truncate font-medium text-foreground"
                            title={c.name}
                          >
                            {c.name}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                            {c.utm_source} / {c.utm_campaign}
                          </span>
                        </TableCell>
                        <TableCell>
                          {canWrite ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                  aria-label={`Ubah status ${c.name}`}
                                >
                                  <StatusPill tone={STATUS_TONE[c.status] ?? "neutral"}>
                                    {STATUS_LABEL[c.status] ?? c.status}
                                  </StatusPill>
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                <DropdownMenuLabel className="text-xs text-muted-foreground">
                                  Ubah status
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {(["active", "paused", "draft", "finished"] as const).map((s) => (
                                  <DropdownMenuItem
                                    key={s}
                                    className="min-h-11"
                                    disabled={c.status === s || quickStatusMutation.isPending}
                                    onSelect={() =>
                                      quickStatusMutation.mutate({ campaign: c, status: s })
                                    }
                                  >
                                    {STATUS_LABEL[s]}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <StatusPill tone={STATUS_TONE[c.status] ?? "neutral"}>
                              {STATUS_LABEL[c.status] ?? c.status}
                            </StatusPill>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(c.kunjungan ?? 0).toLocaleString("id-ID")}
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {konversi}% order
                          </span>
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums lg:table-cell">
                          {Number(c.pengunjung ?? 0).toLocaleString("id-ID")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {Number(c.order ?? 0).toLocaleString("id-ID")}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-9"
                                aria-label={`Aksi untuk ${c.name}`}
                              >
                                <MoreHorizontal className="size-4" aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem
                                className="min-h-11"
                                disabled={!link}
                                onSelect={() => {
                                  if (!link) return;
                                  void navigator.clipboard
                                    .writeText(link)
                                    .then(() => toast.success("Tautan disalin."))
                                    .catch(() => toast.error("Gagal menyalin tautan."));
                                }}
                              >
                                <Copy className="mr-2 size-4" aria-hidden="true" />
                                Salin tautan UTM
                              </DropdownMenuItem>
                              {canWrite ? (
                                <>
                                  <DropdownMenuItem
                                    className="min-h-11"
                                    onSelect={() =>
                                      setForm({
                                        id: c.id,
                                        name: c.name,
                                        channel: c.channel,
                                        utmSource: c.utm_source,
                                        utmMedium: c.utm_medium ?? "",
                                        utmCampaign: c.utm_campaign,
                                        status: c.status as FormState["status"],
                                      })
                                    }
                                  >
                                    <Pencil className="mr-2 size-4" aria-hidden="true" />
                                    Ubah kampanye
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="min-h-11 text-destructive focus:text-destructive"
                                    onSelect={() => setDeleteTarget(c)}
                                  >
                                    <Trash2 className="mr-2 size-4" aria-hidden="true" />
                                    Hapus kampanye
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {items.length > 0 ? (
            <p className="flex items-center gap-1.5 border-t border-border px-4 py-3 text-[11px] text-muted-foreground sm:px-5">
              <Megaphone className="size-3.5 shrink-0" aria-hidden="true" />
              Kunjungan dihitung dari parameter UTM yang benar-benar masuk ke sistem. Menghapus
              kampanye tidak menghapus riwayat kunjungannya.
            </p>
          ) : null}
        </section>

        {/* Rel samping: atribusi, kanal mana yang menghasilkan uang */}
        <aside className="min-w-0 space-y-5">
          <SectionCard
            title="Kanal mana yang menghasilkan order?"
            description="Atribusi order 30 hari terakhir."
          >
            {perSumber.length === 0 ? (
              <EmptyWell>Belum ada order dalam periode ini.</EmptyWell>
            ) : (
              <ul className="space-y-3">
                {perSumber.map((s) => (
                  <li key={s.sumber} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-sm text-foreground">{s.sumber}</span>
                      <span className="shrink-0 tabular-nums text-sm font-semibold text-foreground">
                        {formatRupiah(Number(s.nilai))}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {Number(s.order).toLocaleString("id-ID")} order
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {attr?.batas_metode ? (
              <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
                {attr.batas_metode}
              </p>
            ) : null}
          </SectionCard>
        </aside>
      </div>

      {/* Dialog buat / ubah kampanye */}
      <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Ubah kampanye" : "Kampanye baru"}</DialogTitle>
            <DialogDescription>
              Kampanye memberi tautan ber-UTM supaya kunjungan bisa dilacak sampai jadi order.
            </DialogDescription>
          </DialogHeader>

          {form ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="camp-name">Nama kampanye</Label>
                <Input
                  id="camp-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Promo Ramadan"
                  className="min-h-11"
                  maxLength={120}
                  autoFocus
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="camp-channel">Kanal</Label>
                  <Select
                    value={form.channel}
                    onValueChange={(v) =>
                      setForm((f) => (f ? { ...f, channel: v, utmSource: v } : f))
                    }
                  >
                    <SelectTrigger id="camp-channel" className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="camp-status">Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) =>
                      setForm((f) => (f ? { ...f, status: v as FormState["status"] } : f))
                    }
                  >
                    <SelectTrigger id="camp-status" className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Aktif</SelectItem>
                      <SelectItem value="paused">Dijeda</SelectItem>
                      <SelectItem value="draft">Draf</SelectItem>
                      <SelectItem value="finished">Selesai</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="camp-source">utm_source</Label>
                  <Input
                    id="camp-source"
                    value={form.utmSource}
                    onChange={(e) => setForm({ ...form, utmSource: e.target.value })}
                    className="min-h-11 font-mono text-sm"
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="camp-medium">utm_medium</Label>
                  <Input
                    id="camp-medium"
                    value={form.utmMedium}
                    onChange={(e) => setForm({ ...form, utmMedium: e.target.value })}
                    className="min-h-11 font-mono text-sm"
                    maxLength={120}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="camp-campaign">utm_campaign</Label>
                <Input
                  id="camp-campaign"
                  value={form.utmCampaign}
                  onChange={(e) => setForm({ ...form, utmCampaign: e.target.value })}
                  placeholder="ramadan2026"
                  className="min-h-11 font-mono text-sm"
                  maxLength={120}
                />
              </div>

              {buildUtmLink(form) ? (
                <div className="space-y-1.5 rounded-lg border border-border bg-surface p-3">
                  <Label className="text-xs text-muted-foreground">Tautan siap pakai</Label>
                  <p className="break-all font-mono text-[11px] leading-relaxed text-foreground">
                    {buildUtmLink(form)}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11 w-full"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(buildUtmLink(form))
                        .then(() => toast.success("Tautan disalin."))
                        .catch(() => toast.error("Gagal menyalin."));
                    }}
                  >
                    <Copy className="mr-1.5 size-4" aria-hidden="true" />
                    Salin tautan
                  </Button>
                </div>
              ) : (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Isi utm_source dan utm_campaign untuk melihat tautan siap pakai.
                </p>
              )}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setForm(null)}>
              Batal
            </Button>
            <Button
              className="min-h-11"
              disabled={
                !form ||
                createMutation.isPending ||
                statusMutation.isPending ||
                !form.name.trim() ||
                !form.utmSource.trim() ||
                !form.utmCampaign.trim()
              }
              onClick={() => {
                if (!form) return;
                if (form.id) statusMutation.mutate(form as FormState & { id: string });
                else createMutation.mutate(form);
              }}
            >
              {createMutation.isPending || statusMutation.isPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {form?.id ? "Simpan perubahan" : "Simpan kampanye"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Konfirmasi hapus */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus kampanye ini?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" akan dihapus dari daftar. Riwayat kunjungan dan ordernya tetap
              tersimpan, tapi definisi kampanyenya tidak bisa dikembalikan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Batal</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? "Menghapus…" : "Hapus kampanye"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
