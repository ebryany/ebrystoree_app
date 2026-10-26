# MGRCAO V3: redesain halaman home

Tanggal: 2026-10-04. Dasar: [riset redesain home](../ui-ux/2026-10-04-riset-redesign-home.md). Status: framework; menunggu keputusan owner pada dua hal.

## M: Mission

Mengubah home dari daftar section seragam menjadi halaman yang memberi **orientasi** dan **kepercayaan** dalam beberapa detik pertama, tanpa menambah klaim atau aset palsu.

Diagnosis riset: halaman sehat secara teknis tetapi datar. Ada satu kerusakan nyata (section kategori selalu kosong karena tidak ada kategori produk) dan satu kekosongan komunikasi (jaminan escrow yang benar-benar berjalan tidak pernah ditampilkan).

## G: Goal

1. Section kategori berfungsi atau diganti dengan data yang nyata.
2. Hero ringkas: marketplace ini apa, untuk siapa, dan aksi pertama.
3. Variasi komposisi antar section, bukan empat grid identik.
4. Section kepercayaan berisi tiga jaminan yang benar-benar berjalan.
5. Jalur masuk untuk calon seller.
6. Kategori jasa ditampilkan (13 kategori nyata).
7. Pencarian dari home mencakup jasa.
8. Animasi masuk halus yang hormat reduced motion.
9. Tidak ada angka, testimoni, atau aset yang dikarang.

## R: Role

Frontend/UI/UX Specialist marketplace, bekerja sendiri tanpa spawn agent. Mandat: `src/routes/index.tsx`, komponen di `src/components/home/`, dan penyesuaian kecil pada komponen kartu bila perlu. Tidak menyentuh database, RPC, atau aturan bisnis.

## C: Constraints

- Data live saat riset: 2 produk, 2 jasa seller, 0 layanan platform, 13 kategori jasa, 0 kategori produk.
- Section kosong tetap jujur; tidak boleh menampilkan angka atau konten palsu.
- Jaminan yang dikomunikasikan harus benar-benar berjalan di sistem (escrow, moderasi, ulasan pembeli).
- Tanpa dependency baru; gunakan komponen existing (`BannerSlider`, `MarketplaceProductCard`, `SellerServiceCard`, `seller-entry-card`).
- Target sentuh 44px, focus ring terlihat, reduced motion dihormati.
- Bahasa Indonesia, tanpa em dash.

## A: Actions

1. **Perbaiki section kategori.** Keputusan owner diperlukan: seed kategori produk, ganti ke kategori jasa, atau tampilkan keduanya.
2. **Hero.** Blok orientasi di atas katalog: judul, satu baris penjelasan, dua aksi.
3. **Variasi komposisi.** Produk grid padat; jasa kartu lebih besar dengan penekanan kesepakatan; layanan akademik layout berbeda.
4. **Section kepercayaan.** Tiga poin: dana ditahan sampai hasil diterima, seller lulus moderasi, ulasan hanya dari pembeli.
5. **Jalur seller.** Blok ajakan memakai `seller-entry-card`.
6. **Kategori jasa.** Chips dari 13 kategori service yang nyata.
7. **Pencarian.** Perluas cakupan atau beri dua tab.
8. **Animasi.** Masuk per section dengan `useReducedMotion`.
9. Test kontrak dan verifikasi browser.

## O: Outcome

- Tidak ada lagi section yang selalu menampilkan pesan kosong.
- Pengunjung baru memahami marketplace dalam satu layar pertama.
- Setiap section punya komposisi yang berbeda dan alasan yang dapat ditulis.
- Kepercayaan ditampilkan dari mekanisme nyata, bukan klaim.
- Seller punya jalur masuk yang jelas.
- Reduced motion dihormati; target sentuh 44px.
- Tests/build dilaporkan apa adanya; bagian yang belum diverifikasi ditandai jujur.

## Keputusan owner yang diperlukan

1. **Kategori produk:** buat kategori produk baru, ganti section ke kategori jasa, atau tampilkan keduanya?
2. **Hero:** boleh memakai judul dan deskripsi yang ditulis ulang, atau owner menyediakan teksnya?
