import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Inbox, ShieldCheck } from "lucide-react";

import { formatIDR } from "@/components/ebry/cards";
import { StatusPill } from "@/components/ebry/status";
import { AssignOperatorDialog } from "@/components/admin/assign-operator-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { listPendingAssignment, reviewAcademicScope } from "@/lib/fulfillment.functions";

const SCOPE_LABEL: Record<string, string> = {
  pending: "Scope belum ditinjau",
  approved: "Scope disetujui",
  needs_clarification: "Perlu klarifikasi",
  rejected: "Scope ditolak",
};

/** Antrean order jasa berbayar yang belum punya operator aktif. */
export function PendingAssignmentQueue() {
  const queryClient = useQueryClient();
  const fetchPending = useServerFn(listPendingAssignment);
  const review = useServerFn(reviewAcademicScope);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["pending-assignment"],
    queryFn: () => fetchPending(),
  });

  useRealtimeRefresh({
    channel: "pending-assignment",
    tables: ["orders", "operator_assignments", "service_order_details"],
    keys: [["pending-assignment"]],
  });

  const forbidden = Boolean((data as any)?.forbidden);
  const items: any[] = forbidden ? [] : ((data as any)?.items ?? []);

  async function approveScope(orderId: string) {
    setBusy(orderId);
    try {
      const res: any = await review({ data: { orderId, decision: "approved", note: null } });
      if (!res?.ok) return toast.error(res?.error ?? "Review scope gagal.");
      toast.success("Scope akademik disetujui. Pesanan siap ditugaskan.");
      await queryClient.invalidateQueries({ queryKey: ["pending-assignment"] });
    } finally {
      setBusy(null);
    }
  }

  if (forbidden || (!isPending && !items.length)) return null;

  return (
    <section className="rounded-2xl border border-accent/40 bg-accent/5 p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          <Inbox className="size-4" aria-hidden />
          Perlu penugasan
        </h2>
        <Badge variant="secondary">{isPending ? "…" : items.length}</Badge>
      </div>

      <ul className="mt-3 grid gap-3 lg:grid-cols-2">
        {items.map((o) => {
          const needScope = o.status === "academic_review" && o.scopeStatus !== "approved";
          return (
            <li key={o.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">{o.order_number}</span>
                <StatusPill value={o.status} kind="order" />
              </div>
              <p className="mt-2 font-display text-base font-semibold leading-snug">{o.serviceName ?? "Layanan"}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold tabular-nums">{formatIDR(o.total)}</span>
                <span className="text-xs text-muted-foreground">{SCOPE_LABEL[o.scopeStatus] ?? o.scopeStatus}</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {needScope ? (
                  <Button size="sm" disabled={busy === o.id} onClick={() => approveScope(o.id)}>
                    <ShieldCheck className="size-4" aria-hidden />
                    {busy === o.id ? "Memproses…" : "Setujui scope"}
                  </Button>
                ) : (
                  <AssignOperatorDialog orderId={o.id} orderNumber={o.order_number} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
