import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail, MessageSquare, MoreVertical, Pin, PinOff, Search } from "lucide-react";
import { toast } from "sonner";

import { ChatListItemContent } from "@/components/chat/chat-list-item";
import { broadcastReadChange, subscribeChatSync, usePinnedChats } from "@/components/chat/chat-prefs";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/ebry/states";
import { StatusPill } from "@/components/ebry/status";
import { INQUIRY_STATUS_LABEL } from "@/components/inquiry/inquiry-thread";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { useSession } from "@/hooks/use-session";
import {
  listInquiryUnreadCounts,
  listSellerInquiries,
  markInquiryUnread,
} from "@/lib/inquiries.functions";

export const Route = createFileRoute("/_authenticated/seller/chat/")({
  head: () => ({
    meta: [
      { title: "Chat Pelanggan | Seller Ebrystore" },
      { name: "description", content: "Pertanyaan pelanggan tentang produk dan jasa Anda." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SellerChatList,
});

const TABS = [
  { key: "all", label: "Semua", hint: "Semua chat pelanggan." },
  { key: "open", label: "Terbuka", hint: "Pertanyaan yang belum dijawab." },
  { key: "answered", label: "Dijawab", hint: "Chat yang sudah dibalas." },
  { key: "closed", label: "Ditutup", hint: "Chat yang sudah selesai." },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function SellerChatList() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("all");
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const fetchList = useServerFn(listSellerInquiries);
  const fetchUnread = useServerFn(listInquiryUnreadCounts);
  const setUnread = useServerFn(markInquiryUnread);
  const { pinnedIds, isPinned, togglePin } = usePinnedChats(user?.id);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["seller-inquiries", "all"],
    queryFn: () => fetchList({ data: { status: "all" } }),
  });
  const unreadQ = useQuery({ queryKey: ["inquiry-unread"], queryFn: () => fetchUnread({}) });

  useRealtimeRefresh({
    channel: "seller-inquiries",
    tables: ["product_inquiries", "product_inquiry_messages"],
    keys: [["seller-inquiries", "all"], ["inquiry-unread"]],
  });

  useEffect(() => {
    return subscribeChatSync((ev) => {
      if (ev.type === "read-changed") {
        void queryClient.invalidateQueries({ queryKey: ["inquiry-unread"] });
        void queryClient.invalidateQueries({ queryKey: ["seller-inquiries", "all"] });
      }
    });
  }, [queryClient]);

  const allItems = useMemo(() => (data?.items ?? []) as any[], [data?.items]);
  const counts = useMemo(() => {
    let open = 0;
    let answered = 0;
    let closed = 0;
    for (const i of allItems) {
      if (i.status === "open") open += 1;
      else if (i.status === "answered") answered += 1;
      else if (i.status === "closed") closed += 1;
    }
    return { all: allItems.length, open, answered, closed };
  }, [allItems]);

  const visible = useMemo(() => {
    const filtered = tab === "all" ? allItems : allItems.filter((i: any) => i.status === tab);
    const term = deferredQ.trim().toLowerCase();
    const searched = term
      ? filtered.filter((i: any) =>
          `${i.customer_name ?? ""} ${i.subject ?? ""} ${i.last_message_body ?? ""}`
            .toLowerCase()
            .includes(term),
        )
      : filtered;
    const pinIndex = new Map(pinnedIds.map((pid, idx) => [pid, idx]));
    return [...searched].sort((a, b) => {
      const pa = pinIndex.has(a.id) ? pinIndex.get(a.id)! : 9999;
      const pb = pinIndex.has(b.id) ? pinIndex.get(b.id)! : 9999;
      if (pa !== pb) return pa - pb;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });
  }, [allItems, tab, deferredQ, pinnedIds]);

  const unreadById = useMemo(
    () =>
      new Map(
        (unreadQ.data?.items ?? []).map((row) => [row.inquiry_id, Number(row.unread)]),
      ),
    [unreadQ.data?.items],
  );

  async function handleMarkUnread(inquiryId: string) {
    const res = await setUnread({ data: { inquiryId } });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    broadcastReadChange(inquiryId);
    await queryClient.invalidateQueries({ queryKey: ["inquiry-unread"] });
    await queryClient.invalidateQueries({ queryKey: ["seller-inquiries", "all"] });
    toast.success("Ditandai belum dibaca.");
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-bold sm:text-xl">Chat Pelanggan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pertanyaan pembeli tentang produk dan jasa di toko Anda. Ketik <code className="rounded bg-muted px-1">/</code> di chat untuk balasan cepat.
          </p>
        </div>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={isPending}
          onClick={() => void refetch()}
        >
          Muat ulang
        </Button>
      </header>

      <section
        className="overflow-hidden rounded-2xl border border-border bg-card"
        aria-label="Kotak masuk chat"
      >
        <div className="flex flex-col gap-2 border-b border-border px-3 pt-1 lg:flex-row lg:items-center lg:justify-between lg:pb-0">
          <div
            role="tablist"
            aria-label="Filter status chat"
            className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {TABS.map((entry) => {
              const active = tab === entry.key;
              return (
                <button
                  key={entry.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(entry.key)}
                  className={cn(
                    "relative flex min-h-11 shrink-0 items-center gap-1.5 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    active
                      ? "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {entry.label}
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums leading-5",
                      entry.key === "open" && counts.open > 0
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {data ? counts[entry.key].toLocaleString("id-ID") : "0"}
                  </span>
                </button>
              );
            })}
          </div>
          <label className="relative mb-2 block lg:mb-0 lg:w-64">
            <span className="sr-only">Cari chat</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari pembeli atau topik"
              className="min-h-11 pl-9"
            />
          </label>
        </div>

        {isPending ? (
          <div className="p-3">
            <CardSkeleton rows={3} />
          </div>
        ) : error || data?.error ? (
          <div className="p-3">
            <ErrorState onRetry={() => void refetch()} />
          </div>
        ) : data && visible.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            className="m-3 border-0"
            title={allItems.length === 0 ? "Belum ada pertanyaan" : "Tidak ada chat yang cocok"}
            description={
              allItems.length === 0
                ? "Pertanyaan dari pembeli tentang produk dan jasa Anda akan muncul di sini."
                : TABS.find((t) => t.key === tab)?.hint
            }
          />
        ) : data ? (
          <ul className="divide-y divide-border" aria-label="Daftar chat">
            {visible.map((item: any, index: number) => {
              const unread = unreadById.get(item.id) ?? 0;
              const name: string = item.customer_name || item.subject || "Pembeli";
              const pinned = isPinned(item.id);
              const lastMine = item.last_message_role === "seller" || item.last_message_role === "staff";
              const lastRead =
                lastMine &&
                Boolean(item.customer_read_at) &&
                new Date(item.last_message_at).getTime() <=
                  new Date(item.customer_read_at).getTime();

              return (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-center transition-colors hover:bg-surface",
                    unread > 0 && "bg-primary/[0.04]",
                    index >= 6 && "cv-row",
                  )}
                >
                  <Link
                    to="/seller/chat/$id"
                    params={{ id: item.id }}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <div className="min-w-0 flex-1">
                      <ChatListItemContent
                        title={name}
                        subtitle={item.subject}
                        preview={item.last_message_body}
                        previewPrefix={lastMine ? "Anda:" : undefined}
                        lastMessageMine={lastMine}
                        lastMessageRead={lastRead}
                        lastMessageAt={item.last_message_at}
                        pinned={pinned}
                        unread={unread}
                      />
                    </div>
                    <StatusPill
                      value={item.status}
                      kind="raw"
                      label={INQUIRY_STATUS_LABEL[item.status]}
                      className="hidden shrink-0 sm:inline-flex"
                    />
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Opsi chat ${name}`}
                        className="mr-2 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <MoreVertical className="size-4" aria-hidden="true" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 rounded-xl p-1">
                      <DropdownMenuItem
                        className="min-h-11 gap-2 rounded-lg"
                        onSelect={() => togglePin(item.id)}
                      >
                        {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                        {pinned ? "Lepas sematan" : "Sematkan ke atas"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="min-h-11 gap-2 rounded-lg"
                        onSelect={() => void handleMarkUnread(item.id)}
                      >
                        <Mail className="size-4" /> Tandai belum dibaca
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
