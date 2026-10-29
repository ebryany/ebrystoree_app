import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ArrowUp,
  Check,
  CheckCheck,
  ChevronDown,
  FileText,
  ImageIcon,
  Loader2,
  MapPin,
  Paperclip,
  Plus,
} from "lucide-react";

import { StatusPill } from "@/components/ebry/status";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChatAttachment } from "@/lib/inquiries.functions";
import { cn } from "@/lib/utils";
import { chatDayLabel } from "./chat-time";

export type ChatMessage = {
  id: string;
  sender_id: string | null;
  sender_role: string;
  body: string;
  is_system: boolean | null;
  created_at: string;
  attachment?: ChatAttachment | null;
};

export type ChatPendingMessage = {
  tempId: string;
  body: string;
  status: "sending" | "failed";
  /** Label lampiran yang sedang diunggah, mis. "📷 Foto". */
  attachmentLabel?: string;
};

export type ChatAttachInput = { kind: "image" | "file"; file: File } | { kind: "location" };

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const FILE_ACCEPT =
  ".pdf,.zip,.txt,.doc,.docx,.xls,.xlsx,.pptx,application/pdf,application/zip,text/plain";

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

type Props = {
  title: string;
  /** Nama lawan bicara (judul header gaya iOS). */
  partnerName: string;
  roleLabel: string;
  statusLabel: string;
  status: string;
  closed: boolean;
  productSlot?: ReactNode;
  backSlot?: ReactNode;
  messages: ChatMessage[];
  pending: ChatPendingMessage[];
  selfId: string | null | undefined;
  viewerRole: "customer" | "seller" | "staff";
  partnerTyping: boolean;
  partnerOnline: boolean;
  myReadAt: string | null;
  partnerReadAt: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onSend: (body: string) => void;
  onRetry: (tempId: string, body: string) => void;
  onToggleClosed: () => void;
  canToggleClosed: boolean;
  onDraftChange?: () => void;
  /** Kirim lampiran; tidak diisi = tombol lampiran disembunyikan. */
  onAttach?: (input: ChatAttachInput) => void;
  /** Signed URL per path lampiran (foto/file). */
  attachmentUrls?: Record<string, string>;
  /** Mode panel (desktop dua kolom): isi tinggi induk, tanpa batas lebar. */
  embedded?: boolean;
};

const NEAR_BOTTOM_PX = 120;
const GROUP_GAP_MS = 5 * 60 * 1000;

function isCounterparty(role: string, viewerRole: Props["viewerRole"]) {
  return viewerRole === "customer" ? role !== "customer" : role === "customer";
}

function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function sameGroup(a: ChatMessage | undefined, b: ChatMessage | undefined) {
  if (!a || !b || a.is_system || b.is_system) return false;
  return (
    a.sender_id === b.sender_id &&
    Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) <= GROUP_GAP_MS &&
    sameDay(a.created_at, b.created_at)
  );
}

function clockTime(value: string) {
  return new Date(value).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

/** Jendela chat gaya iOS: header ringkas, bubble bersambung, centang baca, composer pil. */
export function ChatWindow({
  title,
  partnerName,
  roleLabel,
  statusLabel,
  status,
  closed,
  productSlot,
  backSlot,
  messages,
  pending,
  selfId,
  viewerRole,
  partnerTyping,
  partnerOnline,
  myReadAt,
  partnerReadAt,
  hasMore,
  loadingMore,
  onLoadMore,
  onSend,
  onRetry,
  onToggleClosed,
  canToggleClosed,
  onDraftChange,
  onAttach,
  attachmentUrls,
  embedded = false,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const lastCountRef = useRef(0);
  const [showJump, setShowJump] = useState(false);

  const initial = (partnerName.trim()[0] ?? "?").toUpperCase();

  function scrollToBottom(smooth = false) {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }

  // Ikuti pesan baru hanya bila pengguna sudah di dekat dasar; kalau sedang
  // membaca riwayat, tampilkan tombol lompat alih-alih merebut posisi gulir.
  useLayoutEffect(() => {
    const count = messages.length + pending.length;
    const first = lastCountRef.current === 0;
    const grew = count > lastCountRef.current;
    lastCountRef.current = count;
    if (first || (grew && nearBottomRef.current)) scrollToBottom();
    else if (grew) setShowJump(true);
  }, [messages.length, pending.length]);

  useEffect(() => {
    if (partnerTyping && nearBottomRef.current) scrollToBottom(true);
  }, [partnerTyping]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    nearBottomRef.current = near;
    if (near) setShowJump((v) => (v ? false : v));
  }

  function send(text: string) {
    onSend(text);
    nearBottomRef.current = true;
    requestAnimationFrame(() => scrollToBottom(true));
  }

  const myReadTime = myReadAt ? new Date(myReadAt).getTime() : null;
  const partnerReadTime = partnerReadAt ? new Date(partnerReadAt).getTime() : null;
  const unreadDividerIndex =
    myReadTime === null
      ? -1
      : messages.findIndex(
          (m) =>
            isCounterparty(m.sender_role, viewerRole) &&
            new Date(m.created_at).getTime() > myReadTime,
        );

  const presence = partnerTyping ? "mengetik…" : partnerOnline ? "Online" : roleLabel;

  return (
    <div
      className={cn(
        "mx-auto flex h-[calc(100dvh-9rem)] min-h-[26rem] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card",
        // Panel desktop: isi tinggi wadah dua kolom; di HP tetap layar penuh.
        embedded
          ? "lg:mx-0 lg:h-full lg:min-h-0 lg:max-w-none lg:rounded-none lg:border-0"
          : "lg:h-[calc(100dvh-8rem)]",
      )}
    >
      <header className="flex items-center gap-2 border-b border-border/70 bg-card px-2 py-2 sm:px-3">
        {backSlot}
        <span className="relative shrink-0" aria-hidden="true">
          <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-primary/80 to-primary text-sm font-semibold text-primary-foreground">
            {initial}
          </span>
          {partnerOnline ? (
            <span className="absolute bottom-0 right-0 size-3 rounded-full bg-success ring-2 ring-card" />
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight">{partnerName}</p>
          <p
            aria-live="polite"
            className={cn(
              "truncate text-xs leading-tight",
              partnerTyping || partnerOnline ? "text-success" : "text-muted-foreground",
            )}
          >
            {presence}
          </p>
        </div>
        <StatusPill value={status} kind="raw" label={statusLabel} />
      </header>
      {productSlot}
      <span className="sr-only">{title}</span>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Riwayat pesan"
        className="relative flex-1 overflow-y-auto overscroll-contain bg-background px-3 py-3 sm:px-4"
      >
        {hasMore ? (
          <div className="pb-3 text-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-9 rounded-full text-xs text-primary"
              disabled={loadingMore}
              onClick={onLoadMore}
            >
              {loadingMore ? "Memuat…" : "Muat pesan sebelumnya"}
            </Button>
          </div>
        ) : null}

        {messages.map((message, index) => {
          const prev = messages[index - 1];
          const next = messages[index + 1];
          const dayBreak = !prev || !sameDay(prev.created_at, message.created_at);
          const mine = message.sender_id === selfId;
          return (
            <div key={message.id}>
              {dayBreak ? (
                <p className="py-3 text-center text-[11px] font-medium text-muted-foreground">
                  {chatDayLabel(message.created_at)}
                </p>
              ) : null}
              {index === unreadDividerIndex ? (
                <p className="py-2 text-center text-[11px] font-semibold text-primary">
                  Pesan baru
                </p>
              ) : null}
              {message.is_system ? (
                <p className="py-1.5 text-center text-[11px] text-muted-foreground">
                  {message.body}
                </p>
              ) : (
                <Bubble
                  body={message.body}
                  attachment={message.attachment ?? null}
                  attachmentUrl={
                    message.attachment && "path" in message.attachment
                      ? attachmentUrls?.[message.attachment.path]
                      : undefined
                  }
                  time={clockTime(message.created_at)}
                  mine={mine}
                  groupStart={!sameGroup(prev, message)}
                  groupEnd={!sameGroup(message, next)}
                  read={
                    mine &&
                    partnerReadTime !== null &&
                    new Date(message.created_at).getTime() <= partnerReadTime
                  }
                />
              )}
            </div>
          );
        })}

        {pending.map((item) => (
          <div key={item.tempId} className="flex justify-end pt-0.5">
            <div
              className={cn(
                "max-w-[78%] rounded-[20px] rounded-br-md px-3.5 py-2 text-[15px] leading-snug",
                item.status === "failed"
                  ? "border border-destructive bg-card text-foreground"
                  : "bg-primary text-primary-foreground opacity-70",
              )}
            >
              {item.attachmentLabel ? (
                <p className="font-medium">{item.attachmentLabel}</p>
              ) : null}
              {item.body ? <p className="whitespace-pre-line break-words">{item.body}</p> : null}
              <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px]">
                {item.status === "sending" ? (
                  <Loader2
                    className="size-3 animate-spin motion-reduce:animate-none"
                    aria-label="Mengirim"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => onRetry(item.tempId, item.body)}
                    className="min-h-6 font-semibold text-destructive underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    Gagal, ketuk untuk kirim ulang
                  </button>
                )}
              </p>
            </div>
          </div>
        ))}

        {partnerTyping ? (
          <div className="flex justify-start pt-1.5">
            <div className="flex items-center gap-1 rounded-[20px] rounded-bl-md bg-muted px-4 py-3">
              <span className="sr-only">Lawan bicara sedang mengetik</span>
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  aria-hidden="true"
                  className="size-2 animate-bounce rounded-full bg-muted-foreground/60 motion-reduce:animate-none"
                  style={{ animationDelay: `${dot * 150}ms` }}
                />
              ))}
            </div>
          </div>
        ) : null}

        {showJump ? (
          <button
            type="button"
            aria-label="Lompat ke pesan terbaru"
            onClick={() => {
              nearBottomRef.current = true;
              setShowJump(false);
              scrollToBottom(true);
            }}
            className="sticky bottom-2 ml-auto grid size-11 place-items-center rounded-full border border-border bg-card text-foreground shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ChevronDown className="size-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {closed ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground">
          <span>Percakapan ini sudah ditutup.</span>
          {canToggleClosed ? (
            <Button variant="outline" size="sm" className="min-h-11" onClick={onToggleClosed}>
              Buka kembali
            </Button>
          ) : null}
        </div>
      ) : (
        <Composer
          onSend={send}
          onDraftChange={onDraftChange}
          onAttach={
            onAttach
              ? (input) => {
                  onAttach(input);
                  nearBottomRef.current = true;
                  requestAnimationFrame(() => scrollToBottom(true));
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

/**
 * Satu bubble pesan. Di-memo supaya pesan lama tidak dirender ulang setiap
 * ada pesan baru, status mengetik berubah, atau tombol lompat muncul.
 */
const Bubble = memo(function Bubble({
  body,
  attachment,
  attachmentUrl,
  time,
  mine,
  groupStart,
  groupEnd,
  read,
}: {
  body: string;
  attachment: ChatAttachment | null;
  attachmentUrl?: string;
  time: string;
  mine: boolean;
  groupStart: boolean;
  groupEnd: boolean;
  read: boolean;
}) {
  const isImage = attachment?.kind === "image";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start", groupStart ? "pt-2" : "pt-0.5")}>
      <div
        className={cn(
          "max-w-[78%] rounded-[20px] text-[15px] leading-snug sm:max-w-[65%]",
          isImage ? "p-1" : "px-3.5 py-2",
          mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          // Ekor bubble hanya di pesan terakhir sebuah kelompok, seperti iMessage.
          groupEnd && (mine ? "rounded-br-md" : "rounded-bl-md"),
        )}
      >
        {attachment ? (
          <AttachmentView attachment={attachment} url={attachmentUrl} mine={mine} />
        ) : null}
        {body ? (
          <p className={cn("whitespace-pre-line break-words", isImage && "px-2.5 pt-1.5")}>{body}</p>
        ) : null}
        <p
          className={cn(
            "mt-0.5 flex items-center justify-end gap-1 text-[11px] tabular-nums",
            isImage && "px-2.5 pb-1",
            mine ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          <span>{time}</span>
          {mine ? (
            read ? (
              // Centang dua biru = sudah dibaca (kontras di atas primary terang/gelap).
              <CheckCheck className="size-4 text-sky-400 dark:text-sky-700" aria-label="Dibaca" />
            ) : (
              <Check className="size-3.5" aria-label="Terkirim" />
            )
          ) : null}
        </p>
      </div>
    </div>
  );
});

function AttachmentView({
  attachment,
  url,
  mine,
}: {
  attachment: ChatAttachment;
  url?: string;
  mine: boolean;
}) {
  if (attachment.kind === "location") {
    const href = `https://maps.google.com/?q=${attachment.lat},${attachment.lng}`;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-11 items-center gap-2.5 underline-offset-2 hover:underline"
      >
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full",
            mine ? "bg-primary-foreground/15" : "bg-background",
          )}
        >
          <MapPin className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">Lokasi</span>
          <span className="block text-xs tabular-nums opacity-80">
            {attachment.lat.toFixed(5)}, {attachment.lng.toFixed(5)}
          </span>
        </span>
      </a>
    );
  }

  if (attachment.kind === "image") {
    if (!url)
      return (
        <div className="grid aspect-[4/3] w-56 max-w-full place-items-center rounded-2xl bg-background/30">
          <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-label="Memuat foto" />
        </div>
      );
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={url}
          alt={attachment.name}
          loading="lazy"
          decoding="async"
          className="max-h-80 w-auto max-w-full rounded-2xl object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={attachment.name}
      aria-disabled={!url}
      className={cn("flex min-h-11 items-center gap-2.5", !url && "pointer-events-none opacity-70")}
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl",
          mine ? "bg-primary-foreground/15" : "bg-background",
        )}
      >
        <FileText className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold">{attachment.name}</span>
        <span className="block text-xs opacity-80">{formatBytes(attachment.size)}</span>
      </span>
    </a>
  );
}

/**
 * Composer dipisah dengan state draft sendiri: mengetik tidak lagi merender
 * ulang seluruh daftar pesan pada setiap ketukan tombol.
 */
function Composer({
  onSend,
  onDraftChange,
  onAttach,
}: {
  onSend: (body: string) => void;
  onDraftChange?: () => void;
  onAttach?: (input: ChatAttachInput) => void;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const imageRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function pick(kind: "image" | "file", list: FileList | null) {
    const file = list?.[0];
    if (file && onAttach) onAttach({ kind, file });
  }

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
    inputRef.current?.focus();
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={submit}
      className="pb-safe flex items-end gap-2 border-t border-border/70 bg-card px-2 py-2 sm:px-3"
    >
      {onAttach ? (
        <>
          <input
            ref={imageRef}
            type="file"
            accept={IMAGE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              pick("image", e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept={FILE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              pick("file", e.target.files);
              e.target.value = "";
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Lampirkan"
                className="grid size-11 shrink-0 place-items-center rounded-full text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="size-6" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-48">
              <DropdownMenuItem className="min-h-11 gap-3" onSelect={() => imageRef.current?.click()}>
                <ImageIcon className="size-5 text-primary" aria-hidden="true" /> Foto
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11 gap-3" onSelect={() => fileRef.current?.click()}>
                <Paperclip className="size-5 text-primary" aria-hidden="true" /> File
              </DropdownMenuItem>
              <DropdownMenuItem
                className="min-h-11 gap-3"
                onSelect={() => onAttach({ kind: "location" })}
              >
                <MapPin className="size-5 text-primary" aria-hidden="true" /> Lokasi saya
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : null}
      <div className="flex min-h-11 flex-1 items-center rounded-[22px] border border-border bg-background px-4 focus-within:border-primary/50">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onDraftChange?.();
          }}
          onKeyDown={keyDown}
          rows={1}
          maxLength={2000}
          placeholder="Pesan"
          aria-label="Tulis pesan"
          className="max-h-[120px] w-full resize-none bg-transparent py-2.5 text-base leading-snug outline-none placeholder:text-muted-foreground sm:text-[15px]"
        />
      </div>
      <button
        type="submit"
        aria-label="Kirim pesan"
        disabled={!draft.trim()}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowUp className="size-5" strokeWidth={2.5} aria-hidden="true" />
      </button>
    </form>
  );
}
