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
}: {
  title: string;
  preview: string | null;
  lastMessageAt: string | null;
  unread: number;
  unreadAria?: string;
}) {
  const initial = (title.trim()[0] ?? "?").toUpperCase();
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-selected text-sm font-semibold text-muted-foreground"
      >
        {initial}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={cn("truncate text-sm", unread > 0 ? "font-semibold" : "font-medium")}>
            {title}
          </p>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {lastMessageAt ? shortChatTime(lastMessageAt) : ""}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">{preview || "Belum ada pesan"}</p>
          {unread > 0 ? (
            <span
              aria-label={unreadAria ?? `${unread} pesan belum dibaca`}
              className="grid min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold leading-5 text-primary-foreground tabular-nums"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
