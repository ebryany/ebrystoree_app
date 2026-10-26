# Riset jasa seller marketplace dan penahanan dana

Tanggal: 2026-10-02. Status: riset source dan rancangan usulan, bukan implementasi.

## 1. Kesimpulan

Jasa seller marketplace perlu jalur transaksi tersendiri. Jasa existing dikerjakan operator platform; produk digital existing mengirim aset yang sudah tersedia. Keduanya tidak dapat langsung dipakai untuk pekerjaan seller yang baru dibuat setelah pembayaran.

Rekomendasi versi pertama: satu listing jasa dengan harga tetap, satu seller, satu pembayaran penuh, hasil akhir berversi, revisi sesuai kesepakatan, penerimaan eksplisit buyer. Dana tetap ditahan selama pengerjaan, review, revisi, atau keluhan aktif. Seller mengirim hasil, bukan menyatakan transaksi selesai. Penerimaan valid buyer melepas pendapatan sekali; payout tetap proses terpisah.

Permintaan sekarang hanya menghasilkan riset ini dan [framework MGRCAO V3](../remediation/2026-10-02-mgrcao-v3-jasa-seller-marketplace-dan-rekber.md). Otorisasi implementasi monitoring sebelumnya tidak mencakup fitur jasa ini.

## 2. Metode dan batas evidence

- Membaca source React/TypeScript, SQL migration, serta decision register marketplace. Menelusuri definisi pengganti fungsi dalam migration, bukan hanya definisi awal.
- `SOURCE_VERIFIED` berarti kontrak ditemukan pada source lokal. Tidak berarti fungsi itu diuji ulang pada database produksi.
- `GAP_SOURCE` berarti kontrak yang dibutuhkan belum ditemukan pada jalur yang ditelusuri. Bukan klaim tidak ada di setiap sistem eksternal.
- `PROPOSED` berarti rancangan yang direkomendasikan, belum dibuat atau disetujui sebagai kebijakan produksi.
- `OWNER_DECISION_REQUIRED` berarti membutuhkan keputusan bisnis/provider/legal sebelum fitur terkait diaktifkan.
- Tidak menyalakan server, menggunakan browser-use, menambah agen, membaca credential, menjalankan query database, atau mengubah source aplikasi pada riset ini.
- Evidence rekber digital dan monitoring terdahulu tetap evidence pekerjaan tersebut. Tidak dipakai sebagai bukti runtime jasa marketplace.

## 3. Tiga jenis transaksi yang harus dibedakan

| Jenis | Pelaksana | Hasil | Bukti penyelesaian |
|---|---|---|---|
| Produk digital existing | Seller/platform store | File/kode yang sudah tersedia | Receipt buyer dan readiness digital |
| Jasa/akademik existing | Operator yang ditugaskan platform | Hasil kerja operator | Review job result pada flow platform |
| Jasa seller marketplace, usulan | Pemilik toko pada snapshot order | Hasil yang dibuat setelah pembayaran | Buyer menerima versi hasil terbaru melalui kontrak jasa |

Jangan mengubah layanan akademik menjadi jasa seller, memberi role operator kepada seller, atau membuat entitlement digital palsu untuk pekerjaan jasa.

## 4. Temuan source

### JS-01. Katalog jasa existing belum seller-owned

Status: `SOURCE_VERIFIED` dan `GAP_SOURCE`.

`services`, `service_packages`, dan `service_addons` dibuat untuk layanan platform. Definisi yang ditelusuri tidak menambahkan ownership toko pada katalog tersebut; kebijakan tulis awal berbasis admin. Seller catalog sekarang membaca/menulis `digital_products`.

Bukti:
- `supabase/migrations/20260728115920_fd20fac0-bfa9-4807-bfe8-3815af1b5588.sql:234-324`: tabel services/packages/addons dan policy.
- `src/lib/seller.functions.ts:109-225`: pengelolaan produk seller; `:286-293`: ringkasan katalog digital.
- `docs/marketplace/02-decision-register.md:15-25`: satu toko, satu seller per order, services legacy dipisah.

Dampak: menambah tombol Jual jasa tidak cukup. Ownership, moderasi, kategori, snapshot toko, dan batas akses harus tersedia di database.

### JS-02. Checkout jasa sekarang adalah checkout akademik/platform

Status: `SOURCE_VERIFIED`.

Route checkout layanan memanggil `createAcademicOrder`. Wrapper jasa generik memakai feature gate akademik. `create_service_order` menyimpan harga/paket/revisi, tetapi insert item tidak menyimpan `store_id`; kelengkapan requirements pada fungsi itu didasarkan pada requirements note tidak kosong.

Bukti:
- `src/routes/_authenticated/checkout.layanan.$slug.tsx:19-37,63-73`.
- `src/lib/orders.functions.ts:79-108`.
- `supabase/migrations/20260728163749_e2661ce9-2a88-4335-9909-87e9283a3742.sql:32-76`.
- `supabase/migrations/20260728190807_282b1924-7e46-44a8-bdc8-9e70a5473c8d.sql:141`: fungsi create_academic_order yang terpisah.

Dampak: jasa seller membutuhkan input kesepakatan dan validasi requirements sendiri. Jangan memasukkan order seller ke formulir akademik atau menyimpulkan requirements lengkap dari satu teks.

### JS-03. Settlement jasa mengirim order ke penugasan operator

Status: `SOURCE_VERIFIED`.

Payment manual dan gateway membedakan digital, akademik, kemudian fallback layanan platform. Fallback tersebut membuat `waiting_assignment` dan admin task `assign_operator`. Tidak ada cabang jasa seller yang ditelusuri.

Bukti:
- `supabase/migrations/20261002120000_digital_order_receipt.sql:158-201`: review manual.
- Migration yang sama `:266-320`: settle gateway.
- `supabase/migrations/20260728190807_282b1924-7e46-44a8-bdc8-9e70a5473c8d.sql:566-615`: penugasan operator dan scope akademik.

Dampak: order jasa seller harus didispatch secara eksplisit. Tidak boleh jatuh ke `ELSE` layanan platform, membuat academic_scope_review, atau menugaskan operator otomatis.

### JS-04. Release non-digital belum mensyaratkan acceptance jasa

Status: `SOURCE_VERIFIED`. Prioritas: blokir checkout jasa seller.

`credit_seller_earnings` mewajibkan receipt digital untuk `digital_product`, tetapi untuk jenis lain cukup status `paid` atau `completed`, paid payment, dan tidak ada refund aktif. Trigger non-digital juga memanggil kredit pada transisi paid/completed yang sesuai. Fungsi ini menjumlahkan semua item ber-store tanpa memeriksa hasil jasa.

Bukti: `supabase/migrations/20261002130000_digital_seller_funds_release.sql:1-55`.

Nuansa: settlement platform sekarang langsung memakai waiting_assignment/academic_review, bukan paid. Itu tidak membuktikan kredit premature sedang terjadi pada layanan platform. Risikonya muncul bila jasa seller ditambahkan tanpa guard baru, memakai paid, atau menerima completed manual tanpa acceptance.

Dampak: wajib guard di fungsi finansial serta trigger. Membuat UI Terima hasil saja tidak melindungi pemanggilan langsung atau perubahan status lain.

### JS-05. Hasil berversi dan revisi sudah ada, tetapi kontraknya operator

Status: `SOURCE_VERIFIED`.

`job_results` memiliki versi unik per order. `submit_job_result` memerlukan permission fulfillment dan assignment operator; dapat menerima ringkasan tanpa file/link. `review_job_result` memilih submitted terbaru dari order, tetapi input review hanya order ID, bukan ID versi yang benar-benar dilihat buyer. Approval mengubah order menjadi completed. Revisi melebihi allowance ditandai chargeable, bukan otomatis ditolak atau dibayar.

Bukti:
- `supabase/migrations/20260728171844_bfa12cdf-0586-40b7-9f17-a4ea676479b9.sql:26-83,228-345`.
- `src/lib/fulfillment.functions.ts:244-283`.

Dampak: pola versi dapat diadaptasi, tetapi seller ownership, paid evidence, bukti hasil, active complaint/refund, dan exact delivery ID wajib diperiksa. Buyer tidak boleh menerima versi baru yang belum dilihat hanya karena seller mengirim ulang saat halaman buyer terbuka.

Jangan menyalin urutan lock operator begitu saja. Sebagian RPC operator mengunci assignment sebelum order, sedangkan review mengunci order dahulu.

### JS-06. Refund window existing tidak cocok untuk semua pekerjaan panjang

Status: `SOURCE_VERIFIED`.

`request_refund` memeriksa setting `refund_window_days` saat request, dihitung dari `orders.paid_at`. State yang diizinkan tidak mencakup waiting_customer_data, academic_review, atau disputed. Window bukan snapshot kebijakan pesanan.

Bukti: `supabase/migrations/20260728131658_d5dbeb52-cab3-4bdf-aa68-212b076abe97.sql:261-298`. Pencarian migration tidak menemukan redefinisi request_refund yang lebih baru.

Dampak: jasa yang belum selesai dapat kehilangan jalur keluhan/refund ketika melewati window dari pembayaran. Keluhan sebelum acceptance perlu tetap dapat diajukan selama pekerjaan aktif; itu bukan janji bahwa setiap keluhan otomatis mendapat refund.

### JS-07. Refund finansial punya fondasi, bukan resolusi sengketa jasa lengkap

Status: `SOURCE_VERIFIED` dan `GAP_SOURCE`.

Process refund existing hanya mendebit remaining released sale. Refund sebelum release tidak membuat debit seller palsu. Refund seller parsial, mixed buyer credit, multi-store, atau sale fee nonzero yang ambigu ditolak dengan REFUND_ALLOCATION_REQUIRED. Refund buyer diproses ke saldo kredit melalui `credit_refund_to_balance`, bukan bukti transfer otomatis ke bank.

Reject refund tanpa receipt digital mengambil previous_status dari history, fallback completed. Itu perlu diganti pada cabang jasa seller dengan state tersimpan dan tervalidasi, bukan fallback completed.

Bukti: `supabase/migrations/20261002130000_digital_seller_funds_release.sql:105-200`.

State `disputed` ada dalam constraint order; penelusuran source tidak menemukan engine sengketa jasa seller dengan pengajuan bukti dua pihak dan keputusan terdokumentasi. Adanya label Sengketa bukan bukti engine tersebut tersedia.

Dampak: complaint dan refund harus dipisahkan. Complaint membekukan release; admin dapat meminta klarifikasi, melanjutkan pekerjaan/review, atau menyetujui full refund sesuai policy. Admin tidak menyamar sebagai buyer untuk acceptance.

### JS-08. Storage hasil existing tidak boleh dibuka ke semua seller

Status: `SOURCE_VERIFIED`.

Policy job-results yang ditelusuri memeriksa permission orders.fulfill. Tool Hermes mengunggah hasil lalu menyimpan signed URL setahun sebagai result_url. Ini jalur operator, bukan otorisasi berdasarkan order/store seller.

Bukti:
- `supabase/migrations/20260918011253_c0310e70-2220-4269-a6ba-f295f3cbc23b.sql:12-19`.
- `src/lib/mcp/tools/hermes-deliver-result.ts:5,35-66`.

Dampak: gunakan object privat dengan pemilik/order/version tervalidasi, URL singkat dibuat saat akses. Jangan persist signed URL sebagai identitas hasil; jangan memberi seller permission global orders.fulfill. Validasi object dan metadata server, bukan hanya path atau MIME dari klien.

### JS-09. Chat inquiry bukan kesepakatan jasa per order

Status: `SOURCE_VERIFIED` dan `GAP_SOURCE`.

`createProductInquiry` menerima productId opsional dan menentukan toko melalui digital product; kontrak tersebut tidak menerima service/order ID. Migration chat menambahkan scope toko, bukan kontrak delivery/acceptance jasa.

Bukti:
- `src/lib/inquiries.functions.ts:76-101`.
- `supabase/migrations/20260930100027_buyer_seller_chat.sql:5-18`.

Dampak: jangan menganggap chat produk sudah memenuhi ruang komunikasi order jasa. MVP cukup thread/event order untuk klarifikasi, revisi, dan keluhan. Custom offer dan mesin chat baru belum perlu.

### JS-10. Dana ditahan dan monitoring saat ini khusus digital

Status: `SOURCE_VERIFIED`.

Held pada get_store_finances memerlukan digital_order_receipts pending. Projection monitoring memfilter order_type digital_product. Seller summary memakai hasil fungsi tersebut.

Bukti:
- `supabase/migrations/20261002130000_digital_seller_funds_release.sql:59-93`.
- `supabase/migrations/20261002140000_order_monitoring.sql:1-15`.
- `src/lib/seller.functions.ts:286-329`.

Dampak: jasa aktif harus ikut jumlah held tanpa membuat receipt digital. Seller/admin perlu alasan hold dan tindakan per order, bukan hanya angka saldo aggregate. Available tetap ledger dikurangi reserve; jasa belum accepted tidak dikredit sementara.

### JS-11. SLA existing memonitor assignment operator

Status: `SOURCE_VERIFIED`.

job_check_sla_breach membaca operator_assignments.deadline_at dan membuat task/notifikasi. Tidak memonitor due_at seller jasa. Definisi cron tidak membuktikan job hidup di produksi.

Bukti: `supabase/migrations/20260729024546_4f5811c8-5782-453d-ad18-5418721d128f.sql:127-168`.

Dampak: mula-mula tampilkan umur tunggu dan keterlambatan server-side. Tambahan job reminder dapat menyusul setelah kebijakan interval dan kesehatan scheduler terverifikasi. Jangan auto-release/refund hanya karena deadline lewat.

## 5. Referensi eksternal

Sumber yang berhasil dibaca pada riset ini:

[Stripe: Create separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers.md?platform=web&integration=custom&ui=elements&api-integration=paymentintents).

Dokumentasi itu memisahkan charge platform dari transfer ke connected account. Refund charge tidak otomatis membalik transfer terkait; platform harus merekonsiliasi atau membalik transfer. Pelajaran yang relevan: pembayaran, release internal, transfer, payout, dan refund adalah peristiwa berbeda. Ledger internal bukan bukti dana riil dipisahkan di provider.

Ini referensi arsitektur, bukan rekomendasi mengganti gateway. Indonesia tidak tercantum pada daftar region separate charges and transfers di halaman yang dibaca. Tidak ada verifikasi kontrak provider Ebrystore atau kepatuhan legal pada riset ini.

Artikel resmi Upwork tentang review milestone dan Fiverr tentang status order tidak berhasil diambil, keduanya HTTP 403. Kebijakan kedua marketplace, termasuk timer auto-completion, tidak dijadikan evidence atau disalin ke Ebrystore.

## 6. Flow versi pertama yang direkomendasikan

Seluruh bagian ini `PROPOSED`.

1. Seller membuat listing harga tetap: cakupan, yang tidak termasuk, bentuk hasil, requirements, lama pengerjaan, jumlah revisi. Admin memoderasi. Listing published menjadi penawaran seller.
2. Buyer memilih listing dan menyetujui ringkasan kesepakatan. Server memvalidasi toko/listing aktif dan membuat snapshot harga, identitas toko, scope, hasil, requirements, revisi, serta versi kebijakan. Perubahan listing berikutnya tidak mengubah pesanan.
3. Buyer membayar platform melalui jalur pembayaran existing. Setelah pembayaran benar-benar terverifikasi, order masuk jalur jasa seller. Dana belum masuk available seller.
4. Seller memeriksa requirements. Jika kurang, buyer mendapat permintaan klarifikasi dalam order. Validasi format wajib terjadi sebelum bayar; verifikasi substansi oleh seller dapat terjadi sesudahnya.
5. Ketika payment terverifikasi dan requirements disetujui lengkap, server merekam ready_at sekali. Due_at dihitung dari ready_at dan durasi snapshot. Delay seller memulai kerja tidak menggeser deadline diam-diam. Seller yang tidak memeriksa requirements masuk antrean tindakan, bukan hold tanpa jejak.
6. Seller mulai bekerja dan mengirim hasil akhir versi pertama melalui order. Minimal ada artifact privat yang valid atau tautan HTTPS yang valid dengan uraian hasil. Tautan luar tidak membuktikan kualitas, akses, atau kepemilikan; jika gagal diakses buyer dapat mengajukan keluhan.
7. Buyer meninjau versi tersebut. Buyer dapat menerima, meminta revisi in-scope dengan alasan, atau mengajukan keluhan. Lihat hasil/download tidak sama dengan acceptance.
8. Revisi yang masuk jatah dicatat terhadap delivery ID; dana tetap ditahan. Seller mengirim versi baru, versi lama tidak dihapus. Batas revisi tidak boleh mencabut hak keluhan atas hasil tidak sesuai scope. Tambahan scope tidak mengubah harga/deadline sepihak.
9. Acceptance buyer menyebut exact delivery ID terbaru. Server mengunci order, memeriksa versi, paid evidence, readiness artifact, dan tidak ada revision/complaint/refund aktif. Acceptance dan sale credit terjadi atomik dan idempoten.
10. Keluhan mencatat bukti buyer dan jawaban seller. Release diblokir segera. Admin meninjau dengan permission tersendiri dan alasan. Outcome MVP: lanjut/klarifikasi/review ulang atau full refund. Tidak ada force acceptance, partial release, atau award ke seller melalui perubahan completed.
11. Refund sebelum release mengembalikan hak buyer lewat jalur refund yang disetujui tanpa debit seller. Refund sesudah release memakai reserve dan debit remaining sale satu kali. Kanal refund serta fee mengikuti keputusan bisnis; saldo kredit existing tidak diberi label uang sudah dikirim ke bank.
12. Payout tetap di luar scope. Buyer diam atau seller terlambat hanya masuk antrean tindak lanjut; tidak otomatis accepted, released, cancelled, atau refunded.

## 7. Kontrak state minimum

Gunakan order_type baru `marketplace_service` sebagai rekomendasi pemisah dispatch. Jangan menyamakan `service` legacy atau `digital_product` dengan jasa seller. Item jasa dapat memakai item_type baru yang sesuai serta foreign key katalog jasa seller. Constraint, filter, label, report, dan gateway dispatcher harus mengerti jenis baru sebelum checkout dibuka.

State pekerjaan dan finansial dipisah secara logis. Nama SQL final ditetapkan pada desain implementasi; tabel berikut menetapkan perilaku, bukan DDL siap deploy.

| State pekerjaan | Aksi utama | Dana |
|---|---|---|
| Awaiting payment | Buyer membayar | Belum merupakan held terbayar |
| Waiting requirements | Klarifikasi input | Held setelah payment valid |
| Ready / queued | Seller mulai | Held |
| In progress | Seller bekerja | Held |
| Waiting buyer review | Buyer menilai delivery tertentu | Held |
| Revision requested | Seller revisi | Held |
| Complaint active | Dua pihak memberi bukti; admin meninjau | Release diblokir |
| Accepted | Buyer menerima versi terbaru | Kredit sale sekali, reserve jika kemudian refund aktif |
| Refund active | Review/process refund | Held atau reserve sesuai ada/tidaknya release |
| Refunded | Refund final | Held nol; debit hanya untuk sale yang pernah dilepas |

Order global dapat menggunakan status umum existing bila cukup. Detail state, previous_state refund/complaint, revision allowance, delivery pointer, readiness timestamp, dan acceptance berada pada kontrak jasa, bukan inferred dari status completed.

## 8. Data dan batas keamanan yang dibutuhkan

Kontrak minimal, belum nama tabel final:

- Katalog jasa seller terpisah dari akademik: store_id, status publikasi/moderasi, scope, exclusions, deliverable specification, harga IDR, durasi, requirements, revision allowance.
- Detail pesanan jasa: order_id unik, store snapshot, agreement snapshot immutable, policy_version, requirements versi/approval, ready_at/due_at, work state, prior state ketika refund/complaint, latest delivery ID, acceptance actor/time/delivery.
- Delivery berversi dan bukti artifact: order_id, version unik, submit actor/time, ringkasan, object identity atau URL; versi superseded tetap tersimpan.
- Event revisi/klarifikasi/keluhan dan respons: aktor server-derived, jenis, alasan, delivery yang dirujuk, timestamp, status/outcome. Boleh memakai tabel event kecil jika constraint dan authorization tetap dapat ditegakkan; jangan membuat engine ticket generik.
- Audit/history dan in-app notification existing dimanfaatkan. Periksa constraint actor_type, status, task_type, dan foreign key sebelum menambah nilai seller/service. Jangan menaruh seller sebagai operator agar lolos constraint.

Buyer hanya order miliknya; seller hanya order dengan snapshot toko miliknya; permission admin tidak memperluas seller scope. Admin memiliki permission objek/aksi yang tepat. RLS dan SECURITY DEFINER RPC sama-sama diuji. Private object hanya buyer terkait, seller terkait, atau admin berizin; tidak ada public bucket/signed URL panjang yang disimpan.

Pembatasan input di server dan SQL: UUID, uang integer nonnegatif, durasi/jatah revisi dengan batas operasional, panjang teks, allowed transitions, HTTPS tanpa credential URL, ownership object, ukuran/MIME server. Jangan fetch URL luar dari server tanpa kebutuhan; jika kelak perlu, tangani SSRF secara terpisah.

## 9. Perhitungan uang

- Hak seller berasal dari snapshot item milik tokonya, bukan total order termasuk admin_fee.
- `held_service`: hak seller pada pesanan jasa yang terbayar, belum accepted/released, belum refunded. Tetap held saat requirements, revisi, complaint, atau refund pra-release aktif. Predicate harus sama pada detail dan aggregate.
- `held_total = held_digital + held_service`, dengan domain order yang saling eksklusif.
- `available_balance = ledger_balance - refund_reserved`. Held tidak menjadi kredit spendable sementara.
- `released_total` historis bukan available. Acceptance jasa bukan payout.
- Reserve existing untuk remaining released sale dapat dipakai hanya setelah pemeriksaan kontrak jasanya. Complaint pasca-release, bila policy memperbolehkan, juga harus memblokir dana terkait; jangan membangun jalur itu tanpa policy dan perhitungan reserve.
- Fee marketplace tidak ditetapkan oleh riset ini. Tarif nol pada ledger existing bukan keputusan baru untuk jasa. Nonzero fee, buyer credit, diskon/partial refund memerlukan alokasi yang jelas; blokir checkout/processing kombinasi yang belum didukung.

## 10. Scope penambahan dan urutan

Tahap desain dan guard terlebih dahulu:
- JS-01 sampai JS-04: katalog seller, snapshot agreement, dispatch order/payment, financial acceptance guard.
- JS-05 dan JS-08: requirements, delivery berversi, revisi, exact-version acceptance, artifact privat.
- JS-06 dan JS-07: complaint pra-acceptance, full refund, restoration state tervalidasi.
- JS-09 sampai JS-11: event komunikasi yang diperlukan, monitoring, in-app notification, deadline visibility.

MVP publik hanya dibuka setelah seluruh jalur minimum di atas tersedia. Tahap parsial boleh dikerjakan dengan gate checkout mati; tidak menjual jasa yang belum punya jalur keluhan/refund aman.

Tidak termasuk: custom offer/negosiasi harga, milestone, subscription, multi-seller cart, jasa akademik seller, auto-confirm, refund otomatis karena terlambat, partial award, payout, fee baru, chat engine umum, email provider, badge reputasi, atau pekerjaan dashboard/pengaturan unrelated.

## 11. Keputusan bisnis sebelum aktivasi

| ID | Keputusan | Perilaku aman sementara |
|---|---|---|
| JDO-01 | Jenis jasa yang diizinkan, moderasi, batas tanggung jawab | Tidak membuka listing publik sampai policy disetujui; akademik seller dikecualikan |
| JDO-02 | Definisi revisi in-scope, tambahan scope, perpanjangan deadline | Jatah di-snapshot; perubahan tidak sepihak; tambahan berbayar belum tersedia |
| JDO-03 | Window keluhan pra/pasca-acceptance dan pembatalan | Pra-acceptance tidak ditutup hanya karena umur payment; pasca-acceptance mengikuti policy final |
| JDO-04 | Outcome sengketa dan kanal/sumber full refund | Hold; admin review; tidak menjanjikan refund bank atau award seller |
| JDO-05 | Fee, admin_fee refundable, diskon, buyer credit | Kombinasi tanpa alokasi final tidak diaktifkan |
| JDO-06 | Batas waktu respons seller/buyer dan penanganan diam | Monitoring/escalation; tidak auto-release atau auto-refund |
| JDO-07 | Retensi file/bukti, kategori artifact, penyimpanan data pribadi | Objek privat, minimalkan data; nilai retensi harus ditetapkan |
| JDO-08 | Kontrak provider, legal penahanan dana, hak seller, payout | Tidak mengklaim escrow berizin atau mengaktifkan payout dari ledger saja |

Decision register lama mencatat jasa seller sebagai non-scope MVP awal dan pertanyaan O-09 belum diputuskan. Permintaan riset terbaru mengevaluasi perluasan itu; bukan bukti seluruh policy di atas sudah disetujui.

## 12. Syarat penerimaan rancangan

1. Paid/start/submit/revision/manual completed tidak melepas saldo tanpa acceptance jasa valid.
2. Buyer menerima delivery yang benar-benar dirujuk, bukan versi baru yang muncul diam-diam; duplicate dan race tidak membuat kredit ganda.
3. Complaint/refund aktif membekukan release, meski tombol acceptance masih ada pada halaman lama.
4. Refund sebelum release tidak mendebit seller; setelah release reserve/debit tepat dan idempoten.
5. Reject complaint/refund memulihkan state pekerjaan yang valid tanpa default completed atau acceptance palsu.
6. Buyer, seller lain, admin tanpa izin, dan operator legacy tidak dapat membaca/mengubah order/object jasa yang tidak berhak.
7. Produk digital dan layanan akademik/operator tetap memakai lifecycle masing-masing.
8. Aggregate held/admin/seller sama dengan penjumlahan detail order pada snapshot yang sama; error tidak menjadi nol palsu.
9. Tidak ada checkout publik sebelum guard, complaint/refund, monitoring, dan regresi lengkap.

## 13. Pemeriksaan dokumen

R-02: teks tanpa em/en dash. R-17/R-36/R-38: fakta memakai referensi source; rancangan dan keputusan belum final dilabeli. C-3/C-5: isi terbatas pada jasa seller dan rekber, bukan klaim implementasi.

Gate UI/visual tidak berlaku pada dua file Markdown ini. Tidak ada aplikasi, visual asset, atau GUI yang dibuat/dinyatakan lulus. Pemeriksaan akhir path, struktur, dan hubungan finding dengan framework dilakukan sebagai pemeriksaan dokumentasi, bukan runtime test.
