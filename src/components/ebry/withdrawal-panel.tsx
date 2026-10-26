import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Banknote, Landmark, Pencil, Wallet } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineEmpty } from "@/components/ebry/cards";
import { CardSkeleton } from "@/components/ebry/states";
import {
  cancelWithdrawal,
  getWithdrawalPolicy,
  listMyWithdrawals,
  requestWithdrawal,
  saveSellerBankAccount,
} from "@/lib/seller.functions";
import { formatRupiah } from "@/lib/format";
import { withdrawalFee, withdrawalNet } from "@/lib/withdrawal";

const STATUS_LABEL: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  requested: { label: "Menunggu review", variant: "secondary" },
  approved: { label: "Disetujui — menunggu transfer", variant: "default" },
  transferred: { label: "Dana dikirim — menunggu konfirmasi", variant: "default" },
  completed: { label: "Selesai", variant: "outline" },
  rejected: { label: "Ditolak", variant: "destructive" },
  cancelled: { label: "Dibatalkan", variant: "outline" },
  needs_reconciliation: { label: "Perlu rekonsiliasi", variant: "secondary" },
};

function parseAmount(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return 0;
  return Number(digits);
}

function formatAmountInput(value: number) {
  return value > 0 ? new Intl.NumberFormat("id-ID").format(value) : "";
}

function shortDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/**
 * Panel penarikan saldo seller: kebijakan + rekening + form dengan breakdown
 * fee langsung + riwayat. Semua keputusan uang dihitung ulang oleh server;
 * breakdown di sini hanya preview.
 */
export function WithdrawalPanel({
  available,
  onChanged,
}: {
  available: number;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const fetchPolicy = useServerFn(getWithdrawalPolicy);
  const fetchList = useServerFn(listMyWithdrawals);
  const saveBank = useServerFn(saveSellerBankAccount);
  const request = useServerFn(requestWithdrawal);
  const cancel = useServerFn(cancelWithdrawal);

  const policyQuery = useQuery({
    queryKey: ["withdrawal-policy"],
    queryFn: () => fetchPolicy(),
  });
  const listQuery = useQuery({
    queryKey: ["my-withdrawals"],
    queryFn: () => fetchList(),
  });

  const policy = policyQuery.data?.policy ?? null;
  const items = listQuery.data?.items ?? [];
  const minPayout = Number(policy?.min_payout ?? 5000);
  const feeBps = Number(policy?.fee_bps ?? 1500);
  const feePercent = feeBps / 100;

  const [amountRaw, setAmountRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now()),
  );

  const [bankEditing, setBankEditing] = useState(false);
  const [bankSaving, setBankSaving] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [holderName, setHolderName] = useState("");

  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const amount = useMemo(() => parseAmount(amountRaw), [amountRaw]);
  const fee = amount > 0 ? withdrawalFee(amount, feeBps) : 0;
  const net = amount > 0 ? withdrawalNet(amount, feeBps) : 0;

  const amountError =
    amount === 0
      ? null
      : amount < minPayout
        ? `Minimal penarikan ${formatRupiah(minPayout)}.`
        : amount > available
          ? "Melebihi saldo tersedia."
          : null;
  const canSubmit =
    !!policy?.feature_enabled &&
    !!policy?.bank &&
    amount >= minPayout &&
    amount <= available &&
    !amountError;

  async function refreshAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["withdrawal-policy"] }),
      qc.invalidateQueries({ queryKey: ["my-withdrawals"] }),
      qc.invalidateQueries({ queryKey: ["seller-ledger"] }),
    ]);
    onChanged();
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    const result: any = await request({
      data: { gross_amount: amount, idempotency_key: idempotencyKey },
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.withdrawal?.duplicate
        ? "Pengajuan ini sudah tercatat sebelumnya."
        : `Pengajuan ${result.withdrawal?.withdrawal_number ?? ""} terkirim. Saldo bruto ditahan menunggu review finance.`,
    );
    setAmountRaw("");
    setIdempotencyKey(
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now()),
    );
    await refreshAll();
  }

  async function submitBank(e: React.FormEvent) {
    e.preventDefault();
    setBankSaving(true);
    const result: any = await saveBank({
      data: { bank_name: bankName, account_number: accountNumber, account_holder_name: holderName },
    });
    setBankSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Rekening pencairan tersimpan.");
    setBankEditing(false);
    await qc.invalidateQueries({ queryKey: ["withdrawal-policy"] });
  }

  async function doCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    const result: any = await cancel({ data: { withdrawal_id: cancelTarget } });
    setCancelling(false);
    setCancelTarget(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Pengajuan dibatalkan. Saldo bruto dikembalikan penuh.");
    await refreshAll();
  }

  function startBankEdit() {
    if (policy?.bank) {
      setBankName(policy.bank.bank_name);
      setAccountNumber(policy.bank.account_number);
      setHolderName(policy.bank.account_holder_name);
    } else {
      setBankName("");
      setAccountNumber("");
      setHolderName("");
    }
    setBankEditing(true);
  }

  if (policyQuery.isPending || listQuery.isPending) {
    return (
      <section
        className="rounded-2xl border border-border bg-card p-5"
        aria-label="Penarikan saldo"
      >
        <CardSkeleton rows={3} />
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border border-border bg-card"
      aria-labelledby="tarik-saldo-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2
          id="tarik-saldo-heading"
          className="flex items-center gap-2 text-sm font-bold text-foreground"
        >
          <Banknote className="size-4 text-accent" aria-hidden="true" />
          Tarik saldo
        </h2>
        {policy?.feature_enabled ? null : <Badge variant="secondary">Belum diaktifkan</Badge>}
      </div>

      <div className="space-y-5 p-4">
        {!policy?.has_store ? (
          <InlineEmpty icon={Wallet} text="Fitur ini untuk seller dengan toko aktif." />
        ) : !policy.feature_enabled ? (
          <p className="text-sm text-muted-foreground">
            Penarikan manual belum diaktifkan oleh platform. Saldo tetap aman tercatat di riwayat
            mutasi.
          </p>
        ) : (
          <>
            {/* Rekening tujuan */}
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Landmark className="size-3.5" aria-hidden="true" />
                  Rekening tujuan
                </p>
                <Button variant="ghost" size="sm" className="min-h-9" onClick={startBankEdit}>
                  <Pencil className="size-3.5" aria-hidden="true" />
                  {policy.bank ? "Ubah" : "Daftarkan"}
                </Button>
              </div>
              {policy.bank ? (
                <p className="mt-1.5 text-sm">
                  {policy.bank.bank_name} ·{" "}
                  <span className="tabular-nums">{policy.bank.account_number_masked}</span> ·{" "}
                  {policy.bank.account_holder_name}
                </p>
              ) : (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Daftarkan rekening bank atas nama Anda sebelum menarik saldo.
                </p>
              )}
            </div>

            {bankEditing && (
              <form
                onSubmit={submitBank}
                className="space-y-3 rounded-xl border border-border p-3"
                aria-label="Formulir rekening pencairan"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="bank-name">Nama bank</Label>
                  <Input
                    id="bank-name"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="contoh: BCA"
                    required
                    minLength={2}
                    maxLength={60}
                    className="min-h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bank-number">Nomor rekening</Label>
                  <Input
                    id="bank-number"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    inputMode="numeric"
                    placeholder="contoh: 1234567890"
                    required
                    className="min-h-11 tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bank-holder">Nama pemilik rekening</Label>
                  <Input
                    id="bank-holder"
                    value={holderName}
                    onChange={(e) => setHolderName(e.target.value)}
                    placeholder="sesuai buku tabungan"
                    required
                    minLength={2}
                    maxLength={100}
                    className="min-h-11"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="min-h-11" disabled={bankSaving}>
                    {bankSaving ? "Menyimpan…" : "Simpan rekening"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => setBankEditing(false)}
                  >
                    Batal
                  </Button>
                </div>
              </form>
            )}

            {/* Form nominal + breakdown fee */}
            <div className="space-y-3" aria-label="Formulir penarikan">
              <div className="space-y-1.5">
                <Label htmlFor="withdraw-amount">Nominal tarik</Label>
                <Input
                  id="withdraw-amount"
                  value={amountRaw}
                  onChange={(e) => setAmountRaw(e.target.value)}
                  inputMode="numeric"
                  placeholder="contoh: 50.000"
                  className="min-h-11 text-base tabular-nums"
                  aria-invalid={Boolean(amountError)}
                  aria-describedby={amountError ? "withdraw-amount-error" : undefined}
                />
                {amountError && (
                  <p id="withdraw-amount-error" role="alert" className="text-xs text-destructive">
                    {amountError}
                  </p>
                )}
              </div>

              <dl
                className="space-y-1.5 rounded-xl border border-border bg-muted/40 p-3 text-sm"
                aria-label="Rincian biaya"
              >
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">Jumlah ditarik</dt>
                  <dd className="font-semibold tabular-nums">{formatRupiah(amount)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-muted-foreground">
                    Biaya penarikan ({feePercent.toLocaleString("id-ID")}%)
                  </dt>
                  <dd className="font-semibold tabular-nums">−{formatRupiah(fee)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border pt-1.5">
                  <dt className="font-medium">Anda akan menerima</dt>
                  <dd className="font-bold tabular-nums">{formatRupiah(net)}</dd>
                </div>
              </dl>

              <p className="flex gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Transfer dilakukan manual oleh tim finance dan dinyatakan selesai hanya setelah
                diverifikasi — bukan pencairan instan. Bila pengajuan ditolak atau dibatalkan
                sebelum transfer, saldo bruto dikembalikan penuh.
              </p>

              <Button
                className="min-h-11 w-full sm:w-auto"
                disabled={!canSubmit || submitting}
                onClick={() => void submit()}
              >
                {submitting ? "Mengirim…" : "Konfirmasi Penarikan"}
              </Button>
            </div>
          </>
        )}

        {/* Riwayat penarikan */}
        <div className="space-y-2" aria-label="Riwayat penarikan">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Riwayat penarikan
          </h3>
          {items.length === 0 ? (
            <InlineEmpty icon={Banknote} text="Belum ada pengajuan penarikan." />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {items.map((w) => {
                const st = STATUS_LABEL[w.status] ?? {
                  label: w.status,
                  variant: "secondary" as const,
                };
                const cancellable = w.status === "requested" || w.status === "approved";
                return (
                  <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold tabular-nums">{w.withdrawal_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {shortDate(w.created_at)} · {w.bank_name} {w.bank_account_masked}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Bruto {formatRupiah(w.gross_amount)} − fee {formatRupiah(w.fee_amount)} =
                        neto{" "}
                        <span className="font-semibold text-foreground">
                          {formatRupiah(w.net_amount)}
                        </span>
                      </p>
                      {w.status === "rejected" && w.decision_note && (
                        <p className="mt-0.5 text-xs text-destructive">Alasan: {w.decision_note}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={st.variant}>{st.label}</Badge>
                      {cancellable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-9"
                          onClick={() => setCancelTarget(w.id)}
                        >
                          Batalkan
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <AlertDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan pengajuan penarikan?</AlertDialogTitle>
            <AlertDialogDescription>
              Saldo bruto yang ditahan akan dikembalikan penuh dan pengajuan tidak dapat
              dilanjutkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Lanjutkan pengajuan</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              disabled={cancelling}
              onClick={(e) => {
                e.preventDefault();
                void doCancel();
              }}
            >
              {cancelling ? "Membatalkan…" : "Ya, batalkan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
