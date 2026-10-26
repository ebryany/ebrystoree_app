import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ChevronDown, FileText, Gavel, Scale } from "lucide-react";

import { formatDateTime } from "@/components/admin/tx-ui";
import { AdminPageHeader, useCan, ForbiddenState } from "@/components/admin/admin-ui";
import { CountUp } from "@/components/admin/report-widgets";
import { ServiceAgreement } from "@/components/seller/marketplace-service-catalog";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/ebry/states";
import { StatusPill } from "@/components/ebry/status";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  type MarketplaceServiceAction,
  type MarketplaceServiceListing,
  marketplaceServiceWorkStateLabels,
  type MarketplaceServiceWorkState,
} from "@/lib/marketplace-service";
import {
  listMarketplaceServiceModeration,
  listOpenServiceComplaints,
  moderateMarketplaceService,
  resolveServiceComplaint,
} from "@/lib/marketplace-service.functions";
import { ORDER_STATUS_LABEL } from "@/lib/transaction-labels";

export const Route = createFileRoute("/_authenticated/admin/seller/jasa")({
  head: () => ({
    meta: [{ title: "Moderasi Jasa Seller | Ebrystore" }, { name: "robots", content: "noindex" }],
  }),
  component: MarketplaceServiceModeration,
});

const TABS = [
  { key: "moderation", label: "Antrean moderasi", hint: "Draft jasa yang menunggu keputusan." },
  {
    key: "complaints",
    label: "Komplain aktif",
    hint: "Komplain pembeli yang membekukan pencairan.",
  },
] as const;

function MarketplaceServiceModeration() {
  const canViewServices = useCan("services.view");
  const canViewOrders = useCan("orders.view");

  if (!canViewServices && !canViewOrders) return <ForbiddenState permission="services.view" />;

  return (
    <div className="min-w-0 space-y-5">
      <AdminPageHeader
        title="Moderasi jasa seller"
        crumb="Moderasi Jasa"
        description="Tinjau kesepakatan kerja dan tangani komplain. Jasa yang disetujui dapat dipesan jika toko, kategori, dan checkout aktif. Dana dilepas setelah penerimaan pembeli."
      />
      <Tabs defaultValue={canViewServices ? "moderation" : "complaints"} className="min-w-0">
        <div className="overflow-x-auto pb-1">
          <TabsList
            aria-label="Panel moderasi"
            className="h-auto justify-start gap-1 bg-transparent p-0"
          >
            {TABS.filter((entry) =>
              entry.key === "moderation" ? canViewServices : canViewOrders,
            ).map((entry) => (
              <TabsTrigger
                key={entry.key}
                value={entry.key}
                className="min-h-11 rounded-full border border-border bg-card px-4 text-sm motion-reduce:transition-none data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
              >
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {canViewServices ? (
          <TabsContent
            value="moderation"
            forceMount
            className="space-y-4 data-[state=inactive]:hidden"
          >
            <p className="text-sm text-muted-foreground">{TABS[0].hint}</p>
            <ModerationQueue />
          </TabsContent>
        ) : null}
        {canViewOrders ? (
          <TabsContent
            value="complaints"
            forceMount
            className="space-y-4 data-[state=inactive]:hidden"
          >
            <p className="text-sm text-muted-foreground">{TABS[1].hint}</p>
            <ServiceComplaintQueue />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

/* ──────────────────── Antrean moderasi ──────────────────── */

function ModerationQueue() {
  const canView = useCan("services.view");
  const canDecide = useCan("services.update");
  const reduced = useReducedMotion();
  const [page, setPage] = useState(0);
  const [feedback, setFeedback] = useState("");
  const queryClient = useQueryClient();
  const fetchListings = useServerFn(listMarketplaceServiceModeration);
  const moderate = useServerFn(moderateMarketplaceService);
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ["marketplace-service-moderation", page],
    queryFn: () => fetchListings({ data: { page } }),
    enabled: canView,
    refetchOnWindowFocus: "always",
  });
  useRealtimeRefresh({
    channel: "admin-service-moderation",
    tables: ["marketplace_services"],
    keys: [["marketplace-service-moderation"]],
    enabled: canView,
  });
  const mutation = useMutation({
    mutationFn: (action: MarketplaceServiceAction) => moderate({ data: action }),
    onSuccess: async (result) => {
      setFeedback(
        result.ok
          ? "Keputusan moderasi tersimpan. Ketersediaan jasa mengikuti status, toko, kategori, dan checkout."
          : result.error,
      );
      if (result.ok)
        await queryClient.invalidateQueries({ queryKey: ["marketplace-service-moderation"] });
    },
    onError: () =>
      setFeedback("Keputusan gagal disimpan. Alasan tetap tersedia untuk dicoba kembali."),
  });

  if (!canView) return <ForbiddenState permission="services.view" />;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          className="min-h-11"
          disabled={isFetching || mutation.isPending}
          onClick={() => void refetch()}
        >
          {isFetching ? "Memuat…" : "Muat ulang"}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {isPending ? "Memuat antrean…" : ""}
      </p>
      {feedback ? (
        <p role="status" aria-live="polite" className="text-sm font-medium">
          {feedback}
        </p>
      ) : null}

      {isPending ? (
        <CardSkeleton rows={3} />
      ) : error ? (
        <ErrorState
          title="Antrean moderasi gagal dimuat"
          description={error.message}
          onRetry={() => void refetch()}
        />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Tidak ada jasa menunggu moderasi"
          description="Belum ada pengajuan pada halaman ini. Draft muncul setelah seller memilih Ajukan moderasi."
        />
      ) : data ? (
        <>
          <p className="text-xs tabular-nums text-muted-foreground">
            <CountUp value={data.total} /> pengajuan · Halaman {page + 1} dari {totalPages}
          </p>
          <motion.section
            layout={!reduced}
            aria-label="Antrean moderasi jasa"
            className="space-y-3"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {data.items.map((listing, index) => (
                <ModerationCard
                  key={`${listing.id}:${listing.version}`}
                  listing={listing}
                  index={index}
                  reduced={reduced ?? false}
                  canDecide={canDecide}
                  pending={mutation.isPending}
                  onDecide={(action) => mutation.mutate(action)}
                />
              ))}
            </AnimatePresence>
          </motion.section>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs tabular-nums text-muted-foreground">
              {data.total} pengajuan · Halaman {page + 1} dari {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="min-h-11"
                disabled={page === 0 || isFetching || mutation.isPending}
                onClick={() => setPage(page - 1)}
              >
                Sebelumnya
              </Button>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={page + 1 >= totalPages || isFetching || mutation.isPending}
                onClick={() => setPage(page + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </footer>
        </>
      ) : null}
    </div>
  );
}

function ModerationCard({
  listing,
  index,
  reduced,
  canDecide,
  pending,
  onDecide,
}: {
  listing: MarketplaceServiceListing;
  index: number;
  reduced: boolean;
  canDecide: boolean;
  pending: boolean;
  onDecide: (action: MarketplaceServiceAction) => void;
}) {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(true);
  const enough = reason.trim().length >= 5;

  return (
    <motion.article
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1], delay: reduced ? 0 : index * 0.04 }}
      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill value="in_review" kind="raw" label="Menunggu moderasi" />
            <span className="text-xs tabular-nums text-muted-foreground">v{listing.version}</span>
          </div>
          <h2 className="break-words text-sm font-semibold leading-snug">{listing.name}</h2>
          <p className="text-sm tabular-nums text-muted-foreground">
            {formatRupiah(listing.price)} · {listing.agreement.durationDays} hari ·{" "}
            {listing.agreement.revisionLimit} revisi
          </p>
        </div>
      </div>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={`agreement-${listing.id}`}
        onClick={() => setOpen(!open)}
        className="mt-3 flex min-h-11 w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronDown
          className={cn(
            "size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
        Lihat agreement lengkap
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={`agreement-${listing.id}`}
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <ServiceAgreement listing={listing} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {canDecide ? (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <div className="space-y-2">
            <Label htmlFor={`jasa-reason-${listing.id}`} className="text-xs">
              Alasan keputusan (minimal 5 karakter)
            </Label>
            <Textarea
              id={`jasa-reason-${listing.id}`}
              rows={2}
              value={reason}
              disabled={pending}
              minLength={5}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
              placeholder="Tulis alasan persetujuan atau penolakan…"
              className="text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="min-h-11"
              disabled={!enough || pending}
              onClick={() =>
                onDecide({
                  id: listing.id,
                  expectedVersion: listing.version,
                  action: "approve",
                  reason: reason.trim(),
                })
              }
            >
              <Gavel className="size-3.5" aria-hidden="true" />
              Setujui draft
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={!enough || pending}
              onClick={() =>
                onDecide({
                  id: listing.id,
                  expectedVersion: listing.version,
                  action: "reject",
                  reason: reason.trim(),
                })
              }
            >
              Minta perbaikan
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Izin services.update diperlukan untuk mengambil keputusan.
        </p>
      )}
    </motion.article>
  );
}

/* ──────────────────── Komplain jasa ──────────────────── */

type ComplaintRow = {
  order_id: string;
  work_state: MarketplaceServiceWorkState;
  complaint_open: boolean;
  revision_used: number;
  revision_limit: number;
  agreement: { scope: string; durationDays: number; revisionLimit: number };
  orders: { order_number: string; status: string; total: number; created_at: string };
};

function ServiceComplaintQueue() {
  const canView = useCan("orders.view");
  const canUpdate = useCan("orders.update");
  const canApproveRefund = useCan("refunds.approve");
  const reduced = useReducedMotion();
  const [page, setPage] = useState(0);
  const [feedback, setFeedback] = useState("");
  const queryClient = useQueryClient();
  const fetchComplaints = useServerFn(listOpenServiceComplaints);
  const resolve = useServerFn(resolveServiceComplaint);
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ["service-complaints", page],
    queryFn: () => fetchComplaints({ data: { page } }),
    enabled: canView,
    refetchOnWindowFocus: "always",
  });
  useRealtimeRefresh({
    channel: "admin-service-complaints",
    tables: ["marketplace_service_orders"],
    keys: [["service-complaints"]],
    enabled: canView,
  });
  const mutation = useMutation({
    mutationFn: (input: { orderId: string; decision: "resume" | "refund"; reason: string }) =>
      resolve({ data: input }),
    onSuccess: async (result) => {
      setFeedback(
        result.ok
          ? "Keputusan komplain tersimpan. Pipeline refund/tindak lanjut berjalan."
          : result.error,
      );
      if (result.ok) await queryClient.invalidateQueries({ queryKey: ["service-complaints"] });
    },
    onError: () => setFeedback("Keputusan komplain gagal disimpan. Coba lagi."),
  });

  if (!canView) return null;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          className="min-h-11"
          disabled={isFetching || mutation.isPending}
          onClick={() => void refetch()}
        >
          {isFetching ? "Memuat…" : "Muat ulang"}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {isPending ? "Memuat antrean…" : ""}
      </p>
      {feedback ? (
        <p role="status" aria-live="polite" className="text-sm font-medium">
          {feedback}
        </p>
      ) : null}

      {isPending ? (
        <CardSkeleton rows={2} />
      ) : error ? (
        <ErrorState
          title="Komplain gagal dimuat"
          description={error.message}
          onRetry={() => void refetch()}
        />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="Tidak ada komplain aktif"
          description="Tidak ada komplain jasa aktif pada halaman ini. Status dana tetap mengikuti masing-masing pesanan."
        />
      ) : data ? (
        <>
          <p className="text-xs tabular-nums text-muted-foreground">
            <CountUp value={data.total} /> komplain · Halaman {page + 1} dari {totalPages}
          </p>
          <motion.section
            layout={!reduced}
            aria-label="Antrean komplain jasa"
            className="space-y-3"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {data.items.map((row: ComplaintRow, index: number) => (
                <ComplaintCard
                  key={row.order_id}
                  row={row}
                  index={index}
                  reduced={reduced ?? false}
                  pending={mutation.isPending}
                  canResume={canUpdate}
                  canRefund={canApproveRefund}
                  onDecide={(decision, reason) =>
                    mutation.mutate({ orderId: row.order_id, decision, reason })
                  }
                />
              ))}
            </AnimatePresence>
          </motion.section>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs tabular-nums text-muted-foreground">
              {data.total} komplain · Halaman {page + 1} dari {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="min-h-11"
                disabled={page === 0 || isFetching || mutation.isPending}
                onClick={() => setPage(page - 1)}
              >
                Sebelumnya
              </Button>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={page + 1 >= totalPages || isFetching || mutation.isPending}
                onClick={() => setPage(page + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </footer>
        </>
      ) : null}
    </div>
  );
}

function ComplaintCard({
  row,
  index,
  reduced,
  pending,
  canResume,
  canRefund,
  onDecide,
}: {
  row: ComplaintRow;
  index: number;
  reduced: boolean;
  pending: boolean;
  canResume: boolean;
  canRefund: boolean;
  onDecide: (decision: "resume" | "refund", reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const enough = reason.trim().length >= 5;

  return (
    <motion.article
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1], delay: reduced ? 0 : index * 0.04 }}
      className="rounded-2xl border border-warning/40 bg-card p-4 shadow-sm"
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill value="disputed" kind="raw" label="Komplain aktif" />
          <StatusPill
            value={row.work_state}
            kind="raw"
            label={marketplaceServiceWorkStateLabels[row.work_state]}
          />
        </div>
        <h3 className="text-sm font-semibold">{row.orders.order_number}</h3>
        <p className="text-xs tabular-nums text-muted-foreground">
          {formatRupiah(Number(row.orders.total))} ·{" "}
          {ORDER_STATUS_LABEL[row.orders.status] ?? row.orders.status} · revisi {row.revision_used}/
          {row.revision_limit} · dibuat {formatDateTime(row.orders.created_at)}
        </p>
      </div>

      <div className="mt-3 rounded-lg border-l-2 border-info bg-info/5 px-3 py-2">
        <p className="text-xs font-semibold text-info">Scope pekerjaan</p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted-foreground">
          {row.agreement.scope}
        </p>
      </div>

      {canResume || canRefund ? (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <div className="space-y-2">
            <Label htmlFor={`complaint-reason-${row.order_id}`} className="text-xs">
              Alasan keputusan (minimal 5 karakter)
            </Label>
            <Textarea
              id={`complaint-reason-${row.order_id}`}
              rows={2}
              value={reason}
              disabled={pending}
              minLength={5}
              onChange={(event) => setReason(event.target.value)}
              maxLength={5000}
              placeholder="Tulis alasan keputusan komplain…"
              className="text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {canResume ? (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={!enough || pending}
                onClick={() => onDecide("resume", reason.trim())}
              >
                Lanjutkan pekerjaan
              </Button>
            ) : null}
            {canRefund ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11 border-destructive/30 text-destructive hover:bg-destructive/5"
                    disabled={!enough || pending}
                  >
                    <AlertTriangle className="size-3.5" aria-hidden="true" />
                    Putuskan refund penuh
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="max-h-[90dvh] overflow-y-auto motion-reduce:animate-none">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Putuskan refund penuh?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Keputusan untuk pesanan {row.orders.order_number} diteruskan ke pipeline
                      refund. Ini bukan sekadar menutup komplain. Periksa alasan sebelum
                      melanjutkan.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <p className="whitespace-pre-wrap break-words text-sm">{reason.trim()}</p>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="min-h-11">Batal</AlertDialogCancel>
                    <AlertDialogAction
                      className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={!enough || pending}
                      onClick={() => onDecide("refund", reason.trim())}
                    >
                      Konfirmasi refund penuh
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Izin orders.update (lanjutkan) atau refunds.approve (refund) diperlukan untuk memutuskan.
        </p>
      )}
    </motion.article>
  );
}
