import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getMyStockCode } from "@/lib/orders.functions";
import { stockCodeUrl } from "@/lib/digital-receipt";
import { decodeAccount } from "@/lib/account-stock";

function CopyField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(!secret);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Gagal menyalin. Tahan teks lalu salin manual.");
    }
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-1 rounded-lg border border-border bg-background pl-3">
        <span className="min-w-0 flex-1 select-all break-all py-2 font-mono text-sm">
          {shown ? value : "•".repeat(Math.min(12, value.length))}
        </span>
        {secret ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-11 shrink-0"
            aria-label={shown ? `Sembunyikan ${label}` : `Tampilkan ${label}`}
            onClick={() => setShown((s) => !s)}
          >
            {shown ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </Button>
        ) : null}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-11 shrink-0"
          aria-label={`Salin ${label}`}
          onClick={() => void copy()}
        >
          {copied ? (
            <Check className="size-4 text-primary" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
        </Button>
      </div>
    </div>
  );
}

export function StockCodeAccess({
  entitlementId,
  locked,
}: {
  entitlementId: string;
  locked: boolean;
}) {
  const fetchCode = useServerFn(getMyStockCode);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function reveal() {
    setBusy(true);
    setCode(null);
    setFailure(null);
    try {
      const result = await fetchCode({ data: { entitlementId } });
      if (!result.ok) {
        setFailure(result.error);
        return;
      }
      setCode(result.code);
    } catch {
      setFailure("Produk gagal dimuat. Coba kembali.");
    } finally {
      setBusy(false);
    }
  }

  const visibleCode = locked ? null : code;
  const account = visibleCode ? decodeAccount(visibleCode) : null;
  const url = visibleCode && !account ? stockCodeUrl(visibleCode) : null;
  return (
    <div className="space-y-3">
      {visibleCode ? null : (
        <Button className="min-h-11 w-full" disabled={busy || locked} onClick={() => void reveal()}>
          {busy ? "Memuat…" : "Lihat produk"}
        </Button>
      )}
      {failure ? (
        <p className="text-sm text-destructive" role="alert">
          {failure}
        </p>
      ) : null}
      {account ? (
        <div className="space-y-2.5 rounded-lg border border-border p-3">
          <p className="text-xs font-medium">Akun Anda</p>
          <CopyField label="Email / username" value={account.login} />
          <CopyField label="Password" value={account.password} secret />
          {account.note ? (
            <p className="whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              {account.note}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Jangan bagikan akun ini. Konfirmasikan penerimaan melalui detail pesanan setelah berhasil
            masuk.
          </p>
        </div>
      ) : visibleCode ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <CopyField label="Kode/link produk Anda" value={visibleCode} />
          {url ? (
            <Button asChild variant="outline" className="min-h-11 w-full">
              <a href={url} target="_blank" rel="noopener noreferrer">
                Buka link produk
              </a>
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Jangan bagikan kode/link ini. Konfirmasikan penerimaan melalui detail pesanan setelah
            memeriksa produk.
          </p>
        </div>
      ) : null}
    </div>
  );
}
