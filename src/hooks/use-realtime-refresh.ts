import { useEffect, useId, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type RealtimeConnectionStatus = "subscribed" | "reconnecting" | "error";

type RealtimeEventPayload = {
  eventType: string;
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
}: Options) {
  const queryClient = useQueryClient();
  const instanceId = useId();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventRef = useRef(onEvent);
  eventRef.current = onEvent;
  const tableSig = tables.join(",");
  const keySig = JSON.stringify(keys);

  useEffect(() => {
    if (!enabled) return;
    // Nama channel unik per instance komponen agar dua layar tidak saling menimpa.
    const ch = supabase.channel(`${channel}:${instanceId}`);

    const flush = () => {
      timerRef.current = null;
      for (const key of JSON.parse(keySig) as QueryKey[]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    };

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, debounceMs);
    };

    for (const table of tableSig.split(",")) {
      ch.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) } as any,
        (payload: RealtimeEventPayload) => {
          eventRef.current?.(payload);
          schedule();
        },
      );
    }

    ch.subscribe((status) => {
      const mapped = mapRealtimeStatus(status);
      if (mapped) queryClient.setQueryData(realtimeStatusKey(channel), mapped);
      if (status === "SUBSCRIBED") {
        // Setelah (re)koneksi berhasil, samakan data yang mungkin tertinggal saat offline.
        schedule();
      }
    });

    // Segarkan saat tab kembali aktif — event yang terlewat tidak dikirim ulang.
    const onVisible = () => {
      if (document.visibilityState === "visible") schedule();
    };
    const onOnline = () => schedule();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(ch);
    };
  }, [channel, instanceId, tableSig, keySig, filter, enabled, debounceMs, queryClient]);
}
