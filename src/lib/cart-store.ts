import { useSyncExternalStore } from "react";

/**
 * Keranjang produk digital.
 *
 * Sumber kebenaran harga TIDAK ada di sini. Keranjang hanya menyimpan
 * `productId`, `slug`, dan nama toko untuk keperluan tampilan/kelompok.
 * Harga, ketersediaan, dan status toko selalu dibaca ulang dari server saat
 * halaman keranjang dibuka dan saat checkout.
 *
 * Penyimpanan: localStorage. Alasannya:
 * - Keranjang harus bertahan setelah refresh tanpa menambah tabel baru.
 * - Guest (belum login) tetap bisa mengumpulkan item.
 * - Isi keranjang bukan data sensitif: tanpa harga final, tidak ada nilai
 *   finansial yang bisa dimanipulasi lewat localStorage.
 *
 * Isolasi antar-akun: keranjang di-key per `userId` (atau "guest"). Saat user
 * login/logout, kunci berganti sehingga isi keranjang akun lain tidak terbaca.
 */

export type CartItem = {
  productId: string;
  slug: string;
  name: string;
  thumbnailUrl: string | null;
  storeId: string | null;
  storeName: string | null;
  /** Harga saat ditambahkan, hanya untuk tampilan awal. Bukan harga final. */
  priceHint: number;
  addedAt: number;
};

type CartState = { items: CartItem[] };

const MAX_ITEMS = 50;
const STORAGE_PREFIX = "ebrystore.cart.v1";

let currentKey = `${STORAGE_PREFIX}:guest`;
let state: CartState = { items: [] };
const listeners = new Set<() => void>();

function readStorage(key: string): CartState {
  if (typeof window === "undefined") return { items: [] };
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { items: [] };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { items: [] };
    const items = (parsed as { items?: unknown }).items;
    if (!Array.isArray(items)) return { items: [] };
    // Validasi bentuk minimal: item tanpa productId/slug dibuang.
    const clean = items.filter(
      (it): it is CartItem =>
        Boolean(it) &&
        typeof (it as CartItem).productId === "string" &&
        typeof (it as CartItem).slug === "string",
    );
    return { items: clean.slice(0, MAX_ITEMS) };
  } catch {
    return { items: [] };
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(currentKey, JSON.stringify(state));
  } catch {
    // Kuota penuh / mode privat: keranjang tetap jalan di memori sesi ini.
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function setState(next: CartState) {
  state = next;
  persist();
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return { items: [] } as CartState;
}

/** Ganti keranjang aktif saat identitas pengguna berubah. */
export function setCartOwner(userId: string | null) {
  const nextKey = `${STORAGE_PREFIX}:${userId ?? "guest"}`;
  if (nextKey === currentKey) return;
  currentKey = nextKey;
  state = readStorage(currentKey);
  emit();
}

/** Muat ulang dari storage (dipakai sekali di client setelah hidrasi). */
export function hydrateCart() {
  state = readStorage(currentKey);
  emit();
}

export function addToCart(item: Omit<CartItem, "addedAt">): "added" | "duplicate" | "full" {
  if (state.items.some((it) => it.productId === item.productId)) return "duplicate";
  if (state.items.length >= MAX_ITEMS) return "full";
  setState({ items: [...state.items, { ...item, addedAt: Date.now() }] });
  return "added";
}

export function removeFromCart(productId: string) {
  setState({ items: state.items.filter((it) => it.productId !== productId) });
}

export function clearCart() {
  setState({ items: [] });
}

/** Hapus hanya item yang benar-benar berhasil di-checkout. */
export function removePurchased(productIds: string[]) {
  const done = new Set(productIds);
  setState({ items: state.items.filter((it) => !done.has(it.productId)) });
}

export function useCart() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    items: snapshot.items,
    count: snapshot.items.length,
    subtotalHint: snapshot.items.reduce((sum, it) => sum + (it.priceHint || 0), 0),
  };
}
