import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  ForbiddenState,
  useCan,
} from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { getSecurityOverview, type SecurityFinding } from "@/lib/security.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/settings/security")({
  head: () => ({
    meta: [
      { title: "Keamanan — Admin Ebrystore" },
      { name: "description", content: "Ringkasan kondisi keamanan database dan storage." },
      { property: "og:title", content: "Keamanan — Admin Ebrystore" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SecuritySettingsPage,
});

const SEVERITY_STYLE: Record<
  SecurityFinding["severity"],
  { wrap: string; icon: typeof ShieldCheck }
> = {
  ok: { wrap: "border-success/40 bg-success/5", icon: CheckCircle2 },
  warning: { wrap: "border-warning/50 bg-warning/10", icon: AlertTriangle },
  critical: { wrap: "border-destructive/50 bg-destructive/5", icon: AlertTriangle },
};

const SEVERITY_LABEL: Record<SecurityFinding["severity"], string> = {
  ok: "Baik",
  warning: "Perlu perhatian",
  critical: "Kritis",
};

function SecuritySettingsPage() {
  const canView = useCan("settings.view");
  const fetchOverview = useServerFn(getSecurityOverview);
  const { data, isPending, error, refetch, isFetching } = useQuery({
    queryKey: ["security-overview"],
    queryFn: () => fetchOverview({}),
    enabled: canView,
  });

  if (!canView) return <ForbiddenState permission="settings.view" />;
  if (isPending) return <AdminLoading label="Memeriksa kondisi keamanan…" />;
  if (error) return <AdminError message="Ringkasan keamanan tidak dapat dimuat." />;

  const overview = data?.overview;
  if (!overview) return <AdminError message="Ringkasan keamanan tidak tersedia." />;

  const critical = overview.findings.filter((f) => f.severity === "critical").length;
  const warning = overview.findings.filter((f) => f.severity === "warning").length;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        crumb="Keamanan"
        title="Keamanan"
        description="Kondisi nyata database dan storage: RLS, hak akses anon, fungsi definer, dan bucket."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {critical === 0 && warning === 0
            ? "Tidak ada temuan yang perlu ditindak."
            : `${critical} temuan kritis, ${warning} perlu perhatian.`}
        </p>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          <RefreshCw
            className={cn("mr-1.5 size-4", isFetching && "animate-spin")}
            aria-hidden="true"
          />
          Periksa ulang
        </Button>
      </div>

      {/* Ringkasan angka: penentu keputusan admin. */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ["Tabel public", overview.counts.tablesTotal],
            ["Dengan RLS", overview.counts.tablesWithRls],
            ["Grant tulis anon", overview.counts.anonWriteGrants],
            ["Fungsi publik anon", overview.counts.anonFunctions],
            ["Definer tanpa search_path", overview.counts.definerWithoutSearchPath],
            ["Bucket publik", overview.counts.publicBuckets],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-card px-3 py-2.5">
            <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-lg font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="temuan-keamanan" className="space-y-3">
        <h2 id="temuan-keamanan" className="text-sm font-semibold">
          Temuan
        </h2>
        <ul className="space-y-2">
          {overview.findings.map((finding) => {
            const style = SEVERITY_STYLE[finding.severity];
            const Icon = style.icon;
            return (
              <li
                key={finding.id}
                className={cn("flex items-start gap-3 rounded-xl border px-3.5 py-3", style.wrap)}
              >
                <Icon
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    finding.severity === "ok"
                      ? "text-success"
                      : finding.severity === "warning"
                        ? "text-warning-foreground"
                        : "text-destructive",
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {finding.title}
                    <span className="ml-2 text-[11px] font-medium text-muted-foreground">
                      {SEVERITY_LABEL[finding.severity]}
                    </span>
                  </p>
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">
                    {finding.detail}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        aria-labelledby="fungsi-anon"
        className="rounded-xl border border-border bg-card p-4"
      >
        <h2 id="fungsi-anon" className="text-sm font-semibold">
          Fungsi yang dapat dipanggil anon
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Daftar ini seharusnya hanya berisi fungsi publik: pencarian katalog dan agregat rating.
        </p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {overview.anonFunctionNames.map((name) => (
            <li
              key={name}
              className="rounded-full border border-border px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground"
            >
              {name}
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="audit-keamanan"
        className="rounded-xl border border-border bg-card p-4"
      >
        <h2 id="audit-keamanan" className="text-sm font-semibold">
          Audit terakhir
        </h2>
        {overview.recentAudit.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Belum ada catatan audit.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {overview.recentAudit.map((entry, index) => (
              <li key={index} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="min-w-0 break-words font-mono text-xs">{entry.action}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {entry.actor_role ?? "sistem"} ·{" "}
                  {new Date(entry.created_at).toLocaleString("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[11px] text-muted-foreground">
        Diperiksa{" "}
        {new Date(overview.checkedAt).toLocaleString("id-ID", {
          dateStyle: "medium",
          timeStyle: "short",
        })}
        . Halaman ini hanya menampilkan kondisi, bukan data pelanggan.
      </p>
    </div>
  );
}
