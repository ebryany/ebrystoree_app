# MGRCAO V3: perbaikan rating dan ulasan toko

Tanggal: 2026-10-03. Dasar: [riset bug rating ulasan toko](../audit/2026-10-03-riset-bug-rating-ulasan-toko.md). Status: framework untuk pekerjaan berikutnya.

## M: Mindset

Ulasan adalah data milik pembeli dan reputasi milik seller. Bug ini bukan soal tampilan: ulasan benar-benar tersimpan, tetapi tidak pernah tertaut ke toko, sehingga seller dan pengunjung melihat "belum ada ulasan" padahal ada.

Perbaikan harus di level data, bukan tambalan UI. Selama jalur tulis masih bisa menghasilkan baris tanpa toko, gejala akan kembali. Karena itu penjagaannya diletakkan di tabel (trigger), bukan hanya di satu RPC.

## G: Goal

1. Ulasan baru selalu tertaut ke toko produknya, apa pun jalur tulisnya.
2. Ulasan lama yang `store_id` kosong di-backfill ke toko yang benar.
3. Rating dan jumlah ulasan toko terhitung; halaman toko dan menu Performa menampilkannya.
4. Seller dapat membaca ulasan tokonya sesuai policy.
5. Tidak ada perubahan aturan: hanya pembeli produk yang boleh mengulas; `is_visible` tetap dihormati.
6. Verifikasi dengan fixture rollback, tanpa mengubah data ulasan nyata selain backfill yang disengaja.

## R: Role

Engineer database dan backend marketplace, bekerja sendiri tanpa spawn agent. Mandat terbatas pada:

- Migration baru untuk backfill dan trigger pada `product_reviews`.
- `src/lib/reviews.functions.ts` dan `src/lib/seller.functions.ts` bila ada penyesuaian query.
- Test terkait.

Di luar allowlist: berhenti dan catat blocker. Tidak menyentuh jalur uang, lifecycle pesanan, atau kebijakan moderasi.

## C: Constraints

- Jangan mengedit migration yang sudah diterapkan; buat migration baru.
- Trigger harus menurunkan `store_id` dari `digital_products.store_id`, dan tidak menimpa nilai yang sudah benar.
- Backfill hanya menyentuh baris `store_id IS NULL`; jangan menimpa tautan yang sudah ada.
- Jangan melonggarkan RLS: policy tetap berbasis pemilik toko dan `is_visible`.
- Jangan mengubah signature `submit_product_review` agar tidak memutus pemanggil yang ada.
- Verifikasi memakai fixture rollback; data ulasan nyata hanya berubah oleh backfill yang memang tujuan pekerjaan.
- Setiap klaim hasil harus disertai bukti query.

## A: Actions

1. Migration: backfill `store_id` untuk ulasan lama dari produk.
2. Migration: trigger `BEFORE INSERT OR UPDATE` yang mengisi `store_id` dari produk, tahan untuk semua jalur tulis.
3. Verifikasi live: jumlah ulasan yang masih `store_id IS NULL` harus nol setelah backfill.
4. Verifikasi agregat: `store_rating_summary` mengembalikan rata-rata dan jumlah yang benar untuk toko yang punya ulasan.
5. Periksa dampak ke `listStoreReviews` dan halaman toko; pastikan tampil tanpa perubahan kode bila query sudah benar.
6. Tests: kontrak migration (backfill hanya null, trigger ada dan mengisi dari produk, tidak melonggarkan RLS).
7. Evidence: hasil verifikasi database dan klik-through halaman toko serta Performa seller.

## O: Acceptance

- Tidak ada lagi ulasan dengan `store_id` kosong.
- Ulasan baru dari jalur RPC maupun insert langsung otomatis tertaut ke toko.
- `store_rating_summary` menghitung ulasan toko dengan benar; halaman toko menampilkan rating, bukan "Belum ada ulasan", saat ulasan ada.
- Menu Performa seller menampilkan ulasan tokonya.
- Aturan ulasan tidak berubah: hanya pembeli yang boleh mengulas, dan `is_visible = false` tetap disembunyikan dari publik.
- Tidak ada migration lama yang diedit; perubahan tercatat sebagai migration baru dan diverifikasi.
