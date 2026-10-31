import { cn } from "@/lib/utils";
import { shortChatTime } from "./chat-time";

/**
 * Isi satu baris list percakapan; halaman pembungkus menyediakan Link bertipe
 * agar navigasi tetap mengikuti route literal masing-masing.
 */
export function ChatListItemContent({
  title,
  preview,
  lastMessageAt,
  unread,
  unreadAria,
  previewPrefix,
}: {
  title: string;
  preview: string | null;
  lastMessageAt: string | null;
  unread: number;
  unreadAria?: string;
  /** Mis. "Anda:" bila pesan terakhir dikirim oleh pengguna sendiri. */
  previewPrefix?: string;
}) {
  const initial = (title.trim()[0] ?? "?").toUpperCase();
  const hasUnread = unread > 0;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-full text-base font-semibold",
          hasUnread ? "bg-accent text-accent-foreground" : "bg-surface-selected text-accent",
        )}
      >
        {initial}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={cn(
              "truncate text-sm text-foreground",
              hasUnread ? "font-bold" : "font-semibold",
            )}
          >
            {title}
          </p>
          <span
            className={cn(
              "shrink-0 text-[11px] tabular-nums",
              hasUnread ? "font-semibold text-accent" : "text-muted-foreground",
            )}
          >
            {lastMessageAt ? shortChatTime(lastMessageAt) : ""}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p
            className={cn(
              "truncate text-xs",
              hasUnread ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {previewPrefix && preview ? (
              <span className="text-muted-foreground">{previewPrefix} </span>
            ) : null}
            {preview || "Belum ada pesan"}
          </p>
          {hasUnread ? (
            <span
              aria-label={unreadAria ?? `${unread} pesan belum dibaca`}
              className="grid min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-[10px] font-bold leading-5 text-accent-foreground tabular-nums"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
