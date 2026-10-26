import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  Loader2,
  PlayCircle,
  RotateCcw,
  Search,
} from "lucide-react";

import { AdminError, AdminLoading } from "@/components/admin/admin-ui";
import { EmptyWell, StatusPill } from "@/components/growth/primitives";
import { Button } from "@/components/ui/button";
import { getSeoAudit, runSeoAuditNow } from "@/lib/seo-audit.functions";
import { ignoreSeoIssue } from "@/lib/growth-actions.functions";

export const Route = createFileRoute("/see/_dashboard/seo")({
  component: SeoWorkspace,
});

/**
 * Ruang kerja SEO.
 *
 * Bentuk halaman mengikuti pekerjaannya: daftar halaman bermasalah adalah
 * konten utama, diurutkan dari yang paling berat, dan setiap temuan bisa
 * ditandai "sudah diketahui" supaya daftar hanya berisi kerja yang tersisa.
 *
 * Yang TIDAK ditampilkan: peringkat kata kunci dan trafik pencarian, karena
 * keduanya butuh Search Console API yang belum terpasang.
 */

const CODE_LABEL: Record<string, string> = {
  title_missing: "Title tidak ada",
  title_too_short: "Title terlalu pendek",
  title_too_long: "Title terlalu panjang",
  description_missing: "Description tidak ada",
  description_too_short: "Description terlalu pendek",
  description_too_long: "Description terlalu panjang",
  h1_missing: "H1 tidak ada",
  h1_multiple: "H1 lebih dari satu",
  canonical_missing: "Canonical tidak ada",
  canonical_other_page: "Canonical menunjuk halaman lain",
  robots_noindex: "Halaman diblokir dari indeks",
  img_alt_missing: "Gambar tanpa alt",
  structured_data_invalid: "Structured data rusak",
  page_unreachable: "Halaman tidak dapat diakses",
};

/** Urutan berat: error dulu, lalu warning, lalu info. */
const SEVERITY_RANK: Record<string, number> = { error: 0, warning: 1, info: 2 };

type Issue = {
  url_path: string;
  issue_code: string;
  severity: string;
  detail: string | null;
  checked_at: string;
  ignored_at: string | null;
};

type PageGroup = {
  path: string;
  issues: Issue[];
  hasError: boolean;
};

function SeoWorkspace() {
  const queryClient = useQueryClient();

  const fetchAudit = useServerFn(getSeoAudit);
  const runAudit = useServerFn(runSeoAuditNow);
  const setIgnored = useServerFn(ignoreSeoIssue);

  const [showIgnored, setShowIgnored] = useState(false);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["seo-audit"],
    queryFn: () => fetchAudit({}),
    staleTime: 30_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["seo-audit"] });
    void queryClient.invalidateQueries({ queryKey: ["growth-summary"] });
  };

  const auditMutation = useMutation({
    mutationFn: () => runAudit({}),
    onSuccess: async (res: any) => {
      if (!res?.ok) {
        toast.error(res?.error ?? "Audit gagal dijalankan.");
        return;
      }
      toast.success(
        `Audit selesai: ${res.checked} halaman diperiksa, ${res.totalIssues} temuan.` +
          (res.failed ? ` ${res.failed} halaman tidak dapat diakses.` : ""),
      );
      await refetch();
      invalidate();
    },
    onError: () => toast.error("Audit gagal dijalankan."),
  });

  const ignoreMutation = useMutation({
    mutationFn: (payload: { urlPath: string; issueCode: string; ignored: boolean }) =>
      setIgnored({ data: payload }),
    onSuccess: (res: any, variables) => {
      if (!res?.ok) return toast.error(res?.error ?? "Temuan gagal diperbarui.");
      toast.success(
        variables.ignored ? "Temuan ditandai sudah diketahui." : "Temuan dibuka kembali.",
      );
      invalidate();
    },
    onError: () => toast.error("Temuan gagal diperbarui."),
  });

  const d = data as any;
  const summary = d?.summary;
  const allIssues = useMemo(() => (d?.issues ?? []) as Issue[], [d]);
  const activeIssues = useMemo(() => allIssues.filter((i) => !i.ignored_at), [allIssues]);
  const ignoredIssues = useMemo(() => allIssues.filter((i) => i.ignored_at), [allIssues]);

  const pagesChecked = Number(summary?.pages_checked ?? 0);
  const pagesWithIssues = Number(summary?.pages_with_issues ?? 0);
  const totalIssues = Number(summary?.total_issues ?? 0);
  const errorCount = Number((summary?.by_severity as any)?.error ?? 0);
  const ignoredCount = Number(summary?.ignored_issues ?? ignoredIssues.length);
  const lastChecked = summary?.last_checked_at as string | null;

  // Kelompokkan per halaman, urutkan dari yang paling berat.
  const pageGroups = useMemo<PageGroup[]>(() => {
    const map = new Map<string, Issue[]>();
    for (const issue of activeIssues) {
      const list = map.get(issue.url_path) ?? [];
      list.push(issue);
      map.set(issue.url_path, list);
    }
    return Array.from(map.entries())
      .map(([path, issues]) => ({
        path,
        issues: issues.sort(
          (a, b) =>
            (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
            a.issue_code.localeCompare(b.issue_code),
        ),
        hasError: issues.some((i) => i.severity === "error"),
      }))
      .sort((a, b) => Number(b.hasError) - Number(a.hasError) || a.path.localeCompare(b.path));
  }, [activeIssues]);

  const byCode = useMemo(
    () =>
      Object.entries((summary?.by_code ?? {}) as Record<string, number>)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6),
    [summary],
  );

  if (isPending) return <AdminLoading label="Memuat hasil audit…" />;
  if (error) return <AdminError message="Hasil audit tidak dapat dimuat." />;
  if (d?.forbidden) return <AdminError message="Anda tidak punya akses." />;

  return (
    <div className="space-y-5">
      {/* Baris kontrol: strip angka + tombol audit */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3.5 sm:px-5">
        <dl className="flex flex-wrap items-center gap-x-8 gap-y-3">
          {[
            { label: "Halaman diperiksa", value: String(pagesChecked) },
            { label: "Halaman bermasalah", value: String(pagesWithIssues) },
            { label: "Temuan aktif", value: String(totalIssues) },
            {
              label: "Error berat",
              value: String(errorCount),
              tone: errorCount > 0 ? "text-destructive" : undefined,
            },
          ].map((stat) => (
            <div key={stat.label} className="flex items-baseline gap-2">
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd
                className={`tabular-nums text-sm font-semibold ${stat.tone ?? "text-foreground"}`}
              >
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center gap-2">
          {ignoredCount > 0 ? (
            <Button
              variant="ghost"
              className="min-h-11"
              onClick={() => setShowIgnored((v) => !v)}
              aria-pressed={showIgnored}
            >
              <EyeOff className="mr-1.5 size-4" aria-hidden="true" />
              {showIgnored ? "Sembunyikan" : "Lihat"} {ignoredCount} diabaikan
            </Button>
          ) : null}
          <Button
            className="min-h-11"
            disabled={auditMutation.isPending}
            onClick={() => auditMutation.mutate()}
          >
            {auditMutation.isPending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
            ) : (
              <PlayCircle className="mr-1.5 size-4" aria-hidden="true" />
            )}
            {auditMutation.isPending ? "Menjalankan…" : "Jalankan audit"}
          </Button>
        </div>
      </div>

      {pagesChecked === 0 ? (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 className="text-base font-semibold text-foreground">Belum ada hasil audit</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Audit memeriksa halaman publik yang benar-benar terbit, lalu menyimpan hasilnya.
          </p>
          <div className="mt-4">
            <EmptyWell>
              Klik "Jalankan audit" untuk memeriksa title, description, H1, alt gambar, canonical,
              robots, dan structured data. Hasilnya tersimpan, jadi tidak perlu dijalankan tiap kali
              membuka halaman ini.
            </EmptyWell>
          </div>
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
          {/* Konten utama: halaman yang perlu diperbaiki */}
          <section className="min-w-0 rounded-xl border border-border bg-card">
            <header className="border-b border-border px-4 py-3.5 sm:px-5">
              <h2 className="text-base font-semibold text-foreground">
                Halaman mana yang perlu diperbaiki?
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {pageGroups.length > 0
                  ? `Halaman dengan error berat ditampilkan lebih dulu. ${
                      lastChecked
                        ? `Diperiksa ${new Date(lastChecked).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}.`
                        : ""
                    }`
                  : "Tidak ada halaman dengan temuan aktif."}
              </p>
            </header>

            <div className="p-4 sm:p-5">
              {pageGroups.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <CheckCircle2 className="size-8 text-success" aria-hidden="true" />
                  <p className="text-sm font-medium text-foreground">
                    Semua halaman bersih dari temuan
                  </p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    {ignoredCount > 0
                      ? `${ignoredCount} temuan ditandai sudah diketahui dan tidak dihitung.`
                      : "Tidak ada title, description, atau struktur yang bermasalah."}
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {pageGroups.map((group) => (
                    <li
                      key={group.path}
                      className="overflow-hidden rounded-lg border border-border"
                    >
                      <div
                        className={`flex flex-wrap items-center justify-between gap-2 border-b border-border px-3.5 py-2.5 ${
                          group.hasError ? "bg-destructive/5" : "bg-warning/5"
                        }`}
                      >
                        <p className="flex min-w-0 items-center gap-2 text-xs font-semibold text-foreground">
                          <AlertTriangle
                            className={`size-3.5 shrink-0 ${group.hasError ? "text-destructive" : "text-warning-foreground"}`}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 break-all">{group.path}</span>
                        </p>
                        <StatusPill tone={group.hasError ? "danger" : "warning"}>
                          {group.issues.length} temuan
                        </StatusPill>
                      </div>
                      <ul className="divide-y divide-border">
                        {group.issues.map((issue) => (
                          <li
                            key={`${issue.url_path}-${issue.issue_code}`}
                            className="flex flex-wrap items-start justify-between gap-2 px-3.5 py-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-foreground">
                                {CODE_LABEL[issue.issue_code] ?? issue.issue_code}
                              </p>
                              {issue.detail ? (
                                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                                  {issue.detail}
                                </p>
                              ) : null}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="min-h-9 shrink-0"
                              disabled={ignoreMutation.isPending}
                              onClick={() =>
                                ignoreMutation.mutate({
                                  urlPath: issue.url_path,
                                  issueCode: issue.issue_code,
                                  ignored: true,
                                })
                              }
                            >
                              <EyeOff className="mr-1.5 size-3.5" aria-hidden="true" />
                              Sudah diketahui
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Temuan yang diabaikan: tersembunyi secara bawaan, bisa dibuka kembali */}
            {showIgnored ? (
              <div className="border-t border-border px-4 py-3.5 sm:px-5">
                <p className="text-xs font-semibold text-foreground">Temuan yang diabaikan</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Tidak dihitung sebagai pekerjaan. Buka kembali bila ternyata perlu diperbaiki.
                </p>
                <ul className="mt-3 space-y-2">
                  {ignoredIssues.map((issue) => (
                    <li
                      key={`ignored-${issue.url_path}-${issue.issue_code}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                    >
                      <span className="min-w-0 text-[11px] text-muted-foreground">
                        <span className="break-all text-foreground">{issue.url_path}</span>
                        {" · "}
                        {CODE_LABEL[issue.issue_code] ?? issue.issue_code}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-9 shrink-0"
                        disabled={ignoreMutation.isPending}
                        onClick={() =>
                          ignoreMutation.mutate({
                            urlPath: issue.url_path,
                            issueCode: issue.issue_code,
                            ignored: false,
                          })
                        }
                      >
                        <RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" />
                        Buka kembali
                      </Button>
                    </li>
                  ))}
                  {ignoredIssues.length === 0 ? (
                    <li className="text-[11px] text-muted-foreground">
                      Tidak ada temuan yang diabaikan.
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </section>

          {/* Rel samping: jenis masalah tersering + batas jujur */}
          <aside className="min-w-0 space-y-5">
            <section className="rounded-xl border border-border bg-card">
              <header className="border-b border-border px-4 py-3.5">
                <h2 className="text-sm font-semibold text-foreground">
                  Masalah yang paling sering
                </h2>
              </header>
              <div className="p-4">
                {byCode.length === 0 ? (
                  <EmptyWell>Tidak ada temuan aktif.</EmptyWell>
                ) : (
                  <ul className="space-y-3">
                    {byCode.map(([code, count]) => {
                      const max = Math.max(...byCode.map(([, n]) => n), 1);
                      return (
                        <li key={code} className="min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="min-w-0 truncate text-xs text-foreground">
                              {CODE_LABEL[code] ?? code}
                            </span>
                            <span className="shrink-0 tabular-nums text-xs font-semibold text-foreground">
                              {count}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-warning"
                              style={{ width: `${(count / max) * 100}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            <p className="flex items-start gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
              <Search className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                Panel ini memeriksa SEO on-page. Peringkat kata kunci dan trafik pencarian belum
                tersedia karena memerlukan integrasi Search Console; angkanya sengaja tidak
                ditampilkan daripada menampilkan nilai kosong.
              </span>
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
