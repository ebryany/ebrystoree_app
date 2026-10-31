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
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  FileText,
  ImageIcon,
  Loader2,
  MapPin,
  Plus,
  SendHorizontal,
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

/** Ekor bubble gaya WhatsApp di sudut atas pesan pertama sebuah kelompok. */
function BubbleTail({ mine }: { mine: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 8 13"
      className={cn(
        "absolute top-0 h-[13px] w-2",
        mine ? "-right-2 text-chat-out" : "-left-2 -scale-x-100 text-card",
      )}
    >
      <path fill="currentColor" d="M0 0h8L1.6 9.4C1 10.3 0 9.9 0 8.8z" />
    </svg>
  );
}

/** Jam + centang. Dirender dua kali: tak terlihat (penyedia ruang) dan absolut di pojok. */
function BubbleMeta({
  time,
  mine,
  read,
  sending,
  overlay,
}: {
  time: string;
  mine: boolean;
  read?: boolean;
  sending?: boolean;
  overlay?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] leading-none tabular-nums",
        overlay
          ? "rounded-full bg-black/40 px-1.5 py-1 text-white"
          : mine
            ? "text-chat-out-foreground/60"
            : "text-muted-foreground",
      )}
    >
      {time}
      {mine ? (
        sending ? (
          <Clock className="size-3" aria-label="Mengirim" />
        ) : read ? (
          // Centang dua biru = sudah dibaca, seperti WhatsApp.
          <CheckCheck
            className={cn("size-4", !overlay && "text-sky-500 dark:text-sky-400")}
            aria-label="Dibaca"
          />
        ) : (
          <Check className="size-3.5" aria-label="Terkirim" />
        )
      ) : null}
    </span>
  );
}

/** Jendela chat gaya WhatsApp iOS: header kaca, wallpaper, bubble berekor, composer kaca. */
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
        // HP: layar penuh menutup header situs & bottom nav, seperti aplikasi chat native.
        "fixed inset-0 z-50 flex flex-col overflow-hidden bg-card",
        "md:relative md:inset-auto md:z-auto md:mx-auto md:h-[calc(100dvh-9rem)] md:min-h-[26rem] md:w-full md:max-w-3xl md:rounded-2xl md:border md:border-border",
        // Panel desktop: isi tinggi wadah dua kolom.
        embedded
          ? "lg:mx-0 lg:h-full lg:min-h-0 lg:max-w-none lg:rounded-none lg:border-0"
          : "lg:h-[calc(100dvh-8rem)]",
      )}
    >
      {/* Header kaca gaya iOS: kembali, avatar + nama di tengah-kiri, status di kanan. */}
      <header className="pt-safe z-10 border-b border-border/60 bg-card/85 backdrop-blur-xl">
        <div className="flex min-h-14 items-center gap-2 px-1.5 sm:px-2">
          {backSlot}
          <span className="relative shrink-0" aria-hidden="true">
            <span className="grid size-10 place-items-center rounded-full bg-surface-selected text-[15px] font-semibold text-accent">
              {initial}
            </span>
            {partnerOnline ? (
              <span className="absolute bottom-0 right-0 size-3 rounded-full bg-success ring-2 ring-card" />
            ) : null}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold leading-tight tracking-[-0.01em]">
              {partnerName}
            </p>
            <p
              aria-live="polite"
              className={cn(
                "truncate text-[12px] leading-tight",
                partnerTyping ? "text-success" : "text-muted-foreground",
              )}
            >
              {presence}
            </p>
          </div>
          <StatusPill value={status} kind="raw" label={statusLabel} className="mr-1.5 shrink-0" />
        </div>
        {productSlot}
      </header>
      <span className="sr-only">{title}</span>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Riwayat pesan"
        className="chat-wallpaper relative flex-1 overflow-y-auto overscroll-contain px-3 py-2 sm:px-[6%]"
      >
        {hasMore ? (
          <div className="pb-2 pt-1 text-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-9 rounded-full bg-card/90 text-xs text-primary shadow-sm"
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
                <p className="sticky top-1 z-[1] flex justify-center py-2">
                  <span className="rounded-lg bg-card/90 px-2.5 py-1 text-[12px] font-medium text-muted-foreground shadow-sm">
                    {chatDayLabel(message.created_at)}
                  </span>
                </p>
              ) : null}
              {index === unreadDividerIndex ? (
                <p className="-mx-3 my-2 bg-card/70 py-1 text-center text-[12px] font-semibold text-accent sm:-mx-[6%]">
                  Pesan baru
                </p>
              ) : null}
              {message.is_system ? (
                <p className="flex justify-center py-1.5">
                  <span className="max-w-[85%] rounded-lg bg-card/90 px-2.5 py-1 text-center text-[12px] text-muted-foreground shadow-sm">
                    {message.body}
                  </span>
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
          <div key={item.tempId} className="flex justify-end pr-2 pt-0.5">
            <div
              className={cn(
                "relative max-w-[80%] rounded-[18px] px-3 pb-1.5 pt-1.5 text-[16px] leading-[1.3] shadow-[0_1px_0.5px_oklch(0_0_0/13%)] sm:max-w-[65%]",
                item.status === "failed"
                  ? "border border-destructive bg-card text-foreground"
                  : "bg-chat-out text-chat-out-foreground",
              )}
            >
              {item.attachmentLabel ? <p className="font-medium">{item.attachmentLabel}</p> : null}
              {item.status === "sending" ? (
                <p className="whitespace-pre-line break-words">
                  {item.body}
                  <span className="ml-2 inline-block align-bottom">
                    <BubbleMeta time="" mine sending />
                  </span>
                </p>
              ) : (
                <>
                  {item.body ? (
                    <p className="whitespace-pre-line break-words">{item.body}</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onRetry(item.tempId, item.body)}
                    className="mt-0.5 min-h-6 text-[12px] font-semibold text-destructive underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    Gagal, coba lagi
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        {partnerTyping ? (
          <div className="flex justify-start pl-2 pt-1.5">
            <div className="relative flex items-center gap-1 rounded-[18px] bg-card px-4 py-3 shadow-[0_1px_0.5px_oklch(0_0_0/13%)]">
              <BubbleTail mine={false} />
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
            className="sticky bottom-2 z-[1] ml-auto grid size-11 place-items-center rounded-full bg-card/95 text-muted-foreground shadow-[0_2px_8px_oklch(0_0_0/18%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ChevronDown className="size-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {closed ? (
        <div className="pb-safe flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-card/85 px-4 py-3 text-sm text-muted-foreground backdrop-blur-xl">
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
  // Foto tanpa caption: jam ditumpuk di atas foto seperti WhatsApp.
  const overlayMeta = isImage && !body;
  return (
    <div
      className={cn(
        "flex",
        mine ? "justify-end pr-2" : "justify-start pl-2",
        groupStart ? "pt-2" : "pt-0.5",
        // groupEnd dipakai untuk jarak bawah kelompok agar ritme baca lebih rapi.
        groupEnd && "pb-0.5",
      )}
    >
      <div
        className={cn(
          "relative max-w-[80%] rounded-[18px] text-[16px] leading-[1.3] shadow-[0_1px_0.5px_oklch(0_0_0/13%)] sm:max-w-[65%]",
          isImage ? "p-[3px]" : "px-3 pb-1.5 pt-1.5",
          mine ? "bg-chat-out text-chat-out-foreground" : "bg-card text-card-foreground",
          // Ekor hanya di pesan pertama kelompok; sudut atasnya dibuat siku.
          groupStart && (mine ? "rounded-tr-[4px]" : "rounded-tl-[4px]"),
        )}
      >
        {groupStart ? <BubbleTail mine={mine} /> : null}
        {attachment ? (
          <div className="relative">
            <AttachmentView attachment={attachment} url={attachmentUrl} mine={mine} />
            {overlayMeta ? (
              <span className="absolute bottom-1.5 right-1.5">
                <BubbleMeta time={time} mine={mine} read={read} overlay />
              </span>
            ) : null}
            {!isImage && !body ? (
              <span className="flex justify-end pt-0.5">
                <BubbleMeta time={time} mine={mine} read={read} />
              </span>
            ) : null}
          </div>
        ) : null}
        {body ? (
          <p className={cn("whitespace-pre-line break-words", isImage && "px-2 pb-1 pt-1")}>
            {body}
            {/* Penyedia ruang tak terlihat supaya jam absolut tidak menimpa teks baris terakhir. */}
            <span className="invisible ml-2 inline-block align-bottom" aria-hidden="true">
              <BubbleMeta time={time} mine={mine} read={read} />
            </span>
            <span className={cn("absolute bottom-1.5", isImage ? "right-2.5" : "right-3")}>
              <BubbleMeta time={time} mine={mine} read={read} />
            </span>
          </p>
        ) : null}
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
            mine ? "bg-chat-out-foreground/10" : "bg-muted",
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
          <Loader2
            className="size-5 animate-spin motion-reduce:animate-none"
            aria-label="Memuat foto"
          />
        </div>
      );
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={url}
          alt={attachment.name}
          loading="lazy"
          decoding="async"
          className="max-h-80 w-auto max-w-full rounded-[15px] object-cover"
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
          mine ? "bg-chat-out-foreground/10" : "bg-muted",
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
  const hasText = draft.trim().length > 0;
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
      className="pb-safe flex items-end gap-1 border-t border-border/60 bg-card/85 px-1.5 py-1.5 backdrop-blur-xl sm:px-2"
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
        </>
      ) : null}
      {onAttach ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Lampirkan"
              className="grid size-11 shrink-0 place-items-center rounded-full text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="size-6" strokeWidth={2.25} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-52 rounded-2xl p-1.5">
            <DropdownMenuItem
              className="min-h-11 gap-3 rounded-xl"
              onSelect={() => imageRef.current?.click()}
            >
              <ImageIcon className="size-5 text-primary" aria-hidden="true" /> Foto
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11 gap-3 rounded-xl"
              onSelect={() => fileRef.current?.click()}
            >
              <FileText className="size-5 text-primary" aria-hidden="true" /> Dokumen
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11 gap-3 rounded-xl"
              onSelect={() => onAttach({ kind: "location" })}
            >
              <MapPin className="size-5 text-primary" aria-hidden="true" /> Lokasi saya
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <div className="my-1 flex min-h-9 flex-1 items-end rounded-[18px] border border-border bg-background px-3 focus-within:border-accent/60">
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
          // text-base (16px) mencegah iOS Safari auto-zoom saat input difokus.
          className="max-h-[120px] min-w-0 flex-1 resize-none bg-transparent py-[7px] text-base leading-snug outline-none placeholder:text-muted-foreground"
        />
      </div>
      {/* Seperti WhatsApp iOS: kosong = kamera, ada teks = tombol kirim. */}
      {onAttach && !hasText ? (
        <button
          type="button"
          aria-label="Kirim foto"
          onClick={() => imageRef.current?.click()}
          className="grid size-11 shrink-0 place-items-center rounded-full text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Camera className="size-6" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="submit"
          aria-label="Kirim pesan"
          disabled={!hasText}
          className="press-scale group grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground">
            <SendHorizontal className="size-[18px]" aria-hidden="true" />
          </span>
        </button>
      )}
    </form>
  );
}
