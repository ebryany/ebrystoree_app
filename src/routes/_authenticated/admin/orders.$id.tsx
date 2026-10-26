import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  useCan,
} from "@/components/admin/admin-ui";
import { DetailCard, Field, StatusBadge, formatDateTime } from "@/components/admin/tx-ui";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { AssignOperatorDialog } from "@/components/admin/assign-operator-dialog";
import { ProgressList, ResultList, RevisionList } from "@/components/fulfillment/fulfillment-panel";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getOrderDetail } from "@/lib/admin-transaction.functions";
import { OrderMonitoringDetail } from "@/components/ebry/order-monitoring";
import { getOrderFulfillment } from "@/lib/fulfillment.functions";
import { ORDER_TYPE_LABEL, TASK_TYPE_LABEL } from "@/lib/transaction-labels";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/orders/$id")({
  head: () => ({
    meta: [
      { title: "Detail Order — Admin Ebrystore" },
      {
        name: "description",
        content: "Detail order Ebrystore: item, invoice, pembayaran, timeline, dan audit.",
      },
      { property: "og:title", content: "Detail Order — Admin Ebrystore" },
      { property: "og:description", content: "Rincian lengkap satu order Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminOrderDetail,
});

function AdminOrderDetail() {
  const { id } = Route.useParams();
  const canView = useCan("orders.view");
  const canAssign = useCan("orders.assign");
  const fetchDetail = useServerFn(getOrderDetail);
  const fetchFulfillment = useServerFn(getOrderFulfillment);

  const { data, isPending, error } = useQuery({
    queryKey: ["admin-order", id],
    queryFn: () => fetchDetail({ data: { id } }),
  });

  const { data: fulfillment } = useQuery({
    queryKey: ["order-fulfillment", id],
    queryFn: () => fetchFulfillment({ data: { orderId: id } }),
    enabled: canView,
  });

  useRealtimeRefresh({
    channel: `admin-order-${id}`,
    tables: [
      "orders",
      "payments",
      "order_status_histories",
      "job_progress",
      "job_results",
      "job_revisions",
      "operator_assignments",
    ],
    keys: [
      ["admin-order", id],
      ["order-fulfillment", id],
    ],
    enabled: canView,
  });

  if (!canView) return <ForbiddenState permission="orders.view" />;
  if (isPending) return <AdminLoading />;
  if ((data as any)?.forbidden) return <ForbiddenState permission={(data as any).permission} />;
  if (error || (data as any)?.error)
    return <AdminError message={(data as any)?.error ?? "Order tidak dapat dimuat."} />;

  const d = data as any;
  const order = d.order;
  if (!order) return <AdminError message="Order tidak ditemukan." />;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={order.order_number}
        crumb="Detail order"
        description={`${ORDER_TYPE_LABEL[order.order_type] ?? order.order_type} · dibuat ${formatDateTime(order.created_at)}`}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/orders">Kembali</Link>
          </Button>
        }
      />

      <DetailCard title="Ringkasan">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Status order">
            <StatusBadge value={order.status} />
          </Field>
          <Field label="Total">{formatRupiah(Number(order.total))}</Field>
          <Field label="Biaya admin">{formatRupiah(Number(order.admin_fee))}</Field>
          <Field label="Diskon">{formatRupiah(Number(order.discount_total))}</Field>
          <Field label="Customer">{d.customer?.full_name ?? "-"}</Field>
          <Field label="Email">{d.customer?.email ?? "-"}</Field>
          <Field label="Telepon">{d.customer?.phone ?? "-"}</Field>
          <Field label="Kedaluwarsa">{formatDateTime(order.expired_at)}</Field>
          <Field label="Dibayar">{formatDateTime(order.paid_at)}</Field>
          <Field label="Selesai">{formatDateTime(order.completed_at)}</Field>
          <Field label="Invoice">{d.invoice?.invoice_number ?? "Belum terbit"}</Field>
          <Field label="Status invoice">{d.invoice?.status ?? "-"}</Field>
        </dl>
      </DetailCard>

      {/* Ringkasan tindakan: apa yang menunggu admin pada order ini. */}
      {(() => {
        const paymentStatus = d.payments?.[0]?.status ?? null;
        if (order.status === "payment_under_review" || paymentStatus === "waiting_verification") {
          return (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/50 bg-warning/10 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Pembayaran menunggu verifikasi</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Periksa bukti transfer lalu setujui atau tolak dari halaman pembayaran.
                </p>
              </div>
              {d.payments?.[0] ? (
                <Button asChild className="min-h-11 shrink-0">
                  <Link to="/admin/payments/$id" params={{ id: d.payments[0].id }}>
                    Buka pembayaran
                  </Link>
                </Button>
              ) : null}
            </section>
          );
        }
        if (["refund_requested", "refund_processing", "disputed"].includes(order.status)) {
          return (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {order.status === "disputed"
                    ? "Sengketa perlu keputusan"
                    : "Refund sedang berjalan"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Dana ditahan sampai keputusan admin tercatat.
                </p>
              </div>
              <Button asChild variant="outline" className="min-h-11 shrink-0">
                <Link to="/admin/refunds">Lihat refund</Link>
              </Button>
            </section>
          );
        }
        return null;
      })()}

      {/* Kontrak jasa seller: kesepakatan, kebutuhan pembeli, tenggat, hasil. */}
      {order.order_type === "marketplace_service" ? (
        <DetailCard
          title="Kontrak jasa seller"
          description={
            d.serviceStore ? `Toko ${d.serviceStore.name}` : "Kontrak antara pembeli dan seller"
          }
        >
          {!d.serviceContract ? (
            <EmptyRow message="Kontrak jasa belum tersedia untuk order ini." />
          ) : (
            <div className="space-y-4">
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Status pengerjaan">
                  <StatusBadge value={d.serviceContract.work_state} kind="raw" />
                </Field>
                <Field label="Revisi">
                  {d.serviceContract.revision_used}/{d.serviceContract.revision_limit}
                </Field>
                <Field label="Tenggat">{formatDateTime(d.serviceContract.due_at)}</Field>
                <Field label="Komplain">
                  {d.serviceContract.complaint_open ? "Aktif" : "Tidak ada"}
                </Field>
              </dl>

              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["Lingkup pekerjaan", d.serviceContract.agreement?.scope],
                    ["Tidak termasuk", d.serviceContract.agreement?.exclusions],
                    ["Hasil yang diserahkan", d.serviceContract.agreement?.deliverable],
                    ["Data dari pembeli", d.serviceContract.agreement?.requirements],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border p-3">
                    <p className="text-xs font-medium text-muted-foreground">{label}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">{value ?? "-"}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Kebutuhan yang dikirim pembeli
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                  {d.serviceContract.requirements?.note ?? "Belum diisi."}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground">Hasil pekerjaan</p>
                {!d.serviceDeliveries.length ? (
                  <p className="mt-1 text-sm text-muted-foreground">Seller belum mengirim hasil.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {d.serviceDeliveries.map((delivery: any) => (
                      <li
                        key={delivery.id}
                        className="rounded-lg border border-border px-3 py-2.5 text-sm"
                      >
                        <p className="font-medium tabular-nums">
                          Versi {delivery.version} ·{" "}
                          {delivery.kind === "file"
                            ? "berkas"
                            : delivery.kind === "link"
                              ? "tautan"
                              : "catatan"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDateTime(delivery.created_at)}
                          {delivery.original_name ? ` · ${delivery.original_name}` : ""}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                          {delivery.summary}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DetailCard>
      ) : null}

      {order.order_type === "digital_product" ? <OrderMonitoringDetail id={id} /> : null}

      <DetailCard title="Item order">
        {!d.items.length ? (
          <EmptyRow message="Tidak ada item." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead className="text-right">Harga</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.items.map((it: any) => (
                <TableRow key={it.id}>
                  <TableCell>{it.name_snapshot}</TableCell>
                  <TableCell>{it.item_type}</TableCell>
                  <TableCell className="text-right">
                    {formatRupiah(Number(it.unit_price))}
                  </TableCell>
                  <TableCell className="text-right">{it.quantity}</TableCell>
                  <TableCell className="text-right">{formatRupiah(Number(it.total))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DetailCard>

      <DetailCard title="Pembayaran">
        {!d.payments.length ? (
          <EmptyRow message="Belum ada pembayaran." />
        ) : (
          <ul className="space-y-2">
            {d.payments.map((p: any) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs">{p.payment_number}</p>
                  <p className="text-sm text-muted-foreground">
                    {p.method} · {formatRupiah(Number(p.expected_amount))}
                  </p>
                </div>
                <StatusBadge value={p.status} kind="payment" />
                <Button asChild size="sm" variant="outline">
                  <Link to="/admin/payments/$id" params={{ id: p.id }}>
                    Buka pembayaran
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DetailCard>

      {order.order_type === "service" ? (
        <DetailCard title="Detail layanan">
          {!d.serviceDetail ? (
            <EmptyRow message="Belum ada detail layanan." />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Estimasi hari">{d.serviceDetail.estimated_days}</Field>
              <Field label="Jatah revisi">{d.serviceDetail.revision_allowance}</Field>
              <Field label="Deadline customer">
                {formatDateTime(d.serviceDetail.customer_deadline)}
              </Field>
              <Field label="Kebutuhan lengkap">
                {d.serviceDetail.requirements_complete ? "Ya" : "Belum"}
              </Field>
              <div className="sm:col-span-2 lg:col-span-4">
                <Field label="Catatan kebutuhan">{d.serviceDetail.requirements_note ?? "-"}</Field>
              </div>
            </dl>
          )}
        </DetailCard>
      ) : null}

      <DetailCard
        title="Penugasan operator"
        actions={
          order.order_type === "service" && order.status === "waiting_assignment" && canAssign ? (
            <AssignOperatorDialog orderId={order.id} orderNumber={order.order_number} />
          ) : null
        }
      >
        {!d.assignments.length ? (
          <EmptyRow message="Belum ada operator yang ditugaskan." />
        ) : (
          <ul className="space-y-2 text-sm">
            {d.assignments.map((a: any) => (
              <li key={a.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge value={a.status} kind="raw" />
                  <span className="text-muted-foreground">
                    Ditugaskan {formatDateTime(a.assigned_at)}
                  </span>
                  {(fulfillment as any)?.operatorName ? (
                    <span className="font-medium">{(fulfillment as any).operatorName}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-muted-foreground">
                  Deadline: {formatDateTime(a.deadline_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DetailCard>

      {order.order_type === "service" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <DetailCard title="Progres pengerjaan">
            <ProgressList items={(fulfillment as any)?.progress ?? []} showInternal />
          </DetailCard>
          <div className="space-y-6">
            <DetailCard title="Hasil pekerjaan">
              <ResultList items={(fulfillment as any)?.results ?? []} />
            </DetailCard>
            <DetailCard title="Permintaan revisi">
              <RevisionList items={(fulfillment as any)?.revisions ?? []} />
            </DetailCard>
          </div>
        </div>
      ) : null}

      <DetailCard title="Timeline status">
        {!d.histories.length ? (
          <EmptyRow message="Belum ada riwayat status." />
        ) : (
          <ol className="space-y-3 border-l border-border pl-4">
            {d.histories.map((h: any) => (
              <li key={h.id} className="relative">
                <span
                  className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary"
                  aria-hidden="true"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge value={h.new_status} />
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(h.created_at)}
                  </span>
                </div>
                {h.public_note ? <p className="mt-1 text-sm">{h.public_note}</p> : null}
                {h.internal_note ? (
                  <p className="mt-1 text-sm text-muted-foreground">Internal: {h.internal_note}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </DetailCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailCard title="Catatan">
          <dl className="space-y-3">
            <Field label="Catatan customer">{order.customer_note ?? "-"}</Field>
            <Field label="Catatan internal">{order.internal_note ?? "-"}</Field>
            <Field label="Alasan pembatalan">{order.cancellation_reason ?? "-"}</Field>
          </dl>
        </DetailCard>

        <DetailCard title="Refund & entitlement">
          <div className="space-y-3 text-sm">
            {d.refunds.length ? (
              d.refunds.map((r: any) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <span className="font-mono text-xs">{r.refund_number}</span>
                  <StatusBadge value={r.status} kind="raw" />
                  <Button asChild size="sm" variant="outline">
                    <Link to="/admin/refunds/$id" params={{ id: r.id }}>
                      Detail
                    </Link>
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">Tidak ada refund.</p>
            )}
            {d.entitlements.length ? (
              <p className="text-muted-foreground">
                {d.entitlements.length} entitlement aktif · unduhan{" "}
                {d.entitlements.reduce((s: number, e: any) => s + e.download_count, 0)} dari{" "}
                {d.entitlements.reduce((s: number, e: any) => s + e.download_limit, 0)}
              </p>
            ) : null}
          </div>
        </DetailCard>
      </div>

      <DetailCard title="Task terkait">
        {!d.tasks.length ? (
          <EmptyRow message="Tidak ada task terkait." />
        ) : (
          <ul className="space-y-2 text-sm">
            {d.tasks.map((t: any) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <span>
                  <span className="font-mono text-xs">{t.task_number}</span> ·{" "}
                  {TASK_TYPE_LABEL[t.task_type] ?? t.task_type}
                </span>
                <StatusBadge value={t.status} kind="raw" />
                <Button asChild size="sm" variant="outline">
                  <Link to="/admin/tasks/$id" params={{ id: t.id }}>
                    Buka task
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DetailCard>

      <DetailCard title="Aktivitas audit">
        {!d.audits.length ? (
          <EmptyRow message="Belum ada aktivitas audit untuk order ini." />
        ) : (
          <ul className="space-y-2 text-sm">
            {d.audits.map((a: any) => (
              <li key={a.id} className="rounded-lg border border-border p-3">
                <p className="font-medium">{a.action}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(a.created_at)} · {a.actor_role ?? "sistem"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DetailCard>
    </div>
  );
}
