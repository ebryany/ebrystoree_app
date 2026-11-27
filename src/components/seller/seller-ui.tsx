import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Info,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Fallback IntersectionObserver untuk `.ebry-tab-scroller` ketika browser
 * belum mendukung CSS `animation-timeline: scroll(self inline)`.
 */
export function useScrollEdgeFade(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const scroller = ref.current;
    if (!scroller || typeof window === "undefined") return;
    if (typeof CSS !== "undefined" && CSS.supports("animation-timeline", "scroll(self inline)")) {
      return;
    }
    const first = scroller.firstElementChild;
    const last = scroller.lastElementChild;
    if (!first || !last || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === first) {
            scroller.classList.toggle("more-start", entry.intersectionRatio < 1);
          }
          if (entry.target === last) {
            scroller.classList.toggle("more-end", entry.intersectionRatio < 1);
          }
        }
      },
      { root: scroller, threshold: 1, rootMargin: "1px" },
    );

    observer.observe(first);
    observer.observe(last);
    return () => observer.disconnect();
  }, [ref]);
}

/** Konversi nama toko menjadi slug URL yang aman (lowercase, huruf/angka/tanda hubung). */
export function slugifyStoreName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Header halaman standar di seluruh workspace Seller (mobile-first reflow). */
export function SellerPageHeader({
  title,
  description,
  backTo,
  backLabel,
  badge,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  backTo?: string;
  backLabel?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("space-y-2", className)}>
      {backTo && backLabel ? (
        <Link
          to={backTo}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="seller-heading text-[clamp(1.2rem,1.05rem+0.65vw,1.5rem)] font-bold leading-tight text-foreground">
              {title}
            </h1>
            {badge}
          </div>
          {description ? (
            <p className="seller-prose mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

/** Switcher cepat 2 segmen di mobile/tablet (< lg) untuk halaman yang berpasangan (Produk/Jasa, Pesanan/Jasa). */
export function SellerMobileSegment({
  items,
  ariaLabel,
}: {
  items: ReadonlyArray<{
    to: string;
    label: string;
    badge?: number;
  }>;
  ariaLabel: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="grid grid-cols-2 gap-1 rounded-[var(--radius-panel)] border border-border bg-surface p-1 lg:hidden"
    >
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          activeProps={{
            className: "bg-card text-foreground shadow-[var(--elev-1)]",
            "aria-current": "page",
          }}
        >
          <span className="truncate">{item.label}</span>
          {item.badge && item.badge > 0 ? (
            <span className="grid min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-[18px] text-destructive-foreground tabular-nums">
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

/** Kartu bagian terstruktur untuk halaman Seller. */
export function SellerSectionCard({
  title,
  description,
  icon: Icon,
  action,
  footer,
  headingId,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  footer?: ReactNode;
  headingId?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={title && headingId ? headingId : undefined}
      className={cn(
        "overflow-hidden rounded-[var(--radius-panel)] border border-border bg-card shadow-[var(--elev-1)]",
        className,
      )}
    >
      {title ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2
              id={headingId}
              className="flex items-center gap-2 text-sm font-bold leading-snug text-foreground"
            >
              {Icon ? <Icon className="size-4 shrink-0 text-accent" aria-hidden="true" /> : null}
              <span className="truncate">{title}</span>
            </h2>
            {description ? (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
      {footer ? <div className="border-t border-border bg-surface/50">{footer}</div> : null}
    </section>
  );
}

/** Grid KPI responsif berbasis container query (.seller-kpi-grid). */
export function SellerKpiGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("seller-kpi-grid", className)}>{children}</div>;
}

/** Kartu metrik utama Seller dengan angka dominan, konteks singkat, dan opsi tautan. */
export function SellerKpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "accent",
  to,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "accent" | "success" | "warning" | "muted";
  to?: string;
}) {
  const iconTone = {
    accent: "bg-surface-selected text-accent",
    success: "bg-success/12 text-success",
    warning: "bg-warning/18 text-warning-foreground",
    muted: "bg-muted text-muted-foreground",
  }[tone];

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", iconTone)}>
          <Icon className="size-4" aria-hidden="true" strokeWidth={1.9} />
        </span>
        {to ? (
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none"
            aria-hidden="true"
          />
        ) : null}
      </div>
      <div className="mt-2.5 min-w-0 sm:mt-3">
        <p className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</p>
        <p className="mt-1 break-words text-[15px] font-bold leading-snug tabular-nums text-foreground sm:text-xl">
          {value}
        </p>
        {hint ? (
          <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </>
  );

  const cardClass = cn(
    "group flex min-w-0 flex-col justify-between rounded-[var(--radius-panel)] border border-border bg-card p-3 shadow-[var(--elev-1)] transition-[border-color,box-shadow] sm:p-4",
    to &&
      "hover:border-accent/45 hover:shadow-[var(--elev-2)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  );

  if (to) {
    return (
      <Link to={to} className={cardClass}>
        {inner}
      </Link>
    );
  }
  return <div className={cardClass}>{inner}</div>;
}

export type SellerTabOption<T extends string | number> = {
  key: T;
  label: string;
  count?: number;
  hint?: string;
};

/**
 * Tablist horizontal satu baris yang patuh Modern Web Guidance:
 * - scroll-snap + edge fade affordance (.ebry-tab-scroller)
 * - indikator aktif border-block-end via [aria-selected="true"]::after (WCAG 1.4.1 / forced-colors)
 * - scrollIntoView({ block: 'nearest', inline: 'nearest' }) saat berpindah tab
 * - navigasi keyboard ArrowLeft / ArrowRight / Home / End
 */
export function SellerFilterTabs<T extends string | number>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  items: ReadonlyArray<SellerTabOption<T>>;
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useScrollEdgeFade(listRef);

  function selectAndReveal(next: T, buttonEl?: HTMLButtonElement | null) {
    onChange(next);
    if (buttonEl && typeof buttonEl.scrollIntoView === "function") {
      buttonEl.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const idx = items.findIndex((i) => i.key === value);
    if (idx < 0) return;
    let targetIdx = idx;
    if (event.key === "ArrowRight") targetIdx = (idx + 1) % items.length;
    else if (event.key === "ArrowLeft") targetIdx = (idx - 1 + items.length) % items.length;
    else if (event.key === "Home") targetIdx = 0;
    else if (event.key === "End") targetIdx = items.length - 1;
    else return;

    event.preventDefault();
    const targetItem = items[targetIdx];
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const targetButton = buttons?.[targetIdx];
    selectAndReveal(targetItem.key, targetButton);
    targetButton?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn("ebry-tab-scroller flex items-center gap-1", className)}
    >
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={String(item.key)}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            title={item.hint}
            onClick={(e) => selectAndReveal(item.key, e.currentTarget)}
            className={cn(
              "seller-tab flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              active
                ? "bg-surface-selected/70 font-semibold text-foreground"
                : "text-muted-foreground hover:bg-surface hover:text-foreground",
            )}
          >
            <span>{item.label}</span>
            {typeof item.count === "number" ? (
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums",
                  active
                    ? "bg-accent/15 text-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {item.count.toLocaleString("id-ID")}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Banner pemberitahuan semantik terpadu untuk seluruh halaman Seller. */
export function SellerAlertBanner({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const styles = {
    info: {
      wrap: "border-info/35 bg-info/8",
      icon: Info,
      iconClass: "text-info",
    },
    warning: {
      wrap: "border-warning/45 bg-warning/10",
      icon: AlertTriangle,
      iconClass: "text-warning-foreground",
    },
    danger: {
      wrap: "border-destructive/40 bg-destructive/8",
      icon: AlertCircle,
      iconClass: "text-destructive",
    },
    success: {
      wrap: "border-success/40 bg-success/10",
      icon: CheckCircle2,
      iconClass: "text-success",
    },
  }[tone];

  const Icon = styles.icon;

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-[var(--radius-panel)] border px-4 py-3 text-sm",
        styles.wrap,
        className,
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", styles.iconClass)} aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-0.5">
        {title ? <p className="font-semibold text-foreground">{title}</p> : null}
        <div className="text-xs leading-relaxed text-muted-foreground sm:text-sm">{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * Field form terakses sesuai Modern Web Guidance:
 * - Petunjuk format diletakkan DI ATAS input agar tidak tertutup autofill / keyboard mobile.
 * - Pesan error menampilkan ikon + teks (bukan warna saja) dan dihubungkan lewat id error.
 */
export function SellerField({
  id,
  label,
  hint,
  error,
  required,
  counter,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  counter?: string;
  children: ReactNode;
  className?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium leading-none text-foreground">
          {label}
          {required ? (
            <span className="ml-0.5 text-destructive" aria-hidden="true">
              *
            </span>
          ) : (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">(opsional)</span>
          )}
        </label>
        {counter ? (
          <span className="text-[11px] tabular-nums text-muted-foreground">{counter}</span>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-xs font-medium text-destructive"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
