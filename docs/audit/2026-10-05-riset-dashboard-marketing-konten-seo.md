# Riset: Dashboard Marketing, Konten Kreator & SEO

Tanggal: 2026-10-05 · Status: **RISET SELESAI — MENUNGGU KEPUTUSAN OWNER**
Konteks: permintaan Owner untuk membangun dashboard baru khusus marketing, konten
kreator, dan SEO — terpisah dari dashboard admin yang ada, dengan gaya visual sama.

---

## 1. Kondisi proyek saat ini (bukti terverifikasi)

### 1.1 Yang SUDAH ada

| Komponen | Kondisi | Bukti |
|---|---|---|
| Tabel `articles` | Ada, **0 baris** (belum pernah dipakai) | Query live |
| Kolom artikel | 16 kolom: `title, slug, excerpt, content, cover_url, tags[], status, reading_minutes, author_id, author_name, published_at, view_count, created_at, updated_at, deleted_at` | `information_schema` |
| Halaman publik artikel | Ada (`/artikel`, `/artikel/$slug`) | Route tree |
| Admin artikel | Ada (`/admin/artikel`, 477 baris) — CRUD + publish | Kode |
| Server functions artikel | 6 fungsi: list, getBySlug, listAdmin, save, setStatus, delete | `articles.functions.ts` (273 baris) |
| Permission konten | `articles.view/create/update/delete` | DB (62 permission total) |
| SEO settings | Section "seo" — **12 field** (title, template, description, keywords, OG, verification) | `website-settings.ts:436` |
| Sitemap | Ada, dinamis (produk + jasa + artikel) | `sitemap[.]xml.ts` |
| robots.txt | Ada, dengan sitemap reference | `public/robots.txt` |
| Structured data | `ld+json` di 5 halaman (root, index, produk, layanan, toko) | Grep |
| OG image | Ada di halaman produk, layanan, toko | Grep |

### 1.2 Yang BELUM ada (gap nyata)

| Kebutuhan | Status | Dampak |
|---|---|---|
| **Analytics / tracking** | **Nol** — tidak ada GA4, Plausible, Umami, PostHog | Tidak ada data perilaku pengunjung sama sekali |
| Data traffic (kunjungan, sumber, konversi) | Tidak ada | Marketing buta; tidak tahu kanal mana yang bekerja |
| `view_count` artikel | Kolom ada, **tidak ada kode yang menaikkannya** | Sama seperti bug `sold_count` dulu |
| Kalender konten / jadwal publish | Tidak ada | Konten kreator tidak punya rencana terlihat |
| Status editorial (draft → review → publish) | Hanya `draft`/`published` | Tidak ada alur review |
| Kanban / board konten | Tidak ada | Tidak ada cara melihat antrean konten |
| Aset media (library gambar) | Tidak ada tabel | Cover artikel diisi URL manual |
| Kampanye / UTM builder | Tidak ada | Tidak bisa melacak asal kunjungan |
| Keyword tracking | Tidak ada | SEO tidak terukur |
| Audit SEO halaman | Tidak ada | Tidak tahu halaman mana yang bermasalah |
| Laporan performa konten | Tidak ada | Tidak ada evaluasi |
| Peran/role khusus marketing | Tidak ada — hanya `customer, seller, finance, super_admin` | Tidak bisa membatasi akses |
| Sosialisasi konten (share) | Tidak ada | Distribusi manual |

---

## 2. Apa yang harus ada — hasil riset standar industri

Riset ini menggabungkan pola dari tiga jenis peran yang Anda sebut, karena
ketiganya bekerja pada objek yang sama (konten & kanal) dengan sudut berbeda.

### 2.1 Dashboard MARKETING — pertanyaan yang harus dijawab

Dashboard marketing bukan "halaman berisi banyak angka". Ia harus menjawab
pertanyaan operasional. Berdasarkan pola industri (GA4, Plausible, Mixpanel),
pertanyaan yang benar-benar dipakai:

| # | Pertanyaan | Data yang dibutuhkan |
|---|---|---|
| M1 | Dari mana pengunjung datang? | Sumber/kanal, UTM, referrer |
| M2 | Halaman apa yang paling menarik? | Page views per URL, waktu, bounce |
| M3 | Apakah pengunjung berubah jadi pembeli? | Funnel: kunjungan → produk → checkout → bayar |
| M4 | Di langkah mana orang berhenti? | Drop-off per langkah funnel |
| M5 | Kanal mana yang menghasilkan uang, bukan hanya klik? | Konversi per kanal + nilai transaksi |
| M6 | Berapa biaya per akuisisi? | (Butuh data belanja iklan — opsional, fase lanjut) |
| M7 | Apakah ada lonjakan/penurunan anomali? | Perbandingan periode |
| M8 | Kampanye mana yang sedang jalan? | Daftar kampanye + UTM |

**Catatan penting:** tanpa tracking, **tidak ada satu pun** pertanyaan ini bisa
dijawab. Karena itu **Slice 1 wajib: pasang tracking dulu**, sebelum dashboard.

### 2.2 Dashboard KONTEN KREATOR — pertanyaan yang harus dijawab

Pola dari CMS modern (Sanity, Contentful, Ghost, Notion-style editorial):

| # | Pertanyaan | Data yang dibutuhkan |
|---|---|---|
| C1 | Konten apa yang sedang dikerjakan? | Board/kanban per status editorial |
| C2 | Apa yang harus terbit minggu ini? | Kalender + jadwal |
| C3 | Konten mana yang performanya bagus? | Views, waktu baca, sumber |
| C4 | Ide apa yang belum ditulis? | Backlog ide |
| C5 | Siapa penulisnya dan berapa beban kerjanya? | Author + jumlah konten per orang |
| C6 | Aset apa saja yang sudah tersedia? | Media library |
| C7 | Apakah kontennya siap terbit? | Checklist pra-terbit (SEO, gambar, tautan) |

**Alur editorial yang benar** (bukan hanya draft/published):

```
ide → outline → draft → review → siap terbit → terbit → diarsipkan
```

Setiap perpindahan status harus tercatat (siapa, kapan) supaya bisa diaudit.

### 2.3 Dashboard SEO — pertanyaan yang harus dijawab

Pola dari Ahrefs/Screaming Frog/Search Console (versi yang bisa dibangun sendiri
tanpa API berbayar):

| # | Pertanyaan | Data yang dibutuhkan |
|---|---|---|
| S1 | Halaman mana yang punya masalah SEO? | Audit otomatis: title, description, H1, alt, panjang |
| S2 | Apakah ada duplikasi title/description? | Pemeriksaan unik |
| S3 | Apakah semua halaman bisa diindeks? | robots meta, canonical, status |
| S4 | Apakah structured data valid? | Validasi `ld+json` |
| S5 | Apakah sitemap lengkap? | Bandingkan halaman nyata vs sitemap |
| S6 | Bagaimana performa pencarian? | (Butuh Search Console API — fase lanjut) |
| S7 | Keyword apa yang dibidik per halaman? | Pemetaan halaman → keyword |

**Yang bisa dibangun tanpa API berbayar:** audit on-page (S1-S5, S7).
**Yang butuh integrasi eksternal:** performa pencarian (S6) — Search Console API.

### 2.4 Yang HARUS ADA di semua (fondasi lintas peran)

| Fondasi | Alasan |
|---|---|
| **Tracking event** | Tanpa ini, semua dashboard kosong |
| **Definisi metrik tertulis** | "Konversi" bisa berarti 3 hal; harus disepakati |
| **Zaman data jelas** | "7 hari" harus jelas 7 hari apa (bukan tafsir) |
| **Data nyata atau kosong** | Dilarang angka contoh (R-17, R-38) |
| **Peran & izin** | Marketing tidak boleh lihat data keuangan |

---

## 3. Keputusan arsitektur yang perlu diambil

### 3.1 Dashboard terpisah atau satu?

| Opsi | Kelebihan | Kekurangan |
|---|---|---|
| **A. Satu dashboard baru dengan tab** (marketing / konten / SEO) | Satu tempat, perpindahan cepat, satu set komponen | Halaman bisa padat |
| **B. Tiga dashboard terpisah** | Fokus per peran | Duplikasi navigasi, tiga pintu masuk |
| **C. Masuk ke admin existing** | Tidak ada kode baru untuk shell | Mencampur operasional & pertumbuhan |

**Rekomendasi riset: A** — satu dashboard dengan tiga bagian. Alasannya: ketiganya
memakai data yang sama (konten & trafik), dan pemiliknya sering orang yang sama di
tim kecil. Tapi keputusan ini milik Owner.

### 3.2 Peran baru?

Saat ini hanya `customer, seller, finance, super_admin`. Untuk marketing/konten/SEO
perlu keputusan:

| Opsi | Keterangan |
|---|---|
| **Peran `marketing`** | Satu peran untuk ketiganya |
| **Tiga peran** (`marketing`, `content_editor`, `seo`) | Lebih presisi, lebih banyak konfigurasi |
| **Tanpa peran baru** — pakai permission saja | Cukup untuk tim kecil; akses diatur per orang |

**Rekomendasi riset:** pakai **permission** dulu (`marketing.view`, `content.manage`,
`seo.view`), tanpa peran baru. Peran bisa ditambah nanti bila tim bertambah.

### 3.3 Sumber data tracking

| Opsi | Kelebihan | Kekurangan |
|---|---|---|
| **Plausible/Umami (self-host)** | Privasi, data milik sendiri, ringan | Perlu server + setup |
| **GA4** | Gratis, lengkap | Data di Google, butuh consent, API rumit |
| **Tracking sendiri di database** | Kendali penuh, tanpa pihak ketiga | Perlu bangun sendiri, rawan sampah bot |

**Rekomendasi riset:** **tracking sendiri** untuk event transaksi (karena sudah
punya database) + pertimbangkan Umami self-host untuk analitik halaman. Alasan:
event transaksi (checkout, bayar) lebih berharga daripada page view, dan itu sudah
bisa dicatat tanpa pihak ketiga.

---

## 4. Risiko yang teridentifikasi

| Risiko | Detail | Mitigasi |
|---|---|---|
| **Dashboard kosong** | Tanpa tracking, semua angka 0 dan dashboard terlihat rusak | Slice 1 wajib tracking sebelum dashboard |
| **Metrik salah tafsir** | "Konversi" tanpa definisi | Tulis definisi di dokumen sebelum kode |
| **Bot mengotori data** | Page view dari crawler | Filter user-agent + rate limit |
| **Privasi pengunjung** | Melacak orang tanpa dasar | Tanpa data pribadi; agregat saja; hormati DNT |
| **Beban database** | Setiap kunjungan menulis baris | Batch/agregasi harian, bukan per-request |
| **Data contoh bocor ke produksi** | Dashboard demo dengan angka karangan | Dilarang keras (R-17, R-38) |
| **Akses tidak terbatas** | Marketing melihat data keuangan | Permission terpisah per bagian |
| **`view_count` mati seperti `sold_count`** | Kolom ada tapi tidak diisi | Pastikan ada jalur penulisan sebelum menampilkan |

---

## 5. Urutan yang benar (dari riset)

Membangun dashboard sebelum data ada = membangun layar kosong. Urutan yang benar:

1. **Fondasi data** — tracking event + definisi metrik + jalur penulisan `view_count`
2. **Audit SEO on-page** — bisa dibangun tanpa data eksternal (memeriksa halaman nyata)
3. **Alur editorial konten** — status, kalender, review (memakai tabel `articles` yang ada)
4. **Dashboard** — baru menampilkan data yang sudah terkumpul

Ini kebalikan dari intuisi ("bikin dashboard dulu"), tapi mencegah pekerjaan sia-sia.

---

## 6. Status bukti

| Bagian | Status |
|---|---|
| Infrastruktur konten existing | `VERIFIED` (tabel, fungsi, halaman, permission) |
| Analytics | `NOT_IMPLEMENTED` (nol kode) |
| SEO on-page tooling | `NOT_IMPLEMENTED` |
| Alur editorial lanjutan | `NOT_IMPLEMENTED` (hanya draft/published) |
| Media library | `NOT_IMPLEMENTED` |
| Kampanye/UTM | `NOT_IMPLEMENTED` |
| Peran marketing | `OWNER_DECISION_REQUIRED` |
| Bentuk dashboard (satu/tiga) | `OWNER_DECISION_REQUIRED` |
| Sumber tracking | `OWNER_DECISION_REQUIRED` |
| Gaya visual | Ditiru dari admin existing (dikonfirmasi Owner) |
