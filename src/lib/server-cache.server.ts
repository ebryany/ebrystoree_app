/**
 * Cache in-memory berbatas (bounded) + in-flight request coalescing (singleflight)
 * untuk pembacaan katalog publik read-only di server SSR.
 *
 * - Mencegah thundering herd / cache stampede saat ratusan pengguna meminta
 *   halaman beranda/katalog yang sama secara bersamaan.
 * - `maxEntries` membatasi ukuran Map per namespace agar bebas memory leak.
 * - Hasil error tidak pernah di-cache (`shouldCache`) sehingga sistem segera pulih.
 */

type CacheEntry<T> = {
  at: number;
  value: T;
};

type NamespaceStore = {
  entries: Map<string, CacheEntry<unknown>>;
  inflight: Map<string, Promise<unknown>>;
};

const stores = new Map<string, NamespaceStore>();

function getStore(namespace: string): NamespaceStore {
  let store = stores.get(namespace);
  if (!store) {
    store = { entries: new Map(), inflight: new Map() };
    stores.set(namespace, store);
  }
  return store;
}

export interface ServerCacheOptions<T> {
  maxEntries?: number;
  shouldCache?: (value: T) => boolean;
}

export async function getOrLoad<T>(
  namespace: string,
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  options: ServerCacheOptions<T> = {},
): Promise<T> {
  const store = getStore(namespace);
  const now = Date.now();
  const hit = store.entries.get(key) as CacheEntry<T> | undefined;
  if (hit && now - hit.at < ttlMs) {
    return hit.value;
  }

  const pending = store.inflight.get(key) as Promise<T> | undefined;
  if (pending) {
    return pending;
  }

  const maxEntries = options.maxEntries ?? 64;
  const shouldCache = options.shouldCache ?? (() => true);

  const task = (async () => {
    try {
      const value = await loader();
      if (shouldCache(value)) {
        if (store.entries.size >= maxEntries && !store.entries.has(key)) {
          const oldestKey = store.entries.keys().next().value;
          if (oldestKey !== undefined) store.entries.delete(oldestKey);
        }
        store.entries.set(key, { at: Date.now(), value });
      }
      return value;
    } finally {
      store.inflight.delete(key);
    }
  })();

  store.inflight.set(key, task);
  return task;
}

export function clearServerCache(namespace?: string) {
  if (namespace) {
    stores.delete(namespace);
    return;
  }
  stores.clear();
}
