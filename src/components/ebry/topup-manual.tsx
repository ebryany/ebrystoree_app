import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, CheckCircle2, Clock, Copy, RefreshCw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah } from "@/lib/format";
import type { CustomPaymentMethod } from "@/lib/payment-methods";
import {
  getManualTopupStatus,
  prepareTopupProofUpload,
  submitTopupProof,
} from "@/lib/topup-manual.functions";

export type ManualTopup = {
  id: string;
  topupNumber: string;
  amount: number;
  expiresAt: string;
  method: CustomPaymentMethod;
  proofSubmitted: boolean;
  proofSubmittedAt?: string | null;
};

type Phase = "review" | "paid" | "rejected" | "expired";

const STEPS = ["Transfer", "Bukti dikirim", "Diverifikasi", "Saldo masuk"] as const;

/**
 * Layar setelah bukti terkirim. Bentuk kartu sama dengan instruksi transfer
 * (nominal di atas, blok rincian, baris meta) supaya alurnya terasa satu.
 * Status dicek berkala; saat admin menyetujui, saldo di halaman ikut dimuat ulang.
 */
function ManualTopupStatus({
  topup,
  onNew,
  onPaid,
}: {
  topup: ManualTopup;
  onNew: () => void;
  onPaid: () => void | Promise<void>;
}) {
  const fetchStatus = useServerFn(getManualTopupStatus);
  const [phase, setPhase] = useState<Phase>("review");
  const [note, setNote] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [submittedAt, setSubmittedAt] = useState(topup.proofSubmittedAt ?? null);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const check = useCallback(async () => {
    setChecking(true);
    const res: any = await fetchStatus({ data: { topupId: topup.id } }).catch(() => null);
    setChecking(false);
    if (!res?.ok) return;
    if (res.proofSubmittedAt) setSubmittedAt(res.proofSubmittedAt);
    if (res.status === "paid") {
      setPhase("paid");
      await onPaidRef.current();
    } else if (res.status === "cancelled" || res.status === "failed") {
      setPhase("rejected");
      setNote(res.reviewNote);
    } else if (res.status === "expired") {
      setPhase("expired");
    }
  }, [fetchStatus, topup.id]);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    if (phase !== "review") return;
    const id = setInterval(() => void check(), 15_000);
    return () => clearInterval(id);
  }, [phase, check]);

  // Langkah aktif: 0-based. Ditolak/kedaluwarsa berhenti di langkah verifikasi.
  const current = phase === "paid" ? 4 : 2;
  const failed = phase === "rejected" || phase === "expired";

  const heading = {
    review: "Menunggu verifikasi",
    paid: "Saldo berhasil ditambahkan",
    rejected: "Isi saldo ditolak",
    expired: "Isi saldo kedaluwarsa",
  }[phase];

  const body = {
    review: "Admin sedang mengecek bukti transfer Anda. Halaman ini diperbarui otomatis.",
    paid: `${formatRupiah(topup.amount)} sudah masuk ke saldo Ebrystore Anda.`,
    rejected: note ? `Alasan: ${note}` : "Bukti transfer tidak dapat diverifikasi.",
    expired: "Batas waktu verifikasi terlewati. Buat isi saldo baru bila perlu.",
  }[phase];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-start justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Nominal isi saldo</p>
            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
              {formatRupiah(topup.amount)}
            </p>
          </div>
          <span
            className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium ${
              phase === "paid"
                ? "border-success/40 text-success"
                : failed
                  ? "border-destructive/40 text-destructive"
                  : "border-border text-muted-foreground"
            }`}
          >
            {phase === "paid" ? (
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
            ) : failed ? (
              <XCircle className="size-3.5" aria-hidden="true" />
            ) : (
              <Clock className="size-3.5" aria-hidden="true" />
            )}
            {phase === "paid" ? "Berhasil" : failed ? (phase === "expired" ? "Kedaluwarsa" : "Ditolak") : "Diproses"}
          </span>
        </div>

        <div className="mx-5 rounded-lg border border-border bg-muted/40 p-4" role="status" aria-live="polite">
          <p className="text-sm font-semibold">{heading}</p>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>

          {/* Progres 4 langkah; label ringkas agar muat di layar 320px. */}
          <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label="Progres isi saldo">
            {STEPS.map((step, i) => {
              const done = i < current;
              const active = i === current && !failed;
              const broken = failed && i === 2;
              return (
                <li key={step} className="min-w-0">
                  <span
                    className={`block h-1 rounded-full ${
                      broken
                        ? "bg-destructive"
                        : done
                          ? "bg-primary"
                          : active
                            ? "bg-primary/40"
                            : "bg-border"
                    }`}
                  />
                  <span
                    className={`mt-1.5 block text-[11px] leading-tight ${
                      done || active ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {step}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-px border-t border-border bg-border text-sm">
          <div className="bg-card px-5 py-3">
            <dt className="text-xs text-muted-foreground">Ke rekening</dt>
            <dd className="mt-0.5 truncate font-medium">
              {topup.method.name} · {topup.method.account_number}
            </dd>
          </div>
          <div className="bg-card px-5 py-3">
            <dt className="text-xs text-muted-foreground">Nomor isi saldo</dt>
            <dd className="mt-0.5 truncate font-mono text-xs font-medium leading-5">
              {topup.topupNumber}
            </dd>
          </div>
          {submittedAt ? (
            <div className="col-span-2 bg-card px-5 py-3">
              <dt className="text-xs text-muted-foreground">Bukti dikirim</dt>
              <dd className="mt-0.5 font-medium">{formatDeadline(submittedAt)}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {phase === "review" ? (
          <Button
            variant="outline"
            className="min-h-11 flex-1 sm:flex-none"
            disabled={checking}
            onClick={() => void check()}
          >
            <RefreshCw className={`size-4 ${checking ? "animate-spin" : ""}`} aria-hidden="true" />
            {checking ? "Mengecek…" : "Cek status"}
          </Button>
        ) : null}
        <Button
          variant={phase === "review" ? "ghost" : "default"}
          className="min-h-11 flex-1 sm:flex-none"
          onClick={onNew}
        >
          {phase === "review" ? "Isi saldo lagi" : "Buat isi saldo baru"}
        </Button>
      </div>
    </div>
  );
}

const ACCEPT = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

function formatDeadline(iso: string) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Tombol salin berlabel teks; status "Disalin" memberi umpan balik tanpa toast. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-h-11 shrink-0 gap-1.5"
      aria-label={`Salin ${label}`}
      onClick={() =>
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => toast.error("Gagal menyalin."))
      }
    >
      {copied ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
      {copied ? "Disalin" : "Salin"}
    </Button>
  );
}

/** Instruksi transfer + unggah bukti untuk top up via metode custom. */
export function ManualTopupInstructions({
  topup,
  onSubmitted,
  onNew,
  onPaid,
}: {
  topup: ManualTopup;
  onSubmitted: () => void;
  onNew: () => void;
  onPaid: () => void | Promise<void>;
}) {
  const prepare = useServerFn(prepareTopupProofUpload);
  const submit = useServerFn(submitTopupProof);
  const [file, setFile] = useState<File | null>(null);
  const [sender, setSender] = useState("");
  const [busy, setBusy] = useState(false);
  const { method } = topup;

  // Setelah bukti terkirim, instruksi transfer tidak relevan lagi: tampilkan status.
  if (topup.proofSubmitted) {
    return <ManualTopupStatus topup={topup} onNew={onNew} onPaid={onPaid} />;
  }

  async function send() {
    if (!file) return toast.error("Pilih berkas bukti transfer.");
    if (!ACCEPT.includes(file.type as (typeof ACCEPT)[number]))
      return toast.error("Format bukti harus JPG, PNG, WEBP, atau PDF.");
    if (file.size > 5 * 1024 * 1024) return toast.error("Ukuran bukti maksimal 5 MB.");
    if (sender.trim().length < 2) return toast.error("Isi nama pengirim.");

    setBusy(true);
    try {
      const prep: any = await prepare({
        data: { topupId: topup.id, mimeType: file.type as any, sizeBytes: file.size },
      });
      if (!prep.ok) throw new Error(prep.error);
      const uploaded = await supabase.storage
        .from("payment-proofs")
        .uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type });
      if (uploaded.error) throw new Error("Unggah bukti gagal. Coba lagi.");
      const res: any = await submit({
        data: { topupId: topup.id, filePath: prep.path, senderName: sender.trim() },
      });
      if (!res.ok) throw new Error(res.error);
      toast.success("Bukti terkirim. Saldo masuk setelah diverifikasi admin.");
      onSubmitted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bukti gagal dikirim.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {/* Nominal: informasi terpenting, bisa disalin tanpa titik/Rp. */}
        <div className="flex items-end justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Total transfer</p>
            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
              {formatRupiah(topup.amount)}
            </p>
          </div>
          <CopyButton value={String(topup.amount)} label="nominal" />
        </div>

        {/* Rekening tujuan dikelompokkan sebagai satu blok. */}
        <div className="mx-5 rounded-lg border border-border bg-muted/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{method.name}</p>
            <span className="text-xs text-muted-foreground">
              {method.type === "bank" ? "Transfer bank" : method.type === "ewallet" ? "E-wallet" : "Transfer"}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="min-w-0 break-all font-mono text-xl font-semibold tabular-nums tracking-wide">
              {method.account_number}
            </p>
            <CopyButton value={method.account_number.replace(/\s/g, "")} label="nomor" />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            a.n. <span className="font-medium text-foreground">{method.account_holder}</span>
          </p>
        </div>

        {method.instruction ? (
          <div className="mx-5 mt-3">
            <p className="text-xs font-medium text-muted-foreground">Catatan dari admin</p>
            <p className="mt-0.5 whitespace-pre-line text-sm">{method.instruction}</p>
          </div>
        ) : null}

        <dl className="mt-5 grid grid-cols-2 gap-px border-t border-border bg-border text-sm">
          <div className="bg-card px-5 py-3">
            <dt className="text-xs text-muted-foreground">Bayar sebelum</dt>
            <dd className="mt-0.5 font-medium">{formatDeadline(topup.expiresAt)}</dd>
          </div>
          <div className="bg-card px-5 py-3">
            <dt className="text-xs text-muted-foreground">Nomor isi saldo</dt>
            <dd className="mt-0.5 truncate font-mono text-xs font-medium leading-5">
              {topup.topupNumber}
            </dd>
          </div>
        </dl>
      </div>

      <p className="text-xs text-muted-foreground">
        Transfer persis {formatRupiah(topup.amount)} agar cepat diverifikasi. Saldo masuk setelah
        admin mengecek bukti transfer.
      </p>

      <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="topup-sender">Nama pengirim</Label>
            <Input
              id="topup-sender"
              maxLength={100}
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              className="min-h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="topup-proof">Bukti transfer</Label>
            <Input
              id="topup-proof"
              type="file"
              accept={ACCEPT.join(",")}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="min-h-11"
            />
            <p className="text-xs text-muted-foreground">JPG, PNG, WEBP, atau PDF maks 5 MB.</p>
          </div>
          <Button className="min-h-11 w-full sm:w-auto" disabled={busy} onClick={() => void send()}>
            {busy ? "Mengirim…" : "Kirim bukti transfer"}
          </Button>
        </div>

      <Button variant="ghost" className="min-h-11" onClick={onNew}>
        Buat isi saldo baru
      </Button>
    </div>
  );
}
