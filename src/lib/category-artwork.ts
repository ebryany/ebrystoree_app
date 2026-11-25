import akunAiPremiumIcon from "@/assets/category-icons/akun-ai-premium.webp";
import allProductsIcon from "@/assets/category-icons/all-products.webp";
import allServicesIcon from "@/assets/category-icons/all-services.webp";
import defaultCategoryIcon from "@/assets/category-icons/default-category.webp";
import formattingIcon from "@/assets/category-icons/formatting.webp";
import jasaDigitalEbryIcon from "@/assets/category-icons/jasa-digital-ebry.webp";
import jasaDigitalIcon from "@/assets/category-icons/jasa-digital.webp";
import laporanPraktikumIcon from "@/assets/category-icons/laporan-praktikum.webp";
import makalahIcon from "@/assets/category-icons/makalah.webp";
import pemrogramanAkademikIcon from "@/assets/category-icons/pemrograman-akademik.webp";
import presentasiIcon from "@/assets/category-icons/presentasi.webp";
import proposalIcon from "@/assets/category-icons/proposal.webp";
import reviewTulisanIcon from "@/assets/category-icons/review-tulisan.webp";
import sitasiReferensiIcon from "@/assets/category-icons/sitasi-dan-referensi.webp";
import templateIcon from "@/assets/category-icons/template.webp";
import tugasHarianIcon from "@/assets/category-icons/tugas-harian.webp";

export const SHORTCUT_ARTWORK = {
  allProducts: allProductsIcon,
  allServices: allServicesIcon,
} as const;

const BY_SLUG: Record<string, string> = {
  "akun-ai-premium": akunAiPremiumIcon,
  template: templateIcon,
  "jasa-digital": jasaDigitalIcon,
  "jasa-digital-ebry": jasaDigitalEbryIcon,
  "tugas-harian": tugasHarianIcon,
  makalah: makalahIcon,
  presentasi: presentasiIcon,
  proposal: proposalIcon,
  "laporan-praktikum": laporanPraktikumIcon,
  "pemrograman-akademik": pemrogramanAkademikIcon,
  "review-tulisan": reviewTulisanIcon,
  formatting: formattingIcon,
  "sitasi-dan-referensi": sitasiReferensiIcon,
};

const KEYWORD_RULES: Array<[RegExp, string]> = [
  [/ebry/i, jasaDigitalEbryIcon],
  [/akun|premium|vip|langganan|ai\b|chatgpt|gpt/i, akunAiPremiumIcon],
  [/template|desain|canva/i, templateIcon],
  [/jasa\s+digital|web|aplikasi/i, jasaDigitalIcon],
  [/tugas|harian/i, tugasHarianIcon],
  [/makalah|esai|artikel/i, makalahIcon],
  [/presentasi|slide|ppt/i, presentasiIcon],
  [/proposal|skripsi|tesis/i, proposalIcon],
  [/praktikum|lab/i, laporanPraktikumIcon],
  [/pemrograman|coding|program|kode/i, pemrogramanAkademikIcon],
  [/review|proofread|cek|periksa/i, reviewTulisanIcon],
  [/format/i, formattingIcon],
  [/sitasi|referensi|daftar\s+pustaka/i, sitasiReferensiIcon],
];

/** Pilih ilustrasi 3D bawaan Ebrystore berdasarkan slug atau kata kunci nama kategori. */
export function resolveCategoryArtwork(category: { slug?: string | null; name: string }): string {
  const slug = category.slug?.trim().toLowerCase() ?? "";
  if (slug && BY_SLUG[slug]) return BY_SLUG[slug];
  const hit = KEYWORD_RULES.find(([re]) => re.test(category.name));
  return hit?.[1] ?? defaultCategoryIcon;
}
