import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";

import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/format";
import { checkQrisPayment, startQrisPayment } from "@/lib/payments.functions";

type Qris = {
  payUrl: string;
  amount: number;
  fee: number;
  total: number;
  expiredAt: string;
  qrString?: string;
};

function useCountdown(target: string | null) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!target) return;
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(target).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return left;
}

export function QrisPayment({ paymentId, onPaid }: { paymentId: string; onPaid: () => void | Promise<void> }) {
  const start = useServerFn(startQrisPayment);
  const check = useServerFn(checkQrisPayment);

  const [qris, setQris] = useState<Qris | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const settled = useRef(false);

  const secondsLeft = useCountdown(qris?.expiredAt ?? null);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setFailed(null);
      const result: any = await start({ data: { paymentId, refresh } });
      setLoading(false);
      if (!result.ok) {
        setFailed(result.error);
        return;
      }
      setQris(result.qris);
    },
    [paymentId, start],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    let active = true;
    if (!qris?.qrString) {
      setQrImage(null);
      return;
    }
    void QRCode.toDataURL(qris.qrString, { width: 640, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => {
        if (active) setQrImage(url);
      })
      .catch(() => {
        if (active) setQrImage(null);
      });
    return () => {
      active = false;
    };
  }, [qris?.qrString]);

  const verify = useCallback(
    async (manual: boolean) => {
      if (settled.current) return;
      setChecking(true);
      const result: any = await check({ data: { paymentId } });
      setChecking(false);
      if (!result.ok) {
        if (manual) toast.error(result.error);
        return;
      }
      if (result.status === "paid") {
        settled.current = true;
        toast.success("Pembayaran diterima. Terima kasih!");
        await onPaid();
      } else if (manual) {
        toast.info("Pembayaran belum terdeteksi. Coba lagi beberapa saat setelah transfer.");
      }
    },
    [check, onPaid, paymentId],
  );

  useEffect(() => {
    if (!qris) return;
    const id = setInterval(() => void verify(false), 8_000);
    return () => clearInterval(id);
  }, [qris, verify]);

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Menyiapkan pembayaran QRIS…</p>;
  }

  if (failed) {
    return (
      <div className="space-y-3 rounded-lg border border-dashed border-border p-4 text-sm">
        <p className="text-muted-foreground">{failed}</p>
        <Button variant="outline" size="sm" onClick={() => void load(true)}>
          Coba lagi
        </Button>
      </div>
    );
  }

  const expired = secondsLeft <= 0;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col items-center gap-4 p-5">
          {!expired && qrImage ? (
            <div className="rounded-xl border border-border bg-white p-3">
              <img
                src={qrImage}
                alt="Kode QRIS pembayaran"
                className="h-60 w-60 sm:h-72 sm:w-72"
                width={288}
                height={288}
              />
            </div>
          ) : !expired && qris && !qris.qrString ? (
            <div className="flex h-60 w-60 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
              <span>Gambar QRIS belum tersedia.</span>
              <Button size="sm" variant="outline" onClick={() => void load(true)}>
                Muat ulang kode
              </Button>
            </div>
          ) : (
            <div className="flex h-60 w-60 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
              <span>Kode QRIS kedaluwarsa</span>
              <Button size="sm" variant="outline" onClick={() => void load(true)}>
                Buat ulang QRIS
              </Button>
            </div>
          )}

          <div className="text-center">
            <p className="text-2xl font-bold">{formatRupiah(Number(qris?.total ?? 0))}</p>
            <p className="text-xs text-muted-foreground">
              Nominal {formatRupiah(Number(qris?.amount ?? 0))}
              {qris?.fee ? ` + biaya layanan ${formatRupiah(Number(qris.fee))}` : ""}
            </p>
            <p className={`mt-1 text-xs ${expired ? "text-destructive" : "text-muted-foreground"}`}>
              {expired ? "Buat ulang kode untuk melanjutkan" : `Berlaku ${mm}:${ss}`}
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={() => void verify(true)} disabled={checking || expired}>
              <ShieldCheck className="mr-1.5 h-4 w-4" />
              {checking ? "Mengecek…" : "Saya sudah bayar"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void load(true)}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Buat ulang QRIS
            </Button>
            {qris?.qrString && !expired ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(qris.qrString!)
                    .then(() => toast.success("Kode QRIS disalin."))
                    .catch(() => toast.error("Gagal menyalin kode."));
                }}
              >
                <Copy className="mr-1.5 h-4 w-4" />
                Salin kode QRIS
              </Button>
            ) : null}
            {qris && !expired ? (
              <Button size="sm" variant="ghost" asChild>
                <a href={qris.payUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  Halaman pembayaran
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <ol className="space-y-1 text-xs text-muted-foreground">
        <li>1. Simpan atau pindai kode QRIS di atas lewat e-wallet atau m-banking.</li>
        <li>2. Pastikan nominal sesuai, lalu selesaikan pembayaran.</li>
        <li>3. Status pesanan diperbarui otomatis beberapa detik setelah pembayaran berhasil.</li>
      </ol>
    </div>
  );
}
