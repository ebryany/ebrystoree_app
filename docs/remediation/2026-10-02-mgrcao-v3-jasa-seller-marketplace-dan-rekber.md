# MGRCAO V3: penambahan jasa seller marketplace dan rekber

Tanggal: 2026-10-02. Dasar: [riset jasa seller marketplace](../audit/2026-10-02-riset-jasa-seller-marketplace-dan-rekber.md), temuan JS-01 sampai JS-11.

Status: framework untuk pekerjaan berikutnya. Belum dieksekusi. Permintaan sekarang hanya dokumentasi; file ini bukan otorisasi implementasi, deployment, atau aktivasi produksi.

## M: Mindset

Bangun jalur jasa yang dikerjakan seller setelah payment, bukan variasi file digital dan bukan penugasan operator platform. Pertahankan produk digital serta akademik/operator legacy.

Bukti pembayaran, kesiapan requirements, pengerjaan, delivery, acceptance, release internal, refund, dan payout adalah event berbeda. Seller hanya dapat mengirim hasil. Buyer menerima versi tertentu. Status completed saja tidak merupakan hak seller atas uang.

Pilih kontrak minimum: satu listing harga tetap, satu seller, satu order, satu pembayaran penuh, satu acceptance final. Delivery boleh berversi untuk revisi. Tidak membuat milestone, fee engine, payout, custom offer, atau ticket/chat engine umum.

Keamanan dan akuntansi tidak boleh disederhanakan: ownership objek, SQL guards, transaksi atomik, idempotensi, private artifact, validasi input, dan rollback yang tidak menghapus uang tetap wajib.

## G: Goals

1. Seller membuat dan mengelola listing jasa milik toko sendiri dengan moderasi admin.
2. Buyer melihat scope, exclusions, hasil, requirements, durasi, revisi, harga, dan menyetujui snapshot agreement sebelum pembayaran.
3. Payment manual/gateway mengirim order ke jalur jasa seller, tanpa operator assignment atau receipt digital.
4. Dana terbayar ditahan selama requirements, pengerjaan, review, revisi, complaint, dan refund pra-release.
5. Seller mengirim hasil berversi; buyer menerima exact latest delivery ID yang ditinjau. Acceptance valid melepas sale credit sekali.
6. Buyer dapat meminta revisi in-scope atau mengajukan complaint sebelum acceptance. Admin meninjau bukti; refund penuh tetap melalui permission/akuntansi existing yang diadaptasi secara scoped.
7. Buyer/seller/admin melihat status, deadline, alasan hold, delivery/revisi/complaint/refund, serta dana yang konsisten.
8. Semua jalur minimum lulus pengujian sebelum checkout jasa seller diaktifkan; kebijakan bisnis yang belum final tidak diputuskan oleh engineer.

## R: Role

Bertindak sebagai **Engineer Spesialis Transaksi Jasa Seller Marketplace dan Rekber**, dengan keahlian PostgreSQL transaction/RLS, kontrak pengerjaan jasa, artifact privat, serta integrasi React/TypeScript. Mandat hanya jalur jasa yang dikerjakan seller setelah pembayaran: listing/moderasi, snapshot agreement, requirements, hold dana, delivery berversi, revisi, acceptance buyer, complaint/full refund, release idempoten, dan monitoring/UI minimum yang disebut dalam framework ini. Bukan role pengembang umum untuk seluruh marketplace.

Setiap perubahan wajib dapat ditelusuri ke temuan JS-01 sampai JS-11, action terkait, dan acceptance check dalam dokumen ini. Sebelum edit, tetapkan peta file exact di dalam allowlist Context. File integrasi bersama hanya boleh berubah pada cabang jasa seller yang diperlukan; jangan refactor atau memperbaiki perilaku produk digital, akademik/operator legacy, maupun consumer unrelated. Jika kebutuhan tidak mempunyai dasar scope atau membutuhkan file di luar allowlist, catat blocker dan hentikan bagian tersebut sampai ada persetujuan scope baru.

Dilarang menambah milestone, custom offer, fee engine, payout, chat/ticket engine umum, provider baru, redesign marketplace/dashboard, atau perbaikan unrelated yang ditemukan saat inspeksi. Pengujian regresi jalur legacy diperbolehkan untuk membuktikan perubahan jasa tidak merusaknya, bukan izin mengembangkan jalur legacy.

Bekerja sendiri. Tidak spawn agent, menyalakan server, atau menggunakan browser-use. Tidak mencetak credential atau data produksi. Framework ini tidak meminta CreateWorkflow. Inspeksi source sebelum edit, pilih perubahan minimum, gunakan dependency existing. Catat apa yang benar-benar diuji; static assertion bukan bukti PostgreSQL/RLS/race/GUI.

User menentukan policy JDO-01 sampai JDO-08. Engineer boleh menyiapkan kontrak dengan checkout disabled; tidak mengaktifkan keputusan yang belum ada atau menetapkan kebijakan bisnis sendiri. Perubahan role ini bukan izin implementasi. Otorisasi source tidak otomatis mengotorisasi produksi atau publish frontend.

## C: Context

### Dasar source yang harus dibaca ulang sebelum eksekusi

- JS-01/JS-02: services/packages/addons dan create_service_order adalah platform-owned; checkout layanan memanggil createAcademicOrder.
- JS-03: migration digital receipt 20261002120000 mendefinisikan review manual dan settle gateway. Cabang layanan fallback memakai waiting_assignment/admin task operator.
- JS-04: migration 20261002130000 mengharuskan receipt hanya untuk digital_product. Non-digital paid/completed belum mempunyai guard penerimaan jasa.
- JS-05: job_results/revisions dan review/submit existing terikat operator; review menerima order ID saja. Jangan menyalinnya sebagai endpoint seller.
- JS-06/JS-07: request_refund memakai window dari paid_at; reject fallback completed bukan restoration jasa yang aman. Process refund memakai remaining released sale dan menolak alokasi ambigu.
- JS-08: job-results permission operator dan URL Hermes setahun tidak boleh diperluas ke seller.
- JS-09: inquiry produk bukan thread agreement/delivery order jasa.
- JS-10: held dan monitoring existing hanya digital.
- JS-11: SLA job existing berbasis operator_assignments, bukan kontrak seller.

Baca dokumen riset terlebih dahulu. Verifikasi definisi migration paling baru dan linked database hanya saat tahap itu diotorisasi. Jangan menyalin asumsi deployment dari dokumen historis.

### Pilihan kontrak yang direkomendasikan

- Order type `marketplace_service` terpisah dari `service` legacy dan `digital_product`.
- Katalog jasa seller baru, tidak mengubah katalog akademik menjadi multi-vendor.
- Detail order jasa menyimpan agreement immutable, state pekerjaan, requirements version/approval, ready_at, due_at, latest delivery, acceptance, dan prior state refund/complaint.
- Delivery berversi, artifact privat atau URL HTTPS, revisi/keluhan terkait delivery yang benar.
- Order-level event sederhana dapat menampung komunikasi yang diperlukan; tidak membangun chat generik baru.
- Global order status existing digunakan bila cukup; state detail bukan pengganti status payment/refund. Jangan membuat dua state yang dapat berubah sendiri tanpa invariant.
- Acceptance tidak dapat ditulis langsung oleh client. RPC acceptance satu-satunya jalur normal; admin tidak boleh menerima atas nama buyer.

Nama tabel/RPC final dipilih setelah inspeksi, bukan alasan membuat abstraction framework. Unique constraints wajib untuk order detail, delivery version, acceptance order, checkout idempotency, dan sale credit.

### Batas file ketika implementasi kelak diotorisasi

Allowlist berbasis integrasi nyata, bukan perintah mengedit semua file:

- Migration additive baru di `supabase/migrations` untuk katalog jasa, order contract, RPC/RLS/grants, dispatcher, guard finance/refund, monitoring, dan constraint terkait.
- Modul jasa seller/marketplace baru di `src/lib`, validator/type payload bersama bila benar-benar dipakai.
- `src/lib/seller.functions.ts`, `src/lib/orders.functions.ts`, `src/lib/order-monitoring.functions.ts`, `src/lib/transaction-labels.ts`, `src/lib/transaction.server.ts`, serta modul katalog/admin/refund/settings hanya untuk consumer jasa yang terbukti diperlukan.
- Komponen jasa baru dan komponen order/monitoring/status existing yang benar-benar dipakai.
- Route seller listing/pesanan jasa, buyer katalog/checkout/detail, admin moderasi/detail/antrean yang minimum diperlukan. Peta exact route ditulis sebelum source berubah.
- Sidebar seller dan link katalog hanya jika destination sudah berfungsi.
- Supabase generated types dan route manifest hanya bila perubahan schema/route menuntut regenerasi; tidak mass-refactor caller unrelated.
- Regression tests pada `src/lib/__tests__`; fixture/helper/log scoped di `.zcode`, tidak dipublikasikan bila mengandung data produksi.
- Research/framework/evidence terkait di `docs/audit` dan `docs/remediation`.

Tidak mengedit AGENTS.md, dependency, histori git, akademik/operator UX, provider integration baru, konfigurasi payout, atau dashboard/settings unrelated. Perluasan di luar batas ini membutuhkan scope baru.

## A: Actions

### A-01. Baseline dan policy gate

1. Baca riset; petakan JS-01 sampai JS-11 ke source saat eksekusi. Rekam daftar file minimum dan dependency SQL.
2. Catat JDO-01 sampai JDO-08 yang sudah diputuskan beserta sumbernya. Jangan menciptakan timer, fee, hak refund, retensi, atau klaim legal sendiri.
3. Checkout jasa seller default disabled. Guard disable wajib di RPC database dan server endpoint; client feature gate saja tidak cukup. Jangan memberi authenticated jalur insert langsung orders/details/acceptance yang melewati gate/guard.
4. Rekam baseline unit/build/lint/typecheck. Bila deployment kelak diotorisasi, backup definition/grants/constraint dan data invariant dengan informasi sensitif tetap lokal.

### A-02. Katalog, snapshot, checkout

1. Katalog jasa seller memiliki ownership toko, field agreement yang dibutuhkan, moderasi, kategori platform, dan status publikasi. Seller tidak dapat self-approve melalui direct API.
2. Checkout server memvalidasi user, toko aktif, listing published/approved, harga integer IDR, paket tunggal, requirements format, dan idempotency. Buyer tidak mengirim nominal sebagai sumber harga.
3. Simpan snapshot store/name, scope/exclusions/deliverable, harga, durasi, revisi, requirements schema, serta policy version. Perubahan listing/toko tidak menulis ulang agreement existing.
4. Tolak multi-seller/mixed digital-service order. Buyer credit, diskon, fee nonzero, atau refund allocation yang belum disetujui tidak aktif pada jasa MVP. Jangan mengubah policy digital existing untuk menerapkan batas jasa.
5. Tambahkan discriminator/foreign key dan constraint order/item secara additive. Periksa actor_type/status/task_type serta consumer filter, label, report, MCP/API yang memakai asumsi dua order type. Consumer unsupported harus fail closed, bukan menganggap jenis baru sebagai layanan platform.

### A-03. Payment dispatch dan hold/release guard

1. Tambah cabang jasa marketplace pada review manual serta settle gateway sebelum fallback platform. Valid payment mengisi paid evidence lalu state jasa waiting requirements/ready sesuai data. Tidak membuat digital entitlement, digital receipt, assignment operator, atau academic task.
2. Fungsi credit_seller_earnings harus mengenali jasa marketplace secara eksplisit. Syarat wajib: acceptance buyer owner, accepted_at, exact accepted delivery ID, order state valid, paid evidence, dan tidak ada revision/complaint/refund aktif. Jenis tidak dikenal ditolak, bukan fallback paid.
3. Trigger tidak release pada payment/start/submit/revision/manual completed. Jika memakai trigger pada acceptance/completed, fungsi finansial tetap mengulangi guard; jangan hanya memindah satu kondisi trigger.
4. Acceptance dan sale credit dalam transaksi yang sama. Gunakan sale:<order_id>:<store_id> existing bila kontrak hak seller cocok. Tidak mengganti ledger historis atau menganggap receipt digital sebagai receipt jasa.
5. Held service dihitung server dari snapshot hak seller pada jasa paid belum released/refunded, termasuk complaint/refund pra-release. Shared predicate/projection harus membuat detail dan aggregate sama. Existing held digital tidak berubah.

### A-04. Requirements, delivery, revisi, acceptance

1. Buyer memberikan requirements versi. Seller memeriksa dan menyetujui versi aktual; perubahan setelah approval tidak mengubah ready_at/due_at tanpa kesepakatan baru yang tercatat.
2. Ready_at dicatat sekali saat paid dan requirements lengkap. Due_at dari ready_at plus durasi snapshot, bukan waktu seller menekan Mulai. Reschedule hanya bila kontrak/policy disetujui dua pihak; jangan reset tenggat sepihak.
3. Seller mengirim hasil dari order milik snapshot tokonya, dalam state valid, dengan paid evidence serta artifact/link valid. Ringkasan kosong atau tanpa hasil tidak cukup. Submit menyimpan delivery ID/version unik dan menjaga histori immutable.
4. Registration/download artifact memverifikasi object di bucket privat, ownership/order/version, ukuran/MIME server. Buat signed URL singkat saat akses dengan authorization baru. Jangan menyimpan signed URL panjang atau memberi orders.fulfill ke semua seller.
5. Revisi menyebut delivery ID dan alasan, memeriksa latest version/state/allowance secara atomik. Revisi di luar jatah tidak membuat charge otomatis; arahkan ke klarifikasi/complaint bila tidak sesuai scope. Scope change tidak mengedit agreement/price existing.
6. Acceptance menerima order ID dan delivery ID. Tolak stale/superseded/other-order delivery. Duplicate exact acceptance mengembalikan hasil existing tanpa side effect, setelah auth/ownership diverifikasi.
7. Seller/admin tidak dapat acceptance normal. Guard SQL mencegah direct client update acceptance/ledger. Download, elapsed time, admin completed, atau notification tidak merupakan acceptance.

### A-05. Complaint, cancellation, full refund

1. Buyer dapat complaint selama jasa paid belum accepted, termasuk waiting requirements/revision/review dan pekerjaan yang lewat window paid_at legacy. Ini mengizinkan review, bukan refund otomatis.
2. Pengajuan complaint mengunci order dan memblokir acceptance/release pada transaksi yang sama. Simpan alasan, delivery bila ada, bukti privat, dan state sebelumnya. Seller terkait dapat merespons, bukan menutup complaint sendiri.
3. Admin dengan permission yang tepat mencatat klarifikasi atau keputusan beserta alasan/evidence. Pilihan MVP: lanjut pekerjaan/review atau full refund. Tidak force accept/award ke seller. Closing complaint tidak otomatis release.
4. Request/review/process refund untuk jasa memakai restoration state tersimpan dan tervalidasi. Jangan memakai fallback completed; jangan langsung memulihkan prior state jika state/detail sudah tidak konsisten.
5. Refund penuh sebelum release tidak menulis debit seller. Sesudah release reserve remaining sale dan debit idempoten. Reserve dilepas saat reject/complete tanpa pengurangan ganda. Complaint pasca-acceptance hanya tersedia jika JDO-03 dan reserve policy disetujui.
6. Unpaid cancellation/expiry tidak membuat sale/held. Paid cancellation melalui refund, bukan sekadar status cancelled. Jangan menandai order refunded sebelum eksekusi refund yang sah selesai.
7. Nyatakan kanal refund yang benar. Credit buyer existing bukan transfer bank. Partial/mixed-credit/fee allocations tetap ditolak sampai kontrak baru diputuskan.

### A-06. Locks, races, idempotensi

Tetapkan urutan lock yang terdokumentasi untuk setiap RPC baru, mulai order lalu row terkait dengan urutan deterministik. Audit shared payment paths sebelum mengubah lock; existing manual/gateway payment-first berbeda dari order-first pada receipt/refund. Jangan mengklaim semua jalur sudah seragam hanya karena RPC baru order-first.

Wajib uji dua sesi untuk acceptance vs complaint/refund, acceptance vs resubmission, duplicate submit/revision/acceptance, payment retry, dan refund processing ganda. Menang acceptance dahulu bukan sama dengan complaint dahulu; hasil kedua operasi mengikuti state final dan policy, tanpa kredit setelah complaint sudah aktif. Unique constraint melindungi duplicate, tetapi tidak menggantikan transaksi/locking.

### A-07. Tampilan dan notifikasi minimum

- Buyer: agreement immutable, requirements, progress/state, due_at, latest delivery/version, download/link, revisi, complaint, acceptance exact version, refund status.
- Seller: listing/moderasi, pesanan toko sendiri, requirements clarification/approval, start/delivery, revisi/complaint response, alasan hold, release/refund history. Seller tidak melihat data seller lain atau buyer profile yang tidak perlu.
- Admin: moderasi jasa dan antrean requirements terhambat, overdue, awaiting buyer review, complaint, refund; detail bukti dengan permission, audit keputusan. Counts/pagination di server.
- Finance: held digital dan service terpisah jika perlu, total konsisten, available dan refund reserve existing. Tidak membuat tombol withdraw/payout.
- Notifikasi in-app pada event nyata memakai existing notifications. Tidak menambah email/provider. Deadline awal cukup query/monitoring; jangan mengklaim reminder terjadwal sudah aktif.
- UI mengikuti DESIGN.md dan komponen existing, mobile/keyboard/loading/error/empty. Tidak menambah asset/dependency atau redesign umum. Error finansial tidak disamarkan sebagai nol.

### A-08. Pengujian dan urutan aktivasi

1. Implementasi source dan migration additive dilakukan dengan gate jasa mati. Guard finance tersedia sebelum jalan apa pun dapat membuat order jasa seller terbayar.
2. Unit/source regression dan build/lint/typecheck mengungkap kontrak/type integration. PostgreSQL transaction rollback menguji RPC, RLS/grants, state, ledger, dan formula. Storage access diuji secara terpisah dari mock artifact.
3. Dua sesi nyata diperlukan untuk race; sequential duplicate bukan evidence concurrency. Bila lingkungan tidak tersedia, tandai belum diuji dan jangan aktifkan checkout.
4. Jika deployment diotorisasi, inspeksi linked schema/function/grants dan transaksi aktif; backup, preflight, fixture rollback, lalu terapkan migration dalam urutan tanpa celah paid-credit. Migration registry/dependency diperiksa; jangan memakai helper hardcoded digital/manual.
5. Postflight definitions/grants/invariant baseline, runtime rollback ulang. Aktivitas produksi baru dicatat terpisah; jangan menghapus/revert transaksi karena snapshot total bertambah.
6. Frontend/server consumer dipasang setelah database aman. Aktivasi checkout hanya setelah policy, provider/legal, seluruh acceptance checks, dan otorisasi produksi tersedia.
7. Batas user masih melarang server/browser. Build dan source review bukan GUI pass. Verifikasi GUI memerlukan lingkungan existing yang diizinkan atau otorisasi terpisah; tidak dilompati untuk menyatakan produksi siap.

### Acceptance checks wajib

Daftar berikut spesifikasi pengujian, seluruhnya belum dijalankan untuk jasa marketplace.

| ID | Kasus | Hasil wajib |
|---|---|---|
| J-T01 | Anon, seller lain, buyer lain, operator unrelated | Execute denied/NOT_FOUND/FORBIDDEN; payload dan object tidak bocor |
| J-T02 | Seller sekaligus admin membuka scope seller | Tetap hanya snapshot toko sendiri |
| J-T03 | Draft/unapproved/suspended store; direct publish | Checkout ditolak; seller tidak self-approve |
| J-T04 | Harga/toko/scope/policy diubah setelah checkout | Agreement dan hak seller existing tetap |
| J-T05 | Gate mati via UI/server/direct RPC | Tidak dapat membuat checkout jasa baru |
| J-T06 | Duplicate checkout/payment manual/gateway | Satu order/payment efektif; tanpa assignment/receipt digital |
| J-T07 | Paid, ready, start, submit, revision, manual completed | Belum ada sale credit tanpa acceptance valid |
| J-T08 | Direct credit_seller_earnings sebelum acceptance | Ditolak, termasuk caller service-role pada kontrak jasa |
| J-T09 | Requirements belum lengkap atau stale version approval | Pengerjaan/ready transition ditolak; hold dan action queue benar |
| J-T10 | Due_at dan retry ready/start | Anchor tidak bergeser diam-diam; delay terlihat |
| J-T11 | Submit tanpa artifact/link; object toko/order lain | Ditolak; object tidak bisa ditukar lewat path/metadata client |
| J-T12 | Private object read/sign setelah auth/ownership berubah | Akses baru ditolak; signed URL tidak disimpan permanen |
| J-T13 | Latest delivery versus stale/superseded/other-order ID | Acceptance salah versi ditolak; UI refetch |
| J-T14 | Revisi valid/jatah habis/duplicate/race | Event dan allowance konsisten; tidak auto-charge/release |
| J-T15 | Acceptance valid/duplicate/retry setelah auth berbeda | Kredit sekali; ownership tetap diperiksa pada retry |
| J-T16 | Complaint/refund active versus stale accept button | Release ditolak di SQL, bukan UI saja |
| J-T17 | Dua sesi acceptance vs complaint/refund/resubmit | Hasil konsisten dengan serialisasi; tanpa acceptance versi tak terlihat |
| J-T18 | Refund sebelum release | Held sampai refund selesai; seller debit nol |
| J-T19 | Refund sesudah release, duplicate process | Reserve/debit remaining sale tepat sekali; credit buyer sekali |
| J-T20 | Reject/close complaint/refund | State kerja tervalidasi pulih, tanpa default completed atau auto-release |
| J-T21 | Jasa belum accepted melewati legacy refund window | Complaint masih dapat direview; tidak menjanjikan auto-refund |
| J-T22 | Partial/mixed credit/multi-store/nonzero fee unsupported | Ditolak eksplisit, bukan alokasi tebakan |
| J-T23 | Buyer diam, seller terlambat, cancellation paid/unpaid | Tidak auto-release/refund; paid cancellation melalui refund |
| J-T24 | Seller/admin detail versus aggregate pada snapshot sama | Held/released/refund reserve konsisten; tidak double-count digital/service |
| J-T25 | Digital shared/unique/code, academic/operator legacy | Payment/delivery/receipt/revisi/refund lama tidak regresi |
| J-T26 | Label/filter/report/MCP/API dua-type assumption | Jenis jasa baru dikenal atau ditolak aman, bukan fallback operator |
| J-T27 | UI loading/error/empty/mobile/keyboard | Error eksplisit, kontrol nyata, tidak overflow; batas GUI dicatat |
| J-T28 | Migration/gate rollback dengan order paid aktif | Data/ledger/acceptance tidak dihapus; order existing tetap dapat ditangani |

## O: Outputs

Saat eksekusi kelak diotorisasi, hasil minimum:

- Kontrak state dan uang final, peta file/RPC/RLS, serta register keputusan JDO yang masih terbuka.
- Migration additive, seller-service catalog/order contract, dispatcher pembayaran, financial guard, requirements/delivery/revision/acceptance, complaint/full refund, monitoring dan UI minimum.
- Runnable regression checks pada test tooling existing serta SQL fixture rollback. Bukti race dan Storage access terpisah.
- Evidence yang membedakan source, build/typecheck, database, race, Storage, GUI, deployment, publish, dan policy approval. Tidak menyebut tahap belum diuji sebagai lulus.
- Tidak ada commit/push/publish/provider change tanpa instruksi tersendiri.

### Rollback dan insiden

1. Matikan checkout jasa baru pada database/server gate; jangan menghentikan akses penyelesaian/refund order jasa yang sudah paid.
2. Tahan release bila kontrak rusak dan lakukan inspeksi read-only. Jangan menghapus acceptance, reverse ledger historis, mengurangi saldo, atau backfill acceptance tanpa evidence dan otorisasi.
3. Untuk data jasa aktif, lakukan forward fix dengan kontrak kompatibel. Mengembalikan credit_seller_earnings non-digital ke paid-credit lama bukan rollback aman.
4. Drop object migration baru hanya bila belum ada order/data dependensi dan setelah pemeriksaan/otorisasi. Backup definition tidak berarti aman menerapkan ulang blindly.
5. Produk digital dan operator platform tetap berjalan; rollback jasa tidak rollback rekber digital/monitoring terdahulu.

## Status dokumentasi

Framework ditulis setelah membaca hasil riset. Finding JS-01 sampai JS-11 dipetakan ke actions dan tests. Policy JDO-01 sampai JDO-08 tetap keputusan terpisah. Aplikasi, migration, database, dan konfigurasi belum berubah pada pekerjaan dokumentasi ini.

Gate dokumen: struktur M/G/R/C/A/O, referensi lokal, finding/test mapping, teks tanpa em/en dash, dan label belum terimplementasi diperiksa. Gate GUI/visual tidak berlaku untuk file Markdown; tidak ada GUI pass atau runtime jasa yang diklaim.
