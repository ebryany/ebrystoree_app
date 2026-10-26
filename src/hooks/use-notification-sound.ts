import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "ebry:notification-sound";

/** Sintesis nada lonceng lembut memakai Web Audio (tanpa file audio eksternal). */
function playChime() {
  const Ctor =
    (window as any).AudioContext ?? (window as any).webkitAudioContext ?? null;
  if (!Ctor) return;
  const ctx: AudioContext = new Ctor();
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(ctx.destination);
  master.gain.setValueAtTime(0.22, now);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);

  // Dua nada (E6 lalu B6) meniru "ding-dong" lonceng notifikasi.
  const notes: Array<[number, number]> = [
    [1318.51, 0],
    [1975.53, 0.14],
  ];

  for (const [freq, offset] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + offset);
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.9, now + offset + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 1.2);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now + offset);
    osc.stop(now + offset + 1.3);
  }

  window.setTimeout(() => void ctx.close().catch(() => {}), 2000);
}

/** Preferensi + pemutar suara notifikasi (tersimpan di perangkat pengguna). */
export function useNotificationSound() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    try {
      setEnabled(window.localStorage.getItem(STORAGE_KEY) !== "off");
    } catch {
      /* abaikan */
    }
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
      } catch {
        /* abaikan */
      }
      if (next) {
        try {
          playChime();
        } catch {
          /* abaikan */
        }
      }
      return next;
    });
  }, []);

  const play = useCallback(() => {
    if (!enabled) return;
    if (typeof document !== "undefined" && document.hidden === false) {
      // tetap bunyikan; sekadar penjelas bahwa suara juga jalan saat tab aktif
    }
    try {
      playChime();
    } catch {
      /* abaikan */
    }
  }, [enabled]);

  return { enabled, toggle, play };
}
