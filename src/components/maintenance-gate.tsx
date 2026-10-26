import { useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Wrench } from "lucide-react";

import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";

const ALWAYS_ALLOWED = ["/api", "/auth", "/admin", "/operator"];
const STAFF_ROLES = ["operator", "support", "finance", "admin", "super_admin"];

export function MaintenanceGate({ settings, children }: { settings: Record<string, any>; children: ReactNode }) {
  const active = Boolean(settings.maintenance_active);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading } = useSession();
  const [roles, setRoles] = useState<string[] | null>(null);

  useEffect(() => {
    if (!active || !user) {
      setRoles(null);
      return;
    }
    let alive = true;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (alive) setRoles((data ?? []).map((r: any) => String(r.role)));
      });
    return () => {
      alive = false;
    };
  }, [active, user]);

  if (!active) return <>{children}</>;

  const excluded = [
    ...ALWAYS_ALLOWED,
    ...((Array.isArray(settings.maintenance_excluded_routes) ? settings.maintenance_excluded_routes : []) as string[]),
  ];
  if (excluded.some((route) => pathname === route || pathname.startsWith(`${route}/`))) return <>{children}</>;

  const allowOperator = settings.maintenance_allow_operator !== false;
  const isStaff = (roles ?? []).some((r) => (allowOperator ? STAFF_ROLES : STAFF_ROLES.slice(1)).includes(r));
  if (loading || (user && roles === null)) return <>{children}</>;
  if (isStaff) return <>{children}</>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-primary">
          <Wrench className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-bold">{String(settings.maintenance_title ?? "Sedang perawatan")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {String(settings.maintenance_message ?? "Kami sedang melakukan pemeliharaan singkat.")}
        </p>
        {settings.maintenance_eta ? (
          <p className="mt-3 text-xs text-muted-foreground">Perkiraan selesai: {String(settings.maintenance_eta)}</p>
        ) : null}
      </div>
    </main>
  );
}