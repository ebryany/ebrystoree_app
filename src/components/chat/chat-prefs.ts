import { useCallback, useEffect, useState } from "react";

/**
 * Preferensi klien untuk pengalaman chat ala WhatsApp:
 * - Pinned chats per akun (localStorage)
 * - Draft pesan otomatis per percakapan (sessionStorage, terisolasi per thread)
 * - Antrean offline (localStorage, dikirim otomatis saat jaringan kembali online)
 * - Preferensi suara notifikasi & notifikasi browser
 * - Sinkronisasi lintas tab via BroadcastChannel
 */

const PIN_KEY_PREFIX = "ebrystore.chat.pins.v1";
const DRAFT_KEY_PREFIX = "ebrystore.chat.draft.v1";
const OUTBOX_KEY_PREFIX = "ebrystore.chat.outbox.v1";
const SOUND_KEY = "ebrystore.chat.muted.v1";
const SYNC_CHANNEL = "ebrystore-chat-sync";

export type OfflineQueuedMessage = {
  tempId: string;
  inquiryId: string;
  body: string;
  replyToId?: string | null;
  queuedAt: number;
};

type SyncEvent =
  | { type: "pins-changed"; userId: string }
  | { type: "read-changed"; inquiryId: string }
  | { type: "outbox-changed"; userId: string };

function postSync(event: SyncEvent) {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  try {
    const ch = new BroadcastChannel(SYNC_CHANNEL);
    ch.postMessage(event);
    ch.close();
  } catch {
    /* abaikan jika browser membatasi BroadcastChannel */
  }
}

export function broadcastReadChange(inquiryId: string) {
  postSync({ type: "read-changed", inquiryId });
}

export function subscribeChatSync(onEvent: (event: SyncEvent) => void): () => void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return () => {};
  try {
    const ch = new BroadcastChannel(SYNC_CHANNEL);
    ch.onmessage = (ev) => {
      if (ev?.data && typeof ev.data.type === "string") onEvent(ev.data as SyncEvent);
    };
    return () => ch.close();
  } catch {
    return () => {};
  }
}

function readPins(userId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${PIN_KEY_PREFIX}:${userId}`);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function usePinnedChats(userId: string | null | undefined) {
  const key = userId || "anon";
  const [pins, setPins] = useState<string[]>(() => readPins(key));

  useEffect(() => {
    setPins(readPins(key));
    return subscribeChatSync((ev) => {
      if (ev.type === "pins-changed" && ev.userId === key) {
        setPins(readPins(key));
      }
    });
  }, [key]);

  const togglePin = useCallback(
    (inquiryId: string) => {
      setPins((prev) => {
        const exists = prev.includes(inquiryId);
        const next = exists ? prev.filter((id) => id !== inquiryId) : [inquiryId, ...prev];
        try {
          window.localStorage.setItem(`${PIN_KEY_PREFIX}:${key}`, JSON.stringify(next.slice(0, 20)));
        } catch {
          /* kuota penuh */
        }
        postSync({ type: "pins-changed", userId: key });
        return next;
      });
    },
    [key],
  );

  return {
    pinnedIds: pins,
    isPinned: useCallback((id: string) => pins.includes(id), [pins]),
    togglePin,
  };
}

export function loadThreadDraft(inquiryId: string): string {
  if (typeof window === "undefined" || !inquiryId) return "";
  try {
    return window.sessionStorage.getItem(`${DRAFT_KEY_PREFIX}:${inquiryId}`) ?? "";
  } catch {
    return "";
  }
}

export function saveThreadDraft(inquiryId: string, value: string) {
  if (typeof window === "undefined" || !inquiryId) return;
  try {
    if (!value) window.sessionStorage.removeItem(`${DRAFT_KEY_PREFIX}:${inquiryId}`);
    else window.sessionStorage.setItem(`${DRAFT_KEY_PREFIX}:${inquiryId}`, value.slice(0, 2000));
  } catch {
    /* abaikan */
  }
}

export function loadOfflineOutbox(userId: string, inquiryId: string): OfflineQueuedMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${OUTBOX_KEY_PREFIX}:${userId}`);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return (parsed as OfflineQueuedMessage[]).filter((m) => m.inquiryId === inquiryId);
  } catch {
    return [];
  }
}

export function enqueueOfflineMessage(userId: string, item: OfflineQueuedMessage) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(`${OUTBOX_KEY_PREFIX}:${userId}`);
    const parsed = raw ? (JSON.parse(raw) as OfflineQueuedMessage[]) : [];
    const next = [...parsed.filter((m) => m.tempId !== item.tempId), item].slice(-30);
    window.localStorage.setItem(`${OUTBOX_KEY_PREFIX}:${userId}`, JSON.stringify(next));
    postSync({ type: "outbox-changed", userId });
  } catch {
    /* abaikan */
  }
}

export function removeOfflineMessage(userId: string, tempId: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(`${OUTBOX_KEY_PREFIX}:${userId}`);
    const parsed = raw ? (JSON.parse(raw) as OfflineQueuedMessage[]) : [];
    const next = parsed.filter((m) => m.tempId !== tempId);
    window.localStorage.setItem(`${OUTBOX_KEY_PREFIX}:${userId}`, JSON.stringify(next));
    postSync({ type: "outbox-changed", userId });
  } catch {
    /* abaikan */
  }
}

export function isChatMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

export function setChatMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOUND_KEY, muted ? "1" : "0");
  } catch {
    /* abaikan */
  }
}

/** Nada notifikasi singkat (Web Audio API, tanpa file eksternal agar patuh CSP). */
export function playChatPing() {
  if (typeof window === "undefined" || isChatMuted()) return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.19);
    osc.onended = () => void ctx.close();
  } catch {
    /* autoplay policy browser belum memberi izin audio */
  }
}

/** Kirim notifikasi desktop/browser bila izin sudah diberikan & tab sedang tersembunyi. */
export function notifyBrowserMessage(title: string, body: string) {
  if (typeof window === "undefined" || isChatMuted()) return;
  if (document.visibilityState === "visible") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body: body.slice(0, 120), tag: "ebrystore-chat" });
  } catch {
    /* abaikan */
  }
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}
