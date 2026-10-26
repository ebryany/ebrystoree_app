# Riset: redesain kartu produk digital dan jasa seller

Tanggal: 2026-10-04. Scope: kartu di section "Produk digital" dan "Jasa seller" pada halaman home. Metode: pembacaan source `catalog-cards.tsx` dan `seller-service-card.tsx`, inventaris token desain, dan audit jalur pembelian yang tersedia. Tidak ada perubahan kode pada tahap riset ini.

## 1. Kondisi saat ini

### Kartu produk digital (`MarketplaceProductCard` variant `home`)

- Seluruh kartu dibungkus satu `<Link>` besar menuju halaman detail produk.
- Thumbnail `object-contain` di dalam kotak `aspect-square` berlatar `bg-secondary`.
- Judul, deskripsi singkat, nama toko, harga, dan footer "Lihat detail produk".
- Tidak ada bayangan; hanya border tipis.

### Kartu jasa seller (`SellerServiceCard`)

- Sampul `aspect-[16/9]` `object-cover` bila ada media.
- Kategori, judul (link ke checkout), nama toko (link ke toko), scope, durasi, revisi.
- Tombol "Pesan jasa" full width di bawah, plus `<details>` kesepakatan.
- Tidak ada bayangan.

## 2. Masalah yang membuat terasa basic

### 2.1 Tidak ada hierarki visual

Kedua kartu memakai border tipis 1px tanpa elevasi. Di grid 4 kolom, semuanya terlihat sama rata; mata tidak punya tempat berhenti. Tidak ada perbedaan bobot antara kartu biasa dan kartu unggulan.

### 2.2 Kartu produk adalah satu link raksasa

Seluruh kartu dapat diklik, tetapi tidak ada satu pun tombol yang terlihat. Pengguna tidak tahu apa yang akan terjadi saat menekan, dan tidak ada aksi yang bisa dipilih. Ini kebalikan dari kartu jasa yang punya tombol jelas.

### 2.3 Informasi kunci tenggelam

- Harga memakai `text-lg` di dalam blok bawah, tetapi tidak ada pemisah visual dari deskripsi.
- Nama toko hanya teks abu-abu kecil.
- Tidak ada penanda "produk digital" vs "jasa" selain dari konteks section.
- Diskon hanya badge kecil di pojok kiri atas.

### 2.4 Interaksi hover hampir tidak terasa

Hanya `hover:border-primary`. Tidak ada elevasi, tidak ada gerak, tidak ada sinyal bahwa kartu itu interaktif.

### 2.5 Inkonsistensi antar dua kartu

Kartu produk: rasio gambar 1:1, padding `p-3 sm:p-4`.
Kartu jasa: rasio gambar 16:9, padding `p-4 sm:p-5`, punya tombol, punya disclosure.
Dua kartu di halaman yang sama memakai bahasa visual berbeda tanpa alasan.

### 2.6 Tombol "Lihat detail produk" memakai warna permukaan penuh

Footer kartu memakai `bg-surface-selected` yang berubah menjadi primary saat hover. Efeknya kartu terlihat seperti punya dua lapisan yang bersaing, bukan satu kesatuan.

## 3. Token yang sudah tersedia (tidak perlu menambah)

| Token | Nilai | Kegunaan |
| --- | --- | --- |
| `--shadow-card` | 2 lapis halus | Elevasi kartu |
| `glow-soft` | shadow + glow aksen 16% | Glow saat hover (dose cap: 1-2 elemen) |
| `--accent` | teal | Aksen |
| `--price` | merah bata | Harga |
| `--surface-selected` | teal muda | Permukaan sekunder |

Catatan anti-slop: glow hanya boleh dipakai sebagai aksen pada maksimal 1-2 elemen, bukan di semua kartu sekaligus. Karena itu glow dipakai **saat hover saja** pada kartu yang sedang disorot.

## 4. Jalur pembelian yang tersedia (temuan)

Aplikasi **tidak memiliki sistem keranjang**. Tidak ada tabel cart, tidak ada `addToCart`, dan tidak ada halaman keranjang.

Yang tersedia: checkout langsung per item.
- Produk: `/checkout/produk/$slug` (sudah dipakai halaman detail dengan tombol "Beli sekarang").
- Jasa seller: `/checkout/jasa/$id` (sudah dipakai kartu jasa dengan tombol "Pesan jasa").

Karena itu tombol beli di kartu produk **dapat** diarahkan langsung ke checkout produk tanpa membangun sistem baru. Keputusan owner: perbaiki kartu dulu, CTA menyusul.

## 5. Rancangan redesain

### 5.1 Prinsip

1. **Hierarki lewat elevasi, bukan dekorasi.** Kartu diam; kartu yang disorot naik.
2. **Harga adalah puncak.** Harga dipisahkan garis dan diberi bobot terbesar.
3. **Satu aksi utama yang jelas.** Setiap kartu punya satu tombol nyata.
4. **Konsisten antar kartu.** Produk dan jasa memakai kerangka yang sama: media → identitas → fakta → harga → aksi.

### 5.2 Kartu produk digital

- Media: rasio tetap, `object-cover`, dengan latar netral.
- Badge diskon dipindah ke atas media dengan bentuk yang konsisten.
- Judul dua baris, deskripsi satu-dua baris.
- Toko dengan ikon kecil.
- Garis pemisah, lalu harga besar dengan warna `--price`.
- Footer: tombol aksi nyata (arah ke detail, atau ke checkout sesuai keputusan owner nanti).

### 5.3 Kartu jasa seller

- Sampul 16:9 dengan kategori sebagai label di atas gambar.
- Judul dan toko.
- Fakta kerja sebagai baris ringkas: durasi, revisi, jenis kesepakatan.
- Harga.
- Tombol "Pesan jasa" (sudah ada) dipertahankan.

### 5.4 Interaksi

- Hover: naik 2px + `shadow-card` + glow halus pada border (satu elemen yang disorot, bukan semua).
- Fokus keyboard: ring jelas dengan perlakuan sama seperti hover.
- Reduced motion: tanpa transform, hanya perubahan warna.

### 5.5 Yang tidak dilakukan

- Tidak menambah gradient, orb, atau dekorasi tanpa fungsi.
- Tidak menambah tombol keranjang karena fitur itu tidak ada.
- Tidak mengubah data atau jalur checkout.

## 6. Batas

- Kartu dipakai di beberapa halaman (`/produk`, `/layanan`, home). Perubahan harus tetap benar di semua tempat.
- Varian `default` (non-home) dipakai halaman katalog; jangan dirusak.
- Tidak ada data baru yang ditampilkan; hanya penyajian ulang data yang sudah ada.

## 7. Kesimpulan

Masalah kartu bukan kurang dekorasi, melainkan tidak ada hierarki: semua elemen berbobot sama, hover hampir tidak terasa, dan dua kartu di halaman yang sama memakai bahasa visual berbeda. Perbaikan yang tepat: elevasi saat hover, harga sebagai puncak, satu aksi jelas, dan kerangka konsisten antar kartu.

Framework kerja: `docs/remediation/2026-10-04-mgrcao-v3-redesign-card-produk-jasa.md`.
