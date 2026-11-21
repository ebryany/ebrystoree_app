import { Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Handshake, LayoutGrid, type LucideIcon } from "lucide-react";

import { listCatalogCategories } from "@/lib/catalog.functions";
import {
  CATEGORY_TONES,
  resolveCategoryStyle,
  type CategoryTone as Tone,
} from "@/lib/category-icons";
import { cn, isRenderableImageUrl } from "@/lib/utils";
import { SectionHeader } from "@/components/home/section-header";

const categoriesQuery = queryOptions({
  queryKey: ["categories", "service", "home"],
  queryFn: () => listCatalogCategories({ data: { kind: "service" } }),
});

const productCategoriesQuery = queryOptions({
  queryKey: ["categories", "product"],
  queryFn: () => listCatalogCategories({ data: { kind: "product" } }),
  staleTime: 5 * 60_000,
});

type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  tone?: string | null;
  image_url?: string | null;
};
type CategoryPayload = { items?: CategoryItem[]; error?: string | null };

const TONES = Object.fromEntries(
  Object.entries(CATEGORY_TONES).map(([k, v]) => [k, v.className]),
) as Record<Tone, string>;

function styleFor(c: CategoryItem): { icon: LucideIcon; tone: Tone } {
  const { icon, tone } = resolveCategoryStyle(c);
  return { icon, tone };
}

type Tile = {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: Tone;
  /** Gambar ikon unggahan admin; bila valid, menggantikan ikon bawaan. */
  image?: string | null;
  /** Penanda pintasan utama ("Semua produk" / "Semua jasa"). */
  featured?: boolean;
  to: "/layanan" | "/produk";
  kategori?: string;
};

const SPECIAL_WORDS: Record<string, string> = {
  ai: "AI",
  chatgpt: "ChatGPT",
  gpt: "GPT",
  it: "IT",
  ui: "UI",
  ux: "UX",
  "ui/ux": "UI/UX",
  seo: "SEO",
  ppt: "PPT",
  pdf: "PDF",
  cv: "CV",
};

const LOWERCASE_WORDS = new Set(["dan", "di", "ke", "dari", "untuk", "atau"]);

/** Rapikan kapitalisasi nama kategori tanpa merusak akronim (AI, ChatGPT) atau kata hubung. */
export function formatCategoryLabel(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (SPECIAL_WORDS[lower]) return SPECIAL_WORDS[lower];
      if (index > 0 && LOWERCASE_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/**
 * Grid kategori ala marketplace: ikon + label, dua baris yang bisa digeser
 * di mobile dan melebar di desktop. Kategori produk dan jasa digabung supaya
 * pengunjung tidak perlu tahu bedanya sebelum menjelajah.
 * Data kosong/gagal → tidak dirender; navigasi tetap lewat /produk dan /layanan.
 */
export function CategoryRail() {
  const { data } = useSuspenseQuery(categoriesQuery);
  const products = useQuery(productCategoriesQuery);
  // Normalisasi bentuk data: runtime { items, error }; mock test lama { service }.
  const payload = data as Partial<CategoryPayload> & { service?: Partial<CategoryPayload> };
  const services = (payload.service ?? payload).items ?? [];
  const productItems = (products.data as CategoryPayload | undefined)?.items ?? [];
  if (!services.length && !productItems.length) return null;

  const tiles: Tile[] = [
    {
      key: "all-products",
      label: "Semua Produk",
      icon: LayoutGrid,
      tone: "brand",
      featured: true,
      to: "/produk",
    },
    ...productItems.map((c) => ({
      key: `p-${c.id}`,
      label: c.name,
      ...styleFor(c),
      image: c.image_url,
      to: "/produk" as const,
      kategori: c.slug,
    })),
    {
      key: "all-services",
      label: "Semua Jasa",
      icon: Handshake,
      tone: "brand",
      featured: true,
      to: "/layanan",
    },
    ...services.map((c) => ({
      key: `s-${c.id}`,
      label: c.name,
      ...styleFor(c),
      image: c.image_url,
      to: "/layanan" as const,
      kategori: c.slug,
    })),
  ];

  return (
    <section aria-labelledby="kategori-heading">
      <SectionHeader
        id="kategori-heading"
        title="Jelajahi kategori"
        desc="Produk siap pakai dan jasa yang dikerjakan seller."
      />
      <div
        role="region"
        aria-label="Daftar kategori"
        tabIndex={0}
        className="-mx-4 overflow-x-auto px-4 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:-mx-6 sm:px-6 lg:mx-0 lg:overflow-visible lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* HP/tablet: 2 baris mengalir ke samping (kolom terpotong = bisa digeser).
            Desktop: grid rata 6 kolom tanpa geser. */}
        <ul
          role="list"
          className="grid w-max grid-flow-col grid-rows-2 auto-cols-[12rem] gap-2.5 lg:w-full lg:grid-flow-row lg:grid-cols-4 lg:grid-rows-none xl:grid-cols-6"
        >
          {tiles.map((t) => {
            const label = formatCategoryLabel(t.label);
            const isProduct = t.to === "/produk";
            return (
              <li key={t.key} className="min-w-0">
                <Link
                  to={t.to}
                  search={t.kategori ? ({ kategori: t.kategori } as never) : undefined}
                  className={cn(
                    "group flex min-h-[3.75rem] items-center gap-2.5 rounded-2xl border px-2.5 py-2 shadow-[var(--elev-1)] transition-[border-color,box-shadow,transform,background-color] duration-200 hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-card active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                    t.featured
                      ? "border-primary/20 bg-gradient-to-r from-surface/90 to-card hover:border-primary/45"
                      : "border-border/85 bg-card",
                  )}
                >
                  {isRenderableImageUrl(t.image) ? (
                    <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-[13px] border border-border/80 bg-gradient-to-b from-card to-surface p-1 shadow-[inset_0_1px_0_oklch(1_0_0/80%),0_1px_2px_oklch(0.22_0.03_205/6%)] transition-transform duration-200 group-hover:scale-[1.05] dark:shadow-[inset_0_1px_0_oklch(1_0_0/12%)] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                      <img
                        src={t.image}
                        alt=""
                        width={36}
                        height={36}
                        loading="lazy"
                        decoding="async"
                        className="size-full rounded-[9px] object-contain"
                      />
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-[13px] transition-transform duration-200 group-hover:scale-[1.05] motion-reduce:transition-none motion-reduce:group-hover:scale-100",
                        TONES[t.tone],
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute -right-2 -top-2 size-7 rounded-full bg-current opacity-[0.09]"
                      />
                      <t.icon
                        className="relative size-5"
                        strokeWidth={1.85}
                        aria-hidden="true"
                      />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold leading-snug text-foreground transition-colors duration-200 group-hover:text-accent motion-reduce:transition-none">
                      {label}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          isProduct ? "bg-primary/65" : "bg-accent/70",
                        )}
                      />
                      <span>{isProduct ? "Produk" : "Jasa"}</span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
