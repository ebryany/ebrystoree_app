import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Check, CheckCheck, Loader2, Send } from "lucide-react";

import { StatusPill } from "@/components/ebry/status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { chatDayLabel } from "./chat-time";

export type ChatMessage = {
  id: string;
  sender_id: string | null;
  sender_role: string;
  body: string;
  is_system: boolean | null;
  created_at: string;
};

export type ChatPendingMessage = { tempId: string; body: string; status: "sending" | "failed" };

type Props = {
  title: string;
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
};

const NEAR_BOTTOM_PX = 120;
const GROUP_GAP_MS = 5 * 60 * 1000;

function isCounterparty(role: string, viewerRole: Props["viewerRole"]) {
  return viewerRole === "customer" ? role !== "customer" : role === "customer";
}

function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/** Jendela chat presentasional: header, divider, bubble, typing, composer. */
export function ChatWindow({
  title,
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
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const lastCountRef = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const [draft, setDraft] = useState("");

  const initial = (title.trim()[0] ?? "?").toUpperCase();

  useEffect(() => {
    const count = messages.length + pending.length;
    const grew = count > lastCountRef.current;
    lastCountRef.current = count;
    if (grew && nearBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    } else if (grew) {
      setShowJump(true);
    }
  }, [messages.length, pending.length]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (nearBottomRef.current) setShowJump(false);
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
    nearBottomRef.current = true;
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }),
    );
  }

  function composerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function autoGrow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  const myReadTime = myReadAt ? new Date(myReadAt).getTime() : null;
  const partnerReadTime = partnerReadAt ? new Date(partnerReadAt).getTime() : null;
  const lastOwnIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].sender_id === selfId) return i;
    }
    return -1;
  })();
  const unreadDividerIndex = (() => {
    if (myReadTime === null) return -1;
    return messages.findIndex(
      (m) =>
        isCounterparty(m.sender_role, viewerRole) && new Date(m.created_at).getTime() > myReadTime,
    );
  })();
  const partnerSeen = (created: string) =>
    partnerReadTime !== null && new Date(created).getTime() <= partnerReadTime;

  return (
    <div className="mx-auto flex h-[calc(100dvh-11rem)] min-h-[26rem] w-full max-w-3xl flex-col lg:h-[calc(100dvh-9rem)]">
      <header className="flex items-center gap-3 rounded-t-2xl border border-b-0 border-border bg-card px-3 py-2.5">
        {backSlot}
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-selected text-sm font-semibold text-muted-foreground"
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-[11px] text-muted-foreground">{roleLabel}</p>
        </div>
        <StatusPill value={status} kind="raw" label={statusLabel} />
      </header>
      {productSlot}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Riwayat pesan"
        className="relative flex-1 space-y-1 overflow-y-auto border-x border-border bg-surface px-3 py-3"
      >
        {hasMore ? (
          <div className="pb-2 text-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-9"
              disabled={loadingMore}
              onClick={onLoadMore}
            >
              {loadingMore ? "Memuat…" : "Muat pesan sebelumnya"}
            </Button>
          </div>
        ) : null}
        {messages.map((message, index) => {
          const prev = messages[index - 1];
          const groupStart =
            index === 0 ||
            prev.sender_id !== message.sender_id ||
            new Date(message.created_at).getTime() - new Date(prev.created_at).getTime() >
              GROUP_GAP_MS ||
            !sameDay(prev.created_at, message.created_at);
          const dayBreak =
            index === 0 || !sameDay(prev?.created_at ?? message.created_at, message.created_at);
          const mine = message.sender_id === selfId;
          const showUnreadDivider = index === unreadDividerIndex;
          const time = new Date(message.created_at).toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <div key={message.id}>
              {dayBreak ? (
                <div className="flex items-center gap-2 py-2" aria-hidden="true">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {chatDayLabel(message.created_at)}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : null}
              {showUnreadDivider ? (
                <div className="flex items-center gap-2 py-1.5">
                  <span className="h-px flex-1 bg-accent/40" />
                  <span className="text-[11px] font-semibold text-accent">Pesan baru</span>
                  <span className="h-px flex-1 bg-accent/40" />
                </div>
              ) : null}
              {message.is_system ? (
                <p className="py-1 text-center text-[11px] text-muted-foreground">{message.body}</p>
              ) : (
                <div className={cn("flex py-0.5", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
                      mine
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm border border-border bg-card",
                    )}
                  >
                    <p className="whitespace-pre-line break-words">{message.body}</p>
                    <p
                      className={cn(
                        "mt-0.5 flex items-center justify-end gap-1 text-[11px]",
                        mine ? "opacity-80" : "text-muted-foreground",
                      )}
                    >
                      {groupStart ? <span>{time}</span> : null}
                      {mine && index === lastOwnIndex ? (
                        partnerSeen(message.created_at) ? (
                          <CheckCheck className="size-3.5" aria-label="Dibaca" />
                        ) : (
                          <Check className="size-3.5" aria-label="Terkirim" />
                        )
                      ) : null}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {pending.map((item) => (
          <div key={item.tempId} className="flex justify-end py-0.5">
            <div
              className={cn(
                "max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2 text-sm",
                item.status === "failed"
                  ? "border border-destructive bg-card"
                  : "bg-primary/60 text-primary-foreground",
              )}
            >
              <p className="whitespace-pre-line break-words">{item.body}</p>
              <p className="mt-0.5 flex items-center justify-end gap-1.5 text-[11px]">
                {item.status === "sending" ? (
                  <>
                    <Loader2
                      className="size-3 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                    <span>Mengirim</span>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRetry(item.tempId, item.body)}
                    className="font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    Gagal, coba lagi
                  </button>
                )}
              </p>
            </div>
          </div>
        ))}
        {partnerTyping ? (
          <div className="flex justify-start py-0.5">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-border bg-card px-3.5 py-2 text-xs text-muted-foreground">
              <span className="sr-only">Lawan bicara sedang mengetik</span>
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  aria-hidden="true"
                  className="size-1.5 animate-bounce rounded-full bg-muted-foreground motion-reduce:animate-none"
                  style={{ animationDelay: `${dot * 150}ms` }}
                />
              ))}
            </div>
          </div>
        ) : null}
        <div ref={(el) => el?.scrollIntoView()} aria-hidden="true" />
        {showJump ? (
          <button
            type="button"
            onClick={() => {
              nearBottomRef.current = true;
              setShowJump(false);
              scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: "smooth",
              });
            }}
            className="sticky bottom-2 mx-auto block rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            Pesan baru di bawah
          </button>
        ) : null}
      </div>
      {closed ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-b-2xl border border-t-0 border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <span>Percakapan ini sudah ditutup.</span>
          {canToggleClosed ? (
            <Button variant="outline" size="sm" className="min-h-9" onClick={onToggleClosed}>
              Buka kembali
            </Button>
          ) : null}
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="flex items-end gap-2 rounded-b-2xl border border-t-0 border-border bg-card px-3 py-2.5"
        >
          <Textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              onDraftChange?.();
            }}
            onKeyDown={composerKeyDown}
            ref={autoGrow}
            rows={1}
            maxLength={2000}
            placeholder="Tulis pesan…"
            aria-label="Tulis pesan"
            className="min-h-11 flex-1 resize-none"
          />
          <Button type="submit" className="min-h-11" disabled={!draft.trim()}>
            <Send className="size-4" aria-hidden="true" />
            Kirim
          </Button>
        </form>
      )}
    </div>
  );
}
