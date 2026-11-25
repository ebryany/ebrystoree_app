import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type TouchEvent,
} from "react";
import { Link } from "@tanstack/react-router";
import {
  Ban,
  BellOff,
  BriefcaseBusiness,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  FileText,
  ImageIcon,
  Info,
  Loader2,
  Mail,
  MapPin,
  Mic,
  MoreVertical,
  Package,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Reply,
  Search,
  SendHorizontal,
  ShieldAlert,
  ShoppingBag,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CHAT_REACTION_EMOJIS, type ChatAttachment } from "@/lib/inquiries.functions";
import { formatRupiah } from "@/lib/format";
import { cn, isRenderableImageUrl, optimizedMediaUrl } from "@/lib/utils";
import {
  detectOffPlatformRisk,
  matchQuickReplies,
  renderFormattedChatText,
} from "./chat-format";
import {
  AttachmentPreviewBar,
  CatalogCardPicker,
  ChatMediaDrawer,
  EmojiQuickPicker,
  ImageLightbox,
  type StagedAttachment,
} from "./chat-overlays";
import { loadThreadDraft, saveThreadDraft } from "./chat-prefs";
import { chatDayLabel } from "./chat-time";
import { VoiceNotePlayer, VoiceNoteRecorder, type RecordedVoiceNote } from "./voice-note";

export type ChatMessage = {
  id: string;
  sender_id: string | null;
  sender_role: string;
  body: string;
  is_system: boolean | null;
  created_at: string;
  attachment?: ChatAttachment | null;
  reply_to_id?: string | null;
  reactions?: Record<string, string[]> | null;
  edited_at?: string | null;
  deleted_at?: string | null;
};

export type ChatPendingMessage = {
  tempId: string;
  body: string;
  status: "sending" | "failed" | "queued";
  replyToId?: string | null;
  /** Label lampiran yang sedang diunggah, mis. "Pesan suara (0:08)". */
  attachmentLabel?: string;
};

export type ChatAttachInput =
  | { kind: "image"; file: File; caption?: string }
  | { kind: "gallery"; files: File[]; caption?: string }
  | { kind: "file"; file: File; caption?: string }
  | { kind: "audio"; file: File; durationSec: number; waveform: number[] }
  | { kind: "location" }
  | { kind: "product"; productId: string; label: string }
  | { kind: "service"; serviceId: string; label: string };

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const FILE_ACCEPT =
  ".pdf,.zip,.txt,.doc,.docx,.xls,.xlsx,.pptx,application/pdf,application/zip,text/plain";

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

type Props = {
  threadId: string;
  title: string;
  partnerName: string;
  partnerAvatarUrl?: string | null;
  roleLabel: string;
  statusLabel: string;
  status: string;
  closed: boolean;
  storeId?: string | null;
  productSlot?: ReactNode;
  backSlot?: ReactNode;
  messages: ChatMessage[];
  replyTargets?: Record<string, Partial<ChatMessage>>;
  pending: ChatPendingMessage[];
  selfId: string | null | undefined;
  viewerRole: "customer" | "seller" | "staff";
  partnerTyping: boolean;
  partnerRecording?: boolean;
  partnerOnline: boolean;
  myReadAt: string | null;
  partnerReadAt: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onSend: (body: string, opts?: { replyToId?: string | null }) => void;
  onRetry: (tempId: string, body: string, replyToId?: string | null) => void;
  onDiscardPending?: (tempId: string) => void;
  onToggleClosed: () => void;
  canToggleClosed: boolean;
  onDraftChange?: () => void;
  onRecordingPulse?: (active: boolean) => void;
  onAttach?: (input: ChatAttachInput, opts?: { replyToId?: string | null }) => void;
  onReact?: (messageId: string, emoji: (typeof CHAT_REACTION_EMOJIS)[number]) => void;
  onEditMessage?: (messageId: string, body: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onRefreshAttachmentUrl?: (path: string) => void;
  attachmentUrls?: Record<string, string>;
  pinned?: boolean;
  onTogglePin?: () => void;
  onMarkUnread?: () => void;
  muted?: boolean;
  onToggleMute?: () => void;
  onEnableBrowserNotify?: () => void;
  isOffline?: boolean;
  embedded?: boolean;
};

const NEAR_BOTTOM_PX = 120;
const GROUP_GAP_MS = 5 * 60 * 1000;
const EDIT_WINDOW_MS = 15 * 60 * 1000;

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

function replySnippet(msg: Partial<ChatMessage>): string {
  if (msg.deleted_at) return "Pesan ini dihapus";
  if (msg.body?.trim()) return msg.body.trim();
  const att = msg.attachment;
  if (!att) return "Pesan";
  if (att.kind === "image") return "Foto";
  if (att.kind === "gallery") return `Album foto (${att.items.length})`;
  if (att.kind === "audio") return "Pesan suara";
  if (att.kind === "location") return "Lokasi";
  if (att.kind === "product") return `Produk: ${att.name ?? "Produk digital"}`;
  if (att.kind === "service") return `Jasa: ${att.name ?? "Jasa seller"}`;
  return `Dokumen: ${att.name}`;
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

function BubbleMeta({
  time,
  mine,
  read,
  sending,
  edited,
  overlay,
}: {
  time: string;
  mine: boolean;
  read?: boolean;
  sending?: boolean;
  edited?: boolean;
  overlay?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-[11px] leading-none tabular-nums",
        overlay
          ? "rounded-full bg-black/50 px-1.5 py-1 text-white"
          : mine
            ? "text-chat-out-foreground/65"
            : "text-muted-foreground",
      )}
    >
      {edited ? <span className="italic">Diedit</span> : null}
      <span>{time}</span>
      {mine ? (
        sending ? (
          <Clock className="size-3" aria-label="Mengirim" />
        ) : read ? (
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

/** Jendela chat modern ala WhatsApp: split/mobile full-screen, VN, reply, reaksi, lightbox, search, drawer. */
export function ChatWindow({
  threadId,
  title,
  partnerName,
  partnerAvatarUrl,
  roleLabel,
  statusLabel,
  closed,
  storeId,
  productSlot,
  backSlot,
  messages,
  replyTargets,
  pending,
  selfId,
  viewerRole,
  partnerTyping,
  partnerRecording = false,
  partnerOnline,
  myReadAt,
  partnerReadAt,
  hasMore,
  loadingMore,
  onLoadMore,
  onSend,
  onRetry,
  onDiscardPending,
  onToggleClosed,
  canToggleClosed,
  onDraftChange,
  onRecordingPulse,
  onAttach,
  onReact,
  onEditMessage,
  onDeleteMessage,
  onRefreshAttachmentUrl,
  attachmentUrls,
  pinned = false,
  onTogglePin,
  onMarkUnread,
  muted = false,
  onToggleMute,
  onEnableBrowserNotify,
  isOffline = false,
  embedded = false,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const lastTailIdRef = useRef<string | null>(null);
  const prevFirstIdRef = useRef<string | null>(null);
  const prevScrollHeightRef = useRef(0);

  const [showJump, setShowJump] = useState(false);
  const [unseenBelow, setUnseenBelow] = useState(0);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Pencarian pesan di dalam percakapan
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchCursor, setSearchCursor] = useState(0);

  // Overlay & panel tambahan
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{
    items: Array<{ url: string; name: string }>;
    index: number;
  } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [dismissedSafety, setDismissedSafety] = useState(false);
  const [stagedFromDrop, setStagedFromDrop] = useState<File[] | null>(null);

  // Adaptasi tinggi layar mobile saat virtual keyboard terbuka (visualViewport).
  const [mobileViewportHeight, setMobileViewportHeight] = useState<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const sync = () => {
      if (window.innerWidth < 768) {
        setMobileViewportHeight(Math.round(vv.height));
      } else {
        setMobileViewportHeight(null);
      }
    };
    sync();
    vv.addEventListener("resize", sync);
    window.addEventListener("resize", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  // Reset seluruh state lokal ketika threadId berubah (pencegahan kebocoran lintas thread).
  useEffect(() => {
    nearBottomRef.current = true;
    lastTailIdRef.current = null;
    prevFirstIdRef.current = null;
    prevScrollHeightRef.current = 0;
    setShowJump(false);
    setUnseenBelow(0);
    setReplyingTo(null);
    setEditingMsg(null);
    setSearchOpen(false);
    setSearchTerm("");
    setSearchCursor(0);
    setDrawerOpen(false);
    setCatalogOpen(false);
    setLightbox(null);
    setDismissedSafety(false);
  }, [threadId]);

  const initial = (partnerName.trim()[0] ?? "?").toUpperCase();
  const partnerImg = isRenderableImageUrl(partnerAvatarUrl) ? partnerAvatarUrl : null;

  const messageById = useMemo(() => {
    const map = new Map<string, Partial<ChatMessage>>();
    if (replyTargets) {
      for (const [k, v] of Object.entries(replyTargets)) map.set(k, v);
    }
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages, replyTargets]);

  const searchMatches = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [] as string[];
    return messages
      .filter((m) => !m.deleted_at && m.body.toLowerCase().includes(q))
      .map((m) => m.id);
  }, [messages, searchTerm]);

  useEffect(() => {
    setSearchCursor(searchMatches.length ? searchMatches.length - 1 : 0);
  }, [searchMatches.length, searchTerm]);

  const scrollToMessage = useCallback((messageId: string) => {
    const target = document.getElementById(`msg-${messageId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(messageId);
    window.setTimeout(() => {
      setHighlightedId((cur) => (cur === messageId ? null : cur));
    }, 1800);
  }, []);

  useEffect(() => {
    if (searchOpen && searchMatches.length > 0) {
      const targetId = searchMatches[searchCursor];
      if (targetId) scrollToMessage(targetId);
    }
  }, [searchOpen, searchCursor, searchMatches, scrollToMessage]);

  const showSafetyNotice = useMemo(
    () =>
      !dismissedSafety &&
      messages.slice(-12).some((m) => !m.deleted_at && detectOffPlatformRisk(m.body)),
    [dismissedSafety, messages],
  );

  function scrollToBottom(smooth = false) {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }

  // Scroll anchoring presisi:
  // 1) Jika pesan lebih lama ditambahkan di atas (loadMore), tahan posisi scroll.
  // 2) Jika pesan baru masuk di bawah, gulir hanya saat dekat bawah; jika tidak, naikkan counter.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const firstId = messages[0]?.id ?? null;
    const tailId = pending[pending.length - 1]?.tempId ?? messages[messages.length - 1]?.id ?? null;

    if (el && prevFirstIdRef.current && firstId && firstId !== prevFirstIdRef.current) {
      const delta = el.scrollHeight - prevScrollHeightRef.current;
      if (delta > 0) el.scrollTop += delta;
      prevFirstIdRef.current = firstId;
      prevScrollHeightRef.current = el.scrollHeight;
      return;
    }

    const isInitial = lastTailIdRef.current === null && tailId !== null;
    const tailChanged = tailId !== null && tailId !== lastTailIdRef.current;
    prevFirstIdRef.current = firstId;
    lastTailIdRef.current = tailId;
    if (el) prevScrollHeightRef.current = el.scrollHeight;

    if (isInitial || (tailChanged && nearBottomRef.current)) {
      scrollToBottom(false);
      setUnseenBelow(0);
    } else if (tailChanged) {
      setShowJump(true);
      setUnseenBelow((n) => n + 1);
    }
  }, [messages, pending]);

  useEffect(() => {
    if ((partnerTyping || partnerRecording) && nearBottomRef.current) scrollToBottom(true);
  }, [partnerTyping, partnerRecording]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    nearBottomRef.current = near;
    if (near) {
      setShowJump((v) => (v ? false : v));
      setUnseenBelow(0);
    }
  }

  function handleLoadMore() {
    if (scrollRef.current) prevScrollHeightRef.current = scrollRef.current.scrollHeight;
    onLoadMore();
  }

  function handleSendText(text: string) {
    if (editingMsg && onEditMessage) {
      onEditMessage(editingMsg.id, text);
      setEditingMsg(null);
      return;
    }
    onSend(text, { replyToId: replyingTo?.id ?? null });
    setReplyingTo(null);
    nearBottomRef.current = true;
    requestAnimationFrame(() => scrollToBottom(true));
  }

  function handleAttach(input: ChatAttachInput) {
    if (!onAttach) return;
    onAttach(input, { replyToId: replyingTo?.id ?? null });
    setReplyingTo(null);
    nearBottomRef.current = true;
    requestAnimationFrame(() => scrollToBottom(true));
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    if (!onAttach || closed) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) setStagedFromDrop(files);
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

  const presence = partnerRecording
    ? "merekam suara..."
    : partnerTyping
      ? "mengetik..."
      : partnerOnline
        ? "Online"
        : roleLabel;

  return (
    <div
      onDragOver={(e) => {
        if (!onAttach || closed) return;
        e.preventDefault();
        if (!dragActive) setDragActive(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragActive(false);
      }}
      onDrop={handleDrop}
      style={mobileViewportHeight ? { height: `${mobileViewportHeight}px` } : undefined}
      className={cn(
        "fixed inset-x-0 top-0 z-50 flex h-[100dvh] flex-col overflow-hidden bg-card",
        "md:relative md:inset-auto md:z-auto md:mx-auto md:h-[calc(100dvh-8.5rem)] md:min-h-[28rem] md:w-full md:max-w-3xl md:rounded-2xl md:border md:border-border",
        embedded
          ? "lg:mx-0 lg:h-full lg:min-h-0 lg:max-w-none lg:rounded-none lg:border-0"
          : "lg:h-[calc(100dvh-7.5rem)]",
      )}
    >
      {/* Overlay seret-dan-lepas lampiran */}
      {dragActive ? (
        <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-primary/15 backdrop-blur-[2px]">
          <div className="rounded-2xl border-2 border-dashed border-primary bg-card/95 px-6 py-5 text-center shadow-lg">
            <ImageIcon className="mx-auto size-8 text-primary" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-foreground">
              Lepas foto atau dokumen di sini
            </p>
            <p className="text-xs text-muted-foreground">Hingga 4 foto atau 1 dokumen (maks 10 MB)</p>
          </div>
        </div>
      ) : null}

      {/* Header clean ala WhatsApp */}
      <header className="pt-safe z-10 border-b border-border/70 bg-card/95 backdrop-blur-xl">
        <div className="flex min-h-14 items-center gap-1.5 px-1.5 sm:gap-2 sm:px-3">
          {backSlot}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="relative shrink-0" aria-hidden="true">
              <span className="grid size-10 place-items-center overflow-hidden rounded-full border border-border/60 bg-surface-selected text-[15px] font-semibold text-primary">
                {partnerImg ? (
                  <img
                    src={optimizedMediaUrl(partnerImg, 96)}
                    alt=""
                    width={40}
                    height={40}
                    className="size-full object-cover"
                  />
                ) : (
                  initial
                )}
              </span>
              {partnerOnline ? (
                <span className="absolute bottom-0 right-0 size-3 rounded-full bg-success ring-2 ring-card" />
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold leading-tight text-foreground">
                {partnerName}
              </span>
              <span
                aria-live="polite"
                className={cn(
                  "block truncate text-[12px] leading-tight",
                  partnerTyping || partnerRecording
                    ? "font-medium text-primary"
                    : partnerOnline
                      ? "text-success"
                      : "text-muted-foreground",
                )}
              >
                {presence}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Cari pesan dalam percakapan"
            aria-expanded={searchOpen}
            className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Search className="size-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Info dan media percakapan"
            className="hidden size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid"
          >
            <Info className="size-5" aria-hidden="true" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Menu percakapan"
                className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MoreVertical className="size-5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl p-1.5">
              <DropdownMenuItem className="min-h-11 gap-2.5 rounded-xl" onSelect={() => setDrawerOpen(true)}>
                <Info className="size-4" /> Info, media & tautan
              </DropdownMenuItem>
              {onTogglePin ? (
                <DropdownMenuItem className="min-h-11 gap-2.5 rounded-xl" onSelect={onTogglePin}>
                  {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                  {pinned ? "Lepas sematan chat" : "Sematkan percakapan"}
                </DropdownMenuItem>
              ) : null}
              {onMarkUnread ? (
                <DropdownMenuItem className="min-h-11 gap-2.5 rounded-xl" onSelect={onMarkUnread}>
                  <Mail className="size-4" /> Tandai belum dibaca
                </DropdownMenuItem>
              ) : null}
              {onToggleMute ? (
                <DropdownMenuItem className="min-h-11 gap-2.5 rounded-xl" onSelect={onToggleMute}>
                  <BellOff className="size-4" />
                  {muted ? "Aktifkan suara chat" : "Bisukan suara chat"}
                </DropdownMenuItem>
              ) : null}
              {canToggleClosed ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="min-h-11 gap-2.5 rounded-xl" onSelect={onToggleClosed}>
                    <Ban className="size-4" />
                    {closed ? "Buka kembali percakapan" : `Tutup percakapan (${statusLabel})`}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Bar pencarian in-chat */}
        {searchOpen ? (
          <div className="flex items-center gap-1.5 border-t border-border/60 bg-surface/80 px-3 py-2">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari teks di percakapan ini..."
              aria-label="Kata kunci pencarian pesan"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {searchTerm.trim() ? (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {searchMatches.length ? `${searchCursor + 1}/${searchMatches.length}` : "0/0"}
              </span>
            ) : null}
            <button
              type="button"
              disabled={searchMatches.length === 0}
              onClick={() =>
                setSearchCursor((c) => (c > 0 ? c - 1 : searchMatches.length - 1))
              }
              aria-label="Hasil sebelumnya"
              className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-muted disabled:opacity-40"
            >
              <ChevronUp className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={searchMatches.length === 0}
              onClick={() =>
                setSearchCursor((c) => (c < searchMatches.length - 1 ? c + 1 : 0))
              }
              aria-label="Hasil berikutnya"
              className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-muted disabled:opacity-40"
            >
              <ChevronDown className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false);
                setSearchTerm("");
              }}
              aria-label="Tutup pencarian"
              className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-muted"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {productSlot}

        {/* Peringatan offline */}
        {isOffline ? (
          <div
            role="status"
            className="flex items-center gap-2 border-t border-warning/30 bg-warning/15 px-3 py-1.5 text-xs font-medium text-warning-foreground"
          >
            <WifiOff className="size-3.5 shrink-0" aria-hidden="true" />
            <span>Koneksi terputus. Pesan yang dikirim akan masuk antrean otomatis.</span>
          </div>
        ) : null}

        {/* Peringatan keamanan anti-transaksi luar platform */}
        {showSafetyNotice ? (
          <div
            role="status"
            className="flex items-center justify-between gap-2 border-t border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground"
          >
            <p className="flex min-w-0 items-center gap-2">
              <ShieldAlert className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                Demi keamanan, lakukan pembayaran dan serah terima hasil hanya di Ebrystore.
              </span>
            </p>
            <button
              type="button"
              onClick={() => setDismissedSafety(true)}
              aria-label="Tutup pengingat keamanan"
              className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-muted"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </header>
      <span className="sr-only">{title}</span>

      {/* Area daftar pesan + tombol lompat ke bawah melayang */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          role="log"
          aria-label="Riwayat pesan"
          className="chat-wallpaper relative flex-1 overflow-y-auto overscroll-contain px-2.5 py-2.5 sm:px-[6%]"
        >
          {hasMore ? (
            <div className="pb-2 pt-1 text-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 rounded-full bg-card/90 px-4 text-xs font-semibold text-primary shadow-sm"
                disabled={loadingMore}
                onClick={handleLoadMore}
              >
                {loadingMore ? "Memuat..." : "Muat pesan sebelumnya"}
              </Button>
            </div>
          ) : null}

          {messages.map((message, index) => {
            const prev = messages[index - 1];
            const next = messages[index + 1];
            const dayBreak = !prev || !sameDay(prev.created_at, message.created_at);
            const mine = message.sender_id === selfId;
            const quoted = message.reply_to_id ? messageById.get(message.reply_to_id) : undefined;
            const canEdit =
              mine &&
              !message.deleted_at &&
              !message.is_system &&
              Boolean(message.body.trim()) &&
              !closed &&
              Date.now() - new Date(message.created_at).getTime() <= EDIT_WINDOW_MS;
            const canDelete = (mine || viewerRole === "staff") && !message.deleted_at && !message.is_system;

            return (
              <div
                key={message.id}
                id={`msg-${message.id}`}
                className={cn(
                  "rounded-xl transition-colors duration-500",
                  highlightedId === message.id && "bg-primary/15",
                )}
              >
                {dayBreak ? (
                  <p className="sticky top-1 z-[1] flex justify-center py-2">
                    <span className="rounded-lg bg-card/95 px-3 py-1 text-[12px] font-medium text-muted-foreground shadow-sm">
                      {chatDayLabel(message.created_at)}
                    </span>
                  </p>
                ) : null}
                {index === unreadDividerIndex ? (
                  <p className="-mx-2.5 my-2 bg-card/80 py-1 text-center text-[12px] font-semibold text-primary sm:-mx-[6%]">
                    Pesan baru
                  </p>
                ) : null}
                {message.is_system ? (
                  <p className="flex justify-center py-1.5">
                    <span className="max-w-[85%] rounded-lg bg-card/90 px-3 py-1 text-center text-[12px] text-muted-foreground shadow-sm">
                      {message.body}
                    </span>
                  </p>
                ) : (
                  <Bubble
                    message={message}
                    quoted={quoted}
                    partnerName={partnerName}
                    selfId={selfId}
                    attachmentUrls={attachmentUrls}
                    time={clockTime(message.created_at)}
                    mine={mine}
                    groupStart={!sameGroup(prev, message)}
                    groupEnd={!sameGroup(message, next)}
                    read={
                      mine &&
                      partnerReadTime !== null &&
                      new Date(message.created_at).getTime() <= partnerReadTime
                    }
                    searchTerm={searchOpen ? searchTerm : ""}
                    canEdit={canEdit && Boolean(onEditMessage)}
                    canDelete={canDelete && Boolean(onDeleteMessage)}
                    closed={closed}
                    onReply={() => {
                      setEditingMsg(null);
                      setReplyingTo(message);
                    }}
                    onEdit={() => {
                      setReplyingTo(null);
                      setEditingMsg(message);
                    }}
                    onDelete={() => onDeleteMessage?.(message.id)}
                    onReact={(emoji) => onReact?.(message.id, emoji)}
                    onJumpToQuoted={(qid) => scrollToMessage(qid)}
                    onOpenLightbox={(items, idx) => setLightbox({ items, index: idx })}
                    onRefreshAttachmentUrl={onRefreshAttachmentUrl}
                  />
                )}
              </div>
            );
          })}

          {pending.map((item) => (
            <div key={item.tempId} className="flex justify-end pr-2 pt-1">
              <div
                className={cn(
                  "relative max-w-[82%] rounded-[18px] px-3 pb-1.5 pt-1.5 text-[15px] leading-[1.35] shadow-[0_1px_0.5px_oklch(0_0_0/13%)] sm:max-w-[65%]",
                  item.status === "failed"
                    ? "border border-destructive bg-card text-foreground"
                    : "bg-chat-out text-chat-out-foreground opacity-90",
                )}
              >
                {item.attachmentLabel ? (
                  <p className="text-xs font-semibold opacity-85">{item.attachmentLabel}</p>
                ) : null}
                {item.status !== "failed" ? (
                  <p className="whitespace-pre-line break-words">
                    {item.body || (item.status === "queued" ? "Menunggu koneksi..." : "")}
                    <span className="ml-2 inline-block align-bottom">
                      <BubbleMeta
                        time={item.status === "queued" ? "Antre" : ""}
                        mine
                        sending
                      />
                    </span>
                  </p>
                ) : (
                  <>
                    {item.body ? (
                      <p className="whitespace-pre-line break-words">{item.body}</p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => onRetry(item.tempId, item.body, item.replyToId)}
                        className="inline-flex min-h-11 items-center text-xs font-semibold text-destructive underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Gagal, coba lagi
                      </button>
                      {onDiscardPending ? (
                        <button
                          type="button"
                          onClick={() => onDiscardPending(item.tempId)}
                          className="inline-flex min-h-11 items-center text-xs text-muted-foreground hover:text-foreground"
                        >
                          Hapus
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}

          {partnerTyping || partnerRecording ? (
            <div className="flex justify-start pl-2 pt-1.5">
              <div className="relative flex items-center gap-1.5 rounded-[18px] bg-card px-3.5 py-2.5 shadow-[0_1px_0.5px_oklch(0_0_0/13%)]">
                <BubbleTail mine={false} />
                {partnerRecording ? (
                  <>
                    <Mic className="size-4 text-primary motion-safe:animate-pulse" aria-hidden="true" />
                    <span className="text-xs font-medium text-muted-foreground">
                      Merekam suara...
                    </span>
                  </>
                ) : (
                  <>
                    <span className="sr-only">Lawan bicara sedang mengetik</span>
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        aria-hidden="true"
                        className="size-2 animate-bounce rounded-full bg-muted-foreground/60 motion-reduce:animate-none"
                        style={{ animationDelay: `${dot * 150}ms` }}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Tombol lompat ke bawah melayang di luar aliran daftar */}
        {showJump ? (
          <button
            type="button"
            aria-label="Lompat ke pesan terbaru"
            onClick={() => {
              nearBottomRef.current = true;
              setShowJump(false);
              setUnseenBelow(0);
              scrollToBottom(true);
            }}
            className="absolute bottom-3 right-3 z-20 grid size-11 place-items-center rounded-full border border-border bg-card/95 text-foreground shadow-[0_3px_10px_oklch(0_0_0/18%)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown className="size-5" aria-hidden="true" />
            {unseenBelow > 0 ? (
              <span className="absolute -top-2 right-0 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground tabular-nums">
                {unseenBelow > 99 ? "99+" : unseenBelow}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>

      {closed ? (
        <div className="pb-safe flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-card/95 px-4 py-3 text-sm text-muted-foreground backdrop-blur-xl">
          <span>Percakapan ini sudah ditutup.</span>
          {canToggleClosed ? (
            <Button variant="outline" size="sm" className="min-h-11" onClick={onToggleClosed}>
              Buka kembali
            </Button>
          ) : null}
        </div>
      ) : (
        <Composer
          threadId={threadId}
          viewerRole={viewerRole}
          partnerName={partnerName}
          selfId={selfId}
          replyingTo={replyingTo}
          editingMsg={editingMsg}
          onCancelReply={() => setReplyingTo(null)}
          onCancelEdit={() => setEditingMsg(null)}
          onSend={handleSendText}
          onDraftChange={onDraftChange}
          onRecordingPulse={onRecordingPulse}
          onAttach={onAttach ? handleAttach : undefined}
          onOpenCatalog={onAttach ? () => setCatalogOpen(true) : undefined}
          droppedFiles={stagedFromDrop}
          onConsumedDroppedFiles={() => setStagedFromDrop(null)}
        />
      )}

      {/* Lightbox gambar */}
      {lightbox ? (
        <ImageLightbox
          items={lightbox.items}
          index={lightbox.index}
          onIndexChange={(next) => setLightbox((cur) => (cur ? { ...cur, index: next } : null))}
          onClose={() => setLightbox(null)}
        />
      ) : null}

      {/* Dialog kirim kartu produk/jasa */}
      <CatalogCardPicker
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        storeId={storeId}
        onSelectProduct={(productId, label) => handleAttach({ kind: "product", productId, label })}
        onSelectService={(serviceId, label) => handleAttach({ kind: "service", serviceId, label })}
      />

      {/* Drawer info, media, dokumen & tautan */}
      <ChatMediaDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        partnerName={partnerName}
        roleLabel={roleLabel}
        messages={messages}
        attachmentUrls={attachmentUrls}
        onOpenImage={(url, name) => {
          setDrawerOpen(false);
          setLightbox({ items: [{ url, name }], index: 0 });
        }}
        pinned={pinned}
        onTogglePin={onTogglePin}
        muted={muted}
        onToggleMute={onToggleMute}
        onEnableBrowserNotify={onEnableBrowserNotify}
        canToggleClosed={canToggleClosed}
        closed={closed}
        onToggleClosed={onToggleClosed}
      />
    </div>
  );
}

/** Satu bubble pesan (di-memo) lengkap dengan swipe-to-reply, quote, reaksi, edit & soft-delete. */
const Bubble = memo(function Bubble({
  message,
  quoted,
  partnerName,
  selfId,
  attachmentUrls,
  time,
  mine,
  groupStart,
  groupEnd,
  read,
  searchTerm,
  canEdit,
  canDelete,
  closed,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onJumpToQuoted,
  onOpenLightbox,
  onRefreshAttachmentUrl,
}: {
  message: ChatMessage;
  quoted?: Partial<ChatMessage>;
  partnerName: string;
  selfId: string | null | undefined;
  attachmentUrls?: Record<string, string>;
  time: string;
  mine: boolean;
  groupStart: boolean;
  groupEnd: boolean;
  read: boolean;
  searchTerm: string;
  canEdit: boolean;
  canDelete: boolean;
  closed: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: (typeof CHAT_REACTION_EMOJIS)[number]) => void;
  onJumpToQuoted: (id: string) => void;
  onOpenLightbox: (items: Array<{ url: string; name: string }>, index: number) => void;
  onRefreshAttachmentUrl?: (path: string) => void;
}) {
  const [swipeX, setSwipeX] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const deleted = Boolean(message.deleted_at);
  const attachment = deleted ? null : (message.attachment ?? null);
  const body = deleted ? "" : message.body;
  const isImage = attachment?.kind === "image";
  const isGallery = attachment?.kind === "gallery";
  const overlayMeta = (isImage || isGallery) && !body && !quoted;

  const reactionEntries = useMemo(() => {
    if (deleted || !message.reactions) return [];
    return Object.entries(message.reactions).filter(
      ([, users]) => Array.isArray(users) && users.length > 0,
    );
  }, [deleted, message.reactions]);

  function onTouchStart(e: TouchEvent<HTMLDivElement>) {
    if (deleted || closed) return;
    const t = e.touches[0];
    if (t) touchStartRef.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchMove(e: TouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current;
    const t = e.touches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = Math.abs(t.clientY - start.y);
    if (dy > 24) {
      touchStartRef.current = null;
      setSwipeX(0);
      return;
    }
    if (dx > 8) setSwipeX(Math.min(64, dx));
  }
  function onTouchEnd() {
    if (swipeX >= 48) onReply();
    touchStartRef.current = null;
    setSwipeX(0);
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={cn(
        "group/row relative flex items-center gap-1",
        mine ? "justify-end pr-2" : "justify-start pl-2",
        groupStart ? "pt-2" : "pt-0.5",
        groupEnd && "pb-1",
      )}
    >
      {/* Indikator swipe-to-reply mobile */}
      {swipeX > 12 ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-2 grid size-8 place-items-center rounded-full bg-surface-selected text-primary"
          style={{ opacity: Math.min(1, swipeX / 48) }}
        >
          <Reply className="size-4" />
        </span>
      ) : null}

      {/* Tombol menu aksi di kiri bubble milik sendiri */}
      {mine && !deleted ? (
        <BubbleActionsMenu
          body={body}
          closed={closed}
          canEdit={canEdit}
          canDelete={canDelete}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
          onReact={onReact}
        />
      ) : null}

      <div
        className="flex max-w-[82%] flex-col sm:max-w-[66%]"
        style={swipeX ? { transform: `translateX(${swipeX}px)` } : undefined}
      >
        <div
          className={cn(
            "relative rounded-[18px] text-[15px] leading-[1.35] shadow-[0_1px_0.5px_oklch(0_0_0/13%)]",
            (isImage || isGallery) && !quoted ? "p-[3px]" : "px-3 pb-1.5 pt-1.5",
            mine ? "bg-chat-out text-chat-out-foreground" : "bg-card text-card-foreground",
            groupStart && (mine ? "rounded-tr-[4px]" : "rounded-tl-[4px]"),
          )}
        >
          {groupStart ? <BubbleTail mine={mine} /> : null}

          {deleted ? (
            <p className="flex items-center gap-1.5 text-[14px] italic opacity-75">
              <Ban className="size-3.5 shrink-0" aria-hidden="true" />
              <span>Pesan ini dihapus</span>
              <span className="ml-2 inline-block align-bottom">
                <BubbleMeta time={time} mine={mine} read={read} />
              </span>
            </p>
          ) : (
            <>
              {/* Blok kutipan / Reply */}
              {quoted && message.reply_to_id ? (
                <button
                  type="button"
                  onClick={() => onJumpToQuoted(message.reply_to_id!)}
                  className={cn(
                    "mb-1.5 block w-full rounded-lg border-l-[3px] border-primary px-2.5 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    mine
                      ? "bg-chat-out-foreground/8 hover:bg-chat-out-foreground/12"
                      : "bg-muted/80 hover:bg-muted",
                  )}
                >
                  <span className="block truncate font-semibold text-primary">
                    {quoted.sender_id === selfId ? "Anda" : partnerName}
                  </span>
                  <span className="line-clamp-2 break-words opacity-80">
                    {replySnippet(quoted)}
                  </span>
                </button>
              ) : null}

              {attachment ? (
                <div className="relative">
                  <AttachmentView
                    attachment={attachment}
                    attachmentUrls={attachmentUrls}
                    mine={mine}
                    onOpenLightbox={onOpenLightbox}
                    onRefreshAttachmentUrl={onRefreshAttachmentUrl}
                  />
                  {overlayMeta ? (
                    <span className="absolute bottom-1.5 right-1.5">
                      <BubbleMeta time={time} mine={mine} read={read} overlay />
                    </span>
                  ) : null}
                  {!overlayMeta && !body ? (
                    <span className="flex justify-end pt-1">
                      <BubbleMeta
                        time={time}
                        mine={mine}
                        read={read}
                        edited={Boolean(message.edited_at)}
                      />
                    </span>
                  ) : null}
                </div>
              ) : null}

              {body ? (
                <p
                  className={cn(
                    "whitespace-pre-line break-words",
                    (isImage || isGallery) && !quoted && "px-2 pb-1 pt-1.5",
                  )}
                >
                  {renderFormattedChatText(body, searchTerm)}
                  <span className="invisible ml-2 inline-block align-bottom" aria-hidden="true">
                    <BubbleMeta
                      time={time}
                      mine={mine}
                      read={read}
                      edited={Boolean(message.edited_at)}
                    />
                  </span>
                  <span
                    className={cn(
                      "absolute bottom-1.5",
                      (isImage || isGallery) && !quoted ? "right-2.5" : "right-3",
                    )}
                  >
                    <BubbleMeta
                      time={time}
                      mine={mine}
                      read={read}
                      edited={Boolean(message.edited_at)}
                    />
                  </span>
                </p>
              ) : null}
            </>
          )}
        </div>

        {/* Bar reaksi emoji di bawah bubble */}
        {reactionEntries.length > 0 ? (
          <div className={cn("mt-0.5 flex flex-wrap gap-1", mine ? "justify-end" : "justify-start")}>
            {reactionEntries.map(([emoji, users]) => {
              const reactedByMe = Boolean(selfId && users.includes(selfId));
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReact(emoji as (typeof CHAT_REACTION_EMOJIS)[number])}
                  aria-label={`Reaksi ${emoji} (${users.length})`}
                  aria-pressed={reactedByMe}
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-full border px-1.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    reactedByMe
                      ? "border-primary/50 bg-surface-selected text-primary"
                      : "border-border bg-card text-foreground hover:bg-muted",
                  )}
                >
                  <span>{emoji}</span>
                  {users.length > 1 ? <span className="tabular-nums">{users.length}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Tombol menu aksi di kanan bubble lawan bicara */}
      {!mine && !deleted ? (
        <BubbleActionsMenu
          body={body}
          closed={closed}
          canEdit={false}
          canDelete={canDelete}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
          onReact={onReact}
        />
      ) : null}
    </div>
  );
});

function BubbleActionsMenu({
  body,
  closed,
  canEdit,
  canDelete,
  onReply,
  onEdit,
  onDelete,
  onReact,
}: {
  body: string;
  closed: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: (typeof CHAT_REACTION_EMOJIS)[number]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Aksi pesan"
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground opacity-65 transition-opacity hover:bg-card/80 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover/row:opacity-100"
        >
          <MoreVertical className="size-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-52 rounded-2xl p-1.5">
        {!closed ? (
          <>
            <div className="flex items-center justify-between gap-0.5 px-1 pb-1.5">
              {CHAT_REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReact(emoji)}
                  aria-label={`Beri reaksi ${emoji}`}
                  className="grid size-8 place-items-center rounded-full text-base transition-transform hover:scale-125 hover:bg-muted"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-10 gap-2.5 rounded-xl" onSelect={onReply}>
              <Reply className="size-4" /> Balas pesan
            </DropdownMenuItem>
          </>
        ) : null}
        {body ? (
          <DropdownMenuItem
            className="min-h-10 gap-2.5 rounded-xl"
            onSelect={() => {
              void navigator.clipboard?.writeText(body);
              toast.success("Pesan disalin.");
            }}
          >
            <Copy className="size-4" /> Salin teks
          </DropdownMenuItem>
        ) : null}
        {canEdit ? (
          <DropdownMenuItem className="min-h-10 gap-2.5 rounded-xl" onSelect={onEdit}>
            <Pencil className="size-4" /> Edit pesan
          </DropdownMenuItem>
        ) : null}
        {canDelete ? (
          <DropdownMenuItem
            className="min-h-10 gap-2.5 rounded-xl text-destructive focus:text-destructive"
            onSelect={onDelete}
          >
            <Trash2 className="size-4" /> Hapus pesan
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AttachmentView({
  attachment,
  attachmentUrls,
  mine,
  onOpenLightbox,
  onRefreshAttachmentUrl,
}: {
  attachment: ChatAttachment;
  attachmentUrls?: Record<string, string>;
  mine: boolean;
  onOpenLightbox: (items: Array<{ url: string; name: string }>, index: number) => void;
  onRefreshAttachmentUrl?: (path: string) => void;
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
          <MapPin className="size-5 text-primary" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">Lokasi dibagikan</span>
          <span className="block text-xs tabular-nums opacity-80">
            {attachment.lat.toFixed(5)}, {attachment.lng.toFixed(5)}
          </span>
        </span>
      </a>
    );
  }

  if (attachment.kind === "audio") {
    const url = attachmentUrls?.[attachment.path];
    return (
      <VoiceNotePlayer
        url={url}
        durationSec={attachment.durationSec}
        waveform={attachment.waveform}
        mine={mine}
        onUrlError={() => onRefreshAttachmentUrl?.(attachment.path)}
      />
    );
  }

  if (attachment.kind === "product") {
    const thumb = isRenderableImageUrl(attachment.thumbnailUrl) ? attachment.thumbnailUrl : null;
    const displayPrice = attachment.discountPrice ?? attachment.price ?? 0;
    return (
      <Link
        to="/produk/$slug"
        params={{ slug: attachment.slug ?? "" }}
        className={cn(
          "flex min-w-[220px] items-center gap-2.5 rounded-xl border p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          mine
            ? "border-chat-out-foreground/15 bg-card/85 text-foreground hover:bg-card"
            : "border-border bg-surface/80 text-foreground hover:bg-surface",
        )}
      >
        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-selected text-primary">
          {thumb ? (
            <img src={optimizedMediaUrl(thumb, 128)} alt="" className="size-full object-cover" />
          ) : (
            <Package className="size-5" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-primary">
            Produk digital
          </span>
          <span className="line-clamp-1 text-xs font-semibold">{attachment.name}</span>
          <span className="block text-xs font-bold tabular-nums text-price">
            {formatRupiah(displayPrice)}
          </span>
        </span>
      </Link>
    );
  }

  if (attachment.kind === "service") {
    return (
      <Link
        to="/jasa/$id"
        params={{ id: attachment.serviceId }}
        className={cn(
          "flex min-w-[220px] items-center gap-2.5 rounded-xl border p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          mine
            ? "border-chat-out-foreground/15 bg-card/85 text-foreground hover:bg-card"
            : "border-border bg-surface/80 text-foreground hover:bg-surface",
        )}
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-lg border border-border bg-surface-selected text-primary">
          <BriefcaseBusiness className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-primary">
            Jasa seller
          </span>
          <span className="line-clamp-1 text-xs font-semibold">{attachment.name}</span>
          <span className="block text-xs tabular-nums text-muted-foreground">
            <strong className="text-price">{formatRupiah(attachment.price ?? 0)}</strong>
            {attachment.durationDays ? ` · ${attachment.durationDays} hari` : ""}
          </span>
        </span>
      </Link>
    );
  }

  if (attachment.kind === "gallery") {
    const resolved = attachment.items.map((item) => ({
      ...item,
      url: attachmentUrls?.[item.path],
    }));
    const validLightbox = resolved
      .filter((r): r is typeof r & { url: string } => Boolean(r.url))
      .map((r) => ({ url: r.url, name: r.name }));
    return (
      <div className="grid w-64 max-w-full grid-cols-2 gap-1 overflow-hidden rounded-[15px]">
        {resolved.map((item, idx) => (
          <button
            key={item.path}
            type="button"
            disabled={!item.url}
            onClick={() => {
              if (!item.url) return;
              const targetIdx = validLightbox.findIndex((x) => x.url === item.url);
              onOpenLightbox(validLightbox, Math.max(0, targetIdx));
            }}
            className={cn(
              "relative aspect-square overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              resolved.length === 3 && idx === 0 && "col-span-2 aspect-[2/1]",
            )}
          >
            {item.url ? (
              <img
                src={item.url}
                alt={item.name}
                loading="lazy"
                decoding="async"
                onError={() => onRefreshAttachmentUrl?.(item.path)}
                className="size-full object-cover transition-transform hover:scale-[1.03]"
              />
            ) : (
              <span className="grid size-full place-items-center">
                <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  if (attachment.kind === "image") {
    const url = attachmentUrls?.[attachment.path];
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
      <button
        type="button"
        onClick={() => onOpenLightbox([{ url, name: attachment.name }], 0)}
        className="block overflow-hidden rounded-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img
          src={url}
          alt={attachment.name}
          loading="lazy"
          decoding="async"
          onError={() => onRefreshAttachmentUrl?.(attachment.path)}
          className="max-h-80 w-auto max-w-full object-cover"
        />
      </button>
    );
  }

  const fileUrl = attachmentUrls?.[attachment.path];
  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      download={attachment.name}
      aria-disabled={!fileUrl}
      className={cn("flex min-h-11 items-center gap-2.5", !fileUrl && "pointer-events-none opacity-70")}
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl",
          mine ? "bg-chat-out-foreground/10" : "bg-muted",
        )}
      >
        <FileText className="size-5 text-primary" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold">{attachment.name}</span>
        <span className="block text-xs opacity-80">{formatBytes(attachment.size)}</span>
      </span>
    </a>
  );
}

/**
 * Composer modern ala WhatsApp:
 * - Draft tersimpan otomatis per thread
 * - Mode Reply / Edit banner, Slash Quick Replies (`/`), Paste Ctrl+V foto,
 *   AttachmentPreviewBar (1-4 foto + caption), Emoji Picker, dan VoiceNoteRecorder.
 */
function Composer({
  threadId,
  viewerRole,
  partnerName,
  selfId,
  replyingTo,
  editingMsg,
  onCancelReply,
  onCancelEdit,
  onSend,
  onDraftChange,
  onRecordingPulse,
  onAttach,
  onOpenCatalog,
  droppedFiles,
  onConsumedDroppedFiles,
}: {
  threadId: string;
  viewerRole: "customer" | "seller" | "staff";
  partnerName: string;
  selfId: string | null | undefined;
  replyingTo: ChatMessage | null;
  editingMsg: ChatMessage | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSend: (body: string) => void;
  onDraftChange?: () => void;
  onRecordingPulse?: (active: boolean) => void;
  onAttach?: (input: ChatAttachInput) => void;
  onOpenCatalog?: () => void;
  droppedFiles: File[] | null;
  onConsumedDroppedFiles: () => void;
}) {
  const [draft, setDraft] = useState(() => loadThreadDraft(threadId));
  const [recording, setRecording] = useState(false);
  const [staged, setStaged] = useState<StagedAttachment | null>(null);
  const [caption, setCaption] = useState("");
  const [quickIndex, setQuickIndex] = useState(0);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const imageRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Sinkronkan draft saat berpindah percakapan.
  useEffect(() => {
    setDraft(loadThreadDraft(threadId));
    setRecording(false);
    setStaged((prev) => {
      if (prev?.kind === "images") prev.files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      return null;
    });
    setCaption("");
  }, [threadId]);

  // Saat masuk mode edit, isi textarea dengan teks pesan lama.
  useEffect(() => {
    if (editingMsg) {
      setDraft(editingMsg.body);
      inputRef.current?.focus();
    }
  }, [editingMsg]);

  useEffect(() => {
    if (replyingTo) inputRef.current?.focus();
  }, [replyingTo]);

  // Simpan draft otomatis per thread (kecuali saat sedang mengedit pesan lama).
  useEffect(() => {
    if (!editingMsg) saveThreadDraft(threadId, draft);
  }, [threadId, draft, editingMsg]);

  const stageFiles = useCallback((files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (imgs.length > 0) {
      setStaged((prev) => {
        const existing = prev?.kind === "images" ? prev.files : [];
        const remaining = Math.max(0, 4 - existing.length);
        const added = imgs.slice(0, remaining).map((file) => ({
          file,
          previewUrl: URL.createObjectURL(file),
        }));
        if (imgs.length > remaining) toast.info("Maksimal 4 foto per kiriman.");
        return { kind: "images", files: [...existing, ...added] };
      });
      return;
    }
    const first = files[0];
    if (first) setStaged({ kind: "file", file: first });
  }, []);

  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      stageFiles(droppedFiles);
      onConsumedDroppedFiles();
    }
  }, [droppedFiles, stageFiles, onConsumedDroppedFiles]);

  // Cleanup object URLs saat unmount.
  useEffect(() => {
    return () => {
      if (staged?.kind === "images") {
        staged.files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      }
    };
  }, [staged]);

  const clearStaged = () => {
    if (staged?.kind === "images") staged.files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    setStaged(null);
    setCaption("");
  };

  function confirmStagedSend() {
    if (!staged || !onAttach) return;
    const cap = caption.trim();
    if (staged.kind === "images") {
      if (staged.files.length === 1) {
        onAttach({ kind: "image", file: staged.files[0].file, caption: cap || undefined });
      } else if (staged.files.length >= 2) {
        onAttach({
          kind: "gallery",
          files: staged.files.map((f) => f.file),
          caption: cap || undefined,
        });
      }
    } else {
      onAttach({ kind: "file", file: staged.file, caption: cap || undefined });
    }
    clearStaged();
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (!onAttach) return;
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      stageFiles(files);
    }
  }

  // Fallback tinggi otomatis untuk browser tanpa dukungan field-sizing: content.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [draft]);

  const quickReplies = useMemo(
    () => (editingMsg ? [] : matchQuickReplies(draft, viewerRole)),
    [draft, viewerRole, editingMsg],
  );

  useEffect(() => {
    setQuickIndex(0);
  }, [quickReplies.length]);

  const hasText = draft.trim().length > 0;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
    saveThreadDraft(threadId, "");
    inputRef.current?.focus();
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (quickReplies.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setQuickIndex((i) => (i + 1) % quickReplies.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setQuickIndex((i) => (i - 1 + quickReplies.length) % quickReplies.length);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const picked = quickReplies[quickIndex];
        if (picked) {
          setDraft(picked.body);
          onDraftChange?.();
        }
        return;
      }
      if (event.key === "Escape") {
        setDraft("");
        return;
      }
    }

    if (event.key === "Escape" && (replyingTo || editingMsg)) {
      onCancelReply();
      onCancelEdit();
      return;
    }

    // Desktop: Enter kirim (dengan perlindungan IME Safari keyCode === 229).
    // Mobile touch (pointer coarse): Enter menambah baris baru, tombol Kirim untuk mengirim.
    const isCoarsePointer =
      typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    if (event.key === "Enter" && !event.shiftKey && !isCoarsePointer) {
      event.preventDefault();
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      submit();
    }
  }

  if (recording && onAttach) {
    return (
      <VoiceNoteRecorder
        onCancel={() => setRecording(false)}
        onRecordingPulse={onRecordingPulse}
        onError={(msg) => toast.error(msg)}
        onSend={(vn: RecordedVoiceNote) => {
          setRecording(false);
          onAttach({
            kind: "audio",
            file: vn.file,
            durationSec: vn.durationSec,
            waveform: vn.waveform,
          });
        }}
      />
    );
  }

  if (staged) {
    return (
      <>
        <input
          ref={imageRef}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            stageFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <AttachmentPreviewBar
          staged={staged}
          caption={caption}
          onCaptionChange={setCaption}
          onAddMoreImages={() => imageRef.current?.click()}
          onRemoveImage={(idx) => {
            setStaged((prev) => {
              if (!prev || prev.kind !== "images") return prev;
              const target = prev.files[idx];
              if (target) URL.revokeObjectURL(target.previewUrl);
              const next = prev.files.filter((_, i) => i !== idx);
              return next.length ? { kind: "images", files: next } : null;
            });
          }}
          onCancel={clearStaged}
          onConfirmSend={confirmStagedSend}
        />
      </>
    );
  }

  return (
    <div className="relative border-t border-border/70 bg-card/95 backdrop-blur-xl">
      {/* Popup Slash Quick Replies (`/`) */}
      {quickReplies.length > 0 ? (
        <div
          role="listbox"
          aria-label="Template balasan cepat"
          className="absolute bottom-full left-2 right-2 z-30 mb-1.5 overflow-hidden rounded-2xl border border-border bg-card shadow-lg sm:left-3 sm:right-3"
        >
          <p className="border-b border-border bg-surface px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
            Balasan cepat (pilih atau tekan Enter)
          </p>
          <ul className="max-h-52 overflow-y-auto p-1">
            {quickReplies.map((tpl, idx) => (
              <li key={tpl.command}>
                <button
                  type="button"
                  role="option"
                  aria-selected={idx === quickIndex}
                  onClick={() => {
                    setDraft(tpl.body);
                    onDraftChange?.();
                    inputRef.current?.focus();
                  }}
                  className={cn(
                    "flex w-full flex-col rounded-xl px-3 py-2 text-left transition-colors",
                    idx === quickIndex ? "bg-surface-selected" : "hover:bg-muted/70",
                  )}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <span className="font-mono">{tpl.command}</span>
                    <span className="text-foreground">{tpl.label}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {tpl.body}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Banner Reply atau Edit */}
      {replyingTo || editingMsg ? (
        <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-surface/80 px-3 py-2 text-xs">
          <div className="min-w-0 flex-1 border-l-[3px] border-primary pl-2.5">
            <p className="font-semibold text-primary">
              {editingMsg
                ? "Mengedit pesan"
                : `Membalas ${replyingTo?.sender_id === selfId ? "Anda" : partnerName}`}
            </p>
            <p className="truncate text-muted-foreground">
              {editingMsg ? editingMsg.body : replyingTo ? replySnippet(replyingTo) : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (editingMsg) {
                onCancelEdit();
                setDraft(loadThreadDraft(threadId));
              } else {
                onCancelReply();
              }
            }}
            aria-label={editingMsg ? "Batalkan edit pesan" : "Batalkan balas pesan"}
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <form onSubmit={submit} className="pb-safe flex items-end gap-1 px-1.5 py-1.5 sm:px-2.5">
        {onAttach ? (
          <>
            <input
              ref={imageRef}
              type="file"
              accept={IMAGE_ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                stageFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept={FILE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                stageFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </>
        ) : null}

        {onAttach && !editingMsg ? (
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
            <DropdownMenuContent side="top" align="start" className="w-56 rounded-2xl p-1.5">
              <DropdownMenuItem
                className="min-h-11 gap-3 rounded-xl"
                onSelect={() => imageRef.current?.click()}
              >
                <ImageIcon className="size-5 text-primary" aria-hidden="true" /> Foto (hingga 4)
              </DropdownMenuItem>
              <DropdownMenuItem
                className="min-h-11 gap-3 rounded-xl"
                onSelect={() => fileRef.current?.click()}
              >
                <FileText className="size-5 text-primary" aria-hidden="true" /> Dokumen
              </DropdownMenuItem>
              {onOpenCatalog ? (
                <DropdownMenuItem
                  className="min-h-11 gap-3 rounded-xl"
                  onSelect={onOpenCatalog}
                >
                  <ShoppingBag className="size-5 text-primary" aria-hidden="true" /> Produk / Jasa
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                className="min-h-11 gap-3 rounded-xl"
                onSelect={() => onAttach({ kind: "location" })}
              >
                <MapPin className="size-5 text-primary" aria-hidden="true" /> Lokasi saya
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <div className="my-0.5 flex min-h-10 flex-1 items-end rounded-[22px] border border-border bg-background pl-1 pr-3 focus-within:border-primary/60">
          <EmojiQuickPicker
            onPick={(emoji) => {
              setDraft((prev) => `${prev}${emoji}`);
              onDraftChange?.();
              inputRef.current?.focus();
            }}
          />
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              onDraftChange?.();
            }}
            onKeyDown={keyDown}
            onPaste={handlePaste}
            rows={1}
            maxLength={2000}
            placeholder={
              editingMsg
                ? "Ubah isi pesan..."
                : viewerRole === "customer"
                  ? "Ketik pesan atau / untuk cepat..."
                  : "Balas pembeli atau ketik /..."
            }
            aria-label="Tulis pesan"
            className="max-h-32 min-h-[38px] w-full min-w-0 flex-1 resize-none bg-transparent py-2 text-base leading-snug outline-none placeholder:text-muted-foreground [field-sizing:content]"
          />
        </div>

        {/* Gaya WhatsApp: kosong = Mikrofon VN, ada teks / edit = Kirim */}
        {onAttach && !hasText && !editingMsg ? (
          <button
            type="button"
            aria-label="Rekam pesan suara"
            onClick={() => setRecording(true)}
            className="press-scale grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
              <Mic className="size-5" aria-hidden="true" />
            </span>
          </button>
        ) : (
          <button
            type="submit"
            aria-label={editingMsg ? "Simpan perubahan pesan" : "Kirim pesan"}
            disabled={!hasText}
            className="press-scale group grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
              {editingMsg ? (
                <Check className="size-5" aria-hidden="true" />
              ) : (
                <SendHorizontal className="size-[18px]" aria-hidden="true" />
              )}
            </span>
          </button>
        )}
      </form>
    </div>
  );
}
