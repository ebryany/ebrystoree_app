import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { AdminError, AdminLoading, AdminPageHeader, EmptyRow, ForbiddenState } from "@/components/admin/admin-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { SCHEDULED_JOBS, listJobRuns, runJobNow } from "@/lib/jobs.functions";

export const Route = createFileRoute("/_authenticated/admin/jobs")({
  head: () => ({
    meta: [
      { title: "Job Terjadwal — Admin Ebrystore" },
      {
        name: "description",
        content: "Pantau job otomatis Ebrystore: kedaluwarsa pesanan, tugas telat, dan pemantauan SLA pengerjaan.",
      },
      { property: "og:title", content: "Job Terjadwal — Admin Ebrystore" },
      { property: "og:description", content: "Status eksekusi job otomatis Ebrystore secara realtime." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminJobs,
});

const dt = (value: string) =>
  new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" });

function AdminJobs() {
  const fetchRuns = useServerFn(listJobRuns);
  const trigger = useServerFn(runJobNow);
  const queryClient = useQueryClient();

  const { data, isPending, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-job-runs"],
    queryFn: () => fetchRuns(),
  });

  useRealtimeRefresh({
    channel: "admin-job-runs",
    tables: ["scheduled_job_runs"],
    keys: [["admin-job-runs"]],
  });

  const run = useMutation({
    mutationFn: (job: string) => trigger({ data: { job: job as never } }),
    onSuccess: (res: any) => {
      if (res?.forbidden) toast.error("Tidak punya izin menjalankan job.");
      else if (res?.error) toast.error(res.error);
      else toast.success(`Job selesai — ${res?.result?.affected ?? 0} data diproses.`);
      queryClient.invalidateQueries({ queryKey: ["admin-job-runs"] });
    },
    onError: () => toast.error("Job gagal dijalankan."),
  });

  const runs = (data as any)?.items ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        crumb="Job Terjadwal"
        title="Job terjadwal"
        description="Pekerjaan otomatis yang berjalan di server: kedaluwarsa pesanan, eskalasi tugas telat, dan pemantauan SLA."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SCHEDULED_JOBS.map((job) => {
          const last = runs.find((r: any) => r.job_name === job.name);
          return (
            <div key={job.name} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{job.label}</p>
                  <p className="text-xs text-muted-foreground">{job.schedule}</p>
                </div>
                <Badge variant={last?.status === "error" ? "destructive" : "secondary"}>
                  {last ? (last.status === "error" ? "Gagal" : "Aktif") : "Aktif"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{job.description}</p>
              <p className="text-xs text-muted-foreground">
                {last ? `Terakhir: ${dt(last.started_at)} · ${last.affected_count} data` : "Belum pernah tercatat"}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={run.isPending}
                onClick={() => run.mutate(job.name)}
              >
                <Play className="mr-2 size-4" /> Jalankan sekarang
              </Button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Riwayat eksekusi</h2>
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCcw className="mr-2 size-4" /> Segarkan
        </Button>
      </div>

      {isPending ? (
        <AdminLoading />
      ) : error ? (
        <AdminError />
      ) : (data as any).forbidden ? (
        <ForbiddenState permission={(data as any).permission} />
      ) : (data as any).error ? (
        <AdminError message={(data as any).error} />
      ) : runs.length === 0 ? (
        <EmptyRow message="Belum ada eksekusi job yang tercatat." />
      ) : (
        <ul className="space-y-2">
          {runs.map((r: any) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 text-sm"
            >
              <Badge variant={r.status === "error" ? "destructive" : "secondary"}>{r.status}</Badge>
              <span className="font-medium">{r.job_name}</span>
              <span className="text-muted-foreground">{r.affected_count} data</span>
              <span className="ml-auto text-xs text-muted-foreground">{dt(r.started_at)}</span>
              {r.error_message ? (
                <p className="w-full text-xs text-destructive">{r.error_message}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}