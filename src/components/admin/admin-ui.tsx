import { createContext, useContext, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

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
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
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
        Akun Anda tidak memiliki izin{permission ? ` "${permission}"` : ""} untuk membuka bagian ini.
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
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Sebelumnya
        </Button>
        <Button variant="outline" size="sm" disabled={page >= lastPage} onClick={() => onChange(page + 1)}>
          Berikutnya
        </Button>
      </div>
    </div>
  );
}
