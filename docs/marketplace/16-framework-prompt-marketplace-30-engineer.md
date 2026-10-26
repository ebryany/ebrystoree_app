# 16 — Framework Prompt MGRCAO V3: Sistem Desain Marketplace — Tim 30 Engineer

Tanggal: 2026-10-05 · Basis riset: [`../audit/2026-10-05-riset-uiux-marketplace.md`](../audit/2026-10-05-riset-uiux-marketplace.md)
Status: **SIAP DIPAKAI — MENUNGGU KEPUTUSAN OWNER (W-01..W-08)**

---

## Cara memakai dokumen ini

Paket prompt berlapis untuk membangun **sistem desain marketplace** dari nol. Bukan
menambal komponen yang ada, tapi menetapkan satu bahasa lalu menerapkannya.

Alur: **Fase 0 (keputusan) → Fase 1 (token & fondasi) → Fase 2 (anatomi kartu) →
Fase 3 (halaman) → Fase 4 (keadaan & data) → Fase 5 (verifikasi)**.

Kontrak **MGRCAO V3** (M/G/R/C/A/O) di setiap prompt. 30 engineer tersebar di 6 fase.

**Kenapa 30 role, bukan 5:** riset menemukan masalah Ebrystore bukan satu bug, tapi
**tidak adanya sistem**. Setiap komponen menebak ukurannya sendiri, sehingga kartu
produk dan kartu jasa punya struktur berbeda. Memperbaiki satu kartu tanpa menetapkan
sistem akan menghasilkan komponen baru yang kembali menebak. 30 role memecah pekerjaan
sampai ke unit yang bisa diperiksa satu per satu.

---

## Aturan Non-Negosiasi (SEMUA prompt)

1. **Harga selalu di posisi yang sama** (ZONA 4) di semua kartu. Ini temuan eyetracking
   NN/g, bukan preferensi. (Riset §1.4)
2. **Satu anatomi kartu** untuk semua varian: media, identitas, meta, harga, aksi.
3. **Kartu harus ringkas.** Detail masuk halaman detail, bukan kartu. (Riset §1.1 no.2)
4. **Tanpa border/latar jelas, bukan kartu.** (Prinsip common regions, §1.5)
5. **Token saja.** Tidak ada warna, radius, ukuran, atau bayangan di luar token.
6. **Keadaan kosong dirancang**, bukan dibiarkan. Data Ebrystore sekarang hampir
   semuanya kosong (riset §5.2).
7. **Jangan hapus fungsi.** Setiap perubahan menjaga fungsi yang ada.
8. **Ukur sebelum/sesudah.** Klaim tanpa angka tidak diterima.
9. **Anti-slop.** Tanpa emoji, gradien dekoratif, glow, atau bayangan bertumpuk.
10. **Tidak ada agent, tidak ada browser.** Verifikasi lewat pembacaan kode dan ukuran
    nilai kelas. (Arahan Owner)

---

## FASE 0 — Keputusan Owner

**Role 1: Product strategist** · **Role 2: Design system lead**

**M — Mindset.** Delapan keputusan menentukan seluruh sistem. Yang paling menentukan:
apakah bahasa desain diubah total atau ditambal.

**G — Goal.** Jawaban tegas W-01..W-08, tercatat di `02-decision-register.md`.

**R — Riset/Basis.** Riset §7. Temuan kunci: kartu Ebrystore sekarang melanggar tiga
aturan NN/g (harga tidak konsisten, struktur berbeda, kartu terlalu penuh).

**C — Context.** 2 produk (dua-duanya "template"), 13 kategori jasa, 0 kategori produk,
1 review. Hampir semua keadaan kosong akan terlihat.

**A — Action.** Ajukan W-01..W-08, catat jawaban dengan alasan.

**O — Output.** Delapan baris keputusan. **Gerbang G0** sebelum Fase 1.

---

## FASE 1 — Token & Fondasi (4 engineer)

### Prompt 1.1 — Design Token Architect

**Role 3: Design token architect**

**M.** Token adalah kontrak. Selama token kartu tidak ada, setiap komponen menebak.

**G.** Token kartu lengkap sesuai riset §3.2.

| Aspek | Target |
|---|---|
| Masalah | Tidak ada token khusus kartu (riset D-1) |
| Target | Token media-ratio, radius, pad, gap, title-lines, price-size, price-weight |
| Acceptance | 1) semua token terdefinisi di `styles.css`; 2) tidak ada nilai keras di komponen kartu; 3) terdokumentasi peranannya |

**A.** Tambahkan token di `:root` dan `.dark`. Beri komentar satu baris per token.
Jangan ubah token existing.

**O.** `styles.css`. **Bukti:** daftar token baru + alasannya.

---

### Prompt 1.2 — Grid & Spacing Engineer

**Role 4: Layout grid engineer**

**M.** Kerapatan grid menentukan berapa banyak yang terlihat tanpa menggulir. NN/g:
semakin banyak terlihat, semakin ringan beban ingatan pengguna.

**G.** Skala kerapatan sesuai riset §4.2.

| Acceptance | 1) kolom 2/3/4/5 pada 390/768/1280/1920; 2) jarak antar kartu konsisten; 3) tidak ada overflow di 390px |

**A.** Buat helper kelas grid (satu fungsi), bukan mengulang kelas di tiap halaman.

**O.** Helper grid + pemakaiannya. **Bukti:** tabel kolom per breakpoint.

---

### Prompt 1.3 — Color Role Engineer

**Role 5: Color system engineer**

**M.** Warna punya peran, bukan selera. Harga, diskon, dan status punya warna sendiri.

**G.** Warna peran sesuai riset §3.3.

| Acceptance | 1) harga selalu `text-price`; 2) diskon `bg-accent`; 3) kontras WCAG AA; 4) tidak ada warna baru |

**A.** Petakan peran ke token existing. Uji kontras untuk teks di atas `bg-accent`.

**O.** Peta warna + hasil kontras.

---

### Prompt 1.4 — Typography Scale Engineer

**Role 6: Typography engineer**

**M.** Skala huruf dalam kartu menentukan keterbacaan dan kerapatan sekaligus.

**G.** Skala sesuai riset §3.4.

| Acceptance | 1) judul 2 baris maks; 2) harga `tabular-nums`; 3) tidak ada teks pecah di 390px; 4) hierarki jelas tanpa bold berlebihan |

**A.** Terapkan skala di komponen kartu. Jangan ubah token global.

**O.** Komponen kartu + tabel ukuran. **Bukti:** ukuran sebelum/sesudah.

---

## FASE 2 — Anatomi Kartu (6 engineer)

### Prompt 2.1 — Card Anatomy Engineer

**Role 7: Component architect**

**M.** Lima zona tetap. Semua varian memakai urutan yang sama supaya bisa dibandingkan.

**G.** Kerangka 5 zona sesuai riset §3.1.

| Acceptance | 1) zona urut media→identitas→meta→harga→aksi; 2) tinggi blok harga sama di semua varian; 3) tidak ada informasi di luar 5 zona |

**A.** Buat kerangka dasar yang bisa dipakai semua varian. Jangan menyalin-tempel.

**O.** Komponen dasar. **Bukti:** struktur zona per varian.

---

### Prompt 2.2 — Product Card Engineer

**Role 8: Frontend engineer (product)**

**M.** Kartu produk adalah yang paling sering dilihat. Harus paling rapi.

**G.** Kartu produk sesuai ZONA 1-5, media 3/2, tanpa aksi tombol (stretched-link).

| Acceptance | 1) klik di mana pun membuka detail; 2) harga di ZONA 4; 3) tanpa gambar → inisial; 4) badge `-90%` |

**A.** Terapkan kerangka Prompt 2.1. Media 3/2 (lebih pendek dari 4/3). Tanpa gambar:
inisial nama, bukan ikon generik.

**O.** `catalog-cards.tsx`. **Bukti:** markup per zona.

---

### Prompt 2.3 — Service Card Engineer

**Role 9: Frontend engineer (service)**

**M.** Kartu jasa sekarang paling penuh (ada accordion kesepakatan). NN/g: kartu harus
ringkas, detail di halaman terpisah.

**G.** Kartu jasa sesuai ZONA 1-5, media 16/9, harga di ZONA 4 (sama seperti produk).

| Acceptance | 1) accordion dipindah ke halaman detail; 2) harga di ZONA 4; 3) durasi+revisi di ZONA 3; 4) tinggi sebanding kartu produk |

**A.** Pindahkan isi kesepakatan ke halaman detail. Sisakan ringkasan di kartu.

**O.** `seller-service-card.tsx` + halaman detail. **Bukti:** tinggi kartu sebelum/sesudah.

---

### Prompt 2.4 — Category Card Engineer

**Role 10: Frontend engineer (category)**

**M.** 13 kategori jasa tidak punya jalan masuk di home. Tapi panel besar membuat halaman
berat (sudah dicoba, Owner menolak).

**G.** Kartu kategori ringan sesuai W-07.

| Acceptance | 1) tidak menambah beban render; 2) jumlah item tampil; 3) bisa digeser di mobile |

**A.** Buat versi ringan: baris ikon + nama, tanpa panel besar.

**O.** Komponen kategori. **Bukti:** jumlah elemen DOM.

---

### Prompt 2.5 — Store Card Engineer

**Role 11: Frontend engineer (store)**

**M.** Kartu toko dipakai di halaman toko dan daftar seller.

**G.** Varian kartu toko memakai kerangka yang sama.

**A.** Avatar + nama + jumlah produk, urutan ZONA 1-5.

**O.** Komponen toko. **Bukti:** perbandingan dengan kartu produk.

---

### Prompt 2.6 — Card Skeleton Engineer

**Role 12: Frontend engineer (loading)**

**M.** Kerangka muat harus menyerupai kartu akhir, bukan kotak abu-acak. Kalau berbeda,
tata letak melompat saat data masuk.

**G.** Skeleton dengan tinggi dan proporsi sama persis dengan kartu asli.

| Acceptance | 1) tinggi skeleton = tinggi kartu; 2) tidak ada pergeseran tata letak; 3) `motion-reduce` dihormati |

**A.** Ukur tinggi kartu nyata, samakan skeleton.

**O.** Komponen skeleton. **Bukti:** perbandingan tinggi.

---

## FASE 3 — Halaman (6 engineer)

### Prompt 3.1 — Home Layout Engineer
**Role 13.** Susun home: hero, review, produk, jasa, cara kerja, seller. **Acceptance:**
produk pertama < 1.500px; setiap section punya satu tujuan.

### Prompt 3.2 — Product List Engineer
**Role 14.** `/produk` jadi daftar + filter sesuai W-03. **Acceptance:** bisa pindah
tampilan kartu/daftar; filter kategori, harga, toko berfungsi.

### Prompt 3.3 — Service List Engineer
**Role 15.** `/layanan` sama seperti 3.2. **Acceptance:** filter kategori jasa (13
kategori), durasi, harga.

### Prompt 3.4 — Product Detail Engineer
**Role 16.** Halaman detail produk: galeri, harga, toko, tombol beli. **Acceptance:**
informasi yang dipindah dari kartu muncul di sini.

### Prompt 3.5 — Service Detail Engineer
**Role 17.** Halaman detail jasa: kesepakatan lengkap (dipindah dari kartu), durasi,
revisi, tombol chat + pesan. **Acceptance:** semua isi accordion lama pindah ke sini.

### Prompt 3.6 — Store Page Engineer
**Role 18.** Halaman toko: header toko, produk, jasa, review. **Acceptance:** kartu
memakai kerangka yang sama.

---

## FASE 4 — Keadaan & Data (8 engineer)

### Prompt 4.1 — Empty State Engineer
**Role 19.** Keadaan kosong sesuai riset §5.1. **Acceptance:** 0 kategori → section
tidak dirender; 0 produk → penjelasan + tautan, bukan angka 0 besar.

### Prompt 4.2 — Image Fallback Engineer
**Role 20.** Tanpa gambar → inisial nama. **Acceptance:** tidak ada ikon generik besar;
kartu tetap punya identitas visual.

### Prompt 4.3 — Price Display Engineer
**Role 21.** Aturan harga: valid → tampil; tidak valid → "Lihat harga"; diskon → harga
asal dicoret di samping. **Acceptance:** tidak pernah "Rp 0" atau "RpNaN".

### Prompt 4.4 — Filter & Sort Engineer
**Role 22.** Filter dan urutan untuk halaman daftar. **Acceptance:** filter bisa
dikombinasikan; hasil kosong punya penjelasan.

### Prompt 4.5 — Search Result Engineer
**Role 23.** Hasil pencarian menampilkan kata kunci dan jumlah hasil. **Acceptance:**
hasil kosong menawarkan kata kunci lain.

### Prompt 4.6 — Pagination Engineer
**Role 24.** Halaman banyak: nomor halaman + jumlah. **Acceptance:** posisi scroll wajar
setelah pindah halaman.

### Prompt 4.7 — Data Quality Reporter
**Role 25.** Laporkan masalah data (nama duplikat "template"). **Acceptance:** masalah
data dicatat, TIDAK "diperbaiki" dengan mengubah teks di UI.

### Prompt 4.8 — Mobile Layout Engineer
**Role 26.** Tata letak mobile 390px. **Acceptance:** 2 kolom; target sentuh >= 44px;
tidak ada overflow.

---

## FASE 5 — Verifikasi (4 engineer)

### Prompt 5.1 — Visual Consistency Auditor
**Role 27.** Periksa semua kartu memakai kerangka sama. **Acceptance:** harga di posisi
sama di semua kartu; tidak ada varian yang menyimpang.

### Prompt 5.2 — Accessibility Engineer
**Role 28.** Target sentuh, kontras, fokus, `aria`. **Acceptance:** >= 44px; WCAG AA;
fokus terlihat; stretched-link tetap bisa di-Tab.

### Prompt 5.3 — Regression Guard
**Role 29.** Periksa fungsi utuh setelah perubahan. **Acceptance:** semua fungsi lama
masih ada; tidak ada animasi yang berubah tanpa keputusan.

### Prompt 5.4 — Anti-Slop Reviewer
**Role 30.** Periksa kejujuran isi. **Acceptance:** tanpa klaim tanpa dasar; tanpa
keadaan kosong yang menyesatkan; tanpa pola template.

---

## Daftar 30 Engineer

| # | Role | Fase |
|---|---|---|
| 1 | Product strategist | 0 |
| 2 | Design system lead | 0 |
| 3 | Design token architect | 1.1 |
| 4 | Layout grid engineer | 1.2 |
| 5 | Color system engineer | 1.3 |
| 6 | Typography engineer | 1.4 |
| 7 | Component architect | 2.1 |
| 8 | Frontend engineer (product) | 2.2 |
| 9 | Frontend engineer (service) | 2.3 |
| 10 | Frontend engineer (category) | 2.4 |
| 11 | Frontend engineer (store) | 2.5 |
| 12 | Frontend engineer (loading) | 2.6 |
| 13 | Home layout engineer | 3.1 |
| 14 | Product list engineer | 3.2 |
| 15 | Service list engineer | 3.3 |
| 16 | Product detail engineer | 3.4 |
| 17 | Service detail engineer | 3.5 |
| 18 | Store page engineer | 3.6 |
| 19 | Empty state engineer | 4.1 |
| 20 | Image fallback engineer | 4.2 |
| 21 | Price display engineer | 4.3 |
| 22 | Filter & sort engineer | 4.4 |
| 23 | Search result engineer | 4.5 |
| 24 | Pagination engineer | 4.6 |
| 25 | Data quality reporter | 4.7 |
| 26 | Mobile layout engineer | 4.8 |
| 27 | Visual consistency auditor | 5.1 |
| 28 | Accessibility engineer | 5.2 |
| 29 | Regression guard | 5.3 |
| 30 | Anti-slop reviewer | 5.4 |

**Catatan pembagian.** Role 3-6 memisahkan fondasi (token, grid, warna, huruf) karena
kesalahan di sini menular ke semua komponen. Role 8-11 memisahkan per jenis kartu karena
setiap jenis punya kebutuhan data berbeda. Role 19-21 memisahkan keadaan kosong, gambar,
dan harga karena ketiganya adalah tempat komponen paling sering terlihat buruk dengan
data sedikit, dan data Ebrystore sekarang memang sedikit.

---

## Gerbang Kualitas

| Gerbang | Syarat |
|---|---|
| G0 → G1 | W-01..W-08 tercatat |
| G1 → G2 | Token kartu lengkap; tidak ada nilai keras di komponen |
| G2 → G3 | Semua varian kartu memakai 5 zona; harga di posisi sama |
| G3 → G4 | Halaman tersusun; detail menerima isi yang dipindah dari kartu |
| G4 → G5 | Keadaan kosong baku; tidak ada angka palsu |
| G5 → selesai | Laporan konsistensi + aksesibilitas + regression jujur |

**Aturan tegas:** Fase 2 tidak dimulai sebelum Fase 1 lulus. Membuat kartu tanpa token
berarti setiap kartu kembali menebak ukurannya sendiri.

---

## Yang DILARANG (langsung gagal)

- Harga di posisi berbeda antar kartu
- Kartu tanpa border/latar jelas
- Kartu memuat lebih dari 5 zona (harus ringkas)
- Accordion besar di dalam kartu
- Angka "0" besar untuk keadaan kosong
- Ikon generik besar saat gambar kosong
- Nilai keras (warna/ukuran/radius) di komponen
- Warna, radius, bayangan di luar token
- Emoji, gradien dekoratif, glow, bayangan bertumpuk
- Mengubah animasi tanpa keputusan Owner
- Menghapus fungsi yang ada
- Klaim "selesai" tanpa bukti ukur
- Menjalankan agent atau browser
