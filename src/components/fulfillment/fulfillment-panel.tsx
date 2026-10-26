import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export function formatWhen(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

const RESULT_LABEL: Record<string, string> = {
  submitted: "Menunggu review",
  accepted: "Disetujui",
  revision_requested: "Diminta revisi",
  superseded: "Digantikan versi baru",
};

const ASSIGNMENT_LABEL: Record<string, string> = {
  assigned: "Ditugaskan",
  accepted: "Diterima operator",
  in_progress: "Sedang dikerjakan",
  completed: "Selesai",
  released: "Dilepas",
  cancelled: "Dibatalkan",
};

export function AssignmentSummary({ assignment, operatorName }: { assignment: any; operatorName?: string | null }) {
  if (!assignment) return <p className="text-sm text-muted-foreground">Belum ada operator yang ditugaskan.</p>;
  return (
    <div className="space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{ASSIGNMENT_LABEL[assignment.status] ?? assignment.status}</Badge>
        {operatorName ? <span className="font-medium">{operatorName}</span> : null}
      </div>
      <p className="text-muted-foreground">Ditugaskan {formatWhen(assignment.assigned_at)}</p>
      <p className="text-muted-foreground">Deadline {formatWhen(assignment.deadline_at)}</p>
      {assignment.started_at ? (
        <p className="text-muted-foreground">Mulai dikerjakan {formatWhen(assignment.started_at)}</p>
      ) : null}
    </div>
  );
}

export function ProgressList({ items, showInternal = false }: { items: any[]; showInternal?: boolean }) {
  const rows = showInternal ? items : items.filter((p) => p.is_public);
  if (!rows.length) return <p className="text-sm text-muted-foreground">Belum ada catatan progres.</p>;
  const latest = rows[0];
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Progres terkini</span>
          <span className="font-semibold">{latest.percent}%</span>
        </div>
        <Progress value={latest.percent} className="mt-2" />
      </div>
      <ol className="space-y-3 border-l border-border pl-4">
        {rows.map((p) => (
          <li key={p.id} className="relative text-sm">
            <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" aria-hidden="true" />
            <p className="font-medium">
              {p.percent}%{!p.is_public ? " · internal" : ""}
            </p>
            <p className="text-muted-foreground">{p.note}</p>
            <p className="text-xs text-muted-foreground">{formatWhen(p.created_at)}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ResultList({ items }: { items: any[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">Belum ada hasil pekerjaan yang dikirim.</p>;
  return (
    <ul className="space-y-3">
      {items.map((r) => (
        <li key={r.id} className="rounded-lg border border-border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Versi {r.version}</span>
            <Badge variant={r.status === "accepted" ? "default" : "secondary"}>
              {RESULT_LABEL[r.status] ?? r.status}
            </Badge>
            <span className="text-xs text-muted-foreground">{formatWhen(r.submitted_at)}</span>
          </div>
          <p className="mt-1">{r.summary}</p>
          {r.delivery_note ? <p className="mt-1 text-muted-foreground">{r.delivery_note}</p> : null}
          {r.result_url ? (
            <a
              href={r.result_url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-block text-primary underline"
            >
              Buka tautan hasil
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function RevisionList({ items }: { items: any[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">Belum ada permintaan revisi.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {items.map((r) => (
        <li key={r.id} className="rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Revisi #{r.sequence}</span>
            <Badge variant={r.status === "completed" ? "default" : "secondary"}>{r.status}</Badge>
            {r.is_chargeable ? <Badge variant="destructive">Di luar jatah</Badge> : null}
          </div>
          <p className="mt-1 text-muted-foreground">{r.reason}</p>
          <p className="text-xs text-muted-foreground">{formatWhen(r.created_at)}</p>
        </li>
      ))}
    </ul>
  );
}
