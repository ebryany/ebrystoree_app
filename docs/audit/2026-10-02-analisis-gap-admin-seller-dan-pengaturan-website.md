# Analisis gap admin, seller, dan pengaturan website

Tanggal: 2026-10-02. Scope: marketplace digital Ebrystore.

## Status dan metode

Dokumen ini menjadi dasar framework [monitoring pesanan dan dana](../remediation/2026-10-02-mgrcao-v3-monitoring-pesanan-dan-dana-admin-seller.md). Analisis memakai inspeksi source lokal, bukan audit GUI atau bukti kondisi database terbaru. Perbaikan rekber sebelumnya mempunyai [evidence tersendiri](../remediation/2026-10-02-evidence-rekber-penerimaan-dan-saldo-seller.md). Status implementasi monitoring dicatat terpisah pada [evidence monitoring](../remediation/2026-10-02-evidence-monitoring-pesanan-dan-dana-admin-seller.md); temuan di bawah menjelaskan kondisi sebelum perubahan tahap pertama.

User mengotorisasi pembuatan dokumen lalu pelaksanaan tahap pertama. Tidak menyalakan server, memakai browser-use, atau menjalankan agen. Tidak mengubah pengaturan, laporan agregat, payout, maupun kebijakan release pada tahap pertama.

## Fondasi existing

- Admin mempunyai dashboard, order, pembayaran, refund, seller, moderasi, laporan, audit, permission, jobs, dan pengaturan. Sumber: `src/lib/admin-nav.ts`.
- Dashboard admin memiliki antrean verifikasi pembayaran, pengajuan toko, moderasi produk, dan refund perlu ditinjau. Sumber: `src/lib/admin.functions.ts`, `getAdminOverview`.
- Seller mempunyai dashboard, produk, pesanan, chat, keuangan, performa, serta pengaturan toko. Sumber: `src/components/seller/seller-sidebar.tsx`.
- Produk seller sudah menampilkan stok rendah/habis. Form edit sudah menampilkan alasan penolakan dan pengajuan ulang moderasi. Sumber: `seller.produk.index.tsx`, `seller.produk.$id.tsx` di `src/routes/_authenticated/`.
- Chat seller bukan fitur baru yang perlu dibangun ulang. Sumber: `seller.chat.index.tsx`, `seller.chat.$id.tsx`.
- Keuangan seller sudah memisahkan saldo tersedia, dana menunggu penerimaan, dan cadangan refund. Tren 30 hari adalah pendapatan dilepas, bukan pembayaran ditahan. Sumber: `src/lib/seller.functions.ts`, `seller.index.tsx`, `seller.keuangan.tsx`.
- Produk digital baru tidak dilepas hanya karena dibayar. Receipt accepted dan guarded credit menjadi batas release. Refund sebelum release tidak mendebit seller. Sumber: `supabase/migrations/20261002120000_digital_order_receipt.sql`, `20261002130000_digital_seller_funds_release.sql`.
- Pengaturan website memakai registry dengan tipe, validasi, permission, read-only, dan audit redaction. Editor transaksi generik juga menulis tabel `system_settings`. Sumber: `src/lib/website-settings.ts`, `website-settings.functions.ts`, `admin-transaction.functions.ts`.

## Temuan terverifikasi dari source

### MON-01: detail pesanan seller belum tersedia (P1, tahap pertama)

Kondisi: `src/routes/_authenticated/seller.pesanan.tsx` menampilkan daftar item, nomor, tanggal, total, dan status. Filter hanya semua/dibayar/menunggu. `listSellerOrders` memakai RPC `list_my_store_orders`; tidak menyediakan receipt, readiness, atau rincian dana.

Dampak: seller tidak mengetahui pesanan mana yang menahan dana dan apakah masalahnya pengiriman atau penerimaan buyer.

Perubahan minimum: tambahkan daftar monitoring dengan detail per pesanan pada halaman existing. Payload hanya item/dana milik toko seller. Tidak membuka data kontak buyer, kode, path Storage, atau internal notes. Hindari route detail baru bila panel disclosure mencukupi.

### MON-02: detail admin tidak memuat receipt dan release (P1, tahap pertama)

Kondisi: `src/lib/admin-transaction.functions.ts`, `getOrderDetail`, memuat order/items/payments/history/entitlements/refunds dan data operasional lain, tetapi tidak memuat receipt atau seller release. `src/routes/_authenticated/admin/orders.$id.tsx` belum menampilkan keduanya.

Dampak: status completed mudah disalahartikan sebagai bukti penerimaan, termasuk legacy.

Perubahan minimum: panel monitoring read-only memakai kontrak bersama, diperiksa dengan `orders.view`. Receipt memiliki buyer-only RLS; jangan mengandalkan SELECT admin langsung.

### MON-03: dana aggregate tidak menjelaskan pesanan penyebab (P1, tahap pertama)

Kondisi: `get_store_finances` menghitung held dan reserve dengan snapshot item/ledger, tetapi UI keuangan hanya menampilkan aggregate dan 100 mutasi terakhir.

Dampak: seller melihat nominal ditahan tanpa bisa menelusuri order asal.

Perubahan minimum: hitung held, sale credit, refund debit, dan refund reserve per order/store dari aturan existing. Bedakan nilai order dari nilai seller. Pendapatan dilepas adalah historis gross sale credit, bukan saldo global yang bisa ditarik. Payout/adjustment global tidak dialokasikan ke order secara buatan.

### MON-04: belum ada antrean delivery/penerimaan/refund berjalan (P1, tahap pertama)

Kondisi: `getAdminOverview` menghitung refund requested/under_review/information_requested, belum approved/processing. Ringkasan seller tidak memiliki daftar order yang perlu ditangani.

Perubahan minimum: daftar monitoring terfilter untuk delivery tidak siap, menunggu penerimaan, serta refund aktif. Tampilkan waktu mulai dan umur tunggu, bukan SLA pelanggaran tanpa kebijakan. Refund aktif mencakup requested, under_review, information_requested, approved, processing. Penantian penerimaan adalah informasi, bukan izin memaksa buyer.

### SET-01: dua pintu pengaturan berbeda validasi/izin/audit (P1, tahap terpisah)

Kondisi: `saveWebsiteSection` di `src/lib/website-settings.functions.ts` memakai registry/validateField/readOnly/redact. `updateSetting` di `src/lib/admin-transaction.functions.ts` memakai validasi key/value generik dan audit before/after tanpa kontrak registry yang sama.

Dampak: field yang sama mempunyai perilaku berbeda tergantung editor. Ini temuan inkonsistensi source, bukan klaim eksploitasi runtime.

Rekomendasi: satu kontrak validasi dan izin bagi setiap key. Inventarisasikan key legacy terlebih dahulu agar key transaksi yang sah tidak hilang.

### SET-02: setting tersimpan belum membuktikan enforcement (P1, tahap terpisah)

Kondisi: registry memiliki feature_refund, feature_registration, notify toggles dan auto-complete. Analisis sebelumnya belum menemukan seluruh runtime consumer. `request_refund` membaca nilai refund_window_days saat request, bukan snapshot per order. Sumber: `src/lib/website-settings.ts`, `.zcode/rekber-before-request_refund.sql` (backup internal, bukan publikasi data).

Rekomendasi: matriks key, consumer, default, izin, dan dampak terhadap transaksi lama/baru. Jangan mengaktifkan auto-confirm atau mengubah window refund dalam tahap monitoring.

### REP-01: laporan aggregate bukan rekonsiliasi lifecycle dana (P2, tahap terpisah)

Kondisi: `admin_marketplace_overview` di `supabase/migrations/20260930100022_marketplace_reports.sql` memakai order paid/completed untuk GMV dan saldo ledger mentah. `getTransactionReport` di `src/lib/admin-transaction.functions.ts` memakai cohort created_at order/payment/refund yang berbeda dan agregasi list API.

Dampak: laporan bukan kontrak held/reserve/available baru; perubahan status dapat mengubah GMV. Batas row API perlu diperiksa sebelum menganggap total lengkap.

Rekomendasi: tetapkan definisi nilai penjualan, refund, pendapatan platform, dan saldo terlebih dahulu. Gunakan agregasi SQL dan periode yang eksplisit. Jangan menyebut nilai order sebagai laba platform.

### OPS-01: badge job tidak membuktikan scheduler sehat (P2, tahap terpisah)

Kondisi: `src/routes/_authenticated/admin/jobs.tsx` dapat memberi label Aktif ketika belum ada run. `src/lib/jobs.functions.ts` memberi daftar run/manual execution, bukan bukti scheduler deployed.

Rekomendasi: pisahkan belum diketahui, sehat, terlambat, dan gagal berdasarkan evidence run serta cadence yang benar-benar diterapkan.

### SEL-01: performa dan riwayat perlu pendalaman setelah monitoring (P2, backlog)

Kondisi: `seller.performa.tsx` berisi rating/ulasan. `listSellerLedger` memakai limit 100. Stok rendah dan moderasi sudah tersedia, sehingga bukan fitur baru.

Rekomendasi: periode dan penjualan per produk, pagination ledger, tautan stok/moderasi di ringkasan bila diperlukan. Ekspor dan analytics pengunjung menunggu kebutuhan nyata. Tidak termasuk tahap pertama.

## Usulan, bukan temuan absensi yang sudah terbukti

- Notifikasi seller dengan tautan langsung ke order/refund/moderasi perlu audit delivery notifikasi existing terlebih dahulu.
- Kolaborasi refund melalui bukti seller membutuhkan kontrak permission dan kebijakan tanggapan. Tahap pertama hanya menampilkan status/tanggal/nominal; tidak membangun submit bukti atau approval baru.
- Payout membutuhkan keputusan provider, legal, rekening, biaya, jadwal, serta saldo negatif. Label payout pada ledger bukan modul penarikan yang berfungsi.

## Urutan dan dependensi

1. MON-01 sampai MON-04: kontrak SQL read-only bersama dengan scope admin/seller, detail admin dan seller, daftar monitoring terfilter.
2. SET-01 dan SET-02: framework terpisah untuk konsistensi pengaturan dan consumer audit.
3. REP-01 dan OPS-01: framework terpisah untuk definisi laporan dan bukti scheduler.
4. SEL-01 dan usulan notifikasi: setelah operasi pesanan dapat ditelusuri.

Tahap pertama tidak membutuhkan perubahan trigger, receipt acceptance, settlement, refund processing, atau ledger. SQL monitoring memakai readiness existing tanpa mengalokasikan stok/mengurangi quota. Komponen existing dan token DESIGN.md dipakai; fokus pada daftar tindakan dan detail angka, ENERGY 1 / RHYTHM 2 / MOTION 1. Tanpa asset atau dependency baru.

## Kriteria penerimaan tahap pertama

- Admin membutuhkan orders.view; seller hanya mendapat order dan item toko miliknya, sekalipun mempunyai permission admin.
- Anon dan user non-owner tidak dapat membaca monitoring seller. RPC internal tidak dapat dieksekusi authenticated langsung.
- Payload tidak mengandung PII buyer, kode produk, path Storage, atau internal notes.
- Nilai per-order held/reserve sesuai formula get_store_finances existing; refunded-before-release tidak menjadi debit seller palsu.
- Pending receipt dan accepted receipt berbeda; order legacy tanpa receipt ditandai tanpa acceptance buatan.
- Filter delivery blocked hanya untuk order dibayar, receipt pending, tanpa refund aktif. Penantian buyer hanya bila produk siap.
- Refund aktif tetap ditampilkan walaupun receipt belum accepted; umur refund dimulai dari refund aktif, bukan waktu order dibuat.
- Pagination dan total antrean dihitung server-side, bukan dari subset halaman.
- Detail mempunyai empty/loading/error; kegagalan RPC tidak ditampilkan sebagai saldo nol.
- Tidak ada tombol force acceptance, force release, refund approval seller, atau penarikan palsu.
- PostgreSQL permission/readiness/finance test memakai transaksi rollback; perubahan monitoring tidak memutasi ledger atau order.
- Build dan regression dijalankan. GUI/mobile/keyboard belum dianggap terverifikasi tanpa GUI karena user melarang server/browser.

## Batas keputusan

Tidak menetapkan SLA, timeout, auto-confirm, partial release, biaya, refund allocation baru, payout, dispute engine, atau koreksi historis. Jangan mengurangi saldo legacy atau backfill acceptance. Jangan mengubah AGENTS.md, dependency, maupun histori git. Source siap build tidak sama dengan frontend sudah dipublish.
