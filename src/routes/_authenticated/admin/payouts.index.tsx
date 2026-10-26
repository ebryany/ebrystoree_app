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
  useCan,
} from "@/components/admin/admin-ui";
import { StatusBadge, formatDateTime } from "@/components/admin/tx-ui";
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
import { listPayouts } from "@/lib/admin-payout.functions";
import { formatRupiah } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/payouts/")({
  head: () => ({
    meta: [
      { title: "Payout Seller — Admin Ebrystore" },
      {
        name: "description",
        content: "Antrean pengajuan penarikan saldo seller dan pemrosesan transfer manual.",
      },
      { property: "og:title", content: "Payout Seller — Admin Ebrystore" },
      { property: "og:description", content: "Antrean payout seller Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPayouts,
});

const STATUSES = [
  "requested",
  "approved",
  "transferred",
  "needs_reconciliation",
  "completed",
  "rejected",
  "cancelled",
];

function AdminPayouts() {
  const canView = useCan("payouts.view");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const fetchPayouts = useServerFn(listPayouts);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-payouts", status, search],
    queryFn: () => fetchPayouts({ data: { status, search } }),
  });

  if (!canView) return <ForbiddenState permission="payouts.view" />;
  if ((data as any)?.forbidden) return <ForbiddenState permission={(data as any).permission} />;

  const items = (data as any)?.items ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Payout Seller"
        crumb="Payout Seller"
        description="Pengajuan penarikan saldo seller. Transfer dilakukan manual dan wajib direkonsiliasi."
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs rounded-xl border border-border bg-card p-4">
          <Label htmlFor="payout-status">Status payout</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="payout-status">
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
        <div className="w-full max-w-xs rounded-xl border border-border bg-card p-4">
          <Label htmlFor="payout-search">Cari nomor</Label>
          <Input
            id="payout-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="WDR-…"
            className="tabular-nums"
          />
        </div>
      </div>

      {isPending ? (
        <AdminLoading />
      ) : error || (data as any)?.error ? (
        <AdminError message={(data as any)?.error ?? "Antrean payout tidak dapat dimuat."} />
      ) : !items.length ? (
        <EmptyRow message="Tidak ada pengajuan payout pada filter ini." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nomor</TableHead>
                <TableHead>Toko</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Bruto</TableHead>
                <TableHead className="text-right">Fee</TableHead>
                <TableHead className="text-right">Neto</TableHead>
                <TableHead>Rekening</TableHead>
                <TableHead>Diajukan</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((w: any) => (
                <TableRow key={w.id}>
                  <TableCell className="font-mono text-xs">{w.withdrawal_number}</TableCell>
                  <TableCell>{w.store_name}</TableCell>
                  <TableCell>
                    <StatusBadge value={w.status} kind="raw" />
                  </TableCell>
                  <TableCell className="text-right">{formatRupiah(w.gross_amount)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatRupiah(w.fee_amount)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatRupiah(w.net_amount)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {w.bank_name} <span className="tabular-nums">{w.bank_account_masked}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(w.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/admin/payouts/$id" params={{ id: w.id }}>
                        Detail
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
