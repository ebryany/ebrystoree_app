import { Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, MessagesSquare, ShieldCheck, Store, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Jalur masuk seller.
 *
 * Bukan satu kotak dengan satu tombol, tapi panel yang menyebutkan apa saja
 * yang didapat seller setelah membuka toko. Isinya berasal dari fitur yang
 * benar-benar ada di dashboard seller (pesanan, produk, chat, keuangan),
 * jadi tidak ada janji kosong.
 *
 * Dana ditahan sampai pembeli menerima hasil; setiap jasa ditinjau admin
 * sebelum tayang. Dua hal ini mekanisme nyata, bukan klaim pemasaran.
 */

const PERKS = [
  {
    icon: Store,
    title: "Toko sendiri",
    body: "Halaman toko dengan daftar produk dan jasa yang bisa dibuka pembeli.",
  },
  {
    icon: MessagesSquare,
    title: "Chat sebelum pesan",
    body: "Pembeli bisa bertanya dulu, jadi kesepakatan jelas sejak awal.",
  },
  {
    icon: BarChart3,
    title: "Pesanan terpantau",
    body: "Setiap pesanan punya status dan riwayat yang bisa kamu lihat kapan saja.",
  },
  {
    icon: Wallet,
    title: "Pendapatan tercatat",
    body: "Pendapatan masuk ke saldo toko setelah pembeli menerima hasil, bukan saat pembayaran masuk.",
  },
];

export function SellerJoinSection() {
  return (
    <section
      aria-labelledby="seller-join-heading"
      className="relative mt-10 overflow-hidden rounded-2xl border border-border sm:mt-12"
    >
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Kiri: ajakan + tombol. Transparan agar grid tetap terlihat. */}
        <div className="min-w-0 p-5 sm:p-7">
          <span className="grid size-10 place-items-center rounded-xl border border-border bg-card text-accent">
            <Store className="size-5" aria-hidden="true" />
          </span>
          <h2 id="seller-join-heading" className="mt-4 text-xl font-bold leading-snug sm:text-2xl">
            Punya produk digital atau jasa untuk dijual?
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Buka toko, susun kesepakatan kerja, dan terima pendapatan yang tercatat di saldo toko
            setelah pembeli menerima hasil.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button asChild className="min-h-11 rounded-control">
              <Link to="/auth">
                Mulai jualan
                <ArrowRight className="ml-1.5 size-4" aria-hidden="true" />
              </Link>
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
              Setiap jasa ditinjau admin sebelum tayang
            </p>
          </div>
        </div>

        {/* Kanan: empat keunggulan. Pemisah memakai border tipis, bukan
            background fill, supaya grid tidak tertutup. */}
        <div className="grid grid-cols-1 border-t border-border sm:grid-cols-2 lg:border-l lg:border-t-0">
          {PERKS.map((perk, i) => (
            <div
              key={perk.title}
              className={cn(
                "p-4 sm:p-5",
                // Garis pemisah antar item, bukan kartu terpisah.
                i % 2 === 1 && "sm:border-l sm:border-border",
                i >= 2 && "border-t border-border",
              )}
            >
              <perk.icon className="size-4 text-accent" aria-hidden="true" />
              <p className="mt-2.5 text-sm font-semibold text-foreground">{perk.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{perk.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
