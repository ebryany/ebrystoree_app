import { useEffect, useState } from "react";

/**
 * Apakah halaman sudah digulir melewati ambang tertentu.
 *
 * - `passive: true`: listener tidak memblokir gulir di perangkat sentuh.
 * - Dibaca maksimal sekali per frame (rAF), bukan setiap event scroll.
 * - Histeresis: aktif setelah `threshold`, baru nonaktif di bawah `threshold / 3`.
 *   Tanpa ini, posisi gulir yang berhenti tepat di sekitar ambang (atau momentum
 *   iOS) membuat state bolak-balik dan header berkedip.
 */
export function useScrolled(threshold = 24): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;
    let current = false;
    const read = () => {
      frame = 0;
      const y = window.scrollY;
      const next = current ? y > threshold / 3 : y > threshold;
      if (next !== current) {
        current = next;
        setScrolled(next);
      }
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return scrolled;
}
