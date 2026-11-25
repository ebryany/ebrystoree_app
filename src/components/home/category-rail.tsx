import { Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";

import { listCatalogCategories } from "@/lib/catalog.functions";
import { resolveCategoryArtwork, SHORTCUT_ARTWORK } from "@/lib/category-artwork";
import { cn, isRenderableImageUrl, optimizedMediaUrl } from "@/lib/utils";

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

type Tile = {
  key: string;
  label: string;
  /** URL gambar unggahan admin bila valid; bila kosong memakai ilustrasi 3D bawaan. */
  artworkSrc: string;
  isUploaded?: boolean;
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
 * Panel kategori pilihan bergaya marketplace besar (Tokopedia / Shopee / Itemku):
 * - Memakai set ilustrasi 3D seragam (palet ink-teal & warm amber) dalam bingkai bersih
 *   tanpa kotak pastel 5 warna atau ikon garis tipis generik.
 * - Pintasan "Semua Produk" & "Semua Jasa" diletakkan rapi berdampingan di awal barisan.
 * - 2 baris geser horizontal di mobile, melebar ke grid padat 6-8 kolom di desktop.
 */
export function CategoryRail() {
  const { data } = useSuspenseQuery(categoriesQuery);
  const products = useQuery(productCategoriesQuery);
  const payload = data as Partial<CategoryPayload> & { service?: Partial<CategoryPayload> };
  const services = (payload.service ?? payload).items ?? [];
  const productItems = (products.data as CategoryPayload | undefined)?.items ?? [];
  if (!services.length && !productItems.length) return null;

  const mapCategoryTile = (c: CategoryItem, to: "/produk" | "/layanan", prefix: string): Tile => {
    const uploaded = isRenderableImageUrl(c.image_url) ? c.image_url : null;
    return {
      key: `${prefix}-${c.id}`,
      label: c.name,
      artworkSrc: uploaded ? optimizedMediaUrl(uploaded, 96) : resolveCategoryArtwork(c),
      isUploaded: Boolean(uploaded),
      to,
      kategori: c.slug,
    };
  };

  const tiles: Tile[] = [
    {
      key: "all-products",
      label: "Semua Produk",
      artworkSrc: SHORTCUT_ARTWORK.allProducts,
      featured: true,
      to: "/produk",
    },
    {
      key: "all-services",
      label: "Semua Jasa",
      artworkSrc: SHORTCUT_ARTWORK.allServices,
      featured: true,
      to: "/layanan",
    },
    ...productItems.map((c) => mapCategoryTile(c, "/produk", "p")),
    ...services.map((c) => mapCategoryTile(c, "/layanan", "s")),
  ];

  return (
    <section
      aria-labelledby="kategori-heading"
      className="rounded-2xl border border-border bg-card p-3.5 shadow-[var(--elev-1)] sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="kategori-heading"
          className="font-display text-base font-bold tracking-tight text-foreground sm:text-lg"
        >
          Kategori pilihan
        </h2>
        <div className="flex items-center gap-3 text-xs font-semibold">
          <Link
            to="/produk"
            className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Semua produk
          </Link>
          <span aria-hidden="true" className="text-border">
            |
          </span>
          <Link
            to="/layanan"
            className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Semua jasa
          </Link>
        </div>
      </div>

      <div
        role="region"
        aria-label="Daftar kategori"
        tabIndex={0}
        className="-mx-3.5 overflow-x-auto overscroll-x-contain px-3.5 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:-mx-5 sm:px-5 lg:mx-0 lg:overflow-visible lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <ul
          role="list"
          className="grid w-max grid-flow-col grid-rows-2 auto-cols-[5.75rem] gap-2 sm:auto-cols-[6.5rem] lg:w-full lg:grid-flow-row lg:grid-cols-6 lg:grid-rows-none xl:grid-cols-8"
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
                    "group relative flex min-h-[6.25rem] flex-col items-center justify-start gap-2 rounded-xl border p-2 text-center transition-[border-color,background-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface/80 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                    t.featured
                      ? "border-primary/20 bg-surface/65"
                      : "border-transparent bg-surface/35",
                  )}
                >
                  <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-[13px] border border-border/70 bg-card p-1 shadow-[var(--elev-1)] transition-transform duration-150 group-hover:scale-105 dark:bg-surface-raised motion-reduce:transition-none motion-reduce:group-hover:scale-100 sm:size-13">
                    <img
                      src={t.artworkSrc}
                      alt=""
                      width={48}
                      height={48}
                      loading="lazy"
                      decoding="async"
                      className={cn(
                        "size-full object-contain",
                        t.isUploaded ? "rounded-[9px]" : "",
                      )}
                    />
                  </span>
                  <span className="line-clamp-2 w-full text-[11px] font-semibold leading-tight text-foreground group-hover:text-primary sm:text-xs">
                    {label}
                  </span>
                  <span className="sr-only">{isProduct ? "(Produk)" : "(Jasa)"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
