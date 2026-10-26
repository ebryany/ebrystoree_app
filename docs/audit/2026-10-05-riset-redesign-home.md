# Riset: Redesain Halaman Home Ebrystore

Tanggal: 2026-10-05 · Status: **RISET SELESAI — MENUNGGU KEPUTUSAN OWNER**
Metode: pembacaan kode + pengukuran DOM langsung di browser (Chrome, viewport 1440x900
dan 390x844) + query database live. Setiap angka di bawah hasil ukur, bukan perkiraan.

---

## 1. Struktur halaman saat ini (terukur)

Total tinggi dokumen: **7.918px** desktop, **6.407px** mobile.

| # | Section | Mulai (px) | Tinggi (px) | Isi |
|---|---|---|---|---|
| 0 | Banner slider | 78 | 467 | 2 slide gambar, tanpa teks terlihat |
| 1 | Kata pembeli | 623 | 217 | Marquee review |
| 2 | Sekilas Ebrystore | 840 | **1.980** | Galeri 8 aset, scroll-jack |
| 3 | Belanja berdasarkan kategori | 2.820 | 176 | Chip kategori jasa + produk |
| 4 | Produk digital | 2.996 | 548 | Grid 4 kolom, 2 item |
| 5 | Jasa seller | 3.543 | 709 | Grid 3 kolom, 2 item |
| 6 | Pendampingan akademik | 4.300 | 313 | **Kosong** (0 layanan aktif) |
| 7 | cara-kerja (sticky story) | ~4.613 | **2.700** | 3 panel `h-screen`, scroll-jack |
| 8 | Punya produk untuk dijual? | 7.362 | 128 | Ajakan daftar seller |

Anggaran scroll: galeri + story = **4.680px = 59% halaman**. Katalog produk = 548px (7%).

---

## 2. Data yang tersedia (query live)

| Tabel | Jumlah | Catatan |
|---|---|---|
| `digital_products` (published) | 2 | Keduanya bernama "template" |
| `services` (active) | **0** | Section "Pendampingan akademik" tampil kosong |
| `marketplace_services` | 2 | Jasa seller |
| `stores` (active) | 2 | Dari 4 total (2 pending) |
| `product_reviews` (visible) | **1** | Isi: "amannn", penilai "dicky" |
| `articles` | 0 | |
| `campaigns` | 1 | |
| `orders` | 14 | |

---

## 3. Celah yang ditemukan (berurut dampak)

### 3.1 Layar pertama tidak menjual apa pun

- `<h1>` berstatus `sr-only` (terukur: lebar < 2px, tidak terlihat).
- Banner hanya gambar. Satu-satunya teks di dalamnya adalah `sr-only` "Banner 1 dari 2".
- Teks terlihat pertama di layar: heading "Kata pembeli" di posisi 663px.
- Di 900px pertama tidak ada satu pun CTA belanja.

**Dampak:** pengunjung tidak tahu ini situs apa dan tidak diberi jalan masuk.

### 3.2 Bukti sosial merusak kepercayaan

- Database berisi 1 review: `dicky` dengan isi `"amannn"`.
- `Marquee` memakai `repeat={4}`, sehingga kartu yang sama dirender 4 kali sejajar.
- Terukur: kata `amannn` muncul **4 kali** di layar pertama.

**Dampak:** satu review yang digandakan 4x lebih buruk daripada tidak ada section.
Pola ini melanggar prinsip anti-slop (konten tanpa nilai, angka/klaim tanpa dasar).

### 3.3 Section kosong tayang ke publik

Section "Pendampingan akademik" menampilkan "Belum ada layanan tersedia." karena
`services` berisi 0 baris. Pengakuan kosong di halaman jualan.

### 3.4 Enam section sudah ditulis tapi tidak pernah dipasang

Terverifikasi 0 pemakaian di seluruh `src/`:

| Komponen | Isi | Baris |
|---|---|---|
| `TrustSection` | 4 poin keamanan transaksi | `sections.tsx:311` |
| `FaqSection` | 6 Q&A nyata (bayar, verifikasi, unduh, revisi, refund, batas 24 jam) | `sections.tsx:365` |
| `FinalCtaSection` | "Mulai dari satu pesanan" + 2 CTA | `sections.tsx:388` |
| `FounderSection` | Profil founder + aset | `sections.tsx:427` |
| `TwoPathSection` | Perbandingan alur produk vs jasa | `sections.tsx:58` |
| `TrackingPreviewSection` | Pratinjau status pesanan | `sections.tsx:172` |
| `FlowDiagram` | Alur pesanan 6 langkah | `flow-diagram.tsx:36` |

`TrustSection` dan `FaqSection` justru dua section yang paling dibutuhkan untuk
menutup celah kepercayaan, dan keduanya sudah ditulis lengkap.

### 3.5 Dua efek scroll bersaing

- `SmoothScrollStory` memakai `ReactLenis root`, menyerap scroll seluruh dokumen.
- `ShowcaseGallery` memakai sticky + `useScroll` + pin.
- Hasilnya: dua scroll-jack berturut-turut (1.980px + 2.700px).

### 3.6 Urutan tidak mengikuti niat pengunjung

Urutan sekarang: Review -> Galeri -> Kategori -> Produk.
Pengunjung yang ingin belanja harus melewati 2 section dekoratif dan 3 layar scroll
sebelum melihat produk pertama (posisi 2.996px).

### 3.7 Galeri tidak bisa diklik

8 gambar portrait dengan klaim "Delapan hal yang bisa kamu lakukan di sini", tetapi
tidak ada satu pun yang berupa `<Link>`. Informasi tanpa aksi.

### 3.8 Katalog tipis dan tampak rusak

- 2 produk, keduanya bernama "template".
- Grid 4 kolom desktop, sehingga 2 kartu menempati baris yang muat 4 (terlihat lowong).
- Badge "Diskon 90%" dan "Diskon 97%" menonjol tanpa konteks harga asal di kartu.

### 3.9 Banner slide kedua menampilkan merek pihak ketiga

Alt gambar: `"Ebrystore"` dan `"Canva"`. Slide Canva tampil tanpa teks penjelas.

### 3.10 Catatan teknis lain

- 1 gambar di section jasa seller tidak punya atribut `alt` (terdeteksi pada satu
  render; pada render berikutnya hilang, kemungkinan data berubah saat uji).
- Mobile 390px: tidak ada overflow horizontal, 2 target sentuh di bawah 44px.

---

## 4. Yang sudah benar (jangan diubah)

| Aspek | Bukti |
|---|---|
| Tanpa overflow horizontal di 390px | Terukur: `scrollWidth - clientWidth = 0` |
| Nol error console | Terukur di kelima render |
| `prefers-reduced-motion` dihormati | Lenis + Marquee + semua motion component |
| Struktur heading | Satu `<h1>`, heading berurutan |
| Gambar lazy-load | Semua di bawah fold memakai `loading="lazy"` |
| Section states | `SectionEmpty` / `SectionError` / `CardsSkeleton` sudah ada |
| SEO | Structured data, canonical, OG lengkap di `index.tsx` |

---

## 5. Keputusan yang dibutuhkan Owner

| # | Pertanyaan | Opsi | Rekomendasi riset |
|---|---|---|---|
| H-01 | Nasib sticky story (`cara-kerja`) | pertahankan / potong jadi 1 panel / hapus | **potong jadi 1 panel** |
| H-02 | Nasib galeri `Sekilas Ebrystore` | pertahankan / beri tautan / hapus | **beri tautan atau hapus** |
| H-03 | Section kosong (layanan platform 0 baris) | sembunyikan / tampilkan dengan penjelasan | **sembunyikan** |
| H-04 | Ambang minimum review untuk menampilkan section | 1 / 3 / 5 | **3**, di bawah itu sembunyikan |
| H-05 | Hero: banner saja atau teks + CTA | banner saja / teks + CTA di atas banner / teks + CTA menggantikan banner | **teks + CTA di atas banner** |
| H-06 | Section mana dari 7 yang belum terpasang untuk diaktifkan | Trust / FAQ / FinalCta / Founder / TwoPath / Tracking / FlowDiagram | **Trust + FAQ + FinalCta** dulu |

---

## 6. Status bukti

| Bagian | Status |
|---|---|
| Struktur & tinggi section | `VERIFIED` (ukur DOM) |
| Isi katalog & review | `VERIFIED` (query DB) |
| Section tidak terpakai | `VERIFIED` (grep seluruh `src/`) |
| Scroll-jack ganda | `VERIFIED` (kode + ukur) |
| Dampak ke konversi | `NOT_MEASURED` (belum ada analytics funnel untuk home) |
| Keputusan H-01..H-06 | `OWNER_DECISION_REQUIRED` |
