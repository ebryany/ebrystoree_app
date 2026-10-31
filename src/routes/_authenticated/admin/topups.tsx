import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ExternalLink, FileText, RefreshCw, Wallet, X } from "lucide-react";

import {
  AdminError,
  AdminLoading,
  AdminPageHeader,
  EmptyRow,
  ForbiddenState,
  SearchField,
  StatStrip,
  StatusTabs,
  useCan,
} from "@/components/admin/admin-ui";
import { StatusBadge, formatDateTime } from "@/components/admin/tx-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRupiah } from "@/lib/format";
import { listManualTopups, reviewManualTopup } from "@/lib/topup-manual.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/topups")({
  head: () => ({ meta: [{ title: "Top Up Saldo — Admin Ebrystore" }] }),
  component: AdminTopups,
});

type Filter = "review" | "no_proof" | "paid" | "closed" | "all";

/** Kelompok kerja: yang perlu keputusan admin dipisah dari yang masih menunggu pembeli. */
function bucket(t: any): Exclude<Filter, "all"> {
  if (t.status === "waiting_payment") return t.proof_submitted_at ? "review" : "no_proof";
  if (t.status === "paid") return "paid";
  return "closed";
}

function AdminTopups() {
  const canView = useCan("payments.view");
  const canVerify = useCan("payments.verify");
  const canReject = useCan("payments.reject");
  const qc = useQueryClient();
  const fetchList = useServerFn(listManualTopups);
  const review = useServerFn(reviewManualTopup);
  const [filter, setFilter] = useState<Filter>("review");
  const [search, setSearch] = useState("");
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ["admin-manual-topups"],
    queryFn: () => fetchList(),
    enabled: canView,
    refetchInterval: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (input: { topupId: string; decision: "approve" | "reject"; reason?: string }) =>
      review({ data: input }),
    onSuccess: (res: any, input) => {
      if (res?.forbidden) return toast.error(`Butuh izin ${res.permission}.`);
      if (!res?.ok) return toast.error(res?.error ?? "Gagal memproses.");
      toast.success(input.decision === "approve" ? "Saldo dikreditkan." : "Isi saldo ditolak.");
      setRejecting(null);
      void qc.invalidateQueries({ queryKey: ["admin-manual-topups"] });
    },
    onError: () => toast.error("Gagal memproses. Coba lagi."),
  });

  const all = useMemo<any[]>(() => (data as any)?.items ?? [], [data]);
  const counts = useMemo(() => {
    const c = { review: 0, no_proof: 0, paid: 0, closed: 0 };
    for (const t of all) c[bucket(t)]++;
    return c;
  }, [all]);
  const reviewTotal = useMemo(
    () => all.filter((t) => bucket(t) === "review").reduce((s, t) => s + Number(t.amount), 0),
    [all],
  );

  if (!canView) return <ForbiddenState permission="payments.view" />;
  if (isPending) return <AdminLoading />;
  if (error || (data as any)?.forbidden) return <AdminError />;

  const q = search.trim().toLowerCase();
  const items = all.filter(
    (t) =>
      (filter === "all" || bucket(t) === filter) &&
      (!q ||
        String(t.topup_number).toLowerCase().includes(q) ||
        String(t.proof_sender_name ?? "")
          .toLowerCase()
          .includes(q)),
  );

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Top Up Saldo"
        crumb="Top up saldo"
        description="Verifikasi isi saldo lewat transfer bank / e-wallet manual."
        actions={
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw
              className={cn("size-4", isFetching && "animate-spin motion-reduce:animate-none")}
              aria-hidden="true"
            />
            <span className="sr-only sm:not-sr-only">Muat ulang</span>
          </Button>
        }
      />

      <StatStrip
        items={[
          {
            label: "Perlu ditinjau",
            value: counts.review,
            tone: counts.review ? "warning" : "neutral",
            hint: counts.review ? formatRupiah(reviewTotal) : undefined,
          },
          { label: "Menunggu bukti", value: counts.no_proof },
          { label: "Berhasil", value: counts.paid, tone: "success" },
          { label: "Ditolak / kedaluwarsa", value: counts.closed },
        ]}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <StatusTabs
          label="Filter top up"
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { value: "review", label: "Perlu ditinjau", count: counts.review },
            { value: "no_proof", label: "Menunggu bukti", count: counts.no_proof },
            { value: "paid", label: "Berhasil" },
            { value: "closed", label: "Ditolak" },
            { value: "all", label: "Semua" },
          ]}
        />
        <SearchField
          id="topup-search"
          label="Cari top up"
          value={search}
          onChange={setSearch}
          placeholder="Nomor atau nama pengirim"
          className="lg:w-72"
        />
      </div>

      {items.length === 0 ? (
        <EmptyRow
          message={
            filter === "review" && !q
              ? "Tidak ada bukti transfer yang menunggu ditinjau."
              : "Tidak ada top up pada filter ini."
          }
        />
      ) : (
        <ul className="space-y-2" aria-label="Daftar top up">
          {items.map((t) => {
            const kind = bucket(t);
            const busy = mutation.isPending && mutation.variables?.topupId === t.id;
            const isRejecting = rejecting === t.id;
            const method = t.method_snapshot ?? {};
            return (
              <li
                key={t.id}
                className={cn(
                  "rounded-xl border bg-card p-4",
                  kind === "review" ? "border-warning/50" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-selected text-accent">
                      <Wallet className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="break-all font-mono text-xs font-semibold">{t.topup_number}</p>
                      <p className="text-lg font-bold tabular-nums leading-tight">
                        {formatRupiah(Number(t.amount))}
                      </p>
                    </div>
                  </div>
                  <StatusBadge
                    value={t.status}
                    kind="raw"
                    label={kind === "review" ? "Perlu ditinjau" : undefined}
                  />
                </div>

                <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-sm min-[420px]:grid-cols-2 lg:grid-cols-4">
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">Tujuan</dt>
                    <dd className="truncate font-medium">
                      {method.name ?? "-"}{" "}
                      <span className="font-mono text-xs text-muted-foreground">
                        {method.account_number ?? ""}
                      </span>
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">Pengirim</dt>
                    <dd className="truncate font-medium">
                      {t.proof_sender_name ?? (
                        <span className="font-normal text-muted-foreground">Belum kirim bukti</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Dibuat</dt>
                    <dd className="tabular-nums">{formatDateTime(t.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t.reviewed_at
                        ? "Ditinjau"
                        : t.proof_submitted_at
                          ? "Bukti dikirim"
                          : "Batas"}
                    </dt>
                    <dd className="tabular-nums">
                      {formatDateTime(t.reviewed_at ?? t.proof_submitted_at ?? t.expires_at)}
                    </dd>
                  </div>
                </dl>

                {t.review_note ? (
                  <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                    Catatan: {t.review_note}
                  </p>
                ) : null}

                {t.proof_url || kind === "review" ? (
                  <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center">
                    {t.proof_url ? (
                      <Button asChild variant="outline" size="sm" className="min-h-11">
                        <a href={t.proof_url} target="_blank" rel="noreferrer">
                          <FileText className="size-4" aria-hidden="true" />
                          Lihat bukti
                          <ExternalLink className="size-3.5 opacity-60" aria-hidden="true" />
                        </a>
                      </Button>
                    ) : null}

                    {kind === "review" && !isRejecting ? (
                      <div className="flex gap-2 sm:ml-auto">
                        <Button
                          variant="outline"
                          className="min-h-11 flex-1"
                          disabled={!canReject || busy}
                          onClick={() => setRejecting(t.id)}
                        >
                          <X className="size-4" aria-hidden="true" />
                          Tolak
                        </Button>
                        <Button
                          className="min-h-11 flex-1"
                          disabled={!canVerify || busy}
                          onClick={() => mutation.mutate({ topupId: t.id, decision: "approve" })}
                        >
                          <Check className="size-4" aria-hidden="true" />
                          {busy ? "Memproses…" : `Setujui ${formatRupiah(Number(t.amount))}`}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Alasan tolak hanya muncul saat admin benar-benar memilih menolak. */}
                {isRejecting ? (
                  <div className="mt-3 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <label htmlFor={`reason-${t.id}`} className="text-sm font-medium">
                      Alasan penolakan (opsional, terlihat oleh pembeli)
                    </label>
                    <Input
                      id={`reason-${t.id}`}
                      autoFocus
                      maxLength={300}
                      placeholder="Contoh: nominal tidak sesuai"
                      className="min-h-11 bg-card"
                      value={reasons[t.id] ?? ""}
                      onChange={(e) => setReasons((r) => ({ ...r, [t.id]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        className="min-h-11 flex-1 sm:flex-none"
                        disabled={busy}
                        onClick={() => setRejecting(null)}
                      >
                        Batal
                      </Button>
                      <Button
                        variant="destructive"
                        className="min-h-11 flex-1 sm:flex-none"
                        disabled={busy}
                        onClick={() =>
                          mutation.mutate({
                            topupId: t.id,
                            decision: "reject",
                            reason: reasons[t.id]?.trim() || undefined,
                          })
                        }
                      >
                        {busy ? "Memproses…" : "Tolak top up"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Menampilkan 50 top up manual terbaru.</p>
    </div>
  );
}
