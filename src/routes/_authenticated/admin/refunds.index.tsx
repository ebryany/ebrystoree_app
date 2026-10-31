import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, Undo2 } from "lucide-react";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  Pager,
  StatusTabs,
  useCan,
} from "@/components/admin/admin-ui";
import { StoreChip, StatusBadge, formatDateTime } from "@/components/admin/tx-ui";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { listRefunds } from "@/lib/admin-transaction.functions";
import { formatRupiah } from "@/lib/format";
import { ORDER_TYPE_LABEL } from "@/lib/transaction-labels";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/refunds/")({
  head: () => ({
    meta: [
      { title: "Refund — Admin Ebrystore" },
      {
        name: "description",
        content: "Tinjau, setujui, tolak, dan proses pengajuan refund Ebrystore.",
      },
      { property: "og:title", content: "Refund — Admin Ebrystore" },
      { property: "og:description", content: "Antrean pengajuan refund Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminRefunds,
});

const PAGE_SIZE = 15;
const TABS = [
  { value: "requested", label: "Diajukan" },
  { value: "under_review", label: "Ditinjau" },
  { value: "approved", label: "Disetujui" },
  { value: "processing", label: "Diproses" },
  { value: "completed", label: "Selesai" },
  { value: "rejected", label: "Ditolak" },
  { value: "all", label: "Semua" },
];
/** Status yang masih menunggu tindakan admin. */
const ACTIONABLE = ["requested", "under_review", "approved", "processing"];

function AdminRefunds() {
  const canView = useCan("refunds.view");
  const [status, setStatus] = useState("requested");
  const [page, setPage] = useState(1);

  const fetchRefunds = useServerFn(listRefunds);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-refunds", status, page],
    queryFn: () => fetchRefunds({ data: { status, page } }),
  });

  useRealtimeRefresh({
    channel: "admin-refunds",
    tables: ["refunds"],
    keys: [["admin-refunds"]],
    enabled: canView,
  });

  if (!canView) return <ForbiddenState permission="refunds.view" />;
  if ((data as any)?.forbidden) return <ForbiddenState permission={(data as any).permission} />;

  const items: any[] = (data as any)?.items ?? [];
  const total: number = (data as any)?.total ?? 0;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Refund"
        crumb="Refund"
        description="Pengajuan pengembalian dana dari pelanggan. Diperbarui otomatis."
      />

      <StatusTabs
        label="Status refund"
        value={status}
        options={TABS}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
      />

      {isPending ? (
        <AdminLoading />
      ) : error || (data as any)?.error ? (
        <AdminError message={(data as any)?.error ?? "Data refund tidak dapat dimuat."} />
      ) : !items.length ? (
        <EmptyRow
          message={
            status === "requested"
              ? "Tidak ada pengajuan refund baru."
              : "Tidak ada pengajuan refund pada filter ini."
          }
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground tabular-nums">{total} pengajuan</p>
          <ul className="space-y-2" aria-label="Daftar refund">
            {items.map((r) => {
              const actionable = ACTIONABLE.includes(r.status);
              return (
                <li key={r.id}>
                  <Link
                    to="/admin/refunds/$id"
                    params={{ id: r.id }}
                    aria-label={`Refund ${r.refund_number}`}
                    className={cn(
                      "group flex min-w-0 items-center gap-3 rounded-xl border bg-card px-4 py-3.5 transition-colors hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                      r.status === "requested" ? "border-warning/50" : "border-border",
                    )}
                  >
                    <span
                      className={cn(
                        "hidden size-10 shrink-0 place-items-center rounded-lg min-[400px]:grid",
                        actionable
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Undo2 className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                        <div className="min-w-0">
                          <p className="break-all font-mono text-xs font-semibold">
                            {r.refund_number}
                          </p>
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">
                            Order{" "}
                            <span className="font-mono text-xs text-foreground">
                              {r.orders?.order_number ?? "-"}
                            </span>
                            {r.orders?.order_type
                              ? ` · ${ORDER_TYPE_LABEL[r.orders.order_type] ?? r.orders.order_type}`
                              : ""}
                          </p>
                        </div>
                        <p className="shrink-0 text-base font-bold tabular-nums text-price">
                          {formatRupiah(Number(r.amount))}
                        </p>
                      </div>
                      {r.reason ? (
                        <p className="mt-1.5 line-clamp-1 text-sm text-muted-foreground">
                          “{r.reason}”
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                        <StatusBadge value={r.status} kind="raw" />
                        <StoreChip name={r.storeName} />
                        <span className="tabular-nums">
                          Diajukan {formatDateTime(r.requested_at ?? r.created_at)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pager page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
        </>
      )}
    </div>
  );
}
