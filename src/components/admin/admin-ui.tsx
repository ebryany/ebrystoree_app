import { createContext, useContext, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, Loader2, Search, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AdminAccess = {
  roles: string[];
  permissions: string[];
  isSuperAdmin: boolean;
  isAdmin: boolean;
};

const AccessContext = createContext<AdminAccess>({
  roles: [],
  permissions: [],
  isSuperAdmin: false,
  isAdmin: false,
});

export const AccessProvider = AccessContext.Provider;

export function useAccess() {
  return useContext(AccessContext);
}

export function useCan(permission: string) {
  const access = useAccess();
  return access.isSuperAdmin || access.permissions.includes(permission);
}

export function AdminPageHeader({
  title,
  description,
  crumb,
  actions,
}: {
  title: string;
  description?: string;
  crumb: string;
  actions?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
      <div className="min-w-0">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1 text-xs text-muted-foreground"
        >
          <Link to="/admin" className="hover:text-foreground">
            Admin
          </Link>
          <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate text-foreground">{crumb}</span>
        </nav>
        <h1 className="mt-1 truncate text-xl font-bold sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function ForbiddenState({ permission }: { permission?: string }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
      <ShieldAlert className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-bold">Akses ditolak</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Akun Anda tidak memiliki izin{permission ? ` "${permission}"` : ""} untuk membuka bagian
        ini.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-5">
        <Link to="/admin">Kembali ke dashboard</Link>
      </Button>
    </div>
  );
}

export function AdminLoading({ label = "Memuat data…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function AdminError({ message = "Data tidak dapat dimuat." }: { message?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function EmptyRow({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}

export type StatTone = "neutral" | "warning" | "accent" | "danger" | "success";

const STAT_TONE: Record<StatTone, string> = {
  neutral: "text-foreground",
  warning: "text-warning-foreground",
  accent: "text-accent",
  danger: "text-destructive",
  success: "text-success",
};

/** Ringkasan angka kerja. Hanya isi dengan angka dari data yang benar-benar dimuat. */
export function StatStrip({
  items,
}: {
  items: { label: string; value: ReactNode; tone?: StatTone; hint?: string }[];
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-2",
        items.length >= 4 ? "sm:grid-cols-4" : items.length === 3 ? "sm:grid-cols-3" : "",
      )}
    >
      {items.map((s) => (
        <div key={s.label} className="min-w-0 rounded-xl border border-border bg-card px-3.5 py-3">
          <dt className="truncate text-[11px] font-medium text-muted-foreground">{s.label}</dt>
          <dd
            className={cn(
              "mt-0.5 truncate text-lg font-bold tabular-nums",
              STAT_TONE[s.tone ?? "neutral"],
            )}
          >
            {s.value}
          </dd>
          {s.hint ? <p className="truncate text-[11px] text-muted-foreground">{s.hint}</p> : null}
        </div>
      ))}
    </dl>
  );
}

/**
 * Filter status sebagai tab yang bisa digulir horizontal di mobile.
 * Lebih cepat dari dropdown untuk filter yang sering diganti.
 */
export function StatusTabs({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: { value: string; label: string; count?: number }[];
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground",
            )}
          >
            {o.label}
            {o.count !== undefined && o.count > 0 ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                  active ? "bg-background/20" : "bg-muted",
                )}
              >
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function SearchField({
  id,
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 bg-card pl-9"
      />
    </div>
  );
}

/** Inisial untuk avatar teks; tidak memakai foto yang tidak kita punya. */
export function Initial({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const ch =
    String(name ?? "?")
      .trim()
      .charAt(0)
      .toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full bg-surface-selected text-sm font-bold text-accent",
        className,
      )}
    >
      {ch}
    </span>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">
        Halaman {page} dari {lastPage} · {total} data
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Sebelumnya
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={page >= lastPage}
          onClick={() => onChange(page + 1)}
        >
          Berikutnya
        </Button>
      </div>
    </div>
  );
}
