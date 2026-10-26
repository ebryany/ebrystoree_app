import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessagesSquare } from "lucide-react";

import { AdminLoading } from "@/components/admin/admin-ui";
import { ChatListItemContent } from "@/components/chat/chat-list-item";
import { EmptyState, ErrorState } from "@/components/ebry/states";
import { Button } from "@/components/ui/button";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { listInquiryUnreadCounts, listMyInquiries } from "@/lib/inquiries.functions";

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

  const unreadById = new Map(
    (unreadQ.data?.items ?? []).map((row) => [row.inquiry_id, Number(row.unread)]),
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Chat produk</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tanyakan ketersediaan atau detail produk. Balasan muncul otomatis di sini.
        </p>
      </header>

      {isPending ? <AdminLoading /> : null}
      {error || data?.error ? <ErrorState onRetry={() => refetch()} /> : null}

      {data && !data.error && data.items.length === 0 ? (
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

      <ul className="space-y-2">
        {(data?.items ?? []).map((item: any) => (
          <li key={item.id}>
            <Link
              to="/dashboard/chat/$id"
              params={{ id: item.id }}
              className="block rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ChatListItemContent
                title={item.subject}
                preview={item.last_message_body}
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
