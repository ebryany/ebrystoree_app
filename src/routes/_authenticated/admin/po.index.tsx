import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  useCan,
} from "@/components/admin/admin-ui";
import { formatDateTime } from "@/components/admin/tx-ui";
import { ErrorState } from "@/components/ebry/states";
import { StatusPill } from "@/components/ebry/status";
import { PO_STATUS_LABEL } from "@/components/po/po-thread";
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
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { formatRupiah } from "@/lib/format";
import { listAllPoRequests } from "@/lib/po.functions";

export const Route = createFileRoute("/_authenticated/admin/po/")({
  head: () => ({
    meta: [
      { title: "PO Custom — Admin Ebrystore" },
      {
        name: "description",
        content:
          "Layanan platform: antrean permintaan produk custom (penawaran, DP, pengerjaan, pelunasan) yang dijalankan operator Ebrystore.",
      },
      { property: "og:title", content: "PO Custom — Admin Ebrystore" },
      {
        property: "og:description",
        content: "Kelola permintaan produk custom pelanggan Ebrystore.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPoList,
});

const STATUSES = [
  "submitted",
  "quoted",
  "dp_waiting",
  "in_progress",
  "delivered",
  "completed",
  "cancelled",
];

function AdminPoList() {
  const canView = useCan("orders.view");
  const [status, setStatus] = useState("all");
  const fetchList = useServerFn(listAllPoRequests);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["admin-po", status],
    queryFn: () => fetchList({ data: { status } }),
    enabled: canView,
  });

  useRealtimeRefresh({
    channel: "admin-po",
    tables: ["custom_orders", "po_payments"],
    keys: [["admin-po"]],
    enabled: canView,
  });

  if (!canView) return <ForbiddenState permission="orders.view" />;

  const items = ((data as any)?.items ?? []) as any[];

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="PO Custom"
        crumb="PO Custom"
        description="Permintaan produk custom dari pelanggan: diskusi, penawaran, DP, hingga pelunasan."
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Label htmlFor="po-status">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="po-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {PO_STATUS_LABEL[s] ?? s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isPending ? (
        <AdminLoading />
      ) : error ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nomor</TableHead>
                <TableHead>Pelanggan</TableHead>
                <TableHead>Judul</TableHead>
                <TableHead>Nilai</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pesan terakhir</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <EmptyRow message="Belum ada permintaan PO." />
              ) : (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.request_number}</TableCell>
                    <TableCell>{item.customer_name}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{item.title}</TableCell>
                    <TableCell>
                      {item.quoted_total ? formatRupiah(item.quoted_total) : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusPill
                        value={item.status}
                        label={PO_STATUS_LABEL[item.status] ?? item.status}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(item.last_message_at ?? item.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/admin/po/$id" params={{ id: item.id }}>
                          Buka
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
