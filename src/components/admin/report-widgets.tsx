import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

/**
 * Widget kecil khusus halaman laporan admin.
 * Angka selalu dari props (server-authoritative) — tidak ada nilai hiasan.
 */

/** Angka beranimasi count-up. Hanya bergerak saat nilai berubah; hormati reduced-motion. */
export function CountUp({ value, format }: { value: number; format?: (v: number) => string }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      startRef.current = value;
      return;
    }
    const from = startRef.current ?? 0;
    startRef.current = value;
    const controls = animate(from, value, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [value, reduced]);

  const safe = Number.isFinite(display) ? display : value;
  return <span>{format ? format(safe) : Math.round(safe).toLocaleString("id-ID")}</span>;
}

/** Bar proporsi kecil untuk data completed/total (bukan hiasan: lebar = data). */
export function MiniProgress({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${value} dari ${max} selesai`}
      className={`h-1.5 w-full overflow-hidden rounded-full bg-muted ${className ?? ""}`}
    >
      <div className="h-full rounded-full bg-chart-2" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Baris legenda berwarna untuk menyandingkan donut dengan angka eksak. */
export function LegendRow({
  color,
  label,
  detail,
  strong = false,
}: {
  color: string;
  label: string;
  detail: string;
  strong?: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="truncate">{label}</span>
      </span>
      <span
        className={`shrink-0 tabular-nums ${strong ? "font-semibold" : "font-medium text-muted-foreground"}`}
      >
        {detail}
      </span>
    </li>
  );
}
