import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

/**
 * Indikator "sedang mengetik" + status online lawan bicara, lewat satu channel
 * Supabase per thread (broadcast untuk typing, presence untuk online).
 *
 * - Tidak ada data persist: hilang begitu koneksi putus, channel dibersihkan
 *   saat unmount, dan event sendiri diabaikan.
 * - "Online" = lawan bicara sedang membuka thread ini di tab yang terlihat.
 *   Saat tab disembunyikan, presence dilepas supaya status tidak menipu.
 */
export function useChatTyping({
  channel,
  selfId,
  enabled = true,
  throttleMs = 2000,
  visibleMs = 3000,
}: {
  channel: string;
  selfId: string | null | undefined;
  enabled?: boolean;
  throttleMs?: number;
  visibleMs?: number;
}) {
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const clearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!enabled || !channel || !selfId) return;
    const ch = supabase.channel(`chat-typing:${channel}`, {
      config: { broadcast: { self: false }, presence: { key: selfId } },
    });
    channelRef.current = ch;

    ch.on("broadcast" as any, { event: "typing" } as any, (payload: any) => {
      const from = payload?.payload?.userId as string | undefined;
      if (!from || from === selfId) return;
      setPartnerTyping(true);
      if (clearRef.current) clearTimeout(clearRef.current);
      clearRef.current = setTimeout(() => setPartnerTyping(false), visibleMs);
    });

    ch.on("presence" as any, { event: "sync" } as any, () => {
      const others = Object.keys(ch.presenceState()).filter((key) => key !== selfId);
      setPartnerOnline(others.length > 0);
      if (!others.length) setPartnerTyping(false);
    });

    const track = () => {
      if (document.visibilityState === "visible") void ch.track({ at: Date.now() });
      else void ch.untrack();
    };

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") track();
    });
    document.addEventListener("visibilitychange", track);

    return () => {
      document.removeEventListener("visibilitychange", track);
      if (clearRef.current) clearTimeout(clearRef.current);
      channelRef.current = null;
      setPartnerOnline(false);
      supabase.removeChannel(ch);
    };
  }, [channel, enabled, selfId, visibleMs]);

  const sendTyping = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const now = Date.now();
    if (now - lastSentRef.current < throttleMs) return;
    lastSentRef.current = now;
    void ch.send({ type: "broadcast", event: "typing", payload: { userId: selfId } });
  }, [selfId, throttleMs]);

  return { partnerTyping, partnerOnline, sendTyping };
}
