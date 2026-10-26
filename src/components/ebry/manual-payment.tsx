import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { preparePaymentProofUpload, submitPaymentProof } from "@/lib/orders.functions";
import { PROOF_MIME_TYPES, proofFileError } from "@/lib/manual-payment";
import { formatRupiah } from "@/lib/format";

type Props = {
  paymentId: string;
  amount: number;
  expiredAt: string | null;
  submissionCount: number;
  account: { method: string; number: string; holder: string };
  instruction: string;
  onSubmitted: () => Promise<void>;
};

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
  const [sender, setSender] = useState("");
  const [claimed, setClaimed] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!file) return setError("Pilih bukti transfer terlebih dahulu.");
    const invalid = proofFileError(file);
    if (invalid) return setError(invalid);
    const amountClaimed = Number(claimed);
    if (!claimed || !Number.isSafeInteger(amountClaimed) || amountClaimed < 0)
      return setError("Isi nominal transfer dalam rupiah penuh.");
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

  return (
    <form onSubmit={handleSubmit} className="mt-4 min-w-0 space-y-4">
      <h3 className="font-semibold">Transfer manual {account.method}</h3>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Nomor tujuan</dt>
          <dd className="break-all font-semibold">{account.number}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Atas nama</dt>
          <dd className="break-words">{account.holder}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Nominal transfer</dt>
          <dd className="text-lg font-bold">{formatRupiah(amount)}</dd>
        </div>
        {expiredAt ? (
          <div>
            <dt className="text-muted-foreground">Batas pembayaran</dt>
            <dd>{new Date(expiredAt).toLocaleString("id-ID")}</dd>
          </div>
        ) : null}
      </dl>
      <p className="text-sm text-muted-foreground">
        {instruction} Bukti akan diperiksa Finance; unggah bukti tidak langsung melunaskan pesanan.
      </p>
      {submissionCount > 0 ? (
        <p className="text-sm">Unggah ulang terpakai: {Math.max(0, submissionCount - 1)}.</p>
      ) : null}
      <div>
        <Label htmlFor="proof-sender">Nama pengirim</Label>
        <Input
          id="proof-sender"
          required
          minLength={2}
          maxLength={100}
          value={sender}
          disabled={busy}
          onChange={(event) => setSender(event.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="proof-amount">Nominal yang ditransfer (Rp)</Label>
        <Input
          id="proof-amount"
          type="number"
          inputMode="numeric"
          required
          min={0}
          step={1}
          value={claimed}
          disabled={busy}
          onChange={(event) => setClaimed(event.target.value)}
        />
      </div>
      {claimed && Number(claimed) !== amount ? (
        <p role="status" className="text-sm text-destructive">
          Nominal berbeda dari tagihan. Finance akan meminta koreksi sebelum menyetujui.
        </p>
      ) : null}
      <div>
        <Label htmlFor="proof-file">Bukti transfer</Label>
        <Input
          id="proof-file"
          type="file"
          required
          accept={PROOF_MIME_TYPES.join(",")}
          disabled={busy}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          JPG, PNG, WEBP, atau PDF. Maksimal 5 MiB.
        </p>
      </div>
      <div>
        <Label htmlFor="proof-note">Catatan (opsional)</Label>
        <Textarea
          id="proof-note"
          maxLength={300}
          disabled={busy}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy} className="min-h-11">
        {busy ? "Mengirim bukti…" : "Kirim bukti transfer"}
      </Button>
    </form>
  );
}
