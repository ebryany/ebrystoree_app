import { useState } from "react";
import { ImageUploader } from "./image-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HomeBannerSlide } from "@/lib/website-settings";

export function BannerSlidesEditor({
  slides,
  disabled,
  onChange,
  uploadRemote,
  onBusyChange,
}: {
  slides: HomeBannerSlide[];
  disabled: boolean;
  onChange: (slides: HomeBannerSlide[]) => void;
  uploadRemote: (file: File) => Promise<string>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [busyKeys, setBusyKeys] = useState<string[]>([]);
  const locked = disabled || busyKeys.length > 0;
  function busy(key: string, value: boolean) {
    const next = value ? [...new Set([...busyKeys, key])] : busyKeys.filter((item) => item !== key);
    setBusyKeys(next);
    onBusyChange(next.length > 0);
  }
  function update(index: number, patch: Partial<HomeBannerSlide>) {
    onChange(slides.map((slide, i) => (i === index ? { ...slide, ...patch } : slide)));
  }
  return (
    <div className="space-y-4">
      {slides.map((slide, index) => (
        <fieldset key={index} className="min-w-0 space-y-3 rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-semibold">Banner tambahan {index + 1}</legend>
          <ImageUploader
            value={slide.imageUrl}
            onChange={(imageUrl) => update(index, { imageUrl })}
            folder="branding/home"
            label="Gambar desktop"
            disabled={locked}
            uploadRemote={uploadRemote}
            onBusyChange={(value) => busy(`${index}-desktop`, value)}
          />
          <ImageUploader
            value={slide.mobileUrl}
            onChange={(mobileUrl) => update(index, { mobileUrl })}
            folder="branding/home"
            label="Gambar mobile (opsional)"
            disabled={locked}
            uploadRemote={uploadRemote}
            onBusyChange={(value) => busy(`${index}-mobile`, value)}
          />
          <Label htmlFor={`banner-alt-${index}`}>
            Pesan pada gambar / deskripsi untuk pembaca layar
          </Label>
          <Input
            id={`banner-alt-${index}`}
            value={slide.alt}
            maxLength={200}
            disabled={locked}
            onChange={(event) => update(index, { alt: event.target.value })}
            className="min-h-11"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={locked || index === 0}
              onClick={() => {
                const next = [...slides];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                onChange(next);
              }}
            >
              Pindah ke atas
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={locked}
              onClick={() => onChange(slides.filter((_, i) => i !== index))}
            >
              Hapus banner dari slider
            </Button>
          </div>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={locked || slides.length >= 5}
        onClick={() => onChange([...slides, { imageUrl: "", mobileUrl: "", alt: "" }])}
      >
        Tambah banner
      </Button>
    </div>
  );
}
