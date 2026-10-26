"use client";

import { useRef, type MouseEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Efek spotlight yang mengikuti kursor di atas kartu.
 *
 * Diadaptasi dari registry ui-layouts (`spotlight`), ditulis ulang untuk
 * Ebrystore. Keputusan dan alasannya:
 * - Sumbernya memasang listener `window` mousemove untuk SETIAP kartu; di sini
 *   pelacakan dibatasi pada kartu yang sedang di-hover supaya belasan kartu
 *   katalog tidak semuanya bereaksi terhadap setiap gerakan kursor.
 * - Posisi kursor ditulis sebagai CSS variable langsung ke node (tanpa
 *   setState), jadi tidak ada re-render React di setiap gerakan.
 * - Warna memakai aksen ink-teal dengan opasitas rendah; versi aslinya memakai
 *   putih yang tidak terlihat di kartu terang seperti tema Ebrystore.
 * - Efek murni dekoratif: `pointer-events-none`, tidak muncul di perangkat
 *   sentuh (mousemove tidak terpicu), dan dimatikan saat `prefers-reduced-motion`.
 */

export function Spotlight({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("relative", className)}>{children}</div>;
}

export function SpotLightItem({
  children,
  className,
  radiusClass = "rounded-lg",
}: {
  children: ReactNode;
  className?: string;
  /** Radius wrapper; samakan dengan radius kartu agar cahaya tidak bocor di sudut. */
  radiusClass?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--spotlight-x", `${event.clientX - rect.left}px`);
    node.style.setProperty("--spotlight-y", `${event.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      className={cn("group/spotlight relative", radiusClass, className)}
    >
      {children}
      {/* Cahaya lembut mengikuti kursor; hanya tampil saat kartu di-hover. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-200 group-hover/spotlight:opacity-100 motion-reduce:hidden"
        style={{
          borderRadius: "inherit",
          background:
            "radial-gradient(220px circle at var(--spotlight-x, 50%) var(--spotlight-y, 50%), oklch(0.52 0.098 195 / 14%), transparent 70%)",
        }}
      />
    </div>
  );
}
