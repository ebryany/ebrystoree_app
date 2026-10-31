import { useRef, useState } from "react";
import { Camera, Loader2, Pencil, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAvatarUrl } from "@/hooks/use-avatar-url";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

type Props = {
  value: string | null;
  userId: string;
  name?: string | null;
  onChange: (value: string) => Promise<void> | void;
  /** "centered" = avatar besar di tengah dengan badge pensil (header profil). */
  variant?: "inline" | "centered";
};

export function AvatarUploader({ value, userId, name, onChange, variant = "inline" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const previewUrl = useAvatarUrl(value);

  const initials =
    (name ?? "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || null;

  async function upload(file: File) {
    if (!ALLOWED.includes(file.type)) {
      toast.error("Format foto harus JPG, PNG, WEBP, atau AVIF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Ukuran foto maksimal 2 MB.");
      return;
    }
    setBusy(true);
    try {
      const ext =
        (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      await onChange(`/api/public/avatar/${path}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Gagal mengunggah foto profil.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const fileInput = (
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
  );

  if (variant === "centered") {
    return (
      <div className="relative mx-auto w-fit">
        <div className="grid size-28 place-items-center overflow-hidden rounded-full border-4 border-card bg-gradient-to-br from-accent/20 to-accent/5 text-accent shadow-[0_10px_30px_-12px_oklch(0.42_0.06_205/45%)]">
          {previewUrl ? (
            <img src={previewUrl} alt="Foto profil" className="size-full object-cover" />
          ) : initials ? (
            <span className="text-3xl font-semibold">{initials}</span>
          ) : (
            <UserRound className="size-10" aria-hidden="true" />
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={busy}
              aria-label="Ubah foto profil"
              className="absolute bottom-0 right-0 grid size-11 place-items-center rounded-full border-[3px] border-card bg-accent text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {busy ? (
                <Loader2
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Pencil className="size-4" aria-hidden="true" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-52">
            <DropdownMenuItem className="min-h-11 gap-3" onSelect={() => inputRef.current?.click()}>
              <Camera className="size-4" aria-hidden="true" />
              {value ? "Ganti foto" : "Unggah foto"}
            </DropdownMenuItem>
            {value ? (
              <DropdownMenuItem
                className="min-h-11 gap-3 text-destructive focus:text-destructive"
                onSelect={() => void onChange("")}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Hapus foto
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        {fileInput}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <div className="grid size-20 place-items-center overflow-hidden rounded-full border border-border/70 bg-gradient-to-br from-accent/20 to-accent/5 text-accent shadow-inner">
          {previewUrl ? (
            <img src={previewUrl} alt="Foto profil" className="size-full object-cover" />
          ) : initials ? (
            <span className="text-lg font-semibold">{initials}</span>
          ) : (
            <UserRound className="size-8" aria-hidden="true" />
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label="Unggah foto profil"
          className="absolute -bottom-1 -right-1 grid size-11 place-items-center rounded-full border-2 border-background bg-accent text-accent-foreground shadow-sm transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Camera className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Foto profil</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          JPG, PNG, WEBP, atau AVIF — maksimal 2 MB.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {value ? "Ganti foto" : "Unggah foto"}
          </Button>
          {value ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11"
              disabled={busy}
              onClick={() => void onChange("")}
            >
              <Trash2 className="mr-1 size-4" aria-hidden="true" />
              Hapus
            </Button>
          ) : null}
        </div>
      </div>

      {fileInput}
    </div>
  );
}
