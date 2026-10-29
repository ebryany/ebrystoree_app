import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { listCategories, saveCategory } from "@/lib/admin.functions";
import {
  CATEGORY_ICON_KEYS,
  CATEGORY_ICONS,
  CATEGORY_TONE_KEYS,
  CATEGORY_TONES,
  resolveCategoryStyle,
  type CategoryIconKey,
  type CategoryTone,
} from "@/lib/category-icons";
import { cn } from "@/lib/utils";

type Kind = "product" | "service";

type Draft = {
  id?: string;
  name: string;
  isActive: boolean;
  /** null = otomatis dari nama. */
  icon: CategoryIconKey | null;
  tone: CategoryTone | null;
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  is_active: boolean;
  icon: string | null;
  tone: string | null;
};

const EMPTY: Draft = { name: "", isActive: true, icon: null, tone: null };

const COPY: Record<Kind, { title: string; empty: string; placeholder: string }> = {
  product: {
    title: "Kategori produk digital",
    empty: "Belum ada kategori produk digital.",
    placeholder: "Contoh: Template Dokumen",
  },
  service: {
    title: "Kategori jasa",
    empty: "Belum ada kategori jasa.",
    placeholder: "Contoh: Analisis Data",
  },
};

function CategoryBadgeIcon({
  category,
}: {
  category: { name: string; icon?: string | null; tone?: string | null };
}) {
  const style = resolveCategoryStyle(category);
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-lg",
        CATEGORY_TONES[style.tone].className,
      )}
    >
      <style.icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

/** Kelola kategori (nama, status, ikon, warna) untuk satu jenis katalog. */
export function CategoryManagerDialog({
  kind,
  open,
  onOpenChange,
}: {
  kind: Kind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const fetchCategories = useServerFn(listCategories);
  const persist = useServerFn(saveCategory);
  const copy = COPY[kind];

  const { data } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => fetchCategories({}),
  });
  const items = (
    data && !("forbidden" in data && data.forbidden) ? ((data as any).items as CategoryRow[]) : []
  ).filter((c) => c.kind === kind);

  const mutation = useMutation({
    mutationFn: (d: Draft) =>
      persist({
        data: {
          id: d.id,
          name: d.name.trim(),
          kind,
          isActive: d.isActive,
          icon: d.icon,
          tone: d.tone,
        },
      }),
    onSuccess: (res: any) => {
      if (res?.forbidden) return toast.error(`Izin ${res.permission} dibutuhkan.`);
      if (!res.ok) return toast.error(res.message);
      toast.success(res.message);
      setDraft(EMPTY);
      void qc.invalidateQueries({ queryKey: ["admin-categories"] });
      void qc.invalidateQueries({ queryKey: ["categories"] });
      void qc.invalidateQueries({ queryKey: ["admin-audit"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal menyimpan kategori."),
  });

  const auto = resolveCategoryStyle({ name: draft.name });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-end gap-3">
              <CategoryBadgeIcon category={draft} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor={`kategori-nama-${kind}`}>
                  {draft.id ? "Ubah kategori" : "Kategori baru"}
                </Label>
                <Input
                  id={`kategori-nama-${kind}`}
                  value={draft.name}
                  maxLength={80}
                  placeholder={copy.placeholder}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Ikon</legend>
              <div
                role="radiogroup"
                aria-label="Ikon kategori"
                className="grid grid-cols-6 gap-1.5 sm:grid-cols-9"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={draft.icon === null}
                  title={`Otomatis (${CATEGORY_ICONS[auto.iconKey].label})`}
                  onClick={() => setDraft({ ...draft, icon: null })}
                  className={cn(
                    "col-span-2 flex min-h-11 items-center justify-center rounded-lg border text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    draft.icon === null
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-accent/50",
                  )}
                >
                  Otomatis
                </button>
                {CATEGORY_ICON_KEYS.map((key) => {
                  const Icon = CATEGORY_ICONS[key].icon;
                  const selected = draft.icon === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={CATEGORY_ICONS[key].label}
                      title={CATEGORY_ICONS[key].label}
                      onClick={() => setDraft({ ...draft, icon: key })}
                      className={cn(
                        "grid min-h-11 place-items-center rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:border-accent/50 hover:text-accent",
                      )}
                    >
                      <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Warna</legend>
              <div role="radiogroup" aria-label="Warna kategori" className="flex flex-wrap gap-2">
                <button
                  type="button"
                  role="radio"
                  aria-checked={draft.tone === null}
                  onClick={() => setDraft({ ...draft, tone: null })}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    draft.tone === null
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-accent/50",
                  )}
                >
                  Otomatis
                </button>
                {CATEGORY_TONE_KEYS.map((key) => {
                  const selected = draft.tone === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={CATEGORY_TONES[key].label}
                      title={CATEGORY_TONES[key].label}
                      onClick={() => setDraft({ ...draft, tone: key })}
                      className={cn(
                        "grid size-11 place-items-center rounded-lg border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        CATEGORY_TONES[key].className,
                        selected ? "border-foreground" : "border-transparent",
                      )}
                    >
                      {selected ? <Check className="size-4" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex items-center justify-between gap-3">
              <Label
                htmlFor={`kategori-aktif-${kind}`}
                className="text-sm font-normal text-muted-foreground"
              >
                Tampilkan di katalog publik
              </Label>
              <Switch
                id={`kategori-aktif-${kind}`}
                checked={draft.isActive}
                onCheckedChange={(v) => setDraft({ ...draft, isActive: v })}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={mutation.isPending || draft.name.trim().length < 2}
                onClick={() => mutation.mutate(draft)}
              >
                {draft.id ? "Simpan perubahan" : "Tambah kategori"}
              </Button>
              {draft.id ? (
                <Button size="sm" variant="ghost" onClick={() => setDraft(EMPTY)}>
                  Batal ubah
                </Button>
              ) : null}
            </div>
          </div>

          <ul className="divide-y divide-border rounded-xl border border-border">
            {items.length === 0 ? (
              <li className="p-4 text-sm text-muted-foreground">{copy.empty}</li>
            ) : (
              items.map((c) => (
                <li key={c.id} className="flex items-center gap-3 p-3">
                  <CategoryBadgeIcon category={c} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.slug}
                      {!c.icon && !c.tone ? " · ikon otomatis" : ""}
                    </p>
                  </div>
                  <Badge variant={c.is_active ? "default" : "secondary"}>
                    {c.is_active ? "Aktif" : "Nonaktif"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Ubah kategori ${c.name}`}
                    onClick={() =>
                      setDraft({
                        id: c.id,
                        name: c.name,
                        isActive: c.is_active !== false,
                        icon: (c.icon as CategoryIconKey | null) ?? null,
                        tone: (c.tone as CategoryTone | null) ?? null,
                      })
                    }
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </Button>
                </li>
              ))
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
