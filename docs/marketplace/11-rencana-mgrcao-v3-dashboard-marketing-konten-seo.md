# 11 — Rencana Eksekusi MGRCAO V3: Dashboard Marketing, Konten & SEO

Tanggal: 2026-10-05 · Sumber temuan: [`../audit/2026-10-05-riset-dashboard-marketing-konten-seo.md`](../audit/2026-10-05-riset-dashboard-marketing-konten-seo.md)
Framework prompt: [`10-framework-prompt-dashboard-marketing-konten-seo.md`](./10-framework-prompt-dashboard-marketing-konten-seo.md)
Status: **RENCANA — MENUNGGU KEPUTUSAN OWNER (O-20, O-21, O-22)**

---

## M — Mindset

1. **Problem-first.** Dashboard ini dibangun untuk menjawab pertanyaan operasional
   (dari mana pengunjung, konten mana yang bekerja, halaman mana yang bermasalah),
   bukan untuk memajang grafik.
2. **Data dulu, layar kemudian.** Pelajaran dari `sold_count`: kolom yang ada tapi
   tidak pernah diisi membuat UI menampilkan keadaan yang menyesatkan. Karena itu
   tracking dan definisi metrik dikerjakan **sebelum** dashboard.
3. **Dilarang angka contoh.** Dashboard tanpa data menampilkan keadaan kosong yang
   menjelaskan cara mengisinya (R-17, R-38). Tidak ada "data demo".
4. **Privasi pengunjung.** Agregat saja; tanpa IP mentah, tanpa pelacakan lintas
   situs, tanpa data pribadi.
5. **Gaya visual identik dengan admin existing.** Bukan mirip, bukan "terinspirasi" —
   memakai komponen dan token yang sama persis (keputusan Owner).
6. **Anti AI-slop UI.** Grafik harus menjawab pertanyaan; dilarang grafik hiasan,
   badge dekoratif, emoji, gradien default (skill `antislop-ui`).
7. **Isolasi akses.** Marketing/konten/SEO tidak boleh melihat data keuangan.

## G — Goal

Dashboard terpisah untuk marketing, konten kreator, dan SEO yang menampilkan **data
nyata** dari sistem, dengan gaya visual sama seperti dashboard admin.

### Slice 0 — Keputusan Owner (gerbang, tanpa kode)

| # | Keputusan | Opsi | Rekomendasi riset |
|---|---|---|---|
| O-20 | Bentuk: satu dashboard 3 bagian / tiga terpisah / masuk admin | lihat riset §3.1 | satu dashboard, tiga bagian |
| O-21 | Peran baru atau permission saja | peran `marketing` / tiga peran / permission | permission saja |
| O-22 | Sumber tracking | sendiri / GA4 / Umami self-host | tracking sendiri |

**Acceptance:** tiga keputusan tercatat di `02-decision-register.md` dengan alasan.

### Slice 1 — Fondasi data (wajib pertama)

| Aspek | Target |
|---|---|
| Masalah | Tidak ada analytics; `view_count` artikel tidak pernah diisi |
| Target | Tabel event + agregasi harian; jalur penulisan `view_count`; definisi metrik tertulis |
| Acceptance | (a) event kunjungan tercatat tanpa data pribadi; (b) bot tersaring; (c) agregasi harian jalan; (d) `view_count` naik saat artikel dibaca; (e) dokumen definisi metrik ada; (f) 1.000 kunjungan menghasilkan baris agregat yang wajar, bukan 1.000 baris penuh |

### Slice 2 — Tiga modul (bisa paralel)

**2a. SEO audit** — periksa title, description, H1, alt, canonical, robots,
structured data pada halaman nyata (dari sitemap). Simpan ke `seo_audit_results`.
Acceptance: (a) jumlah halaman diperiksa = jumlah di sitemap; (b) masalah ditemukan
dan diklasifikasi; (c) berjalan berkala.

**2b. Alur editorial konten** — perluas status (aditif: `idea, outline, draft, review,
ready, published, archived`), riwayat status, kalender, board, checklist pra-terbit.
Acceptance: (a) artikel lama tetap sah; (b) perpindahan status tercatat; (c) kalender
menampilkan jadwal; (d) board mencerminkan status nyata.

**2c. Kampanye & atribusi** — tabel `campaigns`, UTM builder, atribusi kunjungan→order,
laporan konversi per kanal. Acceptance: (a) UTM terbentuk benar; (b) konversi
terhitung dari data nyata; (c) **batas metode atribusi dinyatakan tertulis**.

### Slice 3 — Dashboard

| Aspek | Target |
|---|---|
| Masalah | Belum ada tempat melihat semua data itu |
| Target | Shell bergaya admin + tiga bagian panel (marketing, konten, SEO) |
| Acceptance | (a) gaya identik admin (komponen & token yang sama); (b) setiap panel menjawab satu pertanyaan tertulis; (c) angka dashboard **sama** dengan query manual; (d) state kosong/error jujur; (e) mobile 390px; (f) keyboard penuh |

## G-UI — Lapisan UI/UX

| Elemen | Keputusan | Alasan |
|---|---|---|
| Shell | Pakai ulang `AdminPageHeader`, `DetailCard`, pola `adminNav` | Gaya identik (arahan Owner) |
| Grafik | `report-charts.tsx` yang sudah ada | Tanpa library baru |
| Judul panel | Kalimat pertanyaan, mis. "Dari mana pengunjung datang?" | Grafik tanpa pertanyaan = hiasan |
| Angka | Selalu disertai periode + sumber | Menghindari tafsir ganda |
| Delta tren | Hanya bila periode pembanding nyata | Dilarang delta karangan (R-38) |
| Kosong | Sebut sebab + langkah mengisi | R-27 |
| Warna | Token yang ada; `chart-1..5` untuk data | R-29 |

Aturan ketat: emoji 0, em-dash 0 pada copy UI, kontras ≥ 4.5:1, tanpa glow/gradien
default, tanpa badge dekoratif.

## R — Role

12 role engineer (rincian di dokumen framework): product strategist, engineering lead,
backend, data engineer, analytics engineer, SEO engineer, CMS engineer, growth
engineer, frontend, accessibility, QA, security & privacy.

## C — Context (bukti terverifikasi)

- `articles` **ada tapi 0 baris**; 16 kolom termasuk `view_count` yang tidak pernah diisi.
- Analytics: **nol** — tidak ada GA4/Plausible/Umami/PostHog.
- Sitemap dinamis **sudah ada**; robots.txt ada; structured data di 5 halaman.
- SEO settings: 12 field di `website-settings.ts`.
- Permission konten: `articles.view/create/update/delete` (dari 62 permission total).
- Peran: hanya `customer, seller, finance, super_admin`.
- Admin: `admin-nav.ts` (7 grup), `admin/route.tsx` (371 baris), `admin-ui.tsx`,
  `tx-ui.tsx`, `report-charts.tsx` — semua bisa dipakai ulang.

## A — Action

Ikuti **dokumen framework prompt** (`10-framework-prompt-...md`) fase demi fase:

1. **Fase 0** — catat O-20/O-21/O-22. **Gerbang:** tanpa ini, jangan mulai.
2. **Fase 1** — tracking + definisi metrik. **Gerbang:** event nyata terbukti tercatat.
3. **Fase 2** — SEO audit, alur konten, kampanye (boleh paralel).
   **Gerbang:** ketiganya punya data nyata.
4. **Fase 3** — dashboard. **Gerbang:** angka cocok dengan query manual.
5. **Fase 4** — QA + security, dengan uji negatif nyata.

Setiap tahap: implementasi → `npx eslint --fix` → `npm run test:unit` → `npm run build`
→ catat bukti → tahap berikutnya.

## O — Output

1. Migrasi: `analytics_events`, `analytics_daily`, `seo_audit_results`,
   `campaigns`, `article_status_history`, perluasan status artikel.
2. Jalur penulisan `view_count` yang benar.
3. `docs/marketplace/10-definisi-metrik.md` — definisi setiap metrik.
4. Dashboard dengan tiga bagian + navigasi + permission terpisah.
5. Test: tracking, agregasi, audit SEO, atribusi, perbandingan angka dashboard.
6. Laporan verifikasi dengan bukti uji negatif (bukan asumsi).

### Non-goals

- Data belanja iklan / biaya akuisisi (butuh integrasi eksternal; fase lanjut).
- Integrasi Search Console API (butuh akun & API; fase lanjut).
- Pelacakan lintas situs / data pribadi pengunjung.
- Mengganti gaya visual admin existing.
- Menambah library chart atau palet warna baru.

### Keputusan Owner yang diperlukan

| ID | Pertanyaan | Default aman |
|---|---|---|
| O-20 | Bentuk dashboard | Satu dashboard, tiga bagian |
| O-21 | Peran atau permission | Permission saja (`marketing.view`, `content.manage`, `seo.view`) |
| O-22 | Sumber tracking | Tracking sendiri untuk event transaksi |
| O-23 | Retensi data event mentah | Usulan: 90 hari mentah, agregat disimpan permanen |

### Risiko & rollback

| Risiko | Mitigasi |
|---|---|
| Dashboard kosong | Gerbang G1 wajib lulus sebelum Slice 3 |
| Biaya penyimpanan event | Agregasi harian + retensi (O-23) |
| Bot mengotori data | Filter user-agent + rate limit + tandai di definisi metrik |
| Metrik ditafsirkan ganda | Dokumen definisi metrik sebelum dashboard |
| Angka dashboard salah | Uji bandingkan dengan query manual per panel |
| Akses bocor ke keuangan | Uji negatif lintas peran (Prompt 4.2) |
| `view_count` mati seperti `sold_count` | Uji bahwa angka benar-benar naik saat dibaca |

Rollback: hapus tabel baru (aditif, tanpa data produksi lain yang bergantung);
perluasan status artikel dikembalikan ke dua nilai; dashboard dihapus dari navigasi.
