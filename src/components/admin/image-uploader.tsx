import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

type Props = {
  value: string;
  onChange: (value: string) => void;
  folder: string;
  label?: string;
  hint?: string;
  disabled?: boolean;
  /** Opt-in banner: unggah lewat server function berizin, bukan klien langsung. */
  uploadRemote?: (file: File) => Promise<string>;
  /** Memberi tahu induk bahwa unggahan sedang berjalan agar save diblokir. */
  onBusyChange?: (busy: boolean) => void;
};

export function ImageUploader({
  value,
  onChange,
  folder,
  label = "Gambar",
  hint,
  disabled = false,
  uploadRemote,
  onBusyChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  function setBusyState(next: boolean) {
    setBusy(next);
    onBusyChange?.(next);
  }

  async function upload(file: File) {
    if (disabled || busy) return;
    if (!ALLOWED.includes(file.type))
      return toast.error("Format gambar harus JPG, PNG, WEBP, atau AVIF.");
    if (file.size > MAX_BYTES) return toast.error("Ukuran gambar maksimal 3 MB.");

    setBusyState(true);
    try {
      if (uploadRemote) {
        const url = await uploadRemote(file);
        onChange(url);
        toast.success("Gambar diunggah, simpan untuk menerapkan.");
      } else {
        const ext =
          (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${folder}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("catalog-images").upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (error) throw error;
        onChange(`/api/public/catalog-image/${path}`);
        toast.success("Gambar berhasil diunggah.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal mengunggah gambar.");
    } finally {
      setBusyState(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
          <img
            src={value}
            alt="Pratinjau gambar"
            className="size-20 shrink-0 rounded-lg object-cover"
            loading="lazy"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">Gambar terpasang</p>
            <p className="truncate text-xs text-muted-foreground">{value.split("/").pop()}</p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || busy}
                onClick={() => inputRef.current?.click()}
              >
                Ganti
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled || busy}
                onClick={() => onChange("")}
              >
                <Trash2 className="mr-1 size-4" aria-hidden="true" />
                Hapus
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void upload(file);
          }}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center transition-colors hover:border-primary hover:bg-muted/60",
            dragging && "border-primary bg-muted/60",
          )}
          disabled={disabled || busy}
        >
          {busy ? (
            <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
          ) : (
            <ImagePlus className="size-6 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="text-sm font-medium">
            {busy ? "Mengunggah…" : "Klik atau seret gambar ke sini"}
          </span>
          <span className="text-xs text-muted-foreground">
            {hint ?? "JPG, PNG, WEBP, atau AVIF — maksimal 3 MB"}
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
