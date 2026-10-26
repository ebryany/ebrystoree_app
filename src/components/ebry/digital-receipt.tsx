import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
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
import { confirmDigitalReceipt, getMyDigitalReceipt } from "@/lib/orders.functions";

export function DigitalReceiptPanel({
  orderId,
  onConfirmed,
}: {
  orderId: string;
  onConfirmed: () => Promise<void>;
}) {
  const fetchReceipt = useServerFn(getMyDigitalReceipt);
  const confirmReceipt = useServerFn(confirmDigitalReceipt);
  const queryClient = useQueryClient();
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["digital-receipt", orderId],
    queryFn: () => fetchReceipt({ data: { orderId } }),
  });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setFailure(null);
    try {
      const result = await confirmReceipt({ data: { orderId } });
      if (!result.ok) {
        setFailure(result.error);
        await refetch();
        return;
      }
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["digital-receipt", orderId] });
      await onConfirmed();
    } catch {
      setFailure("Konfirmasi belum terpastikan. Muat ulang status sebelum mencoba kembali.");
    } finally {
      setBusy(false);
    }
  }

  if (!isPending && !error && !data?.error && !data?.receipt) return null;
  const receipt = data?.receipt;
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold">Penerimaan produk</h2>
      {isPending ? (
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          Memuat status penerimaan…
        </p>
      ) : error || data?.error ? (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-destructive" role="alert">
            {data?.error ?? "Status penerimaan gagal dimuat."}
          </p>
          <Button variant="outline" className="min-h-11" onClick={() => void refetch()}>
            Muat ulang status
          </Button>
        </div>
      ) : receipt?.status === "accepted" ? (
        <p className="mt-2 text-sm" role="status">
          Anda sudah mengonfirmasi produk diterima dan sesuai
          {receipt.accepted_at
            ? ` pada ${new Date(receipt.accepted_at).toLocaleString("id-ID")}`
            : ""}
          .
        </p>
      ) : receipt ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">
            Periksa seluruh produk di pustaka sebelum mengonfirmasi. Mengunduh produk tidak otomatis
            menyelesaikan pesanan. Dana seller ditahan sampai Anda mengonfirmasi penerimaan.
          </p>
          <ul className="space-y-2 text-sm">
            {receipt.items.map((item) => (
              <li key={item.item_id} className="flex flex-wrap justify-between gap-2">
                <span className="min-w-0 break-words">{item.name}</span>
                <span className="text-muted-foreground">
                  {item.ready ? "Tersedia" : "Belum tersedia"}
                </span>
              </li>
            ))}
          </ul>
          {!receipt.can_confirm ? (
            <p className="text-sm text-muted-foreground">
              Konfirmasi tersedia setelah seluruh produk siap dan pesanan lunas tanpa pengajuan
              refund aktif.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/dashboard/produk-saya">Periksa produk saya</Link>
            </Button>
            <Button
              className="min-h-11"
              disabled={busy || !receipt.can_confirm}
              onClick={() => {
                setFailure(null);
                setOpen(true);
              }}
            >
              Produk diterima dan sesuai
            </Button>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => void refetch()}
            >
              Muat ulang status
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Produk bermasalah? Gunakan formulir Ajukan refund pada halaman ini jika masih memenuhi
            ketentuan refund.
          </p>
        </div>
      ) : null}
      {failure ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {failure}
        </p>
      ) : null}
      <AlertDialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasikan penerimaan produk?</AlertDialogTitle>
            <AlertDialogDescription>
              Konfirmasi menyatakan seluruh produk sudah diterima dan sesuai. Pesanan akan ditandai
              selesai dan pendapatan seller dilepas ke saldo tersedia. Ini tidak mengubah ketentuan pengajuan refund.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {failure ? (
            <p className="text-sm text-destructive" role="alert">
              {failure}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void confirm();
              }}
            >
              {busy ? "Menyimpan…" : "Ya, produk diterima"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
