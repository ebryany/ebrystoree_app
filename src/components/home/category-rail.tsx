import { Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  BookOpen,
  ClipboardList,
  Code2,
  FileSearch,
  FileText,
  FlaskConical,
  GraduationCap,
  KeyRound,
  LayoutTemplate,
  LineChart,
  ListOrdered,
  type LucideIcon,
  MonitorPlay,
  Package,
  PenLine,
  Quote,
  RotateCcw,
  Tag,
  Wrench,
} from "lucide-react";

import { listCatalogCategories } from "@/lib/catalog.functions";

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

/** Ikon dari kata kunci nama kategori; kategori baru otomatis dapat ikon umum. */
const ICON_RULES: Array<[RegExp, LucideIcon]> = [
  [/tugas|harian/i, ClipboardList],
  [/makalah|laporan|artikel/i, FileText],
  [/presentasi|slide|ppt/i, MonitorPlay],
  [/proposal|revisi/i, PenLine],
  [/praktikum|lab/i, FlaskConical],
  [/analisis|data|statistik/i, LineChart],
  [/pemrograman|coding|web|aplikasi/i, Code2],
  [/review|cek|periksa/i, FileSearch],
  [/format/i, ListOrdered],
  [/sitasi|referensi/i, Quote],
  [/sidang|wisuda/i, GraduationCap],
  [/skripsi|tesis|jurnal/i, BookOpen],
  [/template|desain|capcut/i, LayoutTemplate],
  [/akun|premium|langganan/i, KeyRound],
  [/ulang|perbaik/i, RotateCcw],
];

function iconFor(name: string): LucideIcon {
  return ICON_RULES.find(([re]) => re.test(name))?.[1] ?? Tag;
}

type Tile = {
  key: string;
  label: string;
  icon: LucideIcon;
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
    { key: "all-products", label: "Semua produk", icon: Package, to: "/produk" },
    ...productItems.map((c) => ({
      key: `p-${c.id}`,
      label: c.name,
      icon: iconFor(c.name),
      to: "/produk" as const,
      kategori: c.slug,
    })),
    { key: "all-services", label: "Semua jasa", icon: Wrench, to: "/layanan" },
    ...services.map((c) => ({
      key: `s-${c.id}`,
      label: c.name,
      icon: iconFor(c.name),
      to: "/layanan" as const,
      kategori: c.slug,
    })),
  ];

  return (
    <section aria-labelledby="kategori-heading" className="rounded-2xl border border-border bg-card py-4">
      <h2 id="kategori-heading" className="px-4 text-base font-bold text-foreground sm:px-5">
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
                <span className="grid size-12 place-items-center rounded-xl border border-border bg-surface text-accent transition-colors group-hover:border-accent/50 group-hover:bg-accent/[0.06] sm:size-14">
                  <t.icon className="size-5 sm:size-6" aria-hidden="true" />
                </span>
                <span className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground sm:text-xs">
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
