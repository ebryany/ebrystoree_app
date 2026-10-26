import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { AdminLoading } from "@/components/admin/admin-ui";
import { ErrorState } from "@/components/ebry/states";
import {
  ChatWindow,
  type ChatMessage,
  type ChatPendingMessage,
} from "@/components/chat/chat-window";
import { useChatTyping } from "@/hooks/use-chat-typing";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { useSession } from "@/hooks/use-session";
import {
  getInquiry,
  getInquiryMessagesPage,
  markInquiryRead,
  sendInquiryMessage,
  setInquiryStatus,
} from "@/lib/inquiries.functions";
import { formatRupiah } from "@/lib/format";
import { isRenderableImageUrl } from "@/lib/utils";

export const INQUIRY_STATUS_LABEL: Record<string, string> = {
  open: "Menunggu jawaban",
  answered: "Sudah dijawab",
  closed: "Ditutup",
};

const BACK_ROUTES = {
  customer: "/dashboard/chat",
  seller: "/seller/chat",
  staff: "/admin/chat",
} as const;

export function InquiryThread({ id, mode }: { id: string; mode: "customer" | "staff" | "seller" }) {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const fetchInquiry = useServerFn(getInquiry);
  const fetchPage = useServerFn(getInquiryMessagesPage);
  const postMessage = useServerFn(sendInquiryMessage);
  const updateStatus = useServerFn(setInquiryStatus);
  const markRead = useServerFn(markInquiryRead);

  const queryKey = ["inquiry", id];
  const messagesKey = ["inquiry-messages", id];

  const { data, isPending, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchInquiry({ data: { id } }),
  });

  const [pending, setPending] = useState<ChatPendingMessage[]>([]);
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useRealtimeRefresh({
    channel: `inquiry-${id}`,
    tables: ["product_inquiry_messages", "product_inquiries"],
    keys: [queryKey, messagesKey],
  });

  // Sinkronkan penanda hasMore dari jendela pertama; halaman lebih lama di state lokal.
  useEffect(() => {
    setHasMore(Boolean(data?.hasMore));
  }, [data?.hasMore]);

  const messages: ChatMessage[] = [...older, ...(data?.messages ?? [])];
  const closed = data?.inquiry?.status === "closed";
  const { partnerTyping, sendTyping } = useChatTyping({
    channel: id,
    selfId: user?.id,
    enabled: !closed,
  });

  // Tandai terbaca saat thread terbuka / pesan baru masuk selagi tab terlihat.
  const markedRef = useRef("");
  useEffect(() => {
    if (!user || !data?.inquiry) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const stamp = `${messages.length}:${data.inquiry.last_message_at}`;
    if (!messages.length || markedRef.current === stamp) return;
    markedRef.current = stamp;
    void markRead({ data: { inquiryId: id } }).then(() =>
      queryClient.invalidateQueries({ queryKey }),
    );
  }, [user, data, messages.length, id, markRead, queryClient]);

  async function sendBody(text: string, existingTempId?: string) {
    const tempId = existingTempId ?? crypto.randomUUID();
    if (existingTempId) {
      setPending((prev) =>
        prev.map((p) => (p.tempId === tempId ? { ...p, status: "sending" } : p)),
      );
    } else {
      setPending((prev) => [...prev, { tempId, body: text, status: "sending" }]);
    }
    const result = await postMessage({ data: { inquiryId: id, body: text } });
    if (!result.ok) {
      setPending((prev) => prev.map((p) => (p.tempId === tempId ? { ...p, status: "failed" } : p)));
      if (!existingTempId) toast.error(result.error);
      return;
    }
    setPending((prev) => prev.filter((p) => p.tempId !== tempId));
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: messagesKey });
  }

  async function loadMore() {
    const before = messages[0]?.created_at;
    if (!before || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage({ data: { id, before } });
      setOlder((prev) => [...page.messages, ...prev]);
      setHasMore(page.hasMore);
    } catch {
      toast.error("Pesan lama gagal dimuat. Coba lagi.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleClosed() {
    const next = closed ? "open" : "closed";
    const result = await updateStatus({ data: { inquiryId: id, status: next } });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(next === "closed" ? "Percakapan ditutup." : "Percakapan dibuka kembali.");
    await queryClient.invalidateQueries({ queryKey });
  }

  if (isPending) return <AdminLoading />;
  if (error) return <ErrorState onRetry={() => refetch()} />;
  if (!data?.inquiry)
    return (
      <ErrorState
        title="Percakapan tidak ditemukan"
        description="Percakapan mungkin sudah dihapus."
      />
    );

  const inquiry = data.inquiry as any;
  const product = data.product as {
    name: string;
    slug: string;
    thumbnail_url: string | null;
    price: number | string;
    discount_price: number | string | null;
  } | null;
  const viewerRole = mode;
  const roleLabel =
    mode === "customer"
      ? data.store?.name
        ? `Penjual · ${data.store.name}`
        : "Tim Ebrystore"
      : `Pembeli · ${data.customerName}`;
  const myReadAt = mode === "customer" ? inquiry.customer_read_at : inquiry.merchant_read_at;
  const partnerReadAt = mode === "customer" ? inquiry.merchant_read_at : inquiry.customer_read_at;
  const finalPrice = product
    ? Number(product.discount_price) > 0 && Number(product.discount_price) < Number(product.price)
      ? Number(product.discount_price)
      : Number(product.price)
    : 0;
  const thumbnail =
    product?.thumbnail_url && isRenderableImageUrl(product.thumbnail_url)
      ? product.thumbnail_url
      : null;

  return (
    <ChatWindow
      title={inquiry.subject}
      roleLabel={roleLabel}
      statusLabel={INQUIRY_STATUS_LABEL[inquiry.status] ?? inquiry.status}
      status={inquiry.status}
      closed={closed}
      messages={messages}
      pending={pending}
      selfId={user?.id}
      viewerRole={viewerRole}
      partnerTyping={partnerTyping}
      myReadAt={myReadAt ?? null}
      partnerReadAt={partnerReadAt ?? null}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={() => void loadMore()}
      onSend={(body) => void sendBody(body)}
      onRetry={(tempId, body) => void sendBody(body, tempId)}
      onToggleClosed={() => void toggleClosed()}
      canToggleClosed={mode !== "customer"}
      onDraftChange={sendTyping}
      backSlot={
        <Link
          to={BACK_ROUTES[mode]}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          ← Kembali
        </Link>
      }
      productSlot={
        product ? (
          <Link
            to="/produk/$slug"
            params={{ slug: product.slug }}
            className="flex items-center gap-2.5 border-x border-b border-border bg-muted/40 px-3 py-2 transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-secondary">
              {thumbnail ? <img src={thumbnail} alt="" className="size-full object-cover" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">{product.name}</span>
              <span className="block text-[11px] tabular-nums text-muted-foreground">
                {formatRupiah(finalPrice)}
              </span>
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-primary">Lihat</span>
          </Link>
        ) : null
      }
    />
  );
}
