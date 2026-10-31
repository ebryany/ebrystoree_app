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
  // Tata letak baris WhatsApp iOS: avatar 52px, nama + waktu, pratinjau 2 baris + badge.
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-[52px] shrink-0 place-items-center rounded-full bg-surface-selected text-lg font-semibold text-accent"
      >
        {initial}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[16px] font-semibold leading-tight text-foreground">
            {title}
          </p>
          <span
            className={cn(
              "shrink-0 text-[13px] tabular-nums",
              hasUnread ? "font-medium text-success" : "text-muted-foreground",
            )}
          >
            {lastMessageAt ? shortChatTime(lastMessageAt) : ""}
          </span>
        </div>
        <div className="mt-0.5 flex items-start justify-between gap-2">
          <p
            className={cn(
              "line-clamp-2 text-[14px] leading-snug",
              hasUnread ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {previewPrefix && preview ? (
              <span className="font-medium text-muted-foreground">{previewPrefix} </span>
            ) : null}
            {preview || "Belum ada pesan"}
          </p>
          {hasUnread ? (
            <span
              aria-label={unreadAria ?? `${unread} pesan belum dibaca`}
              className="mt-0.5 grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-success px-1.5 text-[11px] font-semibold text-success-foreground tabular-nums"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
