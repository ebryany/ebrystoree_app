import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MessageSquare } from "lucide-react";

import { CountUp } from "@/components/admin/report-widgets";
import { ChatListItemContent } from "@/components/chat/chat-list-item";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/ebry/states";
import { StatusPill } from "@/components/ebry/status";
import { INQUIRY_STATUS_LABEL } from "@/components/inquiry/inquiry-thread";
import { Button } from "@/components/ui/button";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { listInquiryUnreadCounts, listSellerInquiries } from "@/lib/inquiries.functions";

export const Route = createFileRoute("/_authenticated/seller/chat/")({
  head: () => ({
    meta: [
      { title: "Chat Pelanggan — Seller Ebrystore" },
      { name: "description", content: "Pertanyaan pelanggan tentang produk Anda." },
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
  const [tab, setTab] = useState<TabKey>("all");
  const reduced = useReducedMotion();
  const fetchList = useServerFn(listSellerInquiries);
  const fetchUnread = useServerFn(listInquiryUnreadCounts);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["seller-inquiries", "all"],
    queryFn: () => fetchList({ data: { status: "all" } }),
    refetchOnWindowFocus: "always",
  });
  const unreadQ = useQuery({ queryKey: ["inquiry-unread"], queryFn: () => fetchUnread({}) });

  useRealtimeRefresh({
    channel: "seller-inquiries",
    tables: ["product_inquiries", "product_inquiry_messages"],
    keys: [["seller-inquiries", "all"], ["inquiry-unread"]],
  });

  const allItems: any[] = data?.items ?? [];
  const filtered = tab === "all" ? allItems : allItems.filter((i: any) => i.status === tab);

  const unreadById = new Map(
    (unreadQ.data?.items ?? []).map((row) => [row.inquiry_id, Number(row.unread)]),
  );

  const counts = {
    all: allItems.length,
    open: allItems.filter((i: any) => i.status === "open").length,
    answered: allItems.filter((i: any) => i.status === "answered").length,
    closed: allItems.filter((i: any) => i.status === "closed").length,
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold sm:text-xl">Chat Pelanggan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pertanyaan pembeli tentang produk di toko Anda.
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

      {/* Animated pill tabs */}
      <div
        role="tablist"
        aria-label="Filter status chat"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0"
      >
        {TABS.map((entry) => {
          const active = tab === entry.key;
          const count = counts[entry.key];
          return (
            <button
              key={entry.key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(entry.key)}
              className="relative flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring aria-selected:border-transparent"
            >
              {active ? (
                <motion.span
                  layoutId="seller-chat-tab"
                  className="absolute inset-0 rounded-full bg-primary"
                  transition={{ duration: reduced ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
                />
              ) : null}
              <span className={active ? "relative text-primary-foreground" : "relative"}>
                {entry.label}
              </span>
              <span
                className={
                  active
                    ? "relative text-primary-foreground tabular-nums"
                    : "relative tabular-nums text-muted-foreground"
                }
              >
                {data ? <CountUp value={count} /> : "0"}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{TABS.find((t) => t.key === tab)?.hint}</p>

      {/* Content */}
      {isPending ? (
        <CardSkeleton rows={3} />
      ) : error || data?.error ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : data && filtered.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={tab === "all" ? "Belum ada pertanyaan" : "Tidak ada chat di filter ini"}
          description={
            tab === "all"
              ? "Pertanyaan dari pembeli tentang produk Anda akan muncul di sini."
              : "Coba lihat tab lain."
          }
        />
      ) : data ? (
        <motion.ul layout={!reduced} className="space-y-2" aria-label="Daftar chat">
          <AnimatePresence initial={false} mode="popLayout">
            {filtered.map((item: any, index: number) => (
              <motion.li
                key={item.id}
                layout={!reduced}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -8 }}
                transition={{
                  duration: 0.18,
                  ease: [0.16, 1, 0.3, 1],
                  delay: reduced ? 0 : index * 0.03,
                }}
              >
                <Link
                  to="/seller/chat/$id"
                  params={{ id: item.id }}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-surface-selected focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <div className="min-w-0 flex-1">
                    <ChatListItemContent
                      title={item.customer_name || item.subject}
                      preview={item.last_message_body}
                      lastMessageAt={item.last_message_at}
                      unread={unreadById.get(item.id) ?? 0}
                    />
                  </div>
                  <StatusPill
                    value={item.status}
                    kind="raw"
                    label={INQUIRY_STATUS_LABEL[item.status]}
                  />
                </Link>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      ) : null}
    </div>
  );
}
