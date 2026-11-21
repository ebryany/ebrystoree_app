import {
  BarChart3,
  BookMarked,
  BookOpen,
  Bot,
  Briefcase,
  Camera,
  ClipboardCheck,
  Code2,
  Crown,
  FilePen,
  FileSearch,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Gamepad2,
  Globe,
  GraduationCap,
  Handshake,
  Headphones,
  Languages,
  LayoutGrid,
  ListOrdered,
  type LucideIcon,
  Megaphone,
  Music,
  Palette,
  PenTool,
  Presentation,
  Quote,
  RotateCcw,
  ScrollText,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Tag,
  Video,
} from "lucide-react";

/** Ikon yang bisa dipilih admin untuk kategori. Kunci disimpan di `categories.icon`. */
export const CATEGORY_ICONS = {
  tag: { icon: Tag, label: "Label" },
  bot: { icon: Bot, label: "AI" },
  crown: { icon: Crown, label: "Premium" },
  sparkles: { icon: Sparkles, label: "Spesial" },
  palette: { icon: Palette, label: "Desain" },
  "pen-tool": { icon: PenTool, label: "Ilustrasi" },
  presentation: { icon: Presentation, label: "Presentasi" },
  "flask-conical": { icon: FlaskConical, label: "Praktikum" },
  "file-spreadsheet": { icon: FileSpreadsheet, label: "Laporan" },
  "scroll-text": { icon: ScrollText, label: "Makalah" },
  "file-text": { icon: FileText, label: "Dokumen" },
  "clipboard-check": { icon: ClipboardCheck, label: "Tugas" },
  "file-pen": { icon: FilePen, label: "Proposal" },
  "rotate-ccw": { icon: RotateCcw, label: "Revisi" },
  "bar-chart": { icon: BarChart3, label: "Data" },
  code: { icon: Code2, label: "Kode" },
  "file-search": { icon: FileSearch, label: "Review" },
  "list-ordered": { icon: ListOrdered, label: "Format" },
  quote: { icon: Quote, label: "Sitasi" },
  "graduation-cap": { icon: GraduationCap, label: "Sidang" },
  "book-marked": { icon: BookMarked, label: "Skripsi" },
  "book-open": { icon: BookOpen, label: "Buku" },
  languages: { icon: Languages, label: "Bahasa" },
  globe: { icon: Globe, label: "Web" },
  smartphone: { icon: Smartphone, label: "Aplikasi" },
  video: { icon: Video, label: "Video" },
  camera: { icon: Camera, label: "Foto" },
  music: { icon: Music, label: "Musik" },
  headphones: { icon: Headphones, label: "Audio" },
  gamepad: { icon: Gamepad2, label: "Game" },
  megaphone: { icon: Megaphone, label: "Pemasaran" },
  briefcase: { icon: Briefcase, label: "Bisnis" },
  "shopping-bag": { icon: ShoppingBag, label: "Belanja" },
  handshake: { icon: Handshake, label: "Jasa" },
  "layout-grid": { icon: LayoutGrid, label: "Semua" },
} satisfies Record<string, { icon: LucideIcon; label: string }>;

export type CategoryIconKey = keyof typeof CATEGORY_ICONS;

/** Warna latar + ikon, semuanya dari token tema. Kunci disimpan di `categories.tone`. */
export const CATEGORY_TONES = {
  teal: {
    className:
      "border border-accent/20 bg-gradient-to-br from-accent/18 via-accent/10 to-accent/5 text-accent shadow-[inset_0_1px_0_oklch(1_0_0/65%),0_1px_2px_oklch(0.22_0.03_205/5%)] dark:shadow-[inset_0_1px_0_oklch(1_0_0/10%)]",
    label: "Hijau toska",
  },
  green: {
    className:
      "border border-success/25 bg-gradient-to-br from-success/20 via-success/12 to-success/5 text-success shadow-[inset_0_1px_0_oklch(1_0_0/65%),0_1px_2px_oklch(0.22_0.03_205/5%)] dark:shadow-[inset_0_1px_0_oklch(1_0_0/10%)]",
    label: "Hijau",
  },
  blue: {
    className:
      "border border-info/25 bg-gradient-to-br from-info/20 via-info/12 to-info/5 text-info shadow-[inset_0_1px_0_oklch(1_0_0/65%),0_1px_2px_oklch(0.22_0.03_205/5%)] dark:shadow-[inset_0_1px_0_oklch(1_0_0/10%)]",
    label: "Biru",
  },
  amber: {
    className:
      "border border-warning/35 bg-gradient-to-br from-warning/28 via-warning/16 to-warning/8 text-warning-foreground shadow-[inset_0_1px_0_oklch(1_0_0/65%),0_1px_2px_oklch(0.22_0.03_205/5%)] dark:shadow-[inset_0_1px_0_oklch(1_0_0/10%)]",
    label: "Kuning",
  },
  red: {
    className:
      "border border-chart-5/22 bg-gradient-to-br from-chart-5/18 via-chart-5/10 to-chart-5/5 text-chart-5 shadow-[inset_0_1px_0_oklch(1_0_0/65%),0_1px_2px_oklch(0.22_0.03_205/5%)] dark:shadow-[inset_0_1px_0_oklch(1_0_0/10%)]",
    label: "Merah",
  },
  brand: {
    className:
      "border border-primary/25 bg-hero-gradient text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/20%),0_2px_6px_oklch(0.22_0.03_205/16%)]",
    label: "Gelap",
  },
} as const;

export type CategoryTone = keyof typeof CATEGORY_TONES;

export const CATEGORY_TONE_KEYS = Object.keys(CATEGORY_TONES) as CategoryTone[];
export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS) as CategoryIconKey[];

/** Tebakan dari nama kategori, dipakai bila admin belum memilih ikon/warna. */
const ICON_RULES: Array<[RegExp, CategoryIconKey, CategoryTone]> = [
  [/chat\s?gpt|gpt|ai\b|\bai |gemini|claude|copilot/i, "bot", "green"],
  [/akun|premium|langganan|netflix|spotify|canva pro/i, "crown", "amber"],
  [/template|desain|capcut|canva/i, "palette", "red"],
  [/presentasi|slide|ppt/i, "presentation", "amber"],
  [/praktikum|lab/i, "flask-conical", "blue"],
  [/laporan/i, "file-spreadsheet", "blue"],
  [/makalah|artikel|esai/i, "scroll-text", "teal"],
  [/tugas|harian/i, "clipboard-check", "teal"],
  [/proposal/i, "file-pen", "red"],
  [/revisi|ulang|perbaik/i, "rotate-ccw", "red"],
  [/analisis|data|statistik/i, "bar-chart", "blue"],
  [/pemrograman|coding|web|aplikasi|program/i, "code", "green"],
  [/review|cek|periksa/i, "file-search", "teal"],
  [/format/i, "list-ordered", "amber"],
  [/sitasi|referensi/i, "quote", "blue"],
  [/sidang|wisuda/i, "graduation-cap", "brand"],
  [/skripsi|tesis|jurnal|pendampingan/i, "book-marked", "green"],
];

export function isCategoryIconKey(value: unknown): value is CategoryIconKey {
  return typeof value === "string" && Object.hasOwn(CATEGORY_ICONS, value);
}

export function isCategoryTone(value: unknown): value is CategoryTone {
  return typeof value === "string" && Object.hasOwn(CATEGORY_TONES, value);
}

/** Pilihan admin diutamakan; yang kosong diisi tebakan dari nama. */
export function resolveCategoryStyle(category: {
  name: string;
  icon?: string | null;
  tone?: string | null;
}): { icon: LucideIcon; iconKey: CategoryIconKey; tone: CategoryTone } {
  const hit = ICON_RULES.find(([re]) => re.test(category.name));
  const iconKey = isCategoryIconKey(category.icon) ? category.icon : (hit?.[1] ?? "tag");
  const tone = isCategoryTone(category.tone) ? category.tone : (hit?.[2] ?? "teal");
  return { icon: CATEGORY_ICONS[iconKey].icon, iconKey, tone };
}
