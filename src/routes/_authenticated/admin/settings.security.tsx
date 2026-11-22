import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Database,
  Eye,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  Pager,
  SearchField,
  StatStrip,
  StatusTabs,
  useCan,
} from "@/components/admin/admin-ui";
import { Badge } from "@/components/ui/badge";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import {
  getSecurityDashboardSummary,
  getSecurityEventDetail,
  getSecurityOverview,
  listSecurityEvents,
  updateSecurityAlertStatus,
  updateSecurityEventStatus,
  type SecurityAlertRecord,
  type SecurityEventRecord,
  type SecurityFinding,
} from "@/lib/security.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/settings/security")({
  head: () => ({
    meta: [
      { title: "Pusat Keamanan & Monitoring — Admin Ebrystore" },
      {
        name: "description",
        content: "Monitoring percobaan akses API, security alerts, dan kondisi RLS database Ebrystore.",
      },
      { property: "og:title", content: "Pusat Keamanan & Monitoring — Admin Ebrystore" },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SecurityCenterPage,
});

const FINDING_STYLE: Record<
  SecurityFinding["severity"],
  { wrap: string; icon: typeof ShieldCheck }
> = {
  ok: { wrap: "border-success/40 bg-success/5", icon: CheckCircle2 },
  warning: { wrap: "border-warning/50 bg-warning/10", icon: AlertTriangle },
  critical: { wrap: "border-destructive/50 bg-destructive/5", icon: AlertTriangle },
};

const FINDING_LABEL: Record<SecurityFinding["severity"], string> = {
  ok: "Baik",
  warning: "Perlu perhatian",
  critical: "Kritis",
};

const EVENT_SEVERITY_BADGE: Record<SecurityEventRecord["severity"], string> = {
  CRITICAL: "border-destructive/40 bg-destructive/15 text-destructive",
  HIGH: "border-warning/50 bg-warning/15 text-warning-foreground",
  MEDIUM: "border-accent/40 bg-accent/10 text-accent",
  LOW: "border-border bg-muted text-muted-foreground",
};

const WORKFLOW_STATUS_LABEL: Record<string, string> = {
  NEW: "Baru",
  OPEN: "Aktif",
  INVESTIGATING: "Diselidiki",
  ACKNOWLEDGED: "Diketahui",
  RESOLVED: "Selesai",
  FALSE_POSITIVE: "False Positive",
};

const WORKFLOW_STATUS_CLASS: Record<string, string> = {
  NEW: "border-destructive/30 bg-destructive/10 text-destructive",
  OPEN: "border-destructive/30 bg-destructive/10 text-destructive",
  INVESTIGATING: "border-warning/40 bg-warning/15 text-warning-foreground",
  ACKNOWLEDGED: "border-border bg-muted text-foreground",
  RESOLVED: "border-success/40 bg-success/10 text-success",
  FALSE_POSITIVE: "border-border bg-muted text-muted-foreground",
};

const PAGE_SIZE = 15;

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function SecurityCenterPage() {
  const queryClient = useQueryClient();
  const canViewPosture = useCan("settings.view");
  const canReadEvents = useCan("security.events.read");
  const canResolveEvents = useCan("security.events.resolve") || useCan("settings.manage");
  const canManageAlerts = useCan("security.alerts.manage") || useCan("settings.manage");
  const canView = canReadEvents || canViewPosture;

  const fetchOverview = useServerFn(getSecurityOverview);
  const fetchSummary = useServerFn(getSecurityDashboardSummary);
  const fetchEvents = useServerFn(listSecurityEvents);
  const fetchEventDetail = useServerFn(getSecurityEventDetail);
  const mutateEventStatus = useServerFn(updateSecurityEventStatus);
  const mutateAlertStatus = useServerFn(updateSecurityAlertStatus);

  const [tab, setTab] = useState("events");
  const [hours, setHours] = useState<number>(24);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<"ALL" | "CRITICAL" | "HIGH" | "MEDIUM" | "LOW">("ALL");
  const [status, setStatus] = useState<
    "ALL" | "NEW" | "INVESTIGATING" | "ACKNOWLEDGED" | "RESOLVED" | "FALSE_POSITIVE"
  >("ALL");
  const [alertFilter, setAlertFilter] = useState<string>("ACTIVE");
  const [page, setPage] = useState(1);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [nextEventStatus, setNextEventStatus] = useState<
    "NEW" | "INVESTIGATING" | "ACKNOWLEDGED" | "RESOLVED" | "FALSE_POSITIVE"
  >("INVESTIGATING");
  const [resolutionNote, setResolutionNote] = useState("");

  useRealtimeRefresh({
    channel: "admin-security-center",
    tables: ["security_events", "security_alerts"],
    keys: [
      ["security-dashboard-summary"],
      ["security-events"],
      ["security-overview"],
    ],
    enabled: canView,
  });

  const summaryQuery = useQuery({
    queryKey: ["security-dashboard-summary", hours],
    queryFn: () => fetchSummary({ data: { hours } }),
    enabled: canView,
    staleTime: 15_000,
  });

  const eventsQuery = useQuery({
    queryKey: ["security-events", { hours, search, severity, status, page }],
    queryFn: () =>
      fetchEvents({
        data: {
          hours,
          search,
          severity,
          status,
          category: "ALL",
          page,
          pageSize: PAGE_SIZE,
        },
      }),
    enabled: canView && tab === "events",
    staleTime: 10_000,
  });

  const overviewQuery = useQuery({
    queryKey: ["security-overview"],
    queryFn: () => fetchOverview({}),
    enabled: canViewPosture,
    staleTime: 30_000,
  });

  const detailQuery = useQuery({
    queryKey: ["security-event-detail", selectedEventId],
    queryFn: () => fetchEventDetail({ data: { id: selectedEventId! } }),
    enabled: Boolean(selectedEventId) && canView,
  });

  const eventMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      status: "NEW" | "INVESTIGATING" | "ACKNOWLEDGED" | "RESOLVED" | "FALSE_POSITIVE";
      note: string;
    }) => mutateEventStatus({ data: payload }),
    onSuccess: (res) => {
      if (!res?.ok) {
        toast.error(res?.message ?? "Gagal memperbarui status event.");
        return;
      }
      toast.success(res.message);
      void queryClient.invalidateQueries({ queryKey: ["security-events"] });
      void queryClient.invalidateQueries({ queryKey: ["security-dashboard-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["security-event-detail", selectedEventId] });
    },
    onError: () => toast.error("Gagal memperbarui status event."),
  });

  const alertMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      status: "OPEN" | "INVESTIGATING" | "ACKNOWLEDGED" | "RESOLVED" | "FALSE_POSITIVE";
      note?: string;
    }) => mutateAlertStatus({ data: payload }),
    onSuccess: (res) => {
      if (!res?.ok) {
        toast.error(res?.message ?? "Gagal memperbarui status alert.");
        return;
      }
      toast.success(res.message);
      void queryClient.invalidateQueries({ queryKey: ["security-dashboard-summary"] });
    },
    onError: () => toast.error("Gagal memperbarui status alert."),
  });

  if (!canView) return <ForbiddenState permission="settings.view" />;

  const summary = summaryQuery.data?.summary;
  const overview = overviewQuery.data?.overview;
  const alerts: SecurityAlertRecord[] = summary?.alerts ?? [];
  const filteredAlerts = alerts.filter((a) => {
    if (alertFilter === "ACTIVE") return a.status === "OPEN" || a.status === "INVESTIGATING";
    if (alertFilter === "ALL") return true;
    return a.status === alertFilter;
  });

  const handleRefreshAll = () => {
    void summaryQuery.refetch();
    void eventsQuery.refetch();
    if (canViewPosture) void overviewQuery.refetch();
  };

  const isRefreshing =
    summaryQuery.isFetching || eventsQuery.isFetching || overviewQuery.isFetching;

  const selectedDetail = detailQuery.data?.event;
  const selectedHistories = detailQuery.data?.histories ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        crumb="Pusat Keamanan"
        title="Pusat Keamanan & Monitoring"
        description="Pemantauan percobaan akses API tidak sah, security alerts, investigasi event, dan postur RLS database."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(hours)}
              onValueChange={(v) => {
                setPage(1);
                setHours(Number(v));
              }}
            >
              <SelectTrigger className="min-h-11 w-36 bg-card" aria-label="Rentang waktu monitoring">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24">24 Jam terakhir</SelectItem>
                <SelectItem value="168">7 Hari terakhir</SelectItem>
                <SelectItem value="720">30 Hari terakhir</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={isRefreshing}
              onClick={handleRefreshAll}
            >
              <RefreshCw
                className={cn("mr-1.5 size-4", isRefreshing && "animate-spin")}
                aria-hidden="true"
              />
              Muat ulang
            </Button>
          </div>
        }
      />

      {summary?.migrationPending ? (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm text-warning-foreground"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Migrasi tabel Security Monitoring belum aktif di database target</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Terapkan migrasi{" "}
              <code className="font-mono">20261122100000_security_monitoring_center.sql</code> di
              Supabase untuk mengaktifkan penyimpanan security_events dan security_alerts secara
              penuh.
            </p>
          </div>
        </div>
      ) : null}

      {summaryQuery.isPending ? (
        <AdminLoading label="Memuat metrik pemantauan keamanan…" />
      ) : summary ? (
        <StatStrip
          items={[
            {
              label: "Total percobaan tercatat",
              value: summary.kpis.totalEvents.toLocaleString("id-ID"),
              hint: `${summary.kpis.uniqueEvents} grup event unik`,
            },
            {
              label: "Akses ditolak (401 / 403)",
              value: (
                summary.kpis.unauthenticatedCount + summary.kpis.forbiddenCount
              ).toLocaleString("id-ID"),
              hint: `${summary.kpis.unauthenticatedCount} tanpa sesi · ${summary.kpis.forbiddenCount} ditolak izin`,
              tone:
                summary.kpis.unauthenticatedCount + summary.kpis.forbiddenCount > 0
                  ? "warning"
                  : "neutral",
            },
            {
              label: "Event Kritis & Tinggi",
              value: summary.kpis.criticalHighCount.toLocaleString("id-ID"),
              hint: `${summary.kpis.rateLimitCount} rate limit · ${summary.kpis.webhookFailureCount} webhook/token gagal`,
              tone: summary.kpis.criticalHighCount > 0 ? "danger" : "neutral",
            },
            {
              label: "Security Alerts Aktif",
              value: summary.kpis.openAlertsCount.toLocaleString("id-ID"),
              hint: "Memerlukan tinjauan admin",
              tone: summary.kpis.openAlertsCount > 0 ? "danger" : "success",
            },
          ]}
        />
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted/70 p-1">
          <TabsTrigger value="events" className="min-h-10 gap-1.5 px-3">
            <Activity className="size-4" aria-hidden="true" />
            Security Events
          </TabsTrigger>
          <TabsTrigger value="alerts" className="min-h-10 gap-1.5 px-3">
            <BellRing className="size-4" aria-hidden="true" />
            Security Alerts
            {summary && summary.kpis.openAlertsCount > 0 ? (
              <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground tabular-nums">
                {summary.kpis.openAlertsCount}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="posture" className="min-h-10 gap-1.5 px-3">
            <Database className="size-4" aria-hidden="true" />
            Postur Database & RLS
          </TabsTrigger>
        </TabsList>

        {/* ---------------- TAB 1: SECURITY EVENTS ---------------- */}
        <TabsContent value="events" className="space-y-4">
          {summary && (summary.topEndpoints.length > 0 || summary.topIps.length > 0) ? (
            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Endpoint Paling Sering Disasar
                </h2>
                {summary.topEndpoints.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">Belum ada data pada rentang ini.</p>
                ) : (
                  <ul className="mt-2.5 space-y-1.5 text-xs">
                    {summary.topEndpoints.map((row) => (
                      <li key={row.endpoint} className="flex items-center justify-between gap-2">
                        <code className="truncate font-mono text-[11px] text-foreground">
                          {row.endpoint}
                        </code>
                        <span className="shrink-0 font-semibold tabular-nums text-muted-foreground">
                          {row.count}x
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  IP / Sumber Terbanyak Ditolak
                </h2>
                {summary.topIps.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">Belum ada IP tercatat pada rentang ini.</p>
                ) : (
                  <ul className="mt-2.5 space-y-1.5 text-xs">
                    {summary.topIps.map((row) => (
                      <li key={row.ip} className="flex items-center justify-between gap-2">
                        <code className="truncate font-mono text-[11px] text-foreground">
                          {row.ip}
                        </code>
                        <span className="shrink-0 font-semibold tabular-nums text-muted-foreground">
                          {row.count}x
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchField
              id="security-events-search"
              value={search}
              onChange={(v) => {
                setPage(1);
                setSearch(v);
              }}
              placeholder="Cari endpoint, IP, Request ID, atau reason…"
              label="Cari security event"
              className="w-full sm:max-w-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={severity}
                onValueChange={(v) => {
                  setPage(1);
                  setSeverity(v as typeof severity);
                }}
              >
                <SelectTrigger className="min-h-11 w-40 bg-card" aria-label="Filter severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Severity</SelectItem>
                  <SelectItem value="CRITICAL">CRITICAL</SelectItem>
                  <SelectItem value="HIGH">HIGH</SelectItem>
                  <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                  <SelectItem value="LOW">LOW</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <StatusTabs
            label="Filter status investigasi security event"
            value={status}
            onChange={(v) => {
              setPage(1);
              setStatus(v as typeof status);
            }}
            options={[
              { value: "ALL", label: "Semua" },
              { value: "NEW", label: "Baru" },
              { value: "INVESTIGATING", label: "Diselidiki" },
              { value: "ACKNOWLEDGED", label: "Diketahui" },
              { value: "RESOLVED", label: "Selesai" },
              { value: "FALSE_POSITIVE", label: "False Positive" },
            ]}
          />

          {eventsQuery.isPending ? (
            <AdminLoading label="Memuat security events…" />
          ) : eventsQuery.error ? (
            <AdminError message="Daftar security event tidak dapat dimuat." />
          ) : eventsQuery.data?.error ? (
            <AdminError message={eventsQuery.data.error} />
          ) : (eventsQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyRow message="Belum ada security event yang cocok pada rentang waktu ini." />
          ) : (
            <>
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="security-events-caption"
                className="overflow-x-auto rounded-xl border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Table>
                  <TableCaption id="security-events-caption" className="sr-only">
                    Daftar kejadian akses tidak sah dan aktivitas mencurigakan Ebrystore
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Waktu</TableHead>
                      <TableHead scope="col">Severity</TableHead>
                      <TableHead scope="col">Event & Endpoint</TableHead>
                      <TableHead scope="col">Aktor & Sumber</TableHead>
                      <TableHead scope="col">Status</TableHead>
                      <TableHead scope="col" className="text-right">
                        Aksi
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(eventsQuery.data?.items ?? []).map((ev) => (
                      <TableRow key={ev.id}>
                        <TableCell className="whitespace-nowrap align-top text-xs text-muted-foreground">
                          <span className="block tabular-nums text-foreground">
                            {formatTime(ev.last_seen_at)}
                          </span>
                          {ev.occurrence_count > 1 ? (
                            <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
                              {ev.occurrence_count}x terdeteksi
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge
                            variant="outline"
                            className={cn("font-mono text-[10px]", EVENT_SEVERITY_BADGE[ev.severity])}
                          >
                            {ev.severity}
                          </Badge>
                          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                            HTTP {ev.status_code}
                          </p>
                        </TableCell>
                        <TableCell className="max-w-72 align-top">
                          <p className="font-mono text-xs font-semibold text-foreground">
                            {ev.http_method} {ev.endpoint}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {ev.event_type} · {ev.reason_code}
                          </p>
                          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                            Ref: {ev.request_id}
                          </p>
                        </TableCell>
                        <TableCell className="max-w-52 align-top text-xs">
                          <p className="truncate font-mono text-foreground">
                            {ev.ip_address ?? "IP tidak tersedia"}
                          </p>
                          <p className="mt-0.5 truncate text-muted-foreground">
                            {ev.actor_email_masked ??
                              (ev.actor_user_id ? `user:${ev.actor_user_id.slice(0, 8)}` : "Guest / Anon")}
                            {ev.actor_role ? ` (${ev.actor_role})` : ""}
                          </p>
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge
                            variant="outline"
                            className={cn("text-[11px]", WORKFLOW_STATUS_CLASS[ev.detection_status])}
                          >
                            {WORKFLOW_STATUS_LABEL[ev.detection_status] ?? ev.detection_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-10"
                            aria-label={`Lihat detail event ${ev.request_id}`}
                            onClick={() => {
                              setSelectedEventId(ev.id);
                              setNextEventStatus(ev.detection_status);
                              setResolutionNote(ev.resolution_note ?? "");
                            }}
                          >
                            <Eye className="mr-1.5 size-3.5" aria-hidden="true" />
                            Detail
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pager
                page={page}
                pageSize={PAGE_SIZE}
                total={eventsQuery.data?.total ?? 0}
                onChange={setPage}
              />
            </>
          )}
        </TabsContent>

        {/* ---------------- TAB 2: SECURITY ALERTS ---------------- */}
        <TabsContent value="alerts" className="space-y-4">
          <StatusTabs
            label="Filter status security alerts"
            value={alertFilter}
            onChange={setAlertFilter}
            options={[
              { value: "ACTIVE", label: "Aktif", count: summary?.kpis.openAlertsCount ?? 0 },
              { value: "ALL", label: "Semua" },
              { value: "ACKNOWLEDGED", label: "Diketahui" },
              { value: "RESOLVED", label: "Selesai" },
              { value: "FALSE_POSITIVE", label: "False Positive" },
            ]}
          />

          {filteredAlerts.length === 0 ? (
            <EmptyRow message="Tidak ada security alert pada filter ini." />
          ) : (
            <ul className="space-y-3">
              {filteredAlerts.map((alert) => (
                <li
                  key={alert.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn("font-mono text-[10px]", EVENT_SEVERITY_BADGE[alert.severity])}
                        >
                          {alert.severity}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn("text-[11px]", WORKFLOW_STATUS_CLASS[alert.status])}
                        >
                          {WORKFLOW_STATUS_LABEL[alert.status] ?? alert.status}
                        </Badge>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {alert.rule_code} · {alert.trigger_count}x pemicu
                        </span>
                      </div>
                      <h3 className="mt-2 text-sm font-semibold text-foreground">{alert.title}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {alert.description}
                      </p>
                      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
                        {alert.source_ip ? <span>IP: {alert.source_ip}</span> : null}
                        {alert.target_endpoint ? <span>Target: {alert.target_endpoint}</span> : null}
                        <span>Terakhir: {formatTime(alert.last_triggered_at)}</span>
                      </p>
                    </div>

                    {canManageAlerts ? (
                      <div className="flex flex-wrap gap-2">
                        {alert.status === "OPEN" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-10"
                            disabled={alertMutation.isPending}
                            onClick={() =>
                              alertMutation.mutate({ id: alert.id, status: "INVESTIGATING" })
                            }
                          >
                            Selidiki
                          </Button>
                        ) : null}
                        {alert.status !== "RESOLVED" ? (
                          <Button
                            size="sm"
                            className="min-h-10"
                            disabled={alertMutation.isPending}
                            onClick={() =>
                              alertMutation.mutate({ id: alert.id, status: "RESOLVED" })
                            }
                          >
                            Selesai
                          </Button>
                        ) : null}
                        {alert.status !== "FALSE_POSITIVE" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-10"
                            disabled={alertMutation.isPending}
                            onClick={() =>
                              alertMutation.mutate({ id: alert.id, status: "FALSE_POSITIVE" })
                            }
                          >
                            False Positive
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        {/* ---------------- TAB 3: POSTUR DATABASE & RLS ---------------- */}
        <TabsContent value="posture" className="space-y-5">
          {!canViewPosture ? (
            <ForbiddenState permission="settings.view" />
          ) : overviewQuery.isPending ? (
            <AdminLoading label="Memeriksa postur database & RLS…" />
          ) : overviewQuery.error || !overview ? (
            <AdminError message="Ringkasan postur database tidak dapat dimuat." />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Kondisi nyata database & storage: RLS, hak akses anon, fungsi definer, dan bucket.
                </p>
                <p className="text-xs text-muted-foreground">
                  Diperiksa {formatTime(overview.checkedAt)}
                </p>
              </div>

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
                  Temuan Postur Infrastruktur
                </h2>
                <ul className="space-y-2">
                  {overview.findings.map((finding) => {
                    const style = FINDING_STYLE[finding.severity];
                    const Icon = style.icon;
                    return (
                      <li
                        key={finding.id}
                        className={cn(
                          "flex items-start gap-3 rounded-xl border px-3.5 py-3",
                          style.wrap,
                        )}
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
                              {FINDING_LABEL[finding.severity]}
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
                  Audit perubahan terakhir
                </h2>
                {overview.recentAudit.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Belum ada catatan audit.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-border">
                    {overview.recentAudit.map((entry, index) => (
                      <li
                        key={index}
                        className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                      >
                        <span className="min-w-0 break-words font-mono text-xs">{entry.action}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {entry.actor_role ?? "sistem"} · {formatTime(entry.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ---------------- EVENT DETAIL DRAWER ---------------- */}
      <Sheet open={Boolean(selectedEventId)} onOpenChange={(open) => !open && setSelectedEventId(null)}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"
        >
          <SheetHeader className="border-b border-border px-6 py-5 text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="size-4 text-destructive" aria-hidden="true" />
              Detail Security Event
            </SheetTitle>
            <SheetDescription className="font-mono text-xs">
              {selectedDetail ? `Ref: ${selectedDetail.request_id}` : "Memuat detail…"}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 p-6 text-sm">
            {detailQuery.isPending ? (
              <AdminLoading label="Memuat detail event…" />
            ) : !selectedDetail ? (
              <AdminError message="Event tidak ditemukan." />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn("font-mono", EVENT_SEVERITY_BADGE[selectedDetail.severity])}
                  >
                    {selectedDetail.severity}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={WORKFLOW_STATUS_CLASS[selectedDetail.detection_status]}
                  >
                    {WORKFLOW_STATUS_LABEL[selectedDetail.detection_status] ??
                      selectedDetail.detection_status}
                  </Badge>
                  <Badge variant="secondary" className="font-mono text-[11px]">
                    {selectedDetail.source_system}
                  </Badge>
                </div>

                <dl className="grid gap-3 rounded-xl border border-border bg-surface/60 p-4 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Endpoint</dt>
                    <dd className="mt-0.5 break-all font-mono font-semibold">
                      {selectedDetail.http_method} {selectedDetail.endpoint}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Reason Code & HTTP</dt>
                    <dd className="mt-0.5 font-mono">
                      {selectedDetail.reason_code} ({selectedDetail.status_code})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Tipe Event</dt>
                    <dd className="mt-0.5 font-mono">{selectedDetail.event_type}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Frekuensi Kejadian</dt>
                    <dd className="mt-0.5 tabular-nums font-semibold">
                      {selectedDetail.occurrence_count}x (terakhir{" "}
                      {formatTime(selectedDetail.last_seen_at)})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Alamat IP</dt>
                    <dd className="mt-0.5 font-mono">{selectedDetail.ip_address ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Aktor</dt>
                    <dd className="mt-0.5 break-all">
                      {selectedDetail.actor_email_masked ??
                        selectedDetail.actor_user_id ??
                        "Guest / Tidak login"}{" "}
                      {selectedDetail.actor_role ? `(${selectedDetail.actor_role})` : ""}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">User-Agent</dt>
                    <dd className="mt-0.5 break-all font-mono text-[11px]">
                      {selectedDetail.user_agent ?? "-"}
                    </dd>
                  </div>
                </dl>

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Metadata Tersanitasi
                  </h3>
                  <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-muted/60 p-3 font-mono text-[11px] leading-relaxed">
                    {JSON.stringify(selectedDetail.sanitized_metadata ?? {}, null, 2)}
                  </pre>
                </div>

                {canResolveEvents ? (
                  <form
                    className="space-y-3 rounded-xl border border-border bg-card p-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      eventMutation.mutate({
                        id: selectedDetail.id,
                        status: nextEventStatus,
                        note: resolutionNote.trim(),
                      });
                    }}
                  >
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Tindak Lanjut & Investigasi
                    </h3>
                    <div className="space-y-1.5">
                      <Label htmlFor="sec-next-status">Status Investigasi</Label>
                      <Select
                        value={nextEventStatus}
                        onValueChange={(v) => setNextEventStatus(v as typeof nextEventStatus)}
                      >
                        <SelectTrigger id="sec-next-status" className="min-h-11 bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NEW">Baru</SelectItem>
                          <SelectItem value="INVESTIGATING">Diselidiki</SelectItem>
                          <SelectItem value="ACKNOWLEDGED">Diketahui</SelectItem>
                          <SelectItem value="RESOLVED">Selesai</SelectItem>
                          <SelectItem value="FALSE_POSITIVE">False Positive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sec-note">Catatan Investigasi</Label>
                      <Textarea
                        id="sec-note"
                        value={resolutionNote}
                        onChange={(e) => setResolutionNote(e.target.value)}
                        rows={3}
                        maxLength={1000}
                        placeholder="Ringkasan hasil verifikasi atau tindakan mitigasi…"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="min-h-11 w-full"
                      disabled={eventMutation.isPending}
                    >
                      {eventMutation.isPending ? (
                        <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
                      ) : null}
                      Simpan Status Investigasi
                    </Button>
                  </form>
                ) : null}

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Riwayat Investigasi
                  </h3>
                  {selectedHistories.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Belum ada perubahan status investigasi.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {selectedHistories.map((h) => (
                        <li
                          key={h.id}
                          className="rounded-lg border border-border bg-surface/50 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              {h.previous_status ?? "-"} → {h.new_status}
                            </span>
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                              {formatTime(h.created_at)}
                            </span>
                          </div>
                          {h.note ? (
                            <p className="mt-1 text-muted-foreground">{h.note}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
