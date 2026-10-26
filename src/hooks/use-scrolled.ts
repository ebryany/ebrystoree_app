import { useEffect, useState } from "react";

/**
 * Apakah halaman sudah digulir melewati ambang tertentu.
 *
 * Dipakai header untuk mengecil saat pengguna mulai menggulir: header ramping
 * memberi ruang lebih banyak ke konten, sementara saat di puncak halaman header
 * tampil lega.
 *
 * Kenapa `passive: true`: listener gulir tidak memanggil `preventDefault`, dan
 * penanda itu memberi tahu browser bahwa gulir tidak akan diblokir sehingga
 * halaman tetap mulus di perangkat sentuh.
 *
 * Nilai diperbarui hanya saat melewati ambang, bukan setiap piksel: state React
 * yang berubah puluhan kali per detik membuat seluruh header dirender ulang dan
 * gulir terasa berat.
 */
export function useScrolled(threshold = 24): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const read = () => {
      const next = window.scrollY > threshold;
      setScrolled((current) => (current === next ? current : next));
    };
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, [threshold]);

  return scrolled;
}
