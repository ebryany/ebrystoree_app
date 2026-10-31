import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  Package,
  QrCode,
  Wallet,
} from "lucide-react";

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
import { StatusPill } from "@/components/ebry/status";
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
import { PAYMENT_STATUS_LABEL } from "@/lib/transaction-labels";
import { cn } from "@/lib/utils";

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
    // Tanpa toast sukses: kartu notifikasi "Pesanan dibatalkan" dari server sudah muncul.
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

  const amountDue = Number(order.amount_due ?? order.total);
  const creditUsed = Number(order.credit_used ?? 0);
  const balance = credit?.balance ?? 0;
  const creditCoversAll = balance >= amountDue;
  const showMethodSwitch = manualReady && qrisEnabled;

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="min-w-0">
        <Link
          to="/dashboard/pesanan"
          search={{ filter: "all" }}
          className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Daftar pesanan
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="min-w-0 break-all font-display text-xl font-bold tracking-tight sm:text-2xl">
            {order.order_number}
          </h1>
          <StatusPill value={order.status} kind="order" />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Dibuat{" "}
          {new Date(order.created_at).toLocaleString("id-ID", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
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
          realtimeChannel={`order-${id}`}
        />
      ) : null}

      <div className="grid min-w-0 gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-5 sm:space-y-6">
          {canPay ? (
            <section
              aria-labelledby="pay-title"
              className="rounded-2xl border border-border bg-card p-4 sm:p-6"
            >
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                <div>
                  <h2 id="pay-title" className="font-display text-lg font-semibold">
                    Selesaikan pembayaran
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Pesanan diproses setelah pembayaran terverifikasi.
                  </p>
                </div>
                <p className="text-right">
                  <span className="block text-xs text-muted-foreground">Sisa tagihan</span>
                  <span className="font-display text-xl font-bold tabular-nums">
                    {formatRupiah(amountDue)}
                  </span>
                </p>
              </div>

              {/* Pakai saldo Ebrystore (opsional) */}
              {balance > 0 && creditUsed === 0 ? (
                <div className="mt-4 flex flex-col gap-3 rounded-xl border border-accent/40 bg-accent/5 p-3.5 sm:flex-row sm:items-center">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                    <Wallet className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Saldo Ebrystore {formatRupiah(balance)}</p>
                    <p className="text-xs text-muted-foreground">
                      {creditCoversAll
                        ? "Cukup untuk melunasi pesanan ini tanpa transfer."
                        : "Pakai untuk mengurangi tagihan, sisanya dibayar di bawah."}
                    </p>
                  </div>
                  <Button
                    className="min-h-11 w-full sm:w-auto"
                    disabled={applyingCredit}
                    onClick={handleUseCredit}
                  >
                    {applyingCredit ? (
                      <>
                        <Loader2
                          className="size-4 animate-spin motion-reduce:animate-none"
                          aria-hidden="true"
                        />
                        Menerapkan…
                      </>
                    ) : creditCoversAll ? (
                      `Bayar pakai saldo`
                    ) : (
                      `Pakai saldo ${formatRupiah(Math.min(balance, amountDue))}`
                    )}
                  </Button>
                </div>
              ) : null}

              {creditUsed > 0 ? (
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 p-3.5">
                  <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
                  <p className="text-sm">
                    Saldo terpakai <strong>{formatRupiah(creditUsed)}</strong>. Sisa tagihan{" "}
                    <strong>{formatRupiah(amountDue)}</strong>.
                  </p>
                </div>
              ) : null}

              {balance > 0 && creditUsed === 0 && (manualReady || qrisEnabled) ? (
                <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  atau bayar langsung
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                </div>
              ) : (
                <div className="h-5" aria-hidden="true" />
              )}

              {showMethodSwitch ? (
                <div
                  role="radiogroup"
                  aria-label="Metode pembayaran"
                  className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
                >
                  {(
                    [
                      [false, `Transfer ${data.manualAccount.method}`, Banknote],
                      [true, "QRIS", QrCode],
                    ] as const
                  ).map(([value, label, Icon]) => (
                    <button
                      key={label}
                      type="button"
                      role="radio"
                      aria-checked={useQris === value}
                      onClick={() => setUseQris(value)}
                      className={cn(
                        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                        useQris === value
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      {label}
                    </button>
                  ))}
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
              {showQris && sumopodEnabled && shopeepayEnabled ? (
                <div
                  className="grid grid-cols-2 gap-2"
                  role="radiogroup"
                  aria-label="Penyedia QRIS"
                >
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
                <div className={sumopodEnabled && shopeepayEnabled ? "mt-4" : undefined}>
                  <QrisPayment
                    key={qrisProvider}
                    paymentId={payment.id}
                    provider={qrisProvider}
                    onPaid={refresh}
                  />
                </div>
              ) : null}
              {noMethodAvailable ? (
                <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-muted-foreground">
                  Belum ada metode pembayaran yang aktif. Hubungi tim Ebrystore untuk menyelesaikan
                  pembayaran pesanan ini.
                </p>
              ) : null}
            </section>
          ) : null}

          {payment?.provider === "manual" && payment.status === "waiting_verification" ? (
            <section
              className="flex gap-3 rounded-2xl border border-info/30 bg-info/5 p-4 sm:p-5"
              role="status"
            >
              <Clock className="mt-0.5 size-5 shrink-0 text-info" aria-hidden="true" />
              <div>
                <h2 className="font-semibold">Bukti sedang diperiksa</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Finance memeriksa transfer Anda. Pesanan belum lunas sampai pembayaran disetujui.
                  Jangan transfer ulang saat pemeriksaan berlangsung; halaman ini diperbarui
                  otomatis.
                </p>
              </div>
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

        <aside className="min-w-0 space-y-5 sm:space-y-6 lg:sticky lg:top-20">
          <section
            aria-labelledby="summary-title"
            className="rounded-2xl border border-border bg-card p-4 sm:p-5"
          >
            <h2 id="summary-title" className="font-semibold">
              Ringkasan pesanan
            </h2>
            <ul className="mt-3 space-y-3">
              {data.items.map((item: any) => (
                <li key={item.id} className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <Package className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium leading-snug">
                      {item.name_snapshot}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {item.quantity} ×{" "}
                      {formatRupiah(Number(item.total) / Number(item.quantity || 1))}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-medium tabular-nums">
                    {formatRupiah(Number(item.total))}
                  </p>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatRupiah(Number(order.subtotal))}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Biaya admin</dt>
                <dd className="tabular-nums">{formatRupiah(Number(order.admin_fee))}</dd>
              </div>
              {creditUsed > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Saldo terpakai</dt>
                  <dd className="tabular-nums text-success">−{formatRupiah(creditUsed)}</dd>
                </div>
              ) : null}
              <div className="flex items-end justify-between gap-4 pt-1">
                <dt className="font-semibold">Total</dt>
                <dd className="font-display text-lg font-bold tabular-nums">
                  {formatRupiah(Number(order.total))}
                </dd>
              </div>
            </dl>

            {data.payments.length > 0 ? (
              <div className="mt-4 border-t border-border pt-3">
                <h3 className="text-xs font-semibold text-muted-foreground">Tagihan</h3>
                <ul className="mt-2 space-y-2">
                  {data.payments.map((p: any) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs">{p.payment_number}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatRupiah(Number(p.expected_amount))}
                        </p>
                      </div>
                      <StatusPill
                        value={p.status}
                        kind="payment"
                        label={PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
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
            // Aksi destruktif dilipat agar tidak bersaing dengan langkah utama (bayar).
            <details
              className="group rounded-2xl border border-border bg-card"
              open={reason.length > 0 || undefined}
            >
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring sm:px-5 [&::-webkit-details-marker]:hidden">
                {canCancel ? "Ingin membatalkan pesanan?" : "Ajukan refund"}
                <ChevronDown
                  className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <div className="border-t border-border p-4 sm:p-5">
                <Label htmlFor="reason">Alasan</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  maxLength={500}
                  rows={3}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1.5"
                  placeholder={
                    canCancel ? "Contoh: salah pilih produk" : "Jelaskan alasan pengajuan refund"
                  }
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {canCancel
                    ? "Pesanan yang dibatalkan tidak dapat dipulihkan. Jangan batalkan bila sudah transfer."
                    : "Refund dapat diajukan maksimal 7 hari setelah pembayaran."}
                </p>
                <Button
                  variant={canCancel ? "destructive" : "outline"}
                  className="mt-3 min-h-11 w-full"
                  disabled={busy}
                  onClick={canCancel ? handleCancel : handleRefund}
                >
                  {busy ? "Memproses…" : canCancel ? "Batalkan pesanan" : "Ajukan refund"}
                </Button>
              </div>
            </details>
          ) : null}

          {data.refunds.length > 0 ? (
            <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <h2 className="font-semibold">Refund</h2>
              <ul className="mt-3 space-y-2">
                {data.refunds.map((r: any) => (
                  <li
                    key={r.refund_number}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs">{r.refund_number}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatRupiah(Number(r.amount))}
                      </p>
                    </div>
                    <StatusPill value={r.status} kind="raw" />
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
