import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { PRESENCE_HEARTBEAT_MS } from "@/lib/store-presence";

/**
 * Selama tab terlihat dan user login sebagai pemilik toko aktif, kirim heartbeat
 * supaya tokonya tampil "Online". Akun tanpa toko berhenti setelah satu panggilan.
 */
export function useStorePresenceHeartbeat() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let disabled = false;
    let cancelled = false;

    const beat = async () => {
      if (disabled || cancelled || document.visibilityState !== "visible") return;
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;
      const { data, error } = await (supabase as any).rpc("touch_store_presence");
      if (!error && data == null) {
        disabled = true;
        stop();
      }
    };
    const start = () => {
      if (timer || disabled) return;
      void beat();
      timer = setInterval(() => void beat(), PRESENCE_HEARTBEAT_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        disabled = false;
        stop();
        start();
      } else if (event === "SIGNED_OUT") {
        stop();
      }
    });

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      sub.subscription.unsubscribe();
    };
  }, []);
}
