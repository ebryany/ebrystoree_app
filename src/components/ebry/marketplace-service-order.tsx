import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDateTime } from "@/components/admin/tx-ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatRupiah } from "@/lib/format";
import {
  acceptServiceDelivery,
  cancelOverdueServiceOrder,
  getServiceDeliveryFileUrl,
  getServiceOrderDetail,
  openServiceComplaint,
  requestServiceRevision,
  respondServiceExtension,
} from "@/lib/marketplace-service.functions";
import {
  marketplaceServiceWorkStateLabels,
  type MarketplaceServiceDelivery,
  type MarketplaceServiceEvent,
  type MarketplaceServiceWorkState,
} from "@/lib/marketplace-service";
import { ORDER_STATUS_LABEL } from "@/lib/transaction-labels";

const eventLabels: Record<string, string> = {
  order_created: "Pesanan dan kesepakatan dibuat",
  requirements_approved: "Seller menyetujui requirements",
  delivery_submitted: "Seller mengirim hasil",
  revision_requested: "Pembeli meminta revisi",
  accepted: "Pembeli menerima hasil",
  complaint_opened: "Pembeli mengajukan komplain",
  complaint_resumed: "Admin melanjutkan pekerjaan",
  refund_requested: "Refund diajukan",
  refunded_to_balance: "Dana dikembalikan ke saldo",
  auto_accepted: "Hasil diterima otomatis",
  extension_requested: "Seller meminta perpanjangan",
  extension_approved: "Perpanjangan disetujui",
  extension_rejected: "Perpanjangan ditolak",
};

export function MarketplaceServiceOrderDetail({
  orderId,
  embedded = false,
}: {
  orderId: string;
  /** Di halaman pesanan: header dan riwayat disembunyikan karena sudah ada di halaman. */
  embedded?: boolean;
}) {
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getServiceOrderDetail);
  const acceptDelivery = useServerFn(acceptServiceDelivery);
  const requestRevision = useServerFn(requestServiceRevision);
  const openComplaint = useServerFn(openServiceComplaint);
  const respondExtension = useServerFn(respondServiceExtension);
  const cancelOverdue = useServerFn(cancelOverdueServiceOrder);
  const [feedback, setFeedback] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const fileUrl = useServerFn(getServiceDeliveryFileUrl);
  const download = useMutation({
    mutationFn: (deliveryId: string) => fileUrl({ data: { deliveryId } }),
    onSuccess: (result) => {
      if (result.ok && result.url) window.open(result.url, "_blank", "noopener,noreferrer");
      else setFeedback(result.ok ? "Tautan unduhan tidak tersedia." : result.error);
    },
    onError: () => setFeedback("Unduhan gagal disiapkan. Coba lagi."),
  });
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["service-order", orderId],
    queryFn: () => fetchDetail({ data: { orderId } }),
    refetchInterval: 15_000,
  });
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["service-order", orderId] }),
      queryClient.invalidateQueries({ queryKey: ["my-order", orderId] }),
      queryClient.invalidateQueries({ queryKey: ["my-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["customer-summary"] }),
    ]);
  };
  const accept = useMutation({
    mutationFn: (input: { orderId: string; deliveryId: string }) => acceptDelivery({ data: input }),
    onSuccess: async (result) => {
      setFeedback(result.ok ? "Hasil diterima. Dana seller dilepas." : result.error);
      if (result.ok) await invalidate();
    },
    onError: () => setFeedback("Penerimaan gagal diproses. Coba lagi."),
  });
  const revision = useMutation({
    mutationFn: (input: { orderId: string; deliveryId: string; reason: string }) =>
      requestRevision({ data: input }),
    onSuccess: async (result) => {
      setFeedback(result.ok ? "Permintaan revisi dikirim ke seller." : result.error);
      if (result.ok) await invalidate();
    },
    onError: () => setFeedback("Permintaan revisi gagal dikirim. Coba lagi."),
  });
  const complaint = useMutation({
    mutationFn: (input: { orderId: string; reason: string }) => openComplaint({ data: input }),
    onSuccess: async (result) => {
      setFeedback(
        result.ok
          ? "Komplain dikirim. Pencairan dana ditahan sampai admin memutuskan."
          : result.error,
      );
      if (result.ok) await invalidate();
    },
    onError: () => setFeedback("Komplain gagal dikirim. Coba lagi."),
  });
  const extension = useMutation({
    mutationFn: (approve: boolean) => respondExtension({ data: { orderId, approve } }),
    onSuccess: async (result, approve) => {
      setFeedback(
        result.ok
          ? approve
            ? "Perpanjangan disetujui. Tenggat baru sudah berlaku."
            : "Perpanjangan ditolak. Tenggat tetap."
          : result.error,
      );
      if (result.ok) await invalidate();
    },
    onError: () => setFeedback("Jawaban perpanjangan gagal dikirim. Coba lagi."),
  });
  const cancel = useMutation({
    mutationFn: () => cancelOverdue({ data: { orderId, reason: "" } }),
    onSuccess: async (result) => {
      setFeedback(
        result.ok
          ? "Pesanan dibatalkan. Dana dikembalikan penuh ke saldo Ebrystore."
          : result.error,
      );
      if (result.ok) {
        setConfirmCancel(false);
        await Promise.all([
          invalidate(),
          queryClient.invalidateQueries({ queryKey: ["my-credit"] }),
        ]);
      }
    },
    onError: () => setFeedback("Pembatalan gagal diproses. Coba lagi."),
  });

  if (isPending) return <p role="status">Memuat detail pesanan jasa…</p>;
  if (error)
    return (
      <div role="alert" className="space-y-3">
        <p>{error.message}</p>
        <Button variant="outline" className="min-h-11" onClick={() => void refetch()}>
          Muat ulang
        </Button>
      </div>
    );
  if (!data?.order)
    return <p role="alert">Pesanan tidak ditemukan atau bukan pesanan jasa seller.</p>;
  if (data.error || !data.contract)
    return (
      <div role="alert" className="space-y-3">
        <p>{data.error ?? "Kontrak pesanan jasa tidak tersedia."}</p>
        <Button variant="outline" className="min-h-11" onClick={() => void refetch()}>
          Muat ulang
        </Button>
      </div>
    );

  const contract = data.contract;
  const order = data.order;
  const workState = contract.work_state as MarketplaceServiceWorkState;
  const deliveries = data.deliveries as MarketplaceServiceDelivery[];
  const latest = deliveries[0];
  const canReview =
    contract.work_state === "delivered" && !contract.complaint_open && order.status === "paid";
  const canComplain =
    !contract.complaint_open && !contract.accepted_delivery_id && order.status === "paid";
  const now = Date.now();
  const isActive = order.status === "paid" && !contract.complaint_open;
  const extensionPending = isActive && Boolean(contract.extension_requested_at);
  // Sama dengan syarat cancel_overdue_service_order di database.
  const canCancelOverdue =
    isActive &&
    contract.work_state === "in_progress" &&
    !contract.latest_delivery_id &&
    Boolean(contract.due_at) &&
    Date.parse(contract.due_at!) <= now;
  const agreementFields = (
    <>
      {(
        [
          ["Scope pekerjaan", contract.agreement.scope],
          ["Di luar scope", contract.agreement.exclusions],
          ["Hasil yang diserahkan", contract.agreement.deliverable],
          ["Data yang Anda berikan", contract.agreement.requirements],
        ] as const
      ).map(([label, value]) => (
        <div key={label}>
          <dt className="font-medium">{label}</dt>
          <dd className="whitespace-pre-wrap break-words">{value}</dd>
        </div>
      ))}
      <div>
        <dt className="font-medium">Durasi dan revisi</dt>
        <dd className="tabular-nums">
          {contract.agreement.durationDays} hari kerja · jatah revisi {contract.revision_used}/
          {contract.revision_limit}
        </dd>
      </div>
      {contract.due_at ? (
        <div>
          <dt className="font-medium">Tenggat pengerjaan</dt>
          <dd>{formatDateTime(contract.due_at)}</dd>
        </div>
      ) : null}
    </>
  );

  return (
    <div className="min-w-0 space-y-6">
      {!embedded ? (
        <header className="space-y-1">
          <h1 className="break-words text-2xl font-semibold">Pesanan jasa {order.order_number}</h1>
          <p className="text-sm tabular-nums">
            {formatRupiah(Number(order.total))} · {ORDER_STATUS_LABEL[order.status] ?? order.status}{" "}
            · {marketplaceServiceWorkStateLabels[workState]}
          </p>
        </header>
      ) : (
        <h2 className="text-lg font-semibold">Rincian jasa</h2>
      )}
      <p role="status" aria-live="polite" className="text-sm">
        {feedback}
      </p>

      {isActive && contract.work_state === "awaiting_requirements" ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm">
          Seller sedang meninjau kebutuhan Anda
          {contract.seller_response_due_at
            ? ` dan wajib merespons sebelum ${formatDateTime(contract.seller_response_due_at)}`
            : ""}
          . Bila ditolak atau tidak direspons, dana dikembalikan penuh ke saldo Ebrystore.
        </p>
      ) : null}

      {extensionPending ? (
        <section className="space-y-3 rounded-lg border border-warning/50 bg-warning/10 p-4">
          <h2 className="font-semibold">
            Seller meminta tambahan {contract.extension_requested_days} hari
          </h2>
          {contract.extension_reason ? (
            <p className="whitespace-pre-wrap break-words text-sm">{contract.extension_reason}</p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {contract.due_at ? `Tenggat saat ini ${formatDateTime(contract.due_at)}. ` : ""}
            Bila disetujui, tenggat bertambah {contract.extension_requested_days} hari.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={extension.isPending}
              onClick={() => extension.mutate(true)}
            >
              Setujui perpanjangan
            </Button>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={extension.isPending}
              onClick={() => extension.mutate(false)}
            >
              Tolak
            </Button>
          </div>
        </section>
      ) : null}

      {canCancelOverdue ? (
        <section className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <h2 className="font-semibold">Tenggat terlewati</h2>
          <p className="text-sm">
            Seller belum mengirim hasil sejak {formatDateTime(contract.due_at!)}. Anda bisa
            menunggu, atau membatalkan dan menerima refund penuh {formatRupiah(Number(order.total))}{" "}
            ke saldo Ebrystore.
          </p>
          {confirmCancel ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                className="min-h-11"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                {cancel.isPending ? "Memproses…" : "Ya, batalkan & refund"}
              </Button>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={cancel.isPending}
                onClick={() => setConfirmCancel(false)}
              >
                Tetap tunggu
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="min-h-11" onClick={() => setConfirmCancel(true)}>
              Batalkan & refund
            </Button>
          )}
        </section>
      ) : null}

      {/* Di halaman pesanan, agreement dilipat agar halaman tidak terasa penuh. */}
      {embedded ? (
        <details className="rounded-lg border border-border bg-card">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
            Agreement yang Anda setujui
          </summary>
          <dl className="space-y-3 border-t border-border p-4 text-sm">{agreementFields}</dl>
        </details>
      ) : (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Agreement yang Anda setujui</h2>
          <dl className="mt-3 space-y-3 text-sm">{agreementFields}</dl>
        </section>
      )}

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="font-semibold">Kebutuhan yang Anda kirim</h2>
        <p className="whitespace-pre-wrap break-words text-sm">
          {contract.requirements?.note ?? "Kebutuhan belum tersedia."}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Hasil pekerjaan</h2>
        {deliveries.length === 0 ? (
          <p>Belum ada hasil yang dikirim seller.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {deliveries.map((delivery) => (
              <li key={delivery.id} className="space-y-2 p-4">
                <p className="text-sm font-medium tabular-nums">
                  Versi {delivery.version} · {formatDateTime(delivery.created_at)}
                  {contract.latest_delivery_id === delivery.id ? " · versi terbaru" : ""}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">{delivery.summary}</p>
                {delivery.kind === "file" && delivery.storage_path ? (
                  <div className="space-y-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      disabled={download.isPending}
                      onClick={() => download.mutate(delivery.id)}
                    >
                      {download.isPending ? "Menyiapkan…" : "Unduh berkas hasil"}
                    </Button>
                    {delivery.original_name ? (
                      <p className="text-xs text-muted-foreground">
                        {delivery.original_name}
                        {delivery.file_size
                          ? ` · ${(delivery.file_size / (1024 * 1024)).toFixed(1)} MB`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {delivery.url ? (
                  <a
                    href={delivery.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-block py-1 text-sm underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    Buka hasil (tautan seller)
                  </a>
                ) : null}
                {delivery.note ? (
                  <p className="whitespace-pre-wrap break-words text-sm">
                    Catatan: {delivery.note}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canReview && latest ? (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Tinjau versi {latest.version}</h2>
          <p className="text-sm">
            Menerima berarti Anda menyetujui versi {latest.version} dan dana seller dilepas.
            Tindakan ini tidak dapat dibatalkan.
          </p>
          {contract.review_due_at ? (
            <p className="text-sm font-medium">
              Tanpa revisi atau komplain sampai {formatDateTime(contract.review_due_at)}, hasil
              diterima otomatis.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={accept.isPending}
              onClick={() => accept.mutate({ orderId, deliveryId: latest.id })}
            >
              {accept.isPending ? "Memproses…" : "Terima hasil"}
            </Button>
          </div>
          {contract.revision_used < contract.revision_limit ? (
            <RevisionForm
              pending={revision.isPending}
              onSubmit={(reason) => revision.mutate({ orderId, deliveryId: latest.id, reason })}
            />
          ) : (
            <p className="text-sm">
              Jatah revisi habis. Bila hasil tidak sesuai agreement, ajukan komplain di bawah.
            </p>
          )}
        </section>
      ) : null}

      {canComplain ? (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Ajukan komplain</h2>
          <p className="text-sm">
            Komplain membekukan pencairan dana sampai admin memutuskan. Jelaskan ketidaksesuaian
            dengan agreement.
          </p>
          <ComplaintForm
            pending={complaint.isPending}
            onSubmit={(reason) => complaint.mutate({ orderId, reason })}
          />
        </section>
      ) : null}

      {contract.complaint_open ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm">
          Komplain sedang ditinjau admin. Pencairan dan acceptance dibekukan sampai ada keputusan.
        </p>
      ) : null}

      {/* Di halaman pesanan, riwayat sudah tampil pada lini masa. */}
      {!embedded ? (
        <section className="space-y-3">
          <h2 className="font-semibold">Riwayat pesanan</h2>
          {data.events.length === 0 ? (
            <p>Belum ada aktivitas tercatat.</p>
          ) : (
            <ol className="divide-y divide-border rounded-lg border border-border bg-card">
              {data.events.map((event: MarketplaceServiceEvent) => (
                <li key={event.id} className="space-y-1 p-4 text-sm">
                  <p className="font-medium">{eventLabels[event.event_type] ?? event.event_type}</p>
                  <p className="text-muted-foreground">
                    {formatDateTime(event.created_at)} ·{" "}
                    {event.actor_role === "buyer"
                      ? "Anda"
                      : event.actor_role === "seller"
                        ? "Seller"
                        : event.actor_role === "system"
                          ? "Otomatis"
                          : "Admin"}
                  </p>
                  {typeof event.payload?.reason === "string" ? (
                    <p className="whitespace-pre-wrap break-words">{event.payload.reason}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
    </div>
  );
}

function RevisionForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [validation, setValidation] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 10) {
      setValidation("Jelaskan revisi minimal 10 karakter.");
      return;
    }
    setValidation("");
    onSubmit(reason.trim());
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <Label htmlFor="jasa-revision-reason">Alasan revisi (minimal 10 karakter)</Label>
      <Textarea
        id="jasa-revision-reason"
        rows={3}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={5000}
        required
      />
      {validation ? (
        <p role="alert" className="text-sm">
          {validation}
        </p>
      ) : null}
      <Button type="submit" variant="outline" className="min-h-11" disabled={pending}>
        {pending ? "Mengirim…" : "Minta revisi"}
      </Button>
    </form>
  );
}

function ComplaintForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [validation, setValidation] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 10) {
      setValidation("Jelaskan komplain minimal 10 karakter.");
      return;
    }
    setValidation("");
    onSubmit(reason.trim());
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <Label htmlFor="jasa-complaint-reason">Alasan komplain (minimal 10 karakter)</Label>
      <Textarea
        id="jasa-complaint-reason"
        rows={3}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={5000}
        required
      />
      {validation ? (
        <p role="alert" className="text-sm">
          {validation}
        </p>
      ) : null}
      <Button type="submit" variant="outline" className="min-h-11" disabled={pending}>
        {pending ? "Mengirim…" : "Kirim komplain"}
      </Button>
    </form>
  );
}
