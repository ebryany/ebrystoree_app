import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, ChevronRight, ListChecks, Loader2 } from "lucide-react";

import { AdminError, AdminLoading, useCan } from "@/components/admin/admin-ui";
import { EmptyWell, StatusPill } from "@/components/growth/primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getContentSummary, listArticlesForBoard } from "@/lib/growth.functions";
import { moveArticleStatus, saveArticleChecklist } from "@/lib/growth-actions.functions";

export const Route = createFileRoute("/see/_dashboard/konten")({
  component: ContentWorkspace,
});

/**
 * Ruang kerja Konten.
 *
 * Bentuk halaman mengikuti alur kerja editorial: papan status adalah konten
 * utama, karena pertanyaan hariannya "apa yang harus dikerjakan berikutnya".
 * Klik satu kartu untuk memindahkan tahap atau mengubah checklist pra-terbit.
 */

const STATUS_LABEL: Record<string, string> = {
  idea: "Ide",
  outline: "Kerangka",
  draft: "Draf",
  review: "Ditinjau",
  ready: "Siap terbit",
  scheduled: "Dijadwalkan",
  published: "Terbit",
  archived: "Arsip",
};

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "accent"> = {
  idea: "neutral",
  outline: "neutral",
  draft: "neutral",
  review: "warning",
  ready: "accent",
  scheduled: "accent",
  published: "success",
  archived: "neutral",
};

/** Alur maju normal; dipakai untuk tombol "lanjut ke tahap berikutnya". */
const FLOW: Record<string, string> = {
  idea: "outline",
  outline: "draft",
  draft: "review",
  review: "ready",
  ready: "scheduled",
  scheduled: "published",
  published: "archived",
};

const BOARD_COLUMNS = ["idea", "outline", "draft", "review", "ready", "scheduled", "published"];

const CHECKLIST_ITEMS = [
  { key: "title_ok", label: "Judul jelas dan mengandung kata kunci utama" },
  { key: "excerpt_ok", label: "Ringkasan mengundang, maksimal dua baris" },
  { key: "links_ok", label: "Tautan internal ke produk atau artikel terkait sudah dipasang" },
  { key: "images_ok", label: "Semua gambar punya alt dan tidak pecah" },
  { key: "proofread", label: "Sudah dibaca ulang, tidak ada salah ketik" },
] as const;

type ArticleStatus =
  "idea" | "outline" | "draft" | "review" | "ready" | "scheduled" | "published" | "archived";

type Article = {
  id: string;
  title: string;
  slug: string;
  status: string;
  author_name: string | null;
  view_count: number | null;
  scheduled_at: string | null;
  updated_at: string;
  checklist?: Record<string, boolean> | null;
};

function ContentWorkspace() {
  const queryClient = useQueryClient();
  const canWrite = useCan("articles.update");

  const fetchSummary = useServerFn(getContentSummary);
  const fetchBoard = useServerFn(listArticlesForBoard);
  const moveStatus = useServerFn(moveArticleStatus);
  const saveChecklist = useServerFn(saveArticleChecklist);

  const [selected, setSelected] = useState<Article | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  const summary = useQuery({
    queryKey: ["content-summary"],
    queryFn: () => fetchSummary({}),
    staleTime: 60_000,
  });
  const board = useQuery({
    queryKey: ["content-board"],
    queryFn: () => fetchBoard({}),
    staleTime: 60_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["content-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["content-board"] });
    void queryClient.invalidateQueries({ queryKey: ["growth-summary"] });
  };

  const statusMutation = useMutation({
    mutationFn: (payload: { id: string; status: ArticleStatus }) => moveStatus({ data: payload }),
    onSuccess: (res: any) => {
      if (!res?.ok) return toast.error(res?.error ?? "Status gagal diubah.");
      toast.success(
        res.changed === false ? "Artikel sudah di tahap itu." : "Status artikel dipindahkan.",
      );
      setSelected(null);
      invalidate();
    },
    onError: () => toast.error("Status artikel gagal diubah."),
  });

  const checklistMutation = useMutation({
    mutationFn: (payload: { id: string; checklist: Record<string, boolean> }) =>
      saveChecklist({ data: payload }),
    onSuccess: (res: any) => {
      if (!res?.ok) return toast.error(res?.error ?? "Checklist gagal disimpan.");
      toast.success("Checklist disimpan.");
      setSelected(null);
      invalidate();
    },
  });

  const items = useMemo(() => ((board.data as any)?.items ?? []) as Article[], [board.data]);
  const s = (summary.data as any)?.summary;

  const byStatus = useMemo(() => {
    const map: Record<string, Article[]> = {};
    for (const item of items) {
      (map[item.status] ??= []).push(item);
    }
    return map;
  }, [items]);

  if (summary.isPending || board.isPending) return <AdminLoading label="Memuat data konten…" />;
  if (summary.error || board.error) return <AdminError message="Data konten tidak dapat dimuat." />;

  if (!s || Number(s.total) === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-base font-semibold text-foreground">Belum ada artikel</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Papan editorial terisi setelah artikel pertama dibuat oleh tim yang berwenang.
        </p>
        <div className="mt-4">
          <EmptyWell>
            Setelah ada artikel, papan ini menampilkan setiap tahap dari ide sampai terbit, dan
            statusnya bisa dipindahkan langsung dari sini.
          </EmptyWell>
        </div>
      </section>
    );
  }

  const topArticles = (s.top_articles ?? []) as Array<{ title: string; views: number }>;
  const byAuthor = (s.by_author ?? []) as Array<{ author: string; count: number }>;
  const totalViews = items.reduce((sum, i) => sum + Number(i.view_count ?? 0), 0);
  const inReview = (byStatus["review"] ?? []).length;

  return (
    <div className="space-y-5">
      {/* Strip ringkas */}
      <dl className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-border bg-card px-4 py-3.5 sm:px-5">
        {[
          { label: "Total artikel", value: String(s.total) },
          { label: "Terbit", value: String((byStatus["published"] ?? []).length) },
          {
            label: "Menunggu tinjauan",
            value: String(inReview),
            tone: inReview > 0 ? "text-destructive" : undefined,
          },
          { label: "Total dibaca", value: totalViews.toLocaleString("id-ID") },
        ].map((stat) => (
          <div key={stat.label} className="flex items-baseline gap-2">
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd className={`tabular-nums text-sm font-semibold ${stat.tone ?? "text-foreground"}`}>
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Papan editorial: kolom per tahap */}
      <section className="min-w-0 rounded-xl border border-border bg-card">
        <header className="border-b border-border px-4 py-3.5 sm:px-5">
          <h2 className="text-base font-semibold text-foreground">Papan editorial</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {canWrite
              ? "Pilih satu kartu untuk memindahkan tahap atau mengubah checklist."
              : "Anda punya akses lihat saja. Perubahan status dilakukan oleh admin."}
          </p>
        </header>

        <div className="overflow-x-auto p-4 sm:p-5">
          <div className="flex min-w-max gap-4">
            {BOARD_COLUMNS.map((status) => {
              const columnItems = byStatus[status] ?? [];
              return (
                <div key={status} className="w-64 shrink-0">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <StatusPill tone={STATUS_TONE[status] ?? "neutral"}>
                      {STATUS_LABEL[status]}
                    </StatusPill>
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {columnItems.length}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {columnItems.length === 0 ? (
                      <li className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
                        Kosong
                      </li>
                    ) : (
                      columnItems.slice(0, 8).map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelected(item);
                              setChecklist((item.checklist ?? {}) as Record<string, boolean>);
                            }}
                            className="w-full rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:border-accent/50 hover:bg-surface-selected/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="block text-xs font-medium leading-snug text-foreground">
                              {item.title}
                            </span>
                            <span className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                              <span className="min-w-0 truncate">
                                {item.author_name || "Tanpa penulis"}
                              </span>
                              {item.view_count ? (
                                <span className="shrink-0 tabular-nums">
                                  {Number(item.view_count).toLocaleString("id-ID")} dibaca
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                    {columnItems.length > 8 ? (
                      <li className="text-center text-[11px] text-muted-foreground">
                        +{columnItems.length - 8} lainnya
                      </li>
                    ) : null}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Performa */}
        <section className="min-w-0 rounded-xl border border-border bg-card">
          <header className="border-b border-border px-4 py-3.5 sm:px-5">
            <h2 className="text-base font-semibold text-foreground">
              Artikel paling banyak dibaca
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Dari view_count yang dicatat saat artikel dibuka.
            </p>
          </header>
          <div className="p-4 sm:p-5">
            {topArticles.length === 0 ? (
              <EmptyWell>Belum ada artikel terbit yang punya angka bacaan.</EmptyWell>
            ) : (
              <ol className="space-y-2.5">
                {topArticles.slice(0, 6).map((a, i) => (
                  <li key={a.title} className="flex items-center gap-3">
                    <span className="w-5 shrink-0 tabular-nums text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-sm text-foreground"
                      title={a.title}
                    >
                      {a.title}
                    </span>
                    <span className="shrink-0 tabular-nums text-xs font-medium text-foreground">
                      {Number(a.views).toLocaleString("id-ID")}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        {/* Beban penulis */}
        <section className="min-w-0 rounded-xl border border-border bg-card">
          <header className="border-b border-border px-4 py-3.5 sm:px-5">
            <h2 className="text-base font-semibold text-foreground">Beban penulis</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Jumlah artikel per penulis, semua status.
            </p>
          </header>
          <div className="p-4 sm:p-5">
            {byAuthor.length === 0 ? (
              <EmptyWell>Belum ada artikel dengan penulis tercatat.</EmptyWell>
            ) : (
              <ul className="space-y-3">
                {byAuthor.map((a) => {
                  const max = Math.max(...byAuthor.map((x) => Number(x.count)), 1);
                  return (
                    <li key={a.author} className="min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-sm text-foreground">{a.author}</span>
                        <span className="shrink-0 tabular-nums text-xs font-medium text-foreground">
                          {a.count} artikel
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-chart-4"
                          style={{ width: `${(Number(a.count) / max) * 100}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Dialog detail artikel: pindah tahap + checklist */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-6 text-left leading-snug">
              {selected?.title ?? ""}
            </DialogTitle>
            <DialogDescription className="text-left">
              {selected ? (
                <span className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={STATUS_TONE[selected.status] ?? "neutral"}>
                    {STATUS_LABEL[selected.status] ?? selected.status}
                  </StatusPill>
                  <span className="text-[11px]">
                    {selected.author_name || "Tanpa penulis"}
                    {selected.scheduled_at
                      ? ` · dijadwalkan ${new Date(selected.scheduled_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}`
                      : ""}
                  </span>
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {selected ? (
            <div className="space-y-5">
              {/* Pindah tahap */}
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                  Pindahkan ke tahap lain
                </p>
                {canWrite ? (
                  <>
                    {FLOW[selected.status] ? (
                      <Button
                        className="min-h-11 w-full"
                        disabled={statusMutation.isPending}
                        onClick={() =>
                          statusMutation.mutate({
                            id: selected.id,
                            status: FLOW[selected.status] as ArticleStatus,
                          })
                        }
                      >
                        {statusMutation.isPending ? (
                          <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <ArrowRight className="mr-1.5 size-4" aria-hidden="true" />
                        )}
                        Lanjut ke {STATUS_LABEL[FLOW[selected.status]]}
                      </Button>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(STATUS_LABEL)
                        .filter(([key]) => key !== selected.status)
                        .map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            disabled={statusMutation.isPending}
                            onClick={() =>
                              statusMutation.mutate({
                                id: selected.id,
                                status: key as ArticleStatus,
                              })
                            }
                            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:border-accent/50 hover:bg-surface-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                          >
                            {label}
                          </button>
                        ))}
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Hanya admin yang dapat memindahkan status artikel.
                  </p>
                )}
              </div>

              {/* Checklist pra-terbit */}
              <div className="space-y-2 border-t border-border pt-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <ListChecks className="size-3.5" aria-hidden="true" />
                  Checklist pra-terbit
                </p>
                <ul className="space-y-1.5">
                  {CHECKLIST_ITEMS.map((entry) => {
                    const checked = Boolean(checklist[entry.key]);
                    return (
                      <li key={entry.key}>
                        <label
                          className={`flex min-h-11 items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
                            checked
                              ? "border-success/40 bg-success/5"
                              : "border-border bg-surface hover:bg-surface-selected/50"
                          } ${canWrite ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!canWrite}
                            onChange={(e) =>
                              setChecklist((prev) => ({ ...prev, [entry.key]: e.target.checked }))
                            }
                            className="mt-0.5 size-4 shrink-0 accent-[var(--success)]"
                          />
                          <span className="text-xs leading-relaxed text-foreground">
                            {entry.label}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {canWrite ? (
                  <Button
                    variant="outline"
                    className="min-h-11 w-full"
                    disabled={checklistMutation.isPending}
                    onClick={() => checklistMutation.mutate({ id: selected.id, checklist })}
                  >
                    {checklistMutation.isPending ? (
                      <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="mr-1.5 size-4" aria-hidden="true" />
                    )}
                    Simpan checklist
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setSelected(null)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
