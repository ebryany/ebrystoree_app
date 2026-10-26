import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Store } from "lucide-react";

import { getMyStore } from "@/lib/seller.functions";

/**
 * Pintu masuk seller di dashboard pembeli.
 *
 * Teks mengikuti status toko supaya tidak berbohong: user yang sudah punya toko
 * tidak ditawari "Buka Toko" lagi, dan user yang menunggu verifikasi tidak
 * diarahkan ke dashboard yang belum bisa dipakai.
 */
export function SellerEntryCard() {
  const fetchStore = useServerFn(getMyStore);
  const { data, isPending, error } = useQuery({
    queryKey: ["my-store"],
    queryFn: () => fetchStore({}),
  });

  // Saat memuat atau gagal, status toko belum diketahui: jangan menebak.
  // Kartu ini bukan konten utama, jadi menghilang lebih jujur daripada salah.
  if (isPending || error || data?.error) return null;

  const store = data?.store as { name: string; status: string } | null;

  if (!store) {
    return (
      <section
        aria-labelledby="seller-entry-heading"
        className="rounded-2xl border border-border bg-card p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-selected text-accent">
            <Store className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="seller-entry-heading" className="text-sm font-bold text-foreground">
              Ingin menjual produk digital?
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Buka toko di Ebrystore, kelola produk, dan pantau penjualan dari satu tempat.
            </p>
            <Link
              to="/seller"
              className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Buka Toko
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const statusLabel =
    store.status === "active"
      ? "Toko aktif"
      : store.status === "pending"
        ? "Menunggu verifikasi admin"
        : store.status === "suspended"
          ? "Toko ditangguhkan"
          : "Pengajuan ditolak";

  const actionLabel = store.status === "active" ? "Kelola Toko" : "Lihat status";

  return (
    <section
      aria-labelledby="seller-entry-heading"
      className="rounded-2xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-selected text-accent">
          <Store className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="seller-entry-heading" className="truncate text-sm font-bold text-foreground">
            {store.name}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{statusLabel}</p>
          <Link
            to="/seller"
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {actionLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
