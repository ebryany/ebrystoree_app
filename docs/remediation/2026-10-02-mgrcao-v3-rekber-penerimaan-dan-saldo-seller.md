# Framework prompt MGRCAO V3: rekber penerimaan dan saldo seller

Tanggal: 2026-10-02.
Dasar: [hasil riset rekber](../audit/2026-10-02-riset-rekber-penerimaan-dan-saldo-seller.md), ditulis lalu dibaca sebelum framework ini.
Status: prompt perbaikan siap dipakai. Belum ada implementasi, deployment, atau uji runtime rekber pada pekerjaan dokumentasi ini.

Framework ini menggantikan batas non-goal held-funds pada [framework receipt sebelumnya](2026-10-02-mgrcao-v3-penerimaan-produk-digital.md) khusus untuk permintaan owner terbaru. Dokumen lama tetap menjadi evidence slice sebelumnya. Pembuatan prompt ini tidak otomatis mengeksekusi perubahan source atau database.

## M: Mindset

Perbaiki dependency receipt dan penahanan dana seller sebagai satu lifecycle keuangan. Bedakan pembayaran diterima, akses tersedia, buyer menerima, pendapatan seller dilepas, dan payout. Payment paid tidak boleh langsung membuat saldo seller tersedia untuk order digital baru. Order completed bukan bukti cukup tanpa receipt accepted untuk peserta receipt baru.

Keputusan finansial berada di DB/server. Ledger append-only, nominal dari snapshot transaksi, idempotency per order/store, dan otorisasi objek wajib. Jangan mengandalkan disabled button atau hanya mengubah label UI. Jangan menambah wallet kedua bila ledger release dan hitungan lifecycle sudah cukup.

Bekerja sendiri. Jangan spawn agen, memakai browser-use, menyalakan/restart/stop server, menambah dependency, mengubah AGENTS.md, atau melakukan force-push/rewrite histori Lovable. Perubahan hanya slice yang ditemukan riset. Jangan menyatakan escrow berizin atau uang bank telah ditransfer hanya karena ledger bertambah.

## G: Goals yang terukur

### G-1: Receipt tersedia pada database yang benar

Sesudah deployment diotorisasi, tabel/RPC receipt/readiness/code dan grants terpasang pada project yang diverifikasi. Panggilan owner get_my_digital_receipt menghasilkan payload/null yang sah, bukan missing function atau error server generik. UI/server source dan versi database cocok. Tidak menyembunyikan migration yang belum applied dengan fallback sukses.

### G-2: Pembayaran digital menahan hak seller

Manual dan QRIS menghasilkan payment/invoice paid, entitlement/alokasi existing, order paid dengan completed_at kosong, dan satu receipt pending. Tidak ada sale credit order baru saat pembayaran. Dana menunggu penerimaan terbaca pada held_receipt, tidak ditambahkan ke available_balance. Stock belum siap tetap held.

### G-3: Acceptance melepaskan pendapatan tepat sekali

Owner buyer saja dapat mengonfirmasi ketika order paid, payment lunas, seluruh item shared/unique/code siap dan entitlement valid, tanpa refund aktif. Receipt accepted, order completed, satu sale per store, history/notification/audit selesai dalam transaksi yang sama. Gagal kredit berarti seluruh acceptance rollback. Duplicate/konkuren tidak membuat kredit kedua.

Fungsi credit_seller_earnings juga menolak release pending/unpaid/refund aktif untuk lifecycle baru, termasuk pemanggilan langsung oleh service/internal. Staff tidak boleh memalsukan buyer acceptance melalui endpoint buyer atau status completed saja.

### G-4: Refund tidak merusak saldo held atau released

Refund sebelum release selesai tanpa debit seller atas sale yang belum pernah ada. Reject receipt pending kembali paid, tetap held. Refund setelah release menyisihkan cadangan selama aktif; selesai mengganti cadangan dengan debit final sekali, sesuai pendapatan yang sudah dilepas dan belum direversal. Reject accepted kembali lifecycle yang sah tanpa sale kedua.

Tidak menggandakan cadangan/debit atau membuat saldo seller negatif semata karena refund pendapatan yang belum dilepas. Nominal/window/kredit buyer existing tidak diubah diam-diam. Kasus partial/mixed-credit/multi-store yang belum memiliki alokasi jelas menjadi gate yang dilaporkan, bukan asumsi full refund.

### G-5: Seller dan admin membaca kontrak keuangan yang sama

Perhitungan server menghasilkan ledger_balance, held_receipt, refund_reserved, available_balance. Seller summary/finance dan admin seller summary memakai basis yang sama dengan ownership/permission guards. Error query bukan saldo nol. Tidak menghitung angka dari paginated ledger frontend. Invalidation/refetch mencakup pembayaran, penerimaan, serta refund yang mengubah komponen saldo.

Tampilan membedakan dana menunggu penerimaan, cadangan refund, dan saldo tersedia. Penarikan tetap belum tersedia. Riwayat sale berarti pendapatan dilepas; jangan menamakannya uang masuk bank atau payment collection.

### G-6: Legacy dan jalur non-digital tidak berubah tanpa bukti

Tidak membuat acceptance palsu, membuka ulang completed lama, menghapus/mengedit ledger, atau mendebit saldo historis massal. Jasa/akademik mempertahankan settlement/review existing. Platform store tidak otomatis dikecualikan. Data pending yang terlanjur dikredit harus dilaporkan untuk rekonsiliasi terpisah sebelum klaim sistem konsisten.

### G-7: Evidence membuktikan tingkat verifikasi yang sebenarnya

Unit/static, PostgreSQL runtime, concurrency, build/lint, dan GUI dicatat terpisah. Test array/string SQL bukan bukti RLS atau live release. Test sebelumnya bukan hasil test baru. GUI tidak dinyatakan lulus selama browser dilarang; tidak menyalakan server sebagai workaround.

## R: Role

Engineer lifecycle digital dan ledger seller. Tugasnya menyelaraskan settlement, acceptance, release, refund, saldo, dan deployment dependency yang sudah ada. Bukan pembangun payout, sengketa, regulasi saldo, atau redesign marketplace.

## C: Context terkunci dari riset

1. RF-01: evidence sebelumnya menyatakan receipt migration 20261002120000 belum applied. Pemeriksaan live terbaru harus dilakukan saat implementasi/deployment diizinkan.
2. RF-02: trigger existing paid/completed mengkredit saat payment. Transisi paid ke completed justru dilewati.
3. RF-03: credit_seller_earnings belum mempunyai guard payment/receipt/refund. Key sale:<order>:<store> unik; execute dibatasi service_role.
4. RF-04: process_refund saat ini mendebit seluruh item store meski belum ada sale credit. Deferred release memerlukan adaptasi fungsi ini.
5. RF-05: refund setelah release masih dimungkinkan kebijakan existing; tersedia harus memperhitungkan reserve refund aktif tanpa debit dua kali.
6. RF-06: get_store_balance dan admin_store_summary menghitung sendiri-sendiri. Seller functions mengabaikan error dan memakai fallback nol; ledger list dibatasi 100/200 baris.
7. RF-07: confirm/request_refund lock order; review/process refund perlu urutan lock yang konsisten dan validasi ulang.
8. RF-08: paid_amount, total item, credit_used, fee, dan partial refund tidak boleh disamakan tanpa bukti. Acceptance timeout belum diputuskan; refund window bukan auto-release timer.
9. Receipt/readiness/UI source sudah ada. Gunakan implementasi itu; tidak membangun receipt baru dari nol.
10. Mode apply helper .zcode/manual-payment-db.mjs khusus migration manual 20261002110000. Bukan deployer receipt/rekber.

Kontrak rancangan:

```text
ledger_balance    = jumlah semua credit dikurangi debit ledger seller
held_receipt      = hak seller pada receipt pending yang sudah dibayar,
                    belum refunded/cancelled, dan belum dilepas
refund_reserved   = sisa hak seller yang sudah dilepas dan terkait refund aktif
available_balance = ledger_balance - refund_reserved
```

held_receipt tidak masuk ledger sale sampai acceptance. Refund aktif sebelum release tetap held_receipt, bukan refund_reserved tambahan. Bukti pembayaran harus tetap valid ketika payment berubah dari paid menjadi refund_requested. Cadangan tidak boleh melebihi release yang belum direversal. Jangan clamp saldo negatif historis menjadi nol atau menyebut ledger_balance sebagai saldo tersedia bila ada reserve.

## A: Actions berurutan saat perbaikan diotorisasi

### A-1: Preflight scoped dan backup

Baca hasil riset dan fungsi yang disebut. Simpan backup source yang akan diubah. Verifikasi target/project-ref, migration applied, definisi fungsi/trigger/grants efektif, dan schema receipt. Query aggregate scoped: pending receipt dengan sale, ledger/refund per order/store, jasa/legacy terdampak, serta nominal partial/mixed-credit yang ambigu. Jangan mencetak credential atau PII pembeli.

Jika source dan DB berbeda, gunakan bukti definisi efektif sebelum menulis migration. Jika ditemukan data historis yang memerlukan reversal, berhenti pada bagian rekonsiliasi tersebut dan laporkan evidence; jangan otomatis mengurangi saldo pengguna.

### A-2: Migration release minimum

Tambahkan satu migration baru setelah receipt migration. Jangan mengedit migration historis applied. Reuse tabel receipt, ledger, order/payment, dan item snapshot. Tidak perlu kolom saldo mutable, tabel payout, atau ledger kedua.

Ubah trg_credit_seller_on_paid: peserta receipt digital baru tidak dikredit saat paid; release hanya pada transisi completed dengan acceptance sah. Pertahankan jalur non-digital/legacy yang terbukti. Nama fungsi existing boleh dipertahankan agar tidak membuat trigger duplikat.

Perkuat credit_seller_earnings: lock order, validasi status/payment/receipt/refund sesuai lifecycle, nominal server-side, per-store key existing, dan insert idempoten di bawah lock. Untuk order baru, tidak boleh fallback ke legacy karena receipt hilang. Kondisi valid untuk service/legacy dinyatakan eksplisit, bukan diasumsikan dari order_type saja. Jalur trigger menjadi satu sumber pencatatan sale; jangan menambah credit kedua pada settlement/confirm.

### A-3: Acceptance tetap atomik

Pertahankan owner auth, payment check, readiness seluruh item, assignment stock yang sesuai entitlement, dan entitlement validity existing. Receipt accepted ditulis sebelum update completed agar trigger dapat memvalidasi acceptance dalam transaksi yang sama. Release/history/audit tidak boleh terpisah dari acceptance. Duplicate diterima tanpa efek kedua.

Missing Storage object, unique file buyer lain, code expired/blank, entitlement revoked/expired, unpaid, nonowner, refund aktif, atau perubahan mode katalog yang tidak konsisten tetap menolak confirm. Download/reveal code bukan acceptance. Jangan mengonsumsi quota atau mengambil stock baru untuk cek readiness.

### A-4: Refund mengetahui apakah sale sudah dilepas

Adaptasi hanya request/review/process yang diperlukan untuk urutan lock, lifecycle restore, reserve, dan debit release-aware. Gunakan order sebagai lock pertama pada operasi yang memutuskan release/refund; refetch dan validasi refund/payment sesudah lock. Jangan memilih eligibility sebelum lock lalu memakai nilai stale.

process_refund mencari sale credit yang benar per order/store beserta debit terkait yang sudah ada. Pending tanpa sale tidak ditulis debit seller. Released ditulis debit final idempoten sesuai hak yang harus direversal dan tidak melebihi sisa release. Pertahankan auth refunds.process, reference, buyer credit, revoke entitlement, history/notification/audit.

Review reject pending kembali paid; accepted kembali completed yang sah tanpa kredit ulang. Restore non-digital tidak boleh diubah menjadi completed palsu untuk mengakomodasi trigger baru.

Jika partial/mixed-credit/multi-store membutuhkan kebijakan alokasi baru, jangan mengganti amount atau mengembalikan nilai tebakan. Catat kasus dan blokir klaim/aktivasi yang tidak aman sampai keputusan itu tersedia. Full refund single-store tidak boleh ikut rusak oleh penahanan baru.

### A-5: Satu hitungan saldo untuk seller/admin

Tambahkan satu RPC finansial store dengan auth ownership/permission, menggunakan SQL agregat menyeluruh. Pisahkan internal helper bila hanya itu yang diperlukan untuk reuse; jangan menambah abstraksi lain. Pertahankan return bigint get_store_balance untuk compatibility, delegasikan available_balance ke hitungan yang sama dan audit pemakai semantiknya. admin_store_summary/admin_list_stores yang menampilkan balance juga harus menggunakan basis sama bila masih menghitung langsung.

Query memakai snapshot item, release ledger, refund aktif/completed, dan payment evidence yang konsisten. Tidak double count receipt pending plus reserve; refunded pending tidak tampil held. Keep ledger_balance sebagai audit value. Semua error finansial dipropagasikan ke UI; no-store dapat menghasilkan empty state yang sah, bukan RPC error menjadi zero success.

### A-6: UI existing dan cache consistency

Hubungkan seller summary/finance dan admin detail/list balance yang relevan. Tambahkan hanya angka/penjelasan held dan reserve yang diperlukan. Loading/error berlaku juga pada header saldo. Empty state valid hanya setelah query sukses. Pertahankan bahasa Indonesia, komponen, layout, keyboard, dan penjelasan penarikan belum tersedia.

Detail receipt/dialog menjelaskan bahwa acceptance melepas pendapatan seller; jangan menjanjikan payout bank atau menghapus hak refund existing. Sesuaikan label tren menjadi pendapatan dilepas jika sumbernya sale ledger.

Gunakan mekanisme query invalidation/realtime/refetch existing agar perubahan order/receipt/refund juga memperbarui angka held ketika tidak ada ledger mutation. Sebelum menambah subscription, cek tabel sudah berada pada publication dan event tidak membocorkan data. Tanpa event yang aman, gunakan refetch existing; jangan redesign realtime atau menambah polling agresif.

### A-7: Uji sebelum deploy

Jalankan matriks O di bawah. Sisakan test runnable dengan framework existing, tanpa dependency baru. Buat fixture SQL rollback scoped untuk fungsi/permission/balance. Uji concurrency membutuhkan dua sesi DB dan pencatatan hasil; jika tidak dapat dijalankan, tulis belum terverifikasi, bukan PASS.

Jalankan unit/regression, lint file changed, build, serta typecheck dan pisahkan diagnostic luar slice. Jangan menjalankan development server/browser.

### A-8: Deploy dependency tanpa celah kredit dini

Hanya setelah deployment diotorisasi, recheck target dan migration state. Jika receipt belum applied, terapkan receipt lalu migration rekber dalam satu transaksi terkontrol beserta pencatatan versi yang benar. Cegah transaksi settlement beroperasi di antara dua perubahan. Jika receipt sudah applied, terapkan hanya migration baru setelah audit pending yang sudah dikredit.

Jangan reapply migration tercatat atau menjalankan mode apply manual-payment lama. Gunakan tooling existing tanpa dependency tambahan bila dapat menjaga target, versi, dan atomisitas. Snapshot definisi/grants sebelum perubahan.

Postflight memeriksa migration entries, definisi trigger/kredit/refund/balance, tabel/grants, serta get_my_digital_receipt dengan auth owner yang benar. Management API saja tidak membuktikan RLS buyer; fixture harus memakai role/claims yang sesuai. Bukti data produksi dibatasi aggregate, tidak menciptakan order/transaksi nyata untuk test. Tulis evidence hasil dan sisa batas verifikasi.

## O: Outputs, acceptance, scope, dan rollback

### Deliverables implementasi berikutnya

- Satu migration rekber additive yang bergantung pada receipt existing.
- Trigger/credit guarded, refund release-aware, RPC hitungan saldo konsisten, adapter seller/admin minimal.
- UI held/available/reserve dan pesan acceptance pada halaman existing yang diperlukan.
- Test runnable, fixture DB rollback/concurrency scoped, evidence MD dengan status source/deploy/runtime terpisah.
- Log preflight/postflight tanpa credential/PII. Tidak mengklaim rekonsiliasi historis selesai jika belum diotorisasi.

### Allowlist

- `supabase/migrations/20261002120000_digital_order_receipt.sql`: dependency dibaca/dideploy jika belum applied; jangan menulis ulang histori. Perubahan fungsi dilakukan dalam migration baru.
- Satu migration baru, misalnya `supabase/migrations/20261002130000_digital_seller_funds_release.sql`, setelah memastikan versi belum dipakai.
- `src/lib/seller.functions.ts`: kontrak saldo/held/reserve dan error propagation.
- `src/lib/admin-seller.functions.ts`: hanya adapter saldo seller/admin bila dibutuhkan.
- `src/routes/_authenticated/seller.keuangan.tsx`: saldo dan state finansial.
- `src/routes/_authenticated/seller.index.tsx`: hanya KPI/label pendapatan jika terbukti menggunakan kontrak lama; verifikasi path aktual terlebih dahulu.
- `src/routes/_authenticated/admin/seller.$id.tsx` dan halaman daftar admin seller yang terbukti menampilkan balance: hanya kontrak saldo/label/cache.
- `src/components/ebry/digital-receipt.tsx`, `src/lib/digital-receipt.ts`, `src/lib/orders.functions.ts`, `src/routes/_authenticated/dashboard.pesanan.$id.tsx`, `src/lib/transaction.server.ts`: hanya pesan release, payload/guard error/invalidation yang diperlukan.
- Test existing `src/lib/__tests__/digital-receipt.test.ts`, `src/lib/__tests__/escrow-invariants.test.ts`, atau satu test rekber scoped; fixture/deployment helper kecil di `.zcode/` bila tooling existing tidak memenuhi atomisitas/version checks.
- Riset/framework/evidence slice ini. Jangan memformat ulang source di luar slice.

Allowlist bukan perintah menyentuh seluruh file. Jika pemakai saldo lain ditemukan, catat dependency dan alasan sebelum memperluas perubahan. Tidak mengubah laporan keuangan umum hanya karena memakai kata revenue.

### Non-goals dan keputusan yang tidak dibuat

Payout/withdrawal, rekening escrow legal, hold tambahan sesudah acceptance, auto-confirm/scheduler, dispute/freeze engine baru, partial acceptance/release per item, perubahan fee, refundability fee, nominal/window refund buyer, allocation campuran tanpa keputusan, seller onboarding/moderasi, katalog/stock ingestion, provider/webhook redesign, jasa/akademik redesign, dependency, AGENTS.md, browser, server, dan git history.

Buyer diam tetap pending karena belum ada keputusan timeout. Jelaskan batas itu; jangan membuat release otomatis dari download, umur order, refund_window_days, atau entitlement expiry.

### Uji penerimaan wajib

| ID | Skenario | Hasil wajib |
|---|---|---|
| T-01 | Dependency receipt dan auth owner | RPC tersedia; owner membaca payload sah; nonowner ditolak; grants efektif |
| T-02 | Manual digital approved | Paid/pending; held bertambah; sale dan available tidak bertambah |
| T-03 | QRIS digital settle/ulang | Sama dengan manual; satu receipt/entitlement; duplicate tidak menggandakan |
| T-04 | Shared/unique/code missing atau invalid | Confirm ditolak; dana tetap held; tidak quota/stock allocation tambahan |
| T-05 | Semua item ready, owner confirm | Accepted/completed dan satu sale/store; held turun; available naik atomik |
| T-06 | Nonowner/unpaid/refund/revoked/expired | Tidak ada acceptance atau release; saldo/ledger tidak berubah |
| T-07 | Direct credit pending atau completed tanpa acceptance baru | Ditolak; tidak bypass melalui service/internal |
| T-08 | Confirm ulang dan dua sesi confirm | Satu sale/history/audit acceptance; duplicate aman |
| T-09 | Refund sebelum release approve/process | Held hilang saat selesai; tidak debit atas sale yang tidak ada; buyer flow dipertahankan |
| T-10 | Refund pending ditolak | Paid/pending; tetap held; tidak sale |
| T-11 | Refund setelah release requested | Cadangan aktif; available berkurang; held_receipt tidak dihitung kedua kali |
| T-12 | Refund released ditolak/selesai/process ulang | Reject reserve hilang tanpa sale baru; selesai debit final sekali tanpa double deduction |
| T-13 | Race confirm/request_refund/review/process | Hasil serial konsisten; refund aktif mencegah release; tidak deadlock/double credit |
| T-14 | Seller/admin dan store isolation | Nilai sama; store lain ditolak; aggregate tidak tergantung limit ledger |
| T-15 | RPC error/loading/no-store | Error/loading terlihat; nol hanya hasil sukses/empty yang sah |
| T-16 | Legacy, jasa/akademik, platform store | Tidak acceptance palsu/ledger mutation massal; jalur existing tetap benar |
| T-17 | Mixed-credit/partial/multi-store/fee aktif | Basis nominal dibuktikan; kasus ambigu dilaporkan dan tidak diproses memakai tebakan |
| T-18 | GUI dan deployment evidence | Status source/DB/race/GUI terpisah; tidak mengklaim klik/visual jika tidak diuji |

T-13 memerlukan dua sesi transaksi, bukan Promise atau simulasi array semata. Fixture harus bisa rollback tanpa mengirim notifikasi eksternal, transfer, atau webhook nyata. Sesudah acceptance pertama, refund request masih boleh mengikuti kebijakan existing; jangan menulis test yang menganggap acceptance otomatis menghapus hak refund.

### Rollback dan gate penghentian

Sebelum deploy: restore source dari backup bila perlu; jangan menghapus dokumen evidence. Transaksi deployment gagal harus rollback seluruh migration batch, bukan meninggalkan receipt aktif dengan trigger lama.

Sesudah fitur dipakai: jangan drop receipt, menghapus acceptance/ledger, memaksa paid menjadi completed, atau memulihkan kredit saat paid. Pemulihan DB memakai migration korektif yang mempertahankan penahanan dan bukti transaksi, dengan otorisasi tersendiri.

Hentikan hanya bagian yang benar-benar terblokir: target tidak cocok, definisi applied tak sesuai, data pending sudah dikredit dan perlu koreksi historis, nominal refund ambigu, atau operasi destructive belum diotorisasi. Catat fakta dan dampaknya. Jangan memperluas scope untuk menutupi gap kebijakan.

## Status dokumen ini

Hasil riset dan framework selesai disusun tanpa perubahan aplikasi/database pada fase dokumentasi. Setelah instruksi user `kerjakan`, implementasi source dan deployment atomik receipt/rekber selesai. Hasil pengujian, batas concurrency/GUI, serta status typecheck dicatat terpisah dalam [evidence implementasi](2026-10-02-evidence-rekber-penerimaan-dan-saldo-seller.md). Penulisan prompt sendiri tetap bukan evidence runtime.
