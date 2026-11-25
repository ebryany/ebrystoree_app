import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Mic,
  MoreVertical,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ChatListItemContent } from "@/components/chat/chat-list-item";
import { ChatSplit } from "@/components/chat/chat-split";
import { broadcastReadChange, subscribeChatSync, usePinnedChats } from "@/components/chat/chat-prefs";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/ebry/states";
import { StatusPill } from "@/components/ebry/status";
import { INQUIRY_STATUS_LABEL } from "@/components/inquiry/inquiry-thread";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

  const { data, isPending, isFetching, error, refetch } = useQuery({
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
    <>
      {/* Desktop (lg+): tata letak 2 kolom 100% ala WhatsApp Web untuk seller */}
      <div className="hidden lg:block">
        <ChatSplit mode="seller" activeId={null}>
          <div className="chat-wallpaper relative flex h-full flex-col items-center justify-center p-8 text-center">
            <span className="grid size-20 place-items-center rounded-full bg-[var(--wa-pill-active)] text-[var(--wa-pill-active-fg)] shadow-sm">
              <MessageSquare className="size-9" aria-hidden="true" />
            </span>
            <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-[var(--wa-in-fg)]">
              Chat Pelanggan Toko
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--wa-in-meta)]">
              Pilih percakapan pembeli di sebelah kiri untuk membalas cepat, mengirim kartu produk
              atau jasa, pesan suara (VN), foto, dokumen, maupun peta lokasi. Ketik{" "}
              <code className="rounded bg-[var(--wa-in)] px-1.5 py-0.5 font-mono text-xs text-[var(--wa-in-fg)]">
                /
              </code>{" "}
              di kolom pesan untuk template balasan cepat.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-[var(--wa-in-meta)]">
              <span className="inline-flex items-center gap-1.5">
                <Mic className="size-3.5 text-[var(--wa-action)]" aria-hidden="true" /> Voice Note
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 text-[var(--wa-action)]" aria-hidden="true" /> Peta Lokasi
              </span>
            </div>
            <p className="absolute bottom-6 inline-flex items-center gap-1.5 text-xs text-[var(--wa-in-meta)]">
              <Lock className="size-3.5" aria-hidden="true" />
              Seluruh percakapan toko terhubung ke transaksi Ebrystore
            </p>
          </div>
        </ChatSplit>
      </div>

      {/* Mobile & Tablet (< lg): kotak masuk seller ala WhatsApp Mobile */}
      <section
        className="overflow-hidden rounded-2xl border border-[var(--wa-border)] bg-[var(--wa-panel)] lg:hidden"
        aria-label="Kotak masuk chat pelanggan"
      >
        <header className="bg-[var(--wa-brand)] px-4 pb-3 pt-3 text-[var(--wa-brand-fg)]">
          <div className="flex min-h-11 items-center justify-between gap-2">
            <div>
              <h1 className="font-display text-lg font-bold tracking-tight">Chat Pelanggan</h1>
              <p className="text-xs text-[var(--wa-brand-fg)]/85">
                Ketik / di dalam chat untuk template balasan cepat
              </p>
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={() => void refetch()}
              aria-label="Muat ulang chat pelanggan"
              className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--wa-brand-fg)] hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <RefreshCw
                className={cn("size-4", isFetching && "animate-spin")}
                aria-hidden="true"
              />
            </button>
          </div>

          <div className="relative mt-2.5">
            <label htmlFor="seller-chat-search" className="sr-only">
              Cari chat pelanggan
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--wa-in-meta)]"
              aria-hidden="true"
            />
            <input
              id="seller-chat-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari pembeli atau topik..."
              className="h-10 w-full rounded-full bg-[var(--wa-input)] pl-9 pr-9 text-sm text-[var(--wa-in-fg)] placeholder:text-[var(--wa-in-meta)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white [&::-webkit-search-cancel-button]:hidden"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Hapus pencarian"
                className="absolute right-0.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center text-[var(--wa-in-meta)]"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </header>

        <div
          role="tablist"
          aria-label="Filter status chat"
          className="flex gap-1.5 overflow-x-auto border-b border-[var(--wa-border)] bg-[var(--wa-panel)] px-3 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                  "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-[var(--wa-pill-active)] text-[var(--wa-pill-active-fg)]"
                    : "bg-[var(--wa-search)] text-[var(--wa-in-meta)] hover:text-[var(--wa-in-fg)]",
                )}
              >
                <span>{entry.label}</span>
                <span className="tabular-nums">
                  {data ? counts[entry.key].toLocaleString("id-ID") : "0"}
                </span>
              </button>
            );
          })}
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
          <ul aria-label="Daftar chat">
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
                    "relative flex items-center transition-colors after:absolute after:bottom-0 after:left-[76px] after:right-0 after:h-px after:bg-[var(--wa-border)] last:after:hidden hover:bg-[var(--wa-panel-hover)]",
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
                        className="mr-2 grid size-11 shrink-0 place-items-center rounded-full text-[var(--wa-in-meta)] hover:bg-[var(--wa-panel-hover)] hover:text-[var(--wa-in-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
    </>
  );
}
