import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { AdminError, AdminLoading, AdminPageHeader, EmptyRow, ForbiddenState, useCan } from "@/components/admin/admin-ui";
import { DetailCard, Field, StatusBadge, formatDateTime } from "@/components/admin/tx-ui";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getTaskDetail, updateTask } from "@/lib/admin-transaction.functions";
import { TASK_TYPE_LABEL } from "@/lib/transaction-labels";

export const Route = createFileRoute("/_authenticated/admin/tasks/$id")({
  head: () => ({
    meta: [
      { title: "Detail Task — Admin Ebrystore" },
      { name: "description", content: "Rincian task operasional Ebrystore beserta sumber dan riwayatnya." },
      { property: "og:title", content: "Detail Task — Admin Ebrystore" },
      { property: "og:description", content: "Kelola satu task operasional Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminTaskDetail,
});

const ACTIONS: { action: "claim" | "complete" | "cancel" | "reopen"; label: string; variant?: "destructive" | "outline" }[] = [
  { action: "claim", label: "Ambil task", variant: "outline" },
  { action: "complete", label: "Selesaikan" },
  { action: "reopen", label: "Buka kembali", variant: "outline" },
  { action: "cancel", label: "Batalkan", variant: "destructive" },
];

function AdminTaskDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const canView = useCan("tasks.view");
  const [note, setNote] = useState("");

  const fetchDetail = useServerFn(getTaskDetail);
  const update = useServerFn(updateTask);

  const { data, isPending, error } = useQuery({
    queryKey: ["admin-task", id],
    queryFn: () => fetchDetail({ data: { id } }),
  });

  useRealtimeRefresh({
    channel: `admin-task-${id}`,
    tables: ["admin_tasks"],
    keys: [["admin-task", id], ["admin-tasks"]],
    enabled: canView,
  });

  const mutation = useMutation({
    mutationFn: (action: "claim" | "complete" | "cancel" | "reopen") =>
      update({ data: { taskId: id, action, note: note || undefined } }),
    onSuccess: (res: any) => {
      if (res?.forbidden) return toast.error(`Izin ${res.permission} dibutuhkan.`);
      if (!res.ok) return toast.error(res.error);
      toast.success("Task diperbarui.");
      setNote("");
      void qc.invalidateQueries({ queryKey: ["admin-task", id] });
      void qc.invalidateQueries({ queryKey: ["admin-tasks"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal memperbarui task."),
  });

  if (!canView) return <ForbiddenState permission="tasks.view" />;
  if (isPending) return <AdminLoading />;
  if ((data as any)?.forbidden) return <ForbiddenState permission={(data as any).permission} />;
  if (error || (data as any)?.error) return <AdminError message={(data as any)?.error ?? "Task tidak dapat dimuat."} />;

  const d = data as any;
  const t = d.task;
  if (!t) return <AdminError message="Task tidak ditemukan." />;

  const finished = ["done", "cancelled"].includes(t.status);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t.title}
        crumb="Detail task"
        description={`${t.task_number} · ${TASK_TYPE_LABEL[t.task_type] ?? t.task_type}`}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/tasks">Kembali</Link>
          </Button>
        }
      />

      <DetailCard title="Ringkasan">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Status">
            <StatusBadge value={t.status} kind="raw" />
          </Field>
          <Field label="Prioritas">{t.priority}</Field>
          <Field label="Jatuh tempo">{formatDateTime(t.due_at)}</Field>
          <Field label="Selesai">{formatDateTime(t.completed_at)}</Field>
          <Field label="Penerima">{d.assignee?.full_name ?? d.assignee?.email ?? "Belum ditugaskan"}</Field>
          <Field label="Sumber">{t.source_type}</Field>
          <Field label="Dibuat">{formatDateTime(t.created_at)}</Field>
          <Field label="Catatan">{t.note ?? "-"}</Field>
        </dl>
        {t.description ? <p className="mt-4 text-sm text-muted-foreground">{t.description}</p> : null}
        {t.source_id && t.source_type === "order" ? (
          <Button asChild size="sm" variant="outline" className="mt-4">
            <Link to="/admin/orders/$id" params={{ id: t.source_id }}>
              Buka order sumber
            </Link>
          </Button>
        ) : null}
        {t.source_id && t.source_type === "payment" ? (
          <Button asChild size="sm" variant="outline" className="mt-4">
            <Link to="/admin/payments/$id" params={{ id: t.source_id }}>
              Buka pembayaran sumber
            </Link>
          </Button>
        ) : null}
        {t.source_id && t.source_type === "refund" ? (
          <Button asChild size="sm" variant="outline" className="mt-4">
            <Link to="/admin/refunds/$id" params={{ id: t.source_id }}>
              Buka refund sumber
            </Link>
          </Button>
        ) : null}
      </DetailCard>

      <DetailCard title="Tindakan">
        {finished ? (
          <p className="text-sm text-muted-foreground">Task sudah final. Gunakan “Buka kembali” bila perlu ditinjau ulang.</p>
        ) : null}
        <div className="space-y-3">
          <div>
            <Label htmlFor="task-note">Catatan tindakan</Label>
            <Textarea id="task-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {ACTIONS.map((a) => (
              <Button
                key={a.action}
                variant={a.variant}
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(a.action)}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </div>
      </DetailCard>

      <DetailCard title="Riwayat audit">
        {!d.audits.length ? (
          <EmptyRow message="Belum ada riwayat audit." />
        ) : (
          <ul className="space-y-2 text-sm">
            {d.audits.map((a: any) => (
              <li key={a.id} className="rounded-lg border border-border p-3">
                <p className="font-medium">{a.action}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </DetailCard>
    </div>
  );
}
