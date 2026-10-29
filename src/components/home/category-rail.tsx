import { Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  BarChart3,
  BookMarked,
  Bot,
  ClipboardCheck,
  Code2,
  Crown,
  FilePen,
  FileSearch,
  FileSpreadsheet,
  FlaskConical,
  GraduationCap,
  Handshake,
  LayoutGrid,
  ListOrdered,
  type LucideIcon,
  Palette,
  Presentation,
  Quote,
  RotateCcw,
  ScrollText,
  Tag,
} from "lucide-react";

import { listCatalogCategories } from "@/lib/catalog.functions";
import { cn } from "@/lib/utils";
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

type CategoryItem = { id: string; name: string; slug: string };
type CategoryPayload = { items?: CategoryItem[]; error?: string | null };

/** Warna latar + ikon per kelompok, semuanya dari token tema. */
const TONES = {
  teal: "bg-accent/12 text-accent",
  green: "bg-success/15 text-success",
  blue: "bg-info/15 text-info",
  amber: "bg-warning/20 text-warning-foreground",
  red: "bg-chart-5/12 text-chart-5",
  brand: "bg-primary text-primary-foreground",
} as const;
type Tone = keyof typeof TONES;

/** Ikon + warna dari kata kunci nama kategori; urutan = prioritas. */
const ICON_RULES: Array<[RegExp, LucideIcon, Tone]> = [
  [/chat\s?gpt|gpt|ai\b|\bai |gemini|claude|copilot/i, Bot, "green"],
  [/akun|premium|langganan|netflix|spotify|canva pro/i, Crown, "amber"],
  [/template|desain|capcut|canva/i, Palette, "red"],
  [/presentasi|slide|ppt/i, Presentation, "amber"],
  [/praktikum|lab/i, FlaskConical, "blue"],
  [/laporan/i, FileSpreadsheet, "blue"],
  [/makalah|artikel|esai/i, ScrollText, "teal"],
  [/tugas|harian/i, ClipboardCheck, "teal"],
  [/proposal/i, FilePen, "red"],
  [/revisi|ulang|perbaik/i, RotateCcw, "red"],
  [/analisis|data|statistik/i, BarChart3, "blue"],
  [/pemrograman|coding|web|aplikasi|program/i, Code2, "green"],
  [/review|cek|periksa/i, FileSearch, "teal"],
  [/format/i, ListOrdered, "amber"],
  [/sitasi|referensi/i, Quote, "blue"],
  [/sidang|wisuda/i, GraduationCap, "brand"],
  [/skripsi|tesis|jurnal|pendampingan/i, BookMarked, "green"],
];

function styleFor(name: string): { icon: LucideIcon; tone: Tone } {
  const hit = ICON_RULES.find(([re]) => re.test(name));
  return hit ? { icon: hit[1], tone: hit[2] } : { icon: Tag, tone: "teal" };
}

type Tile = {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: Tone;
  to: "/layanan" | "/produk";
  kategori?: string;
};

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
    { key: "all-products", label: "Semua produk", icon: LayoutGrid, tone: "brand", to: "/produk" },
    ...productItems.map((c) => ({
      key: `p-${c.id}`,
      label: c.name,
      ...styleFor(c.name),
      to: "/produk" as const,
      kategori: c.slug,
    })),
    { key: "all-services", label: "Semua jasa", icon: Handshake, tone: "brand", to: "/layanan" },
    ...services.map((c) => ({
      key: `s-${c.id}`,
      label: c.name,
      ...styleFor(c.name),
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
        className="-mx-4 overflow-x-auto px-4 pb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:-mx-6 sm:px-6 lg:mx-0 lg:overflow-visible lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* HP/tablet: 2 baris mengalir ke samping (kolom terpotong = bisa digeser).
            Desktop: grid rata 6 kolom tanpa geser. */}
        <ul className="grid w-max grid-flow-col grid-rows-2 auto-cols-[11.5rem] gap-2.5 lg:w-full lg:grid-flow-row lg:grid-cols-4 lg:grid-rows-none xl:grid-cols-6">
          {tiles.map((t) => (
            <li key={t.key} className="min-w-0">
              <Link
                to={t.to}
                search={t.kategori ? ({ kategori: t.kategori } as never) : undefined}
                className="group flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card p-2.5 transition-[border-color,box-shadow] duration-200 hover:border-accent/40 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-lg",
                    TONES[t.tone],
                  )}
                >
                  <t.icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium capitalize text-foreground group-hover:text-accent">
                    {t.label.toLowerCase()}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {t.to === "/produk" ? "Produk" : "Jasa"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
