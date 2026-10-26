import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Tombol aksi utama bergaya kaca.
 *
 * Alasan desain (satu baris per keputusan):
 * - Kaca tipis, bukan glassmorphism penuh: hanya satu elemen di halaman yang
 *   memakai efek ini, yaitu aksi utama, sehingga perhatian tetap fokus.
 * - Warna mengikuti token brand (accent), bukan gradien biru-ungu default,
 *   supaya halaman auth terasa bagian dari Ebrystore.
 * - Kilau bergerak sekali saat hover, bukan animasi berulang, karena motion
 *   harus mengarahkan perhatian ke momen, bukan berjalan terus.
 * - Struktur tetap <button> asli sehingga bisa submit form, fokus keyboard,
 *   dan dinonaktifkan saat proses berjalan.
 */
export const GlassActionButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    /** Ikon atau elemen kecil di sisi kiri label. */
    leading?: ReactNode;
    /** Ikon atau elemen kecil di sisi kanan label. */
    trailing?: ReactNode;
  }
>(function GlassActionButton({ className, children, leading, trailing, ...props }, ref) {
  return (
    <button
      ref={ref}
      {...props}
      className={cn(
        "group relative isolate inline-flex min-h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-5",
        "border border-accent/40 bg-accent text-sm font-semibold text-accent-foreground",
        "shadow-[0_1px_0_0_oklch(1_0_0/0.25)_inset,0_8px_24px_-8px_oklch(0.52_0.098_195/45%)]",
        "transition-[transform,box-shadow,background-color] duration-200 ease-out",
        "hover:-translate-y-px hover:bg-accent/95 hover:shadow-[0_1px_0_0_oklch(1_0_0/0.3)_inset,0_12px_28px_-8px_oklch(0.52_0.098_195/55%)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        "active:translate-y-0 active:shadow-[0_1px_0_0_oklch(1_0_0/0.2)_inset,0_4px_12px_-6px_oklch(0.52_0.098_195/50%)]",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
        "motion-reduce:transition-colors motion-reduce:hover:translate-y-0",
        className,
      )}
    >
      {/* Kilau kaca: satu sapuan saat hover, bukan loop. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 translate-x-[-120%] bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[120%] motion-reduce:hidden"
      />
      {/* Garis cahaya tipis di tepi atas, menandai permukaan kaca. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
      />
      {leading}
      {children}
      {trailing}
    </button>
  );
});
