# Riset penerimaan produk digital Ebrystore

Tanggal: 2026-10-02.
Scope: produk digital setelah pembayaran, akses produk, konfirmasi penerimaan buyer, dan completion order. Dokumen ini bukan implementasi.

## Kesimpulan

Konfirmasi penerimaan produk digital belum tersedia pada jalur buyer yang diperiksa. Manual dan QRIS langsung menyelesaikan order setelah pembayaran, bahkan ketika alokasi stok melaporkan produk belum tersedia. Pembayaran lunas, akses tersedia, dan penerimaan buyer perlu dibedakan.

Perbaikan paling kecil yang konsisten: order digital baru tetap `paid` setelah pembayaran; akses diberikan seperti sekarang; buyer mengonfirmasi seluruh produk tersedia dan sesuai; baru order menjadi `completed`. Tidak menambahkan status order global atau membuat sistem escrow baru.

Konsekuensi penting: trigger seller existing mengkredit saat `paid` maupun `completed`. Dengan rekomendasi ini kredit seller tetap terjadi sebelum konfirmasi buyer. Receipt bukan hold/release dana. Pemisahan saldo tertahan/tersedia, release, dan payout memerlukan scope serta rancangan keuangan terpisah.

## Metode dan batas bukti

- Inspeksi source dan migration repository. Tidak memakai browser, menjalankan server, mengubah source, atau memutasi DB untuk riset ini.
- Satu subagent sempat mengumpulkan temuan, lalu dihentikan sesuai instruksi owner. Penyelesaian dokumen dan framework dilakukan main agent tanpa agen tambahan.
- Evidence deployment pembayaran manual sebelumnya berada di `docs/remediation/2026-10-02-evidence-pembayaran-manual-escrow.md`. Bukan bukti runtime untuk fitur receipt yang belum dibuat.
- Definisi migration menunjukkan kontrak source, bukan jaminan seluruh fungsi lain identik dengan DB live saat ini. Sebelum implementasi/deployment, cek definisi live hanya untuk fungsi yang akan diubah.

## Perilaku existing dan bukti

### Pembayaran digital langsung selesai

- `supabase/migrations/20261002110000_manual_payment_boundary.sql:119`: manual approval melunaskan payment dan invoice, membuat entitlement, lalu mengalokasikan produk.
- File yang sama `:129-137`: `assign_unique_files_for_order` menghasilkan jumlah stok hilang, tetapi order tetap `completed`. Nilai missing hanya mengubah isi notifikasi.
- `supabase/migrations/20260816165151_cba59ca4-cb03-45e4-8671-5f0afd1eab7c.sql:45-63`: settlement QRIS mempunyai pola entitlement, alokasi, dan completion prematur yang sama.
- Kedua jalur harus diubah bersama. Perbaikan manual saja menghasilkan lifecycle berbeda menurut metode bayar.

### Buyer mempunyai akses, bukan bukti menerima

- `src/routes/_authenticated/dashboard.pesanan.$id.tsx:336-344`: akses produk menunjukkan tautan ke pustaka setelah entitlement tersedia. Belum ada konfirmasi penerimaan digital pada bagian ini.
- `src/lib/orders.functions.ts:377-392`: pustaka membaca entitlement, quota dan validitas; tidak membaca receipt atau mode pengiriman.
- File yang sama `:395-420`: download memakai `consume_download`, lalu signed URL `product-files`. Berhasil membuat URL tidak membuktikan file sudah diterima atau sesuai.
- `src/routes/_authenticated/dashboard.produk-saya.tsx:52-55`: UI melaporkan unduhan dimulai, bukan konfirmasi penerimaan.

### Pengiriman mempunyai tiga mode

- `supabase/migrations/20260917020442_c167869a-6452-43b1-b94e-b41989c402fa.sql:2-4`: mode `shared`, `unique`, `code`.
- `supabase/migrations/20260807132122_9c052118-14d5-4bcb-83bc-0c3cfe33d80b.sql:55-80`: unique file harus dialokasikan ke entitlement; file milik entitlement lain tidak boleh dihitung siap.
- `supabase/migrations/20260917020442_c167869a-6452-43b1-b94e-b41989c402fa.sql:7-44`: stock code mempunyai tabel, ikatan entitlement dan kebijakan baca buyer.
- Jalur pustaka yang diperiksa hanya mengunduh file. Menampilkan code/link milik buyer diperlukan untuk penerimaan mode code; keberadaan stok di DB saja tidak berarti buyer dapat membukanya.
- Nilai missing allocator tidak cukup untuk semua mode. Shared perlu pemeriksaan file aktif yang cocok dengan aturan download. Unique perlu allocation milik entitlement. Code perlu allocation code/link milik entitlement.

### Jasa sudah mempunyai review tersendiri

- `src/routes/_authenticated/dashboard.pesanan.$id.tsx:271-299`: jasa menampilkan Setujui hasil dan Minta revisi pada `waiting_customer_review`.
- `supabase/migrations/20260728171844_bfa12cdf-0586-40b7-9f17-a4ea676479b9.sql:278-311`: `review_job_result` memeriksa owner, menyetujui hasil, menyelesaikan assignment dan order, mencatat history/audit.
- Flow jasa tidak perlu diubah untuk menambahkan receipt digital. Jangan memakai job result atau jatah revisi jasa untuk produk digital.

### Ledger dan refund membatasi desain

- `supabase/migrations/20261001100001_fix_seller_credit_and_refund.sql:28-35`: kredit seller dipicu saat masuk `paid` atau `completed` dari status di luar keduanya.
- Fungsi `credit_seller_earnings` dalam migration yang sama memakai idempotency key per order/store. Transisi normal `paid` ke `completed` tidak membutuhkan kredit kedua.
- `supabase/migrations/20260728131658_d5dbeb52-cab3-4bdf-aa68-212b076abe97.sql:269-273`: refund menerima `paid` dan `completed`; window memakai `refund_window_days` (fallback 7), dihitung dari `paid_at`, bukan `completed_at`.
- `supabase/migrations/20261001100001_fix_seller_credit_and_refund.sql:329`: penolakan refund mengembalikan order ke `completed` secara hardcoded. Ini dapat memalsukan completion order receipt baru yang sebenarnya belum dikonfirmasi.
- Adaptasi penolakan refund harus mempertahankan lifecycle receipt baru versus order legacy. Trigger dapat terpicu lagi setelah kembali dari `refund_requested`; idempotency seller harus tetap terbukti bekerja.

## Temuan yang perlu diperbaiki

1. Payment success sekaligus dianggap penerimaan produk, tanpa aksi buyer.
2. Order selesai meskipun alokasi produk belum siap.
3. Belum ada catatan durable siapa dan kapan mengonfirmasi penerimaan digital.
4. Mode code/link belum disajikan oleh jalur pustaka yang diperiksa, sehingga tombol konfirmasi tidak boleh hanya bergantung pada entitlement.
5. Refund reject hardcoded completed tidak kompatibel dengan order baru yang menunggu penerimaan.
6. Label dan notifikasi completed setelah bayar menyesatkan jika semantik completion berubah tanpa menyesuaikan tampilan.

## Rekomendasi scope minimal

### Kontrak lifecycle

1. Payment manual/QRIS berhasil: payment/invoice tetap `paid`, entitlement dan alokasi tetap bekerja. Order digital baru `paid`, `completed_at` kosong.
2. Catat order sebagai peserta lifecycle receipt baru melalui satu record receipt per order. Record pending dibentuk atomik saat settlement agar bisa dibedakan dari legacy. Jangan menebak legacy dari waktu deployment.
3. Buyer dapat mengakses produk sebelum konfirmasi. Download atau membuka link tidak otomatis mengonfirmasi.
4. Server menentukan apakah seluruh item digital order tersedia dan entitlement masih berlaku/tidak revoked. Jika salah satu belum siap, konfirmasi ditolak dan UI menjelaskan item yang belum tersedia.
5. Konfirmasi seluruh order: owner saja, payment lunas, order `paid`, receipt pending, semua item siap, tidak ada refund atau masalah aktif yang relevan. Catat actor/waktu, set `completed` dan `completed_at`, history/audit dalam satu transaksi.
6. Konfirmasi berulang menghasilkan respons idempoten; tidak menggandakan history, notifikasi, atau ledger. Refund dan konfirmasi mengunci order yang sama untuk menghindari race.

Satu record per order dipilih karena completion existing bersifat per order. Tidak membuat partial acceptance atau release per item. Jika order multi-item, semuanya harus siap sebelum buyer mengonfirmasi. Kesiapan dapat dihitung saat baca/confirm tanpa scheduler dan sistem event baru.

### Penanganan masalah

Gunakan jalur pengajuan refund existing dengan alasan sebagai opsi laporan masalah dalam batas kelayakannya. Label harus menyatakan bahwa tindakan ini mengajukan refund, bukan menjanjikan dispute/replacement yang belum ada. Bila refund tidak eligible, tampilkan penjelasan dan kanal bantuan existing yang benar-benar tersedia; jangan membuat tombol tanpa tujuan.

Tidak otomatis menyelesaikan order saat buyer diam. Belum ada keputusan durasi penerimaan atau kebijakan auto-confirm dari owner. `refund_window_days` bukan timeout penerimaan; jangan memakai setting itu untuk auto-complete. Jangan mengubah refund window agar mulai saat diterima dalam slice ini.

### Kompatibilitas dan rollout

- Order legacy `completed` tetap demikian. Jangan membuat timestamp penerimaan palsu atau mengubah saldo/history lama.
- Aktifkan lifecycle receipt untuk settlement baru pada manual dan QRIS secara serentak.
- Penolakan refund: record receipt pending memulihkan `paid`; receipt accepted atau legacy completed memulihkan status yang sesuai. Untuk jasa, pertahankan flow existing. Simpan/ambil asal status yang terbukti bila lifecycle refund membutuhkan itu; jangan menebak dengan update semua order.
- Jangan mengubah enum global; status `paid` dan `completed` sudah ada.
- Pertahankan invoice, audit, task pembayaran, entitlement idempoten, allocation dan seller credit existing. Perubahan code/link buyer dibatasi pada akses entitlement pemilik.

## Acceptance tests yang diperlukan saat implementasi

- Manual dan QRIS settlement digital menghasilkan `paid` dengan receipt pending, bukan completed.
- Stock missing dan shared tanpa file tidak boleh dikonfirmasi. Unique/code milik entitlement lain tidak dianggap ready.
- File/code/link milik buyer bisa diakses sebelum konfirmasi; tidak bocor ke buyer lain.
- Buyer lain, staff melalui endpoint buyer, unpaid, cancelled, revoked/expired, refund aktif tidak dapat confirm.
- Confirm owner dengan semua item ready membuat accepted/completed/history/audit satu kali; repeated/concurrent confirm tidak menggandakan efek.
- Race confirm versus refund mengikuti lock order yang sama; refund reject pending tidak membuat accepted/completed palsu.
- Seller ledger tetap satu kredit; tidak ada release/payout baru. Order legacy dan jasa tidak berubah.
- Summary/list/timeline/notifikasi menunjukkan dibayar, menunggu produk atau menunggu konfirmasi sesuai keadaan; library tetap dapat diakses pada `paid`.

## Non-goals

Held/available balance, hold period, release RPC, payout, refund amount/window redesign, dispute engine, auto-confirm, seller stock ingestion redesign, PO, review jasa, katalog/moderasi, dependency baru, browser-use, server start/restart, dan mutasi produksi pada tahap riset.

## Status hasil

Riset source selesai. Fitur receipt belum dibuat dan belum diuji runtime. Framework perbaikan harus ditulis setelah membaca dokumen ini; eksekusi implementasi tidak termasuk permintaan saat ini.
