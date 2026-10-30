import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { PRESENCE_BEAT_EVENT } from "@/hooks/use-store-presence-heartbeat";
import { getStoresPresence } from "@/lib/presence.functions";
import type { StorePresence } from "@/lib/store-presence";

/** Status online satu toko: nilai awal dari SSR, lalu disegarkan tiap 60 dtk saat tab terlihat. */
export function useStorePresence(
  storeId: string | null | undefined,
  initial: StorePresence | null | undefined,
): StorePresence | null {
  const fetchPresence = useServerFn(getStoresPresence);
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["store-presence", storeId],
    queryFn: async () => (await fetchPresence({ data: { ids: [storeId!] } }))[storeId!] ?? null,
    enabled: Boolean(storeId),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  // Heartbeat tab ini baru masuk: baca ulang supaya pemilik toko langsung melihat "Online".
  useEffect(() => {
    if (!storeId) return;
    const onBeat = () => void queryClient.invalidateQueries({ queryKey: ["store-presence", storeId] });
    window.addEventListener(PRESENCE_BEAT_EVENT, onBeat);
    return () => window.removeEventListener(PRESENCE_BEAT_EVENT, onBeat);
  }, [queryClient, storeId]);

  return data ?? initial ?? null;
}
