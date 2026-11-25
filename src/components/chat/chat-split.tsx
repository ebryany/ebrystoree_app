import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronDown,
  Mail,
  MessageSquare,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { useSession } from "@/hooks/use-session";
import {
  listAllInquiries,
  listInquiryUnreadCounts,
  listMyInquiries,
  listSellerInquiries,
  markInquiryUnread,
} from "@/lib/inquiries.functions";
import { cn } from "@/lib/utils";
import { ChatListItemContent } from "./chat-list-item";
import { broadcastReadChange, subscribeChatSync, usePinnedChats } from "./chat-prefs";

type Mode = "customer" | "seller" | "staff";
type SidebarFilter = "all" | "unread" | "open" | "closed";

// Query key sama dengan halaman daftar masing-masing supaya cache dipakai bersama.
const LIST_KEY: Record<Mode, readonly unknown[]> = {
  customer: ["inquiry-list"],
  seller: ["seller-inquiries", "all"],
  staff: ["admin-inquiries", "all"],
};

const ROW_CLASS =
  "block min-w-0 flex-1 px-3.5 py-2.5 transition-colors hover:bg-[var(--wa-panel-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

/** Link baris bertipe literal per mode (route TanStack harus literal). */
function RowLink({
  mode,
  id,
  active,
  children,
}: {
  mode: Mode;
  id: string;
  active: boolean;
  children: ReactNode;
}) {
  const className = cn(
    ROW_CLASS,
    active && "bg-[var(--wa-panel-active)] hover:bg-[var(--wa-panel-active)]",
  );
  const current = active ? ("page" as const) : undefined;
  if (mode === "customer")
    return (
      <Link to="/dashboard/chat/$id" params={{ id }} className={className} aria-current={current}>
        {children}
      </Link>
    );
  if (mode === "seller")
    return (
      <Link to="/seller/chat/$id" params={{ id }} className={className} aria-current={current}>
        {children}
      </Link>
    );
  return (
    <Link to="/admin/chat/$id" params={{ id }} className={className} aria-current={current}>
      {children}
    </Link>
  );
}

function ChatSidebar({ mode, activeId }: { mode: Mode; activeId?: string | null }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<SidebarFilter>("all");
  const { pinnedIds, isPinned, togglePin } = usePinnedChats(user?.id);

  const fetchMine = useServerFn(listMyInquiries);
  const fetchSeller = useServerFn(listSellerInquiries);
  const fetchAll = useServerFn(listAllInquiries);
  const fetchUnread = useServerFn(listInquiryUnreadCounts);
  const setUnread = useServerFn(markInquiryUnread);

  const listQ = useQuery({
    queryKey: LIST_KEY[mode],
    queryFn: (): Promise<{ items: any[]; error: string | null }> =>
      mode === "customer"
        ? fetchMine({})
        : mode === "seller"
          ? fetchSeller({ data: { status: "all" } })
          : fetchAll({ data: { status: "all" } }),
  });
  const unreadQ = useQuery({ queryKey: ["inquiry-unread"], queryFn: () => fetchUnread({}) });

  useRealtimeRefresh({
    channel: `chat-split-${mode}`,
    tables: ["product_inquiries", "product_inquiry_messages"],
    keys: [LIST_KEY[mode] as unknown[], ["inquiry-unread"]],
  });

  useEffect(() => {
    return subscribeChatSync((ev) => {
      if (ev.type === "read-changed") {
        void queryClient.invalidateQueries({ queryKey: ["inquiry-unread"] });
        void queryClient.invalidateQueries({ queryKey: LIST_KEY[mode] });
      }
    });
  }, [mode, queryClient]);

  const unreadById = useMemo(
    () =>
      new Map(
        (unreadQ.data?.items ?? []).map((row) => [row.inquiry_id, Number(row.unread)]),
      ),
    [unreadQ.data?.items],
  );

  const allItems = useMemo(() => (listQ.data?.items ?? []) as any[], [listQ.data?.items]);
  const unreadTotal = useMemo(
    () => allItems.filter((i) => (unreadById.get(i.id) ?? 0) > 0).length,
    [allItems, unreadById],
  );
  const openTotal = useMemo(
    () => allItems.filter((i) => i.status === "open").length,
    [allItems],
  );

  const items = useMemo(() => {
    const q = term.trim().toLowerCase();
    const filtered = allItems.filter((i) => {
      if (filter === "unread" && !(unreadById.get(i.id) ?? 0)) return false;
      if (filter === "open" && i.status !== "open") return false;
      if (filter === "closed" && i.status !== "closed") return false;
      if (!q) return true;
      return `${i.store_name ?? ""} ${i.customer_name ?? ""} ${i.subject ?? ""} ${i.last_message_body ?? ""}`
        .toLowerCase()
        .includes(q);
    });
    const pinIndex = new Map(pinnedIds.map((pid, idx) => [pid, idx]));
    return [...filtered].sort((a, b) => {
      const pa = pinIndex.has(a.id) ? pinIndex.get(a.id)! : 9999;
      const pb = pinIndex.has(b.id) ? pinIndex.get(b.id)! : 9999;
      if (pa !== pb) return pa - pb;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });
  }, [allItems, filter, term, unreadById, pinnedIds]);

  async function handleMarkUnread(inquiryId: string) {
    const res = await setUnread({ data: { inquiryId } });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    broadcastReadChange(inquiryId);
    await queryClient.invalidateQueries({ queryKey: ["inquiry-unread"] });
    await queryClient.invalidateQueries({ queryKey: LIST_KEY[mode] });
    toast.success("Ditandai belum dibaca.");
  }

  const filterTabs: Array<{ id: SidebarFilter; label: string; count?: number }> =
    mode === "seller"
      ? [
          { id: "all", label: "Semua" },
          { id: "unread", label: "Belum dibaca", count: unreadTotal },
          { id: "open", label: "Terbuka", count: openTotal },
          { id: "closed", label: "Ditutup" },
        ]
      : [
          { id: "all", label: "Semua" },
          { id: "unread", label: "Belum dibaca", count: unreadTotal },
        ];

  return (
    <aside className="hidden w-[340px] shrink-0 flex-col border-r border-[var(--wa-border)] bg-[var(--wa-panel)] lg:flex xl:w-[390px]">
      {/* Bilah atas sidebar ala WhatsApp Web */}
      <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-[var(--wa-border)] bg-[var(--wa-chrome)] px-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-[var(--wa-action)] text-[var(--wa-action-fg)]">
            <MessageSquare className="size-[18px]" aria-hidden="true" />
          </span>
          <h2 className="font-display text-[17px] font-bold tracking-tight text-[var(--wa-in-fg)]">
            {mode === "seller" ? "Chat Pelanggan" : "Chat"}
          </h2>
        </div>

        <div className="flex items-center gap-1">
          {unreadTotal > 0 ? (
            <span className="rounded-full bg-[var(--wa-unread)] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[var(--wa-unread-fg)]">
              {unreadTotal > 99 ? "99+" : unreadTotal}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void listQ.refetch();
              void unreadQ.refetch();
            }}
            aria-label="Muat ulang daftar percakapan"
            className="grid size-10 place-items-center rounded-full text-[var(--wa-in-meta)] transition-colors hover:bg-black/5 hover:text-[var(--wa-in-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/10"
          >
            <RefreshCw
              className={cn("size-4", listQ.isFetching && "animate-spin")}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {/* Kotak pencarian + filter chip khas WhatsApp Web */}
      <div className="border-b border-[var(--wa-border)] bg-[var(--wa-panel)] px-3 py-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--wa-in-meta)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={
              mode === "seller" ? "Cari pembeli atau topik..." : "Cari atau mulai chat..."
            }
            aria-label="Cari percakapan"
            className="h-9 w-full rounded-lg bg-[var(--wa-search)] pl-9 pr-9 text-sm text-[var(--wa-in-fg)] outline-none placeholder:text-[var(--wa-in-meta)] focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
          />
          {term ? (
            <button
              type="button"
              onClick={() => setTerm("")}
              aria-label="Hapus pencarian"
              className="absolute right-0.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center text-[var(--wa-in-meta)] hover:text-[var(--wa-in-fg)]"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div
          role="tablist"
          aria-label="Filter percakapan"
          className="mt-2 flex flex-wrap gap-1.5"
        >
          {filterTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={filter === t.id}
              onClick={() => setFilter(t.id)}
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filter === t.id
                  ? "bg-[var(--wa-pill-active)] text-[var(--wa-pill-active-fg)]"
                  : "bg-[var(--wa-search)] text-[var(--wa-in-meta)] hover:text-[var(--wa-in-fg)]",
              )}
            >
              <span>{t.label}</span>
              {t.count ? <span className="tabular-nums">{t.count}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {/* Daftar percakapan bergaris rambut ala WhatsApp */}
      <ul
        className="chat-scroll flex-1 overflow-y-auto overscroll-contain bg-[var(--wa-panel)]"
        aria-label="Daftar percakapan"
      >
        {listQ.isPending ? (
          <li className="p-4 text-sm text-[var(--wa-in-meta)]">Memuat percakapan...</li>
        ) : items.length === 0 ? (
          <li className="p-8 text-center text-sm text-[var(--wa-in-meta)]">
            {term ? "Percakapan tidak ditemukan." : "Belum ada percakapan."}
          </li>
        ) : (
          items.map((item) => {
            const pinned = isPinned(item.id);
            const lastMine =
              mode === "customer"
                ? item.last_message_role === "customer"
                : item.last_message_role === "seller" || item.last_message_role === "staff";
            const partnerReadAt =
              mode === "customer" ? item.merchant_read_at : item.customer_read_at;
            const lastRead =
              lastMine &&
              Boolean(partnerReadAt) &&
              new Date(item.last_message_at).getTime() <= new Date(partnerReadAt).getTime();

            return (
              <li
                key={item.id}
                className="group relative flex items-center after:pointer-events-none after:absolute after:bottom-0 after:left-[74px] after:right-0 after:h-px after:bg-[var(--wa-border)] last:after:hidden"
              >
                <RowLink mode={mode} id={item.id} active={item.id === activeId}>
                  <ChatListItemContent
                    title={
                      mode === "customer"
                        ? item.store_name || item.subject
                        : item.customer_name || item.subject
                    }
                    subtitle={mode === "customer" && item.store_name ? item.subject : mode === "seller" ? item.subject : undefined}
                    avatarUrl={mode === "customer" ? item.store_logo_url : null}
                    preview={item.last_message_body}
                    previewPrefix={lastMine ? "Anda:" : undefined}
                    lastMessageMine={lastMine}
                    lastMessageRead={lastRead}
                    lastMessageAt={item.last_message_at}
                    pinned={pinned}
                    unread={item.id === activeId ? 0 : (unreadById.get(item.id) ?? 0)}
                  />
                </RowLink>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Opsi percakapan ${item.subject}`}
                      className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-[var(--wa-panel)]/90 text-[var(--wa-in-meta)] opacity-0 shadow-xs transition-opacity hover:text-[var(--wa-in-fg)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                    >
                      <ChevronDown className="size-4" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 rounded-xl p-1">
                    <DropdownMenuItem
                      className="min-h-10 gap-2 rounded-lg"
                      onSelect={() => togglePin(item.id)}
                    >
                      {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                      {pinned ? "Lepas sematan" : "Sematkan chat"}
                    </DropdownMenuItem>
                    {item.id !== activeId ? (
                      <DropdownMenuItem
                        className="min-h-10 gap-2 rounded-lg"
                        onSelect={() => void handleMarkUnread(item.id)}
                      >
                        <Mail className="size-4" /> Tandai belum dibaca
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}

/**
 * Layout 100% gaya WhatsApp Web: di desktop (lg+) daftar chat permanen di kiri
 * dan ruang percakapan/layar sambutan di kanan; di HP layar penuh native.
 */
export function ChatSplit({
  mode,
  activeId,
  children,
}: {
  mode: Mode;
  activeId?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="lg:flex lg:h-[calc(100dvh-7.5rem)] lg:min-h-[36rem] lg:overflow-hidden lg:rounded-xl lg:border lg:border-[var(--wa-border)] lg:bg-[var(--wa-panel)] lg:shadow-[var(--elev-2)]">
      <ChatSidebar mode={mode} activeId={activeId} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
