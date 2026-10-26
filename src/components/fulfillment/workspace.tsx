import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlarmClock,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Inbox,
  ListChecks,
  Lock,
  MessageSquareWarning,
  RefreshCw,
  UserCheck,
  Wrench,
} from "lucide-react";

import { formatIDR } from "@/components/ebry/cards";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/ebry/states";
import { StatusPill } from "@/components/ebry/status";
import { LiveOrderTimeline } from "@/components/ebry/live-timeline";
import { PendingAssignmentQueue } from "@/components/fulfillment/pending-queue";
import {
  AssignmentSummary,
  ProgressList,
  ResultList,
  RevisionList,
  formatWhen,
} from "@/components/fulfillment/fulfillment-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { getOrderFulfillment, listMyAssignments, operatorAction, submitJobResult } from "@/lib/fulfillment.functions";
import { cn } from "@/lib/utils";

export type WorkspaceBase = "admin" | "operator";

const FILTERS = [
  { key: "active", label: "Aktif" },
  { key: "done", label: "Selesai" },
  { key: "all", label: "Semua" },
] as const;

const ASSIGNMENT_LABEL: Record<string, string> = {
  assigned: "Perlu diterima",
  accepted: "Diterima",
  in_progress: "Dikerjakan",
  completed: "Selesai",
  released: "Dirilis",
  cancelled: "Dibatalkan",
  rejected: "Ditolak",
};

function deadlineState(deadline: string | null) {
  if (!deadline) return { tone: "muted", text: "Tanpa deadline" } as const;
  const diffH = (new Date(deadline).getTime() - Date.now()) / 36e5;
  if (diffH < 0) return { tone: "danger", text: `Lewat deadline · ${formatWhen(deadline)}` } as const;
  if (diffH < 24) return { tone: "warn", text: `Kurang ${Math.max(1, Math.round(diffH))} jam lagi` } as const;
  return { tone: "muted", text: `Deadline ${formatWhen(deadline)}` } as const;
}

function DetailLink({ base, id, children, className }: { base: WorkspaceBase; id: string; children: React.ReactNode; className?: string }) {
  return base === "admin" ? (
    <Link to="/admin/pengerjaan/$id" params={{ id }} className={className}>
      {children}
    </Link>
  ) : (
    <Link to="/operator/$id" params={{ id }} className={className}>
      {children}
    </Link>
  );
}

function ListLink({ base, children, className }: { base: WorkspaceBase; children: React.ReactNode; className?: string }) {
  return base === "admin" ? (
    <Link to="/admin/pengerjaan" className={className}>
      {children}
    </Link>
  ) : (
    <Link to="/operator" className={className}>
      {children}
    </Link>
  );
}

/** Daftar tugas pengerjaan jasa milik user aktif (operator/admin). */
export function FulfillmentBoard({ base, hero = true }: { base: WorkspaceBase; hero?: boolean }) {
  const [filter, setFilter] = useState<"active" | "done" | "all">("active");
  const fetchAssignments = useServerFn(listMyAssignments);
  const scope = base === "admin" ? ("all" as const) : ("mine" as const);
  const { data, isPending, error, refetch, isFetching } = useQuery({
    queryKey: ["my-assignments", scope, filter],
    queryFn: () => fetchAssignments({ data: { filter, scope } }),
  });

  // Statistik selalu dihitung dari seluruh tugas, bukan hanya filter aktif.
  const { data: allData } = useQuery({
    queryKey: ["my-assignments", scope, "all"],
    queryFn: () => fetchAssignments({ data: { filter: "all" as const, scope } }),
  });

  useRealtimeRefresh({
    channel: `fulfillment-board-${base}`,
    tables: ["operator_assignments", "orders", "job_progress", "job_results", "job_revisions"],
    keys: [["my-assignments"]],
  });

  const forbidden = Boolean((data as any)?.forbidden);
  const items: any[] = forbidden ? [] : ((data as any)?.items ?? []);
  const statItems: any[] = forbidden ? [] : ((allData as any)?.items ?? []);
  const needAction = statItems.filter((a) => a.status === "assigned").length;
  const running = statItems.filter((a) => ["accepted", "in_progress"].includes(a.status)).length;
  const dueSoon = statItems.filter(
    (a) =>
      a.deadline_at &&
      new Date(a.deadline_at).getTime() - Date.now() < 24 * 36e5 &&
      !["completed", "released", "cancelled"].includes(a.status),
  ).length;
  const done = statItems.filter((a) => ["completed", "released"].includes(a.status)).length;

  const stats = [
    { label: "Perlu diterima", value: needAction, icon: ClipboardList, tone: "accent" },
    { label: "Dikerjakan", value: running, icon: RefreshCw, tone: "info" },
    { label: "Deadline < 24 jam", value: dueSoon, icon: AlarmClock, tone: "warning" },
    { label: "Selesai", value: done, icon: CheckCircle2, tone: "success" },
  ] as const;

  return (
    <div className="space-y-5">
      {hero ? (
        <header className="relative overflow-hidden rounded-3xl bg-hero-gradient p-5 text-primary-foreground sm:p-7">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-14 size-40 rounded-full bg-primary-foreground/10 blur-2xl"
          />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">Workspace pengerjaan</p>
          <h1 className="mt-2 font-display text-2xl font-bold leading-tight sm:text-3xl">Tugas pengerjaan jasa</h1>
          <p className="mt-2 max-w-md text-sm opacity-90">
            Terima tugas, catat progres, lalu kirim hasil. Semua status tersinkron realtime dengan pelanggan dan admin.
          </p>
          {!isPending && !error && needAction > 0 ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-3 py-1.5 text-xs font-semibold">
              <ClipboardList className="size-3.5" aria-hidden />
              {needAction} tugas menunggu diterima
            </p>
          ) : null}
        </header>
      ) : null}

      {base === "admin" ? <PendingAssignmentQueue /> : null}

      <section aria-label="Ringkasan tugas" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <span
              className={cn(
                "grid size-8 place-items-center rounded-lg",
                s.tone === "accent" && "bg-accent/15 text-accent",
                s.tone === "info" && "bg-info/12 text-info",
                s.tone === "warning" && "bg-warning/20 text-warning-foreground",
                s.tone === "success" && "bg-success/12 text-success",
              )}
            >
              <s.icon className="size-4" aria-hidden />
            </span>
        <p className="mt-2.5 font-display text-2xl font-bold tabular-nums">{allData ? s.value : "–"}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </section>

      <div className="flex items-center gap-2">
        <div
          role="tablist"
          aria-label="Filter tugas"
          className="flex flex-1 gap-1 rounded-full border border-border bg-surface p-1"
        >
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "min-h-9 flex-1 rounded-full px-3 text-sm font-medium transition-colors",
                filter === f.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button
          size="icon"
          variant="outline"
          className="size-10 shrink-0 rounded-full"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Segarkan daftar tugas"
        >
          <RefreshCw className={cn("size-4", isFetching && "animate-spin")} aria-hidden />
        </Button>
      </div>

      {isPending ? (
        <CardSkeleton rows={3} />
      ) : error ? (
        <ErrorState onRetry={() => refetch()} />
      ) : forbidden ? (
        <EmptyState
          icon={Lock}
          title="Akses pengerjaan dibutuhkan"
          description="Akun Anda belum memiliki izin orders.fulfill. Hubungi super admin untuk mendapatkan peran operator."
        />
      ) : !items.length ? (
        <EmptyState
          icon={Inbox}
          title="Belum ada tugas di filter ini"
          description="Tugas baru muncul otomatis di sini begitu order jasa ditugaskan kepada Anda."
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {items.map((a) => {
            const dl = deadlineState(a.deadline_at);
            const isNew = a.status === "assigned";
            return (
              <li
                key={a.id}
                className={cn(
                  "relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md",
                  isNew ? "border-accent/50" : "border-border",
                )}
              >
                {isNew ? <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-accent" /> : null}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{a.order?.order_number ?? "-"}</span>
                  <div className="flex items-center gap-1.5">
                    {a.openRevisions > 0 ? <Badge variant="destructive">{a.openRevisions} revisi</Badge> : null}
                    <Badge variant={isNew ? "default" : "secondary"}>{ASSIGNMENT_LABEL[a.status] ?? a.status}</Badge>
                  </div>
                </div>

                <p className="mt-2 font-display text-base font-semibold leading-snug">{a.serviceName ?? "Layanan"}</p>
                {base === "admin" && a.operatorName ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Operator: {a.operatorName}
                    {a.isMine ? " (Anda)" : ""}
                  </p>
                ) : null}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {a.order?.status ? <StatusPill value={a.order.status} kind="order" /> : null}
                  <span className="text-sm font-semibold tabular-nums">{formatIDR(a.order?.total)}</span>
                </div>

                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Progres</span>
                    <span className="font-semibold tabular-nums">{a.percent ?? 0}%</span>
                  </div>
                  <Progress value={a.percent ?? 0} className="h-2" />
                </div>

                <p
                  className={cn(
                    "mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs",
                    dl.tone === "danger"
                      ? "bg-destructive/10 font-semibold text-destructive"
                      : dl.tone === "warn"
                        ? "bg-warning/20 font-semibold text-warning-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  <AlarmClock className="size-3.5" aria-hidden />
                  {dl.text}
                </p>

                <Button asChild size="lg" variant={isNew ? "default" : "outline"} className="mt-3 w-full">
                  <DetailLink base={base} id={a.order_id}>
                    {isNew ? "Terima tugas" : "Buka tugas"}
                    <ArrowRight className="size-4" aria-hidden />
                  </DetailLink>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {Icon ? <Icon className="size-4" aria-hidden /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Detail pengerjaan satu order + timeline realtime. */
export function FulfillmentDetail({ base, orderId }: { base: WorkspaceBase; orderId: string }) {
  const id = orderId;
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getOrderFulfillment);
  const act = useServerFn(operatorAction);
  const submitResult = useServerFn(submitJobResult);

  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState("50");
  const [note, setNote] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [summary, setSummary] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [resultUrl, setResultUrl] = useState("");

  const { data, isPending, error } = useQuery({
    queryKey: ["order-fulfillment", id],
    queryFn: () => fetchDetail({ data: { orderId: id } }),
  });

  useRealtimeRefresh({
    channel: `fulfillment-detail-${base}-${id}`,
    tables: ["orders", "operator_assignments", "job_progress", "job_results", "job_revisions"],
    keys: [
      ["order-fulfillment", id],
      ["my-assignments"],
    ],
  });

  if (isPending) return <CardSkeleton rows={4} />;
  if (error) return <ErrorState />;
  const d = data as any;
  if (!d.order)
    return (
      <EmptyState
        title="Tugas tidak ditemukan"
        description="Order ini tidak ada atau bukan tugas yang ditugaskan kepada Anda."
        action={
          <Button asChild variant="outline" size="sm">
            <ListLink base={base}>Kembali ke daftar tugas</ListLink>
          </Button>
        }
      />
    );

  const assignment = d.assignment;
  const status = d.order.status as string;
  const canAccept = assignment?.status === "assigned";
  const canStart = assignment && ["assigned", "accepted"].includes(assignment.status);
  const canProgress = assignment?.status === "in_progress" && status === "in_progress";
  const canSubmit =
    assignment &&
    ["accepted", "in_progress"].includes(assignment.status) &&
    ["queued", "in_progress"].includes(status);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["order-fulfillment", id] });
    await queryClient.invalidateQueries({ queryKey: ["my-assignments"] });
  }

  async function run(action: "accept" | "start" | "progress") {
    setBusy(true);
    const result: any = await act({
      data: {
        orderId: id,
        action,
        note: note.trim() || null,
        percent: action === "progress" ? Number(percent) : null,
        isPublic,
      },
    });
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    toast.success(
      action === "accept" ? "Tugas diterima." : action === "start" ? "Pengerjaan dimulai." : "Progres tersimpan.",
    );
    setNote("");
    await refresh();
  }

  async function handleSubmitResult(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result: any = await submitResult({
      data: {
        orderId: id,
        summary: summary.trim(),
        deliveryNote: deliveryNote.trim() || null,
        resultUrl: resultUrl.trim() || null,
      },
    });
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    toast.success(`Hasil versi ${result.data.version} dikirim ke pelanggan.`);
    setSummary("");
    setDeliveryNote("");
    setResultUrl("");
    await refresh();
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <ListLink
          base={base}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Kembali ke daftar tugas
        </ListLink>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-xl font-bold sm:text-2xl">{d.order.order_number}</h1>
          <StatusPill value={status} kind="order" />
        </div>
      </header>

      <LiveOrderTimeline
        order={d.order}
        histories={[]}
        fulfillment={{
          progress: d.progress,
          results: d.results,
          revisions: d.revisions,
          assignment: d.assignment,
          operatorName: d.operatorName,
        }}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel title="Kebutuhan pelanggan" icon={ListChecks}>
            {!d.serviceDetail ? (
              <p className="text-sm text-muted-foreground">Tidak ada detail layanan.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="font-medium">
                  {(d.serviceDetail.package_snapshot as any)?.service_name ?? "Layanan"} —{" "}
                  {(d.serviceDetail.package_snapshot as any)?.name}
                </p>
                <p className="text-muted-foreground">
                  Estimasi {d.serviceDetail.estimated_days} hari · jatah revisi {d.serviceDetail.revision_allowance}
                </p>
                {d.serviceDetail.requirements_note ? (
                  <p className="rounded-lg bg-secondary p-3">{d.serviceDetail.requirements_note}</p>
                ) : null}
                {d.order.customer_note ? (
                  <p className="text-muted-foreground">Catatan order: {d.order.customer_note}</p>
                ) : null}
              </div>
            )}
          </Panel>

          <Panel title="Tindakan pengerjaan" icon={Wrench}>
            {!assignment || ["completed", "cancelled", "released"].includes(assignment.status) ? (
              <p className="text-sm text-muted-foreground">Tugas ini sudah ditutup.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {canAccept ? (
                    <Button size="sm" disabled={busy} onClick={() => run("accept")}>
                      Terima tugas
                    </Button>
                  ) : null}
                  {canStart ? (
                    <Button
                      size="sm"
                      variant={canAccept ? "outline" : "default"}
                      disabled={busy}
                      onClick={() => run("start")}
                    >
                      Mulai kerjakan
                    </Button>
                  ) : null}
                </div>

                {canProgress ? (
                  <div className="space-y-3 rounded-lg border border-border p-3">
                    <div>
                      <Label htmlFor="percent">Persentase progres</Label>
                      <Input
                        id="percent"
                        type="number"
                        min={0}
                        max={100}
                        value={percent}
                        onChange={(e) => setPercent(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="note">Catatan progres</Label>
                      <Textarea
                        id="note"
                        maxLength={1000}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="mt-1"
                        placeholder="Contoh: Outline dan struktur tugas selesai diperiksa, lanjut ke penyusunan bab 2"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={isPublic}
                        onChange={(e) => setIsPublic(e.target.checked)}
                        className="size-4"
                      />
                      Tampilkan ke pelanggan
                    </label>
                    <Button size="sm" disabled={busy || note.trim().length < 3} onClick={() => run("progress")}>
                      Simpan progres
                    </Button>
                  </div>
                ) : null}

                {canSubmit ? (
                  <form onSubmit={handleSubmitResult} className="space-y-3 rounded-lg border border-border p-3">
                    <p className="text-sm font-semibold">Kirim hasil pekerjaan</p>
                    <div>
                      <Label htmlFor="summary">Ringkasan hasil</Label>
                      <Textarea
                        id="summary"
                        required
                        minLength={5}
                        maxLength={2000}
                        value={summary}
                        onChange={(e) => setSummary(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="result-url">Tautan hasil (opsional)</Label>
                      <Input
                        id="result-url"
                        type="url"
                        value={resultUrl}
                        onChange={(e) => setResultUrl(e.target.value)}
                        className="mt-1"
                        placeholder="https://drive.google.com/..."
                      />
                    </div>
                    <div>
                      <Label htmlFor="delivery-note">Catatan pengiriman (opsional)</Label>
                      <Textarea
                        id="delivery-note"
                        maxLength={2000}
                        value={deliveryNote}
                        onChange={(e) => setDeliveryNote(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <Button type="submit" size="sm" disabled={busy || summary.trim().length < 5}>
                      {busy ? "Mengirim…" : "Kirim hasil ke pelanggan"}
                    </Button>
                  </form>
                ) : null}
              </div>
            )}
          </Panel>

          <Panel title="Riwayat progres" icon={ListChecks}>
            <ProgressList items={d.progress} showInternal />
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Penugasan" icon={UserCheck}>
            <AssignmentSummary assignment={assignment} operatorName={d.operatorName} />
          </Panel>
          <Panel title="Hasil pekerjaan" icon={FileCheck2}>
            <ResultList items={d.results} />
          </Panel>
          <Panel title="Permintaan revisi" icon={MessageSquareWarning}>
            <RevisionList items={d.revisions} />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
