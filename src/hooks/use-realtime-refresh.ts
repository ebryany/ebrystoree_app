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
    // Jangan invalidate di subscribe awal saat halaman baru mount (data baru saja diambil).
    // Hanya resync ketika channel benar-benar pulih dari putus/error/offline.
    let needsResync = false;
    let hiddenAt: number | null = null;
    const MIN_HIDDEN_RESYNC_MS = 30_000;

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
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        needsResync = true;
      } else if (status === "SUBSCRIBED" && needsResync) {
        // Setelah rekoneksi berhasil, samakan data yang mungkin tertinggal saat putus.
        needsResync = false;
        schedule();
      }
    });

    // Segarkan saat tab kembali aktif setelah tersembunyi cukup lama (≥30 dtk)
    // atau saat jaringan kembali online — hindari refetch berlebih saat pindah tab singkat.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (hiddenAt !== null && Date.now() - hiddenAt >= MIN_HIDDEN_RESYNC_MS) {
          schedule();
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
      needsResync = false;
      schedule();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(ch);
    };
  }, [channel, instanceId, tableSig, keySig, filter, enabled, debounceMs, queryClient]);
}
