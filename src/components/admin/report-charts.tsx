import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatRupiah } from "@/lib/format";

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** Diekspor agar legenda di luar chart bisa memakai warna yang sama persis. */
export const CHART_PALETTE = PALETTE;

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function ChartFrame({ children, height = 260 }: { children: React.ReactElement; height?: number }) {
  const mounted = useMounted();
  if (!mounted) {
    return <div className="animate-pulse rounded-lg bg-muted/50" style={{ height }} />;
  }
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

const tooltipStyle = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "0.6rem",
    color: "var(--popover-foreground)",
    fontSize: 12,
  },
  labelStyle: { color: "var(--muted-foreground)", fontSize: 12 },
} as const;

const axisProps = {
  stroke: "var(--muted-foreground)",
  tick: { fontSize: 11, fill: "var(--muted-foreground)" },
  tickLine: false,
  axisLine: false,
} as const;

function shortDate(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

function compactRupiah(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} jt`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} rb`;
  return String(value);
}

export function RevenueTrendChart({
  daily,
}: {
  daily: Array<{ date: string; orders: number; revenue: number }>;
}) {
  return (
    <ChartFrame height={280}>
      <AreaChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps} minTickGap={16} />
        <YAxis yAxisId="left" tickFormatter={compactRupiah} width={54} {...axisProps} />
        <YAxis
          yAxisId="right"
          orientation="right"
          allowDecimals={false}
          width={32}
          {...axisProps}
        />
        <Tooltip
          {...tooltipStyle}
          labelFormatter={(v) => shortDate(String(v))}
          formatter={(value: number, name: string) =>
            name === "Pendapatan" ? [formatRupiah(Number(value)), name] : [value, name]
          }
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area
          yAxisId="left"
          type="monotone"
          dataKey="revenue"
          name="Pendapatan"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#revFill)"
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="orders"
          name="Order"
          stroke="var(--chart-5)"
          strokeWidth={2}
          dot={false}
        />
      </AreaChart>
    </ChartFrame>
  );
}

export function DonutChart({
  data,
  valueLabel = "",
  centerLabel,
  currency = false,
  legend = true,
}: {
  data: Array<{ name: string; value: number }>;
  valueLabel?: string;
  centerLabel?: string;
  currency?: boolean;
  /** false saat kartu punya legenda tabelnya sendiri (hindari duplikasi). */
  legend?: boolean;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <div className="relative">
      <ChartFrame height={250}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
            stroke="var(--card)"
            strokeWidth={2}
          >
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip
            {...tooltipStyle}
            formatter={(value: number, name: string) => [
              currency ? formatRupiah(Number(value)) : `${value} ${valueLabel}`.trim(),
              name,
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} className={legend ? undefined : "hidden"} />
        </PieChart>
      </ChartFrame>
      <div className="pointer-events-none absolute inset-x-0 top-[42%] -translate-y-1/2 text-center">
        <p className="text-lg font-bold leading-none">{currency ? formatRupiah(total) : total}</p>
        <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          {centerLabel ?? "Total"}
        </p>
      </div>
    </div>
  );
}

export function StatusBarChart({
  data,
  showValues = false,
}: {
  data: Array<{ name: string; value: number }>;
  showValues?: boolean;
}) {
  return (
    <ChartFrame height={Math.max(200, data.length * 38)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: showValues ? 40 : 16, left: 8, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} {...axisProps} />
        <YAxis type="category" dataKey="name" width={140} {...axisProps} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
        <Bar dataKey="value" name="Order" radius={[0, 6, 6, 0]}>
          {data.map((entry, i) => (
            <Cell key={entry.name} fill={PALETTE[i % PALETTE.length]} />
          ))}
          {showValues ? (
            <LabelList
              dataKey="value"
              position="right"
              style={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
          ) : null}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}
