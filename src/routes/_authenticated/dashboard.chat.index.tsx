import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  Mail,
  MessagesSquare,
  Mic,
  MoreVertical,
  Pin,
  PinOff,
  Search,
  ShieldCheck,
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
      {/* Desktop (lg+): tata letak 2 kolom permanen ala WhatsApp Web */}
      <div className="hidden lg:block">
        <ChatSplit mode="customer" activeId={null}>
          <div className="chat-wallpaper flex h-full flex-col items-center justify-center p-8 text-center">
            <span className="grid size-16 place-items-center rounded-2xl border border-border bg-card text-primary shadow-[var(--elev-1)]">
              <MessagesSquare className="size-8" aria-hidden="true" />
            </span>
            <h1 className="mt-4 font-display text-xl font-bold text-foreground">
              Chat Ebrystore
            </h1>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
              Pilih percakapan di sebelah kiri untuk membaca balasan, mengirim pesan suara (VN),
              foto, dokumen, atau kartu produk.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <Button asChild className="min-h-11 rounded-control">
                <Link to="/produk">Jelajahi produk</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-11 rounded-control bg-card">
                <Link to="/layanan">Lihat jasa seller</Link>
              </Button>
            </div>
            <p className="mt-6 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Mic className="size-3.5 text-primary" aria-hidden="true" /> Pesan suara & lampiran
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" /> Terhubung
                langsung ke pesanan
              </span>
            </p>
          </div>
        </ChatSplit>
      </div>

      {/* Mobile & Tablet (< lg): daftar percakapan bersih ala WhatsApp */}
      <div className="mx-auto w-full max-w-2xl lg:hidden">
        <header className="-mx-2 flex min-h-11 items-center">
          <Link
            to="/dashboard"
            className="inline-flex min-h-11 items-center gap-0.5 rounded-lg pr-3 text-[16px] font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
            Akun
          </Link>
        </header>
        <h1 className="mt-1 font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
          Chat
        </h1>

        <div className="relative mt-3">
          <label htmlFor="chat-search" className="sr-only">
            Cari percakapan
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="chat-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari toko, produk, atau pesan..."
            className="h-11 w-full rounded-xl bg-muted pl-10 pr-10 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Hapus pencarian"
              className="absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center text-muted-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div role="tablist" aria-label="Saring percakapan" className="mt-3 flex gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === t.id
                  ? "bg-surface-selected text-primary"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.count ? (
                <span className="tabular-nums">{t.count > 99 ? "99+" : t.count}</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="mt-2 space-y-4">
          {isPending ? <AdminLoading /> : null}
          {error || data?.error ? <ErrorState onRetry={() => refetch()} /> : null}

          {data && !data.error && items.length === 0 ? (
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
          ) : null}

          {items.length > 0 && visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {needle ? "Tidak ada percakapan yang cocok." : "Semua pesan sudah dibaca."}
            </p>
          ) : null}

          <ul className="-mx-4 sm:mx-0" aria-label="Daftar percakapan">
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
                    "relative flex items-center after:absolute after:bottom-0 after:left-[76px] after:right-0 after:h-px after:bg-border/70 last:after:hidden",
                    index >= 6 && "cv-row",
                  )}
                >
                  <Link
                    to="/dashboard/chat/$id"
                    params={{ id: item.id }}
                    className="min-w-0 flex-1 px-4 py-2.5 transition-colors hover:bg-muted/60 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:rounded-xl"
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
        </div>
      </div>
    </>
  );
}
