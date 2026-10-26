# Riset audit halaman toko penjual publik

Tanggal: 2026-10-03. Scope: `/toko/$slug` (halaman toko publik). Metode: pembacaan source halaman dan server function, inspeksi data live read-only, pengamatan snapshot DOM live, serta perbandingan dengan halaman publik lain (`/produk`, `/layanan`) dan standar marketplace. Tidak ada perubahan kode pada tahap riset ini.

## 1. Gambaran halaman saat ini

Halaman toko adalah storefront publik seorang seller. Kondisi saat ini:

- Link "Katalog" kembali ke `/produk`.
- Header toko: logo (atau ikon toko), nama, deskripsi, jumlah produk aktif.
- Satu section "Produk toko" berisi grid kartu produk digital.
- Empty state sederhana bila tidak ada produk.
- Halaman **tidak memakai `PageShell`**, sehingga tanpa header situs dan footer; hanya ada link kembali.

Data yang ditampilkan berasal dari `getPublicStore`: `id, name, slug, description, logo_url, status` untuk toko, dan `id, name, slug, short_description, thumbnail_url, price, discount_price` untuk produk published + approved (maksimal 48).

## 2. Temuan audit

### 2.1 Temuan kritis: halaman terputus dari situs

Halaman ini tidak memakai `PageShell`, padahal `/produk` dan `/layanan` memakainya. Akibatnya pengunjung yang masuk dari katalog kehilangan navigasi utama, pencarian, keranjang/akun, dan footer. Hanya ada satu link "Katalog".

Ini masalah paling besar: secara arsitektur informasi, halaman toko terasa seperti halaman asing, bukan bagian dari Ebrystore.

### 2.2 Jasa seller tidak muncul sama sekali

Toko `citrahttle` memiliki **1 jasa approved**, tetapi halaman toko hanya menampilkan produk digital. Pembeli yang menemukan toko dari kartu jasa di `/layanan` lalu membuka toko tidak menemukan jasa yang baru saja diklik.

Ini juga masalah kepercayaan: toko tampak lebih kecil dari kenyataannya, dan jalur belanja jasa terputus.

### 2.3 Tidak ada kepercayaan yang bisa diverifikasi

Halaman tidak menampilkan:

- Rating dan jumlah ulasan (tabel `product_reviews` sudah punya `store_id` dan policy publik untuk baris `is_visible = true`).
- Jumlah produk terjual.
- Tanggal bergabung atau status verifikasi toko.
- Respons seller atau indikator layanan.

Standar marketplace: pembeli memutuskan berdasarkan bukti sosial. Halaman ini tidak memberi satu pun. Yang ditampilkan hanya "2 produk aktif", yang lebih menyerupai metadata teknis daripada jaminan.

### 2.4 Informasi toko minim dan tidak informatif

- Deskripsi live hanya 12 karakter ("toko apa aja"). Tidak ada batas minimum di form pengaturan, jadi toko bisa tampil tanpa informasi berarti.
- Tidak ada kontak toko, padahal `contact_phone` tersimpan dan halaman pengaturan memintanya. Pembeli tidak punya jalur bertanya selain membeli.
- Tidak ada kebijakan toko, estimasi layanan, atau jam operasional (footer situs menyebut jam layanan, tetapi halaman toko tidak).
- Tidak ada tautan berbagi.

### 2.5 Pengurutan dan pemfilteran tidak ada

Produk hanya diurutkan `created_at desc` dan dibatasi 48 tanpa pemberitahuan. Toko dengan lebih dari 48 produk akan kehilangan sisanya tanpa jejak. Tidak ada pencarian dalam toko, filter kategori, urutan harga, atau penanda "terlaris/terbaru".

### 2.6 Kartu produk tidak konsisten dengan konteks toko

`MarketplaceProductCard` dipakai apa adanya. Di halaman toko, kartu tetap menampilkan label "Produk digital" pada placeholder dan tidak menampilkan nama toko (wajar karena sudah di halaman toko), tetapi juga tidak menampilkan rating produk, jumlah terjual, atau penanda diskon yang lebih jelas. Kartu di `/produk` dan di `/toko` identik, padahal konteksnya berbeda.

### 2.7 SEO dan metadata

- Title memakai `${store.name} — Ebrystore`, deskripsi dari `store.description` yang bisa kosong atau sangat pendek.
- Tidak ada `og:image` (logo toko tidak dipakai).
- Tidak ada data terstruktur (misalnya `Store`/`ItemList`), sehingga halaman toko lemah di hasil pencarian.
- Halaman tidak punya canonical, dan `slug` toko tidak pernah diubah setelah dibuat, jadi risiko duplikasi rendah, tetapi tetap tidak ada penanganan.

### 2.8 Detail kecil yang memperkuat kesan "belum jadi"

- Tombol/heading "Produk toko" memakai uppercase dengan tracking lebar, berbeda dari pola judul section di halaman publik lain.
- Tidak ada indikator loading: `loader` berjalan server-side, jadi halaman tampil utuh, tetapi tidak ada `pendingComponent` seperti `/layanan`.
- Tidak ada penanda "toko ini menjual jasa" atau "toko ini menjual produk digital" pada header.
- Logo kosong hanya menampilkan ikon toko generik tanpa inisial nama, padahal avatar inisial adalah pola yang sudah ada di aplikasi.

## 3. Perbandingan dengan standar marketplace

| Elemen | Shopee/Tokopedia/Fiverr seller page | Ebrystore `/toko` sekarang |
| --- | --- | --- |
| Header toko (logo, nama, deskripsi) | Ada, dengan banner | Ada, tanpa banner |
| Rating + jumlah ulasan | Ada | Tidak ada (data tersedia) |
| Jumlah terjual / transaksi | Ada | Tidak ada |
| Bergabung sejak | Ada | Tidak ada (data tersedia) |
| Kontak / chat penjual | Ada | Tidak ada (data tersedia) |
| Tab produk vs jasa | Ada | Tidak ada (jasa tersedia) |
| Pencarian/urut/filter dalam toko | Ada | Tidak ada |
| Kebijakan toko | Ada | Tidak ada |
| Bagian situs (header/footer) | Ada | Tidak ada |

## 4. Data yang sudah tersedia namun belum dipakai

Dari inspeksi read-only terhadap toko live:

- `stores.contact_phone` terisi, `contact_email` kosong, `logo_url` kosong, deskripsi 12 karakter.
- `stores.created_at` tersedia (bergabung sejak).
- 2 produk published + approved; 1 dengan thumbnail.
- 1 jasa approved di toko yang sama.
- `product_reviews` kosong untuk toko ini (0 ulasan), artinya rating jujur akan tampil "Belum ada ulasan", bukan angka karangan.
- Fungsi `store_rating_summary` sudah ada (SECURITY DEFINER) tetapi hanya diberikan ke `authenticated`, belum untuk publik.

Kesimpulan penting: sebagian besar perbaikan **tidak membutuhkan tabel baru**. Yang perlu adalah perluasan query publik (jasa, rating, sold count, created_at), penyajian UI, dan kebijakan akses baca publik untuk agregat rating.

## 5. Rekomendasi

Prioritas berdasarkan dampak dan biaya:

**P1, wajib:**

1. Bungkus halaman dengan `PageShell` agar header/footer situs kembali.
2. Tampilkan jasa seller approved di halaman toko (section terpisah atau tab).
3. Header toko diperkaya: avatar inisial bila tanpa logo, rating + jumlah ulasan (dengan state "Belum ada ulasan"), jumlah transaksi selesai, dan "Bergabung sejak".
4. Kontak toko: tampilkan WhatsApp bila tersedia, dengan format aman.

**P2, penting:**

5. Pencarian dan pengurutan dalam toko (terbaru, harga, terlaris) untuk produk dan jasa.
6. Penanganan produk lebih dari batas: muat bertahap atau halaman kedua, bukan dipotong diam-diam.
7. Kartu di halaman toko diberi konteks: rating produk, jumlah terjual, dan penanda jenis (produk/jasa).

**P3, nilai tambah:**

8. Data terstruktur `ItemList`/`Store` dan `og:image` dari logo.
9. Tombol bagikan toko.
10. Kebijakan toko singkat (retur/refund mengikuti kebijakan platform, atau catatan seller).

## 6. Batas dan risiko

- Rating harus jujur: bila belum ada ulasan, tampilkan "Belum ada ulasan", bukan 0.0 bintang yang tampak buruk, dan bukan angka karangan.
- Jumlah terjual harus dihitung dari data nyata (misalnya `sold_count` yang sudah ada pada produk atau agregat order selesai), bukan estimasi.
- Menampilkan jasa di halaman toko menyentuh query publik; harus tetap memakai proyeksi publik dan server-only client seperti katalog jasa, tanpa membuka akses tabel privat ke anon.
- Kontak seller adalah data pribadi: tampilkan hanya yang seller sendiri isi, dan jangan menampilkan email bila kosong.
- Kebijakan privasi/retensi untuk data agregat rating publik perlu keputusan owner sebelum fungsi rating dibuka ke anon.

Framework kerja disusun di `docs/remediation/2026-10-03-mgrcao-v3-redesign-halaman-toko-penjual.md`.
