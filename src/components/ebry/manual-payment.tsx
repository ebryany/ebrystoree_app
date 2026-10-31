import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Copy, FileText, Loader2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { preparePaymentProofUpload, submitPaymentProof } from "@/lib/orders.functions";
import { PROOF_MIME_TYPES, proofFileError } from "@/lib/manual-payment";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  paymentId: string;
  amount: number;
  expiredAt: string | null;
  submissionCount: number;
  account: { method: string; number: string; holder: string };
  instruction: string;
  onSubmitted: () => Promise<void>;
};

function formatDeadline(iso: string) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Sisa waktu bayar, diperbarui tiap 30 detik (cukup untuk satuan menit). */
function useRemaining(target: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return { label: "Waktu habis", urgent: true };
  const minutes = Math.floor(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return { label: h > 0 ? `Sisa ${h} j ${m} m` : `Sisa ${m} menit`, urgent: minutes < 60 };
}

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

function StepHeading({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {index}
      </span>
      {children}
    </h3>
  );
}

export function ManualPayment({
  paymentId,
  amount,
  expiredAt,
  submissionCount,
  account,
  instruction,
  onSubmitted,
}: Props) {
  const prepare = useServerFn(preparePaymentProofUpload);
  const submit = useServerFn(submitPaymentProof);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sender, setSender] = useState("");
  const [claimed, setClaimed] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = useRemaining(expiredAt);

  // Pratinjau gambar bukti; URL objek dilepas saat berkas berganti.
  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pickFile(next: File | null) {
    setError(null);
    if (next) {
      const invalid = proofFileError(next);
      if (invalid) {
        setFile(null);
        return setError(invalid);
      }
    }
    setFile(next);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (sender.trim().length < 2) return setError("Isi nama pengirim sesuai akun DANA/rekening.");
    const amountClaimed = Number(claimed);
    if (!claimed || !Number.isSafeInteger(amountClaimed) || amountClaimed < 0)
      return setError("Isi nominal transfer dalam rupiah penuh.");
    if (!file) return setError("Pilih bukti transfer terlebih dahulu.");
    const invalid = proofFileError(file);
    if (invalid) return setError(invalid);
    setBusy(true);
    try {
      const mimeType = file.type as (typeof PROOF_MIME_TYPES)[number];
      const prep = await prepare({ data: { paymentId, mimeType, sizeBytes: file.size } });
      if (!prep.ok) return setError(prep.error);
      const uploaded = await supabase.storage
        .from("payment-proofs")
        .uploadToSignedUrl(prep.path, prep.token, file, { contentType: mimeType });
      if (uploaded.error) return setError("Bukti gagal diunggah. Coba lagi.");
      const result = await submit({
        data: {
          paymentId,
          filePath: prep.path,
          originalFilename: file.name,
          mimeType,
          sizeBytes: file.size,
          senderName: sender.trim(),
          amountClaimed,
          note: note.trim() || undefined,
        },
      });
      if (!result.ok) return setError(result.error);
      toast.success("Bukti terkirim. Pembayaran menunggu pemeriksaan Finance.");
      await onSubmitted();
    } catch {
      setError(
        "Bukti belum berhasil dikirim. Muat ulang pesanan untuk memeriksa status sebelum mencoba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  const mismatch = claimed !== "" && Number(claimed) !== amount;

  return (
    <form onSubmit={handleSubmit} noValidate className="min-w-0 space-y-6">
      {/* Langkah 1: transfer */}
      <div className="space-y-3">
        <StepHeading index={1}>Transfer ke {account.method}</StepHeading>
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="flex items-end justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Nominal transfer</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
                {formatRupiah(amount)}
              </p>
            </div>
            <CopyButton value={String(amount)} label="nominal" />
          </div>
          <div className="border-t border-border bg-muted/40 p-4">
            <p className="text-xs font-medium text-muted-foreground">Nomor {account.method}</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="min-w-0 break-all font-mono text-lg font-semibold tabular-nums tracking-wide sm:text-xl">
                {account.number}
              </p>
              <CopyButton value={account.number.replace(/\s/g, "")} label="nomor tujuan" />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              a.n. <span className="font-medium text-foreground">{account.holder}</span>
            </p>
          </div>
          {expiredAt ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Bayar sebelum{" "}
                <span className="font-medium text-foreground">{formatDeadline(expiredAt)}</span>
              </span>
              {remaining ? (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                    remaining.urgent
                      ? "bg-destructive/10 text-destructive"
                      : "bg-warning/15 text-warning-foreground",
                  )}
                >
                  {remaining.label}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {instruction} Bukti diperiksa Finance; mengunggah bukti tidak langsung melunaskan pesanan.
        </p>
      </div>

      {/* Langkah 2: bukti */}
      <div className="space-y-4">
        <StepHeading index={2}>Kirim bukti transfer</StepHeading>
        {submissionCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            Unggah ulang terpakai: {Math.max(0, submissionCount - 1)}.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="proof-sender">Nama pengirim</Label>
            <Input
              id="proof-sender"
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
              value={sender}
              disabled={busy}
              onChange={(event) => setSender(event.target.value)}
              className="min-h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proof-amount">Nominal yang ditransfer</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted-foreground">
                Rp
              </span>
              <Input
                id="proof-amount"
                type="number"
                inputMode="numeric"
                required
                min={0}
                step={1}
                value={claimed}
                disabled={busy}
                placeholder={String(amount)}
                onChange={(event) => setClaimed(event.target.value)}
                aria-describedby={mismatch ? "proof-amount-warn" : undefined}
                className="min-h-11 pl-9 tabular-nums"
              />
            </div>
            {mismatch ? (
              <p id="proof-amount-warn" role="status" className="text-xs text-destructive">
                Berbeda dari tagihan {formatRupiah(amount)}. Finance akan meminta koreksi.
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium" id="proof-file-label">
            Bukti transfer
          </span>
          {file ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
              <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-card">
                {preview ? (
                  <img src={preview} alt="" className="size-full object-cover" />
                ) : (
                  <FileText className="size-6 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0"
                aria-label="Hapus berkas bukti"
                disabled={busy}
                onClick={() => pickFile(null)}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <label
              htmlFor="proof-file"
              className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
            >
              <Upload className="size-5 text-primary" aria-hidden="true" />
              <span className="text-sm font-medium">Pilih foto atau PDF bukti</span>
              <span className="text-xs text-muted-foreground">JPG, PNG, WEBP, PDF · maks 5 MB</span>
              <input
                id="proof-file"
                type="file"
                className="sr-only"
                aria-labelledby="proof-file-label"
                accept={PROOF_MIME_TYPES.join(",")}
                disabled={busy}
                onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </div>

        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            {note ? "Ubah catatan" : "+ Tambah catatan (opsional)"}
          </summary>
          <Label htmlFor="proof-note" className="sr-only">
            Catatan
          </Label>
          <Textarea
            id="proof-note"
            maxLength={300}
            rows={2}
            disabled={busy}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Contoh: transfer dari rekening pasangan"
          />
        </details>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy} className="min-h-11 w-full sm:w-auto">
          {busy ? (
            <>
              <Loader2
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              Mengirim bukti…
            </>
          ) : (
            "Kirim bukti transfer"
          )}
        </Button>
      </div>
    </form>
  );
}
