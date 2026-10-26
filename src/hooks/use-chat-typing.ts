import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

/**
 * Indikator "sedang mengetik" lewat broadcast channel Supabase per thread.
 * Tidak ada data persist: event hilang begitu koneksi putus, channel dibersihkan
 * saat unmount, dan event sendiri diabaikan (broadcast.self = false).
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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const clearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!enabled || !channel) return;
    const ch = supabase.channel(`chat-typing:${channel}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = ch;
    ch.on("broadcast" as any, { event: "typing" } as any, (payload: any) => {
      const from = payload?.payload?.userId as string | undefined;
      if (!from || from === selfId) return;
      setPartnerTyping(true);
      if (clearRef.current) clearTimeout(clearRef.current);
      clearRef.current = setTimeout(() => setPartnerTyping(false), visibleMs);
    });
    ch.subscribe();
    return () => {
      if (clearRef.current) clearTimeout(clearRef.current);
      channelRef.current = null;
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

  return { partnerTyping, sendTyping };
}
