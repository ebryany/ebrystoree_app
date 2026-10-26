import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  useCan,
} from "@/components/admin/admin-ui";
import { DetailCard, Field, StatusBadge, formatDateTime } from "@/components/admin/tx-ui";
import { useSession } from "@/hooks/use-session";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  completePayout,
  decidePayout,
  getPayoutDetail,
  markPayoutReconciliation,
  recordPayoutTransfer,
  resolvePayoutReconciliation,
} from "@/lib/admin-payout.functions";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/payouts/$id")({
  head: () => ({
    meta: [
      { title: "Detail Payout — Admin Ebrystore" },
      {
        name: "description",
        content: "Review pengajuan penarikan seller, catat transfer manual, dan rekonsiliasi.",
      },
      { property: "og:title", content: "Detail Payout — Admin Ebrystore" },
      { property: "og:description", content: "Rincian satu pengajuan penarikan saldo seller." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPayoutDetail,
});

function AdminPayoutDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { user } = useSession();
  const canView = useCan("payouts.view");
  const canApprove = useCan("payouts.approve");
  const canProcess = useCan("payouts.process");

  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const fetchDetail = useServerFn(getPayoutDetail);
  const decide = useServerFn(decidePayout);
  const transfer = useServerFn(recordPayoutTransfer);
  const complete = useServerFn(completePayout);
  const markRecon = useServerFn(markPayoutReconciliation);
  const resolveRecon = useServerFn(resolvePayoutReconciliation);

  const { data, isPending, error } = useQuery({
    queryKey: ["admin-payout", id],
    queryFn: () => fetchDetail({ data: { id } }),
  });

  useRealtimeRefresh({
    channel: `admin-payout-${id}`,
    tables: ["withdrawals", "withdrawal_events"],
    keys: [["admin-payout", id], ["admin-payouts"]],
    enabled: canView,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin-payout", id] });
    void qc.invalidateQueries({ queryKey: ["admin-payouts"] });
    void qc.invalidateQueries({ queryKey: ["admin-tasks"] });
  };

  const handle = (res: any, okMessage: string) => {
    if (res?.forbidden) return toast.error(`Izin ${res.permission} dibutuhkan.`);
    if (!res.ok) return toast.error(res.error);
    toast.success(okMessage);
    setReason("");
    setReference("");
    setNote("");
    invalidate();
  };

  const decideMutation = useMutation({
    mutationFn: (decision: "approve" | "reject") =>
      decide({ data: { withdrawal_id: id, decision, reason } }),
    onSuccess: (res: any, decision) =>
      handle(
        res,
        decision === "approve" ? "Payout disetujui." : "Payout ditolak; saldo dikembalikan.",
      ),
    onError: (e: any) => toast.error(e?.message ?? "Gagal menyimpan keputusan."),
  });

  const transferMutation = useMutation({
    mutationFn: () => transfer({ data: { withdrawal_id: id, bank_reference: reference, note } }),
    onSuccess: (res: any) => handle(res, "Transfer manual dicatat."),
    onError: (e: any) => toast.error(e?.message ?? "Gagal mencatat transfer."),
  });

  const completeMutation = useMutation({
    mutationFn: () => complete({ data: { withdrawal_id: id, note } }),
    onSuccess: (res: any) => handle(res, "Payout ditandai selesai."),
    onError: (e: any) => toast.error(e?.message ?? "Gagal menyelesaikan payout."),
  });

  const reconMutation = useMutation({
    mutationFn: () => markRecon({ data: { withdrawal_id: id, note } }),
    onSuccess: (res: any) => handle(res, "Payout masuk status rekonsiliasi."),
    onError: (e: any) => toast.error(e?.message ?? "Gagal membuka rekonsiliasi."),
  });

  const resolveMutation = useMutation({
    mutationFn: (outcome: "completed" | "cancelled") =>
      resolveRecon({ data: { withdrawal_id: id, outcome, note } }),
    onSuccess: (res: any) =>
      handle(
        res,
        res?.status === "completed"
          ? "Rekonsiliasi selesai: transfer terkonfirmasi."
          : "Rekonsiliasi ditutup: saldo dikembalikan.",
      ),
    onError: (e: any) => toast.error(e?.message ?? "Gagal menyelesaikan rekonsiliasi."),
  });

  if (!canView) return <ForbiddenState permission="payouts.view" />;
  if (isPending) return <AdminLoading />;
  if ((data as any)?.forbidden) return <ForbiddenState permission={(data as any).permission} />;
  if (error || (data as any)?.error)
    return <AdminError message={(data as any)?.error ?? "Payout tidak dapat dimuat."} />;

  const w = (data as any)?.detail;
  if (!w) return <AdminError message="Payout tidak ditemukan." />;

  const reviewable = w.status === "requested";
  const transferable = w.status === "approved";
  const confirmable = w.status === "transferred";
  const resolvable = w.status === "needs_reconciliation";
  const isOwnStore = Boolean(user?.id && w.store_owner_id === user.id);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={w.withdrawal_number}
        crumb="Detail payout"
        description={`Toko ${w.stores?.name ?? "-"}`}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/payouts">Kembali</Link>
          </Button>
        }
      />

      <DetailCard title="Ringkasan">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Status">
            <StatusBadge value={w.status} kind="raw" />
          </Field>
          <Field label="Bruto">{formatRupiah(w.gross_amount)}</Field>
          <Field label="Fee penarikan">{formatRupiah(w.fee_amount)}</Field>
          <Field label="Neto ke seller">{formatRupiah(w.net_amount)}</Field>
          <Field label="Diajukan">{formatDateTime(w.created_at)}</Field>
          <Field label="Ditinjau">{formatDateTime(w.decided_at)}</Field>
          <Field label="Transfer dicatat">{formatDateTime(w.transferred_at)}</Field>
          <Field label="Selesai">{formatDateTime(w.completed_at)}</Field>
          <Field label="Referensi transfer">{w.bank_reference ?? "-"}</Field>
          <Field label="Pengaju">{w.requested_by_profile?.full_name ?? "-"}</Field>
        </dl>
        <div className="mt-4 grid gap-4">
          <Field label="Catatan keputusan">{w.decision_note ?? "-"}</Field>
          <Field label="Catatan transfer">{w.transfer_note ?? "-"}</Field>
        </div>
      </DetailCard>

      <DetailCard title="Rekening tujuan (snapshot saat pengajuan)">
        <dl className="grid gap-4 sm:grid-cols-3">
          <Field label="Bank">{w.bank_name}</Field>
          <Field label="Nomor rekening">
            <span className="tabular-nums">{w.bank_account_number}</span>
          </Field>
          <Field label="Nama pemilik">{w.bank_account_holder}</Field>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Perubahan rekening setelah pengajuan tidak mengubah tujuan transfer ini. Verifikasi
          kecocokan nama pemilik sebelum mentransfer.
        </p>
      </DetailCard>

      <DetailCard title="Tindakan">
        {reviewable ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="payout-reason">Alasan keputusan (wajib saat menolak)</Label>
              <Textarea
                id="payout-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!canApprove || decideMutation.isPending}
                onClick={() => decideMutation.mutate("approve")}
              >
                Setujui
              </Button>
              <Button
                variant="destructive"
                disabled={!canApprove || reason.trim().length < 5 || decideMutation.isPending}
                onClick={() => decideMutation.mutate("reject")}
              >
                Tolak &amp; kembalikan saldo
              </Button>
            </div>
          </div>
        ) : transferable ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="payout-ref">Referensi transfer bank (wajib)</Label>
              <Input
                id="payout-ref"
                value={reference}
                placeholder="mis. BCA-20261027-000123"
                onChange={(e) => setReference(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div>
              <Label htmlFor="payout-note">Catatan (opsional)</Label>
              <Textarea id="payout-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button
              disabled={!canProcess || reference.trim().length < 3 || transferMutation.isPending}
              onClick={() => transferMutation.mutate()}
            >
              Catat transfer keluar
            </Button>
            <p className="text-xs text-muted-foreground">
              Isi hanya SETELAH transfer benar-benar dikirim dari rekening platform. Status belum
              final sampai dikonfirmasi selesai.
            </p>
          </div>
        ) : confirmable ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="payout-note">Catatan (opsional)</Label>
              <Textarea id="payout-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!canProcess || completeMutation.isPending}
                onClick={() => completeMutation.mutate()}
              >
                Konfirmasi selesai
              </Button>
              <Button
                variant="outline"
                disabled={!canProcess || note.trim().length < 5 || reconMutation.isPending}
                onClick={() => reconMutation.mutate()}
              >
                Status tak pasti — buka rekonsiliasi
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Bila status transfer di bank belum pasti, jangan konfirmasi selesai dan jangan
              mengulang transfer — buka rekonsiliasi.
            </p>
          </div>
        ) : resolvable ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="payout-resolve">Keputusan rekonsiliasi (min. 5 karakter)</Label>
              <Textarea
                id="payout-resolve"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!canApprove || note.trim().length < 5 || resolveMutation.isPending}
                onClick={() => resolveMutation.mutate("completed")}
              >
                Transfer terkonfirmasi — selesai
              </Button>
              <Button
                variant="destructive"
                disabled={!canApprove || note.trim().length < 5 || resolveMutation.isPending}
                onClick={() => resolveMutation.mutate("cancelled")}
              >
                Dana tidak keluar — batalkan &amp; kembalikan saldo
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Payout berstatus final, tidak ada tindakan tersedia.
          </p>
        )}
        {isOwnStore && (
          <p className="mt-3 text-xs text-destructive">
            Pengaju adalah pemilik toko ini — database menolak pemrosesan payout toko sendiri.
          </p>
        )}
      </DetailCard>

      <DetailCard title="Timeline">
        {!(w.events ?? []).length ? (
          <EmptyRow message="Belum ada event." />
        ) : (
          <ol className="space-y-2 text-sm">
            {(w.events as any[]).map((ev) => (
              <li key={ev.id} className="rounded-lg border border-border p-3">
                <p className="font-medium">{ev.event_type.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(ev.created_at)}</p>
                {ev.note && <p className="mt-1 text-xs text-muted-foreground">{ev.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </DetailCard>
    </div>
  );
}
