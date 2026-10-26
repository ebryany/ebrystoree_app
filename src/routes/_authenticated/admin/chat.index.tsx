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
import { INQUIRY_STATUS_LABEL } from "@/components/inquiry/inquiry-thread";
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
import { listAllInquiries, listInquiryUnreadCounts } from "@/lib/inquiries.functions";

export const Route = createFileRoute("/_authenticated/admin/chat/")({
  head: () => ({
    meta: [
      { title: "Chat Produk — Admin Ebrystore" },
      {
        name: "description",
        content: "Jawab pertanyaan pelanggan tentang ketersediaan produk digital.",
      },
      { property: "og:title", content: "Chat Produk — Admin Ebrystore" },
      { property: "og:description", content: "Antrean pertanyaan pelanggan tentang produk." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminChatList,
});

const STATUSES = ["open", "answered", "closed"];

function AdminChatList() {
  const canView = useCan("orders.view");
  const [status, setStatus] = useState("all");
  const fetchList = useServerFn(listAllInquiries);
  const fetchUnread = useServerFn(listInquiryUnreadCounts);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["admin-inquiries", status],
    queryFn: () => fetchList({ data: { status } }),
  });
  const unreadQ = useQuery({ queryKey: ["inquiry-unread"], queryFn: () => fetchUnread({}) });

  useRealtimeRefresh({
    channel: "admin-inquiries",
    tables: ["product_inquiries", "product_inquiry_messages"],
    keys: [["admin-inquiries", status], ["inquiry-unread"]],
  });

  if (!canView) return <ForbiddenState />;

  const unreadById = new Map(
    (unreadQ.data?.items ?? []).map((row) => [row.inquiry_id, Number(row.unread)]),
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Chat Produk"
        crumb="Chat Produk"
        description="Pertanyaan pelanggan tentang ketersediaan dan detail produk digital."
      />

      <div className="flex items-end gap-3">
        <div>
          <Label htmlFor="filter-status">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="filter-status" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {INQUIRY_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isPending ? <AdminLoading /> : null}
      {error || data?.error ? <ErrorState onRetry={() => refetch()} /> : null}

      {data && !data.error ? (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subjek</TableHead>
                <TableHead>Pelanggan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pesan terakhir</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.length === 0 ? (
                <EmptyRow message="Belum ada pertanyaan produk." />
              ) : (
                data.items.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-[280px]">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{item.subject}</span>
                        {unreadById.get(item.id) ? (
                          <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold leading-5 text-primary-foreground tabular-nums">
                            {unreadById.get(item.id)! > 9 ? "9+" : unreadById.get(item.id)}
                          </span>
                        ) : null}
                      </span>
                      {item.last_message_body ? (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {item.last_message_body}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{item.customer_name}</TableCell>
                    <TableCell>
                      <StatusPill
                        value={item.status}
                        kind="raw"
                        label={INQUIRY_STATUS_LABEL[item.status]}
                      />
                    </TableCell>
                    <TableCell>{formatDateTime(item.last_message_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link to="/admin/chat/$id" params={{ id: item.id }}>
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
      ) : null}
    </div>
  );
}
