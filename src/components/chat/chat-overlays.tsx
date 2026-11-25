import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  BellOff,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  Link2,
  Loader2,
  Mic,
  Package,
  Pin,
  PinOff,
  Plus,
  Search,
  SendHorizontal,
  Smile,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { searchShareableCatalog } from "@/lib/inquiries.functions";
import { formatRupiah } from "@/lib/format";
import { cn, isRenderableImageUrl, optimizedMediaUrl } from "@/lib/utils";
import { extractChatUrls } from "./chat-format";
import { formatAudioClock } from "./voice-note";
import type { ChatMessage } from "./chat-window";

/** Lightbox pratinjau foto in-app dengan zoom, navigasi album, dan unduh. */
export function ImageLightbox({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: Array<{ url: string; name: string }>;
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const active = items[index];

  useEffect(() => {
    setZoomed(false);
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && index < items.length - 1) onIndexChange(index + 1);
      else if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onIndexChange]);

  if (!active) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Pratinjau ${active.name}`}
      className="fixed inset-0 z-[70] flex flex-col bg-black/92 text-white"
    >
      <div className="pt-safe flex items-center justify-between gap-2 px-3 py-2.5 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{active.name}</p>
          {items.length > 1 ? (
            <p className="text-xs text-white/70 tabular-nums">
              {index + 1} dari {items.length}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setZoomed((z) => !z)}
            aria-label={zoomed ? "Perkecil gambar" : "Perbesar gambar"}
            className="grid size-11 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {zoomed ? <ZoomOut className="size-5" /> : <ZoomIn className="size-5" />}
          </button>
          <a
            href={active.url}
            download={active.name}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Unduh ${active.name}`}
            className="grid size-11 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Download className="size-5" />
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pratinjau"
            className="grid size-11 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center overflow-auto p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {items.length > 1 && index > 0 ? (
          <button
            type="button"
            onClick={() => onIndexChange(index - 1)}
            aria-label="Foto sebelumnya"
            className="absolute left-3 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronLeft className="size-6" />
          </button>
        ) : null}

        <img
          src={active.url}
          alt={active.name}
          onClick={() => setZoomed((z) => !z)}
          className={cn(
            "rounded-lg transition-transform duration-200 motion-reduce:transition-none",
            zoomed
              ? "max-w-none cursor-zoom-out scale-125 sm:scale-150"
              : "max-h-[82dvh] max-w-full cursor-zoom-in object-contain",
          )}
        />

        {items.length > 1 && index < items.length - 1 ? (
          <button
            type="button"
            onClick={() => onIndexChange(index + 1)}
            aria-label="Foto berikutnya"
            className="absolute right-3 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronRight className="size-6" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export type StagedAttachment =
  | { kind: "images"; files: Array<{ file: File; previewUrl: string }> }
  | { kind: "file"; file: File };

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Panel pratinjau + caption sebelum mengirim 1-4 foto atau dokumen (gaya WhatsApp).
 */
export function AttachmentPreviewBar({
  staged,
  caption,
  onCaptionChange,
  onAddMoreImages,
  onRemoveImage,
  onCancel,
  onConfirmSend,
}: {
  staged: StagedAttachment;
  caption: string;
  onCaptionChange: (value: string) => void;
  onAddMoreImages: () => void;
  onRemoveImage: (index: number) => void;
  onCancel: () => void;
  onConfirmSend: () => void;
}) {
  return (
    <div className="border-t border-border bg-card/95 px-3 py-2.5 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2 pb-2">
        <p className="text-xs font-semibold text-foreground">
          {staged.kind === "images"
            ? `Pratinjau foto (${staged.files.length}/4)`
            : "Pratinjau dokumen"}
        </p>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Batalkan lampiran"
          className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {staged.kind === "images" ? (
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {staged.files.map((item, idx) => (
            <div
              key={`${item.file.name}-${idx}`}
              className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted"
            >
              <img src={item.previewUrl} alt={item.file.name} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => onRemoveImage(idx)}
                aria-label={`Hapus foto ${item.file.name}`}
                className="absolute right-0.5 top-0.5 grid size-6 place-items-center rounded-full bg-black/70 text-white hover:bg-black"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
          {staged.files.length < 4 ? (
            <button
              type="button"
              onClick={onAddMoreImages}
              aria-label="Tambah foto lagi"
              className="grid size-16 shrink-0 place-items-center rounded-xl border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="size-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-selected text-primary">
            <FileText className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{staged.file.name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(staged.file.size)}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={caption}
          onChange={(e) => onCaptionChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault();
              onConfirmSend();
            }
          }}
          maxLength={2000}
          placeholder="Tambah keterangan (opsional)..."
          aria-label="Keterangan lampiran"
          className="h-11 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
        />
        <button
          type="button"
          onClick={onConfirmSend}
          aria-label="Kirim lampiran"
          className="press-scale grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SendHorizontal className="size-[18px]" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** Pemilih emoji ringkas lokal (tanpa dependency eksternal & 100% CSP safe). */
const EMOJI_GRID = [
  "😀", "😊", "🙏", "👍", "❤️", "🔥", "🎉", "✅",
  "😂", "😍", "🤝", "👌", "🙌", "💡", "📦", "✨",
  "😅", "🤔", "😢", "😮", "⚡", "📌", "📄", "💬",
];

export function EmojiQuickPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Sisipkan emoji"
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Smile className="size-5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64 rounded-2xl p-2">
        <div className="grid grid-cols-8 gap-1">
          {EMOJI_GRID.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
              className="grid size-7 place-items-center rounded-lg text-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Dialog pemilih Kartu Produk / Kartu Jasa untuk dikirim langsung ke dalam chat. */
export function CatalogCardPicker({
  open,
  onOpenChange,
  storeId,
  onSelectProduct,
  onSelectService,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId?: string | null;
  onSelectProduct: (productId: string, label: string) => void;
  onSelectService: (serviceId: string, label: string) => void;
}) {
  const [q, setQ] = useState("");
  const fetchCatalog = useServerFn(searchShareableCatalog);
  const query = useQuery({
    queryKey: ["chat-share-catalog", storeId ?? "all", q.trim()],
    queryFn: () => fetchCatalog({ data: { storeId: storeId ?? null, q: q.trim() || undefined } }),
    enabled: open,
    staleTime: 30_000,
  });

  const products = (query.data?.products ?? []) as Array<{
    productId: string;
    slug: string;
    name: string;
    price: number;
    discountPrice: number | null;
    thumbnailUrl: string | null;
    storeName: string | null;
  }>;
  const services = (query.data?.services ?? []) as Array<{
    serviceId: string;
    name: string;
    price: number;
    durationDays: number;
    revisionLimit: number;
    storeName: string | null;
  }>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[82dvh] max-w-md overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 pb-3 pt-4">
          <DialogTitle className="text-base">Kirim kartu produk atau jasa</DialogTitle>
          <DialogDescription className="text-xs">
            Pilih item untuk dikirim sebagai kartu interaktif ke percakapan ini.
          </DialogDescription>
          <div className="relative mt-2">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari produk atau jasa..."
              aria-label="Cari produk atau jasa"
              className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
        </DialogHeader>

        <div className="max-h-[54dvh] space-y-4 overflow-y-auto px-4 py-3">
          {query.isPending ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Memuat katalog...
            </div>
          ) : products.length === 0 && services.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada produk atau jasa aktif yang cocok.
            </p>
          ) : (
            <>
              {products.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Produk digital
                  </p>
                  <ul className="space-y-1.5">
                    {products.map((p) => {
                      const thumb = isRenderableImageUrl(p.thumbnailUrl) ? p.thumbnailUrl : null;
                      return (
                        <li key={p.productId}>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectProduct(p.productId, p.name);
                              onOpenChange(false);
                            }}
                            className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-card p-2 text-left transition-colors hover:border-primary/50 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-selected text-primary">
                              {thumb ? (
                                <img
                                  src={optimizedMediaUrl(thumb, 128)}
                                  alt=""
                                  className="size-full object-cover"
                                />
                              ) : (
                                <Package className="size-5" aria-hidden="true" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">{p.name}</span>
                              <span className="block text-xs font-semibold tabular-nums text-price">
                                {formatRupiah(p.discountPrice ?? p.price)}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs font-semibold text-primary">Kirim</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {services.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Jasa seller
                  </p>
                  <ul className="space-y-1.5">
                    {services.map((s) => (
                      <li key={s.serviceId}>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectService(s.serviceId, s.name);
                            onOpenChange(false);
                          }}
                          className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-card p-2 text-left transition-colors hover:border-primary/50 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-surface-selected text-primary">
                            <BriefcaseBusiness className="size-5" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{s.name}</span>
                            <span className="block text-xs tabular-nums text-muted-foreground">
                              <strong className="text-price">{formatRupiah(s.price)}</strong> ·{" "}
                              {s.durationDays} hari · {s.revisionLimit} revisi
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-primary">Kirim</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Panel Info & Media Percakapan (ala WhatsApp Contact Info Drawer):
 * tab Media (foto/album), Dokumen & VN, Tautan, plus aksi Pin & Notifikasi.
 */
export function ChatMediaDrawer({
  open,
  onOpenChange,
  partnerName,
  roleLabel,
  messages,
  attachmentUrls,
  onOpenImage,
  pinned,
  onTogglePin,
  muted,
  onToggleMute,
  onEnableBrowserNotify,
  canToggleClosed,
  closed,
  onToggleClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partnerName: string;
  roleLabel: string;
  messages: ChatMessage[];
  attachmentUrls?: Record<string, string>;
  onOpenImage: (url: string, name: string) => void;
  pinned: boolean;
  onTogglePin?: () => void;
  muted: boolean;
  onToggleMute?: () => void;
  onEnableBrowserNotify?: () => void;
  canToggleClosed: boolean;
  closed: boolean;
  onToggleClosed: () => void;
}) {
  const [tab, setTab] = useState<"media" | "docs" | "links">("media");

  const photos: Array<{ path: string; name: string; url?: string }> = [];
  const docs: Array<{ id: string; kind: "file" | "audio"; name: string; meta: string; url?: string }> = [];
  for (const m of messages) {
    if (m.deleted_at || !m.attachment) continue;
    if (m.attachment.kind === "image") {
      photos.push({
        path: m.attachment.path,
        name: m.attachment.name,
        url: attachmentUrls?.[m.attachment.path],
      });
    } else if (m.attachment.kind === "gallery") {
      for (const item of m.attachment.items) {
        photos.push({ path: item.path, name: item.name, url: attachmentUrls?.[item.path] });
      }
    } else if (m.attachment.kind === "file") {
      docs.push({
        id: m.id,
        kind: "file",
        name: m.attachment.name,
        meta: formatFileSize(m.attachment.size),
        url: attachmentUrls?.[m.attachment.path],
      });
    } else if (m.attachment.kind === "audio") {
      docs.push({
        id: m.id,
        kind: "audio",
        name: "Pesan suara",
        meta: formatAudioClock(m.attachment.durationSec),
        url: attachmentUrls?.[m.attachment.path],
      });
    }
  }
  const links = extractChatUrls(messages.filter((m) => !m.deleted_at));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-sm flex-col p-0">
        <SheetHeader className="border-b border-border px-5 pb-4 pt-5 text-left">
          <SheetTitle className="truncate text-base">{partnerName}</SheetTitle>
          <SheetDescription className="truncate text-xs">{roleLabel}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
          {onTogglePin ? (
            <Button type="button" variant="outline" size="sm" className="min-h-10 gap-1.5" onClick={onTogglePin}>
              {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
              {pinned ? "Lepas pin" : "Sematkan"}
            </Button>
          ) : null}
          {onToggleMute ? (
            <Button type="button" variant="outline" size="sm" className="min-h-10 gap-1.5" onClick={onToggleMute}>
              {muted ? <Bell className="size-4" /> : <BellOff className="size-4" />}
              {muted ? "Aktifkan suara" : "Bisukan"}
            </Button>
          ) : null}
          {onEnableBrowserNotify ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10 gap-1.5"
              onClick={onEnableBrowserNotify}
            >
              <Bell className="size-4" /> Notifikasi browser
            </Button>
          ) : null}
        </div>

        <div role="tablist" aria-label="Media percakapan" className="grid grid-cols-3 border-b border-border">
          {(
            [
              { id: "media", label: `Media (${photos.length})` },
              { id: "docs", label: `Berkas (${docs.length})` },
              { id: "links", label: `Tautan (${links.length})` },
            ] as const
          ).map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              onClick={() => setTab(entry.id)}
              className={cn(
                "min-h-11 border-b-2 px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                tab === entry.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === "media" ? (
            photos.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Belum ada foto di percakapan ini.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p, idx) => (
                  <button
                    key={`${p.path}-${idx}`}
                    type="button"
                    disabled={!p.url}
                    onClick={() => p.url && onOpenImage(p.url, p.name)}
                    className="aspect-square overflow-hidden rounded-lg border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {p.url ? (
                      <img src={p.url} alt={p.name} loading="lazy" className="size-full object-cover" />
                    ) : (
                      <span className="grid size-full place-items-center text-muted-foreground">
                        <ImageIcon className="size-5" aria-hidden="true" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )
          ) : tab === "docs" ? (
            docs.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Belum ada dokumen atau pesan suara.
              </p>
            ) : (
              <ul className="space-y-2">
                {docs.map((d) => (
                  <li key={d.id}>
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={d.kind === "file" ? d.name : undefined}
                      className={cn(
                        "flex min-h-12 items-center gap-3 rounded-xl border border-border bg-card p-2.5 text-sm hover:bg-surface",
                        !d.url && "pointer-events-none opacity-60",
                      )}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-selected text-primary">
                        {d.kind === "audio" ? (
                          <Mic className="size-4" aria-hidden="true" />
                        ) : (
                          <FileText className="size-4" aria-hidden="true" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{d.name}</span>
                        <span className="block text-xs text-muted-foreground">{d.meta}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )
          ) : links.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Belum ada tautan yang dibagikan.
            </p>
          ) : (
            <ul className="space-y-2">
              {links.map((item) => (
                <li key={item.url}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="flex min-h-11 items-center gap-2.5 rounded-xl border border-border bg-card p-2.5 text-xs hover:bg-surface"
                  >
                    <Link2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-medium text-primary underline underline-offset-2">
                      {item.url}
                    </span>
                    <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {canToggleClosed ? (
          <div className="border-t border-border p-4">
            <Button
              type="button"
              variant={closed ? "default" : "outline"}
              className="min-h-11 w-full"
              onClick={() => {
                onToggleClosed();
                onOpenChange(false);
              }}
            >
              {closed ? "Buka kembali percakapan" : "Tutup percakapan"}
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
