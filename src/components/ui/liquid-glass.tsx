import { useId, useState, type ReactNode } from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Liquid glass card untuk Ebrystore.
 *
 * Diadaptasi dari registry ui-layouts (`liquid-glass`), tapi ditulis ulang ke
 * token Ebrystore. Keputusan dan alasannya:
 * - Sumbernya `@ts-nocheck`, `id` SVG global, dan penuh glow; di sini tipe
 *   ditulis eksplisit, `id` filter dibuat unik per instance (useId) supaya
 *   beberapa kartu di satu halaman tidak saling menimpa filter.
 * - Glow dibatasi `none`/`xs`/`sm` sesuai DESIGN.md (low elevation, tanpa glow
 *   beranimasi). Default `none`: kartu terlihat kaca, bukan lampu.
 * - Tidak ada `whileHover` scale atau drag di halaman data: konten kartu saldo
 *   harus stabil saat dibaca, dan kartu yang bisa digeser akan mengganggu.
 *   Keduanya tetap tersedia sebagai prop untuk konteks dekoratif.
 * - Semua gerak dihilangkan saat pengguna memilih `prefers-reduced-motion`.
 */

export type GlassIntensity = "none" | "xs" | "sm" | "md" | "lg" | "xl";

const BLUR_CLASS: Record<"sm" | "md" | "lg" | "xl", string> = {
  sm: "backdrop-blur-sm backdrop-saturate-150",
  md: "backdrop-blur-md backdrop-saturate-150",
  lg: "backdrop-blur-lg backdrop-saturate-150",
  xl: "backdrop-blur-xl backdrop-saturate-150",
};

/** Kilau tepi dalam: garis cahaya yang menandai ketebalan kaca. */
const EDGE_STYLE: Record<GlassIntensity, string> = {
  none: "none",
  xs: "inset 1px 1px 1px 0 oklch(1 0 0 / 35%), inset -1px -1px 1px 0 oklch(1 0 0 / 20%)",
  sm: "inset 2px 2px 2px 0 oklch(1 0 0 / 45%), inset -2px -2px 2px 0 oklch(1 0 0 / 30%)",
  md: "inset 3px 3px 3px 0 oklch(1 0 0 / 55%), inset -3px -3px 3px 0 oklch(1 0 0 / 35%)",
  lg: "inset 4px 4px 4px 0 oklch(1 0 0 / 60%), inset -4px -4px 4px 0 oklch(1 0 0 / 40%)",
  xl: "inset 6px 6px 6px 0 oklch(1 0 0 / 65%), inset -6px -6px 6px 0 oklch(1 0 0 / 45%)",
};

const GLOW_STYLE: Record<GlassIntensity, string> = {
  none: "var(--elev-2)",
  xs: "0 4px 12px -4px oklch(0.22 0.03 205 / 12%), 0 0 16px -6px oklch(0.52 0.098 195 / 20%)",
  sm: "0 8px 24px -8px oklch(0.22 0.03 205 / 18%), 0 0 24px -6px oklch(0.52 0.098 195 / 30%)",
  md: "0 12px 32px -10px oklch(0.22 0.03 205 / 22%), 0 0 32px -8px oklch(0.52 0.098 195 / 35%)",
  lg: "0 16px 40px -12px oklch(0.22 0.03 205 / 25%), 0 0 40px -10px oklch(0.52 0.098 195 / 40%)",
  xl: "0 20px 48px -14px oklch(0.22 0.03 205 / 30%), 0 0 48px -12px oklch(0.52 0.098 195 / 45%)",
};

export type LiquidGlassCardProps = {
  children: ReactNode;
  className?: string;
  /** Tingkat kilau tepi dalam (garis cahaya kaca). Nama mengikuti registry sumber. */
  shadowIntensity?: GlassIntensity;
  /** Tingkat glow luar. Default `none` mengikuti DESIGN.md. */
  glowIntensity?: GlassIntensity;
  /** Kekuatan blur latar. Default `md`. */
  blurIntensity?: "sm" | "md" | "lg" | "xl";
  /** Radius sudut, mis. `"1rem"` atau `"12px"`. Default token kartu. */
  borderRadius?: string;
  /**
   * Aktifkan drag (dekoratif). Default false; jangan dipakai di halaman data
   * karena mengganggu pembacaan dan menyulitkan pengguna keyboard.
   */
  draggable?: boolean;
};

export function LiquidGlassCard({
  children,
  className,
  shadowIntensity = "none",
  glowIntensity = "none",
  blurIntensity = "md",
  borderRadius = "var(--radius-card)",
  draggable = false,
}: LiquidGlassCardProps) {
  const filterId = useId().replace(/:/g, "");
  const [dragging, setDragging] = useState(false);

  return (
    <>
      {/* Filter distorsi kaca. Id unik per instance supaya tidak bentrok. */}
      <svg className="hidden" aria-hidden="true">
        <defs>
          <filter
            id={filterId}
            x="0"
            y="0"
            width="100%"
            height="100%"
            filterUnits="objectBoundingBox"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.004 0.008"
              numOctaves="1"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="24"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
      <motion.div
        drag={draggable}
        dragConstraints={draggable ? { left: 0, right: 0, top: 0, bottom: 0 } : undefined}
        dragElastic={draggable ? 0.2 : undefined}
        onDragStart={() => setDragging(true)}
        onDragEnd={() => setDragging(false)}
        className={cn(
          "relative isolate overflow-hidden border border-white/40",
          "bg-card/35 text-card-foreground",
          "motion-reduce:transition-none",
          draggable && "cursor-grab active:cursor-grabbing",
          dragging && "cursor-grabbing",
          className,
        )}
        // Shadow luar dipasang di elemen kartu itu sendiri, bukan lapisan dalam:
        // lapisan dalam akan terpotong oleh overflow-hidden milik kartu.
        style={{ borderRadius, boxShadow: GLOW_STYLE[glowIntensity] }}
      >
        {/* Lapisan kaca: blur + distorsi halus di belakang konten. */}
        <div
          aria-hidden="true"
          className={cn("absolute inset-0 z-0", BLUR_CLASS[blurIntensity])}
          style={{ borderRadius, filter: `url(#${filterId})` }}
        />
        {/* Lapisan tepi: garis cahaya tipis penanda permukaan kaca. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 z-20"
          style={{ borderRadius, boxShadow: EDGE_STYLE[shadowIntensity] }}
        />
        <div className="relative z-30">{children}</div>
      </motion.div>
    </>
  );
}
