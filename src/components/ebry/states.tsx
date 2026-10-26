import type { LucideIcon } from "lucide-react";
import { Inbox, RotateCcw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center",
        className,
      )}
    >
      <span className="mb-3 grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Halaman ini belum bisa dimuat",
  description = "Data kamu tetap aman. Periksa koneksi lalu coba lagi.",
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn("rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-6 text-center", className)}
      role="alert"
    >
      <span className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
        <TriangleAlert className="size-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RotateCcw className="size-4" aria-hidden="true" />
          Coba lagi
        </Button>
      ) : null}
    </div>
  );
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Memuat…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-muted/60" />
      ))}
    </div>
  );
}