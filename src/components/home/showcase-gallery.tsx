import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

import { useIsMobile } from "@/hooks/use-mobile";

export type ShowcaseItem = { src: string; alt: string };

/**
 * Delapan aset resmi platform dari Owner. Nama berkas memberi konteks alt text
 * sehingga deskripsi tetap jujur tanpa klaim tambahan.
 */
const ITEMS: ShowcaseItem[] = [
  {
    src: "/api/public/catalog-image/branding/home-gallery/01-opening-sesuatu-baru.png",
    alt: "Sesuatu yang baru dimulai",
  },
  {
    src: "/api/public/catalog-image/branding/home-gallery/02-belanja-digital-lebih-cepat.png",
    alt: "Belanja digital lebih cepat",
  },
  {
    src: "/api/public/catalog-image/branding/home-gallery/03-semua-kebutuhan-digital.png",
    alt: "Semua kebutuhan digital",
  },
  {
    src: "/api/public/catalog-image/branding/home-gallery/04-bantuan-tugas-terstruktur.png",
    alt: "Bantuan tugas terstruktur",
  },
  {
    src: "/api/public/catalog-image/branding/home-gallery/05-ai-premium-template.png",
    alt: "Template premium",
  },
  {
    src: "/api/public/catalog-image/branding/home-gallery/06-pantau-pesanan.png",
    alt: "Pantau pesanan",
  },
  {
    src: "/api/public/catalog-image/branding/home-gallery/07-rapi-cepat-terpercaya.png",
    alt: "Rapi, cepat, terpercaya",
  },
  {
    src: "/api/public/catalog-image/branding/home-gallery/08-semua-dalam-satu-akun.png",
    alt: "Semua dalam satu akun",
  },
];

/**
 * "Sekilas Ebrystore": galeri horizontal delapan aset platform.
 *
 * Keputusan desain dan alasannya:
 * - Isinya aset resmi platform (bucket catalog-images), bukan stok foto pihak
 *   ketiga; tidak ada angka atau klaim statistik di section ini.
 * - Di layar besar, track bergeser mengikuti scroll halaman (pola sticky +
 *   useScroll dari gist yang diminta). Travel section dihitung dari lebar
 *   track nyata, bukan angka tetap, supaya track berhenti tepat di ujung.
 * - Di layar kecil atau saat pengguna memilih gerak minimal, galeri memakai
 *   scroll horizontal native dengan snap: tanpa scroll-jack, tetap bisa
 *   digeser jari maupun keyboard.
 * - Gambar dimuat lazy agar halaman awal tetap ringan.
 */
export function ShowcaseGallery() {
  const isMobile = useIsMobile();
  const reduced = useReducedMotion();

  return (
    <section aria-labelledby="sekilas-ebrystore" className="pt-8 sm:pt-10">
      <div className="mb-4">
        <h2 id="sekilas-ebrystore" className="text-xl font-bold sm:text-2xl">
          Sekilas Ebrystore
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Delapan hal yang bisa kamu lakukan di sini.
        </p>
      </div>
      {isMobile || reduced ? <NativeTrack /> : <ScrollTrack />}
    </section>
  );
}

/** Varian layar kecil / gerak minimal: scroll horizontal native dengan snap. */
function NativeTrack() {
  return (
    <div
      role="region"
      aria-label="Galeri Sekilas Ebrystore"
      tabIndex={0}
      className="-mx-4 overflow-x-auto px-4 pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:-mx-6 sm:px-6 [scrollbar-width:thin]"
    >
      <ul className="flex w-max snap-x snap-mandatory gap-3">
        {ITEMS.map((item) => (
          <li key={item.src} className="w-[min(62vw,230px)] shrink-0 snap-start">
            <figure className="aspect-[9/16] overflow-hidden rounded-xl border border-border bg-card">
              <img
                src={item.src}
                alt={item.alt}
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tinggi header sticky (site-header min-h-16) — nilai cadangan bila belum terukur. */
const HEADER_OFFSET = 64;

/**
 * Varian layar besar: track digeser mengikuti progres scroll halaman.
 *
 * Geometri dihitung dari ukuran nyata, bukan angka tetap:
 * - `shift` = lebar track dikurangi lebar band (jarak yang benar-benar perlu digeser).
 * - Section ditinggikan tepat `shift` sehingga pin dan pergeseran track 1:1:
 *   track mulai bergeser saat band menempel di bawah header, dan selesai tepat
 *   saat band akan lepas. Tidak ada ruang kosong di atas/bawah kartu.
 * - Offset atas mengikuti tinggi header nyata (header bisa lebih tinggi dari 4rem
 *   saat menu membungkus), diukur ulang saat ukuran berubah.
 */
function ScrollTrack() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const [geometry, setGeometry] = useState<{
    start: number;
    shift: number;
    height: number;
    top: number;
  } | null>(null);

  const { scrollY } = useScroll();
  const x = useTransform(
    scrollY,
    [geometry?.start ?? 0, geometry ? geometry.start + Math.max(1, geometry.shift) : 1],
    [0, geometry ? -geometry.shift : 0],
  );

  useEffect(() => {
    const measure = () => {
      const section = sectionRef.current;
      const band = bandRef.current;
      const track = trackRef.current;
      if (!section || !band || !track) return;
      const header = document.querySelector("header");
      const top = header ? Math.round(header.getBoundingClientRect().height) : HEADER_OFFSET;
      const shift = Math.max(0, track.scrollWidth - band.clientWidth);
      // PENTING: jangan ukur offsetTop/getBoundingClientRect elemen sticky —
      // nilainya ikut posisi scroll saat elemen menempel, sehingga pengukuran
      // berulang menambah tinggi tanpa henti (pernah membengkak sampai 1,1 juta px).
      // Tinggi = tinggi band (stabil) + jarak geser track.
      const sectionTop = section.getBoundingClientRect().top + window.scrollY;
      const next = {
        start: sectionTop - top,
        shift,
        height: band.offsetHeight + shift,
        top,
      };
      setGeometry((prev) =>
        prev &&
        prev.start === next.start &&
        prev.shift === next.shift &&
        prev.height === next.height &&
        prev.top === next.top
          ? prev
          : next,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div
      ref={sectionRef}
      className="relative"
      style={geometry ? { height: `${geometry.height}px` } : undefined}
    >
      <div
        ref={bandRef}
        className="sticky overflow-hidden"
        style={{ top: geometry?.top ?? HEADER_OFFSET }}
      >
        <motion.ul ref={trackRef} style={{ x }} className="flex w-max gap-4">
          {ITEMS.map((item) => (
            <li key={item.src} className="shrink-0">
              <figure className="aspect-[9/16] h-[min(58vh,520px)] overflow-hidden rounded-xl border border-border bg-card">
                <img
                  src={item.src}
                  alt={item.alt}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
              </figure>
            </li>
          ))}
        </motion.ul>
      </div>
    </div>
  );
}
