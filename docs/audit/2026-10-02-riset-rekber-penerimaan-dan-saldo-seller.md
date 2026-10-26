# Riset rekber: penerimaan digital dan saldo seller

Tanggal: 2026-10-02.
Status: riset source dan rancangan perbaikan. Dokumen ini tidak menerapkan migration atau mengubah transaksi.

## 1. Permintaan owner dan batas riset

Owner melaporkan panel Penerimaan produk menampilkan Terjadi kesalahan pada server. Owner meminta perbaikan yang konsisten: saldo seller harus ditahan sebelum pembeli menerima produk, bukan langsung masuk saat pembayaran selesai. Instruksi terbaru meminta hasil riset Markdown terlebih dahulu, kemudian framework prompt MGRCAO V3.

Scope: penerimaan produk digital, kredit seller, tampilan dana ditahan/tersedia, refund yang berinteraksi dengan pelepasan, dan deployment dependency receipt. Jasa/akademik dipertahankan. Tidak merancang payout, komisi, sengketa baru, auto-confirm, atau aturan nominal refund baru.

Riset menggunakan source lokal dan evidence pekerjaan sebelumnya. Pemeriksaan remote baru diblokir plan mode; tidak ada hasil live baru dalam dokumen ini. Agen riset tidak menghasilkan laporan yang dapat dipakai; temuan di bawah berasal dari pembacaan file langsung. Tidak menyalakan server atau menggunakan browser.

## 2. Pemisahan event keuangan

Platform menerima pembayaran. Buyer memperoleh akses produk. Buyer mengonfirmasi penerimaan. Platform mencatat hak seller yang sudah dilepas. Seller mencairkan dana melalui payout, jika workflow itu kelak tersedia. Kelima event tersebut berbeda.

Dalam scope ini, rekber berarti penahanan dana internal sampai acceptance pembeli. Istilah ini bukan klaim layanan escrow berizin, segregasi rekening bank, jaminan legal, atau dukungan provider. Kredit ledger juga bukan bukti transfer ke bank seller.

Decision register menetapkan platform sebagai penerima pembayaran, ledger append-only, dan uang server-authoritative. O-04 mencantumkan default hold sampai completed, tetapi saat payment otomatis menghasilkan completed, label itu tidak membuktikan penerimaan. Instruksi owner terbaru menetapkan acceptance pembeli sebagai syarat pelepasan untuk produk digital; durasi tambahan, timeout, dan payout belum ditetapkan.

Sumber: [decision register](../marketplace/02-decision-register.md), bagian A.1 M-06 sampai M-09 dan A.2 O-01 sampai O-05; [audit escrow sebelumnya](../marketplace/03-escrow-audit-dan-rancangan.md), bagian 1 dan INFO-02. Audit lama adalah catatan historis, bukan deskripsi semua fungsi efektif terbaru. URL provider di sana tidak diverifikasi ulang pada riset ini.

## 3. Bukti source yang diperiksa

Path berikut relatif terhadap root proyek. Nomor baris mengacu source saat riset.

| Sumber | Fakta yang relevan |
|---|---|
| `supabase/migrations/20260930100015_seller_earnings_ledger.sql:17-35` | Ledger seller memiliki direction credit/debit, amount positif, source_type sale/refund/adjustment/reversal/payout, order_id, key idempoten unik. Tidak ada kolom held/available. |
| `supabase/migrations/20260930100016_credit_seller_on_paid.sql:21-24` | Trigger orders_credit_seller_on_paid terpasang AFTER UPDATE OF status pada orders. |
| `supabase/migrations/20261001100001_fix_seller_credit_and_refund.sql:27-88` | Definisi trigger dan credit_seller_earnings terbaru di source; paid/completed memicu kredit pertama. Key sale:<order>:<store>. Fungsi kredit belum memeriksa payment, receipt, atau status order. |
| `supabase/migrations/20261001100001_fix_seller_credit_and_refund.sql:97-165` | process_refund mengubah status, mencabut entitlement, mendebit seluruh total item per store, dan mengkredit buyer. Tidak memeriksa release sebelum debit seller. |
| `supabase/migrations/20260930100019_fix_store_data_idor.sql:38-53` | get_store_balance menghitung jumlah credit dikurangi debit dengan can_access_store sebagai guard. Guard ini harus dipertahankan. |
| `supabase/migrations/20261002120000_digital_order_receipt.sql:46-100` | Read/confirm receipt owner-only. Confirm memeriksa paid, readiness, refund, lalu accepted dan completed. Tidak memanggil kredit secara eksplisit. |
| `supabase/migrations/20261002120000_digital_order_receipt.sql:173-181,290-300` | Cabang digital manual/QRIS menghasilkan paid, pending receipt, dan completed_at kosong. |
| `supabase/migrations/20261002120000_digital_order_receipt.sql:343-400` | Refund reject mengembalikan pending receipt ke paid; accepted/no-receipt ke completed. |
| `supabase/migrations/20260728131658_d5dbeb52-cab3-4bdf-aa68-212b076abe97.sql:261-302` | request_refund mengunci order, menerima paid/completed dan beberapa status jasa, memakai window dari paid_at, nominal paid_amount, lalu mengubah payment/order. |
| `src/lib/seller.functions.ts:277-336,389-409` | Summary/finance membaca balance RPC dan ledger. Error balance/ledger tidak diperiksa sebelum data fallback nol/kosong. Tren sale memakai tanggal pencatatan ledger. |
| `src/routes/_authenticated/seller.keuangan.tsx:40-103` | Satu saldo pendapatan dan riwayat mutasi; belum ada dana ditahan. Penarikan dinyatakan belum tersedia. Header saldo tetap fallback nol ketika loading/error. |
| `supabase/migrations/20260930100021_admin_seller_queues.sql:110-178` | admin_store_summary menghitung balance langsung dari ledger, bukan melalui get_store_balance. |
| `src/routes/_authenticated/admin/seller.$id.tsx:287` | Realtime existing mengamati stores, seller_ledger, order_items; belum mencakup perubahan receipt/order yang diperlukan untuk held. |
| `src/lib/__tests__/escrow-invariants.test.ts:1-8,49-77,134-175` | Invariant diuji dengan simulasi array/key. Bukan eksekusi SQL, RLS, atau concurrency. |
| `.zcode/manual-payment-db.mjs:29-35` | Mode apply hardcoded migration 20261002110000 manual_payment_boundary. Jangan pakai untuk deployment receipt/rekber. |

## 4. Temuan

### RF-01: UI dan database receipt belum sinkron

Pemeriksaan Management API pada percakapan sebelumnya menemukan migration 20261002120000 belum applied dan tabel/RPC receipt belum tersedia. [Evidence receipt](../remediation/2026-10-02-evidence-penerimaan-produk-digital.md), bagian Batas pengujian DB, juga mencatat migration belum applied. UI baru sudah memanggil RPC tersebut melalui orders.functions.

Ini menjelaskan error panel yang dilaporkan. Namun error generik sendiri tidak mengidentifikasi satu penyebab; setelah deployment tetap perlu memeriksa keberadaan fungsi, grants, auth, dan hasil panggilan owner. Status remote harus diverifikasi ulang sebelum perubahan, bukan diasumsikan masih sama.

### RF-02: Receipt paid tetap mengkredit seller terlalu awal

Trigger efektif di source:

```sql
IF NEW.status IN ('paid', 'completed')
   AND OLD.status IS DISTINCT FROM 'paid'
   AND OLD.status IS DISTINCT FROM 'completed'
THEN
  PERFORM public.credit_seller_earnings(NEW.id);
END IF;
```

Settlement receipt mengubah order ke paid. Karena itu trigger tetap mengkredit saat pembayaran diterima. Paid menjadi completed setelah acceptance justru tidak memicu kredit karena OLD.status sudah paid. Deploy receipt saja tidak memenuhi permintaan rekber.

### RF-03: Mengubah trigger saja meninggalkan bypass release

credit_seller_earnings mengambil total item per store dan langsung menulis sale. Ia tidak memeriksa order completed, receipt accepted, payment, atau refund aktif. Execute dibatasi ke service_role, tetapi panggilan internal/service tetap dapat mengkredit pending.

Perbaikan harus memasang syarat release pada fungsi kredit sebagai boundary bisnis, selain memperbaiki timing trigger. Untuk peserta receipt baru, completed tanpa receipt accepted tidak sah sebagai bukti release. Penerimaan, completion, history/audit, dan ledger harus berhasil atau rollback bersama. Guard terlalu luas juga tidak boleh memblokir jalur jasa/legacy yang dipertahankan.

### RF-04: Refund sebelum release akan mendebit saldo yang belum dikredit

process_refund saat ini mendebit SUM(order_items.total) per store tanpa mencari sale credit. Jika kredit ditunda sampai acceptance, refund pending akan membuat saldo seller turun meski pendapatan order tersebut belum tersedia.

Contoh hipotetis, bukan transaksi produksi: nilai item Rp100.000, saldo awal seller nol. Pembayaran pending acceptance tidak mengkredit ledger. Process refund existing menulis debit Rp100.000; saldo menjadi minus Rp100.000. Debit seller hanya benar untuk pendapatan yang sebelumnya benar-benar dilepas, dengan sisa yang belum direversal.

### RF-05: Refund setelah release perlu reserve yang tidak dikurangi dua kali

Buyer masih dapat meminta refund setelah acceptance selama kebijakan existing mengizinkan. Kredit sale yang sudah masuk tidak otomatis hilang saat refund requested. Jika UI menyebut seluruh balance bebas tersedia, dana order yang sedang refund juga dianggap tersedia.

Rancangan perlu membedakan dana menunggu penerimaan dari cadangan refund atas pendapatan yang sudah dilepas. Cadangan bukan debit final. Saat refund selesai, cadangan hilang dan debit final menggantikannya dalam satu transaksi. Refund ditolak melepas cadangan tanpa kredit sale kedua. Jangan menambahkan payout untuk menyelesaikan masalah label ini.

### RF-06: Seller/admin belum mempunyai kontrak saldo yang sama

Seller menggunakan get_store_balance; admin_store_summary melakukan SUM ledger sendiri. UI finance hanya memiliki satu angka. Mengubah satu RPC saja dapat membuat seller/admin berbeda, atau menyembunyikan dana ditahan sebagai nol.

Gunakan perhitungan server yang sama. Pisahkan saldo tercatat, dana menunggu penerimaan, cadangan refund, dan saldo tersedia. Jangan menghitung keuangan dari ledger yang di-limit 100/200 baris di frontend. Error RPC harus menghasilkan error yang terlihat, bukan saldo nol. Trend sale existing menjadi tren pendapatan dilepas, bukan tanggal uang buyer diterima; label harus sesuai bila ditampilkan.

### RF-07: Lock dan idempotency wajib menutup race receipt/refund

confirm_digital_receipt dan request_refund sudah mengunci order. review_refund mengunci refund terlebih dahulu lalu order; process_refund mengunci refund tetapi pembacaan order awal tidak menggunakan FOR UPDATE. Fungsi kredit memakai SELECT sebelum INSERT, bukan ON CONFLICT, sehingga pemanggilan paralel masih perlu serialisasi.

Alur baru harus memakai urutan lock yang konsisten: baca identitas refund seperlunya, lock order, lock/refetch refund atau receipt/payment yang relevan, lalu validasi ulang. Semua eligibility finansial dihitung setelah lock. Uji race confirm dengan refund request/review/process; static test tidak membuktikan bebas deadlock atau double credit.

### RF-08: Legacy, nominal refund, dan timeout tidak boleh diarang

Order completed lama berasal dari settlement otomatis. Tidak ada bukti acceptance untuk backfill. Jangan memberi accepted_by palsu, membuka ulang completed lama, menghapus ledger, atau mengurangi saldonya massal.

request_refund menetapkan amount dari paid_amount, sedangkan process_refund mendebit total item. Untuk credit_used atau partial refund, kedua basis nominal bisa berbeda. Risiko sudah dicatat audit lama; belum terbukti seluruh kasus itu terjadi pada target sekarang. Preflight harus mengidentifikasi kasusnya. Tidak boleh menyebut partial/mixed-credit refund benar tanpa pengujian dan keputusan alokasi; jangan diam-diam mengganti nominal buyer/window pada slice release.

Tanpa timeout acceptance, buyer yang diam dapat menahan dana tanpa batas waktu aplikasi. Kedaluwarsa entitlement juga dapat membuat acceptance tidak tersedia. Ini batas kebijakan yang harus ditampilkan dalam evidence; refund_window_days bukan waktu auto-release. Jalur bantuan tetap memakai dukungan/refund existing, bukan bypass acceptance buatan.

## 5. Rancangan minimum yang direkomendasikan

Pertahankan ledger seller append-only sebagai buku besar pendapatan yang sudah dilepas. Jangan menulis sale credit saat payment paid lalu menamainya held di UI. Dana menunggu penerimaan dihitung dari peserta receipt pending dan nilai item snapshot, secara server-side. Tidak perlu wallet kedua atau kolom saldo mutable untuk slice ini.

Untuk order digital baru:

1. Payment dan invoice paid; receipt pending; entitlement/stock mengikuti settlement existing. Order paid, belum completed. Tidak ada sale credit.
2. Buyer mengakses produk tanpa dipaksa mengonfirmasi. Semua item harus siap sebelum acceptance.
3. Buyer owner mengonfirmasi. Lock dan validasi readiness/payment/refund. Receipt accepted dan order completed menghasilkan tepat satu sale per order/store melalui trigger yang diperbaiki dan fungsi kredit guarded.
4. Refund aktif sebelum acceptance menahan release. Jika ditolak, order kembali paid; jika selesai, dana pending berhenti ditampilkan dan tidak ada debit atas sale yang belum ada.
5. Refund atas order yang sudah release memakai cadangan terpisah selama aktif. Selesai hanya mendebit pendapatan yang ada dan belum direversal; ditolak menghapus cadangan tanpa sale tambahan.

Kontrak hitungan yang disarankan:

- `ledger_balance`: SUM(credit minus debit), termasuk adjustment/payout existing bila ada.
- `held_receipt`: nilai hak seller pada receipt pending yang pembayarannya sudah diterima dan belum refunded/cancelled. Refund aktif sebelum release tetap masuk kategori ini, bukan cadangan kedua. Buktikan pembayaran dari paid_at/paid_amount atau state settlement, karena payment status berubah menjadi refund_requested.
- `refund_reserved`: sisa pendapatan yang sudah dilepas dan sedang refund aktif, dihitung per order/store. Tidak melebihi sisa release yang belum direversal. Untuk full refund single-store, basisnya jelas; partial/multi-store/mixed-credit yang ambigu menjadi gate sebelum deployment.
- `available_balance`: ledger_balance dikurangi refund_reserved. held_receipt tidak pernah ditambahkan. Jangan menyembunyikan saldo negatif historis dengan clamp nol; tampilkan/catat kebutuhan rekonsiliasi.

Perhitungan memakai SUM item snapshot dan kebijakan fee yang benar-benar aktif, bukan harga katalog terbaru atau nominal dari client. Schema awal mencatat fee nol; verifikasi ulang policy/definisi efektif sebelum implementasi. Order platform store tidak boleh dilewati tanpa bukti kebijakan berbeda.

## 6. Matriks perilaku yang wajib dipertahankan

| Kondisi digital baru | Order/receipt | Pengaruh keuangan |
|---|---|---|
| Belum dibayar | awaiting_payment, belum peserta receipt | Tidak held, tidak sale |
| Dibayar, siap atau belum siap | paid, pending | Held bertambah; available tidak bertambah |
| Download/reveal code | paid, pending | Tidak acceptance atau release otomatis |
| Acceptance valid | completed, accepted | Held turun; sale dan available bertambah sekali |
| Refund aktif sebelum acceptance | refund_requested/refund_processing, pending | Held tetap ditahan; confirm/release ditolak |
| Refund pending ditolak | paid, pending | Tetap held; tidak ada sale |
| Refund sebelum release selesai | refunded, pending | Held turun; tidak debit seller atas sale yang tidak ada |
| Refund aktif sesudah release | lifecycle refund, accepted | Cadangan mengurangi available; bukan held_receipt |
| Refund sesudah release ditolak | completed, accepted | Cadangan hilang; tidak sale tambahan |
| Refund sesudah release selesai | refunded, accepted | Debit final sekali; cadangan hilang |

Jasa/akademik dan order legacy mengikuti kontrak lama yang terbukti; matriks baru tidak otomatis di-backfill pada transaksi historis.

## 7. Deployment dan rekonsiliasi

Preflight read-only wajib memeriksa project-ref, daftar migration, pg_get_functiondef, grants/trigger, receipt yang sudah ada, ledger per order/store, refund aktif, dan kasus nominal ambigu. Tidak mencetak credential atau data buyer yang tidak diperlukan.

Jika receipt belum applied, aktifkan receipt dan migration rekber tanpa jendela transaksi baru yang masih mengkredit saat paid, idealnya satu transaksi database terkontrol dengan pencatatan kedua versi migration. Jika receipt ternyata sudah aktif, audit pending yang terlanjur punya sale terlebih dahulu. Jangan reapply CREATE TABLE atau migration yang sudah tercatat.

Jangan menggunakan `.zcode/manual-payment-db.mjs apply`: targetnya khusus migration pembayaran manual. Helper query existing dapat dipakai untuk preflight bila diizinkan, tetapi deployment memerlukan wrapper/CLI yang memverifikasi versi, target, dan transaksi yang benar.

Jika ada pendapatan pending yang terlanjur dikredit, jangan otomatis menulis reversal. Evidence dan otorisasi rekonsiliasi harus menentukan entitlement/order terdampak dan apakah sale/refund/payout sudah berlangsung. Tidak menghapus atau mengedit ledger asli. Rollback sesudah ada acceptance nyata tidak boleh mengembalikan trigger lama yang melepas saat paid.

## 8. Evidence dan batas penerimaan

Evidence receipt sebelumnya mencatat 109 unit/regression test lulus dan build berhasil. Itu hasil pekerjaan sebelumnya, bukan test baru rekber. Test escrow existing mensimulasikan key/array; test receipt juga memiliki assertion SQL/UI statis. Keduanya tidak membuktikan fungsi terpasang atau race aman.

Verifikasi implementasi berikutnya harus memisahkan:

- Unit/static regression: guard release, timing trigger, refund sebelum/sesudah release, query/UI wiring.
- PostgreSQL runtime rollback fixture: dua rail payment, readiness tiap mode, owner/nonowner, duplicate, saldo held/available, refund/reject, legacy/jasa.
- Uji dua sesi DB: confirm/confirm, confirm/request_refund, release/refund process, idempotency kredit.
- Build/lint/typecheck scoped: laporkan kegagalan existing terpisah.
- GUI: belum diuji selama browser/server dilarang. Jangan memakai workaround atau menyatakan visual/interaksi lulus.

## 9. Kesimpulan scope perbaikan

Akar error panel adalah dependency receipt yang belum terdeploy menurut evidence sebelumnya. Akar pelanggaran rekber adalah timing kredit paid/completed dan fungsi kredit tanpa syarat acceptance. Perbaikannya mencakup trigger, guard release, debit refund yang mengetahui release, perhitungan saldo seller/admin, dan deployment atomik. Mengubah trigger saja belum cukup.

Dokumen ini menyempurnakan rekomendasi awal yang terlalu sempit. [Framework receipt lama](../remediation/2026-10-02-mgrcao-v3-penerimaan-produk-digital.md) sengaja mengecualikan held funds; instruksi owner terbaru memperluas scope finansial tersebut. Implementasi baru menggunakan framework rekber khusus, bukan menganggap receipt source sebelumnya sudah menahan dana.
