# 13 — Framework Prompt MGRCAO V3: Redesain Home Ebrystore — Tim 9 Role Khusus

Tanggal: 2026-10-05 · Basis riset: [`../audit/2026-10-05-riset-redesign-home.md`](../audit/2026-10-05-riset-redesign-home.md)
Status: **SIAP DIPAKAI — MENUNGGU KEPUTUSAN OWNER (H-01..H-06)**

---

## Cara memakai dokumen ini

Dokumen ini adalah **paket prompt berlapis**, bukan satu prompt raksasa. Satu prompt
"perbaiki halaman home" akan menghasilkan kode dangkal di semua bagian. Yang benar:
setiap tahap dikerjakan **satu role khusus**, dengan keluaran yang bisa diperiksa
sebelum lanjut.

Alur: **Fase 0 (keputusan) → Fase 1 (hero & kepercayaan) → Fase 2 (struktur & scroll)
→ Fase 3 (katalog & bukti) → Fase 4 (verifikasi)**.

Setiap prompt memakai kontrak **MGRCAO V3** (M/G/R/C/A/O) dan mematuhi Aturan
Non-Negosiasi di bawah.

**Kenapa role dipisah, bukan digabung:** riset menemukan 3 masalah berbeda jenis yang
sering dianggap satu: (a) masalah pesan/pesan jual di layar pertama, (b) masalah
struktur informasi dan anggaran scroll, (c) masalah kejujuran data (review ganda,
section kosong). Ketiganya butuh keahlian berbeda. Menggabungkannya menjadi
"perbaiki home" adalah cara paling cepat untuk tidak menyelesaikan salah satunya.

---

## Aturan Non-Negosiasi (berlaku di SEMUA prompt)

1. **Evidence-before-claim.** Setiap klaim menyebut file:baris atau hasil ukur.
   Status: `VERIFIED` / `PARTIALLY_VERIFIED` / `NOT_IMPLEMENTED` / `OWNER_DECISION_REQUIRED`.
2. **Dilarang angka karangan.** Section tanpa data menampilkan keadaan kosong yang
   jujur, atau tidak ditampilkan sama sekali. (R-17, R-38)
3. **Dilarang menggandakan konten untuk mengesankan banyak.** Satu review tidak boleh
   dirender 4x. (R-18, R-38)
4. **Setiap CTA punya tujuan nyata.** Tidak ada tombol yang tidak membawa ke mana pun.
   (R-26)
5. **Arah visual Ebrystore** (`DESIGN.md`): aksen ink-teal, low elevation, mobile-first
   390px, reduced-motion dihormati, tanpa glow/gradien dekoratif. (R-31)
6. **Halaman publik = ENERGY 2 / RHYTHM 2-3 / MOTION 2** (DESIGN.md). Halaman data
   memakai 1/2/1; home tidak, karena ini satu-satunya tempat ekspresi dibenarkan.
7. **Jangan sentuh yang sudah VERIFIED** tanpa alasan tercatat: nol overflow 390px,
   nol error console, struktur heading, lazy-load gambar, structured data.
8. **Uji sebelum klaim.** Setiap tahap berakhir dengan bukti ukur, bukan ringkasan naratif.

---

## FASE 0 — Keputusan Owner (WAJIB SEBELUM KODE)

**Role:** Product strategist (role #1)

**M — Mindset.** Enam keputusan di bawah menentukan bentuk seluruh halaman. Membangun
sebelum diputuskan berarti mengulang pekerjaan, karena tiap keputusan mengubah urutan
section.

**G — Goal.** Jawaban tegas atas H-01..H-06, tercatat di `docs/marketplace/02-decision-register.md`.

**R — Riset/Basis.** Riset `2026-10-05-riset-redesign-home.md` §5: 7.918px total,
59% untuk efek scroll, 1 review digandakan 4x, 7 section tidak terpasang.

**C — Context.** Data nyata saat ini: 2 produk (dua-duanya "template"), 2 jasa seller,
0 layanan platform, 1 review ("amannn"), 0 artikel.

**A — Action.** Ajukan enam pertanyaan ini dan catat jawabannya:

| # | Pertanyaan | Opsi | Rekomendasi riset |
|---|---|---|---|
| H-01 | Nasib sticky story `cara-kerja` (2.700px) | pertahankan / potong 1 panel / hapus | potong 1 panel |
| H-02 | Nasib galeri `Sekilas Ebrystore` (1.980px) | pertahankan / beri tautan / hapus | beri tautan atau hapus |
| H-03 | Section kosong (layanan platform, 0 baris) | sembunyikan / tampilkan dengan penjelasan | sembunyikan |
| H-04 | Ambang minimum review | 1 / 3 / 5 | 3 |
| H-05 | Hero | banner saja / teks+CTA di atas banner / teks+CTA ganti banner | teks+CTA di atas banner |
| H-06 | Section belum terpasang yang diaktifkan | Trust / FAQ / FinalCta / Founder / TwoPath / Tracking / FlowDiagram | Trust + FAQ + FinalCta |

**O — Output.** Enam baris keputusan di register, dengan tanggal dan alasan.
**Gerbang G0:** tanpa keenam jawaban, Fase 1 tidak dimulai.

---

## FASE 1 — Hero & Kepercayaan (prioritas tertinggi)

> Alasan urutan: dua celah terbesar riset ada di sini. Layar pertama tidak menjual
> apa pun (§3.1), dan bukti sosial justru merusak kepercayaan (§3.2).

### Prompt 1.1 — Hero & Value Proposition Engineer

**Role:** Conversion copywriter + senior frontend engineer.

**M — Mindset.** Layar pertama harus menjawab tiga hal tanpa scroll: ini situs apa,
untuk siapa, dan apa langkah berikutnya. Banner gambar tidak bisa menjawab ketiganya
sendiri.

**G — Goal.** Hero dengan `<h1>` terlihat, satu kalimat nilai jual, dan dua CTA ke
tujuan nyata.

| Aspek | Target |
|---|---|
| Masalah | `<h1>` `sr-only`; tidak ada teks terlihat di 900px pertama; tidak ada CTA belanja |
| Target | (a) `<h1>` terlihat berisi proposisi nyata; (b) satu paragraf penjelas; (c) dua CTA: ke `/produk` dan ke penjelasan alur; (d) banner tetap ada, posisinya ditentukan H-05 |
| Acceptance | 1) `<h1>` terukur punya lebar > 100px; 2) kedua CTA membawa ke route yang ada; 3) teks tidak menutupi area penting banner; 4) mobile 390px tanpa overflow; 5) kontras teks di atas gambar lolos WCAG AA (uji titik tergelap) |

**R — Riset/Basis.** §3.1 riset; `index.tsx:143` (`h1` `sr-only`); banner terukur
467px dengan teks hanya "Banner 1 dari 2" (sr-only).

**C — Context.** Banner memakai gambar aset Owner (2 slide, salah satunya ber-alt
"Canva"). Token warna dan tipografi ada di `DESIGN.md`. `PageShell` sudah menyediakan
header + footer.

**A — Action.**
1. Tulis `<h1>` yang menyebut apa yang dijual (produk digital + jasa), bukan slogan.
   Dilarang buzzword (R-16): tanpa "terbaik", "nomor 1", "revolusioner".
2. Tambahkan satu paragraf maksimal 2 baris: untuk siapa dan apa bedanya.
3. Dua CTA: satu primer ke `/produk`, satu sekunder ke `#cara-kerja` atau `/bantuan`.
   Label spesifik, bukan "Mulai" / "Pelajari" (R-15).
4. Tentukan penempatan menurut H-05. Bila teks di atas banner: pastikan kontras aman
   (beri lapisan gelap/terang di belakang teks, bukan gradient hiasan).
5. Hapus `<h1>` `sr-only` yang lama, jangan biarkan dua `<h1>`.

**O — Output.** `index.tsx` + komponen hero bila perlu. **Bukti wajib:** ukur lebar
`<h1>`, posisi 2 CTA, hasil kontras, screenshot 1440px dan 390px.

**Gerbang G1a:** hero terlihat + 2 CTA berfungsi + kontras lolos.

---

### Prompt 1.2 — Social Proof Integrity Engineer

**Role:** Trust & content integrity engineer.

**M — Mindset.** Bukti sosial hanya bernilai bila jujur. Satu review yang digandakan
4x bukan bukti, itu manipulasi visual. Lebih baik tidak ada section daripada section
yang menipu.

**G — Goal.** Section review yang hanya tampil bila datanya layak, dan tampil sekali
per review.

| Aspek | Target |
|---|---|
| Masalah | 1 review ("amannn") dirender 4x oleh `Marquee repeat={4}`; terukur muncul 4 kali |
| Target | (a) ambang minimum sesuai H-04 (rekomendasi: 3 review); (b) `repeat` = 1; (c) bila di bawah ambang, section tidak dirender sama sekali |
| Acceptance | 1) hitung kemunculan teks review di DOM = jumlah review unik; 2) dengan data sekarang (1 review) section tidak tampil; 3) dengan >= ambang, marquee tetap berjalan dan bisa dijeda; 4) reduced-motion tetap terbaca |

**R — Riset/Basis.** §3.2 riset; `review-marquee-section.tsx:113-140`;
`marquee.tsx:31` (`repeat = 4`).

**C — Context.** `listRecentReviews` sudah menyaring `is_visible = true` dan
mengembalikan `items` + `average` + `total`. Review asli bisa ditambah admin lewat
halaman moderasi yang ada.

**A — Action.**
1. Tambahkan ambang minimum (konstanta bernama, mis. `MIN_REVIEWS_FOR_SECTION`).
2. Bila `reviews.length < ambang` -> `return null`.
3. Ubah pemanggilan `Marquee` menjadi `repeat={1}`; pastikan animasi tetap mulus
   (durasi disesuaikan dengan jumlah item, bukan angka tetap).
4. Bila `average` dan `total` tersedia, tampilkan ringkasannya sebagai satu baris
   (mis. "4,8 dari 5 · 12 ulasan"), hanya jika angkanya berasal dari data nyata.
5. Jangan mengubah cara nama penilai ditampilkan (`reviewer_name` apa adanya).

**O — Output.** `review-marquee-section.tsx` + `marquee.tsx` bila perlu.
**Bukti wajib:** hitung kemunculan teks review di DOM sebelum/sesudah; uji dengan
1 review (tidak tampil) dan dengan data uji >= 3 (tampil).

**Gerbang G1b:** tidak ada konten yang digandakan; section tersembunyi saat data tipis.

---

## FASE 2 — Struktur Informasi & Anggaran Scroll

> Alasan: 59% halaman dipakai efek scroll, katalog baru muncul di 2.996px, dan urutan
> tidak mengikuti niat pengunjung. Ini masalah arsitektur informasi, bukan estetika.

### Prompt 2.1 — Information Architect

**Role:** Information architect + UX researcher.

**M — Mindset.** Urutan section adalah keputusan produk. Pengunjung datang untuk
melihat barang; dekorasi tidak boleh berdiri di depan pintu.

**G — Goal.** Urutan section baru yang menempatkan katalog sebelum efek scroll, dengan
justifikasi tertulis per posisi.

| Aspek | Target |
|---|---|
| Masalah | Urutan sekarang: Review -> Galeri -> Kategori -> Produk; produk di 2.996px |
| Target | Urutan baru: Hero -> Kategori -> Produk -> Jasa seller -> (Layanan platform bila ada) -> Trust -> Cara kerja ringkas -> Review -> FAQ -> CTA akhir -> Seller join |
| Acceptance | 1) produk pertama terlihat sebelum 1.500px; 2) setiap section punya alasan tertulis satu baris; 3) tidak ada section kosong tayang; 4) urutan heading tetap logis (satu `<h1>`) |

**R — Riset/Basis.** §1 dan §3.6 riset; `index.tsx:138-243`.

**C — Context.** Kategori tersedia dari `listCatalogCategories` (jasa 9 kategori,
produk belum ada data). Jasa seller 2 item. Layanan platform 0 item (H-03).

**A — Action.**
1. Tulis urutan baru beserta alasan per posisi, di komentar file atau dokumen kecil.
2. Terapkan urutan di `index.tsx` (pindahkan blok, jangan tulis ulang).
3. Terapkan H-03: bila `services.items.length === 0`, jangan render section itu
   sama sekali (bukan menampilkan "Belum ada layanan").
4. Pastikan urutan heading tetap berurutan (`h1` -> `h2` -> `h3`).

**O — Output.** `index.tsx` dengan urutan baru + tabel alasan.
**Bukti wajib:** ukur posisi section pertama yang berisi produk (target < 1.500px).

**Gerbang G2a:** produk terlihat di paruh pertama halaman.

---

### Prompt 2.2 — Scroll Budget Engineer

**Role:** Frontend performance engineer.

**M — Mindset.** Scroll-jack adalah anggaran: setiap piksel yang dipakai efek adalah
piksel yang tidak dipakai untuk jualan. Dua scroll-jack berturut-turut
(1.980px + 2.700px) membuat halaman terasa menahan pengunjung.

**G — Goal.** Total anggaran scroll untuk efek turun di bawah 15% halaman, tanpa
kehilangan informasi yang berguna.

| Aspek | Target |
|---|---|
| Masalah | Galeri 1.980px + story 2.700px = 4.680px (59%); Lenis `root` + sticky pin bersaing |
| Target | (a) sesuai H-01: story dipotong 1 panel / dihapus; (b) sesuai H-02: galeri diberi tautan atau dihapus; (c) hanya satu mekanisme scroll khusus yang aktif |
| Acceptance | 1) total tinggi section efek < 15% tinggi dokumen; 2) tidak ada scroll-jack berturut-turut; 3) mobile + reduced-motion tetap terbaca; 4) tidak ada lonjakan CLS dari perubahan ini |

**R — Riset/Basis.** §3.5 dan §1 riset; `smooth-scroll-story.tsx` (ReactLenis root,
3 panel `h-screen`), `showcase-gallery.tsx` (sticky pin 1.980px).

**C — Context.** `useIsMobile` dan `useReducedMotion` sudah dipakai di kedua komponen;
mobile sudah memakai fallback native (bagus, pertahankan).

**A — Action.**
1. Terapkan keputusan H-01 pada `SmoothScrollStory`. Bila dipotong: satu panel, tanpa
   Lenis `root` (smooth scroll global memengaruhi seluruh halaman, bukan hanya section).
2. Terapkan H-02 pada `ShowcaseGallery`. Bila diberi tautan: setiap item menjadi
   `<Link>` ke tujuan nyata, atau hapus bila tidak ada tujuan yang masuk akal.
3. Pastikan tidak ada dua komponen yang sama-sama memasang scroll khusus.
4. Ukur ulang tinggi dokumen dan persentase section efek.

**O — Output.** Komponen yang disesuaikan + angka sebelum/sesudah.
**Bukti wajib:** tinggi dokumen, % section efek, screenshot di 1440px dan 390px.

**Gerbang G2b:** efek scroll < 15% halaman; tidak ada scroll-jack ganda.

---

## FASE 3 — Katalog & Bukti yang Sudah Ada

> Alasan: katalog adalah tujuan halaman, dan 7 section berguna sudah ditulis tapi
> tidak terpasang. Ini pekerjaan menyambungkan, bukan membangun dari nol.

### Prompt 3.1 — Catalog Presentation Engineer

**Role:** Frontend engineer (commerce UI).

**M — Mindset.** Grid yang menyisakan ruang kosong membuat katalog tampak rusak.
Jumlah kolom harus mengikuti jumlah item nyata.

**G — Goal.** Katalog yang terlihat utuh untuk jumlah item berapa pun, dan badge
diskon yang tidak menyesatkan.

| Aspek | Target |
|---|---|
| Masalah | 2 produk di grid 4 kolom (2 slot kosong); 2 jasa di grid 3 kolom; badge "Diskon 90%" tanpa harga asal di kartu |
| Target | (a) grid menyesuaikan jumlah item; (b) badge diskon menyertakan harga asal; (c) kartu tidak lebih tinggi dari isinya |
| Acceptance | 1) dengan 2 item, grid tampil rapi di 1440px dan 390px; 2) harga asal terlihat bila ada diskon; 3) tidak ada slot kosong yang mencolok |

**R — Riset/Basis.** §3.8 riset; `index.tsx:334` (grid 4 kolom tetap),
`catalog-cards.tsx:75` (logika thumbnail + harga).

**C — Context.** 2 produk published, keduanya bernama "template". Diskon dihitung
dari `discount_price` vs `price` (`effectivePrice` di `lib/format.ts`).

**A — Action.**
1. Buat grid adaptif: bila item < jumlah kolom maksimum, gunakan grid yang lebih
   sedikit kolom, atau `flex` dengan lebar maksimum kartu. Jangan biarkan slot kosong.
2. Tampilkan harga asal (dicoret) di samping harga diskon, supaya badge punya konteks.
3. Bila nama produk duplikat persis, itu masalah data, bukan UI. Catat sebagai temuan,
   jangan "diperbaiki" dengan mengubah nama di UI.

**O — Output.** `index.tsx` + `catalog-cards.tsx` bila perlu.
**Bukti wajib:** screenshot dengan 2 item di 1440px dan 390px.

---

### Prompt 3.2 — Dormant Sections Integrator

**Role:** Frontend engineer + content editor.

**M — Mindset.** Tujuh section sudah ditulis dan tidak dipakai. Menulis ulang adalah
pemborosan; yang dibutuhkan adalah menilai mana yang layak tayang dan menyambungkannya.

**G — Goal.** Section Trust, FAQ, dan CTA akhir terpasang sesuai H-06, dengan isi yang
diverifikasi masih benar.

| Aspek | Target |
|---|---|
| Masalah | `TrustSection`, `FaqSection`, `FinalCtaSection` (+4 lain) 0 pemakaian |
| Target | (a) sesuai H-06, pasang yang disetujui; (b) verifikasi setiap klaim di dalamnya masih sesuai sistem nyata; (c) hapus yang tidak dipakai dari `sections.tsx` bila tidak akan dipakai |
| Acceptance | 1) section terpasang dan bisa diakses; 2) setiap klaim di FAQ/Trust diverifikasi ke kode/database; 3) tidak ada section yatim yang tersisa tanpa alasan |

**R — Riset/Basis.** §3.4 riset; `sections.tsx:311` (Trust), `:365` (FAQ), `:388` (CTA).

**C — Context.** FAQ menyebut: transfer manual, verifikasi tim keuangan, kuota unduh
5x/365 hari, revisi per paket, refund perlu persetujuan admin, batas bayar 24 jam.
Semua ini perlu dicocokkan dengan implementasi nyata sebelum tayang.

**A — Action.**
1. Untuk setiap klaim di FAQ dan Trust, cari buktinya di kode/database
   (mis. kuota unduhan: cek `digital_entitlements`; batas 24 jam: cek aturan
   kedaluwarsa pesanan). Catat file:baris.
2. Bila ada klaim yang tidak lagi benar, perbaiki teksnya atau jangan tayangkan
   section itu.
3. Pasang section di posisi sesuai Prompt 2.1.
4. Hapus dari `sections.tsx` yang tidak akan dipakai (jangan tinggalkan kode yatim).

**O — Output.** `index.tsx` + `sections.tsx` + tabel klaim -> bukti.
**Bukti wajib:** tabel verifikasi klaim dengan file:baris; screenshot section terpasang.

**Gerbang G3:** katalog rapi + section terpasang + semua klaim terverifikasi.

---

## FASE 4 — Verifikasi (WAJIB, bukan opsional)

### Prompt 4.1 — QA & Accessibility Engineer

**Role:** QA engineer + accessibility specialist.

**M — Mindset.** Laporan yang hanya berisi "lulus" tidak berguna. Yang dicari adalah
apa yang gagal, di kondisi apa, dan seberapa sering.

**G — Goal.** Laporan jujur per butir untuk halaman home setelah redesign.

**A — Action.**
1. Ukur ulang seluruh metrik riset: total tinggi, tinggi per section, posisi produk
   pertama, jumlah kemunculan konten, overflow 390px.
2. Uji aksesibilitas: keyboard penuh (Tab berurutan, Enter aktif, Escape menutup),
   kontras WCAG AA (khusus teks di atas gambar), label form, `alt` gambar.
3. Uji batas: 0 produk, 0 review, 0 layanan, 1 review, banyak review, gambar gagal muat.
4. Uji reduced-motion: semua animasi berhenti, konten tetap terbaca.
5. Uji mobile 390px: tidak ada overflow, target sentuh >= 44px.
6. Bandingkan sebelum/sesudah dengan angka, bukan kesan.

**O — Output.** Laporan per butir dengan status jujur. **Laporkan yang gagal lebih dulu.**

### Prompt 4.2 — Honesty & Anti-Slop Reviewer

**Role:** Content integrity reviewer (bukan engineer).

**M — Mindset.** Halaman jualan cenderung membesar-besarkan. Tugas role ini memastikan
tidak ada klaim yang tidak bisa dibuktikan.

**A — Action.**
1. Baca seluruh teks yang terlihat pengunjung. Untuk setiap klaim faktual (angka,
   jaminan, kecepatan, keamanan), cari sumbernya.
2. Periksa apakah ada konten yang digandakan untuk mengesankan banyak.
3. Periksa apakah ada section kosong yang tetap tayang.
4. Periksa apakah ada CTA yang tidak menuju ke mana pun.
5. Periksa apakah ada teks yang menyesatkan (mis. "diskon 90%" tanpa harga asal).
6. Periksa buzzword dan pola AI (R-15, R-16, R-36).

**O — Output.** Daftar temuan dengan bukti; setiap temuan menyebut apa yang salah dan
apa buktinya. Status jujur, termasuk bila tidak ada temuan.

---

## Daftar 9 Role Khusus

| # | Role | Fase | Tanggung jawab inti | Kenapa dipisah |
|---|---|---|---|---|
| 1 | Product strategist | 0 | Keputusan H-01..H-06 | Enam keputusan mengubah seluruh struktur |
| 2 | Conversion copywriter | 1.1 | Pesan layar pertama | Keahlian menulis, bukan kode |
| 3 | Senior frontend engineer | 1.1, 3.1, 3.2 | Hero, katalog, integrasi | Implementasi + performa |
| 4 | Trust & content integrity engineer | 1.2 | Kejujuran bukti sosial | Fokus pada integritas data, bukan tampilan |
| 5 | Information architect | 2.1 | Urutan section | Keputusan produk, bukan estetika |
| 6 | Frontend performance engineer | 2.2 | Anggaran scroll, CLS | Kekhawatiran performa berbeda dari struktur |
| 7 | Content editor | 3.2 | Verifikasi klaim FAQ/Trust | Memastikan teks cocok dengan sistem nyata |
| 8 | QA & accessibility specialist | 4.1 | Uji batas + aksesibilitas | Menemukan yang gagal, bukan membangun |
| 9 | Anti-slop reviewer | 4.2 | Klaim, duplikasi, buzzword | Bukan engineer; menilai kejujuran isi |

**Catatan pembagian.** Role 3 dan 6 sengaja dipisah: role 3 membangun tampilan, role 6
memastikan halaman tidak menahan pengunjung. Dua kekhawatiran berbeda yang sering
digabung lalu terlupakan salah satunya. Role 2 dan 4 juga dipisah: role 2 menulis
pesan, role 4 memastikan pesannya tidak menipu.

---

## Gerbang Kualitas (harus lulus sebelum lanjut antar fase)

| Gerbang | Syarat |
|---|---|
| G0 -> G1 | Enam keputusan Owner (H-01..H-06) tercatat |
| G1 -> G2 | Hero terlihat + 2 CTA berfungsi + kontras lolos; tidak ada konten digandakan |
| G2 -> G3 | Produk terlihat < 1.500px; efek scroll < 15% halaman; tidak ada scroll-jack ganda |
| G3 -> G4 | Katalog rapi; section terpasang; semua klaim FAQ/Trust terverifikasi |
| G4 -> selesai | Laporan QA + anti-slop dengan status jujur per butir |

**Aturan tegas:** Fase 2 tidak boleh dimulai sebelum Fase 1 lulus. Memperbaiki struktur
halaman yang layar pertamanya masih kosong berarti mengatur ulang ruangan yang pintunya
masih tertutup.

---

## Yang DILARANG (langsung gagal)

- Konten digandakan untuk terlihat banyak (review, angka, testimoni)
- Section kosong tayang ke publik dengan pesan "belum ada"
- CTA tanpa tujuan nyata
- Angka atau klaim tanpa sumber (termasuk "diskon 90%" tanpa harga asal)
- Lebih dari satu scroll-jack berturut-turut
- Emoji di UI, gradien dekoratif, glow berlebihan
- Buzzword: "terbaik", "nomor 1", "revolusioner", "seamless", "AI-powered"
- Menambah library animasi/warna baru di luar yang sudah dipakai
- Mengklaim "selesai" tanpa angka ukur sebelum/sesudah
- Menyentuh jalur yang sudah VERIFIED (overflow 390px, console bersih, struktur heading,
  lazy-load, structured data) tanpa alasan tercatat
