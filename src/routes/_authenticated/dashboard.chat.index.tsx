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
    <div className="mx-auto w-full max-w-2xl">
      {/* Bar atas gaya iOS: tombol kembali teks, judul besar di bawahnya. */}
      <header className="-mx-2 flex min-h-11 items-center">
        <Link
          to="/dashboard"
          className="inline-flex min-h-11 items-center gap-0.5 rounded-lg pr-3 text-[17px] text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-6" aria-hidden="true" />
          Akun
        </Link>
      </header>
      <h1 className="mt-1 text-[32px] font-bold leading-tight tracking-[-0.02em]">Chat</h1>

      {/* Pencarian selalu tampil, seperti WhatsApp iOS. */}
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
          placeholder="Cari"
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

      {/* Chip filter seperti WhatsApp: Semua / Belum dibaca. */}
      <div role="tablist" aria-label="Saring percakapan" className="mt-3 flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === t.id
                ? "bg-success/15 text-success"
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

        {/* Daftar polos dengan garis pemisah inset (mulai sejajar teks, bukan avatar). */}
        <ul className="-mx-4 sm:mx-0" aria-label="Daftar percakapan">
          {visible.map((item) => (
            <li
              key={item.id}
              className="relative after:absolute after:bottom-0 after:left-[80px] after:right-0 after:h-px after:bg-border/70 last:after:hidden"
            >
              <Link
                to="/dashboard/chat/$id"
                params={{ id: item.id }}
                className="block px-4 py-2.5 transition-colors hover:bg-muted/60 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:rounded-xl"
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
    </div>
  );
}
