import type { ReactNode } from "react";

import { StatusPill } from "@/components/ebry/status";
import { CHART_PALETTE } from "@/components/admin/report-charts";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/transaction-labels";

function paletteIndexFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % CHART_PALETTE.length;
}

/** Chip toko untuk tabel transaksi. Tanpa nama = order produk platform. */
export function StoreChip({ name }: { name: string | null | undefined }) {
  if (!name) {
    return (
      <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
        Platform
      </span>
    );
  }
  return (
    <span
      title={name}
      className="inline-flex max-w-44 items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium"
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: CHART_PALETTE[paletteIndexFor(name)] }}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Label Indonesia untuk status mentah refund, payout, task, dan top up. */
export const RAW_STATUS_LABEL: Record<string, string> = {
  requested: "Diajukan",
  under_review: "Ditinjau",
  approved: "Disetujui",
  rejected: "Ditolak",
  processing: "Diproses",
  completed: "Selesai",
  transferred: "Ditransfer",
  needs_reconciliation: "Perlu rekonsiliasi",
  cancelled: "Dibatalkan",
  open: "Terbuka",
  in_progress: "Dikerjakan",
  blocked: "Terhambat",
  done: "Selesai",
  waiting_payment: "Menunggu",
  paid: "Berhasil",
  expired: "Kedaluwarsa",
  failed: "Gagal",
};

export function StatusBadge({
  value,
  kind = "order",
  label,
}: {
  value: string;
  kind?: "order" | "payment" | "raw";
  label?: string;
}) {
  const resolved =
    label ??
    (kind === "order"
      ? ORDER_STATUS_LABEL[value]
      : kind === "payment"
        ? PAYMENT_STATUS_LABEL[value]
        : RAW_STATUS_LABEL[value]);
  return <StatusPill value={value} kind={kind} label={resolved} />;
}

export function DetailCard({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">{children ?? "-"}</dd>
    </div>
  );
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}
