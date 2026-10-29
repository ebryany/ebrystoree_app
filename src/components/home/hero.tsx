import { Link } from "@tanstack/react-router";
import { ChevronsRight } from "lucide-react";

import { ShimmerButton } from "@/components/ui/shimmer-button";
import { WordAnimator } from "@/components/ui/word-animator";

const WORDS = ["produk digital", "jasa"];

export function HomeHero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate bg-background px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8"
    >
      <div className="mx-auto grid w-full max-w-7xl py-2 text-left sm:py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center lg:gap-10 lg:py-10">
        <div className="min-w-0">
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

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:mt-6">
              <ShimmerButton
                asChild
                borderRadius="8px"
                background="var(--primary)"
                shimmerColor="var(--primary-foreground)"
                className="rounded-control min-h-12 w-full justify-center text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none sm:w-auto lg:min-h-14 lg:px-7 lg:text-base"
              >
                <Link to="/produk">Jelajahi produk</Link>
              </ShimmerButton>

              <Link
                to="/layanan"
                className="rounded-control inline-flex min-h-12 w-full items-center justify-center gap-1.5 border border-primary/60 bg-card px-5 text-sm font-medium text-primary transition-colors hover:border-primary hover:bg-surface-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none sm:w-auto lg:min-h-14 lg:px-6 lg:text-base"
              >
                Lihat layanan
                <ChevronsRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
          <p className="mt-6 max-w-3xl border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            Pembayaran diverifikasi sebelum pesanan diproses. Setiap toko ditinjau sebelum tayang.
          </p>
        </div>
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
