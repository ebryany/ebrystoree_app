import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Package,
  ShieldCheck,
  Store,
} from "lucide-react";

import heroMascotUrl from "@/assets/ebrystore-hero-mascot.webp";
import { useWebsiteSettings } from "@/hooks/use-website-settings";
import { clampBannerPosition, homeBannerSlides } from "@/lib/website-settings";
import { cn } from "@/lib/utils";

type BannerSlide = ReturnType<typeof homeBannerSlides>[number];

const QUICK_LINKS = [
  { label: "Produk digital", desc: "Siap unduh", to: "/produk" as const, icon: Package },
  { label: "Jasa seller", desc: "Sesuai brief", to: "/layanan" as const, icon: Briefcase },
  { label: "Pesanan saya", desc: "Pantau status", to: "/dashboard" as const, icon: ClipboardList },
  { label: "Buka toko", desc: "Mulai jualan", to: "/auth" as const, icon: Store },
] as const;

const GUARANTEES = [
  { icon: ShieldCheck, label: "Pembayaran diverifikasi" },
  { icon: BadgeCheck, label: "Dana jasa ditahan sampai hasil diterima" },
  { icon: Store, label: "Toko ditinjau sebelum tayang" },
] as const;

/**
 * Carousel banner promo berbasis native CSS scroll-snap.
 * Mengikuti pola Modern Web Guidance:
 * - Slide 0 memakai fetchPriority="high" tanpa loading="lazy" (kandidat LCP);
 *   slide berikutnya memakai fetchPriority="low" + loading="lazy".
 * - Kontrol Previous/Next berada sebelum track di DOM, mendukung pengalihan fokus
 *   saat tombol mencapai batas akhir, dan marker memiliki indikator bentuk non-warna.
 * - Status pengumuman polite hanya diperbarui setelah perpindahan slide selesai.
 */
function PromoBannerCarousel({
  slides,
  posX,
  posY,
}: {
  slides: BannerSlide[];
  posX: number;
  posY: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const settledRef = useRef(0);
  const pendingRef = useRef<number | null>(null);
  const userInitiatedRef = useRef(false);
  const [active, setActive] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  const total = slides.length;
  const isFirst = active === 0;
  const isLast = active === total - 1;

  const nearestSlide = useCallback(() => {
    const track = trackRef.current;
    if (!track || total <= 1) return 0;
    const width = track.clientWidth;
    if (width <= 0) return 0;
    return Math.max(0, Math.min(total - 1, Math.round(track.scrollLeft / width)));
  }, [total]);

  const scrollToSlide = useCallback(
    (target: number) => {
      const track = trackRef.current;
      if (!track || total <= 1) return;
      const clamped = Math.max(0, Math.min(total - 1, target));
      userInitiatedRef.current = true;
      pendingRef.current = clamped;
      setActive(clamped);
      const slideEl = track.children[clamped] as HTMLElement | undefined;
      if (slideEl) {
        const reduced =
          typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        track.scrollTo({
          left: slideEl.offsetLeft,
          behavior: reduced ? "auto" : "smooth",
        });
      }
    },
    [total],
  );

  const handleStep = useCallback(
    (dir: -1 | 1) => {
      const base = pendingRef.current ?? active;
      const next = Math.max(0, Math.min(total - 1, base + dir));
      if (next === base) return;
      scrollToSlide(next);
      // Redirect fokus ke tombol lawan bila tombol aktif akan nonaktif di ujung slide.
      if (dir === -1 && next === 0) {
        nextRef.current?.focus();
      } else if (dir === 1 && next === total - 1) {
        prevRef.current?.focus();
      }
    },
    [active, scrollToSlide, total],
  );

  useEffect(() => {
    const track = trackRef.current;
    if (!track || total <= 1) return;

    let rafId = 0;
    let fallbackTimer = 0;
    const supportsScrollEnd = "onscrollend" in window;

    const handleSettle = () => {
      const idx = nearestSlide();
      pendingRef.current = null;
      setActive(idx);
      if (userInitiatedRef.current && idx !== settledRef.current) {
        settledRef.current = idx;
        setAnnouncement(`Slide ${idx + 1} dari ${total}`);
      }
      userInitiatedRef.current = false;
    };

    const handleScroll = () => {
      if (pendingRef.current === null) {
        userInitiatedRef.current = true;
        if (!rafId) {
          rafId = window.requestAnimationFrame(() => {
            rafId = 0;
            const idx = nearestSlide();
            setActive((prev) => (prev === idx ? prev : idx));
          });
        }
      }
      if (!supportsScrollEnd) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = window.setTimeout(handleSettle, 140);
      }
    };

    track.addEventListener("scroll", handleScroll, { passive: true });
    if (supportsScrollEnd) {
      track.addEventListener("scrollend", handleSettle);
    }
    return () => {
      track.removeEventListener("scroll", handleScroll);
      if (supportsScrollEnd) {
        track.removeEventListener("scrollend", handleSettle);
      }
      if (rafId) window.cancelAnimationFrame(rafId);
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
    };
  }, [nearestSlide, total]);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Promo Ebrystore"
      className="relative min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--elev-1)]"
    >
      {total > 1 ? (
        <div className="pointer-events-none absolute inset-x-2.5 top-1/2 z-10 flex -translate-y-1/2 justify-between">
          <button
            ref={prevRef}
            type="button"
            disabled={isFirst}
            onClick={() => handleStep(-1)}
            aria-label="Slide promo sebelumnya"
            className="pointer-events-auto grid size-11 place-items-center rounded-full border border-border bg-card/95 text-foreground shadow-card transition-colors hover:bg-card disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <button
            ref={nextRef}
            type="button"
            disabled={isLast}
            onClick={() => handleStep(1)}
            aria-label="Slide promo berikutnya"
            className="pointer-events-auto grid size-11 place-items-center rounded-full border border-border bg-card/95 text-foreground shadow-card transition-colors hover:bg-card disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div
        ref={trackRef}
        tabIndex={0}
        role="group"
        aria-label="Daftar slide promo"
        className="ebry-carousel-track h-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {slides.map((slide, i) => (
          <div
            key={`${i}-${slide.imageUrl}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`Slide ${i + 1} dari ${total}`}
            className="relative aspect-[16/9] w-full shrink-0 snap-center bg-surface sm:aspect-[16/7] lg:aspect-auto lg:min-h-[300px]"
          >
            <picture>
              {slide.mobileUrl ? (
                <source media="(max-width: 639px)" srcSet={slide.mobileUrl} />
              ) : null}
              <img
                src={slide.imageUrl}
                alt={slide.alt || `Promo Ebrystore ${i + 1}`}
                width={1200}
                height={525}
                fetchPriority={i === 0 ? "high" : "low"}
                loading={i === 0 ? undefined : "lazy"}
                decoding="async"
                style={{ objectPosition: `${posX}% ${posY}%` }}
                className="size-full object-cover"
              />
            </picture>
          </div>
        ))}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {total > 1 ? (
        <nav
          aria-label="Pilih slide promo"
          className="absolute inset-x-0 bottom-2 z-10 flex items-center justify-center gap-0.5"
        >
          {slides.map((slide, i) => {
            const current = i === active;
            return (
              <button
                key={`marker-${i}-${slide.imageUrl}`}
                type="button"
                onClick={() => scrollToSlide(i)}
                aria-label={`Buka slide ${i + 1} dari ${total}`}
                aria-current={current ? "true" : undefined}
                className="grid min-h-11 min-w-8 place-items-center px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "block h-2.5 rounded-full border transition-all duration-200 motion-reduce:transition-none",
                    current
                      ? "w-7 border-primary-foreground/90 bg-primary shadow-sm"
                      : "w-2.5 border-foreground/30 bg-card/90 hover:bg-card",
                  )}
                />
              </button>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}

/**
 * Banner pengganti saat admin belum mengunggah gambar banner promo.
 * Tetap berformat banner marketplace dengan kontras tinggi dan aksi langsung.
 */
function DefaultPromoBanner() {
  return (
    <div className="relative flex min-h-[220px] min-w-0 items-center overflow-hidden rounded-2xl bg-hero-gradient p-5 text-[#faf8f3] shadow-[var(--elev-1)] sm:min-h-[260px] sm:p-7 lg:min-h-[300px] lg:p-8">
      <div className="relative z-10 flex max-w-lg flex-col justify-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#faf8f3]/85">
          Etalase Produk Digital & Jasa
        </p>
        <p className="mt-2 font-display text-2xl font-bold leading-tight tracking-tight text-[#faf8f3] sm:text-3xl">
          Temukan produk siap pakai dan jasa seller terverifikasi
        </p>
        <p className="mt-2.5 text-sm leading-relaxed text-[#faf8f3]/85">
          Bandingkan harga antar toko, bayar lewat kanal resmi, dan pantau progres pesanan langsung
          dari akunmu.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link
            to="/produk"
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-[#faf8f3] px-4 text-sm font-semibold text-[#003f42] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#faf8f3] focus-visible:ring-offset-2 focus-visible:ring-offset-[#003f42]"
          >
            Belanja produk
          </Link>
          <Link
            to="/layanan"
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-[#faf8f3]/50 bg-transparent px-4 text-sm font-semibold text-[#faf8f3] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#faf8f3] focus-visible:ring-offset-2 focus-visible:ring-offset-[#003f42]"
          >
            Lihat jasa seller
          </Link>
        </div>
      </div>
      <div className="ml-auto hidden shrink-0 lg:block">
        <img
          src={heroMascotUrl}
          alt="Maskot Ebrystore membawa laptop"
          width={320}
          height={320}
          fetchPriority="high"
          decoding="async"
          className="size-56 object-contain xl:size-64"
        />
      </div>
    </div>
  );
}

/**
 * Hero beranda gaya marketplace (Tokopedia x Itemku):
 * - Kiri: Banner promo carousel dari pengaturan admin (atau banner default Ebrystore).
 * - Kanan: Panel akses cepat 2x2 dan jaminan sistem yang benar-benar berjalan.
 */
export function HomeHero() {
  const settings = useWebsiteSettings();
  const slides = homeBannerSlides(settings);
  const posX = clampBannerPosition(settings.home_banner_position_x);
  const posY = clampBannerPosition(settings.home_banner_position_y);

  return (
    <section
      aria-labelledby="hero-heading"
      className="border-b border-border bg-surface/65 px-3 py-4 sm:px-6 sm:py-5 lg:px-8"
    >
      <div className="mx-auto grid w-full max-w-7xl gap-3.5 lg:grid-cols-[minmax(0,1.95fr)_minmax(0,1fr)] lg:items-stretch 2xl:max-w-[88rem]">
        {slides.length > 0 ? (
          <PromoBannerCarousel slides={slides} posX={posX} posY={posY} />
        ) : (
          <DefaultPromoBanner />
        )}

        <aside className="flex min-w-0 flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-[var(--elev-1)] sm:p-5">
          <div>
            <h1
              id="hero-heading"
              className="font-display text-lg font-bold leading-snug tracking-tight text-foreground sm:text-xl"
            >
              Marketplace produk digital & jasa
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Pilih produk siap unduh atau pesan jasa seller dalam satu akun.
            </p>

            <ul role="list" className="mt-3.5 grid grid-cols-2 gap-2">
              {QUICK_LINKS.map((item) => (
                <li key={item.label} className="min-w-0">
                  <Link
                    to={item.to}
                    className="group flex min-h-12 items-center gap-2.5 rounded-xl border border-border bg-surface/60 px-2.5 py-2 transition-colors hover:border-primary/45 hover:bg-surface-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-card text-primary shadow-[var(--elev-1)]">
                      <item.icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-foreground group-hover:text-primary">
                        {item.label}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {item.desc}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <ul
            aria-label="Jaminan sistem Ebrystore"
            className="grid gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground"
          >
            {GUARANTEES.map((g) => (
              <li key={g.label} className="flex items-center gap-2">
                <g.icon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span>{g.label}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
