import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CountUp } from "@/components/admin/report-widgets";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Primitif UI dashboard Pertumbuhan.
 *
 * Semua halaman /see memakai komponen ini supaya bahasa visualnya satu:
 * border tipis + bg-card (low elevation), angka selalu tabular-nums, satu
 * aksen ink-teal, dan motion hanya seperlunya sesuai DESIGN.md
 * (ENERGY 1 / RHYTHM 2 / MOTION 1 untuk halaman data).
 */

/** Kartu metrik: satu angka besar dengan label dan keterangan. */
export function MetricCard({
  label,
  value,
  format,
  hint,
  tone = "default",
}: {
  label: string;
  value: number;
  format?: (v: number) => string;
  hint?: string;
  tone?: "default" | "danger" | "success";
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-2.5 break-words text-2xl font-bold tabular-nums",
          tone === "danger"
            ? "text-destructive"
            : tone === "success"
              ? "text-success"
              : "text-foreground",
        )}
      >
        <CountUp value={value} format={format} />
      </dd>
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Kartu seksi dengan judul pertanyaan, mengikuti pola Panel di dashboard admin. */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-xl border border-border bg-card", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** Keadaan kosong yang menjelaskan cara mengisi, bukan sekadar "tidak ada data". */
export function EmptyWell({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-surface px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

/** Pil status: warna lewat titik + latar lembut, teks tetap kontras tinggi. */
export function StatusPill({
  tone,
  children,
}: {
  tone: "neutral" | "success" | "warning" | "danger" | "accent";
  children: ReactNode;
}) {
  const dot =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "danger"
          ? "bg-destructive"
          : tone === "accent"
            ? "bg-accent"
            : "bg-muted-foreground";
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-foreground">
      <span className={cn("size-1.5 shrink-0 rounded-full", dot)} aria-hidden="true" />
      {children}
    </span>
  );
}

/**
 * Daftar peringkat dengan bar proporsi.
 *
 * Bar dipakai karena panjangnya membawa data (pangsa terhadap total), bukan
 * hiasan. Angka eksak selalu ikut ditampilkan supaya tidak perlu menaksir.
 */
export function RankedBarList({
  items,
  total,
  formatValue,
  barClassName = "bg-accent",
  maxItems,
}: {
  items: Array<{ label: string; value: number }>;
  total?: number;
  formatValue?: (v: number) => string;
  barClassName?: string;
  maxItems?: number;
}) {
  const shown = typeof maxItems === "number" ? items.slice(0, maxItems) : items;
  const max = Math.max(...shown.map((i) => i.value), 1);
  const sum = total ?? shown.reduce((acc, i) => acc + i.value, 0);

  return (
    <ul className="space-y-3">
      {shown.map((item, index) => {
        const share = sum > 0 ? Math.round((item.value / sum) * 100) : 0;
        return (
          <li
            key={item.label}
            className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3"
          >
            <span className="tabular-nums text-xs text-muted-foreground">{index + 1}</span>
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground" title={item.label}>
                {item.label}
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", barClassName)}
                  style={{ width: `${(item.value / max) * 100}%` }}
                />
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="tabular-nums text-sm font-semibold text-foreground">
                {formatValue ? formatValue(item.value) : item.value.toLocaleString("id-ID")}
              </p>
              <p className="tabular-nums text-[11px] text-muted-foreground">{share}%</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Satu langkah funnel: bar dengan lebar sesuai nilai terhadap langkah terbesar. */
export function FunnelStep({
  label,
  value,
  max,
  hint,
}: {
  label: string;
  value: number;
  max: number;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="tabular-nums text-sm font-semibold text-foreground">
          {value.toLocaleString("id-ID")}
        </p>
      </div>
      <div className="mt-2 h-6 overflow-hidden rounded-md bg-muted">
        <div
          className="h-full rounded-md bg-primary transition-[width] duration-200"
          style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
        />
      </div>
      {hint ? <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Fade + naik 6px sekali saat halaman tampil (180ms), untuk pergantian state
 * antarhalaman. Dipakai satu kali per halaman, bukan per elemen, supaya tidak
 * jadi animasi template. Hormati prefers-reduced-motion.
 */
export function Reveal({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

/** Kerangka muat: bentuk kartu metrik + satu panel, memakai Skeleton shadcn. */
export function LoadingPanels({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-6" role="status" aria-label="Memuat data">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-20" />
            <Skeleton className="mt-2.5 h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="mt-4 h-40 w-full" />
      </div>
    </div>
  );
}

/**
 * Grafik tren kunjungan harian.
 *
 * Satu seri saja, jadi tidak perlu legenda: judul kartu sudah menjelaskan
 * isinya. Recharts baru dirender setelah mount supaya tidak ada mismatch SSR.
 */
export function TrafficTrendChart({ daily }: { daily: Array<{ day: string; value: number }> }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-[260px] animate-pulse rounded-lg bg-muted/50" />;
  }

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="day"
            minTickGap={16}
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: string) => {
              const d = new Date(value);
              return Number.isNaN(d.getTime())
                ? value
                : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
            }}
          />
          <YAxis
            allowDecimals={false}
            width={40}
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "0.6rem",
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--muted-foreground)", fontSize: 12 }}
            formatter={(value: number) => [value.toLocaleString("id-ID"), "Kunjungan"]}
            labelFormatter={(value) => {
              const d = new Date(String(value));
              return Number.isNaN(d.getTime())
                ? String(value)
                : d.toLocaleDateString("id-ID", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                  });
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--chart-2)"
            strokeWidth={2}
            fill="url(#trafficFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
