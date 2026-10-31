import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Clock, Info, XCircle, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/transaction-labels";

export type StatusTone = "success" | "waiting" | "progress" | "danger" | "info" | "neutral";

const TONE: Record<StatusTone, { className: string; Icon: LucideIcon }> = {
  success: { className: "bg-success/12 text-success border-success/30", Icon: CheckCircle2 },
  waiting: { className: "bg-warning/15 text-warning-foreground border-warning/40", Icon: Clock },
  progress: { className: "bg-info/12 text-info border-info/30", Icon: Loader2 },
  danger: { className: "bg-destructive/10 text-destructive border-destructive/30", Icon: XCircle },
  info: { className: "bg-info/12 text-info border-info/30", Icon: Info },
  neutral: { className: "bg-muted text-muted-foreground border-border", Icon: AlertTriangle },
};

const SUCCESS = ["paid", "completed", "published", "done", "approved", "delivered"];
const WAITING = [
  "awaiting_payment",
  "waiting_payment",
  "pending",
  "draft",
  "waiting_customer_data",
  "waiting_customer_review",
  "requested",
  "open",
  "issued",
  "awaiting_requirements",
  "revision_requested",
  "needs_reconciliation",
];
const PROGRESS = [
  "payment_under_review",
  "waiting_verification",
  "waiting_assignment",
  "assigned",
  "queued",
  "in_progress",
  "processing",
  "under_review",
  "refund_processing",
  "revision_in_progress",
  "submitted",
  "in_review",
  "transferred",
];
const DANGER = [
  "cancelled",
  "rejected",
  "failed",
  "expired",
  "disputed",
  "blocked",
  "refunded",
  "archived",
];

export function statusTone(value: string): StatusTone {
  // Pemanggil boleh mengirim nama tone langsung (mis. "success" untuk toko aktif).
  if (Object.hasOwn(TONE, value)) return value as StatusTone;
  if (SUCCESS.includes(value)) return "success";
  if (DANGER.includes(value)) return "danger";
  if (PROGRESS.includes(value)) return "progress";
  if (WAITING.includes(value)) return "waiting";
  return "neutral";
}

export function statusLabel(value: string, kind: "order" | "payment" | "raw" = "order"): string {
  if (kind === "order" && ORDER_STATUS_LABEL[value]) return ORDER_STATUS_LABEL[value];
  if (kind === "payment" && PAYMENT_STATUS_LABEL[value]) return PAYMENT_STATUS_LABEL[value];
  return value.replace(/_/g, " ");
}

/** Badge status bersama untuk customer, admin, dan operator. Selalu ikon + label. */
export function StatusPill({
  value,
  kind = "order",
  label,
  className,
}: {
  value: string;
  kind?: "order" | "payment" | "raw";
  label?: string;
  className?: string;
}) {
  const tone = statusTone(value);
  const { className: toneClass, Icon } = TONE[tone];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        toneClass,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label ?? statusLabel(value, kind)}</span>
    </span>
  );
}
