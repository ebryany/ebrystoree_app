import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { GripVertical, ImagePlus, Loader2, Trash2, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { prepareServiceMediaUpload } from "@/lib/marketplace-service.functions";
import {
  MARKETPLACE_SERVICE_IMAGE_MAX_BYTES,
  MARKETPLACE_SERVICE_MEDIA_MAX,
  MARKETPLACE_SERVICE_MEDIA_MIME_TYPES,
  MARKETPLACE_SERVICE_VIDEO_MAX_BYTES,
  serviceMediaUrl,
  type MarketplaceServiceMedia,
} from "@/lib/marketplace-service";
import { cn } from "@/lib/utils";

const MAX_LABEL = `${MARKETPLACE_SERVICE_MEDIA_MAX} media`;

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Unggah maksimal 5 media jasa (gambar atau video). Unggahan berjalan sebelum
 * simpan; entri yang sudah selesai tetap tersedia bila simpan gagal, sehingga
 * seller tidak perlu mengunggah ulang.
 */
export function ServiceMediaEditor({
  listingId,
  value,
  onChange,
  disabled,
  onBusyChange,
}: {
  listingId: string | null;
  value: MarketplaceServiceMedia[];
  onChange: (next: MarketplaceServiceMedia[]) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const prepare = useServerFn(prepareServiceMediaUpload);

  const remaining = MARKETPLACE_SERVICE_MEDIA_MAX - value.length;

  function setBusyState(next: boolean) {
    setBusy(next);
    onBusyChange?.(next);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (value.length >= MARKETPLACE_SERVICE_MEDIA_MAX) {
      setError(`Maksimal ${MAX_LABEL} per jasa.`);
      return;
    }
    const picked = Array.from(files).slice(0, remaining);
    setBusyState(true);
    const added: MarketplaceServiceMedia[] = [];
    for (const file of picked) {
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");
      if (!(MARKETPLACE_SERVICE_MEDIA_MIME_TYPES as readonly string[]).includes(file.type)) {
        setError("Format harus JPG, PNG, WEBP, AVIF, MP4, atau WEBM.");
        continue;
      }
      if (isImage && file.size > MARKETPLACE_SERVICE_IMAGE_MAX_BYTES) {
        setError("Ukuran gambar maksimal 5 MB.");
        continue;
      }
      if (isVideo && file.size > MARKETPLACE_SERVICE_VIDEO_MAX_BYTES) {
        setError("Ukuran video maksimal 25 MB.");
        continue;
      }
      const prep = await prepare({
        data: {
          listingId,
          mimeType: file.type as (typeof MARKETPLACE_SERVICE_MEDIA_MIME_TYPES)[number],
          sizeBytes: file.size,
        },
      });
      if (!prep.ok) {
        setError(prep.error);
        continue;
      }
      const uploaded = await supabase.storage
        .from("service-media")
        .uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type });
      if (uploaded.error) {
        setError("Media gagal diunggah. Periksa koneksi lalu coba lagi.");
        continue;
      }
      added.push({
        kind: isVideo ? "video" : "image",
        path: prep.path,
        alt: file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 160) || "Media jasa",
        mime: file.type as (typeof MARKETPLACE_SERVICE_MEDIA_MIME_TYPES)[number],
        size: file.size,
      });
    }
    setBusyState(false);
    if (inputRef.current) inputRef.current.value = "";
    if (added.length) {
      setError("");
      onChange([...value, ...added]);
    }
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...value];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Media jasa</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Maksimal {MARKETPLACE_SERVICE_MEDIA_MAX} berkas. Gambar sampai 5 MB, video sampai 25 MB.
            Media pertama tampil sebagai sampul.
          </p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {value.length}/{MARKETPLACE_SERVICE_MEDIA_MAX}
        </span>
      </div>

      {value.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {value.map((item, index) => (
            <li
              key={item.path}
              className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-2.5"
            >
              <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-selected">
                {item.kind === "image" ? (
                  <img
                    src={serviceMediaUrl(item.path)}
                    alt={item.alt}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <Video className="size-5 text-muted-foreground" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {item.kind === "image" ? "Gambar" : "Video"} {index + 1}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.alt} · {formatSize(item.size)}
                </p>
                {index === 0 ? (
                  <p className="mt-0.5 text-[11px] font-semibold text-accent">Sampul</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  aria-label={`Naikkan media ${index + 1}`}
                  disabled={disabled || busy || index === 0}
                  onClick={() => move(index, -1)}
                  className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <GripVertical className="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Hapus media ${index + 1}`}
                  disabled={disabled || busy}
                  onClick={() => removeAt(index)}
                  className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          ref={inputRef}
          id="jasa-media"
          type="file"
          multiple
          accept={MARKETPLACE_SERVICE_MEDIA_MIME_TYPES.join(",")}
          disabled={disabled || busy || remaining <= 0}
          onChange={(event) => void handleFiles(event.target.files)}
          className="min-h-11 sm:max-w-sm"
          aria-label="Unggah media jasa"
        />
        {remaining <= 0 ? (
          <p className="text-xs text-muted-foreground">
            Batas media tercapai. Hapus satu untuk menambah.
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {busy ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Mengunggah…
              </>
            ) : (
              <>
                <ImagePlus className="size-3.5" aria-hidden="true" />
                Bisa pilih beberapa berkas sekaligus
              </>
            )}
          </p>
        )}
      </div>

      {error ? (
        <p role="alert" className={cn("text-sm text-destructive")}>
          {error}
        </p>
      ) : null}

      {value.length > 0 && !busy ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-10"
          disabled={disabled}
          onClick={() => onChange([])}
        >
          Hapus semua media
        </Button>
      ) : null}
    </div>
  );
}
