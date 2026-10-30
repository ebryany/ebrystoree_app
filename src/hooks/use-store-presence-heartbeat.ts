import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_HIDDEN_GRACE_MS,
  PRESENCE_IDLE_MS,
} from "@/lib/store-presence";

const CHANNEL = "ebry-store-presence";
/** Dikirim saat tab ini mulai tercatat online; status di halaman ikut disegarkan. */
export const PRESENCE_BEAT_EVENT = "ebry:presence-beat";
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"] as const;

/**
 * Status online pemilik toko:
 * - heartbeat tiap 60 dtk selama tab terlihat DAN ada aktivitas dalam 10 menit terakhir;
 * - tab tersembunyi > 2 menit, diam > 10 menit, tab ditutup, atau logout => pamit offline
 *   (catat "terakhir aktif") tanpa menunggu heartbeat kedaluwarsa;
 * - beberapa tab: tab yang pamit memberi tahu tab lain lewat BroadcastChannel, tab yang
 *   masih aktif langsung mengirim heartbeat lagi sehingga status tidak berkedip offline.
 * Akun tanpa toko berhenti setelah satu panggilan.
 */
export function useStorePresenceHeartbeat() {
  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

    let timer: ReturnType<typeof setInterval> | null = null;
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    let token: string | null = null;
    let isSeller: boolean | null = null; // null = belum diketahui
    let online = false;
    let lastActivity = Date.now();
    let cancelled = false;

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;

    const isActiveHere = () =>
      document.visibilityState === "visible" && Date.now() - lastActivity < PRESENCE_IDLE_MS;

    const beat = async () => {
      if (cancelled || isSeller === false || !isActiveHere()) return;
      const { data: s } = await supabase.auth.getSession();
      token = s.session?.access_token ?? null;
      if (!token) return;
      const { data, error } = await (supabase as any).rpc("touch_store_presence");
      if (error) return;
      if (data == null) {
        isSeller = false;
        stopTimer();
        return;
      }
      isSeller = true;
      const wasOnline = online;
      online = true;
      if (!wasOnline) window.dispatchEvent(new Event(PRESENCE_BEAT_EVENT));
    };

    /** Pamit offline. keepalive supaya tetap terkirim saat tab ditutup. */
    const leave = (notifyOthers = true) => {
      if (!online || !token || !url || !apiKey) return;
      online = false;
      try {
        void fetch(`${url}/rest/v1/rpc/leave_store_presence`, {
          method: "POST",
          keepalive: true,
          headers: {
            apikey: apiKey,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        }).catch(() => undefined);
      } catch {
        // Gagal pamit: status tetap kedaluwarsa sendiri setelah 3 menit.
      }
      if (notifyOthers) channel?.postMessage("left");
    };

    const startTimer = () => {
      if (timer || isSeller === false) return;
      void beat();
      timer = setInterval(() => {
        if (isActiveHere()) void beat();
        else leave();
      }, PRESENCE_HEARTBEAT_MS);
    };
    function stopTimer() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    const onActivity = () => {
      const wasIdle = Date.now() - lastActivity >= PRESENCE_IDLE_MS;
      lastActivity = Date.now();
      if (wasIdle && document.visibilityState === "visible") {
        stopTimer();
        startTimer();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (hiddenTimer) clearTimeout(hiddenTimer);
        hiddenTimer = null;
        lastActivity = Date.now();
        startTimer();
      } else {
        stopTimer();
        hiddenTimer = setTimeout(() => leave(), PRESENCE_HIDDEN_GRACE_MS);
      }
    };

    const onPageHide = () => leave();

    channel?.addEventListener("message", (e) => {
      // Tab lain pamit; bila tab ini masih dipakai, segarkan status online.
      if (e.data === "left" && isActiveHere() && isSeller !== false) void beat();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        leave();
        stopTimer();
        token = null;
        isSeller = null;
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        token = session?.access_token ?? token;
        if (event === "SIGNED_IN" && isSeller === null) {
          stopTimer();
          if (document.visibilityState === "visible") startTimer();
        }
      }
    });

    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    if (document.visibilityState === "visible") startTimer();

    return () => {
      cancelled = true;
      stopTimer();
      if (hiddenTimer) clearTimeout(hiddenTimer);
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      channel?.close();
      sub.subscription.unsubscribe();
    };
  }, []);
}
