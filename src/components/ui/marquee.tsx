"use client";

import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Marquee berjalan terus (CSS keyframes, tanpa JS animasi).
 *
 * Diadaptasi dari registry ui-layouts (`marquee`), ditulis ulang untuk
 * Ebrystore. Keputusan dan alasannya:
 * - `[key: string]: any` dari sumber diganti properti yang jelas; komponen ini
 *   dipakai di beberapa tempat dengan konfigurasi berbeda.
 * - Durasi dan jarak antar item lewat CSS variable supaya bisa diatur pemanggil
 *   tanpa menambah prop baru.
 * - Animasi dimatikan saat `prefers-reduced-motion`: daftar tetap tampil
 *   sebagai deretan kartu yang bisa digulir, bukan gerakan tanpa henti.
 */

export function Marquee({
  children,
  className,
  reverse = false,
  pauseOnHover = false,
  vertical = false,
  repeat = 4,
  durationSeconds = 40,
  gap = "1rem",
  style,
}: {
  children: ReactNode;
  className?: string;
  reverse?: boolean;
  pauseOnHover?: boolean;
  vertical?: boolean;
  repeat?: number;
  /** Durasi satu putaran penuh, dalam detik. */
  durationSeconds?: number;
  /** Jarak antar item; nilai CSS apa pun (mis. `"1.25rem"`). */
  gap?: string;
  style?: CSSProperties;
}) {
  const track = cn("flex shrink-0 justify-around gap-(--marquee-gap)", {
    "animate-marquee flex-row": !vertical && !reverse,
    "animate-marquee-vertical flex-col": vertical && !reverse,
    "animate-marquee-reverse flex-row": !vertical && reverse,
    "animate-marquee-vertical-reverse flex-col": vertical && reverse,
    "group-hover:[animation-play-state:paused]": pauseOnHover,
    "motion-reduce:animate-none": true,
  });

  return (
    <div
      className={cn(
        "group flex overflow-hidden [--marquee-duration:40s] [--marquee-gap:1rem] gap-(--marquee-gap)",
        vertical ? "flex-col" : "flex-row",
        className,
      )}
      style={
        {
          "--marquee-duration": `${durationSeconds}s`,
          "--marquee-gap": gap,
          ...style,
        } as CSSProperties
      }
    >
      {Array.from({ length: repeat }).map((_, index) => (
        <div key={index} className={track}>
          {children}
        </div>
      ))}
    </div>
  );
}
