# Riset bug penilaian produk tidak masuk ke toko

Tanggal: 2026-10-03. Scope: alur ulasan produk (`product_reviews`) dan mengapa rating tidak muncul di halaman toko dan menu Performa seller. Metode: pembacaan source, definisi RPC live, dan inspeksi data read-only.

## 1. Gejala

- Pembeli mengirim ulasan bintang 5 untuk sebuah produk.
- Halaman toko menampilkan "Belum ada ulasan".
- Menu Performa seller menampilkan rating 0 dengan 0 ulasan.
- Ulasan tetap terlihat di halaman produk itu sendiri.

## 2. Akar masalah

Kolom `product_reviews.store_id` ditambahkan di migration `20260930100017_seller_reviews.sql` dengan backfill satu kali untuk data lama. Namun **RPC `submit_product_review` tidak pernah diperbarui** untuk mengisi `store_id` pada ulasan baru.

Bukti dari database live:

- `product_reviews.store_id` nullable, dan satu-satunya ulasan yang ada memiliki `store_id = null`, sedangkan produknya milik toko `7be141f5-...`.
- Definisi live `submit_product_review` tidak memuat `store_id` sama sekali (`rpc_has_store: false`).

Akibatnya semua ulasan yang dibuat setelah migration itu tersimpan dengan `store_id` kosong.

## 3. Dampak berantai

| Konsumen | Filter | Akibat |
| --- | --- | --- |
| `listStoreReviews` (menu Performa seller) | `.eq("store_id", storeId)` | Ulasan tidak pernah terlihat seller |
| `store_rating_summary` (rating toko) | `WHERE store_id = _store_id` | Rating selalu 0 dan jumlah 0 |
| Halaman toko publik | memakai `store_rating_summary` | Menampilkan "Belum ada ulasan" |
| Policy RLS `reviews_select_seller_own` | `store_id = my_store_id()` | Seller tidak bisa membaca ulasannya sendiri |
| `listProductReviews` (halaman produk) | `.eq("product_id", ...)` | Tetap bekerja, karena tidak memakai `store_id` |

Jadi gejalanya terlihat seperti "rating tidak masuk", padahal datanya masuk; hanya penautan ke toko yang kosong.

## 4. Ada dua jalur tulis, satu di antaranya tidak tercakup

1. RPC `submit_product_review` (jalur utama dari UI) — tidak mengisi `store_id`.
2. INSERT langsung lewat RLS policy "Buyers can create review for purchased product" — juga tidak mengisi `store_id`, karena nilai datang dari klien.

Perbaikan hanya di RPC tidak cukup: jalur kedua akan tetap menghasilkan baris tanpa toko. Karena itu perbaikan yang tahan lama adalah **trigger** di level tabel, yang menurunkan `store_id` dari `digital_products.store_id` untuk semua jalur tulis.

## 5. Perbaikan yang diusulkan

1. Backfill data lama: `UPDATE product_reviews SET store_id = dp.store_id FROM digital_products dp WHERE product_reviews.product_id = dp.id AND product_reviews.store_id IS NULL`.
2. Tambah trigger `BEFORE INSERT OR UPDATE` pada `product_reviews` yang selalu mengisi `store_id` dari produk, sehingga tidak ada jalur tulis yang bisa melewatkannya.
3. Verifikasi: ulasan lama kembali tertaut, rating toko terhitung, seller melihat ulasannya, dan policy RLS bekerja.

## 6. Catatan

- Tidak ada perubahan skema tabel; hanya backfill dan trigger.
- Tidak ada perubahan pada aturan "hanya pembeli yang boleh mengulas"; itu tetap dijaga RPC dan policy.
- `is_visible` tetap dihormati pada semua agregat.

Framework kerja disusun di `docs/remediation/2026-10-03-mgrcao-v3-fix-rating-ulasan-toko.md`.
