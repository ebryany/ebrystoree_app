import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  MessageSquareWarning,
  PackageCheck,
  Radio,
  Rocket,
  UserCheck,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { ORDER_STATUS_LABEL } from "@/lib/transaction-labels";

export type LiveEvent = {
  id: string;
  at: string;
  title: string;
  description?: string | null;
  icon: LucideIcon;
  tone: "accent" | "muted" | "danger";
};

const DIGITAL_STAGES = ["awaiting_payment", "payment_under_review", "paid", "completed"] as const;
const SERVICE_STAGES = [
  "awaiting_payment",
  "payment_under_review",
  "paid",
  "waiting_assignment",
  "in_progress",
  "waiting_customer_review",
  "completed",
] as const;

/**
 * Tahap pesanan jasa seller: pembayaran digabung dengan pengerjaan dari
 * work_state kontrak, supaya pembeli melihat satu alur yang utuh.
 */
const MARKETPLACE_STAGES = [
  "awaiting_payment",
  "payment_under_review",
  "paid",
  "awaiting_requirements",
  "in_progress",
  "delivered",
  "accepted",
] as const;

const MARKETPLACE_STAGE_LABEL: Record<string, string> = {
  awaiting_requirements: "Menunggu persetujuan seller",
  in_progress: "Sedang dikerjakan",
  delivered: "Hasil dikirim, menunggu peninjauan",
  accepted: "Diterima pembeli",
};

const MARKETPLACE_STAGE_ORDER: Record<string, number> = {
  awaiting_payment: 0,
  payment_under_review: 1,
  paid: 2,
  awaiting_requirements: 3,
  in_progress: 4,
  delivered: 5,
  revision_requested: 5,
  complaint_open: 5,
  accepted: 6,
  refunded: 6,
};

/** Tahap aktif pesanan jasa: work_state lebih menentukan daripada order.status. */
export function marketplaceStageKey(orderStatus: string, workState?: string | null): string {
  if (workState === "refunded") return "refunded";
  if (workState === "complaint_open") return "complaint_open";
  if (workState === "accepted") return "accepted";
  if (workState === "revision_requested") return "revision_requested";
  if (workState === "delivered") return "delivered";
  if (workState === "in_progress") return "in_progress";
  if (workState === "awaiting_requirements") {
    return orderStatus === "paid" ? "awaiting_requirements" : orderStatus;
  }
  return orderStatus;
}

const STAGE_ORDER: Record<string, number> = {
  draft: 0,
  awaiting_payment: 0,
  payment_under_review: 1,
  paid: 2,
  waiting_assignment: 3,
  assigned: 3,
  waiting_customer_data: 3,
  queued: 3,
  academic_review: 3,
  in_progress: 4,
  waiting_customer_review: 5,
  completed: 6,
};

/** Jarak waktu relatif dalam Bahasa Indonesia. */
function relative(from: string, now: number): string {
  const diff = Math.max(0, now - new Date(from).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 45) return "baru saja";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} hari lalu`;
  return new Date(from).toLocaleDateString("id-ID", { dateStyle: "medium" });
}

/** Jam berjalan supaya label waktu relatif tetap hidup tanpa refetch. */
function useNow(intervalMs = 20000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function buildOrderEvents(input: {
  order: any;
  histories: any[];
  payments?: any[];
  fulfillment?: any;
  serviceEvents?: any[];
  serviceWorkState?: string | null;
}): LiveEvent[] {
  const events: LiveEvent[] = [];
  const { order, histories, payments = [], fulfillment, serviceEvents = [] } = input;

  // Satu momen satu catatan: event jasa yang lebih kaya menggantikan entri
  // generik yang menceritakan hal sama (dibuat, menunggu bayar, selesai).
  const hasServiceCreated = serviceEvents.some((e: any) => e.event_type === "order_created");
  const hasServiceAccepted = serviceEvents.some((e: any) => e.event_type === "accepted");
  const hasPaidPayment = payments.some((p: any) => p.paid_at);

  if (order?.created_at && !hasServiceCreated) {
    events.push({
      id: `order-${order.id}`,
      at: order.created_at,
      title: "Pesanan dibuat",
      description: order.order_number,
      icon: Rocket,
      tone: "muted",
    });
  }

  for (const h of histories ?? []) {
    if (h.new_status === "awaiting_payment" && hasServiceCreated) continue;
    if (h.new_status === "paid" && hasPaidPayment) continue;
    if (h.new_status === "completed" && hasServiceAccepted) continue;
    events.push({
      id: `hist-${h.created_at}-${h.new_status}`,
      at: h.created_at,
      title: ORDER_STATUS_LABEL[h.new_status] ?? h.new_status,
      description: h.public_note ?? null,
      icon: h.new_status === "completed" ? PackageCheck : ClipboardCheck,
      tone: ["cancelled", "disputed", "refund_requested"].includes(h.new_status)
        ? "danger"
        : "accent",
    });
  }

  for (const p of payments) {
    if (p.paid_at) {
      events.push({
        id: `pay-${p.id}`,
        at: p.paid_at,
        title: "Pembayaran terverifikasi",
        description: p.payment_number,
        icon: Wallet,
        tone: "accent",
      });
    }
  }

  // Event pengerjaan jasa seller; sumbernya marketplace_service_events, bukan
  // fulfillment operator, supaya timeline pembeli membaca alur yang sebenarnya.
  for (const e of serviceEvents) {
    const label = MARKETPLACE_EVENT_LABEL[e.event_type] ?? e.event_type;
    const actor =
      e.actor_role === "buyer" ? "Pembeli" : e.actor_role === "seller" ? "Seller" : "Admin";
    const detail =
      typeof e.payload?.reason === "string"
        ? e.payload.reason
        : typeof e.payload?.summary === "string"
          ? e.payload.summary
          : typeof e.payload?.due_at === "string"
            ? `Tenggat ${new Date(e.payload.due_at).toLocaleDateString("id-ID", { dateStyle: "medium" })}`
            : null;
    events.push({
      id: `svc-${e.id}`,
      at: e.created_at,
      title: label,
      description: detail ? `${detail} · ${actor}` : actor,
      icon:
        e.event_type === "delivery_submitted"
          ? FileCheck2
          : e.event_type === "revision_requested" || e.event_type === "complaint_opened"
            ? MessageSquareWarning
            : e.event_type === "accepted"
              ? PackageCheck
              : Radio,
      tone:
        e.event_type === "complaint_opened" || e.event_type === "refund_requested"
          ? "danger"
          : "accent",
    });
  }

  for (const item of fulfillment?.progress ?? []) {
    events.push({
      id: `prog-${item.id}`,
      at: item.created_at,
      title: item.title ?? "Update pengerjaan",
      description: item.note ?? item.description ?? null,
      icon: Radio,
      tone: "accent",
    });
  }

  for (const item of fulfillment?.results ?? []) {
    events.push({
      id: `res-${item.id}`,
      at: item.created_at,
      title: "Hasil pekerjaan dikirim",
      description: item.summary ?? item.note ?? null,
      icon: FileCheck2,
      tone: "accent",
    });
  }

  for (const item of fulfillment?.revisions ?? []) {
    events.push({
      id: `rev-${item.id}`,
      at: item.created_at,
      title: "Permintaan revisi",
      description: item.reason ?? null,
      icon: MessageSquareWarning,
      tone: "danger",
    });
  }

  if (fulfillment?.assignment?.assigned_at) {
    events.push({
      id: `asg-${fulfillment.assignment.id}`,
      at: fulfillment.assignment.assigned_at,
      title: "Pendamping ditugaskan",
      description: fulfillment.operatorName ?? null,
      icon: UserCheck,
      tone: "accent",
    });
  }

  const seen = new Set<string>();
  return events
    .filter((e) => e.at && (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

const STAGE_ICON: Record<string, LucideIcon> = {
  awaiting_payment: CreditCard,
  payment_under_review: Wallet,
  paid: CheckCircle2,
  waiting_assignment: UserCheck,
  awaiting_requirements: UserCheck,
  in_progress: Radio,
  delivered: FileCheck2,
  accepted: PackageCheck,
  waiting_customer_review: FileCheck2,
  completed: PackageCheck,
};

const MARKETPLACE_EVENT_LABEL: Record<string, string> = {
  order_created: "Pesanan dan kesepakatan dibuat",
  requirements_approved: "Seller menyetujui requirements",
  delivery_submitted: "Seller mengirim hasil",
  revision_requested: "Pembeli meminta revisi",
  accepted: "Pembeli menerima hasil",
  complaint_opened: "Pembeli mengajukan komplain",
  complaint_resumed: "Admin melanjutkan pekerjaan",
  refund_requested: "Refund diajukan",
};

/** Timeline pesanan realtime: rel tahapan + feed aktivitas langsung. */
export function LiveOrderTimeline({
  order,
  histories,
  payments,
  fulfillment,
  serviceEvents,
  serviceWorkState,
  className,
}: {
  order: any;
  histories: any[];
  payments?: any[];
  fulfillment?: any;
  /** Event pengerjaan jasa seller dari marketplace_service_events. */
  serviceEvents?: any[];
  /** work_state kontrak jasa; menentukan tahap aktif untuk marketplace_service. */
  serviceWorkState?: string | null;
  className?: string;
}) {
  const now = useNow();
  const events = useMemo(
    () => buildOrderEvents({ order, histories, payments, fulfillment, serviceEvents }),
    [order, histories, payments, fulfillment, serviceEvents],
  );

  const isMarketplace = order?.order_type === "marketplace_service";
  const stages = isMarketplace
    ? MARKETPLACE_STAGES
    : order?.order_type === "service"
      ? SERVICE_STAGES
      : DIGITAL_STAGES;
  const stageKey = isMarketplace
    ? marketplaceStageKey(order?.status ?? "", serviceWorkState)
    : order?.status;
  const stageOrder = isMarketplace ? MARKETPLACE_STAGE_ORDER : STAGE_ORDER;
  const currentIndex = stageOrder[stageKey] ?? 0;
  const terminal = [
    "cancelled",
    "refunded",
    "refund_processing",
    "refund_requested",
    "disputed",
  ].includes(order?.status);

  // Sorot event baru yang masuk lewat realtime.
  const knownRef = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  useEffect(() => {
    const ids = events.map((e) => e.id);
    if (knownRef.current === null) {
      knownRef.current = new Set(ids);
      return;
    }
    const added = ids.filter((id) => !knownRef.current!.has(id));
    if (added.length) {
      added.forEach((id) => knownRef.current!.add(id));
      setFresh(added);
      const t = setTimeout(() => setFresh([]), 6000);
      return () => clearTimeout(t);
    }
  }, [events]);

  const latest = events[0];

  return (
    <section
      className={cn("min-w-0 rounded-2xl border border-border bg-card p-5", className)}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Lini masa pesanan</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-70" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          Pantauan langsung
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {latest ? `Pembaruan terakhir ${relative(latest.at, now)}` : "Belum ada aktivitas."}
      </p>

      {terminal ? (
        <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          Status pesanan saat ini:{" "}
          {isMarketplace
            ? (MARKETPLACE_STAGE_LABEL[stageKey] ??
              ORDER_STATUS_LABEL[order.status] ??
              order.status)
            : (ORDER_STATUS_LABEL[order.status] ?? order.status)}
          .
        </p>
      ) : null}

      {/* Stepper horizontal kiri ke kanan; dapat digeser di layar sempit. */}
      <div className="-mx-5 mt-4 overflow-x-auto px-5 pb-1">
        <ol aria-label="Tahapan pesanan" className="flex min-w-max items-start md:min-w-0">
          {stages.map((stage, i) => {
            const idx = stageOrder[stage] ?? 0;
            const done = !terminal && idx < currentIndex;
            const active = !terminal && idx === currentIndex;
            const Icon = STAGE_ICON[stage] ?? ClipboardCheck;
            const label = isMarketplace
              ? (MARKETPLACE_STAGE_LABEL[stage] ?? ORDER_STATUS_LABEL[stage] ?? stage)
              : (ORDER_STATUS_LABEL[stage] ?? stage);
            const last = i === stages.length - 1;
            const leftFilled = !terminal && idx <= currentIndex && i > 0;
            const rightFilled = !terminal && idx < currentIndex && !last;
            return (
              <li
                key={stage}
                className="flex w-[7rem] shrink-0 flex-col items-center px-0.5 md:w-auto md:min-w-0 md:flex-1"
                aria-current={active ? "step" : undefined}
              >
                <div className="flex w-full items-center">
                  <span
                    className={cn(
                      "h-0.5 flex-1 rounded-full",
                      i === 0 ? "bg-transparent" : leftFilled ? "bg-accent" : "bg-border",
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      "z-10 grid size-9 shrink-0 place-items-center rounded-full border-2 transition-colors",
                      done
                        ? "border-accent bg-accent text-accent-foreground"
                        : active
                          ? "border-accent bg-card text-accent shadow-card ring-4 ring-accent/15"
                          : "border-border bg-card text-muted-foreground",
                    )}
                  >
                    {done ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : (
                      <Icon className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "h-0.5 flex-1 rounded-full",
                      last ? "bg-transparent" : rightFilled ? "bg-accent" : "bg-border",
                    )}
                    aria-hidden="true"
                  />
                </div>
                <p
                  className={cn(
                    "mt-2 text-center text-[11px] leading-tight md:text-xs",
                    active
                      ? "font-semibold text-foreground"
                      : done
                        ? "font-medium text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {label}
                </p>
                {active ? (
                  <span className="mt-0.5 text-[10px] font-medium text-accent">
                    Sedang berjalan
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Riwayat aktivitas */}
      <h3 className="mt-5 text-xs font-semibold text-muted-foreground">Riwayat aktivitas</h3>
      <ol className="mt-2 space-y-0">
        {events.length === 0 ? (
          <li className="text-sm text-muted-foreground">Belum ada perubahan status.</li>
        ) : (
          events.map((event, i) => {
            const isNew = fresh.includes(event.id);
            const Icon = event.icon;
            return (
              <li
                key={event.id}
                className={cn(
                  "relative flex gap-3 pb-5 last:pb-0",
                  isNew && "animate-in fade-in slide-in-from-top-2 duration-500",
                )}
              >
                {i !== events.length - 1 ? (
                  <span
                    className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5 rounded-full bg-border"
                    aria-hidden="true"
                  />
                ) : null}
                <span
                  className={cn(
                    "z-10 grid size-8 shrink-0 place-items-center rounded-full border",
                    event.tone === "danger"
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : event.tone === "accent"
                        ? "border-accent/40 bg-accent/10 text-accent"
                        : "border-border bg-background text-muted-foreground",
                    isNew && "ring-2 ring-accent/40",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-sm font-semibold">{event.title}</p>
                    <p className="text-[11px] text-muted-foreground">{relative(event.at, now)}</p>
                  </div>
                  {event.description ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">{event.description}</p>
                  ) : null}
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {new Date(event.at).toLocaleString("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                  {isNew ? (
                    <span className="mt-1 inline-flex rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                      Baru
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ol>
    </section>
  );
}
