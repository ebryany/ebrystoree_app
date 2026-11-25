import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";

import { formatCategoryLabel } from "@/components/home/category-rail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CatalogCategory = { id: string; name: string; slug: string };

type Props = {
  q: string;
  category: string;
  categories: CatalogCategory[];
  placeholder: string;
  onChange: (next: { q?: string; category?: string }) => void;
};

/**
 * Filter pencarian & kategori katalog marketplace:
 * - Di mobile, chip kategori mengalir 1 baris horizontal (swipeable) agar produk/jasa
 *   langsung terlihat tanpa tertutup tumpukan chip.
 * - Di desktop, chip tampil rapi dalam wrap hingga 8 kategori utama dengan tombol perluas.
 * - Nama kategori dirapikan lewat formatCategoryLabel (menjaga akronim AI, ChatGPT, dll.).
 */
export function CatalogFilters({ q, category, categories, placeholder, onChange }: Props) {
  const [term, setTerm] = useState(q);
  const [expanded, setExpanded] = useState(false);
  const latest = useRef(q);
  const callback = useRef(onChange);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);
  useEffect(() => {
    latest.current = q;
    setTerm(q);
  }, [q]);
  useEffect(() => {
    if (term === latest.current) return;
    timer.current = setTimeout(() => callback.current({ q: term.trim() }), 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [term]);

  function update(next: { q?: string; category?: string }) {
    if (timer.current) clearTimeout(timer.current);
    if (next.q !== undefined) {
      latest.current = next.q;
      setTerm(next.q);
    }
    onChange(next);
  }

  return (
    <section aria-label="Pencarian dan kategori" className="min-w-0">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          update({ q: term.trim() });
        }}
        className="flex min-w-0 items-center gap-1.5 rounded-xl border border-border bg-background p-1 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/30 sm:gap-2 sm:p-1.5"
      >
        <Search className="ml-2 size-4 shrink-0 text-muted-foreground sm:size-5" aria-hidden="true" />
        <Input
          type="search"
          name="q"
          maxLength={80}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-h-11 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0 sm:text-base [&::-webkit-search-cancel-button]:appearance-none"
        />
        {term ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => update({ q: "" })}
            aria-label="Hapus pencarian"
            className="min-h-11 min-w-11 shrink-0"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
        <Button type="submit" className="min-h-11 shrink-0 rounded-lg px-3.5 sm:px-5">
          Cari
        </Button>
      </form>

      {categories.length > 0 ? (
        <div
          className="-mx-3.5 mt-3.5 flex flex-nowrap gap-2 overflow-x-auto overscroll-x-contain px-3.5 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Filter kategori"
        >
          <CategoryChip active={!category} onClick={() => update({ q: term.trim(), category: "" })}>
            Semua
          </CategoryChip>
          {(expanded || isCollapsedActiveHidden(categories, category)
            ? categories
            : categories.slice(0, 8)
          ).map((item) => (
            <CategoryChip
              key={item.id}
              active={category === item.slug}
              onClick={() =>
                update({ q: term.trim(), category: category === item.slug ? "" : item.slug })
              }
            >
              {formatCategoryLabel(item.name)}
            </CategoryChip>
          ))}
          {categories.length > 8 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className="min-h-11 shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-primary underline-offset-4 hover:underline"
            >
              {expanded
                ? "Sembunyikan kategori"
                : `Tampilkan ${categories.length - 8} kategori lagi`}
            </Button>
          ) : null}
        </div>
      ) : null}

      {q || category ? (
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => update({ q: "", category: "" })}
          >
            Reset filter
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** Kategori aktif berada di luar 8 pertama: daftar harus diperluas agar chip aktif terlihat. */
function isCollapsedActiveHidden(categories: CatalogCategory[], category: string): boolean {
  if (!category) return false;
  const index = categories.findIndex((item) => item.slug === category);
  return index >= 8;
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-11 shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm",
        !active && "bg-card text-foreground hover:border-primary/40",
      )}
    >
      <span>{children}</span>
    </Button>
  );
}
