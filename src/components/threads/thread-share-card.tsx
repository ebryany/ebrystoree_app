import { useEffect, useRef, useState } from "react";
import { Copy, Download, ExternalLink, Share2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatRupiah } from "@/lib/format";
import { buildPublicThreadUrl, type ThreadPostItem } from "@/lib/social-threads.shared";

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -3).trimEnd()}...`;
  }
  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Renders a crisp, high-DPI shareable card (1080x1350) ready to upload to Meta Threads / IG Story / X.
 * Pure Canvas 2D with zero external dependencies.
 */
function renderShareCardToCanvas(
  canvas: HTMLCanvasElement,
  post: ThreadPostItem,
  shareUrl: string,
) {
  const W = 1080;
  const H = 1350;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Clean editorial dark-ink background (high contrast, zero AI purple slop)
  ctx.fillStyle = "#0B1418";
  ctx.fillRect(0, 0, W, H);

  // Subtle top brand header
  ctx.fillStyle = "#12232A";
  drawRoundedRect(ctx, 64, 64, W - 128, 86, 43);
  ctx.fill();

  ctx.fillStyle = "#16B89A";
  ctx.beginPath();
  ctx.arc(114, 107, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#06201B";
  ctx.font = "700 26px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("@", 114, 108);

  ctx.textAlign = "left";
  ctx.fillStyle = "#F4F8F7";
  ctx.font = "700 28px system-ui, -apple-system, sans-serif";
  ctx.fillText("EBRYSTORE THREADS", 154, 107);

  ctx.textAlign = "right";
  ctx.fillStyle = "#8BB2AA";
  ctx.font = "600 22px system-ui, -apple-system, sans-serif";
  ctx.fillText("Marketplace + Chat + Komunitas", W - 98, 107);

  // Main Threads post card
  const cardX = 64;
  const cardY = 190;
  const cardW = W - 128;
  const cardH = 920;
  ctx.fillStyle = "#FFFFFF";
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 36);
  ctx.fill();

  // Author avatar circle + thread rail line
  const avX = cardX + 76;
  const avY = cardY + 84;
  ctx.fillStyle = "#0F2B26";
  ctx.beginPath();
  ctx.arc(avX, avY, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "700 32px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((post.author.displayName[0] || "E").toUpperCase(), avX, avY + 1);

  // Vertical Threads connector line
  ctx.strokeStyle = "#DCE5E3";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(avX, avY + 48);
  ctx.lineTo(avX, cardY + cardH - 120);
  ctx.stroke();

  // Author handle + verified store badge
  const contentX = cardX + 140;
  const contentW = cardW - 196;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#0C181C";
  ctx.font = "700 34px system-ui, -apple-system, sans-serif";
  ctx.fillText(`@${post.author.handle}`, contentX, cardY + 82);

  if (post.author.verifiedStore) {
    ctx.fillStyle = "#0D7A67";
    ctx.font = "600 24px system-ui, -apple-system, sans-serif";
    ctx.fillText(`Toko Terverifikasi · ${post.author.verifiedStore.name}`, contentX, cardY + 116);
  } else {
    ctx.fillStyle = "#5B6F73";
    ctx.font = "500 24px system-ui, -apple-system, sans-serif";
    ctx.fillText(post.author.displayName, contentX, cardY + 116);
  }

  // Post body text
  const bodyText =
    post.body.trim() ||
    (post.postKind === "reel" ? "Tonton Reel produk digital terbaru di Ebrystore." : "Lihat utas terbaru di Ebrystore.");
  ctx.fillStyle = "#102026";
  ctx.font = "500 36px system-ui, -apple-system, sans-serif";
  const lines = wrapCanvasText(ctx, bodyText, contentW, 8);
  let y = cardY + 190;
  for (const line of lines) {
    ctx.fillText(line, contentX, y);
    y += 50;
  }

  // Embedded Commerce Product/Service box
  if (post.attachedCommerce) {
    const boxY = Math.max(y + 24, cardY + 585);
    const boxH = 186;
    ctx.fillStyle = "#F3F8F7";
    ctx.strokeStyle = "#CFE2DD";
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, contentX, boxY, contentW, boxH, 24);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#0D7A67";
    ctx.font = "700 22px system-ui, -apple-system, sans-serif";
    ctx.fillText(
      post.attachedCommerce.kind === "product" ? "PRODUK DIGITAL EBRYSTORE" : "JASA SELLER EBRYSTORE",
      contentX + 28,
      boxY + 48,
    );

    ctx.fillStyle = "#0C181C";
    ctx.font = "700 30px system-ui, -apple-system, sans-serif";
    const prodTitle = wrapCanvasText(ctx, post.attachedCommerce.name, contentW - 56, 1)[0] ?? "";
    ctx.fillText(prodTitle, contentX + 28, boxY + 96);

    const price =
      post.attachedCommerce.kind === "product"
        ? (post.attachedCommerce.discountPrice ?? post.attachedCommerce.price)
        : post.attachedCommerce.price;
    ctx.fillStyle = "#0B6655";
    ctx.font = "800 34px system-ui, -apple-system, sans-serif";
    ctx.fillText(formatRupiah(price), contentX + 28, boxY + 148);

    ctx.fillStyle = "#0C181C";
    drawRoundedRect(ctx, contentX + contentW - 220, boxY + 108, 192, 54, 27);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "700 22px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Beli / Chat", contentX + contentW - 124, boxY + 143);
    ctx.textAlign = "left";
  } else if (post.autoDm) {
    const boxY = Math.max(y + 24, cardY + 620);
    ctx.fillStyle = "#EAF8F4";
    ctx.strokeStyle = "#9ED9CB";
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, contentX, boxY, contentW, 110, 22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#0A5D4E";
    ctx.font = "700 28px system-ui, -apple-system, sans-serif";
    ctx.fillText(`Balas "${post.autoDm.keyword}" untuk dapat info otomatis di Chat`, contentX + 28, boxY + 65);
  }

  // Engagement footer inside card
  ctx.fillStyle = "#5B6F73";
  ctx.font = "600 24px system-ui, -apple-system, sans-serif";
  ctx.fillText(
    `${post.likesCount} suka   ·   ${post.repliesCount} balasan   ·   ${post.repostsCount + post.quotesCount} repost`,
    contentX,
    cardY + cardH - 42,
  );

  // Bottom CTA bar for viral creator acquisition
  const ctaY = 1150;
  ctx.fillStyle = "#12232A";
  drawRoundedRect(ctx, 64, ctaY, W - 128, 136, 28);
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "700 28px system-ui, -apple-system, sans-serif";
  ctx.fillText("Punya produk digital? Jual + Chat + Threads di 1 tempat.", 100, ctaY + 58);

  ctx.fillStyle = "#5CE0C4";
  ctx.font = "600 24px ui-monospace, monospace";
  const displayUrl = shareUrl.replace(/^https?:\/\//, "").slice(0, 56);
  ctx.fillText(displayUrl, 100, ctaY + 102);
}

/**
 * Interactive Share & Viral Creator Acquisition Modal:
 * - Live PNG share card preview & download (ready for Meta Threads / IG Story / X)
 * - Public `/t/$id?ref=@handle` link copy (works for logged-out guests!)
 * - 1-click "Bagikan ke Meta Threads" & WhatsApp deep links
 */
export function ThreadShareModal({
  post,
  viewerHandle,
  onClose,
}: {
  post: ThreadPostItem | null;
  viewerHandle?: string | null;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://app.ebrystore.my.id";
  const shareUrl = post ? buildPublicThreadUrl(origin, post.targetPostId, viewerHandle) : "";

  useEffect(() => {
    if (!post) {
      setPreviewUrl(null);
      return;
    }
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    renderShareCardToCanvas(canvas, post, shareUrl);
    try {
      setPreviewUrl(canvas.toDataURL("image/png"));
    } catch {
      setPreviewUrl(null);
    }
  }, [post, shareUrl]);

  if (!post) return null;

  const shareText = post.attachedCommerce
    ? `${post.body.slice(0, 140)} (${post.attachedCommerce.name}) di Ebrystore:\n${shareUrl}`
    : `${post.body.slice(0, 180) || "Lihat utas ini di Ebrystore Threads"}\n${shareUrl}`;

  function handleDownloadPng() {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = `ebrystore-thread-${post!.author.handle}.png`;
    a.click();
    toast.success("Kartu share PNG berhasil diunduh.");
  }

  function handleCopyPublicLink() {
    void navigator.clipboard?.writeText(shareUrl);
    toast.success("Tautan publik disalin. Siapa saja bisa membukanya tanpa login.");
  }

  return (
    <Dialog open={Boolean(post)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md rounded-2xl p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-base">
            <Share2 className="size-4 text-accent" aria-hidden="true" />
            <span>Bagikan Utas ke Sosial Media</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Tautan publik dapat dibuka siapa saja tanpa login, lengkap dengan kartu produk dan
            ajakan bergabung ke Ebrystore.
          </DialogDescription>
        </DialogHeader>

        {/* Preview of generated PNG share card */}
        {previewUrl ? (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <img
              src={previewUrl}
              alt="Pratinjau kartu share utas"
              className="mx-auto max-h-72 w-auto object-contain"
            />
          </div>
        ) : null}

        {/* Public share link copy box */}
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface/70 p-2">
          <input
            type="text"
            readOnly
            value={shareUrl}
            aria-label="Tautan publik utas"
            className="min-w-0 flex-1 bg-transparent px-2 font-mono text-xs text-foreground outline-none"
          />
          <button
            type="button"
            onClick={handleCopyPublicLink}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-bold text-background hover:opacity-90"
          >
            <Copy className="size-3.5" aria-hidden="true" />
            <span>Salin</span>
          </button>
        </div>

        {/* Viral share actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={!previewUrl}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-surface disabled:opacity-50"
          >
            <Download className="size-4 text-accent" aria-hidden="true" />
            <span>Unduh Kartu PNG</span>
          </button>

          <a
            href={`https://www.threads.net/intent/post?text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-3 text-xs font-bold text-background transition-opacity hover:opacity-90"
          >
            <span>Share ke Threads</span>
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </div>

        <a
          href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-emerald-600/30 bg-emerald-600/10 px-3 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-600/15 dark:text-emerald-300"
        >
          <span>Kirim ke WhatsApp</span>
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </DialogContent>
    </Dialog>
  );
}
