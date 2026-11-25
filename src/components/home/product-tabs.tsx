import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";

import {
  PRODUCT_GRID,
  ProductTile,
  SeeAllLink,
  type ProductTileItem,
} from "@/components/ebry/product-shelf";
import { formatCategoryLabel } from "@/components/home/category-rail";
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
 * Koleksi produk bertab satu baris ala feed kategori marketplace (Tokopedia).
 * Mengikuti Modern Web Guidance (tabs):
 * - Selalu satu baris horizontal dengan fade tepi (scroll-driven + fallback IntersectionObserver).
 * - Indikator tab aktif memakai garis bawah border 3px pada pseudo-element (bukan warna saja)
 *   dan ukuran teks tetap konstan agar tab tidak melompat saat berpindah.
 * - Tanpa aria-controls redundan; tab terpilih digulir masuk viewport tablist otomatis.
 */
export function ProductTabs({ tabs }: { tabs: ProductTab[] }) {
  const [active, setActive] = useState(0);
  const tablistRef = useRef<HTMLDivElement>(null);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const base = useId();

  useEffect(() => {
    const scroller = tablistRef.current;
    if (!scroller || typeof CSS === "undefined" || CSS.supports("animation-timeline", "scroll()")) {
      return;
    }
    const first = scroller.firstElementChild;
    const last = scroller.lastElementChild;
    if (!first || !last) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === first) {
            scroller.classList.toggle("more-start", entry.intersectionRatio < 1);
          }
          if (entry.target === last) {
            scroller.classList.toggle("more-end", entry.intersectionRatio < 1);
          }
        }
      },
      { root: scroller, threshold: 1, rootMargin: "1px" },
    );
    observer.observe(first);
    observer.observe(last);
    return () => observer.disconnect();
  }, [tabs.length]);

  if (!tabs.length) return null;
  const currentIndex = Math.min(active, tabs.length - 1);
  const current = tabs[currentIndex];

  function selectTab(next: number, moveFocus: boolean) {
    setActive(next);
    const el = refs.current[next];
    if (moveFocus) el?.focus();
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      selectTab((currentIndex + 1) % tabs.length, true);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectTab((currentIndex - 1 + tabs.length) % tabs.length, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectTab(0, true);
    } else if (event.key === "End") {
      event.preventDefault();
      selectTab(tabs.length - 1, true);
    }
  }

  return (
    <section aria-labelledby={`${base}-heading`}>
      <SectionHeader
        id={`${base}-heading`}
        title="Jelajahi produk digital"
        desc="Siap unduh setelah pembayaran diverifikasi."
        action={<SeeAllLink to="/produk" kategori={current.kategori} />}
      />

      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Koleksi produk"
        onKeyDown={onKey}
        className="ebry-tab-scroller -mx-3 mb-5 flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-border px-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0"
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
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(i, false)}
              className={cn(
                "relative inline-flex min-h-11 shrink-0 snap-start items-center gap-1.5 whitespace-nowrap px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none",
                selected
                  ? "text-primary after:absolute after:inset-x-2 after:bottom-0 after:border-b-[3px] after:border-primary after:content-['']"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span>{formatCategoryLabel(tab.label)}</span>
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[11px] tabular-nums",
                  selected
                    ? "bg-surface-selected text-primary"
                    : "bg-surface text-muted-foreground",
                )}
              >
                {Math.min(tab.items.length, MAX_ITEMS)}
              </span>
            </button>
          );
        })}
      </div>

      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${current.key}`}>
        <ul role="list" className={PRODUCT_GRID}>
          {current.items.slice(0, MAX_ITEMS).map((item, i) => (
            <li key={item.id} className="min-w-0">
              <ProductTile item={item} rank={current.ranked ? i + 1 : undefined} />
            </li>
          ))}
        </ul>

        <div className="mt-6 flex justify-center">
          <Link
            to="/produk"
            search={current.kategori ? ({ kategori: current.kategori } as never) : undefined}
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-card px-6 text-sm font-semibold text-foreground transition-colors hover:border-primary/45 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Lihat semua produk
          </Link>
        </div>
      </div>
    </section>
  );
}
