"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CreditCard, PackageCheck } from "lucide-react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Cara memesan: stacking cards yang digerakkan scroll (inspirasi pola
 * "stacking cards" Olivier Larose / ui-layouts), diadaptasi ke TanStack Start
 * dan identitas Ebrystore, dan aktif di SEMUA ukuran layar termasuk Android.
 *
 * Perbedaan dengan referensi, dan alasannya:
 * - Tanpa ReactLenis. Efek stacking hanya butuh sticky + useScroll +
 *   useTransform; Lenis mengubah scroll global seluruh situs dan menambah
 *   risiko pada sticky, scroll restoration, dan halaman checkout — tidak
 *   sepadan untuk tiga kartu.
 * - Tanpa warna pelangi per kartu: kartu tetap bg-card di atas kawasan grid
 *   homepage, aksen ink-teal hanya pada ikon, nomor, dan progres.
 * - Wrapper setinggi viewport dikurangi tinggi header nyata, sehingga kartu
 *   menempel tepat di bawah navbar dan tidak tertutup.
 * - prefers-reduced-motion: seluruh efek dilepas dan tahap tampil sebagai
 *   grid statis yang sama mudah dibacanya.
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
  const reduced = useReducedMotion();
  // Sebelum mount (SSR dan frame pertama di browser) penggunaan media query
  // belum diketahui — `useReducedMotion` mengembalikan null. Selama itu,
  // render varian statis: HTML server tidak pernah berisi track yang butuh
  // JavaScript untuk terbaca, dan hidrasi tidak berubah struktur. Varian
  // tumpukan dipasang setelah mount apabila pengguna tidak memilih
  // reduced motion.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <section id="cara-kerja" aria-label="Cara memesan di Ebrystore" className="relative">
      {/* Tanpa background sendiri: section ini berada di dalam kawasan grid
          kontinu yang didefinisikan sekali di homepage (lihat index.tsx). */}
      {mounted && !reduced ? <StoryStack /> : <StaticGrid />}
    </section>
  );
}

function StoryHeading() {
  return (
    <div className="mx-auto mb-2 w-full max-w-6xl px-4 text-center sm:px-6">
      <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Cara memesan
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
        Tiga langkah dari pesanan dibuat sampai produk sampai ke tanganmu.
      </p>
    </div>
  );
}

/** Isi satu kartu tahap — dipakai varian grid dan varian tumpukan. */
function PanelCard({ panel, index }: { panel: (typeof PANELS)[number]; index: number }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-2 font-mono text-6xl font-bold leading-none tabular-nums text-accent/15"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface-selected text-accent">
          <panel.icon className="size-4" aria-hidden="true" />
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {panel.step} dari {PANELS.length}
        </span>
      </div>
      <h3 className="mt-3 max-w-[30ch] text-base font-bold leading-snug text-foreground sm:text-lg">
        {panel.title}
      </h3>
      <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
        {panel.body}
      </p>
    </>
  );
}

/** Grid statis: fallback reduced motion saja — mudah dibaca, tanpa gerak. */
function StaticGrid() {
  return (
    <div className="mx-auto w-full px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <StoryHeading />
      <ol className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
        {PANELS.map((panel, index) => (
          <li key={panel.step} className="relative bg-card p-5 sm:p-6">
            <PanelCard panel={panel} index={index} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Progres mini di kaki kartu — nilai bar mengikuti progres section. */
function CardProgress({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className="mt-6 flex items-center gap-3" aria-hidden="true">
      <div className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-border">
        <motion.div
          style={{ scaleX: progress }}
          className="size-full origin-left rounded-full bg-accent"
        />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
        {PANELS.length} tahap
      </span>
    </div>
  );
}

/**
 * Varian tumpukan (desktop + Android): setiap kartu menempel di bawah header
 * dan tertumpuk oleh kartu berikutnya; kartu di bawah menyusut sedikit
 * (scale) supaya urutan tumpukan terasa. Heading berada di luar area terukur
 * supaya progres 0 tepat saat kartu pertama menempel.
 */
function StoryStack() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const step = Math.min(PANELS.length - 1, Math.max(0, Math.floor(value * PANELS.length)));
    setActiveStep((prev) => (prev === step ? prev : step));
  });

  return (
    <>
      <StoryHeading />
      <div ref={sectionRef} className="relative">
        {PANELS.map((panel, index) => (
          <StackCard
            key={panel.step}
            panel={panel}
            index={index}
            total={PANELS.length}
            progress={scrollYProgress}
            active={activeStep === index}
          />
        ))}
      </div>
    </>
  );
}

function StackCard({
  panel,
  index,
  total,
  progress,
  active,
}: {
  panel: (typeof PANELS)[number];
  index: number;
  total: number;
  progress: MotionValue<number>;
  active: boolean;
}) {
  // Kartu menyusut bertahap seiring kartu berikutnya menutupinya.
  const targetScale = 1 - (total - 1 - index) * 0.05;
  const scale = useTransform(progress, [index / total, 1], [1, targetScale]);

  return (
    <div className="sticky top-16 flex h-[calc(100svh-4rem)] items-center justify-center px-4 sm:px-6">
      <motion.article
        style={{ scale, top: index * 14 }}
        className={cn(
          "relative w-full max-w-[860px] origin-top rounded-2xl border bg-card p-5 shadow-card transition-colors duration-300 sm:p-7",
          active ? "border-accent/50" : "border-border",
        )}
      >
        <PanelCard panel={panel} index={index} />
        <CardProgress progress={progress} />
      </motion.article>
    </div>
  );
}
