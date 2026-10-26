import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

import { homeBannerSlides } from "@/lib/website-settings";

/**
 * Banner sebagai latar hero.
 *
 * Menggantikan BannerSlider yang berdiri sendiri: gambar banner sekarang
 * mengisi latar hero, dan berganti otomatis setiap 10 detik.
 *
 * Cara bergantinya memakai dua lapisan gambar yang saling menimpa lalu
 * di-cross-fade lewat opasitas, bukan menggeser posisi. Alasannya: menggeser
 * gambar berukuran penuh memaksa browser melukis ulang seluruh area hero setiap
 * frame, sedangkan cross-fade hanya mengubah opasitas dan jauh lebih ringan.
 * Efeknya juga lebih tenang, sesuai arah visual Ebrystore.
 *
 * Yang dijaga:
 * - Autoplay berhenti saat `prefers-reduced-motion`; pengguna dengan preferensi
 *   itu hanya melihat banner pertama, tanpa gerakan.
 * - Timer hanya berjalan saat hero benar-benar terlihat (IntersectionObserver),
 *   jadi tidak ada pergantian gambar yang terbuang saat pengguna sudah menggulir
 *   jauh ke bawah.
 * - Timer juga berhenti saat tab tidak aktif, supaya tidak melompat beberapa
 *   slide sekaligus saat pengguna kembali.
 * - Gambar pertama dimuat `eager` (bagian dari tampilan awal), sisanya `lazy`.
 * - Tanpa slide, komponen ini tidak merender apa pun.
 */

const INTERVAL_MS = 10_000;

export function HeroBannerBackground({ settings }: { settings: Record<string, unknown> }) {
  const slides = homeBannerSlides(settings);
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  // Hanya jalankan timer saat hero terlihat di layar.
  useEffect(() => {
    const host = document.getElementById("hero-banner-host");
    if (!host) return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.05 },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || slides.length < 2 || !visible) return;
    const timer = window.setInterval(() => {
      // Tab tidak aktif: jangan ganti slide, supaya tidak melompat saat kembali.
      if (document.hidden) return;
      setIndex((current) => (current + 1) % slides.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [reduced, slides.length, visible]);

  if (!slides.length) return null;

  return (
    <div id="hero-banner-host" aria-hidden="true" className="absolute inset-0 overflow-hidden">
      {slides.map((slide, i) => (
        <picture key={`${i}-${slide.imageUrl}`}>
          {slide.mobileUrl ? <source media="(max-width: 639px)" srcSet={slide.mobileUrl} /> : null}
          <img
            src={slide.imageUrl}
            alt=""
            width={1200}
            height={400}
            loading={i === 0 ? "eager" : "lazy"}
            decoding="async"
            className="absolute inset-0 size-full object-cover transition-opacity duration-1000 ease-out motion-reduce:transition-none"
            style={{ opacity: i === (reduced ? 0 : index) ? 1 : 0 }}
          />
        </picture>
      ))}
    </div>
  );
}
