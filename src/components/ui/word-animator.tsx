import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Kata yang berganti di dalam judul.
 *
 * Ruang untuk kata terpanjang disediakan lebih dulu supaya judul di sekitarnya
 * tidak bergeser saat kata berganti. Saat `prefers-reduced-motion`, kata pertama
 * ditampilkan tetap tanpa animasi.
 */
export function WordAnimator({
  words,
  duration = 3,
  className,
}: {
  words: string[];
  /** Lama tiap kata ditampilkan, dalam detik. */
  duration?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced || words.length < 2) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % words.length),
      Math.max(1, duration) * 1000,
    );
    return () => window.clearInterval(timer);
  }, [reduced, words.length, duration]);

  if (!words.length) return null;

  // Lebar mengikuti kata terpanjang supaya tata letak tidak melompat.
  const longest = words.reduce((a, b) => (a.length >= b.length ? a : b), "");

  return (
    <span className={cn("relative inline-grid overflow-hidden align-bottom", className)}>
      {/* Cadangan tak terlihat: menahan lebar dan tinggi untuk kata terpanjang. */}
      <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-pre">
        {longest}
      </span>
      <span className="sr-only">{words.join(", ")}</span>
      <span
        key={reduced ? "static" : words[index]}
        aria-hidden="true"
        className={cn(
          "col-start-1 row-start-1 whitespace-pre",
          !reduced && "animate-[word-in_360ms_ease-out]",
        )}
      >
        {reduced ? words[0] : words[index]}
      </span>
    </span>
  );
}
