/** Logika murni halaman detail & checkout layanan (tanpa React, bisa dites). */

export type CheckoutFields = {
  hasPackage: boolean;
  courseName: string;
  studyProgram: string;
  educationLevel: string;
  title: string;
  description: string;
  deadlineIso: string | null;
  outputType: string;
  fileFormat: string;
  missingExtras: boolean;
  integrityAccepted: boolean;
  noCredentialAccepted: boolean;
};

export type MissingItem = { field: string; label: string };

/** Sama dengan validasi wajib di RPC `create_academic_order`; server tetap sumber kebenaran. */
export function checkoutMissingItems(f: CheckoutFields): MissingItem[] {
  const items: (MissingItem | false)[] = [
    !f.hasPackage && { field: "paket", label: "Pilih paket" },
    f.courseName.trim().length < 2 && { field: "matkul", label: "Mata kuliah" },
    f.studyProgram.trim().length < 2 && { field: "prodi", label: "Program studi" },
    f.educationLevel === "" && { field: "jenjang", label: "Jenjang" },
    f.title.trim().length < 3 && { field: "judul", label: "Judul tugas" },
    f.description.trim().length < 20 && {
      field: "deskripsi",
      label: "Deskripsi tugas (min. 20 karakter)",
    },
    !f.deadlineIso && { field: "tenggat", label: "Tenggat" },
    f.outputType === "" && { field: "output", label: "Bentuk hasil" },
    f.fileFormat === "" && { field: "format", label: "Format berkas" },
    f.missingExtras && { field: "extra", label: "Detail wajib kategori ini" },
    !f.integrityAccepted && { field: "integritas", label: "Pernyataan integritas" },
    !f.noCredentialAccepted && { field: "kredensial", label: "Pernyataan tanpa kredensial" },
  ];
  return items.filter(Boolean) as MissingItem[];
}

/** Nilai `min` untuk input datetime-local: sekarang + 2 jam (batas RPC), waktu lokal. */
export function minDeadlineLocal(now: Date = new Date()): string {
  const d = new Date(now.getTime() + 2 * 60 * 60 * 1000 + 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Paket awal: dari URL bila valid & aktif, kalau tidak paket pertama. */
export function resolveInitialPackage<T extends { id: string }>(
  packages: T[],
  requested: string | null | undefined,
): T | null {
  return packages.find((p) => p.id === requested) ?? packages[0] ?? null;
}

/** Teks revisi yang jujur: tidak menampilkan "0 revisi gratis". */
export function revisionLabel(free: number | null | undefined): string {
  const n = Number(free ?? 0);
  return n > 0 ? `${n}x revisi gratis` : "Tanpa revisi gratis";
}

export function daysLabel(min: number | null, max: number | null): string | null {
  if (min === null) return null;
  return min === max || max === null ? `${min} hari` : `${min}–${max} hari`;
}
