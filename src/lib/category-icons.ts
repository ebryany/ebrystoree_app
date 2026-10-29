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
  teal: { className: "bg-accent/12 text-accent", label: "Hijau toska" },
  green: { className: "bg-success/15 text-success", label: "Hijau" },
  blue: { className: "bg-info/15 text-info", label: "Biru" },
  amber: { className: "bg-warning/20 text-warning-foreground", label: "Kuning" },
  red: { className: "bg-chart-5/12 text-chart-5", label: "Merah" },
  brand: { className: "bg-primary text-primary-foreground", label: "Gelap" },
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
