import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { AdminLoading } from "@/components/admin/admin-ui";
import { ErrorState } from "@/components/ebry/states";
import {
  ChatWindow,
  type ChatAttachInput,
  type ChatMessage,
  type ChatPendingMessage,
} from "@/components/chat/chat-window";
import { useChatTyping } from "@/hooks/use-chat-typing";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import {
  getChatAttachmentUrls,
  getInquiry,
  getInquiryMessagesPage,
  markInquiryRead,
  prepareChatUpload,
  sendInquiryMessage,
  setInquiryStatus,
  type ChatAttachment,
} from "@/lib/inquiries.functions";
import { formatRupiah } from "@/lib/format";
import { cn, isRenderableImageUrl } from "@/lib/utils";

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

function getPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}

export function InquiryThread({
  id,
  mode,
  embedded = false,
}: {
  id: string;
  mode: "customer" | "staff" | "seller";
  /** Ditampilkan di panel kanan layout dua kolom (desktop). */
  embedded?: boolean;
}) {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const fetchInquiry = useServerFn(getInquiry);
  const fetchPage = useServerFn(getInquiryMessagesPage);
  const postMessage = useServerFn(sendInquiryMessage);
  const updateStatus = useServerFn(setInquiryStatus);
  const markRead = useServerFn(markInquiryRead);
  const prepareUpload = useServerFn(prepareChatUpload);
  const fetchUrls = useServerFn(getChatAttachmentUrls);

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
    // Jeda pendek: pesan & centang biru terasa instan, tapi event beruntun tetap digabung.
    debounceMs: 60,
  });

  // Sinkronkan penanda hasMore dari jendela pertama; halaman lebih lama di state lokal.
  useEffect(() => {
    setHasMore(Boolean(data?.hasMore));
  }, [data?.hasMore]);

  const messages: ChatMessage[] = [...older, ...((data?.messages ?? []) as ChatMessage[])];
  const closed = data?.inquiry?.status === "closed";

  // Signed URL lampiran: hanya path yang belum punya URL yang diminta ke server.
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const requestedRef = useRef(new Set<string>());
  const missingPaths = messages
    .map((m) => (m.attachment && "path" in m.attachment ? m.attachment.path : null))
    .filter((p): p is string => Boolean(p) && !requestedRef.current.has(p as string));
  const missingKey = missingPaths.join("|");
  useEffect(() => {
    if (!missingKey) return;
    const paths = missingKey.split("|");
    paths.forEach((p) => requestedRef.current.add(p));
    void fetchUrls({ data: { inquiryId: id, paths } })
      .then((res) => setAttachmentUrls((prev) => ({ ...prev, ...res.urls })))
      .catch(() => paths.forEach((p) => requestedRef.current.delete(p)));
  }, [missingKey, id, fetchUrls]);
  const { partnerTyping, partnerOnline, sendTyping } = useChatTyping({
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

  async function sendAttachment(input: ChatAttachInput) {
    const tempId = crypto.randomUUID();
    const label =
      input.kind === "image" ? "📷 Foto" : input.kind === "location" ? "📍 Lokasi" : `📎 ${input.file.name}`;
    setPending((prev) => [...prev, { tempId, body: "", status: "sending", attachmentLabel: label }]);
    const drop = () => setPending((prev) => prev.filter((p) => p.tempId !== tempId));

    try {
      let attachment: ChatAttachment;
      if (input.kind === "location") {
        const pos = await getPosition().catch(() => null);
        if (!pos) {
          drop();
          toast.error("Lokasi tidak bisa diambil. Izinkan akses lokasi di browser.");
          return;
        }
        attachment = { kind: "location", ...pos };
      } else {
        const { file } = input;
        if (file.size > 10 * 1024 * 1024) {
          drop();
          toast.error("Ukuran file maksimal 10 MB.");
          return;
        }
        const prep = await prepareUpload({
          data: { inquiryId: id, mimeType: file.type, sizeBytes: file.size },
        });
        if (!prep.ok) {
          drop();
          toast.error(prep.error);
          return;
        }
        const { error: upErr } = await supabase.storage
          .from(prep.bucket)
          .uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type });
        if (upErr) throw upErr;
        attachment = {
          kind: input.kind,
          path: prep.path,
          name: file.name.slice(0, 160),
          mime: file.type,
          size: file.size,
        };
      }
      const result = await postMessage({ data: { inquiryId: id, body: "", attachment } });
      drop();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey });
    } catch {
      drop();
      toast.error("Lampiran gagal dikirim. Coba lagi.");
    }
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
  const partnerName =
    mode === "customer" ? (data.store?.name ?? "Tim Ebrystore") : (data.customerName ?? "Pelanggan");
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
      partnerName={partnerName}
      partnerOnline={partnerOnline}
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
      onAttach={(input) => void sendAttachment(input)}
      attachmentUrls={attachmentUrls}
      embedded={embedded}
      backSlot={
        <Link
          to={BACK_ROUTES[mode]}
          aria-label="Kembali ke daftar chat"
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full text-primary hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
            embedded && "lg:hidden",
          )}
        >
          <ChevronLeft className="size-6" aria-hidden="true" />
        </Link>
      }
      productSlot={
        product ? (
          <Link
            to="/produk/$slug"
            params={{ slug: product.slug }}
            className="flex items-center gap-2.5 border-b border-border/70 bg-card px-3 py-2 transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
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
