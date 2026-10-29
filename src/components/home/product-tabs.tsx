import { useId, useRef, useState, type KeyboardEvent } from "react";

import {
  PRODUCT_GRID,
  ProductTile,
  SeeAllLink,
  type ProductTileItem,
} from "@/components/ebry/product-shelf";
import { SectionHeader } from "@/components/home/section-header";
import { cn } from "@/lib/utils";

export type ProductTab = {
  key: string;
  label: string;
  items: ProductTileItem[];
  ranked?: boolean;
  /** Slug kategori untuk tautan "Lihat semua". */
  kategori?: string;
};

const MAX_ITEMS = 12;

/**
 * Koleksi produk bertab: satu section menggantikan banyak rak bertumpuk.
 * Tab kosong disaring di pemanggil, jadi setiap tab selalu berisi produk.
 */
export function ProductTabs({ tabs }: { tabs: ProductTab[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const base = useId();
  if (!tabs.length) return null;
  const current = tabs[Math.min(active, tabs.length - 1)];

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const dir = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    event.preventDefault();
    const next = (active + dir + tabs.length) % tabs.length;
    setActive(next);
    refs.current[next]?.focus();
  }

  return (
    <section aria-labelledby={`${base}-heading`}>
      <SectionHeader
        id={`${base}-heading`}
        title="Produk digital"
        desc="Siap dipakai setelah pembayaran terverifikasi."
        action={<SeeAllLink to="/produk" kategori={current.kategori} />}
      />
      <div
        role="tablist"
        aria-label="Koleksi produk"
        onKeyDown={onKey}
        className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab, i) => {
          const selected = tab.key === current.key;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              id={`${base}-tab-${tab.key}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-accent/50 hover:text-accent",
              )}
            >
              {tab.label.toLowerCase()}
              <span
                className={cn(
                  "text-xs tabular-nums",
                  selected ? "text-primary-foreground/70" : "text-muted-foreground",
                )}
              >
                {Math.min(tab.items.length, MAX_ITEMS)}
              </span>
            </button>
          );
        })}
      </div>
      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${current.key}`}>
        <ul className={PRODUCT_GRID}>
          {current.items.slice(0, MAX_ITEMS).map((item, i) => (
            <li key={item.id} className="min-w-0">
              <ProductTile item={item} rank={current.ranked ? i + 1 : undefined} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
