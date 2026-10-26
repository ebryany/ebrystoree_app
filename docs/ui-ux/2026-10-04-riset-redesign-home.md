# Riset: peningkatan UI/UX dan layout halaman home

Tanggal: 2026-10-04. Scope: `/` (halaman home publik). Metode: pembacaan source `src/routes/index.tsx` (378 baris), komponen pendukung, inspeksi data live read-only, dan pengamatan snapshot DOM live. Tidak ada perubahan kode pada tahap riset ini.

## 1. Kondisi saat ini

Struktur halaman (terverifikasi dari source dan live):

1. Banner slider (dari pengaturan admin)
2. "Belanja berdasarkan kategori" — chips kategori produk
3. "Produk digital" — grid 4 kolom, 6 produk
4. "Jasa seller" — grid 3 kolom, 2 jasa
5. "Pendampingan akademik" — grid layanan platform
6. Footer bantuan

Yang sudah baik: `PageShell`, `sr-only` h1, Suspense per section dengan error boundary terpisah, empty state jujur, target sentuh 44px, dan struktur semantik (`aria-labelledby`).

## 2. Diagnosis: kenapa terasa basic

### 2.1 Section kategori selalu kosong (temuan nyata)

`categoriesQuery` memanggil `listCatalogCategories({ kind: "product" })`. Data live menunjukkan **tidak ada satu pun kategori berjenis `product`** di database; yang ada 13 kategori `service`.

Akibatnya, setiap pengunjung melihat:
> "Kategori belum tersedia. Semua produk tetap bisa dilihat di katalog."

Section pertama setelah banner **selalu gagal memberi nilai**. Ini bukan sekadar kosmetik; ini fitur yang tidak pernah berfungsi sejak data nyata masuk.

Dua kemungkinan penyebab yang perlu diputuskan owner:
- Kategori produk memang belum pernah dibuat (perlu seed kategori), atau
- Navigasi kategori produk seharusnya memakai kategori jasa/platform.

### 2.2 Tidak ada hero, hanya banner

Halaman dibuka langsung dengan banner gambar. Tidak ada satu pun kalimat yang menjelaskan: ini marketplace apa, menjual apa, dan kenapa pembeli harus percaya. Pengunjung pertama tidak mendapat orientasi.

Standar marketplace: hero atau setidaknya satu baris nilai jelas di atas lipatan.

### 2.3 Semua section berbentuk sama

Empat section berturut-turut memakai pola identik: judul kiri + deskripsi + tombol kanan + grid kartu. Tidak ada variasi komposisi. Mata tidak punya titik istirahat, dan tidak ada hierarki antar section. Ini pola "uniform section rhythm" yang membuat halaman terasa datar.

### 2.4 Tidak ada kepercayaan yang terlihat

Halaman tidak menampilkan:
- Jumlah toko aktif atau jumlah jasa tersedia (data tersedia).
- Bukti sosial dari ulasan yang sudah ada (`product_reviews` sudah punya data dan policy publik).
- Cara kerja pemesanan (padahal `/bantuan` punya materinya).
- Jaminan transaksi (dana ditahan sampai pembeli menerima hasil) yang merupakan pembeda utama marketplace ini.

Padahal jaminan itu **benar-benar berjalan** di sistem; hanya tidak pernah dikomunikasikan di home.

### 2.5 Tidak ada jalur masuk untuk seller

Halaman home hanya berbicara ke pembeli. Tidak ada satu pun ajakan atau tautan untuk calon seller, padahal marketplace baru sangat membutuhkan pasokan seller. `seller-entry-card.tsx` sudah ada di komponen tetapi tidak dipakai di home.

### 2.6 Navigasi kategori tidak konsisten

Chips kategori hanya untuk produk, sedangkan jasa seller punya 13 kategori yang tidak pernah ditampilkan. Pembeli tidak punya cara menelusuri jasa berdasarkan kategori dari home.

### 2.7 Pencarian hanya produk

Header menampilkan "Cari produk digital" dan mengarah ke `/produk`. Jasa seller tidak tercakup dalam pencarian dari home.

### 2.8 Detail kecil

- Banner tunggal tidak punya indikator posisi bila hanya satu slide.
- Section "Pendampingan akademik" tidak punya tombol menuju katalog layanan, padahal section lain punya.
- Grid produk 4 kolom vs jasa 3 kolom tanpa alasan yang jelas.
- Tidak ada animasi masuk; konten muncul seketika.

## 3. Data yang tersedia tetapi belum dipakai di home

Dari inspeksi read-only:

| Data | Nilai live | Potensi pemakaian |
| --- | --- | --- |
| Produk published + approved | 2 | Sudah dipakai |
| Jasa seller approved | 2 | Sudah dipakai |
| Layanan platform | 0 | Section tampil kosong (jujur) |
| Kategori service | 13 aktif | Belum dipakai di home |
| Kategori product | 0 | Section kategori kosong |
| Banner | 5 setting | Dipakai |
| Ulasan produk | ada | Belum dipakai di home |

## 4. Rancangan yang diusulkan

### 4.1 Hero ringkas yang jujur

Satu blok di atas banner atau menggantikan banner tunggal: judul nilai, satu baris penjelasan, dan dua aksi nyata ("Jelajahi produk", "Lihat jasa seller"). Tanpa angka karangan; bila ingin menampilkan angka, pakai jumlah nyata dari database.

### 4.2 Perbaiki atau ganti section kategori

Pilihan yang jujur:
- Bila owner ingin kategori produk: buat kategori produk terlebih dahulu, atau
- Ganti section menjadi "Jelajahi kategori jasa" memakai 13 kategori service yang benar-benar ada, atau
- Tampilkan keduanya: kategori jasa (nyata) + kategori produk (bila ada).

Yang tidak boleh: membiarkan section yang selalu menampilkan pesan kosong.

### 4.3 Variasi komposisi antar section

- Produk digital: grid padat (katalog).
- Jasa seller: kartu lebih besar dengan penekanan kesepakatan (karena jasa butuh pertimbangan).
- Layanan akademik: layout berbeda, mis. daftar horizontal dengan ikon tahapan.
- Sisipkan satu section "cara kerja" ringkas di antara katalog dan penutup.

### 4.4 Section kepercayaan

Tiga poin nyata yang benar-benar berjalan:
1. Dana ditahan sampai pembeli menerima hasil (escrow).
2. Seller harus lulus moderasi sebelum jasa tayang.
3. Ulasan hanya dari pembeli yang benar-benar membeli.

Ditambah bukti sosial: ulasan terbaru yang sudah ada (`product_reviews` dengan `is_visible = true`).

### 4.5 Jalur seller

Satu blok ajakan untuk membuka toko, memakai `seller-entry-card` yang sudah ada.

### 4.6 Pencarian dan kategori

- Pencarian header mencakup produk dan jasa, atau diberi dua tab.
- Chips kategori jasa ditampilkan di home (data nyata tersedia).

### 4.7 Animasi

Masuk halus per section dengan `useReducedMotion`, bukan animasi di mana-mana. Satu titik fokus per layar.

## 5. Prioritas

**P0:** perbaiki section kategori yang selalu kosong; tambah hero yang menjelaskan marketplace.
**P1:** variasi komposisi section; section kepercayaan; jalur seller; kategori jasa.
**P2:** pencarian mencakup jasa; animasi masuk; konsistensi grid.

## 6. Batas

- Tidak menambah angka atau statistik yang tidak punya sumber.
- Tidak memakai ilustrasi atau aset baru tanpa persetujuan.
- Data live saat riset: 2 produk, 2 jasa seller, 0 layanan platform, 13 kategori jasa, 0 kategori produk.
- Section kosong tetap ditampilkan jujur, tetapi tidak boleh menjadi satu-satunya isi section yang seharusnya berfungsi.

## 7. Kesimpulan

Halaman home secara teknis sehat tetapi datar: struktur seragam, tanpa orientasi, tanpa kepercayaan yang terlihat, dan satu section yang selalu gagal karena kategori produk tidak pernah ada. Peningkatan yang paling berdampak bukan menambah dekorasi, melainkan memberi orientasi (hero), memperbaiki section yang rusak, memvariasikan komposisi, dan menampilkan jaminan transaksi yang sudah benar-benar berjalan.

Framework kerja: `docs/remediation/2026-10-04-mgrcao-v3-redesign-home.md`.
