import type { CSSProperties, ReactNode } from "react";
import { Slot, Slottable } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

/**
 * Tombol dengan kilau berjalan di belakang permukaan.
 *
 * Cara kerjanya: pembungkus membulat dengan `overflow: hidden`, di dalamnya ada
 * lapisan conic-gradient yang berputar terus, dan permukaan tombol yang solid
 * menutupinya. Yang terlihat hanya tepi kilau yang lewat.
 *
 * Menghormati `prefers-reduced-motion`: putarannya berhenti, tombol tetap utuh
 * dan bisa dipakai.
 */
export function ShimmerButton({
  children,
  asChild = false,
  className,
  background = "#334cec",
  shimmerColor = "#ffffff",
  shimmerSize = "0.05em",
  borderRadius = "100px",
  shimmerDuration = "3s",
}: {
  children: ReactNode;
  asChild?: boolean;
  className?: string;
  background?: string;
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
}) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      type={asChild ? undefined : "button"}
      style={
        {
          "--spread": "90deg",
          "--shimmer-color": shimmerColor,
          "--radius": borderRadius,
          "--speed": shimmerDuration,
          "--cut": shimmerSize,
          "--bg": background,
        } as CSSProperties
      }
      className={cn(
        "group relative z-0 flex cursor-pointer items-center justify-center overflow-hidden whitespace-nowrap px-6 py-3 text-white [border-radius:var(--radius)] [background:var(--bg)]",
        "transform-gpu transition-transform duration-300 ease-in-out active:translate-y-px",
        className,
      )}
    >
      {/* Lapisan kilau berputar. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-0 -z-30 overflow-visible blur-[2px] motion-reduce:hidden",
          "[container-type:size]",
        )}
      >
        <span
          className="absolute inset-0 h-[100cqh] animate-shimmer-slide [aspect-ratio:1] [border-radius:0] [mask:none]"
          style={{
            background:
              "conic-gradient(from calc(270deg - (var(--spread) * 0.5)), transparent 0, var(--shimmer-color) var(--spread), transparent var(--spread))",
            animationDuration: shimmerDuration,
          }}
        />
        <span
          className="absolute -inset-full h-full w-1/2 z-5 block transform-none opacity-100 [border-radius:var(--radius)] [mask:none]"
          style={{
            background:
              "conic-gradient(from calc(270deg - (var(--spread) * 0.5)), transparent 0, var(--shimmer-color) var(--spread), transparent var(--spread))",
            animationDuration: shimmerDuration,
          }}
        />
      </span>
      {/* Tepi tipis yang menyala. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-20 [border-radius:var(--radius)] [box-shadow:0_0_0_1px_var(--shimmer-color)_inset]"
      />
      {asChild ? (
        <span
          aria-hidden="true"
          className="absolute inset-[var(--cut)] -z-10 [border-radius:var(--radius)] [background:var(--bg)]"
        />
      ) : null}
      <Slottable>{children}</Slottable>
    </Comp>
  );
}
