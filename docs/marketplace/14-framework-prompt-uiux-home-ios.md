# 14 — Framework Prompt MGRCAO V3: UI/UX Home Desktop & Mobile (Arah iOS) — Tim 8 Software Engineer

Tanggal: 2026-10-05 · Basis riset: [`../audit/2026-10-05-riset-uiux-home-desktop-mobile-ios.md`](../audit/2026-10-05-riset-uiux-home-desktop-mobile-ios.md)
Status: **SIAP DIPAKAI — MENUNGGU KEPUTUSAN OWNER (U-01, U-03, U-04, U-05, U-06)**

---

## Cara memakai dokumen ini

Dokumen ini adalah **paket prompt berlapis** untuk pekerjaan UI/UX halaman home,
berdasarkan pengukuran nyata (bukan preferensi). Setiap tahap dikerjakan satu role
software engineer, dengan keluaran yang bisa diukur sebelum lanjut.

Alur: **Fase 0 (keputusan) → Fase 1 (fondasi iOS) → Fase 2 (ruang layar) →
Fase 3 (katalog & tipografi) → Fase 4 (verifikasi)**.

Kontrak **MGRCAO V3** (M/G/R/C/A/O) dipakai di setiap prompt.

**Kenapa role dipisah:** riset menemukan empat jenis pekerjaan berbeda yang sering
digabung jadi "perbaiki tampilan", lalu tidak ada yang tuntas: (a) perbaikan
kompatibilitas platform (safe area), (b) pembukaan ruang layar (header, hero),
(c) tata letak data (grid katalog), (d) sistem tipografi dan kontrol. Masing-masing
butuh keahlian dan cara ukur berbeda.

---

## Aturan Non-Negosiasi (berlaku di SEMUA prompt)

1. **Evidence-before-claim.** Setiap klaim menyebut file:baris atau hasil ukur.
   Status: `VERIFIED` / `PARTIALLY_VERIFIED` / `NOT_IMPLEMENTED` / `OWNER_DECISION_REQUIRED`.
2. **Ukur sebelum dan sesudah.** Setiap prompt wajib melampirkan angka sebelum dan
   sesudah, bukan kesan visual.
3. **Home TIDAK memakai bottom navigation.** Keputusan Owner. Komponen
   `src/components/ebry/bottom-nav.tsx` **tidak boleh diubah** dan **tidak boleh
   disambungkan** ke home. Jangan sentuh file itu sama sekali.
4. **Jangan ubah jalur yang sudah VERIFIED**: tidak ada overflow 390px, console bersih,
   struktur heading, lazy-load gambar, structured data di `index.tsx`.
5. **Mobile-first, target 393x852** (emulasi iPhone 14 Pro). Semua perubahan diuji di
   ukuran itu lebih dulu, baru desktop.
6. **Arah visual Ebrystore + iOS** (`DESIGN.md`): aksen ink-teal, low elevation,
   reduced-motion dihormati, tanpa glow/gradien dekoratif, tanpa emoji.
7. **Halaman publik = ENERGY 2 / RHYTHM 2-3 / MOTION 2.** Home bukan halaman data;
   ekspresi dibenarkan seperlunya, bukan ditumpuk.
8. **Dilarang menambah library baru.** Gunakan yang sudah terpasang: motion, recharts,
   radix/shadcn, lenis, embla.
9. **Setiap target sentuh >= 44px.** Token `--tap-min: 2.75rem` sudah ada.

---

## FASE 0 — Keputusan Owner (WAJIB SEBELUM KODE)

**Role:** Product strategist + Engineering lead

**M — Mindset.** Lima keputusan di bawah mengubah bentuk halaman. Membangun sebelum
diputuskan berarti mengukur ulang dua kali.

**G — Goal.** Jawaban tegas atas U-01, U-03, U-04, U-05, U-06, tercatat di
`docs/marketplace/02-decision-register.md`.

**R — Riset/Basis.** Riset UI/UX home §8. Angka kunci: header mobile 135px, ruang
terbuang 768px di 1920px, body 14px, tombol pill.

**C — Context.** Sudah diputuskan Owner: **home tanpa bottom nav** (U-02), dan
komponen bottom-nav yang ada tidak diubah. Safe area (U-07) adalah bug, bukan
preferensi; wajib dikerjakan.

**A — Action.** Ajukan lima pertanyaan ini dan catat jawabannya:

| # | Pertanyaan | Opsi | Rekomendasi riset |
|---|---|---|---|
| U-01 | Bahasa desain | tetap Ebrystore / condong iOS / campuran | condong iOS untuk mobile, Ebrystore untuk desktop |
| U-03 | Lebar wadah desktop | 1152 / 1280 / fluid | 1280 untuk katalog |
| U-04 | Radius tombol | pill sekarang / 8px / 12px | 8px |
| U-05 | Ukuran body | 14px / 16px | 16px |
| U-06 | Tinggi header mobile | 135px / <= 88px | <= 88px |

**O — Output.** Lima baris keputusan di register, dengan tanggal dan alasan.
**Gerbang G0:** tanpa lima jawaban ini, Fase 1 tidak dimulai.

---

## FASE 1 — Fondasi iOS (bug + target sentuh)

> Alasan urutan: safe area adalah **bug nyata** di perangkat berponi, bukan pilihan
> estetika. Target sentuh < 44px menyebabkan salah sentuh. Keduanya murah diperbaiki
> dan berdampak langsung, jadi dikerjakan lebih dulu sebelum urusan tata letak.

### Prompt 1.1 — Platform Compatibility Engineer

**Role:** Frontend engineer (platform/browser compatibility).

**M — Mindset.** Di iOS, halaman yang tidak menghormati safe area akan tertutup
home indicator atau poni. Ini bukan soal selera; WebKit sendiri menyatakan
*"some of the page's content is obscured by the device's sensor housing"*.

**G — Goal.** Halaman home aman di perangkat iOS berponi, tanpa mengubah tampilan
di perangkat tanpa inset.

| Aspek | Target |
|---|---|
| Masalah | `viewport-fit=cover` tidak diset (`__root.tsx:95`); `pb-safe` didefinisikan (`styles.css:390`) tapi 0 pemakaian di halaman publik; header `sticky top-0` tanpa padding atas aman |
| Target | (a) `viewport-fit=cover` ditambahkan; (b) `env(safe-area-inset-*)` dipakai di header dan footer halaman home; (c) di perangkat tanpa inset, tampilan **tidak berubah** |
| Acceptance | 1) meta viewport memuat `viewport-fit=cover`; 2) emulasi dengan inset bukan nol: tidak ada konten tertutup; 3) emulasi inset nol: tinggi header dan posisi konten identik dengan sebelum perubahan (selisih 0px) |

**R — Riset/Basis.** Riset §3.1 (kutipan WebKit), §1.3 I-1/I-2/I-3, §5.1.

**C — Context.** `pb-safe` sudah didefinisikan sebagai utility di `styles.css:390`
(`padding-bottom: max(env(safe-area-inset-bottom), 0px)`). `viewport` ada di
`__root.tsx:95`. Header publik di `site-header.tsx:77` (`sticky top-0`).

**A — Action.**
1. Tambahkan `viewport-fit=cover` pada meta viewport di `__root.tsx`. Periksa
   konsekuensinya di halaman lain (jangan sampai ada yang rusak).
2. Tambahkan padding atas aman di header publik:
   `padding-top: max(env(safe-area-inset-top), 0px)`. Pastikan tinggi header di
   perangkat tanpa inset **tidak berubah**.
3. Pastikan elemen yang menempel di bawah (bila ada di home) memakai `pb-safe`.
4. Uji dengan inset bukan nol dan inset nol. Laporkan kedua angka.

**O — Output.** `__root.tsx` + `site-header.tsx` (+ CSS bila perlu).
**Bukti wajib:** tabel perbandingan tinggi header & posisi konten pada inset nol dan
inset bukan nol; screenshot kedua kondisi.

**Gerbang G1a:** tidak ada konten tertutup di inset bukan nol; tampilan inset nol
tidak berubah.

---

### Prompt 1.2 — Touch Target Engineer

**Role:** Frontend engineer (accessibility & interaction).

**M — Mindset.** Target sentuh kecil adalah sumber kesalahan sentuh. NN/g:
*"it is easy to make accidental touches"*, dan target untuk sentuh harus
*"considerably larger for touch than for mouse"*.

**G — Goal.** Semua elemen interaktif di home >= 44x44px, tanpa memperbesar tampilan
secara berlebihan.

| Aspek | Target |
|---|---|
| Masalah | Terukur 4 elemen < 44px: 2 judul produk (18px), 1 tautan "Artikel" (41px), 1 skip-link |
| Target | (a) judul produk tidak lagi menjadi target terpisah; (b) "Artikel" >= 44px; (c) skip-link tetap tersembunyi sampai difokus (tidak dihitung sebagai target) |
| Acceptance | 1) ukur ulang: 0 elemen interaktif terlihat < 44px (kecuali skip-link tersembunyi); 2) tidak ada elemen baru yang menyebabkan overflow 390px |

**R — Riset/Basis.** Riset §1.2 (4 elemen terukur), §3.2 (kutipan NN/g), §5.4.

**C — Context.** Token `--tap-min: 2.75rem` (44px) dan utility `tap-target` sudah ada
di `styles.css:107` dan `:385`. Kartu produk di `catalog-cards.tsx` sudah sebagian
memakai `<Link>` pembungkus.

**A — Action.**
1. Untuk kartu produk: pastikan **seluruh kartu** adalah satu `<Link>`, dan judul di
   dalamnya bukan elemen interaktif terpisah. Jangan menambah `<Link>` di dalam `<Link>`.
2. Naikkan "Artikel" (dan tautan navigasi serupa) ke `min-h-11`.
3. Jangan mengubah skip-link; itu memang tersembunyi sampai difokus.
4. Ukur ulang seluruh elemen interaktif; laporkan sisa yang masih < 44px beserta alasan
   bila ada yang sengaja dibiarkan.

**O — Output.** Komponen kartu + header/nav yang relevan.
**Bukti wajib:** daftar elemen < 44px sebelum dan sesudah (jumlah dan ukuran).

**Gerbang G1b:** 0 target sentuh terlihat < 44px; tidak ada overflow baru.

---

## FASE 2 — Ruang Layar (header + hero)

> Alasan: header mobile 135px (16% layar) dan `<h1>` tidak terlihat. Dua hal ini
> menentukan apa yang pengunjung lihat sebelum menggulir.

### Prompt 2.1 — Header & Navigation Engineer

**Role:** Frontend engineer (layout & navigation).

**M — Mindset.** Header adalah biaya tetap di setiap layar. Setiap piksel yang
dipakai header adalah piksel yang tidak dipakai konten. Situs referensi (Apple Store)
memakai 44-48px untuk area kontrolnya; sekarang 135px.

**G — Goal.** Header mobile <= 88px (sesuai U-06), tanpa menghilangkan fungsi
(pencarian, akun, navigasi) dan tanpa menyentuh bottom nav.

| Aspek | Target |
|---|---|
| Masalah | Header mobile terukur 135px; di desktop 132px |
| Target | (a) mobile <= 88px; (b) pencarian tetap tersedia; (c) navigasi kategori dipindah ke baris chip yang bisa digeser, bukan menambah tinggi header; (d) desktop tetap nyaman |
| Acceptance | 1) ukur tinggi header di 393px: <= 88px; 2) pencarian tetap bisa dipakai (fokus + submit); 3) navigasi ke `/produk`, `/layanan`, `/artikel`, `/bantuan` tetap ada; 4) tidak ada overflow horizontal; 5) keyboard: Tab berurutan logis |

**R — Riset/Basis.** Riset §1.1 (header 132px desktop), §1.2 (135px mobile),
§2.2 (Apple: tombol 44/48px), §5.2.

**C — Context.** Header publik di `site-header.tsx`. Pencarian sudah ada dengan
`min-h-11`. **Jangan sentuh `bottom-nav.tsx`** (dipakai layout privat lain).

**A — Action.**
1. Ukur dulu tinggi tiap baris di header (logo, pencarian, nav) untuk tahu mana yang
   paling banyak memakan ruang.
2. Susun ulang menjadi maksimal dua baris di mobile (target <= 88px). Prioritaskan:
   logo + akun, lalu pencarian.
3. Pindahkan tautan navigasi ke baris chip horizontal (bisa digeser) yang **tidak**
   menambah tinggi header, atau ke dalam menu yang sudah ada.
4. Pastikan target sentuh tetap >= 44px setelah diringkas.
5. Uji di 393px, 768px, 1440px.

**O — Output.** `site-header.tsx` (+ komponen chip bila perlu).
**Bukti wajib:** tinggi header sebelum/sesudah di tiga lebar; screenshot mobile.

**Gerbang G2a:** header mobile <= 88px; semua fungsi tetap ada.

---

### Prompt 2.2 — Hero Engineer

**Role:** Frontend engineer + conversion copywriter.

**M — Mindset.** Layar pertama harus menjawab: ini situs apa, untuk siapa, apa
langkah berikutnya. Sekarang `<h1>` tidak terlihat dan tidak ada CTA belanja di
900px pertama.

**G — Goal.** Hero dengan `<h1>` terlihat, satu kalimat nilai jual, dan dua CTA ke
tujuan nyata (sesuai U-01/H-05).

| Aspek | Target |
|---|---|
| Masalah | `<h1>` `sr-only` (lebar < 100px); tidak ada CTA belanja di layar pertama; produk pertama baru di 2.996px |
| Target | (a) `<h1>` terlihat; (b) 1 paragraf penjelas; (c) 2 CTA ke route nyata; (d) banner tetap ada; (e) produk pertama terlihat < 1.500px |
| Acceptance | 1) `<h1>` terukur lebar > 100px; 2) 2 CTA membawa ke route yang ada; 3) kontras teks di atas gambar lolos WCAG AA; 4) 393px tanpa overflow; 5) posisi produk pertama < 1.500px |

**R — Riset/Basis.** Riset §4.2; riset sebelumnya §3.1 dan H-05.

**C — Context.** Banner memakai aset Owner (2 slide). Token tipografi: `--font-display`
(Sora), `--font-sans` (Manrope). `PageShell` menyediakan header + footer.

**A — Action.**
1. Tulis `<h1>` yang menyebut apa yang dijual (produk digital + jasa). Dilarang
   buzzword (R-16). Hapus `<h1>` `sr-only` lama, jangan biarkan dua `<h1>`.
2. Satu paragraf maksimal 2 baris: untuk siapa, apa bedanya.
3. Dua CTA: primer ke `/produk`, sekunder ke `/bantuan` atau `#cara-kerja`.
   Label spesifik, bukan "Mulai"/"Pelajari" (R-15).
4. Bila teks di atas banner: beri lapisan kontras (bukan gradient hiasan), dan uji
   kontras di titik tergelap gambar.
5. Sesuaikan U-01 (bahasa desain) pada gaya hero.

**O — Output.** `index.tsx` + komponen hero.
**Bukti wajib:** ukur lebar `<h1>`, posisi CTA, posisi produk pertama, hasil kontras.

**Gerbang G2b:** `<h1>` terlihat; 2 CTA berfungsi; produk pertama < 1.500px.

---

## FASE 3 — Katalog & Tipografi

### Prompt 3.1 — Catalog Layout Engineer

**Role:** Frontend engineer (responsive layout).

**M — Mindset.** Grid yang menyisakan slot kosong membuat katalog tampak rusak.
Jumlah kolom harus mengikuti jumlah item nyata dan lebar layar nyata.

**G — Goal.** Katalog terlihat utuh untuk jumlah item berapa pun, dan ruang layar
besar terpakai (sesuai U-03).

| Aspek | Target |
|---|---|
| Masalah | 4 kolom tetap dengan 2 item (2 slot kosong); 1920px menyisakan 768px (40%) terbuang |
| Target | (a) grid adaptif sesuai jumlah item; (b) wadah menyesuaikan U-03; (c) harga asal tampil bila ada diskon |
| Acceptance | 1) dengan 2 item: tidak ada slot kosong mencolok di 1024/1440/1920; 2) ruang terbuang di 1920 < 400px; 3) harga asal terlihat bila `discount_price` ada; 4) 393px tetap 2 kolom rapi |

**R — Riset/Basis.** Riset §1.1 (tabel lebar/kolom), §4.1.

**C — Context.** Grid sekarang: `index.tsx:334` (`grid-cols-2 ... sm:grid-cols-3 ...
lg:grid-cols-4`). 2 produk published, keduanya bernama "template". Diskon dihitung
lewat `effectivePrice` di `lib/format.ts`.

**A — Action.**
1. Buat grid yang menyesuaikan: bila jumlah item < kolom maksimum, kurangi kolom
   atau batasi lebar kartu. Jangan biarkan slot kosong.
2. Terapkan U-03 pada wadah katalog (bukan seluruh halaman; teks tetap 1152px).
3. Tampilkan harga asal (dicoret) di samping harga diskon.
4. Bila nama produk duplikat persis, itu masalah data. Catat sebagai temuan, jangan
   "diperbaiki" dengan mengubah nama di UI.

**O — Output.** `index.tsx` + `catalog-cards.tsx`.
**Bukti wajib:** ukur lebar kartu & sisa ruang di 1024/1440/1920 dan 393px.

**Gerbang G3a:** tidak ada slot kosong; ruang terbuang 1920 < 400px.

---

### Prompt 3.2 — Typography & Control Engineer

**Role:** Frontend engineer (design system).

**M — Mindset.** Tipografi menentukan keterbacaan. Apple Store memakai body 17px
dengan line-height 1.47 dan heading navigasi kecil (12px desktop, 17px mobile);
yang besar adalah nama produk. Sekarang body 14px dan heading section tebal.

**G — Goal.** Skala tipografi dan kontrol yang konsisten, mengikuti U-04 dan U-05.

| Aspek | Target |
|---|---|
| Masalah | Body 14px (`text-sm`); heading section 20-24px w700; radius tombol pill |
| Target | (a) body sesuai U-05; (b) heading: ukuran naik, berat turun; (c) radius tombol sesuai U-04; (d) harga memakai `tabular-nums` dan menonjol |
| Acceptance | 1) body >= U-05 di desktop; 2) heading tidak memakai berat > 600; 3) tombol memakai radius U-04, konsisten di seluruh home; 4) kontras semua teks lolos WCAG AA; 5) 393px tidak ada teks yang pecah/keluar wadah |

**R — Riset/Basis.** Riset §2.1 (Apple: 17px body, heading 12px), §4.3, §4.4.

**C — Context.** Token: `--font-display` (Sora), `--font-sans` (Manrope),
radius bertingkat `--radius-tile/card/panel/modal`, motion 120/200/320ms.

**A — Action.**
1. Naikkan ukuran body di home sesuai U-05. Jangan ubah token global; ubah pemakaian
   di home supaya halaman lain tidak terpengaruh tanpa keputusan.
2. Turunkan berat heading section (w700 -> w600) dan naikkan ukuran. Alasan: hierarki
   datang dari ukuran dan ruang, bukan ketebalan.
3. Terapkan radius tombol sesuai U-04 secara konsisten (jangan campur pill dan siku
   di satu halaman).
4. Pastikan harga produk memakai `tabular-nums` dan ukuran lebih besar dari teks
   sekitarnya, karena harga adalah informasi yang dicari.
5. Uji kontras seluruh teks baru.

**O — Output.** Komponen home + token pemakaian.
**Bukti wajib:** tabel ukuran/berat sebelum-sesudah; hasil kontras; screenshot 393px
dan 1440px.

**Gerbang G3b:** skala tipografi konsisten; kontras lolos; tidak ada teks pecah.

---

## FASE 4 — Verifikasi (WAJIB)

### Prompt 4.1 — QA & Accessibility Engineer

**Role:** QA engineer + accessibility specialist.

**M — Mindset.** Laporan yang hanya berisi "lulus" tidak berguna. Yang dicari: apa
yang gagal, di kondisi apa.

**G — Goal.** Laporan jujur per butir setelah seluruh perubahan.

**A — Action.**
1. Ukur ulang seluruh metrik riset: tinggi header (mobile/desktop), lebar wadah,
   kolom grid, target sentuh < 44px, ruang terbuang di 1920, posisi produk pertama,
   tinggi dokumen.
2. Uji aksesibilitas: keyboard penuh (Tab, Enter, Escape), kontras WCAG AA
   (khusus teks di atas gambar), `alt` gambar, label form.
3. Uji batas: 0 produk, 0 review, 0 layanan, 1 review, gambar gagal muat, koneksi lambat.
4. Uji reduced-motion: animasi berhenti, konten tetap terbaca.
5. Uji 393px, 768px, 1024px, 1440px, 1920px: tidak ada overflow, target >= 44px.
6. Bandingkan sebelum/sesudah dengan angka.

**O — Output.** Laporan per butir dengan status jujur. Laporkan yang gagal lebih dulu.

### Prompt 4.2 — Regression Guard

**Role:** Senior engineer (regression & release).

**M — Mindset.** Perubahan pada `__root.tsx` (viewport) berdampak ke **semua** halaman,
bukan hanya home. Yang paling berbahaya adalah perbaikan yang merusak halaman lain.

**A — Action.**
1. Setelah mengubah `viewport-fit=cover` di `__root.tsx`, periksa halaman: `/`,
   `/produk`, `/layanan`, `/artikel`, `/auth`, `/dashboard`, `/admin`.
2. Pastikan tidak ada halaman yang tiba-tiba overflow atau tertutup.
3. Pastikan `bottom-nav.tsx` **tidak berubah** (bandingkan dengan versi sebelum).
4. Jalankan `tsc`, `eslint`, dan unit test. Laporkan hasil apa adanya.
5. Periksa console di setiap halaman; laporkan error/warning baru.

**O — Output.** Daftar halaman yang diperiksa + status per halaman.
**Bukti wajib:** hasil tsc/lint/test + catatan bahwa `bottom-nav.tsx` tidak disentuh.

---

## Daftar 8 Role Software Engineer

| # | Role | Fase | Tanggung jawab inti | Kenapa dipisah |
|---|---|---|---|---|
| 1 | Product strategist | 0 | Keputusan U-01..U-06 | Lima keputusan mengubah seluruh tata letak |
| 2 | Platform compatibility engineer | 1.1 | Safe area, viewport | Masalah perangkat, bukan estetika |
| 3 | Touch target engineer | 1.2 | Target >= 44px | Aksesibilitas interaksi |
| 4 | Header & navigation engineer | 2.1 | Tinggi header, navigasi | Mengatur biaya tetap di setiap layar |
| 5 | Hero engineer | 2.2 | Pesan + CTA layar pertama | Menggabungkan tulis + implementasi |
| 6 | Catalog layout engineer | 3.1 | Grid adaptif, ruang wadah | Tata letak data |
| 7 | Typography & control engineer | 3.2 | Skala huruf, radius, harga | Sistem desain |
| 8 | QA + accessibility engineer | 4.1 | Uji batas + aksesibilitas | Menemukan yang gagal |
| 9 | Regression guard | 4.2 | Halaman lain, bottom-nav | Melindungi yang tidak boleh rusak |

**Catatan pembagian.** Role 2 dan 3 sengaja dipisah dari role 4 dan 5: role 2-3
memperbaiki **fondasi platform** (safe area, target sentuh) yang berlaku di semua
perangkat, sementara role 4-5 mengubah **tata letak** yang terlihat. Menggabungkan
keduanya membuat perbaikan fondasi sering tertunda karena tata letak lebih menarik
dikerjakan lebih dulu. Role 9 ada karena satu perubahan (`__root.tsx`) berdampak ke
seluruh aplikasi.

---

## Gerbang Kualitas

| Gerbang | Syarat |
|---|---|
| G0 -> G1 | Lima keputusan Owner (U-01, U-03, U-04, U-05, U-06) tercatat |
| G1 -> G2 | Tidak ada konten tertutup di inset bukan nol; tampilan inset nol tidak berubah; 0 target < 44px |
| G2 -> G3 | Header mobile <= 88px; `<h1>` terlihat; 2 CTA berfungsi; produk pertama < 1.500px |
| G3 -> G4 | Tidak ada slot kosong; ruang terbuang 1920 < 400px; kontras lolos |
| G4 -> selesai | Laporan QA + regression guard dengan status jujur |

**Aturan tegas:** Fase 3 tidak dimulai sebelum Fase 1 lulus. Mengatur tipografi di
halaman yang masih tertutup home indicator adalah merapikan ruangan yang pintunya
masih macet.

---

## Yang DILARANG (langsung gagal)

- **Mengubah `src/components/ebry/bottom-nav.tsx`** atau menyambungkannya ke home
- Menambah bottom navigation di halaman home
- Menambah library baru (animasi, ikon, chart, UI)
- Mengubah token global (`styles.css`) tanpa mencatat dampaknya ke halaman lain
- Emoji di UI, gradien dekoratif, glow berlebihan, bayangan bertumpuk
- Buzzword: "terbaik", "nomor 1", "revolusioner", "seamless", "AI-powered"
- Target sentuh < 44px
- Teks yang pecah atau keluar wadah di 393px
- Mengklaim "selesai" tanpa angka ukur sebelum/sesudah
- Menyentuh jalur VERIFIED (overflow 390px, console bersih, struktur heading,
  lazy-load, structured data) tanpa alasan tercatat
