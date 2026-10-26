"use client";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Wallet } from "lucide-react";

import { formatRupiah } from "@/lib/format";
import { getMyCredit } from "@/lib/orders.functions";
import { cn } from "@/lib/utils";

/**
 * Opsi memakai saldo Ebrystore saat checkout.
 *
 * Alasan desain:
 * - Saldo hanya ditawarkan bila benar-benar ada (> 0). Menampilkan "Rp 0" hanya
 *   menambah baris tanpa memberi pilihan.
 * - Nilai yang ditampilkan adalah batas atas (saldo atau perkiraan total,
 *   mana yang lebih kecil). Jumlah final dihitung server lewat
 *   `apply_credit_to_order`, yang juga menghormati biaya admin — jadi angka di
 *   sini adalah perkiraan, bukan janji.
 * - Pemilihan disimpan di state induk supaya checkout bisa memutuskan memanggil
 *   penerapan saldo setelah order terbentuk.
 */
export function CreditUseOption({
  estimatedTotal,
  enabled,
  onEnabledChange,
  className,
}: {
  estimatedTotal: number;
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  className?: string;
}) {
  const fetchCredit = useServerFn(getMyCredit);
  const { data } = useQuery({
    queryKey: ["my-credit"],
    queryFn: () => fetchCredit({}),
    staleTime: 30_000,
  });

  const balance = data?.balance ?? 0;
  // Saldo tidak dapat dimuat atau kosong: tidak ada yang bisa ditawarkan.
  // (data.error juga menghasilkan balance 0, jadi satu penjagaan cukup.)
  if (balance <= 0) return null;

  const maxUse = Math.min(balance, Math.max(0, estimatedTotal));

  return (
    <div className={cn("rounded-xl border border-accent/40 bg-accent/5 p-3.5", className)}>
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Wallet className="size-4 text-accent" aria-hidden="true" />
            Pakai saldo Ebrystore
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            Saldo kamu {formatRupiah(balance)}. Dipakai maksimal {formatRupiah(maxUse)} untuk
            pesanan ini; sisanya dibayar dengan metode pilihanmu. Jumlah final dihitung server
            setelah pesanan dibuat.
          </span>
        </span>
      </label>
    </div>
  );
}
