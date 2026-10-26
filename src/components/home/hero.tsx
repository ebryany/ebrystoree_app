import { Link } from "@tanstack/react-router";
import { ChevronsRight } from "lucide-react";

import { HeroShaderBackground } from "@/components/home/hero-shader-background";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { WordAnimator } from "@/components/ui/word-animator";

/**
 * Hero beranda.
 *
 * Pita lebar penuh, bukan kotak berbingkai. Latar gradien bergerak mengisi
 * seluruh lebar, dengan lapisan gelap agar teks putih tetap terbaca.
 *
 * Aturan copy: tidak ada istilah internal di sini. "Seller", "vendor",
 * "multi-vendor", "ledger", "pencairan dana" adalah kosakata operasional yang
 * tidak dikenal pembeli. Hero hanya menyebut apa yang bisa dibeli dan apa
 * manfaatnya bagi pembeli.
 *
 * Animasi kata dipertahankan karena memberi gerak tanpa menggeser tata letak.
 * Kedua kata yang berputar sama-sama melengkapi kalimat, jadi headline tetap
 * terbaca utuh kapan pun animasi berhenti.
 */

const WORDS = ["produk digital", "jasa"];

export function HomeHero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate overflow-hidden bg-foreground"
    >
      <HeroShaderBackground />

      {/* Lapisan gelap: menjaga kontras teks putih di atas gradien yang terang. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/45 to-black/65"
      />

      <div className="relative px-4 py-14 text-center sm:px-6 sm:py-24 lg:py-28">
        {/* Baris pertama statis, baris kedua berisi kata beranimasi. Di mobile
            kedua barisnya memang terpisah, jadi kotak animasi tidak pernah
            memotong kalimat di tengah. */}
        <h1
          id="hero-heading"
          className="mx-auto max-w-4xl text-balance font-display text-3xl font-bold leading-[1.2] tracking-tight text-white sm:text-4xl lg:text-6xl"
        >
          Belanja di Ebrystore
          <span className="mt-3 block sm:mt-4">
            <WordAnimator
              words={WORDS}
              duration={3}
              className="rounded-lg border border-white/25 bg-white/10 px-3 text-white sm:px-4"
            />
          </span>
        </h1>

        <p className="mx-auto mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-white/80 sm:mt-5 sm:text-lg">
          Belanja produk digital dan jasa dari toko terpilih. Harga jelas di depan, pembayaran
          terverifikasi, dan setiap pesanan bisa dipantau sampai tuntas.
        </p>

        {/* Di mobile tombol ditumpuk penuh supaya mudah dijangkau jempol;
            sejajar berdampingan baru di layar >= 640px. */}
        <div className="mx-auto mt-6 flex w-full max-w-xs flex-col gap-2.5 sm:max-w-none sm:flex-row sm:items-center sm:justify-center sm:gap-3">
          <ShimmerButton
            borderRadius="8px"
            background="#ffffff"
            shimmerColor="var(--accent)"
            className="rounded-control w-full justify-center sm:w-auto"
          >
            <Link to="/produk" className="text-sm font-semibold text-foreground lg:text-base">
              Jelajahi produk
            </Link>
          </ShimmerButton>

          <Link
            to="/layanan"
            className="rounded-control inline-flex min-h-11 w-full items-center justify-center gap-1.5 border border-white/40 bg-white/5 px-5 text-sm font-medium text-white transition-colors hover:border-white/70 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:w-auto"
          >
            Lihat layanan
            <ChevronsRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <p className="mx-auto mt-5 max-w-md text-xs leading-relaxed text-white/70">
          Pembayaran diverifikasi sebelum pesanan diproses. Setiap toko ditinjau sebelum tayang.
        </p>
      </div>
    </section>
  );
}
