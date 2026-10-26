"use client";

import { CheckCircle2, CreditCard, PackageCheck } from "lucide-react";

/**
 * Cara memesan: satu section ringkas, tiga tahap berdampingan.
 *
 * Sebelumnya tiap tahap memakai panel `h-screen` bertumpuk (ReactLenis +
 * sticky), sehingga pengunjung menggulir ~3 layar hanya untuk membaca tiga
 * kalimat proses — biaya perhatian jauh melebihi isinya. Sekarang ketiganya
 * disusun horizontal di desktop dan vertikal di mobile dalam satu section
 * setinggi konten, tanpa scroll-jacking dan tanpa Lenis (dependensi berat
 * untuk efek yang tidak lagi dibutuhkan).
 *
 * Isi tahap tetap berasal dari status sistem yang sebenarnya (batas 24 jam,
 * verifikasi manual, produk terbit setelah verifikasi) dan tetap terbaca
 * berurutan tanpa JavaScript maupun animasi.
 */

const PANELS = [
  {
    icon: CreditCard,
    step: "Tahap 1",
    title: "Pesanan masuk, bayar dalam 24 jam",
    body: "Nominal harus sama persis dengan total pesanan. Setelah batas 24 jam, pesanan kedaluwarsa dan perlu dibuat ulang.",
  },
  {
    icon: PackageCheck,
    step: "Tahap 2",
    title: "Pembayaran diverifikasi, pesanan dikerjakan",
    body: "Bukti transfer diperiksa tim keuangan. Produk digital terbit otomatis setelahnya, jasa masuk antrean pengerjaan seller.",
  },
  {
    icon: CheckCircle2,
    step: "Tahap 3",
    title: "Periksa hasilnya, lalu pesanan ditutup",
    body: "Unduhan tersedia atau hasil pengerjaan dikirim untuk kamu periksa. Revisi mengikuti paket, dan riwayatnya tersimpan di akun.",
  },
];

export function SmoothScrollStory() {
  return (
    <section
      id="cara-kerja"
      aria-label="Cara memesan di Ebrystore"
      className="relative"
    >
      {/* Tanpa background sendiri: section ini berada di dalam kawasan grid
          kontinu yang didefinisikan sekali di homepage (lihat index.tsx).
          Kartu tahapan tetap bg-card agar teks terbaca di atas garis. */}
      <div className="mx-auto w-full px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="mb-7 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Cara memesan
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Tiga langkah dari pesanan dibuat sampai produk sampai ke tanganmu.
          </p>
        </div>

        <ol className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
          {PANELS.map((panel, index) => (
            <li key={panel.step} className="bg-card p-5 sm:p-6">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface-selected text-accent">
                  <panel.icon className="size-4" aria-hidden="true" />
                </span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {panel.step} dari {PANELS.length}
                </span>
              </div>
              <h3 className="mt-3 text-sm font-bold leading-snug text-foreground sm:text-base">
                {panel.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {panel.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
