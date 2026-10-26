import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { AdminError, AdminLoading, AdminPageHeader, EmptyRow, ForbiddenState, useCan } from "@/components/admin/admin-ui";
import { DetailCard, Field, StatusBadge, formatDateTime } from "@/components/admin/tx-ui";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { getPaymentDetail, verifyPayment } from "@/lib/admin-transaction.functions";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/payments/$id")({
  head: () => ({
    meta: [
      { title: "Detail Pembayaran — Admin Ebrystore" },
      { name: "description", content: "Verifikasi bukti transfer, tolak, atau minta unggah ulang pembayaran." },
      { property: "og:title", content: "Detail Pembayaran — Admin Ebrystore" },
      { property: "og:description", content: "Rincian satu pembayaran Ebrystore beserta bukti dan riwayat verifikasi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPaymentDetail,
});

type Decision = "approve" | "reject" | "request_reupload";

const DECISION_LABEL: Record<Decision, string> = {
  approve: "Setujui pembayaran",
  reject: "Tolak pembayaran",
  request_reupload: "Minta unggah ulang bukti",
};

function AdminPaymentDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const canView = useCan("payments.view");
  const canVerify = useCan("payments.verify");
  const canReject = useCan("payments.reject");
  const [pending, setPending] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");

  const fetchDetail = useServerFn(getPaymentDetail);
  const verify = useServerFn(verifyPayment);

  const { data, isPending, error } = useQuery({
    queryKey: ["admin-payment", id],
    queryFn: () => fetchDetail({ data: { id } }),
  });

  useRealtimeRefresh({
    channel: `admin-payment-${id}`,
    tables: ["payments", "manual_payment_proofs", "payment_verifications"],
    keys: [["admin-payment", id], ["admin-payments"]],
    enabled: canView,
  });

  const mutation = useMutation({
    mutationFn: (decision: Decision) => verify({ data: { paymentId: id, decision, reason: reason || undefined } }),
    onSuccess: (res: any) => {
      if (res?.forbidden) return toast.error(`Izin ${res.permission} dibutuhkan.`);
      if (!res.ok) return toast.error(res.error);
      toast.success("Keputusan pembayaran tersimpan.");
      setPending(null);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["admin-payment", id] });
      void qc.invalidateQueries({ queryKey: ["admin-payments"] });
      void qc.invalidateQueries({ queryKey: ["admin-orders"] });
      void qc.invalidateQueries({ queryKey: ["admin-tasks"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal memproses pembayaran."),
  });

  if (!canView) return <ForbiddenState permission="payments.view" />;
  if (isPending) return <AdminLoading />;
  if ((data as any)?.forbidden) return <ForbiddenState permission={(data as any).permission} />;
  if (error || (data as any)?.error)
    return <AdminError message={(data as any)?.error ?? "Pembayaran tidak dapat dimuat."} />;

  const d = data as any;
  const p = d.payment;
  if (!p) return <AdminError message="Pembayaran tidak ditemukan." />;

  const submittedProof = d.proofs.find((proof: any) => proof.status === "submitted");
  const actionable = p.provider === "manual" && p.method === "dana" && p.status === "waiting_verification" && Boolean(submittedProof);
  const amountMismatch = submittedProof && (submittedProof.amount_claimed == null || Number(submittedProof.amount_claimed) !== Number(p.expected_amount));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={p.payment_number}
        crumb="Detail pembayaran"
        description={`Order ${p.orders?.order_number ?? "-"}`}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/payments">Kembali</Link>
          </Button>
        }
      />

      <DetailCard title="Ringkasan">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Status">
            <StatusBadge value={p.status} kind="payment" />
          </Field>
          <Field label="Metode">{p.method}</Field>
          <Field label="Provider">{p.provider}</Field>
          <Field label="Nominal ditagihkan">{formatRupiah(Number(p.expected_amount))}</Field>
          <Field label="Nominal dibayar">{p.paid_amount ? formatRupiah(Number(p.paid_amount)) : "-"}</Field>
          <Field label="Kedaluwarsa">{formatDateTime(p.expired_at)}</Field>
          <Field label="Dibayar pada">{formatDateTime(p.paid_at)}</Field>
          <Field label="Unggah ulang">{Math.max(0, Number(p.reupload_count) - 1)}x</Field>
        </dl>
      </DetailCard>

      <DetailCard
        title="Bukti pembayaran"
        description="Tautan pratinjau bersifat sementara (5 menit) dan hanya untuk staf berizin."
      >
        {!d.proofs.length ? (
          <EmptyRow message="Customer belum mengunggah bukti pembayaran." />
        ) : (
          <ul className="space-y-3">
            {d.proofs.map((proof: any) => (
              <li key={proof.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{proof.original_filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(proof.submitted_at)} · pengirim {proof.sender_name ?? "-"} · klaim{" "}
                      {proof.amount_claimed ? formatRupiah(Number(proof.amount_claimed)) : "-"}
                    </p>
                  </div>
                  <StatusBadge value={proof.status} kind="raw" />
                </div>
                {proof.customer_note ? <p className="mt-2 text-muted-foreground">“{proof.customer_note}”</p> : null}
                {proof.preview_url ? (
                  <a
                    href={proof.preview_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-sm font-medium text-primary underline"
                  >
                    Buka bukti
                  </a>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Pratinjau tidak tersedia.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </DetailCard>

      <DetailCard title="Riwayat verifikasi">
        {!d.verifications.length ? (
          <EmptyRow message="Belum ada keputusan verifikasi." />
        ) : (
          <ul className="space-y-2 text-sm">
            {d.verifications.map((v: any) => (
              <li key={v.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge value={v.new_status} kind="payment" />
                  <span className="text-xs text-muted-foreground">{formatDateTime(v.verified_at)}</span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {v.decision}
                  {v.reason ? ` — ${v.reason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DetailCard>

      <DetailCard
        title="Tindakan verifikasi"
        description="Satu keputusan memperbarui payment, order, timeline, task, notifikasi, dan audit log sekaligus."
      >
        {!canVerify && !canReject ? (
          <p className="text-sm text-muted-foreground">Anda tidak memiliki izin verifikasi atau penolakan pembayaran.</p>
        ) : !actionable ? (
          <p className="text-sm text-muted-foreground">
            Verifikasi manual hanya tersedia untuk transfer DANA yang menunggu pemeriksaan dan memiliki bukti.
          </p>
        ) : (
          <div className="space-y-3">
            {amountMismatch ? <p role="alert" className="text-sm text-destructive">Nominal bukti berbeda dari tagihan. Minta unggah ulang sebelum menyetujui.</p> : null}
            <div>
              <Label htmlFor="verify-reason">Alasan / catatan</Label>
              <Textarea
                id="verify-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Wajib diisi untuk penolakan atau permintaan unggah ulang."
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={mutation.isPending || !canVerify || amountMismatch} onClick={() => setPending("approve")}>
                Setujui
              </Button>
              <Button
                variant="destructive"
                disabled={mutation.isPending || !canReject || reason.trim().length < 5}
                onClick={() => setPending("reject")}
              >
                Tolak
              </Button>
              <Button
                variant="outline"
                disabled={mutation.isPending || !canReject || reason.trim().length < 5}
                onClick={() => setPending("request_reupload")}
              >
                Minta unggah ulang
              </Button>
            </div>
          </div>
        )}
      </DetailCard>

      <AlertDialog open={pending !== null} onOpenChange={(open) => (!open ? setPending(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending ? DECISION_LABEL[pending] : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini mengubah status order dan mengirim notifikasi ke customer. Lanjutkan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && mutation.mutate(pending)}>Konfirmasi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
