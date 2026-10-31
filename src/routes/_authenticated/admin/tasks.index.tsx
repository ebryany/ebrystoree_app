import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  BadgeCheck,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Hand,
  MessageSquareWarning,
  Package,
  Search as SearchIcon,
  Store,
  Undo2,
  UserCog,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  Pager,
  SearchField,
  StatusTabs,
  useCan,
} from "@/components/admin/admin-ui";
import { StatusBadge, formatDateTime } from "@/components/admin/tx-ui";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listTasks, updateTask } from "@/lib/admin-transaction.functions";
import { TASK_TYPE_LABEL } from "@/lib/transaction-labels";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/tasks/")({
  head: () => ({
    meta: [
      { title: "Task Operasional — Admin Ebrystore" },
      {
        name: "description",
        content: "Antrean pekerjaan operasional Ebrystore: verifikasi, penugasan, dan refund.",
      },
      { property: "og:title", content: "Task Operasional — Admin Ebrystore" },
      { property: "og:description", content: "Kelola task operasional Ebrystore." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminTasks,
});

const PAGE_SIZE = 15;

const STATUS_TABS = [
  { value: "open", label: "Terbuka" },
  { value: "in_progress", label: "Dikerjakan" },
  { value: "blocked", label: "Terhambat" },
  { value: "done", label: "Selesai" },
  { value: "cancelled", label: "Dibatalkan" },
  { value: "all", label: "Semua" },
];

const PRIORITY: Record<string, { label: string; className: string; rank: number }> = {
  urgent: {
    label: "Mendesak",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
    rank: 0,
  },
  high: {
    label: "Tinggi",
    className: "border-warning/50 bg-warning/15 text-warning-foreground",
    rank: 1,
  },
  normal: { label: "Normal", className: "border-border bg-muted text-muted-foreground", rank: 2 },
  low: { label: "Rendah", className: "border-border bg-card text-muted-foreground", rank: 3 },
};

const TYPE_ICON: Record<string, LucideIcon> = {
  verify_payment: CreditCard,
  assign_operator: UserCog,
  review_refund: Undo2,
  follow_up_customer_data: ClipboardList,
  check_transaction: SearchIcon,
  review_seller: Store,
  review_product: Package,
  review_service_complaint: MessageSquareWarning,
};

const ACTIVE = ["open", "in_progress", "blocked"];

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
      toast.success("Task diambil.");
      void qc.invalidateQueries({ queryKey: ["admin-tasks"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal memperbarui task."),
  });

  // Prioritas & pencarian berlaku pada halaman yang sedang dimuat (server memfilter status saja).
  const items = useMemo(() => {
    const all: any[] = (data as any)?.items ?? [];
    const q = search.trim().toLowerCase();
    return all
      .filter(
        (t) =>
          (priority === "all" || t.priority === priority) &&
          (!q || t.task_number.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)),
      )
      .sort((a, b) => (PRIORITY[a.priority]?.rank ?? 9) - (PRIORITY[b.priority]?.rank ?? 9));
  }, [data, search, priority]);

  if (!canView) return <ForbiddenState permission="tasks.view" />;
  if ((data as any)?.forbidden) return <ForbiddenState permission={(data as any).permission} />;

  const now = Date.now();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Task Operasional"
        crumb="Task"
        description="Antrean pekerjaan tim operasional. Diperbarui otomatis."
      />

      <StatusTabs
        label="Status task"
        value={status}
        options={STATUS_TABS}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
      />

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px]">
        <SearchField
          id="task-search"
          label="Cari task"
          value={search}
          onChange={setSearch}
          placeholder="TSK-… atau judul"
        />
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger aria-label="Filter prioritas" className="min-h-11 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua prioritas</SelectItem>
            {Object.entries(PRIORITY).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <AdminLoading />
      ) : error || (data as any)?.error ? (
        <AdminError message={(data as any)?.error ?? "Data task tidak dapat dimuat."} />
      ) : !items.length ? (
        <EmptyRow
          message={
            status === "open" && !search && priority === "all"
              ? "Antrean kosong. Tidak ada task terbuka."
              : "Tidak ada task pada filter ini."
          }
        />
      ) : (
        <>
          <ul className="space-y-2" aria-label="Daftar task">
            {items.map((t) => {
              const Icon = TYPE_ICON[t.task_type] ?? ClipboardList;
              const prio = PRIORITY[t.priority] ?? PRIORITY.normal;
              const overdue =
                ACTIVE.includes(t.status) && t.due_at && new Date(t.due_at).getTime() < now;
              const busy = mutation.isPending && mutation.variables?.taskId === t.id;
              return (
                <li
                  key={t.id}
                  className={cn(
                    "flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center",
                    overdue
                      ? "border-destructive/40"
                      : t.priority === "urgent" && ACTIVE.includes(t.status)
                        ? "border-warning/50"
                        : "border-border",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-selected text-accent">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-xs text-muted-foreground">
                          {t.task_number}
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-px text-[11px] font-semibold",
                            prio.className,
                          )}
                        >
                          {prio.label}
                        </span>
                      </div>
                      <Link
                        to="/admin/tasks/$id"
                        params={{ id: t.id }}
                        className="mt-0.5 line-clamp-2 break-words text-sm font-semibold hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {t.title}
                      </Link>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                        <StatusBadge value={t.status} kind="raw" />
                        <span>{TASK_TYPE_LABEL[t.task_type] ?? t.task_type}</span>
                        {t.due_at ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 tabular-nums",
                              overdue && "font-semibold text-destructive",
                            )}
                          >
                            {overdue ? (
                              <AlertTriangle className="size-3.5" aria-hidden="true" />
                            ) : null}
                            {overdue ? "Lewat tenggat" : "Tenggat"} {formatDateTime(t.due_at)}
                          </span>
                        ) : null}
                        {t.assignee_id && t.status === "in_progress" ? (
                          <span className="inline-flex items-center gap-1">
                            <BadgeCheck className="size-3.5" aria-hidden="true" />
                            Sudah diambil
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2 sm:justify-end">
                    {t.status === "open" ? (
                      <Button
                        size="sm"
                        className="min-h-11 flex-1 sm:flex-none"
                        disabled={busy}
                        onClick={() => mutation.mutate({ taskId: t.id, action: "claim" })}
                      >
                        <Hand className="size-4" aria-hidden="true" />
                        {busy ? "Mengambil…" : "Ambil"}
                      </Button>
                    ) : null}
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="min-h-11 flex-1 sm:flex-none"
                    >
                      <Link to="/admin/tasks/$id" params={{ id: t.id }}>
                        Detail
                        <ChevronRight className="size-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
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
