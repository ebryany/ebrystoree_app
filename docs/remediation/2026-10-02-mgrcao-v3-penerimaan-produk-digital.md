# Framework prompt MGRCAO V3: penerimaan produk digital

Tanggal: 2026-10-02.
Dasar: [hasil riset](../audit/2026-10-02-riset-penerimaan-produk-digital.md), ditulis dan dibaca sebelum framework ini.
Status: implementasi source selesai berdasarkan instruksi owner “lanjut perbaikan”. Unit/regression test dan build dijalankan; migration receipt belum diterapkan. DB runtime, race dan GUI belum diuji. Detail hasil: [evidence penerimaan digital](2026-10-02-evidence-penerimaan-produk-digital.md). Dokumen pembayaran manual sebelumnya tetap dipertahankan sebagai evidence pekerjaan berbeda.

## M: Mindset

Perbaiki penerimaan produk digital tanpa membangun escrow baru. Bedakan lunas, tersedia, dan buyer menerima. Bukti akses atau unduhan tidak sama dengan persetujuan buyer. Semua keputusan completion dan kesiapan harus diperiksa server/DB, bukan dipercayakan pada UI.

Bekerja sendiri, tanpa spawn agen. Jangan memakai browser-use, menyalakan/restart server, menambah dependency, atau memperluas audit. Implementasi dan deployment tidak otomatis diotorisasi oleh pembuatan framework ini.

Scope ini tidak menahan saldo seller. Ledger existing tetap mengkredit saat paid; konfirmasi buyer tidak otomatis membuat release/payout. Jangan menampilkan klaim dana ditahan sampai diterima.

## G: Goals yang terukur

### G-1: Pembayaran tidak lagi menyelesaikan order digital baru

Manual dan QRIS menghasilkan payment/invoice paid serta order digital paid dengan completed_at kosong. Entitlement, alokasi, task pembayaran, history/audit dan guard pembayaran manual existing tetap berfungsi. Jasa tidak berubah. Settlement menciptakan satu receipt pending per order secara atomik dan idempoten.

### G-2: Buyer benar-benar bisa mengakses produk

Kesiapan mengikuti aturan shared file, unique assigned file, atau code/link assigned entitlement. Seluruh item digital harus siap. Entitlement saja atau jumlah missing allocator saja bukan bukti lengkap. Produk yang belum siap menampilkan penjelasan, tidak tombol konfirmasi aktif. Library tetap dapat diakses sebelum acceptance; code/link hanya untuk pemilik entitlement.

### G-3: Konfirmasi buyer atomik dan owner-only

RPC konfirmasi memeriksa auth owner, order digital peserta receipt baru, payment lunas, order paid, semua item siap dan entitlement berlaku, tanpa refund aktif. Simpan accepted_by/accepted_at dan completed_at server-side; receipt accepted, order completed, history/audit satu transaksi. Klik ulang atau request bersamaan tidak menggandakan efek. Staff bukan pemilik tidak boleh bypass melalui endpoint buyer.

### G-4: Masalah tidak dipaksa menjadi persetujuan

UI menggunakan pengajuan refund existing dengan alasan dan kelayakan existing. Tidak membuat dispute/replacement engine. Confirm tidak boleh berjalan saat refund aktif. Penolakan refund untuk receipt pending mengembalikan order paid, bukan completed; accepted/legacy mengikuti keadaan sebelumnya yang benar. Refund window tetap dari paid_at, tanpa perubahan jumlah/perhitungan refund.

### G-5: Tidak merusak legacy atau ledger

Order completed lama tidak diubah dan tidak diberi catatan penerimaan palsu. Transisi paid ke completed tidak menghasilkan kredit seller kedua. Refund reject tidak menggandakan kredit. Tidak mengubah seller ledger, trigger earnings, refund debit, held/available, release atau payout.

### G-6: Evidence membedakan statis dan runtime

Unit/regression test, scoped lint dan build dijalankan tanpa server baru. Uji DB hanya saat deployment diotorisasi, pada target terkonfirmasi dengan fixture rollback. GUI ditulis belum diuji bila browser tetap dilarang. Tidak mengklaim unit test membuktikan RLS/race/live DB.

## R: Role

Engineer lifecycle penerimaan digital: menambahkan catatan penerimaan, owner RPC dan UI kecil pada halaman existing; menjaga pembayaran, entitlement dan ledger. Bukan perancang sistem payout atau dispute baru.

## C: Context terkunci dari riset

1. Dua rail settlement langsung completed meski allocator melaporkan missing.
2. Order paid/completed sudah tersedia; tidak perlu menambah status global untuk menunggu penerimaan.
3. Pengiriman shared, unique dan code membutuhkan pemeriksaan readiness berbeda.
4. Library existing berbasis download file; code/link perlu akses owner-scoped untuk mendukung penerimaan.
5. Review jasa sudah ada dan tidak termasuk perubahan.
6. Kredit seller dipicu paid/completed; paid ke completed tidak perlu kredit baru. Receipt bukan escrow release.
7. Refund menerima paid/completed dan menghitung window dari paid_at; reject hardcoded completed harus kompatibel dengan lifecycle receipt.
8. Tidak ada keputusan owner mengenai timeout acceptance. Auto-confirm tidak dibuat dan tidak disimpulkan dari refund_window_days.

## A: Actions berurutan saat implementasi diotorisasi

1. Baca riset di atas dan periksa hanya file/fungsi yang diperlukan. Simpan backup perubahan existing. Tidak mengulang audit seluruh proyek.
2. Buat satu migration additive dengan satu tabel receipt per order: order_id unik, status pending/accepted, actor/waktu acceptance; foreign key, RLS owner read, tidak ada direct buyer INSERT/UPDATE. Jangan backfill acceptance legacy.
3. Tambahkan pemeriksaan readiness server/DB yang mengikuti resolusi file existing. Shared memerlukan file aktif/path valid/object ada; unique harus assigned ke entitlement pemilik; code harus assigned dan masih bisa disajikan pada buyer. Tidak menguji layanan eksternal atau mengonsumsi quota download untuk cek readiness. Snapshot mode order menjadi acuan bila tersedia; jangan membiarkan perubahan katalog membuat produk accepted berbeda.
4. Dalam migration baru, adaptasi hanya cabang digital verify_manual_payment dan settle_gateway_payment: order paid, receipt pending, notifikasi pembayaran/akses tanpa klaim selesai. Pertahankan seluruh guard dan efek non-completion. Jangan mengedit migration historis applied.
5. Tambahkan confirm RPC: lock order, cek receipt/payment/entitlement/kesiapan/refund; idempoten; update accepted/completed/history/audit. Selaraskan lock dengan request_refund existing; ubah jalur refund hanya bila race atau restore lifecycle memerlukan itu.
6. Adaptasi cabang refund reject untuk receipt pending versus accepted/legacy; jangan merombak approval/process_refund atau akuntansi. Pertahankan jasa dan idempotency seller.
7. Tambahkan server functions kecil pada orders.functions untuk membaca receipt/readiness dan konfirmasi. Owner filter eksplisit meski staf punya RLS lebih luas. Tambahkan akses code/link owner-scoped bila belum tersedia, tanpa mengekspos seluruh stock.
8. Tambahkan section digital pada detail pesanan: belum tersedia, menunggu konfirmasi, sudah dikonfirmasi. Tombol Produk diterima dan sesuai dengan dialog penjelasan; opsi Ajukan refund memakai flow existing. Tampilkan code/link di pustaka menurut mode tanpa mengubah desain halaman. Invalidate query order/list/summary setelah konfirmasi.
9. Sesuaikan label/timeline hanya jika paid masih ditampilkan sebagai selesai atau menunggu pembayaran. Tidak redesign dashboard, reports atau navigasi.
10. Jalankan test acceptance di bawah, lint/build. Tulis evidence dan batas verifikasi. Deployment terpisah hanya setelah diotorisasi; server existing tidak disentuh.

## O: Outputs, scope dan rollback

### Deliverables implementasi berikutnya

Satu migration baru, RPC receipt/readiness, server functions scoped, section buyer receipt, akses code/link yang dibutuhkan, regression tests dan evidence MD telah ditulis. Penyelesaian source bukan bukti fitur sudah aktif di database atau lolos pengujian end-to-end.

### Allowlist

- `src/lib/orders.functions.ts`: receipt/readiness/confirm/access code dan data yang diperlukan.
- `src/lib/transaction.server.ts`: pesan error receipt bila perlu.
- `src/routes/_authenticated/dashboard.pesanan.$id.tsx`: section penerimaan digital, memakai refund existing.
- `src/routes/_authenticated/dashboard.produk-saya.tsx`: akses code/link owner dan mode pengiriman.
- Komponen/helper receipt kecil bila benar-benar mengurangi duplikasi.
- `src/lib/transaction-labels.ts` atau komponen timeline existing hanya untuk label lifecycle yang keliru.
- Satu migration baru berisi schema/RLS/RPC receipt serta adaptasi cabang digital dua settlement dan refund reject. request_refund hanya untuk lock/guard yang diperlukan.
- Test receipt dan dokumentasi evidence.

Jika laporan seller/admin atau endpoint lain tidak bekerja karena bergantung pada completed, catat bukti dependency terlebih dahulu. Jangan otomatis memperluas file allowlist atau menambah fitur laporan.

### Non-goals

Held/available, release, payout, hold period, auto-confirm/scheduler, dispute engine, perubahan nominal/window refund, partial receipt atau release per item, PO/jasa, stock ingestion, provider/webhook redesign, katalog/moderasi, dependency/AGENTS.md, server dan browser-use.

### Uji penerimaan wajib

1. Manual dan QRIS digital paid + pending receipt; jasa tetap flow existing.
2. Stock missing shared/unique/code menolak confirm; multi-item memerlukan semua siap.
3. Code/file buyer lain tidak bocor; akses tersedia sebelum konfirmasi.
4. Owner valid berhasil; nonowner/unpaid/cancelled/refund aktif/revoked/expired ditolak.
5. Confirm dua kali/konkuren memberi satu accepted/history/audit; tidak menambah earnings kedua.
6. Refund race dengan confirm konsisten; reject pending pulih paid; accepted dan legacy tidak dipalsukan.
7. Tidak ada auto-accept saat download atau buyer diam; tidak ada backfill legacy.
8. UI memiliki loading/empty/error/busy state dan dialog konfirmasi; klik/visual tidak diklaim teruji tanpa browser.
9. TypeScript/lint/build failures dilaporkan dan dipisahkan dari error di luar slice.

### Rollback

Jangan rollback atau menghapus transaksi/ledger/acceptance nyata. Source dapat dipulihkan dari backup. DB rollback sesudah fitur dipakai harus meninjau receipt yang sudah tercatat dan payment baru yang masih paid; jangan menghapus tabel atau memaksa semua order completed. Pemulihan memerlukan otorisasi terpisah.

## Batas keputusan

Framework ini memilih receipt lifecycle tanpa escrow redesign agar sesuai scope. Bila owner menginginkan saldo seller hanya tersedia setelah penerimaan, implementasi receipt saja tidak memenuhi tujuan tersebut. Held/available dan release harus menjadi rancangan keuangan terpisah, bukan perubahan tersembunyi dalam slice penerimaan.
