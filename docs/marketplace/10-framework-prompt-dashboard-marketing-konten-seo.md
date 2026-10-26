# Framework Prompt: Dashboard Marketing, Konten & SEO — Tim 12 Engineer

Tanggal: 2026-10-05 · Basis riset: [`../audit/2026-10-05-riset-dashboard-marketing-konten-seo.md`](../audit/2026-10-05-riset-dashboard-marketing-konten-seo.md)
Status: **SIAP DIPAKAI — MENUNGGU KEPUTUSAN OWNER**

---

## Cara memakai dokumen ini

Dokumen ini adalah **paket prompt berlapis**, bukan satu prompt raksasa. Alasannya:
satu prompt yang menyuruh "bangun seluruh dashboard" akan menghasilkan kode dangkal
di semua bagian. Yang benar: setiap tahap dikerjakan oleh **role yang tepat**, dengan
keluaran yang bisa diperiksa sebelum lanjut.

Alur: **Fase 0 (keputusan) → Fase 1 (fondasi data) → Fase 2 (tiga modul paralel) →
Fase 3 (dashboard) → Fase 4 (verifikasi)**.

Setiap prompt wajib memakai kontrak **MGRCAO V3** (M/G/R/C/A/O) dan mematuhi
**Aturan Non-Negosiasi** di bawah.

---

## Aturan Non-Negosiasi (berlaku di SEMUA prompt)

1. **Evidence-before-claim.** Setiap klaim menyebut file:baris atau hasil query.
   Status: `VERIFIED` / `PARTIALLY_VERIFIED` / `NOT_IMPLEMENTED` / `OWNER_DECISION_REQUIRED`.
2. **Dilarang angka karangan.** Dashboard tanpa data menampilkan keadaan kosong yang
   jujur, bukan angka contoh. (R-17, R-38)
3. **Dilarang mengklaim fitur berfungsi** sebelum diuji. (R-26)
4. **Migrasi aditif.** Tidak ada perubahan destruktif tanpa rencana rollback.
5. **Isolasi akses.** Marketing/konten/SEO tidak boleh melihat data keuangan.
6. **Gaya visual mengikuti dashboard admin existing** — token warna, radius, elevasi,
   dan komponen yang sama. Tidak ada identitas visual baru.
7. **Anti AI-slop UI** (skill `antislop-ui`): tanpa gradien default, tanpa emoji di UI,
   tanpa glow berlebihan, tanpa badge hiasan, tanpa section template.
8. **Tanpa data pribadi pengunjung.** Tracking agregat saja.
9. **Setiap tahap berakhir dengan bukti**, bukan ringkasan naratif.

---

## FASE 0 — Keputusan Owner (WAJIB SEBELUM KODE)

**Role:** Product strategist + Engineering lead

**M — Mindset.** Tiga keputusan di bawah menentukan seluruh arsitektur. Membangun
sebelum diputuskan = kemungkinan besar mengulang.

**G — Goal.** Mendapat jawaban tegas atas tiga pertanyaan, tercatat sebagai keputusan
di `docs/marketplace/02-decision-register.md`.

**C — Context.** Kondisi nyata: hanya ada `customer, seller, finance, super_admin`;
`articles` ada tapi 0 baris; analytics nol; `view_count` tidak pernah diisi.

**A — Action.** Ajukan tiga pertanyaan ini ke Owner dan catat jawabannya:

| # | Pertanyaan | Opsi | Rekomendasi riset |
|---|---|---|---|
| O-20 | Bentuk dashboard: satu dengan tiga bagian, atau tiga terpisah? | A/B/C (lihat dokumen riset §3.1) | **A** — satu dashboard, tiga bagian |
| O-21 | Peran baru atau cukup permission? | peran `marketing` / tiga peran / permission saja | **permission saja** dulu |
| O-22 | Sumber tracking: sendiri, GA4, atau Umami self-host? | lihat §3.3 | **tracking sendiri** untuk event transaksi |

**O — Output.** Tiga baris keputusan di register, dengan tanggal dan alasan.
**Gerbang:** tanpa ketiga jawaban ini, Fase 1 tidak boleh dimulai.

---

## FASE 1 — Fondasi Data (WAJIB PERTAMA)

> Alasan urutan ini: dashboard sebelum data = layar kosong. Ini pelajaran dari
> `sold_count` yang kolomnya ada tapi tidak pernah diisi.

### Prompt 1.1 — Tracking Event Engineer

**Role:** Senior backend engineer + data engineer. Fokus: instrumentasi yang tidak
membebani database dan tidak melacak pribadi.

**G — Goal.** Event kunjungan dan konversi tercatat, teragregasi, tanpa data pribadi.

**C — Context (bukti).** Tidak ada analytics sama sekali. Event transaksi sudah
tersedia di tabel `orders`, `payments` — jadi konversi bisa dihitung dari sana,
tidak perlu tracking baru untuk transaksi.

**A — Action.**
1. Rancang tabel `analytics_events` (aditif): `id, event_type, path, referrer_host,
   utm_source, utm_medium, utm_campaign, session_hash, created_at`.
   **Tanpa** IP mentah, tanpa user-agent mentah, tanpa cookie lintas situs.
2. Rancang agregasi harian `analytics_daily` supaya dashboard tidak menghitung ulang
   jutaan baris.
3. Buat endpoint penerima event dengan rate limit + filter bot (user-agent crawler).
4. Isi `view_count` artikel lewat jalur yang benar (bukan update langsung dari klien).
5. Uji: event masuk, bot tersaring, agregasi benar.

**O — Output.** Migrasi + endpoint + agregasi + test. Laporkan volume baris yang
dihasilkan per 1.000 kunjungan (bukti bahwa desainnya tidak boros).

### Prompt 1.2 — Metrik Definition Engineer

**Role:** Analytics engineer + product manager.

**G — Goal.** Setiap metrik punya definisi tertulis yang tidak bisa ditafsirkan ganda.

**A — Action.** Tulis `docs/marketplace/10-definisi-metrik.md` berisi, untuk setiap
metrik: nama, definisi satu kalimat, rumus, sumber data, periode, dan pengecualian
(mis. bot, karyawan sendiri). Minimal: kunjungan, pengunjung unik, konversi, funnel
step, bounce, waktu baca, artikel terpopuler, halaman bermasalah SEO.

**O — Output.** Dokumen definisi. **Gerbang:** tanpa ini, angka di dashboard bisa
berarti berbeda bagi tiap orang.

---

## FASE 2 — Tiga Modul (bisa paralel setelah Fase 1)

### Prompt 2.1 — SEO Audit Engineer

**Role:** SEO engineer + backend engineer. Tidak butuh API eksternal.

**G — Goal.** Sistem memeriksa halaman sendiri dan melaporkan masalah on-page.

**C — Context.** Sitemap dinamis sudah ada. Structured data ada di 5 halaman.
SEO settings punya 12 field. Tidak ada alat audit.

**A — Action.**
1. Rancang pemeriksaan: title (panjang, unik), description (panjang, unik), H1 (satu
   per halaman), alt gambar, canonical, robots meta, structured data valid.
2. Bangun job yang memeriksa halaman nyata (bukan menebak) — ambil dari sitemap.
3. Simpan hasil ke `seo_audit_results` dengan waktu pemeriksaan.
4. Tampilkan: halaman bermasalah, jenis masalah, saran perbaikan.
5. Uji dengan halaman yang sengaja dibuat bermasalah.

**O — Output.** Job audit + tabel + test. Laporkan berapa halaman diperiksa dan
berapa masalah ditemukan (angka nyata, bukan contoh).

### Prompt 2.2 — Content Workflow Engineer

**Role:** CMS/editorial engineer + frontend engineer.

**G — Goal.** Alur editorial dari ide sampai terbit, terlihat dan bisa dilacak.

**C — Context.** Tabel `articles` punya `status` (draft/published) dan `author_id`.
Belum ada kalender, review, atau board.

**A — Action.**
1. Perluas status editorial (aditif): `idea, outline, draft, review, ready, published,
   archived`. Pastikan artikel lama tetap sah.
2. Tabel `article_status_history` (siapa, kapan, dari→ke) untuk audit.
3. Kalender konten: tampilan bulan dengan jadwal terbit.
4. Board/kanban per status untuk melihat antrean.
5. Checklist pra-terbit: SEO title, description, cover, minimal satu tag, tautan internal.

**O — Output.** Migrasi + UI board/kalender + riwayat status + test.

### Prompt 2.3 — Campaign & Attribution Engineer

**Role:** Growth engineer + backend engineer.

**G — Goal.** Tahu kanal mana yang menghasilkan uang, bukan hanya klik.

**C — Context.** Tidak ada UTM, tidak ada kampanye. Tapi `orders` punya jejak
`user_id` dan waktu — jadi atribusi bisa dibangun dari event kunjungan pertama.

**A — Action.**
1. Tabel `campaigns` (nama, kanal, UTM, periode, status).
2. UTM builder yang menghasilkan tautan siap pakai.
3. Atribusi: hubungkan kunjungan (session_hash) ke order yang terjadi setelahnya.
4. Laporkan konversi per kanal: kunjungan → checkout → bayar, plus nilai transaksi.
5. **Nyatakan batas:** atribusi berbasis sesi tidak sempurna; tulis keterbatasannya.

**O — Output.** Tabel + builder + laporan konversi + pernyataan batas metode.

---

## FASE 3 — Dashboard (setelah Fase 1 & 2)

### Prompt 3.1 — Dashboard Shell Engineer

**Role:** Senior frontend engineer (design system).

**G — Goal.** Shell dashboard yang **sama persis gayanya** dengan admin existing.

**C — Context.** Admin punya `admin-nav.ts` (7 grup), `admin/route.tsx` (371 baris),
`admin-ui.tsx`, `tx-ui.tsx`, `report-charts.tsx`. Token warna di `styles.css`.

**A — Action.**
1. **Baca dulu** komponen admin yang ada; pakai ulang `AdminPageHeader`, `DetailCard`,
   `StatTile`, pola navigasi. Jangan bikin sistem komponen baru.
2. Buat navigasi grup baru (Marketing / Konten / SEO) dengan pola `adminNav` yang sama,
   termasuk penanda `available` untuk modul yang belum jadi.
3. Permission per bagian: marketing, konten, SEO terpisah.
4. State wajib: loading, kosong (dengan sebab + langkah), error (dengan cara pulih).
5. Uji: mobile 390px, keyboard, kontras, tanpa overflow.

**O — Output.** Shell + navigasi + test. **Bukti wajib:** tangkapan layar atau hasil
ukur yang menunjukkan gaya identik dengan admin.

### Prompt 3.2 — Marketing Analytics Engineer

**Role:** Frontend engineer (data viz) + analytics engineer.

**G — Goal.** Menjawab M1-M8 (dokumen riset §2.1) dengan data nyata.

**A — Action.**
1. Untuk setiap pertanyaan, tulis dulu **pertanyaan itu sebagai judul** panel.
   Grafik tanpa pertanyaan = hiasan (dilarang).
2. Pakai `report-charts.tsx` yang ada. Jangan tambah library chart baru.
3. Setiap angka menautkan sumbernya (periode, filter, pengecualian).
4. Bila data belum cukup, tampilkan keadaan kosong yang menjelaskan cara mengisinya.
5. Uji: bandingkan angka dashboard dengan query manual ke database — harus sama.

**O — Output.** Panel + test perbandingan angka. Laporkan selisih bila ada.

### Prompt 3.3 — Content Performance Engineer

**Role:** Frontend engineer + content strategist.

**A — Action.** Panel performa per artikel: views (dari data nyata), waktu baca,
sumber kunjungan, tren. Plus beban kerja penulis. Sama seperti 3.2: setiap panel
menjawab satu pertanyaan dari C1-C7.

### Prompt 3.4 — SEO Dashboard Engineer

**Role:** Frontend engineer + SEO engineer.

**A — Action.** Panel SEO: ringkasan masalah, daftar halaman bermasalah, tren dari
waktu ke waktu, plus pemetaan halaman → keyword target. Sumber: `seo_audit_results`
dari Prompt 2.1.

---

## FASE 4 — Verifikasi (WAJIB, bukan opsional)

### Prompt 4.1 — QA & Accessibility Engineer

**Role:** QA engineer + accessibility specialist.

**A — Action.**
1. Uji setiap panel: apakah angkanya cocok dengan query manual? Laporkan selisih.
2. Uji aksesibilitas: keyboard penuh, kontras WCAG AA, label benar, grafik punya
   alternatif teks.
3. Uji batas: data 0, data sangat banyak, rentang tanggal aneh, izin ditolak.
4. Uji mobile 390px untuk setiap panel.
5. Laporkan yang **gagal**, bukan hanya yang lulus.

**O — Output.** Laporan per panel dengan status jujur per butir.

### Prompt 4.2 — Security & Privacy Reviewer

**Role:** Security engineer.

**A — Action.**
1. Pastikan marketing/konten/SEO tidak bisa membaca tabel keuangan (uji negatif nyata).
2. Pastikan tracking tidak menyimpan data pribadi (periksa isi tabel).
3. Pastikan endpoint tracking tidak bisa dipakai membanjiri database (rate limit).
4. Uji: akses lintas peran, endpoint tanpa autentikasi, payload besar.

**O — Output.** Laporan dengan bukti uji negatif (bukan asumsi).

---

## Daftar 12 Role Engineer

| # | Role | Fase | Tanggung jawab inti |
|---|---|---|---|
| 1 | Product strategist | 0 | Keputusan bentuk dashboard & ruang lingkup |
| 2 | Engineering lead | 0, 3.1 | Arsitektur, konsistensi dengan sistem existing |
| 3 | Senior backend engineer | 1.1, 2.3 | Skema, transaksi, performa penulisan event |
| 4 | Data engineer | 1.1 | Agregasi, retensi, biaya penyimpanan |
| 5 | Analytics engineer | 1.2, 3.2 | Definisi metrik, kebenaran angka |
| 6 | SEO engineer | 2.1, 3.4 | Audit on-page, structured data, sitemap |
| 7 | CMS/editorial engineer | 2.2 | Alur status, kalender, review |
| 8 | Growth engineer | 2.3 | Kampanye, UTM, atribusi |
| 9 | Senior frontend engineer | 3.1, 3.2, 3.3, 3.4 | Shell, panel, konsistensi visual |
| 10 | Accessibility specialist | 3.1, 4.1 | Keyboard, kontras, pembaca layar |
| 11 | QA engineer | 4.1 | Uji batas, perbandingan angka |
| 12 | Security & privacy engineer | 4.2 | Isolasi akses, privasi tracking |

**Catatan pembagian:** role 3 dan 4 sengaja dipisah — backend menulis event dengan
benar, data engineer memastikan biaya penyimpanannya tidak meledak. Dua kekhawatiran
berbeda yang sering digabung lalu terlupakan salah satunya.

---

## Gerbang Kualitas (harus lulus sebelum lanjut antar fase)

| Gerbang | Syarat |
|---|---|
| G0 → G1 | Tiga keputusan Owner (O-20, O-21, O-22) tercatat |
| G1 → G2 | Tracking terbukti mencatat event nyata + definisi metrik tertulis |
| G2 → G3 | Ketiga modul punya data nyata (bukan tabel kosong) |
| G3 → G4 | Dashboard menampilkan angka yang **sama** dengan query manual |
| G4 → selesai | Laporan QA + security dengan status jujur per butir |

**Aturan tegas:** dashboard tidak boleh dibangun sebelum G1 lulus. Layar tanpa data
adalah pekerjaan sia-sia, dan mengisinya dengan angka contoh adalah pelanggaran
aturan anti-slop.

---

## Yang DILARANG (langsung gagal)

- Dashboard berisi angka contoh atau "data demo"
- Grafik tanpa pertanyaan yang dijawab
- Stat card dengan delta tren tanpa seri data di belakangnya
- Metrik tanpa definisi tertulis
- Emoji, gradien default, glow berlebihan di UI
- Melacak data pribadi pengunjung
- Marketing bisa melihat data keuangan
- Mengklaim "selesai" tanpa bukti uji
- Menambah library chart/warna baru di luar yang sudah dipakai admin
