import { useSyncExternalStore } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type SessionSnapshot = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

const SERVER_SNAPSHOT: SessionSnapshot = Object.freeze({
  session: null,
  user: null,
  loading: true,
});

let snapshot: SessionSnapshot = SERVER_SNAPSHOT;
let initialized = false;
let initPromise: Promise<Session | null> | null = null;
const listeners = new Set<() => void>();

function emit(nextSession: Session | null) {
  // Sinkronkan JWT pengguna ke socket Realtime (diperlukan untuk sb_publishable_ key).
  try {
    void (supabase as any).realtime?.setAuth?.(nextSession?.access_token ?? null);
  } catch {
    /* abaikan pada mock/SSR */
  }
  if (!snapshot.loading && snapshot.session === nextSession) return;
  snapshot = {
    session: nextSession,
    user: nextSession?.user ?? null,
    loading: false,
  };
  for (const listener of listeners) listener();
}

function ensureInitialized(): Promise<Session | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!initialized) {
    initialized = true;
    supabase.auth.onAuthStateChange((_event, next) => {
      emit(next);
    });
    initPromise = supabase.auth
      .getSession()
      .then(({ data }) => {
        emit(data.session);
        return data.session;
      })
      .catch(() => {
        emit(null);
        return null;
      });
  }
  if (!snapshot.loading) return Promise.resolve(snapshot.session);
  return initPromise ?? Promise.resolve(snapshot.session);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void ensureInitialized();
  return () => {
    listeners.delete(listener);
  };
}

function getClientSnapshot(): SessionSnapshot {
  return snapshot;
}

function getServerSnapshot(): SessionSnapshot {
  return SERVER_SNAPSHOT;
}

/**
 * Mengembalikan sesi aktif secara instan dari cache klien bila sudah terinisialisasi,
 * sehingga perpindahan antar-route dashboard tidak menunggu getSession() berulang.
 */
export function getCachedSession(): Promise<Session | null> {
  return ensureInitialized();
}

/** Reset internal hanya untuk pengujian unit. */
export function __resetSessionStoreForTests() {
  snapshot = SERVER_SNAPSHOT;
  initialized = false;
  initPromise = null;
  listeners.clear();
}

export function useSession() {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
