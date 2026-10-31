import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, MessagesSquare, Search, X } from "lucide-react";

import { AdminLoading } from "@/components/admin/admin-ui";
import { ChatListItemContent } from "@/components/chat/chat-list-item";
import { EmptyState, ErrorState } from "@/components/ebry/states";
import { Button } from "@/components/ui/button";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { listInquiryUnreadCounts, listMyInquiries } from "@/lib/inquiries.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/chat/")({
  head: () => ({
    meta: [
      { title: "Chat Produk — Ebrystore" },
      {
        name: "description",
        content: "Tanya ketersediaan produk digital langsung ke tim Ebrystore lewat chat.",
      },
      { property: "og:title", content: "Chat Produk — Ebrystore" },
      {
        property: "og:description",
        content: "Riwayat percakapan tanya produk dengan tim Ebrystore.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChatListPage,
});

type Tab = "all" | "unread";

const ROUND_BTN =
  "grid size-11 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ChatListPage() {
  const fetchList = useServerFn(listMyInquiries);
  const fetchUnread = useServerFn(listInquiryUnreadCounts);
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

  const [tab, setTab] = useState<Tab>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");

  const unreadById = new Map(
    (unreadQ.data?.items ?? []).map((row) => [row.inquiry_id, Number(row.unread)]),
  );
  const items: any[] = data?.items ?? [];
  const unreadCount = items.filter((it) => (unreadById.get(it.id) ?? 0) > 0).length;

  const needle = q.trim().toLowerCase();
  const visible = items.filter((it) => {
    if (tab === "unread" && !(unreadById.get(it.id) ?? 0)) return false;
    if (!needle) return true;
    return `${it.subject ?? ""} ${it.last_message_body ?? ""}`.toLowerCase().includes(needle);
  });

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "all", label: "Semua" },
    { id: "unread", label: "Belum dibaca", count: unreadCount },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      {/* Bar atas: kembali, judul tengah, tombol cari */}
      <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center">
        <Link to="/dashboard" aria-label="Kembali ke beranda akun" className={ROUND_BTN}>
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Link>
        <h1 className="text-center text-base font-bold">Chat</h1>
        <button
          type="button"
          onClick={() => {
            setSearchOpen((v) => !v);
            if (searchOpen) setQ("");
          }}
          aria-expanded={searchOpen}
          aria-controls="chat-search"
          aria-label={searchOpen ? "Tutup pencarian" : "Cari percakapan"}
          className={ROUND_BTN}
        >
          {searchOpen ? (
            <X className="size-5" aria-hidden="true" />
          ) : (
            <Search className="size-5" aria-hidden="true" />
          )}
        </button>
      </header>

      {searchOpen ? (
        <div className="relative">
          <label htmlFor="chat-search" className="sr-only">
            Cari percakapan
          </label>
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="chat-search"
            type="search"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari produk atau isi pesan…"
            className="h-12 w-full rounded-full border border-border bg-card pl-11 pr-4 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      ) : null}

      {/* Tab tersegmentasi */}
      <div
        role="tablist"
        aria-label="Saring percakapan"
        className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === t.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count ? (
              <span
                className={cn(
                  "grid min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold leading-5 tabular-nums",
                  tab === t.id ? "bg-primary-foreground/20" : "bg-accent text-accent-foreground",
                )}
              >
                {t.count > 9 ? "9+" : t.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {isPending ? <AdminLoading /> : null}
      {error || data?.error ? <ErrorState onRetry={() => refetch()} /> : null}

      {data && !data.error && items.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="Belum ada percakapan"
          description="Buka salah satu produk lalu tekan “Tanya ketersediaan” untuk mulai chat."
          action={
            <Button asChild>
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

      <ul className="space-y-2">
        {visible.map((item) => (
          <li key={item.id}>
            <Link
              to="/dashboard/chat/$id"
              params={{ id: item.id }}
              className="block rounded-2xl border border-border bg-card p-3.5 transition-colors hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ChatListItemContent
                title={item.subject}
                preview={item.last_message_body}
                previewPrefix={item.last_message_role === "customer" ? "Anda:" : undefined}
                lastMessageAt={item.last_message_at}
                unread={unreadById.get(item.id) ?? 0}
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
