import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { AdminError, AdminLoading, AdminPageHeader, EmptyRow, ForbiddenState, useCan } from "@/components/admin/admin-ui";
import { DetailCard, Field, StatusBadge, formatDateTime } from "@/components/admin/tx-ui";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { decideRefund, getRefundDetail, processRefund } from "@/lib/admin-transaction.functions";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/refunds/$id")({
  head: () => ({
    meta: [
      { title: "Detail Refund — Admin Ebrystore" },
      { name: "description", content: "Tinjau kelayakan refund, setujui, tolak, atau proses pencairan dana." },
      { property: "og:title", content: "Detail Refund — Admin Ebrystore" },
      { property: "og:description", content: "Rincian satu pengajuan refund Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminRefundDetail,
});

function AdminRefundDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const canView = useCan("refunds.view");
  const canApprove = useCan("refunds.approve");
  const canReject = useCan("refunds.reject");
  const canProcess = useCan("refunds.process");

  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");

  const fetchDetail = useServerFn(getRefundDetail);
  const decide = useServerFn(decideRefund);
  const process = useServerFn(processRefund);

  const { data, isPending, error } = useQuery({
    queryKey: ["admin-refund", id],
    queryFn: () => fetchDetail({ data: { id } }),
  });

  useRealtimeRefresh({
    channel: `admin-refund-${id}`,
    tables: ["refunds", "payments"],
    keys: [["admin-refund", id], ["admin-refunds"]],
    enabled: canView,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin-refund", id] });
    void qc.invalidateQueries({ queryKey: ["admin-refunds"] });
    void qc.invalidateQueries({ queryKey: ["admin-orders"] });
    void qc.invalidateQueries({ queryKey: ["admin-tasks"] });
  };

  const handle = (res: any, okMessage: string) => {
    if (res?.forbidden) return toast.error(`Izin ${res.permission} dibutuhkan.`);
    if (!res.ok) return toast.error(res.error);
    toast.success(okMessage);
    setReason("");
    setReference("");
    invalidate();
  };

  const decideMutation = useMutation({
    mutationFn: (decision: "approve" | "reject" | "request_info") =>
      decide({ data: { refundId: id, decision, reason } }),
    onSuccess: (res: any) => handle(res, "Keputusan refund tersimpan."),
    onError: (e: any) => toast.error(e?.message ?? "Gagal memproses refund."),
  });

  const processMutation = useMutation({
    mutationFn: () => process({ data: { refundId: id, reference } }),
    onSuccess: (res: any) => handle(res, "Refund ditandai selesai diproses."),
    onError: (e: any) => toast.error(e?.message ?? "Gagal memproses pencairan."),
  });

  if (!canView) return <ForbiddenState permission="refunds.view" />;
  if (isPending) return <AdminLoading />;
  if ((data as any)?.forbidden) return <ForbiddenState permission={(data as any).permission} />;
  if (error || (data as any)?.error) return <AdminError message={(data as any)?.error ?? "Refund tidak dapat dimuat."} />;

  const d = data as any;
  const r = d.refund;
  if (!r) return <AdminError message="Refund tidak ditemukan." />;

  const reviewable = ["requested", "under_review"].includes(r.status);
  const processable = r.status === "approved" || r.status === "processing";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={r.refund_number}
        crumb="Detail refund"
        description={`Order ${r.orders?.order_number ?? "-"}`}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/refunds">Kembali</Link>
          </Button>
        }
      />

      <DetailCard title="Ringkasan">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Status">
            <StatusBadge value={r.status} kind="raw" />
          </Field>
          <Field label="Nominal">{formatRupiah(Number(r.amount))}</Field>
          <Field label="Diajukan">{formatDateTime(r.requested_at)}</Field>
          <Field label="Ditinjau">{formatDateTime(r.reviewed_at)}</Field>
          <Field label="Diproses">{formatDateTime(r.processed_at)}</Field>
          <Field label="Referensi">{r.processing_reference ?? "-"}</Field>
          <Field label="Customer">{d.customer?.full_name ?? "-"}</Field>
          <Field label="Email">{d.customer?.email ?? "-"}</Field>
        </dl>
        <div className="mt-4 grid gap-4">
          <Field label="Alasan pelanggan">{r.reason}</Field>
          <Field label="Catatan keputusan">{r.decision_note ?? "-"}</Field>
        </div>
      </DetailCard>

      <DetailCard title="Kelayakan">
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>Nilai order: {r.orders ? formatRupiah(Number(r.orders.total)) : "-"}</li>
          <li>Status order: {r.orders?.status ?? "-"}</li>
          <li>Order dibuat: {formatDateTime(r.orders?.created_at)}</li>
          <li>
            Pembayaran terkait: {d.payment ? `${d.payment.payment_number} (${d.payment.status})` : "tidak terhubung"}
          </li>
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Refund window 7 hari dan validasi status divalidasi ulang di server saat keputusan disimpan.
        </p>
      </DetailCard>

      <DetailCard title="Tindakan">
        {reviewable ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="refund-reason">Alasan keputusan (min. 5 karakter)</Label>
              <Textarea id="refund-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!canApprove || reason.trim().length < 5 || decideMutation.isPending}
                onClick={() => decideMutation.mutate("approve")}
              >
                Setujui
              </Button>
              <Button
                variant="destructive"
                disabled={!canReject || reason.trim().length < 5 || decideMutation.isPending}
                onClick={() => decideMutation.mutate("reject")}
              >
                Tolak
              </Button>
              <Button
                variant="outline"
                disabled={!canApprove || reason.trim().length < 5 || decideMutation.isPending}
                onClick={() => decideMutation.mutate("request_info")}
              >
                Minta info tambahan
              </Button>
            </div>
          </div>
        ) : processable ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="refund-ref">Referensi pencairan</Label>
              <Input
                id="refund-ref"
                value={reference}
                placeholder="mis. DANA-TRX-12345"
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <Button
              disabled={!canProcess || reference.trim().length < 3 || processMutation.isPending}
              onClick={() => processMutation.mutate()}
            >
              Tandai refund selesai
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Refund berstatus final, tidak ada tindakan tersedia.</p>
        )}
      </DetailCard>

      <DetailCard title="Audit">
        {!d.audits.length ? (
          <EmptyRow message="Belum ada aktivitas audit." />
        ) : (
          <ul className="space-y-2 text-sm">
            {d.audits.map((a: any) => (
              <li key={a.id} className="rounded-lg border border-border p-3">
                <p className="font-medium">{a.action}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </DetailCard>
    </div>
  );
}
