import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Garis progress tipis di atas layar selama perpindahan halaman. Muncul setelah
 * 120 ms, jadi navigasi yang instan tidak berkedip.
 */
export function NavProgress() {
  const loading = useRouterState({ select: (s) => s.status === "pending" });
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");

  useEffect(() => {
    if (loading) {
      const t = window.setTimeout(() => setPhase("loading"), 120);
      return () => window.clearTimeout(t);
    }
    setPhase((p) => (p === "loading" ? "done" : "idle"));
    const t = window.setTimeout(() => setPhase("idle"), 300);
    return () => window.clearTimeout(t);
  }, [loading]);

  if (phase === "idle") return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden"
    >
      <div
        className={
          phase === "loading"
            ? "h-full w-[80%] origin-left animate-[nav-progress_2.5s_ease-out] bg-primary motion-reduce:animate-none"
            : "h-full w-full bg-primary opacity-0 transition-opacity duration-300"
        }
      />
    </div>
  );
}
