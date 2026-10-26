# 03 — Peta Kategori → Layanan → Paket

Status: DRAFT · Sumber kebenaran: tabel `categories`, `services`,
`service_packages`, `service_addons`.

## Struktur

```text
categories (kind = 'service')
  └── services (mata layanan akademik)
        ├── service_packages (Basic / Standar / Prioritas)
        └── service_addons   (reviewer, urgensi, sitasi, dsb.)
```

## Kategori awal yang akan di-seed (migration AS-2)

| Slug | Nama | Contoh layanan |
|---|---|---|
| `tugas-harian` | Tugas Harian | Review tugas harian, penjelasan soal |
| `makalah` | Makalah | Pendampingan makalah, outline & argumentasi |
| `presentasi` | Presentasi | Penyusunan slide dari materi customer |
| `proposal` | Proposal | Bimbingan proposal penelitian |
| `laporan-praktikum` | Laporan Praktikum | Struktur & pembahasan laporan |
| `analisis-data` | Analisis Data | Bimbingan SPSS/R/Python, interpretasi |
| `pemrograman-akademik` | Pemrograman Akademik | Debugging, walkthrough, dokumentasi |
| `review-tulisan` | Review Tulisan | Penyuntingan bahasa & struktur |
| `formatting` | Formatting | Template kampus, penomoran, daftar isi |
| `sitasi-referensi` | Sitasi dan Referensi | Pemeriksaan sitasi, pencarian referensi |
| `revisi-dosen` | Revisi Dosen | Pendampingan revisi berdasarkan feedback |
| `persiapan-sidang` | Persiapan Sidang | Simulasi tanya jawab |
| `pendampingan-skripsi` | Pendampingan Skripsi | Bimbingan bertahap per bab |

## Aturan implementasi

- Komponen tidak boleh menyimpan daftar kategori; selalu query database.
- Kategori nonaktif tetap tersimpan (`is_active = false`), tidak dihapus.
- Setiap layanan wajib punya minimal satu paket aktif sebelum `published`.
- Field baru pada layanan (AS-2): `academic_field`, `output_types`,
  `requires_reviewer`, `allowed_scope_note`.