import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  Pager,
  useCan,
} from "@/components/admin/admin-ui";
import { StoreChip, StatusBadge, formatDateTime } from "@/components/admin/tx-ui";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { Button } from "@/components/ui/button";
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
import { listRefunds } from "@/lib/admin-transaction.functions";
import { formatRupiah } from "@/lib/format";

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
const STATUSES = ["requested", "under_review", "approved", "rejected", "processing", "completed"];

function AdminRefunds() {
  const canView = useCan("refunds.view");
  const [status, setStatus] = useState("all");
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

  const items = (data as any)?.items ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Refund"
        crumb="Refund"
        description="Pengajuan pengembalian dana dari pelanggan."
      />

      <div className="w-full max-w-xs rounded-xl border border-border bg-card p-4">
        <Label htmlFor="refund-status">Status refund</Label>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger id="refund-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <AdminLoading />
      ) : error || (data as any)?.error ? (
        <AdminError message={(data as any)?.error ?? "Data refund tidak dapat dimuat."} />
      ) : !items.length ? (
        <EmptyRow message="Tidak ada pengajuan refund pada filter ini." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Toko</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Nominal</TableHead>
                  <TableHead>Diajukan</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.refund_number}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.orders?.order_number ?? "-"}
                    </TableCell>
                    <TableCell>
                      <StoreChip name={r.storeName} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={r.status} kind="raw" />
                    </TableCell>
                    <TableCell className="text-right">{formatRupiah(Number(r.amount))}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(r.requested_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/admin/refunds/$id" params={{ id: r.id }}>
                          Detail
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={(data as any)?.total ?? 0}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}
