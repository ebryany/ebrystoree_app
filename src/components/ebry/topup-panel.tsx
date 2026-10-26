import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, ExternalLink, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import QRCode from "qrcode";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRupiah } from "@/lib/format";
import { checkCreditTopup, createCreditTopup } from "@/lib/credit-topup.functions";

/**
 * Panel isi saldo Ebrystore via QRIS.
 *
 * Keputusan desain dan alasannya:
 * - Nominal dipilih dari preset atau diisi manual; server memvalidasi ulang
 *   batas 10rb-1jt (create_credit_topup), jadi klien bukan sumber kebenaran.
 * - QR dibuat sekali per permintaan (createCreditTopup langsung mengembalikan
 *   payload QRIS); "Buat ulang" membuat permintaan baru, bukan memutar ulang
 *   kode lama yang mungkin sudah kedaluwarsa.
 * - Status dicek otomatis tiap 8 detik selagi menunggu; tombol manual tetap
 *   ada supaya pengguna tidak menunggu buta.
 * - Bila QRIS belum dikonfigurasi di server, pesannya jujur dan panel tidak
 *   menampilkan QR kosong.
 */

const PRESETS = [10_000, 25_000, 50_000, 100_000] as const;
const MIN_AMOUNT = 10_000;
const MAX_AMOUNT = 1_000_000;

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
    const tick = () =>
      setLeft(Math.max(0, Math.floor((new Date(target).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return left;
}

export function TopupPanel({ onPaid }: { onPaid: () => void | Promise<void> }) {
  const create = useServerFn(createCreditTopup);
  const check = useServerFn(checkCreditTopup);

  const [selected, setSelected] = useState<number>(25_000);
  const [custom, setCustom] = useState("");
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [topupId, setTopupId] = useState<string | null>(null);
  const [topupNumber, setTopupNumber] = useState<string | null>(null);
  const [qris, setQris] = useState<Qris | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const secondsLeft = useCountdown(qris?.expiredAt ?? null);

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
      if (!topupId) return;
      setChecking(true);
      const result: any = await check({ data: { topupId } });
      setChecking(false);
      if (!result.ok) {
        if (manual) toast.error(result.error);
        return;
      }
      if (result.status === "paid") {
        toast.success("Isi saldo berhasil. Saldo kamu sudah bertambah.");
        setQris(null);
        setTopupId(null);
        setTopupNumber(null);
        await onPaid();
      } else if (manual) {
        toast.info("Pembayaran belum terdeteksi. Coba lagi beberapa saat setelah membayar.");
      }
    },
    [check, onPaid, topupId],
  );

  useEffect(() => {
    if (!qris || !topupId) return;
    const id = setInterval(() => void verify(false), 8_000);
    return () => clearInterval(id);
  }, [qris, topupId, verify]);

  async function start(amount: number) {
    setCreating(true);
    setFailed(null);
    const result: any = await create({ data: { amount } });
    setCreating(false);
    if (!result.ok) {
      setFailed(result.error);
      return;
    }
    setTopupId(result.topupId);
    setTopupNumber(result.topupNumber);
    setQris(result.qris ?? null);
    if (!result.qris) setFailed(result.error);
  }

  const expired = qris ? secondsLeft <= 0 : false;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const customValue = Number(custom.replace(/[^\d]/g, ""));
  const customValid = customValue >= MIN_AMOUNT && customValue <= MAX_AMOUNT;

  // Belum ada permintaan aktif: tampilkan pilihan nominal.
  if (!qris) {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Pilih nominal</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRESETS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => {
                  setSelected(amount);
                  setCustom("");
                }}
                className={`min-h-11 rounded-lg border px-3 text-sm font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  selected === amount && !custom
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-accent/50 hover:bg-surface-selected"
                }`}
              >
                {formatRupiah(amount)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="topup-custom" className="text-sm font-semibold text-foreground">
            Nominal lain
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <Input
              id="topup-custom"
              inputMode="numeric"
              placeholder="Contoh: 150000"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              className="min-h-11 tabular-nums"
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Minimal {formatRupiah(MIN_AMOUNT)}, maksimal {formatRupiah(MAX_AMOUNT)}.
          </p>
        </div>

        {failed ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {failed}
          </p>
        ) : null}

        <Button
          className="min-h-11 w-full sm:w-auto"
          disabled={creating || (custom ? !customValid : false)}
          onClick={() => void start(custom ? customValue : selected)}
        >
          <Wallet className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {creating
            ? "Menyiapkan QRIS…"
            : `Isi saldo ${formatRupiah(custom ? customValue || 0 : selected)}`}
        </Button>
      </div>
    );
  }

  // Ada permintaan aktif: tampilkan QRIS.
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col items-center gap-4 p-5">
          {!expired && qrImage ? (
            <div className="rounded-xl border border-border bg-white p-3">
              <img
                src={qrImage}
                alt="Kode QRIS isi saldo"
                className="h-60 w-60 sm:h-72 sm:w-72"
                width={288}
                height={288}
              />
            </div>
          ) : !expired && qris && !qris.qrString ? (
            <div className="flex h-60 w-60 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
              <span>Gambar QRIS belum tersedia.</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void start(Number(qris.total || 25_000))}
              >
                Buat ulang kode
              </Button>
            </div>
          ) : (
            <div className="flex h-60 w-60 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
              <span>Kode QRIS kedaluwarsa</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void start(Number(qris.amount || 25_000))}
              >
                Buat ulang QRIS
              </Button>
            </div>
          )}

          <div className="text-center">
            <p className="text-2xl font-bold tabular-nums">
              {formatRupiah(Number(qris.total ?? 0))}
            </p>
            <p className="text-xs text-muted-foreground">
              Nominal {formatRupiah(Number(qris.amount ?? 0))}
              {qris.fee ? ` + biaya layanan ${formatRupiah(Number(qris.fee))}` : ""}
            </p>
            {topupNumber ? (
              <p className="mt-1 text-xs text-muted-foreground">Nomor isi saldo {topupNumber}</p>
            ) : null}
            <p className={`mt-1 text-xs ${expired ? "text-destructive" : "text-muted-foreground"}`}>
              {expired ? "Buat ulang kode untuk melanjutkan" : `Berlaku ${mm}:${ss}`}
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={() => void verify(true)} disabled={checking || expired}>
              <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {checking ? "Mengecek…" : "Saya sudah bayar"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={creating}
              onClick={() => void start(Number(qris.amount || 25_000))}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Buat ulang QRIS
            </Button>
            {qris.qrString && !expired ? (
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
                <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Salin kode QRIS
              </Button>
            ) : null}
            {!expired ? (
              <Button size="sm" variant="ghost" asChild>
                <a href={qris.payUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden="true" />
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
        <li>3. Saldo bertambah otomatis beberapa detik setelah pembayaran berhasil.</li>
      </ol>
    </div>
  );
}
