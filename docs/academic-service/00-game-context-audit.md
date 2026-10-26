# 00 — Audit Konteks Game → Layanan Akademik

Status: ACADEMIC_SERVICE_DISCOVERY_IN_PROGRESS · Tanggal: 2026-07-28
Metode: `rg -ni` atas 200 file (`src`, `docs`) untuk 24 istilah game.

## Hasil pencarian istilah

| Istilah | Jumlah kemunculan | Catatan |
|---|---:|---|
| `joki` | 45 | Seluruhnya copywriting UI/meta/dokumen |
| `rank` | 2 | Placeholder progres operator + unit test slugify |
| `game`, `gaming`, `boost`, `grind`, `win rate`, `top up`, `diamond`, `skin`, `tier`, `mmr`, `leveling`, `match`, `server game` | 0 | Tidak ditemukan di kode aplikasi |

Kesimpulan awal: **tidak ada schema, seed, migration, atau enum bertema game.**
Kontaminasi bersifat *copywriting* + satu field form generik ("ID akun") +
ketiadaan field akademik. Ini kabar baik: konversi tidak memerlukan penghapusan
data destruktif.

## Register per lokasi

| Lokasi | Istilah lama | Konteks | Perubahan dibutuhkan | Status |
|---|---|---|---|---|
| `src/routes/__root.tsx` (5 baris meta) | "Jasa Joki Terpercaya" | Meta global | Ganti "Pendampingan Tugas Kuliah" | PENDING |
| `src/routes/index.tsx` (5) | "Layanan joki" | Hero, shortcut, section | Copy akademik + ikon | PENDING |
| `src/routes/layanan.index.tsx` (6) | "Layanan Joki" | Judul, meta, empty state | Copy akademik | PENDING |
| `src/routes/layanan.$slug.tsx` (2) | "Layanan joki" | Badge + fallback deskripsi | Copy akademik | PENDING |
| `src/routes/_authenticated/checkout.layanan.$slug.tsx` | "Checkout layanan joki", field **"ID akun"** | Form order | Ganti jadi form akademik dinamis (FASE 3) | PENDING |
| `src/routes/_authenticated/operator.$id.tsx:225` | placeholder "rank Gold III tercapai" | Input catatan progres | Ganti contoh akademik + milestone terstruktur | PENDING |
| `src/routes/bantuan.tsx`, `auth.tsx`, `produk.index.tsx`, `dashboard.pesanan.index.tsx` | "layanan joki" | Copy | Copy akademik | PENDING |
| `src/components/site-header.tsx`, `site-footer.tsx`, `home/sections.tsx` | "Layanan Joki" | Navigasi & footer | Menu → "Bantuan Tugas" | PENDING |
| `src/lib/transaction-labels.ts:47` | `service: "Layanan joki"` | Label tipe order | → "Pendampingan akademik" | PENDING |
| `src/lib/admin-nav.ts:46` | "Layanan Joki" | Menu admin | → "Layanan Akademik" | PENDING |
| `src/lib/admin.functions.ts:335` | komentar | Non-user-facing | Rapikan | LOW |
| `src/lib/__tests__/authz.test.ts:29` | fixture "Joki Rank Mobile Legends" | Uji slugify | Ganti fixture akademik | PENDING |
| `docs/*` (4 file) | "joki" | Dokumen lama | Tandai superseded, jangan dihapus | PENDING |

## Kondisi data produksi

```
categories        : 0 baris  → kategori akademik dapat di-seed bersih
services          : 2 baris uji ("sdsd", "dsd") — bukan konten game
service_packages  : 1 baris uji
service_addons    : 0 baris
orders(type=service): 4 baris uji
```

Tidak ada seed/dummy bertema game. Yang ada adalah data uji tanpa makna yang
perlu diarsipkan, bukan dimigrasi.

## Field order saat ini

`service_order_details.requirements` bertipe `jsonb` bebas; checkout hanya
mengisi `kontak` dan opsional `akun`. Tidak ada `mata_kuliah`, `rubric`,
`deadline`, `gaya_sitasi`, `jumlah_halaman`, maupun lampiran instruksi.

## Operator profile

Tabel `operator_profiles` **belum ada**. Tidak ada atribut game (rank/server/
win rate) yang perlu dihapus; model keahlian akademik dibangun dari nol.

## Progress milestone

`job_progress` hanya menyimpan `percent` + `note`. Tidak ada kolom `milestone`,
`internal_note`, `estimated_completion_at`, atau lampiran.