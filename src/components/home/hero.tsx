import { Link } from "@tanstack/react-router";
import { ChevronsRight } from "lucide-react";

import { BlurVignette, BlurVignetteArticle } from "@/components/ui/blur-vignette";
import { SpotlightLink } from "@/components/ui/spotlight-link";
import { WordAnimator } from "@/components/ui/word-animator";

const WORDS = ["produk digital", "jasa"];

export function HomeHero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate bg-background px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8"
    >
      <div className="mx-auto grid w-full max-w-7xl py-2 text-left sm:py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center lg:gap-10 lg:py-10">
        {/* HP: glow lembut di belakang teks, tepinya diburamkan (blur vignette),
            tanpa border. Desktop (lg+): glow & blur disembunyikan, tata letak lama. */}
        <BlurVignette
          radius="24px"
          inset="10px"
          transitionLength="100px"
          blur="15px"
          className="min-w-0 overflow-hidden lg:overflow-visible lg:[&>[data-blur-vignette]]:hidden"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_15%_20%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_70%),radial-gradient(55%_45%_at_90%_85%,color-mix(in_oklch,var(--accent)_20%,transparent),transparent_70%)] lg:hidden"
          />
          <BlurVignetteArticle className="p-5 min-[375px]:p-6 lg:p-0">
          <h1
            id="hero-heading"
            className="min-w-0 font-display text-2xl font-bold leading-tight tracking-tight text-foreground min-[375px]:text-3xl sm:text-4xl lg:text-5xl"
          >
            Belanja di Ebrystore
            <span className="mt-2 block">
              <WordAnimator
                words={WORDS}
                duration={3}
                className="max-w-full text-primary [&>span]:whitespace-normal"
              />
            </span>
          </h1>

          <div className="mt-5 min-w-0 max-w-3xl">
            <p className="text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base lg:text-lg">
              Belanja produk digital dan jasa dari toko terpilih. Harga jelas di depan, pembayaran
              terverifikasi, dan setiap pesanan bisa dipantau sampai tuntas.
            </p>

            {/* Tombol sejajar kiri-ke-kanan di semua ukuran; di HP masing-masing
                mengambil setengah lebar (flex-1), di sm+ selebar isinya. */}
            <div className="mt-5 flex items-center gap-2.5 lg:mt-6">
              <SpotlightLink
                to="/produk"
                className="min-h-12 flex-1 px-3 text-sm sm:flex-none sm:px-6 lg:min-h-14 lg:px-7 lg:text-base"
              >
                Jelajahi produk
              </SpotlightLink>

              <Link
                to="/layanan"
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-md border-2 border-primary/40 bg-card px-3 text-sm font-medium text-primary transition-colors hover:border-primary hover:bg-surface-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none sm:flex-none sm:px-6 lg:min-h-14 lg:px-6 lg:text-base"
              >
                Lihat layanan
                <ChevronsRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
          <p className="mt-6 max-w-3xl border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            Pembayaran diverifikasi sebelum pesanan diproses. Setiap toko ditinjau sebelum tayang.
          </p>
          </BlurVignetteArticle>
        </BlurVignette>
        <div className="hidden min-w-0 lg:flex lg:justify-end">
          <img
            src="/images/ebrystore-hero-mascot.webp?v=bf406217"
            alt="Maskot Ebrystore membawa laptop"
            width={1254}
            height={1254}
            loading="lazy"
            decoding="async"
            className="h-auto w-full max-w-md object-contain xl:max-w-[33rem]"
          />
        </div>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_90%_70%_at_100%_0%,var(--surface-selected),transparent_70%)] lg:bg-[radial-gradient(ellipse_50%_90%_at_80%_50%,var(--surface-selected),transparent_70%)]"
      />
    </section>
  );
}
