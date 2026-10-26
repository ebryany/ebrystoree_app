import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, Package } from "lucide-react";
import type { ReactNode } from "react";

import { StatusPill } from "@/components/ebry/status";
import { LiquidGlassCard } from "@/components/ui/liquid-glass";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export function formatIDR(value: number | null | undefined): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

/** Pintasan layanan bergaya quick-action aplikasi perbankan. */
export function ServiceShortcut({
  to,
  search,
  icon: Icon,
  label,
  hint,
  featured,
}: {
  to: string;
  search?: Record<string, unknown>;
  icon: LucideIcon;
  label: string;
  hint?: string;
  featured?: boolean;
}) {
  return (
    <Link
      to={to}
      search={search as never}
      title={hint}
      className={cn(
        "press-scale group flex min-h-[92px] flex-col items-center justify-start gap-2 rounded-xl px-1.5 py-3 text-center transition-colors duration-200 hover:bg-surface-selected/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-selected text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:bg-accent group-hover:text-accent-foreground group-hover:shadow-lifted",
          featured && "bg-accent text-accent-foreground",
        )}
      >
        <Icon className="size-5" aria-hidden="true" strokeWidth={1.75} />
      </span>
      <span className="w-full px-0.5 text-[11px] font-medium leading-tight text-foreground sm:text-xs">
        {label}
      </span>
    </Link>
  );
}

/** Kartu "perlu tindakan" — selalu tampil sebelum promosi. */
export function ActionRequiredCard({
  icon: Icon,
  title,
  description,
  actionLabel,
  to,
  search,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  to: string;
  search?: Record<string, unknown>;
}) {
  return (
    <article className="relative flex items-start gap-3 overflow-hidden rounded-xl border border-warning/50 bg-warning/10 p-4 shadow-card">
      <span className="absolute inset-y-0 left-0 w-1 bg-warning" aria-hidden="true" />
      <span className="ml-1 grid size-10 shrink-0 place-items-center rounded-lg bg-warning/20 text-warning-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        <Button asChild size="sm" className="mt-3 min-h-10">
          <Link to={to} search={search as never}>
            {actionLabel}
          </Link>
        </Button>
      </div>
    </article>
  );
}

/** Kartu pesanan (dipakai di beranda dan daftar pesanan). */
export function OrderCard({
  id,
  orderNumber,
  title,
  status,
  total,
  createdAt,
  footer,
}: {
  id: string;
  orderNumber: string;
  title: string;
  status: string;
  total: number;
  createdAt?: string;
  footer?: ReactNode;
}) {
  return (
    <article className="press-scale rounded-xl border border-border bg-card p-4 shadow-card transition-[border-color,box-shadow] hover:border-accent/40 hover:shadow-lifted">
      <Link
        to="/dashboard/pesanan/$id"
        params={{ id }}
        className="flex min-h-20 items-start gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill value={status} />
            <span className="font-mono text-[11px] text-muted-foreground">{orderNumber}</span>
          </div>
          <p className="mt-3 line-clamp-2 text-sm font-semibold leading-snug">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatIDR(total)}
            {createdAt
              ? ` · ${new Date(createdAt).toLocaleDateString("id-ID", { dateStyle: "medium" })}`
              : ""}
          </p>
        </div>
        <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
      {footer ? <div className="mt-3 border-t border-border pt-3">{footer}</div> : null}
    </article>
  );
}

/** Bar aksi lengket untuk mobile (checkout, detail, operator). */
export function StickyActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pb-safe sticky bottom-0 z-30 -mx-4 mt-6 border-t border-border bg-background/95 px-4 py-3 backdrop-blur",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Statistik padat marketplace — angka dominan, label kecil, ikon mikro. */
export function StatTile({
  icon: Icon,
  value,
  label,
  to,
  search,
  tone = "accent",
}: {
  icon: LucideIcon;
  value: number | string;
  label: string;
  to?: string;
  search?: Record<string, unknown>;
  tone?: "accent" | "warning" | "success" | "muted";
}) {
  const toneClass = {
    accent: "text-accent",
    warning: "text-warning-foreground",
    success: "text-success",
    muted: "text-muted-foreground",
  }[tone];

  const body = (
    <>
      <span
        className={cn("flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground")}
      >
        <Icon className={cn("size-3.5 shrink-0", toneClass)} aria-hidden="true" strokeWidth={2} />
        <span className="truncate">{label}</span>
      </span>
      <span className="mt-1 block text-lg font-bold leading-none tabular-nums text-foreground sm:text-xl">
        {value}
      </span>
    </>
  );

  const base =
    "group flex min-w-0 flex-1 flex-col rounded-[var(--radius-card)] border border-border bg-card px-3 py-2.5 transition-colors hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  if (!to) return <div className={base}>{body}</div>;

  return (
    <Link to={to} search={search as never} className={base}>
      {body}
    </Link>
  );
}

/** Grid menu cepat padat — ikon + label, target sentuh penuh. */
export function QuickMenuGrid({
  items,
  columns = 4,
}: {
  items: Array<{ to: string; icon: LucideIcon; label: string; search?: Record<string, unknown> }>;
  columns?: 3 | 4;
}) {
  return (
    <ul className={cn("grid gap-0.5", columns === 3 ? "grid-cols-3" : "grid-cols-4")}>
      {items.map((item) => (
        <li key={item.to + item.label}>
          <Link
            to={item.to}
            search={item.search as never}
            className="press-scale group flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-[var(--radius-panel)] px-1 py-2.5 text-center transition-colors hover:bg-surface-selected/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-[var(--radius-panel)] bg-surface-selected text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
              <item.icon className="size-[21px]" aria-hidden="true" strokeWidth={1.85} />
            </span>
            <span className="w-full truncate px-0.5 text-xs font-medium leading-tight text-foreground">
              {item.label}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Header dashboard hangat: sapaan kontekstual, bukan baris label sistem. */
export function DashboardGreeting({
  name,
  avatarUrl,
  initials,
  summary,
  avatarTo = "/dashboard/pengaturan",
  actionTo,
  actionIcon: ActionIcon,
  actionLabel,
}: {
  name: string;
  avatarUrl?: string | null;
  initials: string;
  summary?: string;
  avatarTo?: string;
  actionTo?: string;
  actionIcon?: LucideIcon;
  actionLabel?: string;
}) {
  return (
    <header className="flex items-start gap-3">
      <Link
        to={avatarTo}
        aria-label="Buka pengaturan akun dan ubah foto profil"
        className="mt-0.5 grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-primary text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={`Foto profil ${name}`} className="size-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-bold leading-tight text-foreground">Halo, {name} 👋</p>
        {summary ? (
          <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{summary}</p>
        ) : null}
      </div>
      {actionTo && ActionIcon ? (
        <Link
          to={actionTo}
          aria-label={actionLabel}
          className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-panel)] border border-border bg-card text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ActionIcon className="size-5" aria-hidden="true" />
        </Link>
      ) : null}
    </header>
  );
}

/** Empty state ringkas sebaris — hemat ruang, tetap ada aksi. */
export function InlineEmpty({
  icon: Icon,
  text,
  actionLabel,
  to,
  search,
}: {
  icon: LucideIcon;
  text: string;
  actionLabel?: string;
  to?: string;
  search?: Record<string, unknown>;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-selected text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">{text}</p>
      {to && actionLabel ? (
        <Link
          to={to}
          search={search as never}
          className="flex min-h-11 shrink-0 items-center px-1 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

/** Baris pesanan padat ala katalog marketplace (thumbnail + judul + harga + status). */
export function OrderRow({
  id,
  orderNumber,
  title,
  status,
  total,
  createdAt,
  thumbnailUrl,
  itemCount = 1,
}: {
  id: string;
  orderNumber: string;
  title: string;
  status: string;
  total: number;
  createdAt?: string;
  thumbnailUrl?: string | null;
  itemCount?: number;
}) {
  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        to="/dashboard/pesanan/$id"
        params={{ id }}
        className="flex min-h-[72px] items-center gap-3 py-3 pr-3 transition-colors hover:bg-surface-selected/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface-selected">
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <Package className="size-5 text-muted-foreground" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span className="font-mono">{orderNumber}</span>
            {itemCount > 1 ? <span>· {itemCount} item</span> : null}
            {createdAt ? (
              <span>
                ·{" "}
                {new Date(createdAt).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            ) : null}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill value={status} />
            <span className="text-sm font-bold tabular-nums text-price">{formatIDR(total)}</span>
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

/* ============================================================
 * Banking-style dashboard (mobile-first)
 * ============================================================ */

/** Header halaman dashboard: bersih, netral (tidak bentrok dengan navbar berwarna). */
export function BankHeader({
  name,
  subtitle,
  avatarUrl,
  initials,
  avatarTo = "/dashboard/pengaturan",
  actions = [],
}: {
  name: string;
  subtitle?: string;
  avatarUrl?: string | null;
  initials: string;
  avatarTo?: string;
  actions?: Array<{ to: string; icon: LucideIcon; label: string }>;
}) {
  return (
    <header className="-mx-4 -mt-5 px-4 pb-2 pt-5 md:mt-0 md:pt-0">
      <div className="flex items-center gap-3">
        <Link
          to={avatarTo}
          aria-label="Buka pengaturan akun dan ubah foto profil"
          className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-surface-selected text-base font-semibold text-accent transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={`Foto profil ${name}`} className="size-full object-cover" />
          ) : (
            <span>{initials}</span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold leading-tight text-foreground sm:text-xl">
            Halo, {name} 👋
          </p>
          {subtitle ? (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {actions.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              aria-label={a.label}
              className="grid size-11 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <a.icon className="size-[19px]" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}

/**
 * Kartu saldo bergaya liquid glass.
 *
 * Efek kaca hanya terlihat bila ada sesuatu di belakangnya. Karena halaman
 * dashboard berlatar rata, kartu ini membawa latar dekoratif statis sendiri
 * (gradien token ink-teal, bukan gambar eksternal) sebagai bidang yang di-blur.
 */
export function BalanceCard({
  label,
  credit,
  actionLabel,
  actionIcon: ActionIcon,
  action,
  panel,
}: {
  label: string;
  credit: { value: string; caption: string; to?: string };
  actionLabel?: string;
  actionIcon?: LucideIcon;
  /** Slot aksi tambahan (mis. tombol Isi Saldo); dirender di kiri tautan riwayat. */
  action?: ReactNode;
  /** Konten yang dirender inline di dalam kartu, di bawah baris aksi (bukan popup). */
  panel?: ReactNode;
}) {
  return (
    <div className="relative rounded-3xl shadow-[0_18px_40px_-16px_oklch(0.42_0.06_205/38%),0_4px_12px_-4px_oklch(0.22_0.03_205/18%)]">
      {/* Bidang dekoratif terang yang di-blur kartu, diklip sendiri supaya tidak
          ikut memotong bayangan luar kartu. Sengaja pucat agar teks tetap kontras. */}
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-3xl">
        <div className="absolute inset-0 bg-[linear-gradient(150deg,oklch(0.97_0.02_195),oklch(0.94_0.03_190)_50%,oklch(0.96_0.02_205))]" />
        <div className="absolute -left-10 -top-14 size-40 rounded-full bg-[oklch(0.86_0.07_190/70%)] blur-2xl" />
        <div className="absolute -bottom-16 -right-8 size-48 rounded-full bg-[oklch(0.88_0.06_205/65%)] blur-2xl" />
      </div>
      <LiquidGlassCard
        className="relative rounded-3xl p-4"
        borderRadius="1.5rem"
        shadowIntensity="md"
        glowIntensity="none"
        blurIntensity="lg"
      >
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold leading-none tabular-nums text-foreground">
          {credit.value}
        </p>
        <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{credit.caption}</p>
        {action || credit.to ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {action}
            {credit.to ? (
              <Link
                to={credit.to}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {ActionIcon ? <ActionIcon className="size-4" aria-hidden="true" /> : null}
                {actionLabel ?? "Lihat riwayat"}
              </Link>
            ) : null}
          </div>
        ) : null}
        {panel}
      </LiquidGlassCard>
    </div>
  );
}

/** Ringkasan statistik — kartu terpisah (bukan di dalam kartu saldo). */
export function StatSummary({
  stats,
}: {
  stats: Array<{
    label: string;
    value: number | string;
    to?: string;
    search?: Record<string, unknown>;
    tone?: "default" | "warning";
  }>;
}) {
  return (
    <section
      aria-label="Ringkasan aktivitas"
      className="grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-card"
    >
      {stats.map((s) => {
        const body = (
          <>
            <dd
              className={cn(
                "text-xl font-bold leading-none tabular-nums",
                s.tone === "warning" ? "text-warning-foreground" : "text-foreground",
              )}
            >
              {s.value}
            </dd>
            <dt className="mt-1 text-[11px] leading-tight text-muted-foreground">{s.label}</dt>
          </>
        );
        return (
          <div key={s.label} className="min-w-0 p-3.5">
            {s.to ? (
              <Link
                to={s.to}
                search={s.search as never}
                className="flex min-h-11 flex-col justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {body}
              </Link>
            ) : (
              body
            )}
          </div>
        );
      })}
    </section>
  );
}

/** Grid menu aksi ikon BULAT ala bank. */
export function RoundMenuGrid({
  items,
}: {
  items: Array<{ to: string; icon: LucideIcon; label: string; search?: Record<string, unknown> }>;
}) {
  return (
    <ul className="grid grid-cols-4 gap-y-4">
      {items.map((item) => (
        <li key={item.to + item.label}>
          <Link
            to={item.to}
            search={item.search as never}
            className="press-scale group flex min-h-[80px] flex-col items-center gap-2 rounded-xl px-0.5 py-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid size-14 shrink-0 place-items-center rounded-full bg-surface-selected text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
              <item.icon className="size-6" aria-hidden="true" strokeWidth={1.75} />
            </span>
            <span className="w-full truncate px-0.5 text-[11px] font-medium leading-tight text-foreground">
              {item.label}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Baris list ala transaksi bank: ikon bulat kiri, nominal kanan. */
export function BankListRow({
  icon: Icon,
  title,
  subtitle,
  value,
  valueTone = "default",
  to,
  params,
  search,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  value?: ReactNode;
  valueTone?: "default" | "positive" | "warning";
  to?: string;
  params?: Record<string, unknown>;
  search?: Record<string, unknown>;
}) {
  const inner = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-selected text-accent">
        <Icon className="size-[18px]" aria-hidden="true" strokeWidth={1.85} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm font-semibold leading-snug text-foreground">{title}</p>
        {subtitle ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {value !== undefined ? (
        <span
          className={cn(
            "shrink-0 text-sm font-semibold tabular-nums",
            valueTone === "positive" && "text-success",
            valueTone === "warning" && "text-warning-foreground",
            valueTone === "default" && "text-foreground",
          )}
        >
          {value}
        </span>
      ) : null}
    </>
  );

  const cls =
    "flex min-h-[64px] items-center gap-3 py-3 transition-colors hover:bg-surface-selected/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <li className="border-b border-border last:border-b-0">
      {to ? (
        <Link to={to} params={params as never} search={search as never} className={cls}>
          {inner}
        </Link>
      ) : (
        <div className={cls}>{inner}</div>
      )}
    </li>
  );
}

/** Header halaman dashboard: judul + deskripsi + aksi (netral, tidak bentrok navbar). */
export function PageHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="-mx-4 -mt-5 px-4 pb-1 pt-5 md:mt-0 md:pt-0">
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-selected text-accent">
            <Icon className="size-5" aria-hidden="true" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight text-foreground">{title}</h1>
          {description ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}

/** Filter pill ala marketplace — bisa digeser pada layar kecil. */
export function SegmentedFilter({
  options,
  value,
  onChange,
}: {
  options: Array<{ key: string; label: string }>;
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div
      role="tablist"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "press-scale min-h-11 shrink-0 rounded-full border px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o.key
              ? "border-transparent bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:border-accent/50 hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
