# AS-2 — Rencana Fondasi Domain Akademik

Status: **AS2_PLANNED** (belum dieksekusi; menunggu AS-1 VERIFIED — tercapai)

## Migration plan (aditif, tidak mengubah migration lama)

| Kode | Isi | Rollback |
|---|---|---|
| M1 | Seed 13 kategori akademik pada `categories` (idempotent, `ON CONFLICT (slug)`) | hapus baris slug akademik |
| M2 | Metadata layanan akademik pada `services` | drop kolom aditif |
| M3 | Detail order akademik pada `service_order_details` | drop kolom aditif |
| M4 | Integrity confirmation + `scope_review_status` | drop kolom aditif |
| M5 | Snapshot pricing + `system_settings` urgensi/reviewer | drop kolom + hapus setting |
| M6 | Penanda `is_test_data` | **SUDAH DIEKSEKUSI di AS-1** |

Seluruh kolom baru **nullable** agar 4 order lama tetap dapat dibuka admin
(ditandai sebagai Legacy/Test Order, total tidak berubah).

## Schema academic order detail (M3/M4/M5)

```text
service_order_details (aditif)
  academic_category_id      uuid null  → categories(id)
  course_name               text null
  study_program             text null
  education_level           text null   -- d3|s1|s2|s3
  assignment_title          text null
  assignment_description    text null
  lecturer_instructions     text null
  official_deadline_at      timestamptz null
  customer_timezone         text null
  language                  text null
  output_type               text null
  file_format               text null
  citation_style            text null
  estimated_pages           int  null
  revision_limit_snapshot   int  null
  institution_name          text null
  software_required         text null
  dataset_description       text null
  presentation_duration     int  null
  special_notes             text null
  extra_fields              jsonb not null default '{}'   -- field dinamis per kategori
  -- M4
  integrity_accepted_at     timestamptz null
  integrity_policy_version  text null
  no_credential_accepted_at timestamptz null
  scope_review_status       text not null default 'pending'  -- pending|approved|needs_clarification|rejected
  -- M5
  package_price_snapshot    bigint null
  addon_total_snapshot      bigint null
  urgency_fee_snapshot      bigint null
  reviewer_fee_snapshot     bigint null
  discount_snapshot         bigint null
  total_snapshot            bigint null
  pricing_version           text null
```

Metadata layanan (M2, pada `services`): `academic_category_id`,
`supported_education_levels[]`, `supported_outputs[]`,
`supported_citation_styles[]`, `requires_quality_review`, `allows_attachments`,
`requires_rubric`, `requires_dataset`, `default_revision_limit`,
`default_sla_hours`, `integrity_policy_version`.

Metadata paket (`service_packages`): `urgency_supported`,
`quality_review_included`, `maximum_pages`, `included_outputs`.

## Matriks form dinamis per kategori

| Kategori | Field tambahan |
|---|---|
| Analisis Data | software, jenis data, metode, dataset, output tabel/grafik, interpretasi |
| Presentasi | jumlah slide, durasi, audience, speaker note, template |
| Pemrograman Akademik | bahasa, framework, error, expected output, repo/file, walkthrough |
| Proposal / Pendampingan Skripsi | topik, bab, metode, pedoman kampus, feedback dosen, citation style, quality review (wajib) |
| Makalah / Review Tulisan | estimasi halaman, citation style, gaya penulisan |
| Formatting / Sitasi | pedoman kampus, gaya sitasi, template |
| Laporan Praktikum | mata praktikum, data hasil, format laporan |
| Tugas Harian / Revisi Dosen / Persiapan Sidang | catatan dosen, deadline, output |

Konfigurasi disimpan terstruktur pada satu modul
(`src/lib/academic-form-config.ts`) + `extra_fields` jsonb, bukan hard-code di
banyak halaman.

## Pricing MVP (server-side)

```text
total = package_price + addon_total + urgency_fee + reviewer_fee - discount
```

`system_settings`: `urgency_threshold_hours`, `urgency_fee_type`,
`urgency_fee_value`, `reviewer_fee`. Tier: `normal | priority | urgent`
dihitung dari selisih `official_deadline_at` dengan `now()` di server.
Reviewer fee wajib untuk proposal, skripsi, analisis data lanjut, paket
premium, dan order high-risk. Snapshot breakdown disimpan pada order sehingga
perubahan harga layanan tidak mengubah order lama.

## Test plan AS-2

1. kategori ter-seed sekali (migration ulang tidak duplikat);
2. checkout menyimpan metadata akademik;
3. deadline lampau ditolak server;
4. timezone invalid ditolak;
5. integrity `false` ditolak;
6. field kredensial ditolak;
7. paket nonaktif ditolak;
8. manipulasi harga dari client diabaikan;
9. urgency fee & reviewer fee dihitung server-side;
10. snapshot harga tersimpan;
11. order lama tetap dapat dibuka admin;
12. customer lain tidak dapat membuka order.

## Blocked

- Uploader instruksi/rubric/dataset: **BLOCKED_BY_M3_PRIVATE_STORAGE**
  (private bucket + signed URL belum disiapkan). Tidak membuat uploader palsu.