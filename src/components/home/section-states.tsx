import type { ReactNode } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
      <div className="min-w-0">
        <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-52 animate-pulse rounded-xl border border-border bg-muted/60 motion-reduce:animate-none"
        />
      ))}
      <span className="sr-only">Memuat data…</span>
    </div>
  );
}

export function SectionEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
      <p className="text-base font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="grid gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4 sm:flex sm:items-center sm:justify-between"
    >
      <p className="flex min-w-0 items-start gap-2 text-sm">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
        <span>{message}</span>
      </p>
      <Button variant="outline" size="sm" className="min-h-11 shrink-0" onClick={onRetry}>
        <RefreshCw className="size-4" aria-hidden="true" />
        Coba lagi
      </Button>
    </div>
  );
}
