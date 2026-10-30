import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { lastSeenLabel, toPresence, type StorePresence } from "@/lib/store-presence";

/** Jam lokal yang berdetak tiap 30 dtk; null saat SSR agar hasil render server = klien. */
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * Status terkini dari data server: "online" dihitung ulang di klien supaya
 * berganti jadi "Aktif X lalu" sendiri saat heartbeat kedaluwarsa.
 */
export function useLivePresence(presence: StorePresence | null | undefined) {
  const now = useNow();
  const p = presence ?? { online: false, lastSeenAt: null };
  if (now == null) return { online: p.online, label: null as string | null };
  const live = p.online ? toPresence({ last_seen_at: p.lastSeenAt, online: true }, now) : p;
  return { online: live.online, label: live.online ? null : lastSeenLabel(p.lastSeenAt, now) };
}

/** Titik hijau di pojok kanan bawah avatar (hanya saat online); induk harus `relative`. */
export function OnlineDot({
  presence,
  className,
}: {
  presence: StorePresence | null | undefined;
  className?: string;
}) {
  const { online } = useLivePresence(presence);
  if (!online) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute bottom-0.5 right-0.5 size-3.5 rounded-full bg-success ring-2 ring-card sm:size-4",
        className,
      )}
    />
  );
}

/** Teks "Online" hijau, atau "Aktif X lalu" abu-abu; kosong bila belum pernah tercatat. */
export function PresenceLabel({
  presence,
  className,
}: {
  presence: StorePresence | null | undefined;
  className?: string;
}) {
  const { online, label } = useLivePresence(presence);
  if (online) return <OnlineLabel className={className} />;
  if (!label) return null;
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function OnlineLabel({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold text-success",
        className,
      )}
    >
      <span aria-hidden="true" className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      Online
    </span>
  );
}
