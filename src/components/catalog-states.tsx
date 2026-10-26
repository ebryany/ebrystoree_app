import type { ReactNode } from "react";
import { PackageOpen, TriangleAlert } from "lucide-react";

function Shimmer({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className ?? ""}`} />;
}

export function HeroSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-card sm:p-9">
      <Shimmer className="h-6 w-32 rounded-full" />
      <Shimmer className="mt-4 h-8 w-2/3 sm:h-10" />
      <Shimmer className="mt-3 h-4 w-full max-w-xl" />
      <Shimmer className="mt-2 h-4 w-4/5 max-w-lg" />
      <div className="mt-5 flex flex-wrap gap-2">
        <Shimmer className="h-8 w-28 rounded-full" />
        <Shimmer className="h-8 w-32 rounded-full" />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3"
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <Shimmer className="aspect-video w-full rounded-none" />
          <div className="p-4 sm:p-5">
            <Shimmer className="h-4 w-4/5" />
            <Shimmer className="mt-2 h-3 w-full" />
            <Shimmer className="mt-2 h-3 w-3/5" />
            <div className="mt-4 border-t border-border pt-4">
              <Shimmer className="h-6 w-28" />
            </div>
            <Shimmer className="mt-4 h-11 w-full rounded-lg" />
          </div>
        </div>
      ))}
      <span className="sr-only">Memuat katalog produk digital…</span>
    </div>
  );
}

export function ServiceGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:gap-5 md:grid-cols-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <Shimmer className="h-5 w-3/5" />
              <Shimmer className="mt-2 h-3 w-full" />
              <Shimmer className="mt-2 h-3 w-4/5" />
            </div>
            <Shimmer className="h-11 w-11 shrink-0 rounded-xl" />
          </div>
          <Shimmer className="mt-4 h-16 w-full rounded-xl" />
          <div className="mt-4 space-y-2">
            <Shimmer className="h-14 w-full rounded-lg" />
            <Shimmer className="h-14 w-full rounded-lg" />
          </div>
          <Shimmer className="mt-5 h-11 w-full rounded-lg" />
        </div>
      ))}
      <span className="sr-only">Memuat paket pendampingan akademik…</span>
    </div>
  );
}

/** @deprecated pakai ProductGridSkeleton / ServiceGridSkeleton */
export function CatalogSkeleton() {
  return <ProductGridSkeleton />;
}

export function EmptyState({
  title,
  description,
  action,
  secondaryAction,
  hints,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  hints?: string[];
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface px-5 py-12 text-center sm:px-8 sm:py-16">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
        <PackageOpen className="size-7 text-accent" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {hints?.length ? (
        <ul className="mx-auto mt-6 grid max-w-md gap-2 text-left text-sm text-muted-foreground">
          {hints.map((hint) => (
            <li key={hint} className="flex items-start gap-2 rounded-lg bg-secondary/60 px-3 py-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              <span className="min-w-0">{hint}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm"
    >
      <TriangleAlert className="mt-0.5 size-4 text-destructive" aria-hidden="true" />
      <p className="text-foreground">{message}</p>
    </div>
  );
}