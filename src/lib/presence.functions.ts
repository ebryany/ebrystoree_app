import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Status online beberapa toko (publik); dipakai halaman produk/toko untuk menyegarkan status. */
export const getStoresPresence = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { createPublicClient } = await import("./supabase-public.server");
    const { toPresence } = await import("./store-presence");
    const { data: rows } = await createPublicClient()
      .from("store_presence" as never)
      .select("store_id, last_seen_at, online")
      .in("store_id", data.ids);
    const result: Record<string, { online: boolean; lastSeenAt: string | null }> = {};
    for (const id of data.ids) result[id] = { online: false, lastSeenAt: null };
    for (const r of (rows ?? []) as Array<{ store_id: string; last_seen_at: string; online: boolean }>) {
      result[r.store_id] = toPresence(r);
    }
    return result;
  });
