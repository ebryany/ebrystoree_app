import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { getMyStockCode } from "@/lib/orders.functions";
import { stockCodeUrl } from "@/lib/digital-receipt";

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
      setFailure("Kode/link gagal dimuat. Coba kembali.");
    } finally {
      setBusy(false);
    }
  }

  const visibleCode = locked ? null : code;
  const url = visibleCode ? stockCodeUrl(visibleCode) : null;
  return (
    <div className="space-y-3">
      <Button className="min-h-11 w-full" disabled={busy || locked} onClick={() => void reveal()}>
        {busy ? "Memuat kode/link…" : visibleCode ? "Muat ulang kode/link" : "Lihat kode/link"}
      </Button>
      {failure ? (
        <p className="text-sm text-destructive" role="alert">
          {failure}
        </p>
      ) : null}
      {visibleCode ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-xs font-medium">Kode/link produk Anda</p>
          <pre className="whitespace-pre-wrap break-all text-sm">{visibleCode}</pre>
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
