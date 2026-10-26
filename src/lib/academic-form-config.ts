/**
 * Konfigurasi form akademik (client-safe).
 * Sumber tunggal untuk opsi dropdown dan field dinamis per kategori akademik.
 */

export const EDUCATION_LEVELS = [
  { value: "d3", label: "D3" },
  { value: "s1", label: "S1" },
  { value: "s2", label: "S2" },
  { value: "s3", label: "S3" },
] as const;

export const LANGUAGES = [
  { value: "id", label: "Bahasa Indonesia" },
  { value: "en", label: "Bahasa Inggris" },
  { value: "mixed", label: "Campuran" },
] as const;

export const OUTPUT_TYPES = [
  { value: "dokumen", label: "Dokumen" },
  { value: "slide", label: "Slide presentasi" },
  { value: "catatan_revisi", label: "Catatan revisi" },
  { value: "dataset", label: "Dataset / hasil olahan" },
  { value: "kode", label: "Berkas kode" },
] as const;

export const FILE_FORMATS = [
  { value: "docx", label: "DOCX" },
  { value: "pdf", label: "PDF" },
  { value: "pptx", label: "PPTX" },
  { value: "xlsx", label: "XLSX" },
  { value: "zip", label: "ZIP" },
] as const;

export const CITATION_STYLES = [
  { value: "apa", label: "APA" },
  { value: "mla", label: "MLA" },
  { value: "ieee", label: "IEEE" },
  { value: "harvard", label: "Harvard" },
  { value: "chicago", label: "Chicago" },
] as const;

export const ATTACHMENT_TYPES = [
  { value: "assignment_instruction", label: "Instruksi tugas" },
  { value: "rubric", label: "Rubrik penilaian" },
  { value: "template", label: "Template kampus" },
  { value: "draft", label: "Draf tulisan" },
  { value: "dataset", label: "Dataset" },
  { value: "reference", label: "Referensi" },
  { value: "lecturer_feedback", label: "Catatan dosen" },
  { value: "supporting_document", label: "Dokumen pendukung" },
] as const;

/** Penanda permintaan di luar cakupan; memicu peninjauan admin. */
export const SCOPE_FLAGS = [
  { value: "active_exam", label: "Mengerjakan ujian yang sedang berlangsung" },
  { value: "active_quiz", label: "Mengerjakan kuis daring yang sedang berlangsung" },
  { value: "lms_impersonation", label: "Masuk ke LMS/portal kampus atas nama saya" },
  { value: "credential_request", label: "Menggunakan akun atau kata sandi saya" },
  { value: "data_fabrication", label: "Membuat data penelitian fiktif" },
  { value: "plagiarism_request", label: "Menyalin karya pihak lain tanpa sumber" },
  { value: "grade_manipulation", label: "Mengubah nilai atau dokumen resmi kampus" },
  { value: "identity_impersonation", label: "Menghadiri kelas atau sidang atas nama saya" },
] as const;

export type ExtraField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number";
  placeholder?: string;
  required?: boolean;
};

/** Field tambahan per slug kategori akademik. */
export const CATEGORY_EXTRA_FIELDS: Record<string, ExtraField[]> = {
  "analisis-data": [
    { key: "software", label: "Perangkat lunak yang diminta", type: "text", placeholder: "SPSS, R, Python…", required: true },
    { key: "data_type", label: "Jenis data", type: "text", placeholder: "Kuesioner, sekunder, eksperimen" },
    { key: "analysis_method", label: "Metode analisis", type: "text", placeholder: "Regresi, uji beda, deskriptif" },
  ],
  presentasi: [
    { key: "slide_count", label: "Perkiraan jumlah slide", type: "number", placeholder: "15" },
    { key: "duration_minutes", label: "Durasi presentasi (menit)", type: "number", placeholder: "10" },
    { key: "audience", label: "Audiens", type: "text", placeholder: "Dosen dan mahasiswa sekelas" },
  ],
  "pemrograman-akademik": [
    { key: "language_stack", label: "Bahasa/framework", type: "text", placeholder: "Python, Laravel…", required: true },
    { key: "expected_output", label: "Output yang diharapkan", type: "textarea" },
  ],
  proposal: [
    { key: "chapter", label: "Bab yang dikerjakan", type: "text", placeholder: "Bab 1–3" },
    { key: "research_method", label: "Metode penelitian", type: "text" },
    { key: "campus_guideline", label: "Pedoman kampus", type: "textarea" },
  ],
  "pendampingan-skripsi": [
    { key: "chapter", label: "Bab yang dikerjakan", type: "text", placeholder: "Bab 4" },
    { key: "research_method", label: "Metode penelitian", type: "text" },
    { key: "advisor_feedback", label: "Catatan dosen pembimbing", type: "textarea" },
  ],
  makalah: [{ key: "writing_style", label: "Gaya penulisan yang diminta", type: "text" }],
  "review-tulisan": [{ key: "focus_area", label: "Fokus review", type: "text", placeholder: "Struktur, tata bahasa, sitasi" }],
  formatting: [{ key: "campus_guideline", label: "Pedoman format kampus", type: "textarea" }],
  "sitasi-dan-referensi": [{ key: "reference_count", label: "Perkiraan jumlah referensi", type: "number" }],
  "laporan-praktikum": [
    { key: "practicum_subject", label: "Mata praktikum", type: "text", required: true },
    { key: "result_data", label: "Data hasil praktikum", type: "textarea" },
  ],
  "revisi-dosen": [{ key: "advisor_feedback", label: "Catatan revisi dari dosen", type: "textarea", required: true }],
  "persiapan-sidang": [{ key: "session_date", label: "Rencana tanggal sidang", type: "text" }],
  "tugas-harian": [],
};

export function extraFieldsFor(categorySlug: string | null | undefined): ExtraField[] {
  if (!categorySlug) return [];
  return CATEGORY_EXTRA_FIELDS[categorySlug] ?? [];
}

export const URGENCY_LABEL: Record<string, string> = {
  normal: "Normal",
  priority: "Prioritas",
  urgent: "Mendesak",
};