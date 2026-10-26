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
import { Input } from "@/components/ui/input";
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
import { listPayments } from "@/lib/admin-transaction.functions";
import { PAYMENT_STATUS_LABEL } from "@/lib/transaction-labels";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/payments/")({
  head: () => ({
    meta: [
      { title: "Pembayaran — Admin Ebrystore" },
      {
        name: "description",
        content: "Verifikasi pembayaran manual dan pantau status transaksi Ebrystore.",
      },
      { property: "og:title", content: "Pembayaran — Admin Ebrystore" },
      { property: "og:description", content: "Antrean verifikasi pembayaran Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPayments,
});

const PAGE_SIZE = 15;

function AdminPayments() {
  const canView = useCan("payments.view");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("waiting_verification");
  const [method, setMethod] = useState("all");
  const [page, setPage] = useState(1);

  const fetchPayments = useServerFn(listPayments);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-payments", search, status, page],
    queryFn: () => fetchPayments({ data: { search, status, page } }),
  });

  useRealtimeRefresh({
    channel: "admin-payments",
    tables: ["payments", "manual_payment_proofs", "payment_verifications"],
    keys: [["admin-payments"]],
    enabled: canView,
  });

  if (!canView) return <ForbiddenState permission="payments.view" />;
  if ((data as any)?.forbidden) return <ForbiddenState permission={(data as any).permission} />;

  const all = (data as any)?.items ?? [];
  const items = method === "all" ? all : all.filter((p: any) => p.method === method);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Pembayaran"
        crumb="Pembayaran"
        description="Antrean verifikasi dan riwayat pembayaran."
      />

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="pay-search">Cari nomor pembayaran</Label>
          <Input
            id="pay-search"
            value={search}
            placeholder="PAY-…"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <Label htmlFor="pay-status">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger id="pay-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              {Object.entries(PAYMENT_STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="pay-method">Metode</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger id="pay-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua metode</SelectItem>
              <SelectItem value="manual_transfer">Transfer manual (DANA)</SelectItem>
              <SelectItem value="qris">QRIS</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isPending ? (
        <AdminLoading />
      ) : error || (data as any)?.error ? (
        <AdminError message={(data as any)?.error ?? "Data pembayaran tidak dapat dimuat."} />
      ) : !items.length ? (
        <EmptyRow message="Tidak ada pembayaran pada filter ini." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Toko</TableHead>
                  <TableHead>Metode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Nominal</TableHead>
                  <TableHead>Kedaluwarsa</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.payment_number}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {p.orders?.order_number ?? "-"}
                    </TableCell>
                    <TableCell>
                      <StoreChip name={p.storeName} />
                    </TableCell>
                    <TableCell>{p.method}</TableCell>
                    <TableCell>
                      <StatusBadge value={p.status} kind="payment" />
                    </TableCell>
                    <TableCell className="text-right">
                      {formatRupiah(Number(p.expected_amount))}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(p.expired_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/admin/payments/$id" params={{ id: p.id }}>
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
