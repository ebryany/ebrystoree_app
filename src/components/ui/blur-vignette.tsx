import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Blur vignette: tepi konten diburamkan, bagian tengah tetap tajam.
 *
 * API mengikuti registry ui-layouts (`radius`, `inset`, `transitionLength`,
 * `blur`), tapi tanpa border/garis sudut: hanya satu lapisan `backdrop-blur`
 * yang di-mask. Mask = gradien horizontal + vertikal (digabung `add`), jadi
 * lapisan blur hanya terlihat di pita tepi selebar `inset`, lalu memudar
 * sepanjang `transitionLength` ke arah tengah.
 */
export function BlurVignette({
  children,
  className,
  radius = "24px",
  inset = "10px",
  transitionLength = "100px",
  blur = "15px",
  enabled = true,
}: {
  children: ReactNode;
  className?: string;
  radius?: string;
  inset?: string;
  transitionLength?: string;
  blur?: string;
  /** Matikan lapisan blur (mis. di breakpoint tertentu via `className`). */
  enabled?: boolean;
}) {
  const edge = (dir: string) =>
    `linear-gradient(${dir}, #000 ${inset}, transparent calc(${inset} + ${transitionLength}), transparent calc(100% - ${inset} - ${transitionLength}), #000 calc(100% - ${inset}))`;
  const mask = `${edge("to right")}, ${edge("to bottom")}`;
  const layer: CSSProperties = {
    borderRadius: radius,
    backdropFilter: `blur(${blur})`,
    WebkitBackdropFilter: `blur(${blur})`,
    maskImage: mask,
    WebkitMaskImage: mask,
  };

  return (
    <div className={cn("relative isolate", className)} style={{ borderRadius: radius }}>
      {children}
      {enabled ? (
        <div
          aria-hidden="true"
          data-blur-vignette=""
          className="pointer-events-none absolute inset-0 z-10"
          style={layer}
        />
      ) : null}
    </div>
  );
}

/** Wadah konten di atas lapisan blur (tetap tajam & bisa diklik). */
export function BlurVignetteArticle({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return <div className={cn("relative z-20", className)}>{children}</div>;
}
