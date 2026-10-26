# 12 — Definisi Metrik Dashboard Pertumbuhan

Tanggal: 2026-10-05 · Status: **BERLAKU** · Dasar: [riset dashboard](../audit/2026-10-05-riset-dashboard-marketing-konten-seo.md)

Tujuan dokumen ini: supaya satu angka di dashboard **tidak punya dua arti**.
Tanpa definisi tertulis, "konversi" bisa berarti tiga hal berbeda bagi tiga orang.

Aturan umum yang berlaku untuk SEMUA metrik:

1. **Bot dikecualikan.** User-agent yang cocok pola bot/crawler tidak dihitung.
2. **Hari mengikuti zona WIB** (Asia/Makassar), bukan UTC.
3. **Periode selalu disebut** saat angka ditampilkan.
4. **Tidak ada angka contoh.** Bila data belum ada, tampilkan keadaan kosong.
5. **Pengunjung diwakili hash sesi harian**, bukan identitas orang. Hash berganti
   setiap hari, jadi tidak ada pelacakan lintas hari.

---

## 1. Metrik Kunjungan

| Metrik | Definisi | Rumus | Sumber | Pengecualian |
|---|---|---|---|---|
| **Kunjungan** (page_views) | Jumlah halaman dibuka | `count(*)` event `page_view` | `analytics_events` → `analytics_daily.page_views` | Bot; halaman sendiri oleh staf tidak dikeluarkan (belum ada penandanya) |
| **Pengunjung unik** (unique_visitors) | Jumlah sesi berbeda dalam sehari | `count(DISTINCT session_hash)` | `analytics_daily.unique_visitors` | Bot; satu orang dua perangkat dihitung dua (batas metode) |
| **Sumber kunjungan** (sources) | Asal pengunjung | `utm_source` bila ada, jika tidak host referrer, jika tidak "langsung" | `analytics_daily.sources` | Referrer dari domain sendiri dianggap "langsung" (navigasi internal) |
| **Halaman terpopuler** (top_pages) | Path dengan kunjungan terbanyak | `count(*)` group by `path` | `analytics_daily.top_pages` | Query string dan hash dibuang dari path |

**Batas yang perlu diketahui:** "pengunjung unik" berbasis hash sesi harian, jadi
orang yang mengunjungi dua hari dihitung dua kali. Ini **disengaja** untuk privasi.

---

## 2. Metrik Konversi (Funnel)

Funnel dihitung dari **dua sumber berbeda**, dan itu disengaja:

| Langkah | Definisi | Sumber | Kenapa sumber itu |
|---|---|---|---|
| **Melihat produk** | Halaman produk dibuka | Event `product_view` (klien) | Browser yang tahu halaman dibuka |
| **Mulai checkout** | Form checkout dibuka | Event `checkout_start` (klien) | Browser yang tahu pembeli menekan tombol |
| **Pembayaran berhasil** | Pembayaran benar-benar lunas | Event `payment_success` (**server**) | Hanya server yang tahu uang masuk |

**Kenapa `payment_success` dari server:** bila dari klien, siapa pun bisa mengirim
event itu lewat DevTools dan menggelembungkan angka konversi. Server tidak bisa
dibohongi.

**Batas metode:**
- `payment_success` memakai penanda sesi `server`, jadi **tidak dihitung** sebagai
  pengunjung unik. Ia hanya peristiwa konversi.
- Karena itu, **konversi per kanal tidak bisa dihitung langsung** dari event ini.
  Untuk atribusi per kanal, dipakai penghubung ke tabel `orders` (Fase 2).

### Rasio konversi

| Metrik | Rumus | Catatan |
|---|---|---|
| **Konversi checkout** | `payment_success / checkout_start` | Angka per periode, bukan per orang |
| **Konversi kunjungan** | `payment_success / page_views` | Hanya indikatif; bukan tingkat konversi per pengunjung |

**Dinyatakan tegas:** kedua rasio ini **bukan** tingkat konversi per pengunjung,
karena penyebut dan pembilang berasal dari sumber berbeda (klien vs server).
Menyebutnya "conversion rate" tanpa penjelasan ini adalah menyesatkan.

---

## 3. Metrik Konten

| Metrik | Definisi | Rumus | Sumber | Pengecualian |
|---|---|---|---|---|
| **Dibaca** (views) | Artikel dibuka pembaca nyata | `articles.view_count` | RPC `record_article_view` | Bot tidak menaikkan (diperiksa di endpoint) |
| **Artikel terpopuler** | Artikel dengan views terbanyak | `order by view_count desc` | `articles` | Artikel terarsip tidak ditampilkan |
| **Konten per status** | Jumlah artikel per status editorial | `count(*)` group by `status` | `articles` | Artikel terhapus (`deleted_at`) dikecualikan |
| **Beban penulis** | Jumlah artikel per penulis | `count(*)` group by `author_id` | `articles` | — |

**Catatan `view_count`:** sebelum 2026-10-05 kolom ini **tidak pernah diisi**
(bug yang sama seperti `sold_count`). Sejak migrasi `20261005120000`, angkanya naik
lewat jalur resmi saat artikel dibaca pengunjung non-bot.

---

## 4. Metrik SEO

| Metrik | Definisi | Sumber | Pengecualian |
|---|---|---|---|
| **Halaman diperiksa** | Jumlah halaman yang diaudit | `seo_audit_results` | Hanya halaman yang ada di sitemap |
| **Masalah ditemukan** | Jumlah temuan per jenis | `seo_audit_results` | Setiap jenis punya aturan tertulis |
| **Halaman bermasalah** | Halaman dengan minimal satu temuan | `seo_audit_results` | — |

**Jenis pemeriksaan dan aturannya** (ditetapkan di Fase 2.1):
title (ada, 30-60 karakter, unik), description (ada, 70-160 karakter, unik),
H1 (tepat satu per halaman), alt gambar (ada untuk gambar konten),
canonical (ada), robots meta (tidak memblokir halaman yang seharusnya diindeks),
structured data (JSON valid).

**Yang TIDAK diukur sekarang:** peringkat kata kunci dan trafik pencarian. Keduanya
butuh integrasi Search Console API (fase lanjut, keputusan Owner). Dilarang
menampilkan "peringkat" yang datanya tidak ada.

---

## 5. Metrik yang DILARANG ditampilkan

Dilarang karena datanya belum ada atau tidak bisa dipercaya:

| Metrik | Alasan |
|---|---|
| Tingkat konversi per pengunjung | Penyebut/pembilang beda sumber (lihat §2) |
| Peringkat kata kunci | Butuh Search Console API |
| Trafik pencarian organik | Butuh Search Console API |
| Biaya akuisisi (CAC) | Butuh data belanja iklan |
| ROI kampanye | Butuh data belanja iklan |
| "Pertumbuhan %" tanpa periode pembanding | Delta karangan (R-38) |

Bila Owner ingin salah satunya, itu menjadi slice baru dengan sumber data yang
jelas, bukan ditambahkan sebagai angka kosong di dashboard.

---

## 6. Retensi Data (O-23)

| Data | Retensi | Alasan |
|---|---|---|
| `analytics_events` (mentah) | **90 hari**, dihapus otomatis oleh `job_purge_analytics` | Menjaga ukuran database; detail lama jarang dibutuhkan |
| `analytics_daily` (agregat) | **Permanen** | Ringan, dan tren jangka panjang butuh data lama |

Konsekuensi: setelah 90 hari, detail per kunjungan hilang tapi **angka harian tetap
ada**. Dashboard tetap bisa menampilkan tren setahun.

---

## 7. Yang harus diuji setiap kali metrik berubah

1. Apakah bot benar-benar dikecualikan? (uji dengan user-agent bot)
2. Apakah agregasi idempoten? (jalankan dua kali, angka tidak boleh dobel)
3. Apakah `view_count` benar-benar naik? (bukan hanya kolom yang ada)
4. Apakah konversi hanya dari server? (uji: kirim `payment_success` dari klien,
   harus ditolak skema)
5. Apakah angka dashboard sama dengan query manual ke database?
