import { useEffect, useId, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type RealtimeConnectionStatus = "subscribed" | "reconnecting" | "error";

type RealtimeEventPayload = {
  eventType: string;
  table?: string;
  new: Record<string, any> | null;
  old: Record<string, any> | null;
};

type Options = {
  /** Nama channel unik per layar. */
  channel: string;
  /** Tabel yang dipantau perubahannya. */
  tables: string[];
  /** Query key yang di-invalidate ketika ada perubahan. */
  keys: QueryKey[];
  /** Filter postgres opsional, mis. `order_id=eq.<uuid>`. */
  filter?: string;
  enabled?: boolean;
  /** Jeda penggabungan event beruntun (ms). */
  debounceMs?: number;
  /** Aksi tambahan per event (mis. suara bell); dipanggil di luar render. */
  onEvent?: (payload: RealtimeEventPayload) => void;
  onResync?: () => void;
  resyncOnJoin?: boolean;
};

/** Query key status koneksi realtime untuk sebuah channel nama layar. */
export function realtimeStatusKey(channel: string): QueryKey {
  return ["realtime-status", channel];
}

/** Peta status subscribe supabase-js ke status yang ditampilkan ke UI. */
export function mapRealtimeStatus(status: string): RealtimeConnectionStatus | null {
  if (status === "SUBSCRIBED") return "subscribed";
  if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") return "reconnecting";
  if (status === "CLOSED") return "error";
  return null;
}

/**
 * Berlangganan perubahan realtime lalu menyegarkan cache query terkait.
 * Status koneksi ditulis ke realtimeStatusKey(channel): subscribed saat aktif,
 * reconnecting saat supabase-js mencoba ulang, error saat channel ditutup.
 * Resync dijadwalkan saat subscribe berhasil, tab kembali visible, dan jaringan
 * kembali online. Channel dibersihkan saat unmount agar tidak ada kebocoran koneksi.
 */
export function useRealtimeRefresh({
  channel,
  tables,
  keys,
  filter,
  enabled = true,
  debounceMs = 300,
  onEvent,
  onResync,
  resyncOnJoin = false,
}: Options) {
  const queryClient = useQueryClient();
  const instanceId = useId();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventRef = useRef(onEvent);
  eventRef.current = onEvent;
  const resyncRef = useRef(onResync);
  resyncRef.current = onResync;
  const tableSig = tables.join(",");
  const keySig = JSON.stringify(keys);

  useEffect(() => {
    if (!enabled) return;
    let needsResync = false;
    let resyncPending = false;
    let hiddenAt: number | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;
    let channelSequence = 0;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    let connecting = false;
    const MIN_HIDDEN_RESYNC_MS = 30_000;

    const parsedKeys = JSON.parse(keySig) as QueryKey[];
    const flush = () => {
      timerRef.current = null;
      for (const key of parsedKeys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      if (resyncPending) {
        resyncPending = false;
        resyncRef.current?.();
      }
    };

    const schedule = (resync = false) => {
      resyncPending ||= resync;
      if (parsedKeys.length === 0 && (!resyncPending || !resyncRef.current)) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, debounceMs);
    };

    const connect = async () => {
      if (cancelled || ch || connecting) return;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      connecting = true;
      try {
        await supabase.realtime.setAuth();
        if (cancelled) return;
        const current = supabase.channel(`${channel}:${instanceId}:${channelSequence++}`);
        ch = current;
        for (const table of tableSig.split(",")) {
          current.on(
            "postgres_changes" as any,
            { event: "*", schema: "public", table, ...(filter ? { filter } : {}) } as any,
            (payload: RealtimeEventPayload) => {
              if (cancelled || ch !== current) return;
              eventRef.current?.({ ...payload, table: payload.table ?? table });
              schedule();
            },
          );
        }
        current.subscribe((status) => {
          if (cancelled || ch !== current) return;
          const mapped = mapRealtimeStatus(status);
          if (mapped) queryClient.setQueryData(realtimeStatusKey(channel), mapped);
          if (status === "CLOSED") {
            ch = null;
            needsResync = true;
            retryTimer = setTimeout(() => void connect(), retryDelay);
            retryDelay = Math.min(retryDelay * 2, 30_000);
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            needsResync = true;
          } else if (status === "SUBSCRIBED") {
            retryDelay = 1000;
            if (needsResync || resyncOnJoin) schedule(true);
            needsResync = false;
          }
        });
      } catch {
        if (ch) void supabase.removeChannel(ch);
        ch = null;
        if (!cancelled) queryClient.setQueryData(realtimeStatusKey(channel), "error");
      } finally {
        connecting = false;
      }
    };
    void connect();

    // Segarkan saat tab kembali aktif setelah tersembunyi cukup lama (≥30 dtk)
    // atau saat jaringan kembali online — hindari refetch berlebih saat pindah tab singkat.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (!ch) void connect();
        if (hiddenAt !== null && Date.now() - hiddenAt >= MIN_HIDDEN_RESYNC_MS) {
          schedule(true);
        }
        hiddenAt = null;
        return;
      }
      hiddenAt = Date.now();
    };
    const onOffline = () => {
      needsResync = true;
    };
    const onOnline = () => {
      if (!ch) void connect();
      schedule(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (retryTimer) clearTimeout(retryTimer);
      if (ch) void supabase.removeChannel(ch);
      ch = null;
    };
  }, [channel, instanceId, tableSig, keySig, filter, enabled, debounceMs, queryClient, resyncOnJoin]);
}
