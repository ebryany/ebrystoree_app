import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  ForbiddenState,
  useCan,
} from "@/components/admin/admin-ui";
import { formatDateTime } from "@/components/admin/tx-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRupiah } from "@/lib/format";
import { listManualTopups, reviewManualTopup } from "@/lib/topup-manual.functions";

export const Route = createFileRoute("/_authenticated/admin/topups")({
  head: () => ({ meta: [{ title: "Top Up Saldo — Admin Ebrystore" }] }),
  component: AdminTopups,
});

const STATUS_LABEL: Record<string, string> = {
  waiting_payment: "Menunggu",
  paid: "Berhasil",
  cancelled: "Ditolak",
  expired: "Kedaluwarsa",
  failed: "Gagal",
};

function AdminTopups() {
  const canView = useCan("payments.view");
  const canVerify = useCan("payments.verify");
  const canReject = useCan("payments.reject");
  const qc = useQueryClient();
  const fetchList = useServerFn(listManualTopups);
  const review = useServerFn(reviewManualTopup);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const { data, isPending, error } = useQuery({
    queryKey: ["admin-manual-topups"],
    queryFn: () => fetchList(),
    enabled: canView,
  });

  const mutation = useMutation({
    mutationFn: (input: { topupId: string; decision: "approve" | "reject"; reason?: string }) =>
      review({ data: input }),
    onSuccess: (res: any, input) => {
      if (res?.forbidden) return toast.error(`Butuh izin ${res.permission}.`);
      if (!res?.ok) return toast.error(res?.error ?? "Gagal memproses.");
      toast.success(input.decision === "approve" ? "Saldo dikreditkan." : "Isi saldo ditolak.");
      void qc.invalidateQueries({ queryKey: ["admin-manual-topups"] });
    },
    onError: () => toast.error("Gagal memproses. Coba lagi."),
  });

  if (!canView) return <ForbiddenState permission="payments.view" />;
  if (isPending) return <AdminLoading />;
  if (error || (data as any)?.forbidden) return <AdminError />;

  const items: any[] = (data as any)?.items ?? [];

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Top Up Saldo"
        crumb="Top up saldo"
        description="Verifikasi isi saldo lewat metode pembayaran custom (transfer bank / e-wallet)."
      />

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Belum ada isi saldo manual.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {items.map((t) => {
            const pending = t.status === "waiting_payment";
            const busy = mutation.isPending && mutation.variables?.topupId === t.id;
            return (
              <li key={t.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {t.topup_number} · {formatRupiah(Number(t.amount))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.method_snapshot?.name ?? "-"} {t.method_snapshot?.account_number ?? ""} ·{" "}
                    {formatDateTime(t.created_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {STATUS_LABEL[t.status] ?? t.status}
                    {pending
                      ? t.proof_submitted_at
                        ? ` · bukti dari ${t.proof_sender_name}`
                        : " · belum kirim bukti"
                      : t.review_note
                        ? ` · ${t.review_note}`
                        : ""}
                  </p>
                  {t.proof_url ? (
                    <a
                      href={t.proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-primary underline"
                    >
                      Lihat bukti
                    </a>
                  ) : null}
                </div>

                {pending ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      placeholder="Alasan tolak (opsional)"
                      maxLength={300}
                      className="min-h-11 sm:w-56"
                      value={reasons[t.id] ?? ""}
                      onChange={(e) => setReasons((r) => ({ ...r, [t.id]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="min-h-11 flex-1"
                        disabled={!canReject || busy}
                        onClick={() =>
                          mutation.mutate({
                            topupId: t.id,
                            decision: "reject",
                            reason: reasons[t.id]?.trim() || undefined,
                          })
                        }
                      >
                        Tolak
                      </Button>
                      <Button
                        className="min-h-11 flex-1"
                        disabled={!canVerify || busy || !t.proof_submitted_at}
                        onClick={() => mutation.mutate({ topupId: t.id, decision: "approve" })}
                      >
                        Setujui
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
