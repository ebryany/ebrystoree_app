import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export type PartnerActivity = "typing" | "recording" | null;

/**
 * Indikator "sedang mengetik" / "merekam suara" + status online lawan bicara,
 * lewat satu channel Supabase per thread (broadcast untuk aktivitas, presence untuk online).
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
  const [partnerActivity, setPartnerActivity] = useState<PartnerActivity>(null);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const clearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef(0);

  useEffect(() => {
    setPartnerActivity(null);
    setPartnerOnline(false);
    if (!enabled || !channel || !selfId) return;
    const ch = supabase.channel(`chat-typing:${channel}`, {
      config: { broadcast: { self: false }, presence: { key: selfId } },
    });
    channelRef.current = ch;

    ch.on("broadcast" as any, { event: "typing" } as any, (payload: any) => {
      const from = payload?.payload?.userId as string | undefined;
      if (!from || from === selfId) return;
      const activity: PartnerActivity =
        payload?.payload?.activity === "recording"
          ? "recording"
          : payload?.payload?.activity === "idle"
            ? null
            : "typing";
      setPartnerActivity(activity);
      if (clearRef.current) clearTimeout(clearRef.current);
      if (activity) {
        clearRef.current = setTimeout(() => setPartnerActivity(null), visibleMs);
      }
    });

    ch.on("presence" as any, { event: "sync" } as any, () => {
      const others = Object.keys(ch.presenceState()).filter((key) => key !== selfId);
      setPartnerOnline(others.length > 0);
      if (!others.length) setPartnerActivity(null);
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
      setPartnerActivity(null);
      setPartnerOnline(false);
      supabase.removeChannel(ch);
    };
  }, [channel, enabled, selfId, visibleMs]);

  const sendActivity = useCallback(
    (activity: "typing" | "recording" | "idle", force = false) => {
      const ch = channelRef.current;
      if (!ch) return;
      const now = Date.now();
      if (!force && now - lastSentRef.current < throttleMs) return;
      lastSentRef.current = now;
      void ch.send({ type: "broadcast", event: "typing", payload: { userId: selfId, activity } });
    },
    [selfId, throttleMs],
  );

  const sendTyping = useCallback(() => sendActivity("typing"), [sendActivity]);
  const sendRecording = useCallback(
    (active = true) => sendActivity(active ? "recording" : "idle", !active),
    [sendActivity],
  );

  return {
    partnerTyping: partnerActivity === "typing",
    partnerRecording: partnerActivity === "recording",
    partnerActivity,
    partnerOnline,
    sendTyping,
    sendRecording,
  };
}
