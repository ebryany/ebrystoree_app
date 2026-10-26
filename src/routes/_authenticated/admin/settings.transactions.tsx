import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { AdminError, AdminLoading, AdminPageHeader, EmptyRow, ForbiddenState, useCan } from "@/components/admin/admin-ui";
import { DetailCard, formatDateTime } from "@/components/admin/tx-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listSettings, updateSetting } from "@/lib/admin-transaction.functions";

export const Route = createFileRoute("/_authenticated/admin/settings/transactions")({
  head: () => ({
    meta: [
      { title: "Pengaturan Transaksi — Admin Ebrystore" },
      { name: "description", content: "Atur penomoran, batas pembayaran, refund window, biaya admin, dan metode manual." },
      { property: "og:title", content: "Pengaturan Transaksi — Admin Ebrystore" },
      { property: "og:description", content: "Konfigurasi aturan transaksi Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminTransactionSettings,
});

const GROUPS: { title: string; description?: string; keys: string[] }[] = [
  {
    title: "Penomoran & mata uang",
    keys: ["order_number_prefix", "invoice_number_prefix", "currency_default", "store_name"],
  },
  {
    title: "Batas waktu & biaya",
    keys: ["order_expiry_hours", "manual_payment_deadline_hours", "refund_window_days", "admin_fee", "auto_cancel_unpaid"],
  },
  {
    title: "Pembayaran manual",
    description: "Nomor dan nama pemilik akan ditampilkan ke pelanggan pada instruksi pembayaran.",
    keys: [
      "manual_payment_active",
      "manual_payment_method",
      "manual_payment_number",
      "manual_payment_holder",
      "manual_payment_instruction",
    ],
  },
  {
    title: "Berkas & unggahan",
    keys: ["proof_file_max_mb", "proof_allowed_types", "proof_reupload_limit", "product_file_max_mb"],
  },
  {
    title: "Provider pembayaran",
    description: "Kredensial provider tidak pernah disimpan atau ditampilkan di sini — hanya melalui secret backend.",
    keys: ["payment_provider", "payment_provider_mode"],
  },
  {
    title: "Akses produk digital",
    keys: ["download_limit_default", "download_validity_days"],
  },
];

function AdminTransactionSettings() {
  const qc = useQueryClient();
  const canView = useCan("settings.view");
  const canManage = useCan("settings.manage");
  const [draft, setDraft] = useState<Record<string, string>>({});

  const fetchSettings = useServerFn(listSettings);
  const save = useServerFn(updateSetting);

  const { data, isPending, error } = useQuery({ queryKey: ["admin-settings"], queryFn: () => fetchSettings({}) });

  const items: any[] = (data as any)?.items ?? [];

  useEffect(() => {
    if (!items.length) return;
    setDraft(Object.fromEntries(items.map((s) => [s.key, JSON.stringify(s.value)])));
  }, [data]);

  const mutation = useMutation({
    mutationFn: (payload: { key: string; value: string }) => save({ data: payload }),
    onSuccess: (res: any) => {
      if (res?.forbidden) return toast.error(`Izin ${res.permission} dibutuhkan.`);
      if (!res.ok) return toast.error(res.error);
      toast.success("Pengaturan disimpan.");
      void qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal menyimpan pengaturan."),
  });

  if (!canView) return <ForbiddenState permission="settings.view" />;
  if (isPending) return <AdminLoading />;
  if ((data as any)?.forbidden) return <ForbiddenState permission={(data as any).permission} />;
  if (error || (data as any)?.error) return <AdminError message={(data as any)?.error ?? "Pengaturan tidak dapat dimuat."} />;

  const byKey = new Map(items.map((s) => [s.key, s]));
  const grouped = new Set(GROUPS.flatMap((g) => g.keys));
  const others = items.filter((s) => !grouped.has(s.key));

  const renderRow = (key: string) => {
    const setting = byKey.get(key);
    if (!setting) return null;
    const inputId = `setting-${key}`;
    const value = draft[key] ?? "";
    const dirty = value !== JSON.stringify(setting.value);
    return (
      <div key={key} className="grid gap-2 border-b border-border py-3 last:border-0 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <Label htmlFor={inputId}>{key}</Label>
          {setting.description ? <p className="text-xs text-muted-foreground">{setting.description}</p> : null}
          <Input
            id={inputId}
            className="mt-1 font-mono text-sm"
            value={value}
            disabled={!canManage}
            onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Diperbarui {formatDateTime(setting.updated_at)} · format JSON
          </p>
        </div>
        <Button
          size="sm"
          disabled={!canManage || !dirty || mutation.isPending}
          onClick={() => mutation.mutate({ key, value })}
        >
          Simpan
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Pengaturan Transaksi"
        crumb="Pengaturan transaksi"
        description="Nilai disimpan sebagai JSON dan divalidasi di server. Perubahan tercatat pada audit log."
      />

      {!canManage ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Anda hanya memiliki akses baca (settings.view). Perubahan memerlukan izin settings.manage.
        </p>
      ) : null}

      {GROUPS.map((g) => {
        const rows = g.keys.map(renderRow).filter(Boolean);
        return (
          <DetailCard key={g.title} title={g.title} description={g.description}>
            {rows.length ? <div>{rows}</div> : <EmptyRow message="Belum ada pengaturan pada kelompok ini." />}
          </DetailCard>
        );
      })}

      {others.length ? (
        <DetailCard title="Pengaturan lain">
          <div>{others.map((s) => renderRow(s.key))}</div>
        </DetailCard>
      ) : null}
    </div>
  );
}
