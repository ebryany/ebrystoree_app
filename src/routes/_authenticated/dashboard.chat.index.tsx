import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  Lock,
  Mail,
  MapPin,
  MessagesSquare,
  Mic,
  MoreVertical,
  Pin,
  PinOff,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AdminLoading } from "@/components/admin/admin-ui";
import { ChatListItemContent } from "@/components/chat/chat-list-item";
import { ChatSplit } from "@/components/chat/chat-split";
import { broadcastReadChange, subscribeChatSync, usePinnedChats } from "@/components/chat/chat-prefs";
import { EmptyState, ErrorState } from "@/components/ebry/states";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { useSession } from "@/hooks/use-session";
import {
  listInquiryUnreadCounts,
  listMyInquiries,
  markInquiryUnread,
} from "@/lib/inquiries.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/chat/")({
  head: () => ({
    meta: [
      { title: "Chat | Ebrystore" },
      {
        name: "description",
        content: "Diskusi produk digital dan jasa seller langsung di Ebrystore.",
      },
      { property: "og:title", content: "Chat | Ebrystore" },
      {
        property: "og:description",
        content: "Riwayat percakapan dengan toko dan tim Ebrystore.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChatListPage,
});

type Tab = "all" | "unread";

function ChatListPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const fetchList = useServerFn(listMyInquiries);
  const fetchUnread = useServerFn(listInquiryUnreadCounts);
  const setUnread = useServerFn(markInquiryUnread);
  const { pinnedIds, isPinned, togglePin } = usePinnedChats(user?.id);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["inquiry-list"],
    queryFn: () => fetchList({}),
  });
  const unreadQ = useQuery({ queryKey: ["inquiry-unread"], queryFn: () => fetchUnread({}) });

  useRealtimeRefresh({
    channel: "inquiry-list",
    tables: ["product_inquiries", "product_inquiry_messages"],
    keys: [["inquiry-list"], ["inquiry-unread"]],
  });

  useEffect(() => {
    return subscribeChatSync((ev) => {
      if (ev.type === "read-changed") {
        void queryClient.invalidateQueries({ queryKey: ["inquiry-unread"] });
        void queryClient.invalidateQueries({ queryKey: ["inquiry-list"] });
      }
    });
  }, [queryClient]);

  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);

  const unreadById = useMemo(
    () =>
      new Map(
        (unreadQ.data?.items ?? []).map((row) => [row.inquiry_id, Number(row.unread)]),
      ),
    [unreadQ.data?.items],
  );
  const items = useMemo(() => (data?.items ?? []) as any[], [data?.items]);
  const unreadCount = useMemo(
    () => items.filter((it) => (unreadById.get(it.id) ?? 0) > 0).length,
    [items, unreadById],
  );

  const needle = deferredQ.trim().toLowerCase();
  const visible = useMemo(() => {
    const filtered = items.filter((it) => {
      if (tab === "unread" && !(unreadById.get(it.id) ?? 0)) return false;
      if (!needle) return true;
      return `${it.store_name ?? ""} ${it.subject ?? ""} ${it.last_message_body ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
    const pinIndex = new Map(pinnedIds.map((pid, idx) => [pid, idx]));
    return [...filtered].sort((a, b) => {
      const pa = pinIndex.has(a.id) ? pinIndex.get(a.id)! : 9999;
      const pb = pinIndex.has(b.id) ? pinIndex.get(b.id)! : 9999;
      if (pa !== pb) return pa - pb;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });
  }, [items, tab, unreadById, needle, pinnedIds]);

  async function handleMarkUnread(inquiryId: string) {
    const res = await setUnread({ data: { inquiryId } });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    broadcastReadChange(inquiryId);
    await queryClient.invalidateQueries({ queryKey: ["inquiry-unread"] });
    await queryClient.invalidateQueries({ queryKey: ["inquiry-list"] });
    toast.success("Ditandai belum dibaca.");
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "all", label: "Semua" },
    { id: "unread", label: "Belum dibaca", count: unreadCount },
  ];

  return (
    <>
      {/* Desktop (lg+): tata letak 2 kolom 100% ala WhatsApp Web */}
      <div className="hidden lg:block">
        <ChatSplit mode="customer" activeId={null}>
          <div className="chat-wallpaper relative flex h-full flex-col items-center justify-center p-8 text-center">
            <span className="grid size-20 place-items-center rounded-full bg-[var(--wa-pill-active)] text-[var(--wa-pill-active-fg)] shadow-sm">
              <MessagesSquare className="size-9" aria-hidden="true" />
            </span>
            <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-[var(--wa-in-fg)]">
              Chat Ebrystore
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--wa-in-meta)]">
              Pilih percakapan di sebelah kiri untuk membaca balasan, mengirim pesan suara (VN),
              berbagi peta lokasi, foto, dokumen, atau kartu produk langsung ke toko.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
              <Link
                to="/produk"
                className="inline-flex min-h-11 items-center rounded-full bg-[var(--wa-action)] px-5 text-sm font-semibold text-[var(--wa-action-fg)] transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Jelajahi produk
              </Link>
              <Link
                to="/layanan"
                className="inline-flex min-h-11 items-center rounded-full border border-[var(--wa-border)] bg-[var(--wa-in)] px-5 text-sm font-semibold text-[var(--wa-in-fg)] transition-colors hover:bg-[var(--wa-panel-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Lihat jasa seller
              </Link>
            </div>
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
              Percakapan & transaksi dilindungi sistem Ebrystore
            </p>
          </div>
        </ChatSplit>
      </div>

      {/* Mobile & Tablet (< lg): daftar chat 100% ala WhatsApp Mobile */}
      <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--wa-border)] bg-[var(--wa-panel)] lg:hidden">
        <header className="bg-[var(--wa-brand)] px-4 pb-3 pt-3 text-[var(--wa-brand-fg)]">
          <div className="flex min-h-11 items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Link
                to="/dashboard"
                aria-label="Kembali ke akun"
                className="-ml-2 grid size-11 place-items-center rounded-full text-[var(--wa-brand-fg)] hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronLeft className="size-6" aria-hidden="true" />
              </Link>
              <h1 className="font-display text-xl font-bold tracking-tight">Chat</h1>
            </div>
            {unreadCount > 0 ? (
              <span className="rounded-full bg-[var(--wa-unread)] px-2.5 py-0.5 text-xs font-bold tabular-nums text-[var(--wa-unread-fg)]">
                {unreadCount} baru
              </span>
            ) : null}
          </div>

          <div className="relative mt-2.5">
            <label htmlFor="chat-search" className="sr-only">
              Cari percakapan
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-[var(--wa-in-meta)]"
              aria-hidden="true"
            />
            <input
              id="chat-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari toko, produk, atau pesan..."
              className="h-10 w-full rounded-full bg-[var(--wa-input)] pl-10 pr-10 text-sm text-[var(--wa-in-fg)] placeholder:text-[var(--wa-in-meta)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white [&::-webkit-search-cancel-button]:hidden"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Hapus pencarian"
                className="absolute right-0.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center text-[var(--wa-in-meta)]"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </header>

        <div
          role="tablist"
          aria-label="Saring percakapan"
          className="flex gap-2 border-b border-[var(--wa-border)] bg-[var(--wa-panel)] px-4 py-2.5"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === t.id
                  ? "bg-[var(--wa-pill-active)] text-[var(--wa-pill-active-fg)]"
                  : "bg-[var(--wa-search)] text-[var(--wa-in-meta)] hover:text-[var(--wa-in-fg)]",
              )}
            >
              {t.label}
              {t.count ? (
                <span className="tabular-nums">{t.count > 99 ? "99+" : t.count}</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="bg-[var(--wa-panel)]">
          {isPending ? (
            <div className="p-4">
              <AdminLoading />
            </div>
          ) : null}
          {error || data?.error ? (
            <div className="p-4">
              <ErrorState onRetry={() => refetch()} />
            </div>
          ) : null}

          {data && !data.error && items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={MessagesSquare}
                title="Belum ada percakapan"
                description="Buka salah satu produk atau jasa lalu tekan tombol Chat untuk mulai berdiskusi dengan toko."
                action={
                  <Button asChild className="min-h-11">
                    <Link to="/produk">Lihat katalog produk</Link>
                  </Button>
                }
              />
            </div>
          ) : null}

          {items.length > 0 && visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--wa-in-meta)]">
              {needle ? "Tidak ada percakapan yang cocok." : "Semua pesan sudah dibaca."}
            </p>
          ) : null}

          <ul aria-label="Daftar percakapan">
            {visible.map((item, index) => {
              const pinned = isPinned(item.id);
              const lastMine = item.last_message_role === "customer";
              const lastRead =
                lastMine &&
                Boolean(item.merchant_read_at) &&
                new Date(item.last_message_at).getTime() <=
                  new Date(item.merchant_read_at).getTime();

              return (
                <li
                  key={item.id}
                  className={cn(
                    "relative flex items-center after:absolute after:bottom-0 after:left-[76px] after:right-0 after:h-px after:bg-[var(--wa-border)] last:after:hidden",
                    index >= 6 && "cv-row",
                  )}
                >
                  <Link
                    to="/dashboard/chat/$id"
                    params={{ id: item.id }}
                    className="min-w-0 flex-1 px-4 py-3 transition-colors hover:bg-[var(--wa-panel-hover)] active:bg-[var(--wa-panel-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <ChatListItemContent
                      title={item.store_name || item.subject}
                      subtitle={item.store_name ? item.subject : undefined}
                      avatarUrl={item.store_logo_url}
                      preview={item.last_message_body}
                      previewPrefix={lastMine ? "Anda:" : undefined}
                      lastMessageMine={lastMine}
                      lastMessageRead={lastRead}
                      lastMessageAt={item.last_message_at}
                      pinned={pinned}
                      unread={unreadById.get(item.id) ?? 0}
                    />
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Opsi percakapan ${item.subject}`}
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
        </div>
      </div>
    </>
  );
}
