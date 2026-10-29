import { useSyncExternalStore } from "react";

/** Snapshot ringan produk yang pernah dibuka; disimpan lokal di perangkat. */
export type ViewedProduct = {
  id: string;
  name: string;
  slug: string;
  thumbnail_url: string | null;
  price: number;
  discount_price: number | null;
  store_name: string | null;
  viewed_at: number;
};

const KEY = "ebry:recently-viewed:v1";
const MAX = 20;
const EVENT = "ebry:recently-viewed";
const EMPTY: ViewedProduct[] = [];

let cacheRaw: string | null = null;
let cacheList: ViewedProduct[] = EMPTY;

function read(): ViewedProduct[] {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  // useSyncExternalStore butuh referensi stabil selama isi tidak berubah.
  if (raw === cacheRaw) return cacheList;
  cacheRaw = raw;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    cacheList = Array.isArray(parsed) ? (parsed as ViewedProduct[]) : EMPTY;
  } catch {
    cacheList = EMPTY;
  }
  return cacheList;
}

/** Catat produk terbaru di posisi pertama; duplikat dipindah ke depan. */
export function recordProductView(p: Omit<ViewedProduct, "viewed_at">) {
  if (typeof window === "undefined") return;
  const next = [{ ...p, viewed_at: Date.now() }, ...read().filter((x) => x.id !== p.id)].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Storage penuh / mode privat: abaikan, fitur ini opsional.
  }
}

export function clearRecentlyViewed() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* noop */
  }
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useRecentlyViewed(): ViewedProduct[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
