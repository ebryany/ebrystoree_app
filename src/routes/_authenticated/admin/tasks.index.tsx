import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  Pager,
  useCan,
} from "@/components/admin/admin-ui";
import { StatusBadge, formatDateTime } from "@/components/admin/tx-ui";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listTasks, updateTask } from "@/lib/admin-transaction.functions";
import { TASK_TYPE_LABEL } from "@/lib/transaction-labels";

export const Route = createFileRoute("/_authenticated/admin/tasks/")({
  head: () => ({
    meta: [
      { title: "Task Operasional — Admin Ebrystore" },
      { name: "description", content: "Antrean pekerjaan operasional Ebrystore: verifikasi, penugasan, dan refund." },
      { property: "og:title", content: "Task Operasional — Admin Ebrystore" },
      { property: "og:description", content: "Kelola task operasional Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminTasks,
});

const PAGE_SIZE = 15;

function AdminTasks() {
  const qc = useQueryClient();
  const canView = useCan("tasks.view");
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("all");
  const [page, setPage] = useState(1);

  const fetchTasks = useServerFn(listTasks);
  const update = useServerFn(updateTask);

  const { data, isPending, error } = useQuery({
    queryKey: ["admin-tasks", status, page],
    queryFn: () => fetchTasks({ data: { status, page } }),
  });

  useRealtimeRefresh({
    channel: "admin-tasks",
    tables: ["admin_tasks"],
    keys: [["admin-tasks"]],
    enabled: canView,
  });

  const mutation = useMutation({
    mutationFn: (input: { taskId: string; action: "claim" | "complete" | "cancel" | "reopen" }) =>
      update({ data: input }),
    onSuccess: (res: any) => {
      if (res?.forbidden) return toast.error(`Izin ${res.permission} dibutuhkan.`);
      if (!res.ok) return toast.error(res.error);
      toast.success("Task diperbarui.");
      void qc.invalidateQueries({ queryKey: ["admin-tasks"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal memperbarui task."),
  });

  if (!canView) return <ForbiddenState permission="tasks.view" />;
  if ((data as any)?.forbidden) return <ForbiddenState permission={(data as any).permission} />;

  const all = (data as any)?.items ?? [];
  const items = all.filter(
    (t: any) =>
      (priority === "all" || t.priority === priority) &&
      (!search ||
        t.task_number.toLowerCase().includes(search.toLowerCase()) ||
        t.title.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Task Operasional" crumb="Task" description="Antrean pekerjaan tim operasional." />

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="task-search">Cari task</Label>
          <Input id="task-search" value={search} placeholder="TSK-… atau judul" onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="task-status">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger id="task-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua</SelectItem>
              <SelectItem value="open">Terbuka</SelectItem>
              <SelectItem value="in_progress">Dikerjakan</SelectItem>
              <SelectItem value="blocked">Terhambat</SelectItem>
              <SelectItem value="done">Selesai</SelectItem>
              <SelectItem value="cancelled">Dibatalkan</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="task-priority">Prioritas</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger id="task-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua prioritas</SelectItem>
              <SelectItem value="low">Rendah</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">Tinggi</SelectItem>
              <SelectItem value="urgent">Mendesak</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isPending ? (
        <AdminLoading />
      ) : error || (data as any)?.error ? (
        <AdminError message={(data as any)?.error ?? "Data task tidak dapat dimuat."} />
      ) : !items.length ? (
        <EmptyRow message="Tidak ada task pada filter ini." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor</TableHead>
                  <TableHead>Judul</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Prioritas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Jatuh tempo</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.task_number}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{t.title}</TableCell>
                    <TableCell>{TASK_TYPE_LABEL[t.task_type] ?? t.task_type}</TableCell>
                    <TableCell>{t.priority}</TableCell>
                    <TableCell>
                      <StatusBadge value={t.status} kind="raw" />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(t.due_at)}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      {t.status === "open" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={mutation.isPending}
                          onClick={() => mutation.mutate({ taskId: t.id, action: "claim" })}
                        >
                          Ambil
                        </Button>
                      ) : null}
                      <Button asChild size="sm" variant="outline">
                        <Link to="/admin/tasks/$id" params={{ id: t.id }}>
                          Detail
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} total={(data as any)?.total ?? 0} onChange={setPage} />
        </>
      )}
    </div>
  );
}
