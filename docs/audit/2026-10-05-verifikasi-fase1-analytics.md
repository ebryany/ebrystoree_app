# Verifikasi Fase 1: Fondasi Analytics Dashboard Pertumbuhan

Tanggal: 2026-10-05 · Rencana: [`../marketplace/11-rencana-mgrcao-v3-dashboard-marketing-konten-seo.md`](../marketplace/11-rencana-mgrcao-v3-dashboard-marketing-konten-seo.md)
Framework: [`../marketplace/10-framework-prompt-dashboard-marketing-konten-seo.md`](../marketplace/10-framework-prompt-dashboard-marketing-konten-seo.md)
Status: **FASE 1 SELESAI — VERIFIED DI PRODUKSI**

---

## 1. Yang dikerjakan (sesuai scope Fase 1)

| # | Item | Status |
|---|---|---|
| 1 | Keputusan O-20/O-21/O-22/O-23 dicatat di decision register | SELESAI |
| 2 | Migrasi `analytics_events` + `analytics_daily` + 5 fungsi + 2 cron | TERPASANG |
| 3 | Jalur penulisan `view_count` artikel (bug lama: kolom ada, tidak pernah diisi) | SELESAI |
| 4 | Endpoint tracking dengan filter bot + rate limit + tanpa data pribadi | SELESAI |
| 5 | Tracking terpasang di 6 titik (root page_view, artikel, produk, jasa, 2 checkout) | SELESAI |
| 6 | `payment_success` dari **server** (tidak bisa dipalsukan klien) | SELESAI |
| 7 | Dokumen definisi metrik (`12-definisi-metrik.md`) | SELESAI |
| 8 | Test unit aturan analitik | 10/10 LULUS |
| 9 | Deploy ke VPS + uji tracking nyata | VERIFIED |

**Di luar scope yang sengaja tidak dikerjakan:** dashboard UI (Fase 3), SEO audit
(Fase 2.1), alur editorial (Fase 2.2), kampanye/atribusi (Fase 2.3).

---

## 2. Bukti database

### 2.1 Fungsi analytics (uji dalam transaksi ROLLBACK)

| Uji | Hasil |
|---|---|
| `record_article_view` dipanggil 2× | `view_count` 1 → 2 (naik benar) |
| Agregasi 7 event (1 bot) | `page_views: 6` (bot dikecualikan) |
| Pengunjung unik | 2 (dari 2 hash sesi berbeda, bukan 6 event) |
| Sumber terdeteksi | `sources:google.com: 2`, `sources:instagram: 1` |
| Funnel | `checkout_start: 1`, `payment_success: 1` |
| Agregasi dijalankan 2× | Total tetap 6 (idempoten, tidak dobel) |
| `purge_analytics_events(90)` | Berjalan tanpa error |

### 2.2 Verifikasi produksi (VPS, endpoint nyata)

Dikirim 2 event ke `https://app.ebrystore.my.id/api/public/analytics/track`:

| Event | User-Agent | Hasil di DB |
|---|---|---|
| `page_view /uji-deploy` | Chrome (manusia) | `is_bot: false`, `referrer_host: google.com` |
| `page_view /bot-deploy` | `Googlebot/2.1` | **`is_bot: true`** (terdeteksi) |

Keduanya merespons **HTTP 204** (sesuai desain: endpoint analitik tidak membocorkan
informasi apa pun ke pemanggil).

**Agregasi produksi:** `page_views: 1` (bot tidak masuk), `unique_visitors: 1`,
`sources:google.com: 1`, `top_pages:/uji-deploy: 1`.

Data uji sudah dibersihkan setelah verifikasi (0 event, 0 agregat tersisa).

### 2.3 Privasi terverifikasi

| Pemeriksaan | Bukti |
|---|---|
| Tidak ada IP mentah | Kolom tabel tidak memuat IP; IP hanya dipakai membuat hash lalu dibuang |
| Tidak ada user-agent tersimpan | Hanya dibaca untuk deteksi bot, tidak disimpan |
| Referrer hanya host | `https://google.com/search?q=test` tersimpan sebagai `google.com` (query dibuang) |
| Hash sesi tidak bisa dilacak | Dipotong 32 karakter, berganti setiap hari |
| Tidak ada cookie lintas situs | Tidak ada mekanisme penyimpanan di klien |

---

## 3. Bug lama yang teratasi

**`view_count` artikel tidak pernah diisi.** Kolomnya ada di tabel sejak awal, tapi
tidak ada satu pun kode yang menaikkannya. Ini pola bug yang sama dengan `sold_count`
yang ditemukan di audit sebelumnya.

Sekarang: `record_article_view(slug)` menaikkan angka, dan endpoint tracking
memanggilnya **hanya untuk pengunjung non-bot**. Terverifikasi naik 1 → 2 saat diuji.

---

## 4. Keputusan desain penting

| Keputusan | Alasan |
|---|---|
| `payment_success` dicatat **di server**, bukan klien | Klien bisa dipalsukan lewat DevTools; server tidak |
| Event checkout dicatat **di klien** | Hanya browser yang tahu pembeli menekan tombol |
| Bot disaring **di server** | Crawler yang tidak menjalankan JS tetap tertangkap |
| Endpoint selalu balas **204** | Tidak membocorkan info ke pemanggil tak sah |
| Agregasi **idempoten** (hitung ulang, bukan tambah) | Aman dijalankan berkali-kali oleh cron |
| Nama file `analytics-track.ts`, bukan `*.client.ts` | TanStack memblokir import `*.client.*` dari server environment |

---

## 5. Test & build

| Cek | Hasil |
|---|---|
| `analytics-rules.test.ts` (baru) | **10/10 lulus** |
| `smtp-config.test.ts` + `email-antislop.test.ts` | 25/25 lulus |
| `npm run test:unit` | **461 lulus** / 472; 11 gagal = baseline lama `marketplace-home.test.tsx` |
| `npx tsc --noEmit` | 7 error tersisa, semuanya pra-ada (`po-thread.tsx`, `route-fallback.test.tsx`) |
| `npx eslint` file baru | 0 error |
| `npm run build` (preset node-server) | sukses |
| Deploy ke VPS | 684 file, `.env` dipertahankan otomatis |

---

## 6. Catatan jujur

1. **Belum ada UI dashboard.** Fase 1 hanya fondasi data. Dashboard-nya Fase 3.
   Saat ini data sudah terkumpul tapi belum ada layar untuk melihatnya.
2. **`payment_success` memakai penanda sesi `server`**, jadi ia **tidak dihitung
   sebagai pengunjung unik**. Konsekuensinya: konversi per kanal belum bisa dihitung
   langsung; butuh penghubung ke `orders` (Fase 2.3). Batas ini sudah ditulis di
   dokumen definisi metrik supaya tidak salah tafsir.
3. **Kunjungan oleh staf sendiri belum dikecualikan.** Belum ada penanda "ini
   karyawan"; angka bisa sedikit lebih tinggi dari pengunjung nyata.
4. **Retensi 90 hari** berjalan lewat cron `purge_analytics` pukul 03:30. Agregat
   harian disimpan permanen.
5. **Pekerjaan SMTP admin sebelumnya** (kontrol SMTP dari UI + test kirim) juga
   ikut ter-deploy di build ini, tapi **belum diverifikasi di produksi** karena
   port SMTP masih diblokir penyedia VPS. Kodenya sudah lulus 25 test.

---

## 7. Gerbang Fase 1 → Fase 2

| Syarat gerbang | Status |
|---|---|
| Event kunjungan tercatat tanpa data pribadi | LULUS (terverifikasi produksi) |
| Bot tersaring | LULUS (Googlebot ditandai `is_bot: true`) |
| Agregasi harian jalan | LULUS (job + cron aktif) |
| `view_count` naik saat artikel dibaca | LULUS (1 → 2) |
| Definisi metrik tertulis | LULUS (`12-definisi-metrik.md`) |
| Volume agregat wajar | LULUS (agregat per hari+metrik+dimensi, bukan per event) |

**Gerbang LULUS.** Fase 2 (SEO audit, alur editorial, kampanye) boleh dimulai.
