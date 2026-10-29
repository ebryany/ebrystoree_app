import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";

import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import {
  listAllInquiries,
  listInquiryUnreadCounts,
  listMyInquiries,
  listSellerInquiries,
} from "@/lib/inquiries.functions";
import { cn } from "@/lib/utils";
import { ChatListItemContent } from "./chat-list-item";

type Mode = "customer" | "seller" | "staff";

// Query key sama dengan halaman daftar masing-masing supaya cache dipakai bersama.
const LIST_KEY: Record<Mode, readonly unknown[]> = {
  customer: ["inquiry-list"],
  seller: ["seller-inquiries", "all"],
  staff: ["admin-inquiries", "all"],
};

const ROW_CLASS =
  "block rounded-xl px-3 py-2.5 transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";

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
  const className = cn(ROW_CLASS, active && "bg-surface-selected hover:bg-surface-selected");
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

function ChatSidebar({ mode, activeId }: { mode: Mode; activeId: string }) {
  const [term, setTerm] = useState("");
  const fetchMine = useServerFn(listMyInquiries);
  const fetchSeller = useServerFn(listSellerInquiries);
  const fetchAll = useServerFn(listAllInquiries);
  const fetchUnread = useServerFn(listInquiryUnreadCounts);

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
    tables: ["product_inquiries"],
    keys: [LIST_KEY[mode] as unknown[], ["inquiry-unread"]],
  });

  const unreadById = new Map(
    (unreadQ.data?.items ?? []).map((row) => [row.inquiry_id, Number(row.unread)]),
  );
  const q = term.trim().toLowerCase();
  const items = (listQ.data?.items ?? []).filter(
    (i) => !q || `${i.customer_name ?? ""} ${i.subject ?? ""}`.toLowerCase().includes(q),
  );

  return (
    <aside className="hidden w-80 shrink-0 flex-col border-r border-border bg-card lg:flex xl:w-96">
      <div className="border-b border-border/70 p-3">
        <h2 className="px-1 pb-2 text-lg font-bold">Chat</h2>
        <label className="flex min-h-10 items-center gap-2 rounded-full bg-muted px-3 text-sm">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Cari percakapan"
            aria-label="Cari percakapan"
            className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto overscroll-contain p-2">
        {listQ.isPending ? (
          <li className="p-3 text-sm text-muted-foreground">Memuat…</li>
        ) : items.length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">Tidak ada percakapan.</li>
        ) : (
          items.map((item) => (
            <li key={item.id}>
              <RowLink mode={mode} id={item.id} active={item.id === activeId}>
                <ChatListItemContent
                  title={mode === "customer" ? item.subject : item.customer_name || item.subject}
                  preview={item.last_message_body}
                  lastMessageAt={item.last_message_at}
                  unread={item.id === activeId ? 0 : (unreadById.get(item.id) ?? 0)}
                />
              </RowLink>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}

/**
 * Layout gaya WhatsApp Web: di desktop (lg+) daftar chat di kiri dan thread di
 * kanan; di HP hanya thread layar penuh (daftar tetap di halaman indeks).
 */
export function ChatSplit({
  mode,
  activeId,
  children,
}: {
  mode: Mode;
  activeId: string;
  children: ReactNode;
}) {
  return (
    <div className="lg:flex lg:h-[calc(100dvh-8rem)] lg:min-h-[32rem] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border">
      <ChatSidebar mode={mode} activeId={activeId} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
