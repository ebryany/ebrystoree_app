import { Check, CheckCheck, Pin } from "lucide-react";

import { cn, isRenderableImageUrl, optimizedMediaUrl } from "@/lib/utils";
import { shortChatTime } from "./chat-time";

/**
 * Isi satu baris list percakapan bergaya WhatsApp:
 * avatar (foto toko atau inisial), nama lawan bicara, subjek opsional,
 * waktu ringkas, centang status pesan terakhir, pin, serta badge unread.
 */
export function ChatListItemContent({
  title,
  subtitle,
  avatarUrl,
  preview,
  lastMessageAt,
  unread,
  unreadAria,
  previewPrefix,
  pinned = false,
  lastMessageMine = false,
  lastMessageRead = false,
}: {
  title: string;
  /** Konteks singkat (mis. subjek produk/jasa di bawah nama toko). */
  subtitle?: string | null;
  avatarUrl?: string | null;
  preview: string | null;
  lastMessageAt: string | null;
  unread: number;
  unreadAria?: string;
  /** Mis. "Anda:" bila pesan terakhir dikirim oleh pengguna sendiri. */
  previewPrefix?: string;
  pinned?: boolean;
  lastMessageMine?: boolean;
  lastMessageRead?: boolean;
}) {
  const initial = (title.trim()[0] ?? "?").toUpperCase();
  const hasUnread = unread > 0;
  const img = isRenderableImageUrl(avatarUrl) ? avatarUrl : null;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border border-border/60 bg-surface-selected text-base font-semibold text-primary"
      >
        {img ? (
          <img
            src={optimizedMediaUrl(img, 96)}
            alt=""
            width={48}
            height={48}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          initial
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
            {title}
          </p>
          <span
            className={cn(
              "shrink-0 text-[12px] tabular-nums",
              hasUnread ? "font-semibold text-primary" : "text-muted-foreground",
            )}
          >
            {lastMessageAt ? shortChatTime(lastMessageAt) : ""}
          </span>
        </div>

        {subtitle ? (
          <p className="mt-0.5 truncate text-[12px] font-medium text-muted-foreground/90">
            {subtitle}
          </p>
        ) : null}

        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1 text-[13px] leading-snug",
              hasUnread ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {lastMessageMine && preview ? (
              lastMessageRead ? (
                <CheckCheck
                  className="size-3.5 shrink-0 text-sky-500 dark:text-sky-400"
                  aria-hidden="true"
                />
              ) : (
                <Check className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              )
            ) : null}
            <span className="truncate">
              {!lastMessageMine && previewPrefix && preview ? (
                <span className="font-medium text-muted-foreground">{previewPrefix} </span>
              ) : null}
              {preview || "Belum ada pesan"}
            </span>
          </p>

          <span className="flex shrink-0 items-center gap-1.5">
            {pinned ? (
              <Pin
                className="size-3.5 rotate-45 text-muted-foreground"
                aria-label="Percakapan disematkan"
              />
            ) : null}
            {hasUnread ? (
              <span
                aria-label={unreadAria ?? `${unread} pesan belum dibaca`}
                className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums"
              >
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}
