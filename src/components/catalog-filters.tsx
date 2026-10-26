import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";

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

export function CatalogFilters({ q, category, categories, placeholder, onChange }: Props) {
  const [term, setTerm] = useState(q);
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
    <section aria-label="Pencarian dan kategori">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          update({ q: term.trim() });
        }}
        className="flex items-center gap-2 rounded-lg border border-border bg-card p-1.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
      >
        <Search className="ml-2 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          name="q"
          maxLength={80}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-h-11 min-w-0 flex-1 border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {term ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => update({ q: "" })}
            aria-label="Hapus pencarian"
            className="min-h-11 min-w-11"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
        <Button type="submit" className="min-h-11">
          Cari
        </Button>
      </form>
      {/* Baris kategori hanya dirender bila ada kategori nyata. Sebelumnya chip
          "Semua" selalu tampil meski daftar kategori kosong, sehingga panel
          filter terlihat seperti kontrol yang belum jadi. Tombol reset tetap
          muncul saat ada filter aktif, karena itu berguna. */}
      {categories.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter kategori">
          <CategoryChip active={!category} onClick={() => update({ q: term.trim(), category: "" })}>
            Semua
          </CategoryChip>
          {categories.map((item) => (
            <CategoryChip
              key={item.id}
              active={category === item.slug}
              onClick={() =>
                update({ q: term.trim(), category: category === item.slug ? "" : item.slug })
              }
            >
              {item.name}
            </CategoryChip>
          ))}
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
        "min-h-11 min-w-0 max-w-full whitespace-normal rounded-lg px-4 py-2 text-sm",
        !active && "bg-card text-foreground",
      )}
    >
      <span className="min-w-0 break-words">{children}</span>
    </Button>
  );
}
