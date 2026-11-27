import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AtSign,
  BarChart3,
  Film,
  Gift,
  Globe,
  ImagePlus,
  Loader2,
  Plus,
  ShoppingBag,
  Users,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import {
  createThreadChain,
  prepareReelUpload,
  uploadThreadImage,
} from "@/lib/social-threads.functions";
import {
  REEL_MAX_BYTES,
  THREAD_MAX_CHAIN,
  THREAD_MAX_CHARS,
  THREAD_MAX_MEDIA,
  type AttachedCommerceItem,
  type SocialAuthor,
  type SocialMediaItem,
  type ThreadPostItem,
  type ThreadPostKind,
  type ThreadReplyPolicy,
} from "@/lib/social-threads.shared";
import { cn, optimizedMediaUrl } from "@/lib/utils";
import { AuthorAvatar } from "./thread-card";
import { ThreadCommerceCard, ThreadCommercePickerDialog } from "./thread-commerce-card";

type DraftSegment = {
  key: string;
  body: string;
  media: SocialMediaItem[];
  commerce: AttachedCommerceItem | null;
};

function createEmptySegment(): DraftSegment {
  return {
    key:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Math.random()),
    body: "",
    media: [],
    commerce: null,
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Gagal membaca file gambar."));
    reader.readAsDataURL(file);
  });
}

function probeVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      const dur = Number.isFinite(v.duration) ? Math.max(1, Math.min(180, Math.round(v.duration))) : null;
      URL.revokeObjectURL(url);
      resolve(dur);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    v.src = url;
  });
}

const POLICY_OPTIONS: Array<{
  value: ThreadReplyPolicy;
  label: string;
  shortLabel: string;
  icon: typeof Globe;
}> = [
  { value: "everyone", label: "Siapa saja bisa membalas", shortLabel: "Semua orang", icon: Globe },
  {
    value: "followers",
    label: "Hanya pengikut Anda yang bisa membalas",
    shortLabel: "Pengikut",
    icon: Users,
  },
  {
    value: "mentioned",
    label: "Hanya akun yang disebut (@) yang bisa membalas",
    shortLabel: "Yang disebut",
    icon: AtSign,
  },
];

/**
 * Iconic top-of-feed Threads inline prompt ("Apa yang baru?") + 1-tap Reel & Produk shortcuts.
 */
export function InlineThreadPrompt({
  me,
  onOpenCompose,
  onOpenReel,
  onOpenWithCommerce,
}: {
  me: SocialAuthor | null;
  onOpenCompose: () => void;
  onOpenReel: () => void;
  onOpenWithCommerce: () => void;
}) {
  return (
    <div className="border-b border-border/80 px-4 py-3.5 sm:px-5">
      <div className="flex items-center gap-3">
        <AuthorAvatar
          displayName={me?.displayName ?? "Anda"}
          avatarUrl={me?.avatarUrl ?? null}
          size="md"
        />
        <button
          type="button"
          onClick={onOpenCompose}
          className="flex min-h-11 min-w-0 flex-1 items-center rounded-xl px-1 text-left text-[15px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Apa yang baru?
        </button>
        <button
          type="button"
          onClick={onOpenReel}
          aria-label="Buat Video Reel"
          className="hidden min-h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-semibold text-foreground transition-colors hover:bg-surface-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
        >
          <Film className="size-3.5 text-accent" aria-hidden="true" />
          <span>Reel</span>
        </button>
        <button
          type="button"
          onClick={onOpenWithCommerce}
          aria-label="Posting dengan produk atau jasa"
          className="hidden min-h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-semibold text-foreground transition-colors hover:bg-surface-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex"
        >
          <ShoppingBag className="size-3.5 text-accent" aria-hidden="true" />
          <span>Produk</span>
        </button>
        <button
          type="button"
          onClick={onOpenCompose}
          className="min-h-9 shrink-0 rounded-full border border-border bg-card px-4 text-xs font-bold text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Posting
        </button>
      </div>
    </div>
  );
}

/**
 * Full Meta Threads + Reels + Creator Tools compose modal:
 * - Mode Utas (chain up to 5) or Mode Video Reel (direct signed upload MP4/WebM <= 30 MB)
 * - Attach Produk Digital / Jasa Seller
 * - Interactive Poll (2-4 options)
 * - Auto-DM Kata Kunci (ManyChat native -> sends product card & message into Chat!)
 * - Freebie Lead-Magnet Lock (follow creator to unlock free resource link!)
 */
export function ThreadComposerModal({
  open,
  onOpenChange,
  me,
  replyTo = null,
  quotePost = null,
  initialMode = "thread",
  initialOpenCommerce = false,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  me: SocialAuthor | null;
  replyTo?: ThreadPostItem | null;
  quotePost?: ThreadPostItem | null;
  initialMode?: ThreadPostKind;
  initialOpenCommerce?: boolean;
  onPublished: (created: ThreadPostItem[]) => void;
}) {
  const navigate = useNavigate();
  const [postKind, setPostKind] = useState<ThreadPostKind>(initialMode);
  const [segments, setSegments] = useState<DraftSegment[]>(() => [createEmptySegment()]);
  const [replyPolicy, setReplyPolicy] = useState<ThreadReplyPolicy>("everyone");
  const [submitting, setSubmitting] = useState(false);
  const [uploadingSegKey, setUploadingSegKey] = useState<string | null>(null);
  const [commercePickerKey, setCommercePickerKey] = useState<string | null>(null);

  // Video Reel state
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDurationSec, setVideoDurationSec] = useState<number | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  // Interactive creator tools (Poll, Auto-DM, Freebie)
  const [pollOpen, setPollOpen] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [autoDmOpen, setAutoDmOpen] = useState(false);
  const [autoDmKeyword, setAutoDmKeyword] = useState("");
  const [autoDmMessage, setAutoDmMessage] = useState("");
  const [freebieOpen, setFreebieOpen] = useState(false);
  const [freebieTitle, setFreebieTitle] = useState("");
  const [freebieUrl, setFreebieUrl] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const activeUploadKeyRef = useRef<string | null>(null);

  const publishFn = useServerFn(createThreadChain);
  const uploadImgFn = useServerFn(uploadThreadImage);
  const prepareReelFn = useServerFn(prepareReelUpload);

  useEffect(() => {
    if (open) {
      const fresh = createEmptySegment();
      setPostKind(replyTo ? "thread" : initialMode);
      setSegments([fresh]);
      setReplyPolicy("everyone");
      setVideoUrl(null);
      setVideoDurationSec(null);
      setPollOpen(false);
      setPollOptions(["", ""]);
      setAutoDmOpen(false);
      setAutoDmKeyword("");
      setAutoDmMessage("");
      setFreebieOpen(false);
      setFreebieTitle("");
      setFreebieUrl("");
      if (initialOpenCommerce) {
        setCommercePickerKey(fresh.key);
      }
    }
  }, [open, initialMode, initialOpenCommerce, replyTo, quotePost?.id]);

  const cleanPollOptions = pollOpen
    ? pollOptions.map((o) => o.trim()).filter(Boolean)
    : [];

  const firstSegHasContent =
    segments[0].body.trim().length > 0 ||
    segments[0].media.length > 0 ||
    Boolean(videoUrl) ||
    cleanPollOptions.length >= 2 ||
    Boolean(freebieOpen && freebieTitle.trim() && freebieUrl.trim()) ||
    Boolean(segments[0].commerce) ||
    Boolean(quotePost);

  const canPublish =
    !submitting &&
    !uploadingSegKey &&
    !uploadingVideo &&
    (postKind === "reel" ? Boolean(videoUrl) : firstSegHasContent) &&
    segments.slice(1).every(
      (s) => s.body.trim().length > 0 || s.media.length > 0 || Boolean(s.commerce),
    );

  async function handleImageSelect(files: FileList | null) {
    const segKey = activeUploadKeyRef.current;
    if (!files || !files.length || !segKey) return;
    const currentSeg = segments.find((s) => s.key === segKey);
    if (!currentSeg) return;
    const remaining = Math.max(0, THREAD_MAX_MEDIA - currentSeg.media.length);
    if (remaining <= 0) {
      toast.info(`Maksimal ${THREAD_MAX_MEDIA} gambar per utas.`);
      return;
    }

    const picked = Array.from(files).slice(0, remaining);
    setUploadingSegKey(segKey);
    try {
      const uploaded: SocialMediaItem[] = [];
      for (const file of picked) {
        if (file.size > 3 * 1024 * 1024) {
          toast.error(`${file.name} melebihi batas 3 MB.`);
          continue;
        }
        const base64 = await fileToBase64(file);
        const res = await uploadImgFn({ data: { base64 } });
        if (!res.ok) {
          toast.error(res.error);
          continue;
        }
        uploaded.push({ url: res.url, alt: file.name.slice(0, 120) });
      }
      if (uploaded.length) {
        setSegments((prev) =>
          prev.map((s) =>
            s.key === segKey
              ? { ...s, media: [...s.media, ...uploaded].slice(0, THREAD_MAX_MEDIA) }
              : s,
          ),
        );
      }
    } catch {
      toast.error("Gagal mengunggah gambar.");
    } finally {
      setUploadingSegKey(null);
      activeUploadKeyRef.current = null;
    }
  }

  async function handleReelVideoSelect(file: File | undefined) {
    if (!file) return;
    if (file.size > REEL_MAX_BYTES) {
      toast.error("Ukuran video Reel maksimal 30 MB.");
      return;
    }
    const mime = (file.type || "").split(";")[0]?.trim().toLowerCase();
    if (mime !== "video/mp4" && mime !== "video/webm") {
      toast.error("Format video Reel harus MP4 atau WebM.");
      return;
    }

    setUploadingVideo(true);
    try {
      const durationSec = await probeVideoDuration(file);
      const prep = await prepareReelFn({
        data: { mimeType: mime, sizeBytes: file.size },
      });
      if (!prep.ok) {
        toast.error(prep.error);
        return;
      }
      const { error: upErr } = await supabase.storage
        .from(prep.bucket)
        .uploadToSignedUrl(prep.path, prep.token, file, { contentType: prep.mimeType });
      if (upErr) {
        toast.error("Unggahan video gagal. Coba lagi.");
        return;
      }
      setVideoUrl(prep.publicUrl);
      setVideoDurationSec(durationSec);
      setPostKind("reel");
      toast.success("Video Reel siap diterbitkan.");
    } catch {
      toast.error("Terjadi kendala saat mengunggah video.");
    } finally {
      setUploadingVideo(false);
    }
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!canPublish) return;
    if (autoDmOpen && (!autoDmKeyword.trim() || !autoDmMessage.trim())) {
      toast.error("Lengkapi kata kunci dan pesan balasan Auto-DM.");
      return;
    }
    if (freebieOpen && (!freebieTitle.trim() || !/^https?:\/\//i.test(freebieUrl.trim()))) {
      toast.error("Lengkapi judul dan tautan https:// untuk file gratis.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await publishFn({
        data: {
          segments: segments.map((s, idx) => ({
            body: s.body.trim(),
            media: postKind === "reel" && idx === 0 ? [] : s.media,
            postKind: idx === 0 ? postKind : "thread",
            videoUrl: idx === 0 && postKind === "reel" ? videoUrl : null,
            videoDurationSec: idx === 0 && postKind === "reel" ? videoDurationSec : null,
            attachedProductId: s.commerce?.kind === "product" ? s.commerce.id : null,
            attachedServiceId: s.commerce?.kind === "service" ? s.commerce.id : null,
            pollOptions: idx === 0 && cleanPollOptions.length >= 2 ? cleanPollOptions : null,
            pollDurationHours: 24,
            autoDmKeyword: idx === 0 && autoDmOpen ? autoDmKeyword.trim() : null,
            autoDmMessage: idx === 0 && autoDmOpen ? autoDmMessage.trim() : null,
            freebieTitle: idx === 0 && freebieOpen ? freebieTitle.trim() : null,
            freebieUrl: idx === 0 && freebieOpen ? freebieUrl.trim() : null,
            freebieRequiresFollow: true,
          })),
          parentId: replyTo ? replyTo.targetPostId : null,
          quotePostId: quotePost ? quotePost.targetPostId : null,
          replyPolicy,
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      if (res.autoDmTriggered) {
        const { inquiryId, keyword, storeName } = res.autoDmTriggered;
        toast.success(`Auto-DM "${keyword}" dari ${storeName} terkirim ke Chat!`, {
          action: {
            label: "Buka Chat",
            onClick: () => {
              void navigate({ to: "/dashboard/chat/$id", params: { id: inquiryId } });
            },
          },
          duration: 8000,
        });
      } else {
        toast.success(
          replyTo
            ? "Balasan diterbitkan."
            : postKind === "reel"
              ? "Video Reel diterbitkan."
              : segments.length > 1
                ? `${segments.length} utas berantai diterbitkan.`
                : "Utas diterbitkan.",
        );
      }

      onPublished(res.posts);
      onOpenChange(false);
    } catch {
      toast.error("Terjadi kendala saat menerbitkan utas.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      void handleSubmit();
    }
  }

  const activePolicy = POLICY_OPTIONS.find((p) => p.value === replyPolicy) ?? POLICY_OPTIONS[0];
  const modalTitle = replyTo
    ? `Balas @${replyTo.author.handle}`
    : quotePost
      ? "Kutip Utas"
      : postKind === "reel"
        ? "Reel Video Baru"
        : "Utas Baru";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92dvh] max-w-xl flex-col gap-0 overflow-hidden rounded-2xl p-0">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-3">
            <div className="flex items-center justify-between gap-2 pr-6">
              <DialogTitle className="font-display text-base font-bold">{modalTitle}</DialogTitle>
              {!replyTo && !quotePost ? (
                <div className="inline-flex rounded-full border border-border bg-surface p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setPostKind("thread")}
                    className={cn(
                      "rounded-full px-3 py-1 font-semibold transition-colors",
                      postKind === "thread"
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Utas
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPostKind("reel");
                      setSegments((prev) => [prev[0]]);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold transition-colors",
                      postKind === "reel"
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Film className="size-3" aria-hidden="true" />
                    <span>Reel</span>
                  </button>
                </div>
              ) : null}
            </div>
            <DialogDescription className="sr-only">
              Tulis utas atau unggah video Reel, tambahkan polling, auto-DM kata kunci, file gratis,
              atau tautkan produk digital dan jasa Ebrystore.
            </DialogDescription>
          </DialogHeader>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleImageSelect(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/webm"
            className="hidden"
            onChange={(e) => {
              void handleReelVideoSelect(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          <form onSubmit={(e) => void handleSubmit(e)} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-1 overflow-y-auto overscroll-contain px-5 py-4">
              {/* Parent preview when replying */}
              {replyTo ? (
                <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-3 pb-3">
                  <div className="flex flex-col items-center">
                    <AuthorAvatar
                      displayName={replyTo.author.displayName}
                      avatarUrl={replyTo.author.avatarUrl}
                      size="md"
                    />
                    <span
                      className="mt-2 min-h-6 w-[2px] flex-1 rounded-full bg-border"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="min-w-0 pb-2">
                    <p className="text-sm font-bold text-foreground">{replyTo.author.handle}</p>
                    <p className="mt-0.5 whitespace-pre-line break-words text-sm text-foreground/90">
                      {replyTo.body}
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Segments */}
              {segments.map((seg, idx) => {
                const isLast = idx === segments.length - 1;
                const showRail =
                  postKind === "thread" && (!isLast || segments.length < THREAD_MAX_CHAIN);
                const remaining = THREAD_MAX_CHARS - seg.body.length;

                return (
                  <div key={seg.key} className="grid grid-cols-[42px_minmax(0,1fr)] gap-3">
                    <div className="flex flex-col items-center">
                      <AuthorAvatar
                        displayName={me?.displayName ?? "Anda"}
                        avatarUrl={me?.avatarUrl ?? null}
                        size="md"
                      />
                      {showRail ? (
                        <span
                          className="mt-2 min-h-6 w-[2px] flex-1 rounded-full bg-border"
                          aria-hidden="true"
                        />
                      ) : null}
                    </div>

                    <div className="min-w-0 pb-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold text-foreground">
                          {me?.handle ?? "anda"}
                        </span>
                        <div className="flex items-center gap-2">
                          {seg.body.length > 0 ? (
                            <span
                              className={cn(
                                "font-mono text-[11px] tabular-nums",
                                remaining < 40
                                  ? "font-semibold text-destructive"
                                  : "text-muted-foreground",
                              )}
                            >
                              {remaining}
                            </span>
                          ) : null}
                          {segments.length > 1 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setSegments((prev) => prev.filter((item) => item.key !== seg.key))
                              }
                              aria-label={`Hapus segmen utas ${idx + 1}`}
                              className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
                            >
                              <X className="size-3.5" aria-hidden="true" />
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <textarea
                        autoFocus={idx === segments.length - 1}
                        value={seg.body}
                        maxLength={THREAD_MAX_CHARS}
                        onKeyDown={handleKeyDown}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSegments((prev) =>
                            prev.map((item) =>
                              item.key === seg.key ? { ...item, body: val } : item,
                            ),
                          );
                        }}
                        placeholder={
                          replyTo
                            ? replyTo.autoDm
                              ? `Ketik "${replyTo.autoDm.keyword}" untuk Auto-DM atau balas @${replyTo.author.handle}...`
                              : `Balas @${replyTo.author.handle}...`
                            : postKind === "reel"
                              ? "Tulis caption Reel, jelaskan demo produk digital Anda, pakai #hashtag..."
                              : idx === 0
                                ? "Ada kabar, review produk, atau karya baru hari ini? Pakai #hashtag..."
                                : "Lanjutkan utas ini..."
                        }
                        aria-label={`Isi utas ${idx + 1}`}
                        className="threads-textarea mt-1 resize-none bg-transparent text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
                      />

                      {/* Reel Video Uploader / Preview */}
                      {idx === 0 && postKind === "reel" ? (
                        <div className="mt-2.5">
                          {videoUrl ? (
                            <div className="relative max-w-[260px] overflow-hidden rounded-2xl border border-border bg-black">
                              <video
                                src={videoUrl}
                                controls
                                playsInline
                                muted
                                className="max-h-72 w-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setVideoUrl(null);
                                  setVideoDurationSec(null);
                                }}
                                aria-label="Hapus video Reel"
                                className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/75 text-white hover:bg-black"
                              >
                                <X className="size-4" aria-hidden="true" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={uploadingVideo}
                              onClick={() => videoInputRef.current?.click()}
                              className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface/60 px-4 py-7 text-center transition-colors hover:border-accent/60 hover:bg-surface disabled:opacity-60"
                            >
                              {uploadingVideo ? (
                                <>
                                  <Loader2 className="size-6 animate-spin text-accent" aria-hidden="true" />
                                  <span className="text-xs font-semibold text-foreground">
                                    Mengunggah video Reel...
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Film className="size-6 text-accent" aria-hidden="true" />
                                  <span className="text-xs font-semibold text-foreground">
                                    Pilih video pendek (MP4 / WebM, maks 30 MB)
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">
                                    Rasio vertikal 9:16 paling ideal untuk demo produk digital
                                  </span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      ) : null}

                      {/* Image previews */}
                      {postKind === "thread" && seg.media.length > 0 ? (
                        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                          {seg.media.map((m, mIdx) => (
                            <div
                              key={`${m.url}-${mIdx}`}
                              className="relative size-28 shrink-0 overflow-hidden rounded-xl border border-border bg-surface"
                            >
                              <img
                                src={optimizedMediaUrl(m.url, 360)}
                                alt={m.alt || "Pratinjau gambar"}
                                className="size-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setSegments((prev) =>
                                    prev.map((item) =>
                                      item.key === seg.key
                                        ? {
                                            ...item,
                                            media: item.media.filter((_, i) => i !== mIdx),
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                aria-label="Hapus gambar"
                                className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/70 text-white hover:bg-black"
                              >
                                <X className="size-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {/* Attached commerce preview */}
                      {seg.commerce ? (
                        <div className="mt-2.5">
                          <ThreadCommerceCard
                            item={seg.commerce}
                            compact
                            onRemove={() =>
                              setSegments((prev) =>
                                prev.map((item) =>
                                  item.key === seg.key ? { ...item, commerce: null } : item,
                                ),
                              )
                            }
                          />
                        </div>
                      ) : null}

                      {/* Interactive Poll Builder (first segment only) */}
                      {idx === 0 && pollOpen ? (
                        <div className="mt-2.5 space-y-2 rounded-2xl border border-border bg-surface/60 p-3">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-foreground">
                              <BarChart3 className="size-3.5 text-accent" aria-hidden="true" />
                              Polling (24 jam)
                            </span>
                            <button
                              type="button"
                              onClick={() => setPollOpen(false)}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              Hapus
                            </button>
                          </div>
                          {pollOptions.map((opt, oIdx) => (
                            <div key={oIdx} className="flex items-center gap-1.5">
                              <input
                                type="text"
                                maxLength={60}
                                value={opt}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setPollOptions((prev) => prev.map((x, i) => (i === oIdx ? v : x)));
                                }}
                                placeholder={`Pilihan ${oIdx + 1}`}
                                className="h-9 flex-1 rounded-xl border border-border bg-background px-3 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              />
                              {pollOptions.length > 2 ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPollOptions((prev) => prev.filter((_, i) => i !== oIdx))
                                  }
                                  aria-label={`Hapus pilihan ${oIdx + 1}`}
                                  className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
                                >
                                  <X className="size-3.5" />
                                </button>
                              ) : null}
                            </div>
                          ))}
                          {pollOptions.length < 4 ? (
                            <button
                              type="button"
                              onClick={() => setPollOptions((prev) => [...prev, ""])}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                            >
                              <Plus className="size-3.5" aria-hidden="true" />
                              Tambah pilihan
                            </button>
                          ) : null}
                        </div>
                      ) : null}

                      {/* Auto-DM Keyword Trigger Builder (first segment, root posts only) */}
                      {idx === 0 && !replyTo && autoDmOpen ? (
                        <div className="mt-2.5 space-y-2 rounded-2xl border border-emerald-500/35 bg-emerald-500/8 p-3">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                              <Zap className="size-3.5" aria-hidden="true" />
                              Auto-DM Kata Kunci (ManyChat Bawaan)
                            </span>
                            <button
                              type="button"
                              onClick={() => setAutoDmOpen(false)}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              Hapus
                            </button>
                          </div>
                          <input
                            type="text"
                            maxLength={32}
                            value={autoDmKeyword}
                            onChange={(e) => setAutoDmKeyword(e.target.value)}
                            placeholder="Kata kunci pemicu, mis. MAU atau TEMPLATE"
                            className="h-9 w-full rounded-xl border border-border bg-background px-3 font-mono text-xs uppercase text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                          <textarea
                            rows={2}
                            maxLength={500}
                            value={autoDmMessage}
                            onChange={(e) => setAutoDmMessage(e.target.value)}
                            placeholder="Pesan balasan yang otomatis dikirim ke Chat (+ kartu produk jika ditautkan)..."
                            className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        </div>
                      ) : null}

                      {/* Freebie Lead Magnet Lock Builder */}
                      {idx === 0 && !replyTo && freebieOpen ? (
                        <div className="mt-2.5 space-y-2 rounded-2xl border border-accent/35 bg-accent/8 p-3">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-accent">
                              <Gift className="size-3.5" aria-hidden="true" />
                              Bonus Gratis (Buka setelah Ikuti)
                            </span>
                            <button
                              type="button"
                              onClick={() => setFreebieOpen(false)}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              Hapus
                            </button>
                          </div>
                          <input
                            type="text"
                            maxLength={120}
                            value={freebieTitle}
                            onChange={(e) => setFreebieTitle(e.target.value)}
                            placeholder="Judul bonus, mis. Template Notion Keuangan (Gratis)"
                            className="h-9 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                          <input
                            type="url"
                            maxLength={500}
                            value={freebieUrl}
                            onChange={(e) => setFreebieUrl(e.target.value)}
                            placeholder="https://... (tautan file atau halaman bonus)"
                            className="h-9 w-full rounded-xl border border-border bg-background px-3 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        </div>
                      ) : null}

                      {/* Quote card preview */}
                      {idx === 0 && quotePost ? (
                        <div className="mt-2.5 rounded-2xl border border-border/90 bg-surface/60 p-3">
                          <div className="flex items-center gap-2">
                            <AuthorAvatar
                              displayName={quotePost.author.displayName}
                              avatarUrl={quotePost.author.avatarUrl}
                              size="sm"
                            />
                            <span className="text-xs font-bold text-foreground">
                              {quotePost.author.handle}
                            </span>
                          </div>
                          {quotePost.body ? (
                            <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                              {quotePost.body}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {/* Attachment & Interactive Creator Toolbar */}
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {postKind === "thread" ? (
                          <button
                            type="button"
                            disabled={uploadingSegKey === seg.key || seg.media.length >= THREAD_MAX_MEDIA}
                            onClick={() => {
                              activeUploadKeyRef.current = seg.key;
                              fileInputRef.current?.click();
                            }}
                            aria-label="Tambah gambar"
                            className="inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground disabled:opacity-45"
                          >
                            {uploadingSegKey === seg.key ? (
                              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <ImagePlus className="size-4" aria-hidden="true" />
                            )}
                            <span>Foto</span>
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => setCommercePickerKey(seg.key)}
                          aria-label="Tautkan produk atau jasa Ebrystore"
                          className="inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                        >
                          <ShoppingBag className="size-4 text-accent" aria-hidden="true" />
                          <span>Produk</span>
                        </button>

                        {idx === 0 && !replyTo ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setPollOpen((v) => !v)}
                              className={cn(
                                "inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors",
                                pollOpen
                                  ? "bg-surface-selected text-foreground"
                                  : "text-muted-foreground hover:bg-surface hover:text-foreground",
                              )}
                            >
                              <BarChart3 className="size-4" aria-hidden="true" />
                              <span>Polling</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setAutoDmOpen((v) => !v)}
                              className={cn(
                                "inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors",
                                autoDmOpen
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                  : "text-muted-foreground hover:bg-surface hover:text-foreground",
                              )}
                            >
                              <Zap className="size-4" aria-hidden="true" />
                              <span>Auto-DM</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setFreebieOpen((v) => !v)}
                              className={cn(
                                "inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors",
                                freebieOpen
                                  ? "bg-accent/15 text-accent"
                                  : "text-muted-foreground hover:bg-surface hover:text-foreground",
                              )}
                            >
                              <Gift className="size-4" aria-hidden="true" />
                              <span>Bonus</span>
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Multi-post thread chain trigger */}
              {postKind === "thread" && segments.length < THREAD_MAX_CHAIN ? (
                <div className="grid grid-cols-[42px_minmax(0,1fr)] items-center gap-3">
                  <div className="flex justify-center opacity-55">
                    <AuthorAvatar
                      displayName={me?.displayName ?? "Anda"}
                      avatarUrl={me?.avatarUrl ?? null}
                      size="sm"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={
                      segments[segments.length - 1].body.trim().length === 0 &&
                      segments[segments.length - 1].media.length === 0 &&
                      !segments[segments.length - 1].commerce
                    }
                    onClick={() => setSegments((prev) => [...prev, createEmptySegment()])}
                    className="inline-flex min-h-9 w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    <span>
                      Tambahkan ke utas ({segments.length}/{THREAD_MAX_CHAIN})
                    </span>
                  </button>
                </div>
              ) : null}
            </div>

            {/* Sticky footer */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-5 py-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <activePolicy.icon className="size-3.5" aria-hidden="true" />
                    <span>{activePolicy.shortLabel} bisa membalas</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 rounded-2xl p-1.5">
                  {POLICY_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                      key={opt.value}
                      className="min-h-10 gap-2.5 rounded-xl text-xs"
                      onSelect={() => setReplyPolicy(opt.value)}
                    >
                      <opt.icon className="size-4 shrink-0" />
                      <span>{opt.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                type="submit"
                disabled={!canPublish}
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                <span>{postKind === "reel" ? "Terbitkan Reel" : "Posting"}</span>
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ThreadCommercePickerDialog
        open={Boolean(commercePickerKey)}
        onOpenChange={(next) => {
          if (!next) setCommercePickerKey(null);
        }}
        onPick={(item) => {
          if (!commercePickerKey) return;
          setSegments((prev) =>
            prev.map((s) => (s.key === commercePickerKey ? { ...s, commerce: item } : s)),
          );
        }}
      />
    </>
  );
}
