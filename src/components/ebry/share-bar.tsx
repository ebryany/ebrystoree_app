import { useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Tombol bagikan: Web Share API bila tersedia, fallback salin tautan + WhatsApp/X. */
export function ShareBar({ title, text }: { title: string; text?: string }) {
  const [copied, setCopied] = useState(false);

  const url = typeof window === "undefined" ? "" : window.location.href;

  async function nativeShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text: text ?? title, url });
        return;
      } catch {
        return;
      }
    }
    await copyLink();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Tautan artikel disalin.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Gagal menyalin tautan.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" onClick={nativeShare} className="press-scale">
        <Share2 className="mr-2 size-4" aria-hidden="true" /> Bagikan
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={copyLink} className="press-scale">
        {copied ? <Check className="mr-2 size-4" aria-hidden="true" /> : <Link2 className="mr-2 size-4" aria-hidden="true" />}
        {copied ? "Tersalin" : "Salin tautan"}
      </Button>
      <Button asChild size="sm" variant="ghost">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${title} — ${url}`)}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          WhatsApp
        </a>
      </Button>
      <Button asChild size="sm" variant="ghost">
        <a
          href={`https://x.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          X
        </a>
      </Button>
    </div>
  );
}