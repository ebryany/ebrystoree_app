import { CATEGORY_EXTRA_FIELDS } from "@/lib/academic-form-config";

/**
 * Dua alur checkout layanan:
 * - "academic": kategori pendampingan akademik (form tugas, integritas akademik).
 * - "general": semua jasa lain (website, desain, IT, konten, dll.) dengan brief proyek.
 * Kategori di luar daftar akademik otomatis memakai alur umum.
 */
export type ServiceFlow = "academic" | "general";

export const ACADEMIC_CATEGORY_SLUGS: readonly string[] = Object.keys(CATEGORY_EXTRA_FIELDS);

export function isAcademicCategorySlug(slug: string | null | undefined): boolean {
  return !!slug && ACADEMIC_CATEGORY_SLUGS.includes(slug);
}

/** Layanan akademik hanya bila kategori akademiknya benar-benar kategori akademik. */
export function serviceFlowOf(service: {
  categories?: { slug?: string | null } | null;
}): ServiceFlow {
  return isAcademicCategorySlug(service.categories?.slug) ? "academic" : "general";
}

/** Kategori untuk ditampilkan: kategori utama, atau kategori akademik bila kosong. */
export function displayCategoryOf(service: {
  category?: { slug?: string | null; name?: string | null } | null;
  categories?: { slug?: string | null; name?: string | null } | null;
}): { slug: string; name: string } | null {
  const c = service.category ?? service.categories;
  return c?.slug && c?.name ? { slug: c.slug, name: c.name.replace(/\s+/g, " ").trim() } : null;
}

export const GENERAL_ATTACHMENT_TYPES = [
  { value: "reference", label: "Referensi / contoh" },
  { value: "supporting_document", label: "Dokumen pendukung" },
  { value: "draft", label: "Draf / bahan awal" },
  { value: "template", label: "Template / aset" },
] as const;

export type GeneralBrief = {
  title: string;
  description: string;
  deliverables: string;
  references: string;
  deadlineIso: string | null;
  noCredentialAccepted: boolean;
};

export type MissingBriefItem = { field: string; label: string };

/** Sama dengan validasi RPC `create_general_service_order`; server tetap sumber kebenaran. */
export function generalBriefMissing(
  b: GeneralBrief & { hasPackage: boolean },
  now: Date = new Date(),
): MissingBriefItem[] {
  const items: (MissingBriefItem | false)[] = [
    !b.hasPackage && { field: "paket", label: "Pilih paket" },
    b.title.trim().length < 3 && { field: "judul", label: "Nama proyek" },
    b.description.trim().length < 20 && {
      field: "deskripsi",
      label: "Kebutuhan proyek (min. 20 karakter)",
    },
    !!b.deadlineIso &&
      new Date(b.deadlineIso).getTime() <= now.getTime() + 2 * 60 * 60 * 1000 && {
        field: "tenggat",
        label: "Tenggat minimal 2 jam dari sekarang",
      },
    !b.noCredentialAccepted && { field: "kredensial", label: "Pernyataan keamanan akun" },
  ];
  return items.filter(Boolean) as MissingBriefItem[];
}

/**
 * Menangkap nilai rahasia yang ditempel (mis. "password: abc123", "token=..."),
 * bukan sekadar menyebut kata "password" seperti pada "fitur reset password".
 */
const SECRET_PATTERN =
  /((password|passwd|pwd|kata\s*sandi|sandi|token|api[_\s-]?key|secret|pin|otp)\s*[:=]\s*\S{3,}|ghp_[a-z0-9]{20,}|github_pat_\w{20,}|sk_live_\w+|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY)/i;

export function looksLikeSecret(text: string): boolean {
  return SECRET_PATTERN.test(text);
}
