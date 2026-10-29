import { useRef, type ReactNode } from "react";
import { Link, type LinkProps } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

/**
 * Link bergaya "animated gradient button": latar gradien + sorotan radial yang
 * mengikuti kursor.
 *
 * Posisi kursor ditulis ke CSS variable lewat ref, bukan state React, supaya
 * gerakan mouse tidak memicu render ulang setiap piksel. Sorotan muncul saat
 * hover atau fokus keyboard (di tengah tombol), dan mati saat reduced motion.
 */
export function SpotlightLink({
  children,
  className,
  ...props
}: LinkProps & { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLAnchorElement>(null);

  function track(e: React.PointerEvent<HTMLAnchorElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  }

  return (
    <Link
      {...props}
      ref={ref}
      onPointerMove={track}
      onPointerEnter={track}
      className={cn(
        "group relative inline-flex items-center justify-center overflow-hidden rounded-md border-2 border-primary/30 bg-linear-to-r from-primary/75 to-primary px-6 font-semibold text-primary-foreground transition-colors [--spot-x:50%] [--spot-y:50%]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:hidden"
        style={{
          background:
            "radial-gradient(100px circle at var(--spot-x) var(--spot-y), color-mix(in oklch, var(--primary-foreground) 35%, transparent), transparent)",
        }}
      />
      <span className="relative z-10 inline-flex items-center gap-1.5">{children}</span>
    </Link>
  );
}
