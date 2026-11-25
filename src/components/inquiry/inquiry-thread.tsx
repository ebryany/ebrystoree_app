import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BriefcaseBusiness, ChevronLeft, Package } from "lucide-react";
import { toast } from "sonner";

import { AdminLoading } from "@/components/admin/admin-ui";
import { ErrorState } from "@/components/ebry/states";
import {
  ChatWindow,
  type ChatAttachInput,
  type ChatMessage,
  type ChatPendingMessage,
} from "@/components/chat/chat-window";
import {
  broadcastReadChange,
  enqueueOfflineMessage,
  isChatMuted,
  loadOfflineOutbox,
  notifyBrowserMessage,
  playChatPing,
  removeOfflineMessage,
  requestBrowserNotificationPermission,
  setChatMuted,
  usePinnedChats,
} from "@/components/chat/chat-prefs";
import { useChatTyping } from "@/hooks/use-chat-typing";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import {
  CHAT_REACTION_EMOJIS,
  editInquiryMessage,
  getChatAttachmentUrls,
  getInquiry,
  getInquiryMessagesPage,
  markInquiryRead,
  markInquiryUnread,
  prepareChatUpload,
  sendInquiryMessage,
  setInquiryStatus,
  softDeleteInquiryMessage,
  toggleInquiryReaction,
  type ChatAttachment,
} from "@/lib/inquiries.functions";
import { formatRupiah, priceDetails } from "@/lib/format";
import { cn, isRenderableImageUrl, optimizedMediaUrl } from "@/lib/utils";

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

const LIST_KEYS = {
  customer: ["inquiry-list"],
  seller: ["seller-inquiries", "all"],
  staff: ["admin-inquiries", "all"],
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

function collectAttachmentPaths(messages: ChatMessage[]): string[] {
  const paths: string[] = [];
  for (const m of messages) {
    if (m.deleted_at || !m.attachment) continue;
    if (m.attachment.kind === "gallery") {
      for (const item of m.attachment.items) paths.push(item.path);
    } else if ("path" in m.attachment) {
      paths.push(m.attachment.path);
    }
  }
  return paths;
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
  const markUnread = useServerFn(markInquiryUnread);
  const prepareUpload = useServerFn(prepareChatUpload);
  const fetchUrls = useServerFn(getChatAttachmentUrls);
  const toggleReactionFn = useServerFn(toggleInquiryReaction);
  const editMessageFn = useServerFn(editInquiryMessage);
  const deleteMessageFn = useServerFn(softDeleteInquiryMessage);

  const queryKey = useMemo(() => ["inquiry", id], [id]);
  const messagesKey = useMemo(() => ["inquiry-messages", id], [id]);

  const { data, isPending, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchInquiry({ data: { id } }),
  });

  const [pending, setPending] = useState<ChatPendingMessage[]>([]);
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [muted, setMuted] = useState(() => isChatMuted());
  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== "undefined" && !navigator.onLine,
  );
  const reachedEndRef = useRef(false);
  const markedRef = useRef("");
  const lastInboundIdRef = useRef<string | null>(null);
  const { isPinned, togglePin } = usePinnedChats(user?.id);

  // Reset seluruh state lokal ketika berpindah ke thread lain (fix state leak lintas chat).
  useEffect(() => {
    setOlder([]);
    setHasMore(false);
    setLoadingMore(false);
    reachedEndRef.current = false;
    markedRef.current = "";
    lastInboundIdRef.current = null;
    if (user?.id) {
      const queued = loadOfflineOutbox(user.id, id);
      setPending(
        queued.map((q) => ({
          tempId: q.tempId,
          body: q.body,
          replyToId: q.replyToId,
          status: "queued" as const,
        })),
      );
    } else {
      setPending([]);
    }
  }, [id, user?.id]);

  useRealtimeRefresh({
    channel: `inquiry-${id}`,
    tables: ["product_inquiry_messages", "product_inquiries"],
    keys: [queryKey, messagesKey],
    debounceMs: 60,
  });

  // Sinkronkan penanda hasMore hanya bila pengguna belum mencapai ujung riwayat lama.
  useEffect(() => {
    if (!reachedEndRef.current) setHasMore(Boolean(data?.hasMore));
  }, [data?.hasMore]);

  // Deduplikasi pesan antara halaman lama (older) dan jendela terbaru (data.messages).
  const messages: ChatMessage[] = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of older) map.set(m.id, m);
    for (const m of (data?.messages ?? []) as ChatMessage[]) map.set(m.id, m);
    return Array.from(map.values()).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }, [older, data?.messages]);

  const closed = data?.inquiry?.status === "closed";

  // Suara ping halus & notifikasi browser saat pesan baru masuk dari lawan bicara.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || !user?.id) return;
    if (lastInboundIdRef.current === null) {
      lastInboundIdRef.current = last.id;
      return;
    }
    if (last.id !== lastInboundIdRef.current) {
      lastInboundIdRef.current = last.id;
      if (last.sender_id && last.sender_id !== user.id && !last.is_system) {
        playChatPing();
        const sender =
          mode === "customer"
            ? (data?.store?.name ?? "Tim Ebrystore")
            : (data?.customerName ?? "Pelanggan");
        notifyBrowserMessage(sender, last.body || "Mengirim lampiran baru");
      }
    }
  }, [messages, user?.id, mode, data?.store?.name, data?.customerName]);

  // Signed URL lampiran + auto-refresh saat URL kedaluwarsa (onError).
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const requestedRef = useRef(new Set<string>());
  useEffect(() => {
    requestedRef.current.clear();
    setAttachmentUrls({});
  }, [id]);

  const missingPaths = collectAttachmentPaths(messages).filter(
    (p) => !requestedRef.current.has(p),
  );
  const missingKey = missingPaths.join("|");
  useEffect(() => {
    if (!missingKey) return;
    const paths = missingKey.split("|");
    paths.forEach((p) => requestedRef.current.add(p));
    void fetchUrls({ data: { inquiryId: id, paths } })
      .then((res) => setAttachmentUrls((prev) => ({ ...prev, ...res.urls })))
      .catch(() => paths.forEach((p) => requestedRef.current.delete(p)));
  }, [missingKey, id, fetchUrls]);

  const refreshAttachmentUrl = useCallback(
    (path: string) => {
      requestedRef.current.delete(path);
      void fetchUrls({ data: { inquiryId: id, paths: [path] } }).then((res) => {
        if (res.urls[path]) {
          requestedRef.current.add(path);
          setAttachmentUrls((prev) => ({ ...prev, ...res.urls }));
        }
      });
    },
    [id, fetchUrls],
  );

  const { partnerTyping, partnerRecording, partnerOnline, sendTyping, sendRecording } =
    useChatTyping({
      channel: id,
      selfId: user?.id,
      enabled: !closed,
    });

  // Tandai terbaca saat thread terbuka, pesan baru masuk, DAN saat tab kembali visible.
  const triggerMarkRead = useCallback(() => {
    if (!user || !data?.inquiry) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const stamp = `${id}:${messages.length}:${data.inquiry.last_message_at}`;
    if (!messages.length || markedRef.current === stamp) return;
    markedRef.current = stamp;
    void markRead({ data: { inquiryId: id } }).then(() => {
      broadcastReadChange(id);
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["inquiry-unread"] });
      void queryClient.invalidateQueries({ queryKey: LIST_KEYS[mode] });
    });
  }, [user, data?.inquiry, messages.length, id, markRead, queryClient, queryKey, mode]);

  useEffect(() => {
    triggerMarkRead();
    const onVis = () => {
      if (document.visibilityState === "visible") triggerMarkRead();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [triggerMarkRead]);

  // Kirim teks + dukungan antrean offline otomatis.
  const sendBody = useCallback(
    async (text: string, existingTempId?: string, replyToId?: string | null) => {
      const tempId = existingTempId ?? crypto.randomUUID();
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (user?.id) {
          enqueueOfflineMessage(user.id, {
            tempId,
            inquiryId: id,
            body: text,
            replyToId: replyToId ?? null,
            queuedAt: Date.now(),
          });
        }
        setPending((prev) => {
          const exists = prev.some((p) => p.tempId === tempId);
          return exists
            ? prev.map((p) => (p.tempId === tempId ? { ...p, status: "queued" } : p))
            : [...prev, { tempId, body: text, replyToId, status: "queued" }];
        });
        toast.info("Offline: pesan masuk antrean dan akan dikirim saat online.");
        return;
      }

      if (existingTempId) {
        setPending((prev) =>
          prev.map((p) => (p.tempId === tempId ? { ...p, status: "sending" } : p)),
        );
      } else {
        setPending((prev) => [...prev, { tempId, body: text, replyToId, status: "sending" }]);
      }

      try {
        const result = await postMessage({
          data: { inquiryId: id, body: text, replyToId: replyToId ?? null },
        });
        if (!result.ok) {
          setPending((prev) =>
            prev.map((p) => (p.tempId === tempId ? { ...p, status: "failed" } : p)),
          );
          if (!existingTempId) toast.error(result.error);
          return;
        }
        if (user?.id) removeOfflineMessage(user.id, tempId);
        setPending((prev) => prev.filter((p) => p.tempId !== tempId));
        await queryClient.invalidateQueries({ queryKey });
        await queryClient.invalidateQueries({ queryKey: messagesKey });
        await queryClient.invalidateQueries({ queryKey: LIST_KEYS[mode] });
      } catch {
        setPending((prev) =>
          prev.map((p) => (p.tempId === tempId ? { ...p, status: "failed" } : p)),
        );
        if (!existingTempId) toast.error("Koneksi terputus saat mengirim pesan.");
      }
    },
    [id, user?.id, postMessage, queryClient, queryKey, messagesKey, mode],
  );

  // Pantau status online/offline dan kirim antrean otomatis saat kembali online.
  useEffect(() => {
    const onOffline = () => setIsOffline(true);
    const onOnline = () => {
      setIsOffline(false);
      if (!user?.id) return;
      const queued = loadOfflineOutbox(user.id, id);
      for (const item of queued) {
        void sendBody(item.body, item.tempId, item.replyToId);
      }
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [id, user?.id, sendBody]);

  async function uploadSingleFile(file: File) {
    const prep = await prepareUpload({
      data: { inquiryId: id, mimeType: file.type || "application/octet-stream", sizeBytes: file.size },
    });
    if (!prep.ok) throw new Error(prep.error);
    const { error: upErr } = await supabase.storage
      .from(prep.bucket)
      .uploadToSignedUrl(prep.path, prep.token, file, { contentType: prep.mimeType });
    if (upErr) throw upErr;
    return {
      path: prep.path,
      name: file.name.slice(0, 160),
      mime: prep.mimeType,
      size: file.size,
    };
  }

  async function sendAttachment(
    input: ChatAttachInput,
    opts?: { replyToId?: string | null },
  ) {
    const tempId = crypto.randomUUID();
    const label =
      input.kind === "image"
        ? "Mengunggah foto..."
        : input.kind === "gallery"
          ? `Mengunggah ${input.files.length} foto...`
          : input.kind === "audio"
            ? "Mengunggah pesan suara..."
            : input.kind === "location"
              ? "Mengirim lokasi..."
              : input.kind === "product"
                ? `Produk: ${input.label}`
                : input.kind === "service"
                  ? `Jasa: ${input.label}`
                  : `Mengunggah ${input.file.name}...`;
    const caption =
      "caption" in input && input.caption ? input.caption : "";

    setPending((prev) => [
      ...prev,
      { tempId, body: caption, status: "sending", attachmentLabel: label },
    ]);
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
      } else if (input.kind === "product") {
        attachment = { kind: "product", productId: input.productId };
      } else if (input.kind === "service") {
        attachment = { kind: "service", serviceId: input.serviceId };
      } else if (input.kind === "gallery") {
        const uploaded = [];
        for (const file of input.files.slice(0, 4)) {
          if (file.size > 10 * 1024 * 1024) {
            throw new Error("Ukuran setiap foto maksimal 10 MB.");
          }
          uploaded.push(await uploadSingleFile(file));
        }
        attachment = { kind: "gallery", items: uploaded };
      } else if (input.kind === "audio") {
        if (input.file.size > 5 * 1024 * 1024) {
          throw new Error("Ukuran pesan suara maksimal 5 MB.");
        }
        const entry = await uploadSingleFile(input.file);
        attachment = {
          kind: "audio",
          ...entry,
          durationSec: input.durationSec,
          waveform: input.waveform,
        };
      } else {
        if (input.file.size > 10 * 1024 * 1024) {
          throw new Error("Ukuran file maksimal 10 MB.");
        }
        const entry = await uploadSingleFile(input.file);
        attachment = { kind: input.kind, ...entry };
      }

      const result = await postMessage({
        data: {
          inquiryId: id,
          body: caption,
          attachment,
          replyToId: opts?.replyToId ?? null,
        },
      });
      drop();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: LIST_KEYS[mode] });
    } catch (err: any) {
      drop();
      toast.error(err?.message || "Lampiran gagal dikirim. Coba lagi.");
    }
  }

  async function handleReact(messageId: string, emoji: (typeof CHAT_REACTION_EMOJIS)[number]) {
    const res = await toggleReactionFn({ data: { messageId, emoji } });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey });
  }

  async function handleEdit(messageId: string, body: string) {
    const res = await editMessageFn({ data: { messageId, body } });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Pesan diperbarui.");
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: LIST_KEYS[mode] });
  }

  async function handleDelete(messageId: string) {
    const res = await deleteMessageFn({ data: { messageId } });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Pesan dihapus.");
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: LIST_KEYS[mode] });
  }

  async function handleMarkUnread() {
    const res = await markUnread({ data: { inquiryId: id } });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    broadcastReadChange(id);
    await queryClient.invalidateQueries({ queryKey: ["inquiry-unread"] });
    await queryClient.invalidateQueries({ queryKey: LIST_KEYS[mode] });
    toast.success("Percakapan ditandai belum dibaca.");
  }

  async function loadMore() {
    const before = messages[0]?.created_at;
    if (!before || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage({ data: { id, before } });
      setOlder((prev) => [...page.messages, ...prev]);
      if (!page.hasMore) reachedEndRef.current = true;
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
    await queryClient.invalidateQueries({ queryKey: LIST_KEYS[mode] });
  }

  if (isPending) return <AdminLoading />;
  if (error) return <ErrorState onRetry={() => refetch()} />;
  if (!data?.inquiry)
    return (
      <ErrorState
        title="Percakapan tidak ditemukan"
        description="Percakapan mungkin sudah dihapus atau Anda tidak memiliki akses."
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
  const service = data.service as {
    id: string;
    name: string;
    price: number | string;
    duration_days?: number;
    revision_limit?: number;
  } | null;

  const viewerRole = mode;
  const roleLabel =
    mode === "customer"
      ? data.store?.name
        ? `Toko · ${data.store.name}`
        : "Tim Ebrystore"
      : `Pembeli · ${data.customerName}`;
  const partnerName =
    mode === "customer"
      ? (data.store?.name ?? "Tim Ebrystore")
      : (data.customerName ?? "Pelanggan");
  const partnerAvatarUrl = mode === "customer" ? ((data.store as any)?.logo_url ?? null) : null;
  const myReadAt = mode === "customer" ? inquiry.customer_read_at : inquiry.merchant_read_at;
  const partnerReadAt = mode === "customer" ? inquiry.merchant_read_at : inquiry.customer_read_at;
  const finalPrice = product ? priceDetails(product.price, product.discount_price).price : 0;
  const thumbnail =
    product?.thumbnail_url && isRenderableImageUrl(product.thumbnail_url)
      ? product.thumbnail_url
      : null;

  const contextSlot = product ? (
    <Link
      to="/produk/$slug"
      params={{ slug: product.slug }}
      className="flex min-h-11 items-center gap-2.5 border-t border-border/60 bg-surface/60 px-3 py-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-secondary text-primary">
        {thumbnail ? (
          <img src={optimizedMediaUrl(thumbnail, 96)} alt="" className="size-full object-cover" />
        ) : (
          <Package className="size-4" aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-foreground">{product.name}</span>
        <span className="block text-[11px] font-semibold tabular-nums text-price">
          {formatRupiah(finalPrice)}
        </span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-primary">Lihat produk</span>
    </Link>
  ) : service ? (
    <Link
      to="/jasa/$id"
      params={{ id: service.id }}
      className="flex min-h-11 items-center gap-2.5 border-t border-border/60 bg-surface/60 px-3 py-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-selected text-primary">
        <BriefcaseBusiness className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-foreground">{service.name}</span>
        <span className="block text-[11px] tabular-nums text-muted-foreground">
          <strong className="text-price">{formatRupiah(Number(service.price))}</strong>
          {service.duration_days ? ` · ${service.duration_days} hari` : ""}
          {service.revision_limit != null ? ` · ${service.revision_limit} revisi` : ""}
        </span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-primary">Lihat jasa</span>
    </Link>
  ) : null;

  return (
    <ChatWindow
      threadId={id}
      title={inquiry.subject}
      partnerName={partnerName}
      partnerAvatarUrl={partnerAvatarUrl}
      partnerOnline={partnerOnline}
      roleLabel={roleLabel}
      statusLabel={INQUIRY_STATUS_LABEL[inquiry.status] ?? inquiry.status}
      status={inquiry.status}
      closed={closed}
      storeId={inquiry.store_id ?? null}
      messages={messages}
      replyTargets={data.replyTargets as Record<string, Partial<ChatMessage>> | undefined}
      pending={pending}
      selfId={user?.id}
      viewerRole={viewerRole}
      partnerTyping={partnerTyping}
      partnerRecording={partnerRecording}
      myReadAt={myReadAt ?? null}
      partnerReadAt={partnerReadAt ?? null}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={() => void loadMore()}
      onSend={(body, opts) => void sendBody(body, undefined, opts?.replyToId)}
      onRetry={(tempId, body, replyToId) => void sendBody(body, tempId, replyToId)}
      onDiscardPending={(tempId) => {
        if (user?.id) removeOfflineMessage(user.id, tempId);
        setPending((prev) => prev.filter((p) => p.tempId !== tempId));
      }}
      onToggleClosed={() => void toggleClosed()}
      canToggleClosed={mode !== "customer"}
      onDraftChange={sendTyping}
      onRecordingPulse={sendRecording}
      onAttach={(input, opts) => void sendAttachment(input, opts)}
      onReact={(messageId, emoji) => void handleReact(messageId, emoji)}
      onEditMessage={(messageId, body) => void handleEdit(messageId, body)}
      onDeleteMessage={(messageId) => void handleDelete(messageId)}
      onRefreshAttachmentUrl={refreshAttachmentUrl}
      attachmentUrls={attachmentUrls}
      pinned={isPinned(id)}
      onTogglePin={() => togglePin(id)}
      onMarkUnread={() => void handleMarkUnread()}
      muted={muted}
      onToggleMute={() => {
        const next = !muted;
        setMuted(next);
        setChatMuted(next);
        toast.success(next ? "Suara notifikasi dibisukan." : "Suara notifikasi diaktifkan.");
      }}
      onEnableBrowserNotify={() => {
        void requestBrowserNotificationPermission().then((perm) => {
          if (perm === "granted") toast.success("Notifikasi browser aktif.");
          else if (perm === "unsupported") toast.error("Browser tidak mendukung notifikasi desktop.");
          else toast.error("Izin notifikasi browser ditolak.");
        });
      }}
      isOffline={isOffline}
      embedded={embedded}
      backSlot={
        <Link
          to={BACK_ROUTES[mode]}
          aria-label="Kembali ke daftar chat"
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-full text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            embedded && "lg:hidden",
          )}
        >
          <ChevronLeft className="size-6" aria-hidden="true" />
        </Link>
      }
      productSlot={contextSlot}
    />
  );
}
