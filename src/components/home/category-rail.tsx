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
    <section
      aria-labelledby="kategori-heading"
      className="rounded-2xl border border-border bg-card py-4"
    >
      <h2
        id="kategori-heading"
        className="flex items-center gap-2 px-4 text-base font-bold text-foreground sm:px-5 sm:text-lg"
      >
        <span className="h-4 w-1 rounded-full bg-accent" aria-hidden="true" />
        Kategori
      </h2>
      <div
        role="region"
        aria-label="Daftar kategori"
        tabIndex={0}
        className="mt-3 overflow-x-auto px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* Selalu dua baris penuh mengalir ke samping, jadi tidak ada baris
            yang setengah kosong. HP: kolom terpotong = tanda bisa digeser.
            Desktop: kolom melebar rata mengisi lebar kartu (min 104px);
            kategori sangat banyak tetap bisa digeser. */}
        <ul className="grid w-max snap-x grid-flow-col grid-rows-2 auto-cols-[76px] gap-x-1 gap-y-2 sm:auto-cols-[92px] lg:w-full lg:min-w-max lg:auto-cols-[minmax(104px,1fr)] lg:gap-y-3">
          {tiles.map((t) => (
            <li key={t.key} className="snap-start">
              <Link
                to={t.to}
                search={t.kategori ? ({ kategori: t.kategori } as never) : undefined}
                className="group flex min-h-11 flex-col items-center gap-1.5 rounded-xl p-1.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "grid size-12 place-items-center rounded-2xl transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 sm:size-14",
                    TONES[t.tone],
                  )}
                >
                  <t.icon className="size-6 sm:size-7" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="line-clamp-2 text-[11px] font-medium capitalize leading-tight text-foreground group-hover:text-accent sm:text-xs">
                  {t.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
