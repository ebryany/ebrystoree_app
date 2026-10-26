# Bukti keamanan upload, XSS, dan integritas data

Tanggal: 2026-10-03. Role: **Security Engineer**.

## Ringkasan

Audit tiga area (file upload, XSS, manipulasi data via intercept request) menghasilkan empat celah nyata. Dua fase sudah dikerjakan dan terverifikasi; dua fase lain (rate limit per IP, nonce CSP) dicatat sebagai pekerjaan berikutnya beserta alasannya.

## Fase 1: Batas storage (selesai)

Migration `20261003240000_storage_bucket_limits.sql` diterapkan dan terverifikasi.

| Bucket | Batas ukuran | Jumlah MIME | Sebelum |
| --- | --- | --- | --- |
| product-files | 100 MB | 18 | **tanpa batas ukuran, tanpa MIME** |
| job-results | 40 MB | 12 | tanpa MIME |
| academic-order-attachments | 20 MB | 12 | tanpa MIME |
| avatars | 2 MB | 4 | sudah baik |
| catalog-images | 5 MB | 4 | sudah baik |
| payment-proofs | 5 MB | 4 | sudah baik |
| service-deliveries | 25 MB | 11 | sudah baik |
| service-media | 25 MB | 6 | sudah baik |

Hasil verifikasi live: **8/8 bucket punya batas ukuran dan MIME; tidak ada SVG atau HTML di daftar izin mana pun.**

Migration juga memasang penjaga yang menolak kondisi tidak aman (`BUCKET_LIMIT_MISSING`, `UNSAFE_MIME_ALLOWED`, `BUCKET_MANIFEST_UNSAFE`), sehingga bucket baru yang dibuat tanpa batas akan terdeteksi.

Bukti: `.zcode/storage-limits-db-test.json`, `.zcode/storage-limits-db-apply.json`, `.zcode/storage-limits-db-verify.json`.

## Fase 2: Integritas metadata berkas (selesai)

Tiga jalur "unggah dulu, daftar kemudian" diperketat. Sebelumnya ukuran dan tipe yang dicatat berasal dari klaim klien; sekarang dibaca dari metadata objek storage dan harus cocok.

| Jalur | Sebelum | Sesudah |
| --- | --- | --- |
| `registerAcademicAttachment` | path + ukuran/MIME dari klien; objek tidak diverifikasi | objek harus ada; `actualSize`/`actualMime` dibaca dari storage; klaim tidak cocok ditolak |
| `registerMyFile` (seller-files) | objek diverifikasi ada; ukuran dari klien | ukuran dari objek; klaim tidak cocok ditolak |
| `registerProductFile` (product-files) | objek diverifikasi ada; ukuran dari klien | ukuran dari objek; klaim tidak cocok ditolak |

Dampak: penyerang tidak dapat lagi mencatat berkas 20 MB sebagai 1 byte, atau menandai PDF sebagai PNG. Baris database kini mencerminkan objek yang benar-benar tersimpan.

## Yang sudah kuat sebelum audit (diverifikasi, bukan diasumsikan)

### Manipulasi request tidak dapat mengubah uang

| Data | Sumber kebenaran | Bukti |
| --- | --- | --- |
| Harga produk | RPC `create_digital_order` membaca DB | `createDigitalOrder` hanya menerima `productId`, `quantity`, `idempotencyKey` |
| Total jasa | RPC membaca DB; `expectedTotal` hanya deteksi quote basi | `createMarketplaceServiceOrder` |
| Status order/pembayaran | RPC dengan guard state + kepemilikan | lifecycle functions |
| Peran pengguna | `user_roles` diisi server | grant tulis anon sudah dicabut di migration 20261003210000 |
| Saldo seller | Hanya `credit_seller_earnings` setelah acceptance | migration 20261003120000 |
| Biaya admin | Dibaca dari `system_settings` di RPC quote | migration 20261003140000 |

### XSS

- Hanya satu `dangerouslySetInnerHTML` di seluruh aplikasi: `chart.tsx` untuk CSS variabel tema. Tidak ada pemanggil yang memasukkan data pengguna ke `config`.
- Artikel dirender sebagai React node oleh parser sendiri; tautan difilter `isSafeUrl` (menolak `javascript:`, `data:`, `vbscript:`, `file:`).
- Aset banner memakai validator ketat `isBannerAssetUrl` (UUID + ekstensi gambar saja), contoh terbaik dari validasi nilai yang dipakai sebagai background.
- React escaping aktif untuk seluruh teks.

## Test dan build

| Pemeriksaan | Hasil |
| --- | --- |
| Unit test | 29 file, **384 tes lulus** |
| Test baru | 10 tes (batas bucket, integritas metadata, boundary request, XSS) |
| Build produksi | exit 0 |
| TypeScript file terkait | 0 error |

## Batas yang belum dikerjakan (jujur)

- **Rate limit per IP untuk aksi anonim** belum diterapkan. Saat ini pembatasan berbasis `userId`, sehingga penyerang dengan banyak akun dapat melewatinya.
- **Nonce CSP** belum dievaluasi sampai tuntas; `script-src 'unsafe-inline'` masih diperlukan untuk hidrasi SSR TanStack Start. Ini dicatat sebagai tertunda, bukan diklaim selesai.
- **Sanitasi terpusat** untuk konten pengguna panjang belum ada; React escaping sudah mencegah eksekusi, tetapi lapisan kedua belum dibangun.
- **Verifikasi metadata** belum diterapkan pada jalur `po-thread` (bukti transfer PO); jalur ini sudah memverifikasi objek lewat `submit_payment_proof` di database, jadi risikonya lebih rendah, tetapi belum seragam dengan yang lain.
- Tidak ada deployment frontend produksi, commit, atau push.
