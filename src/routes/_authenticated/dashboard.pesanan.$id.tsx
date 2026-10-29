import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { AdminError, AdminLoading } from "@/components/admin/admin-ui";
import {
  AssignmentSummary,
  ProgressList,
  ResultList,
  RevisionList,
} from "@/components/fulfillment/fulfillment-panel";
import { LiveOrderTimeline } from "@/components/ebry/live-timeline";
import { QrisPayment, type QrisProvider } from "@/components/ebry/qris-payment";
import { ManualPayment } from "@/components/ebry/manual-payment";
import { DigitalReceiptPanel } from "@/components/ebry/digital-receipt";
import { MarketplaceServiceOrderDetail } from "@/components/ebry/marketplace-service-order";
import { canSubmitManualProof } from "@/lib/manual-payment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import {
  applyCreditToOrder,
  cancelMyOrder,
  getMyCredit,
  getMyOrder,
  requestMyRefund,
} from "@/lib/orders.functions";
import { getOrderFulfillment, reviewJobResult } from "@/lib/fulfillment.functions";
import { getServiceOrderDetail } from "@/lib/marketplace-service.functions";
import { formatRupiah } from "@/lib/format";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/transaction-labels";

export const Route = createFileRoute("/_authenticated/dashboard/pesanan/$id")({
  head: () => ({
    meta: [
      { title: "Detail Pesanan — Ebrystore" },
      {
        name: "description",
        content: "Rincian pesanan, instruksi pembayaran, dan riwayat status pesanan Ebrystore.",
      },
      { property: "og:title", content: "Detail Pesanan — Ebrystore" },
      { property: "og:description", content: "Rincian pesanan dan pembayaran Anda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DetailPesanan,
});

function DetailPesanan() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchOrder = useServerFn(getMyOrder);
  const cancelOrder = useServerFn(cancelMyOrder);
  const requestRefund = useServerFn(requestMyRefund);

  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [revisionReason, setRevisionReason] = useState("");

  const { data, isPending, error } = useQuery({
    queryKey: ["my-order", id],
    queryFn: () => fetchOrder({ data: { id } }),
  });
  const fetchFulfillment = useServerFn(getOrderFulfillment);
  const reviewResult = useServerFn(reviewJobResult);
  const { data: fulfillment } = useQuery({
    queryKey: ["order-fulfillment", id],
    queryFn: () => fetchFulfillment({ data: { orderId: id } }),
    enabled: data?.order?.order_type === "service",
  });

  const fetchCredit = useServerFn(getMyCredit);
  const applyCredit = useServerFn(applyCreditToOrder);
  const { data: credit } = useQuery({ queryKey: ["my-credit"], queryFn: () => fetchCredit({}) });
  const [applyingCredit, setApplyingCredit] = useState(false);
  const [useQris, setUseQris] = useState(false);
  const [qrisChoice, setQrisChoice] = useState<QrisProvider | null>(null);

  // Query yang sama dengan MarketplaceServiceOrderDetail; React Query berbagi
  // cache sehingga timeline dan panel tidak melakukan fetch ganda.
  const fetchServiceOrder = useServerFn(getServiceOrderDetail);
  const { data: serviceOrder } = useQuery({
    queryKey: ["service-order", id],
    queryFn: () => fetchServiceOrder({ data: { orderId: id } }),
    enabled: data?.order?.order_type === "marketplace_service",
    refetchInterval: 15_000,
  });

  useRealtimeRefresh({
    channel: `order-${id}`,
    tables: [
      "orders",
      "payments",
      "operator_assignments",
      "job_progress",
      "job_results",
      "job_revisions",
      "order_status_histories",
      "marketplace_service_orders",
      "marketplace_service_deliveries",
      "marketplace_service_events",
    ],
    keys: [
      ["my-order", id],
      ["digital-receipt", id],
      ["order-fulfillment", id],
      ["service-order", id],
      ["my-orders"],
      ["customer-summary"],
    ],
  });

  if (isPending) return <AdminLoading label="Memuat pesanan…" />;
  if (error) return <AdminError />;
  if (!data.order) return <AdminError message="Pesanan tidak ditemukan." />;

  const order = data.order;
  const payment = data.payments[0];
  const canPay =
    order.status === "awaiting_payment" &&
    payment &&
    ["waiting_payment", "pending", "rejected"].includes(payment.status);

  // Metode pembayaran mengikuti saklar admin (satu sumber kebenaran di server).
  const manualEnabled = data.manualAvailable !== false && data.manualAccount.active;
  const sumopodEnabled = data.qrisAvailable === true;
  const shopeepayEnabled = data.shopeepayAvailable === true;
  const qrisEnabled = sumopodEnabled || shopeepayEnabled;
  // Provider QRIS: pilihan pembeli, lalu provider yang sedang dipakai tagihan ini.
  const qrisProvider: QrisProvider =
    qrisChoice && (qrisChoice === "shopeepay" ? shopeepayEnabled : sumopodEnabled)
      ? qrisChoice
      : payment?.provider === "shopeepay" && shopeepayEnabled
        ? "shopeepay"
        : sumopodEnabled
          ? "sumopod"
          : "shopeepay";

  const manualReady =
    manualEnabled &&
    payment &&
    canSubmitManualProof(payment, order.status, Date.now(), data.manualAccount.reuploadLimit) &&
    data.manualAccount.method.toLowerCase() === "dana" &&
    Boolean(data.manualAccount.number.trim() && data.manualAccount.holder.trim());

  // QRIS tampil bila diaktifkan admin DAN (pembeli memilihnya, ATAU metode manual
  // tidak siap). Bila admin mematikan QRIS, tidak ada cara menampilkannya.
  const showQris = qrisEnabled && (useQris || !manualReady);

  // Tidak ada satu pun metode yang bisa dipakai: beri tahu jujur, jangan diam.
  const noMethodAvailable = canPay && !manualReady && !qrisEnabled;
  const canCancel = order.status === "awaiting_payment";
  const canRefund =
    order.order_type !== "marketplace_service" && ["paid", "completed"].includes(order.status);
  // Sebelum bukti transfer diunggah, halaman hanya menampilkan item dan cara bayar.
  // Lini masa dan rincian jasa muncul setelah pembayaran masuk proses verifikasi.
  const showProgress =
    order.order_type !== "marketplace_service" ||
    ["payment_under_review", "paid", "completed", "refunded", "refund_processing"].includes(
      order.status,
    ) ||
    (payment ? payment.status !== "waiting_payment" && payment.status !== "pending" : false);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["my-order", id] });
    await queryClient.invalidateQueries({ queryKey: ["digital-receipt", id] });
    await queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    await queryClient.invalidateQueries({ queryKey: ["customer-summary"] });
    await queryClient.invalidateQueries({ queryKey: ["my-credit"] });
  }

  async function handleUseCredit() {
    setApplyingCredit(true);
    const result = await applyCredit({ data: { orderId: order.id } });
    setApplyingCredit(false);
    if (!result.ok) return toast.error(result.error);
    toast.success(
      `Saldo terpakai ${formatRupiah(result.credit_used)}. Sisa: ${formatRupiah(result.amount_due)}.`,
    );
    await refresh();
  }

  async function handleCancel() {
    if (reason.trim().length < 5) {
      toast.error("Alasan pembatalan minimal 5 karakter.");
      return;
    }
    setBusy(true);
    const result = await cancelOrder({ data: { orderId: order.id, reason: reason.trim() } });
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    toast.success("Pesanan dibatalkan.");
    setReason("");
    await refresh();
  }

  async function handleRefund() {
    if (reason.trim().length < 10) {
      toast.error("Alasan refund minimal 10 karakter.");
      return;
    }
    setBusy(true);
    try {
      const result = await requestRefund({ data: { orderId: order.id, reason: reason.trim() } });
      if (!result.ok) return toast.error(result.error);
      toast.success("Pengajuan refund dikirim ke admin.");
      setReason("");
      await refresh();
    } catch {
      toast.error("Pengajuan belum terpastikan. Muat ulang status sebelum mencoba kembali.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReview(decision: "approve" | "revision") {
    if (decision === "revision" && revisionReason.trim().length < 5) {
      return toast.error("Jelaskan alasan revisi minimal 5 karakter.");
    }
    setBusy(true);
    const result: any = await reviewResult({
      data: {
        orderId: order.id,
        decision,
        reason: decision === "revision" ? revisionReason.trim() : null,
      },
    });
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    toast.success(
      decision === "approve" ? "Hasil disetujui, pesanan selesai." : "Permintaan revisi dikirim.",
    );
    setRevisionReason("");
    await queryClient.invalidateQueries({ queryKey: ["order-fulfillment", id] });
    await refresh();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/dashboard/pesanan"
            search={{ filter: "all" }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Kembali ke daftar pesanan
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{order.order_number}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dibuat {new Date(order.created_at).toLocaleString("id-ID")}
          </p>
        </div>
        <Badge variant="secondary">{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
      </header>

      {/* Lini masa paling atas, lebar penuh: pelacakan adalah fokus halaman ini. */}
      {showProgress ? (
        <LiveOrderTimeline
          order={order}
          histories={data.histories ?? []}
          payments={data.payments ?? []}
          fulfillment={fulfillment}
          serviceEvents={serviceOrder?.events ?? []}
          serviceWorkState={serviceOrder?.contract?.work_state ?? null}
        />
      ) : null}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold">Item pesanan</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {data.items.map((item: any) => (
                <li key={item.id} className="flex justify-between gap-4">
                  <span>
                    {item.name_snapshot} ×{item.quantity}
                  </span>
                  <span>{formatRupiah(Number(item.total))}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd>{formatRupiah(Number(order.subtotal))}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Biaya admin</dt>
                <dd>{formatRupiah(Number(order.admin_fee))}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Total</dt>
                <dd>{formatRupiah(Number(order.total))}</dd>
              </div>
            </dl>
          </section>

          {canPay ? (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold">Pembayaran</h2>

              {/* Pakai saldo Ebrystore (opsional) */}
              {(credit?.balance ?? 0) > 0 && Number(order.credit_used ?? 0) === 0 ? (
                <div className="mt-3 rounded-lg border border-accent/40 bg-accent/5 p-3">
                  <p className="text-sm font-semibold text-foreground">Saldo Ebrystore tersedia</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Kamu punya saldo {formatRupiah(credit?.balance ?? 0)}. Pakai untuk mengurangi
                    tagihan pesanan ini.
                  </p>
                  <Button
                    size="sm"
                    className="mt-3 min-h-10"
                    disabled={applyingCredit}
                    onClick={handleUseCredit}
                  >
                    {applyingCredit
                      ? "Menerapkan…"
                      : `Pakai saldo ${formatRupiah(Math.min(credit?.balance ?? 0, Number(order.total)))}`}
                  </Button>
                </div>
              ) : null}

              {Number(order.credit_used ?? 0) > 0 ? (
                <div className="mt-3 rounded-lg border border-success/30 bg-success/5 p-3">
                  <p className="text-sm font-semibold text-foreground">Saldo terpakai</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatRupiah(Number(order.credit_used))} dari saldo · sisa tagihan{" "}
                    <strong>{formatRupiah(Number(order.amount_due ?? order.total))}</strong>
                  </p>
                </div>
              ) : null}

              {manualReady && !useQris ? (
                <ManualPayment
                  key={payment.id}
                  paymentId={payment.id}
                  amount={Number(payment.expected_amount)}
                  expiredAt={payment.expired_at}
                  submissionCount={payment.reupload_count}
                  account={data.manualAccount}
                  instruction={data.instruction}
                  onSubmitted={refresh}
                />
              ) : null}
              {manualReady && !useQris && qrisEnabled ? (
                <Button
                  variant="outline"
                  className="mt-4 min-h-11"
                  onClick={() => setUseQris(true)}
                >
                  Gunakan QRIS, bukan transfer manual
                </Button>
              ) : null}
              {useQris && manualReady && qrisEnabled ? (
                <Button variant="ghost" className="mt-4 min-h-11" onClick={() => setUseQris(false)}>
                  Kembali ke transfer manual
                </Button>
              ) : null}
              {showQris && sumopodEnabled && shopeepayEnabled ? (
                <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Penyedia QRIS">
                  {(
                    [
                      ["sumopod", "QRIS"],
                      ["shopeepay", "ShopeePay QRIS"],
                    ] as const
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      role="radio"
                      aria-checked={qrisProvider === value}
                      variant={qrisProvider === value ? "default" : "outline"}
                      className="min-h-11"
                      onClick={() => setQrisChoice(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              ) : null}
              {showQris ? (
                <div className="mt-4">
                  <QrisPayment
                    key={qrisProvider}
                    paymentId={payment.id}
                    provider={qrisProvider}
                    onPaid={refresh}
                  />
                </div>
              ) : null}
              {noMethodAvailable ? (
                <p className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-muted-foreground">
                  Belum ada metode pembayaran yang aktif. Hubungi tim Ebrystore untuk menyelesaikan
                  pembayaran pesanan ini.
                </p>
              ) : null}
            </section>
          ) : null}

          {payment?.provider === "manual" && payment.status === "waiting_verification" ? (
            <section className="rounded-xl border border-border bg-card p-5" role="status">
              <h2 className="font-semibold">Bukti sedang diperiksa</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Finance memeriksa transfer Anda. Pesanan belum lunas sampai pembayaran disetujui.
                Jangan transfer ulang saat pemeriksaan berlangsung.
              </p>
            </section>
          ) : null}

          {order.order_type === "service" && (fulfillment as any)?.assignment ? (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold">Pengerjaan</h2>
              <div className="mt-3">
                <AssignmentSummary
                  assignment={(fulfillment as any).assignment}
                  operatorName={(fulfillment as any).operatorName}
                />
              </div>
              <div className="mt-4">
                <ProgressList items={(fulfillment as any).progress ?? []} />
              </div>
            </section>
          ) : null}

          {order.order_type === "service" && ((fulfillment as any)?.results ?? []).length ? (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold">Hasil pekerjaan</h2>
              <div className="mt-3">
                <ResultList items={(fulfillment as any).results} />
              </div>

              {order.status === "waiting_customer_review" ? (
                <div className="mt-4 space-y-3 rounded-lg border border-border p-3">
                  <p className="text-sm font-semibold">Tinjau hasil pekerjaan</p>
                  <p className="text-xs text-muted-foreground">
                    Setujui bila hasil sudah sesuai, atau minta revisi dengan alasan yang jelas.
                    Jatah revisi gratis:{" "}
                    {(fulfillment as any)?.serviceDetail?.revision_allowance ?? 0}.
                  </p>
                  <Textarea
                    maxLength={1000}
                    value={revisionReason}
                    onChange={(e) => setRevisionReason(e.target.value)}
                    placeholder="Alasan revisi (wajib bila meminta revisi)"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={busy} onClick={() => handleReview("approve")}>
                      Setujui hasil
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => handleReview("revision")}
                    >
                      Minta revisi
                    </Button>
                  </div>
                </div>
              ) : null}

              {((fulfillment as any)?.revisions ?? []).length ? (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold">Riwayat revisi</h3>
                  <div className="mt-2">
                    <RevisionList items={(fulfillment as any).revisions} />
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {order.order_type === "digital_product" &&
          ["paid", "completed", "refund_requested", "refund_processing", "refunded"].includes(
            order.status,
          ) ? (
            <DigitalReceiptPanel orderId={order.id} onConfirmed={refresh} />
          ) : null}

          {showProgress && order.order_type === "marketplace_service" ? (
            <MarketplaceServiceOrderDetail orderId={order.id} embedded />
          ) : null}
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-semibold">Pembayaran</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {data.payments.map((p: any) => (
                <li key={p.id}>
                  <p className="font-medium">{p.payment_number}</p>
                  <p className="text-muted-foreground">
                    {PAYMENT_STATUS_LABEL[p.status] ?? p.status} ·{" "}
                    {formatRupiah(Number(p.expected_amount))}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {data.entitlements.length > 0 ? (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold">Akses produk</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Periksa ketersediaan berkas atau kode/link di pustaka Anda.
              </p>
              <Button asChild size="sm" className="mt-3">
                <Link to="/dashboard/produk-saya">Buka produk saya</Link>
              </Button>
            </section>
          ) : null}

          {canCancel || canRefund ? (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold">{canCancel ? "Batalkan pesanan" : "Ajukan refund"}</h2>
              <Label htmlFor="reason" className="mt-3 block">
                Alasan
              </Label>
              <Textarea
                id="reason"
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1"
                placeholder={
                  canCancel ? "Contoh: salah pilih produk" : "Jelaskan alasan pengajuan refund"
                }
              />
              <Button
                variant="outline"
                className="mt-3 w-full"
                disabled={busy}
                onClick={canCancel ? handleCancel : handleRefund}
              >
                {canCancel ? "Batalkan pesanan" : "Ajukan refund"}
              </Button>
              {canRefund ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Refund dapat diajukan maksimal 7 hari setelah pembayaran.
                </p>
              ) : null}
            </section>
          ) : null}

          {data.refunds.length > 0 ? (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold">Refund</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {data.refunds.map((r: any) => (
                  <li key={r.refund_number}>
                    {r.refund_number} · {r.status} · {formatRupiah(Number(r.amount))}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
