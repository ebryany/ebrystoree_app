import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MessageSquare, Search } from "lucide-react";

import { CountUp } from "@/components/admin/report-widgets";
import { ChatListItemContent } from "@/components/chat/chat-list-item";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/ebry/states";
import { StatusPill } from "@/components/ebry/status";
import { INQUIRY_STATUS_LABEL } from "@/components/inquiry/inquiry-thread";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
  const [q, setQ] = useState("");
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
  const term = q.trim().toLowerCase();
  const visible = term
    ? filtered.filter((i: any) =>
        `${i.customer_name ?? ""} ${i.subject ?? ""}`.toLowerCase().includes(term),
      )
    : filtered;

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

      {/* Kotak masuk: tab garis bawah + pencarian di header kartu, baris chat di bawahnya. */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-label="Kotak masuk chat">
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
                      ? "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {entry.label}
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums leading-5",
                      entry.key === "open" && counts.open > 0
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {data ? <CountUp value={counts[entry.key]} /> : "0"}
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
              className="min-h-10 pl-9"
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
                ? "Pertanyaan dari pembeli tentang produk Anda akan muncul di sini."
                : TABS.find((t) => t.key === tab)?.hint
            }
          />
        ) : data ? (
          <motion.ul layout={!reduced} className="divide-y divide-border" aria-label="Daftar chat">
            <AnimatePresence initial={false} mode="popLayout">
              {visible.map((item: any) => {
                const unread = unreadById.get(item.id) ?? 0;
                const name: string = item.customer_name || item.subject || "Pembeli";
                return (
                  <motion.li
                    key={item.id}
                    layout={!reduced}
                    initial={reduced ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduced ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Link
                      to="/seller/chat/$id"
                      params={{ id: item.id }}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        unread > 0 && "bg-accent/[0.04]",
                      )}
                    >
                      <span
                        className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-selected text-sm font-bold uppercase text-accent"
                        aria-hidden="true"
                      >
                        {name.trim().charAt(0) || "?"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <ChatListItemContent
                          title={name}
                          preview={item.last_message_body}
                          lastMessageAt={item.last_message_at}
                          unread={unread}
                        />
                      </div>
                      <StatusPill
                        value={item.status}
                        kind="raw"
                        label={INQUIRY_STATUS_LABEL[item.status]}
                        className="hidden sm:inline-flex"
                      />
                    </Link>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </motion.ul>
        ) : null}
      </section>
    </div>
  );
}
