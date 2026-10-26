# Riset pembayaran manual berdasarkan ledger/held-funds yang sudah ada

Tanggal: 2026-10-02. Workspace: `C:/Users/febry/Documents/backup`.

## 1. Batas bukti

Riset statis repository saja. Tidak menjalankan/restart server, tidak menghubungi provider, tidak mengakses DB/deployment, tidak melakukan mutasi DB, tidak mengubah source, tidak menginstal paket, tidak mengunggah data keluar. Dokumen ini ditulis sebelum rencana MGRCAO V3/perbaikan.

**Runtime dan deployed DB: NOT CHECKED.** Definisi SQL “efektif” di bawah berarti definisi terakhir menurut urutan nama migration repository, bukan bukti migration sudah terpasang. Pernyataan VERIFIED dalam audit lama tidak diwariskan sebagai bukti runtime saat ini.

Nomor rekening, kredensial, URL koneksi, isi `.env`, detail linked project tidak diperlukan dan tidak disalin. Semua referensi source memakai nomor baris 1-based, relatif terhadap workspace di atas.

## 2. Kesimpulan utama

1. Checkout digital masih membuat satu payment `provider=manual`, `method=dana`, `status=waiting_payment`. Buyer detail saat ini hanya menyediakan QRIS, bukan instruksi/form manual. RPC manual ada, tetapi tidak punya caller UI buyer.
2. Ledger seller sudah dihubungkan ke transisi order `paid`/`completed` lewat perbaikan 1 Oktober. **Jangan mengulang temuan lama “digital completed tidak mengkredit seller”.** Definisi terbaru sudah memperbaikinya.
3. Yang ada adalah saldo ledger internal `credits - debits`. Tidak ditemukan pemisahan saldo held/available, release RPC, periode hold, atau payout workflow executable. Jangan menambahkan arsitektur tersebut untuk memperbaiki manual.
4. Batas manual/gateway belum dijaga dalam RPC manual. Payment yang sudah diubah menjadi SumoPod/QRIS masih dapat menerima proof manual kemudian disetujui finance.
5. Boundary bukti belum mengikat path ke pemilik/payment/object nyata. Ukuran server masih 10 MiB, bukan 5 MB kebijakan. Bucket privat disebut docs, tetapi provisioning bucket tidak ditemukan di migration/config repository.

## 3. Kontrak escrow/held-funds aktual: docs versus kode

### 3.1 Kebijakan dan rancangan, bukan implementasi baru

- `docs/01-business/payment-manual-policy.md:13-18`: DANA; transfer tepat; mismatch `needs_review`; expiry 24 jam; JPG/PNG/WEBP/PDF maksimal 5 MB; keputusan finance; maksimal tiga unggah ulang; nomor hanya untuk pemilik order.
- `docs/marketplace/03-escrow-audit-dan-rancangan.md:18-34`: istilah escrow legal tidak boleh diklaim; payment masuk, kredit ledger, delivery, payout merupakan event berbeda.
- `docs/marketplace/03-escrow-audit-dan-rancangan.md:58-78,163-171`: audit historis, daftar fungsi lama, hold/payout/dispute belum tersedia. Daftar versi fungsi ini **sudah tertinggal** dari migration 1–2 Oktober.
- `docs/marketplace/02-decision-register.md:34`: default konservatif hold sampai `completed` merupakan keputusan/rancangan. Ini bukan bukti ledger menyimpan held balance lalu memindahkannya ke available.

### 3.2 Implementasi aktual

| Tahap | Perilaku kode saat ini | Bukti |
|---|---|---|
| Checkout digital | Harga, fee, total, expiry dihitung DB; snapshot seller di item; satu payment manual/DANA | `supabase/migrations/20260930100028_checkout_seller_enforcement.sql:44-69` |
| Checkout service biasa | Payment juga dibuat manual/DANA | `supabase/migrations/20260728163749_e2661ce9-2a88-4335-9909-87e9283a3742.sql:82-83` |
| Proof submitted | Lock payment; cek pemilik, status waiting/rejected, expiry, jumlah submission; simpan proof; payment `waiting_verification`; order `payment_under_review`; task/notifikasi/audit | `supabase/migrations/20260728131658_d5dbeb52-cab3-4bdf-aa68-212b076abe97.sql:83-138` |
| Finance approved | Permission `payments.verify`; lock payment/order; payment/invoice paid; `paid_amount=expected_amount`; entitlement idempoten per item; allocation unique files | `supabase/migrations/20260807132231_2131cb3d-9f81-45e2-8c4a-cb71a4933eed.sql:10-46` |
| Order digital setelah approved | Langsung `completed`, termasuk ketika `v_missing > 0`; notifikasi membedakan berkas belum siap | SQL verify terbaru di atas `:47-56` |
| Order service setelah approved | Academic `academic_review`; service lain `waiting_assignment`; bukan langsung completed | SQL verify terbaru di atas `:57-77` |
| Finance reject/reupload | Rejected atau waiting_payment; order awaiting_payment; proof rejected; verification/history/audit; task ditutup | SQL verify terbaru di atas `:78-111` |
| Kredit seller | AFTER UPDATE order trigger yang sudah terpasang memanggil versi fungsi terbaru ketika status baru paid/completed, status lama bukan paid/completed | `supabase/migrations/20260930100016_credit_seller_on_paid.sql:21-24`; `supabase/migrations/20261001100001_fix_seller_credit_and_refund.sql:27-36` |
| Nilai kredit seller | SUM item total per store; fee platform 0; key `sale:<order>:<store>`; lookup idempoten per store | `supabase/migrations/20261001100001_fix_seller_credit_and_refund.sql:46-87` |
| Saldo seller | Satu angka, SUM credit dikurangi debit, dengan object authorization; tidak ada kolom hold/release/available | `supabase/migrations/20260930100019_fix_store_data_idor.sql:38-53`; schema `supabase/migrations/20260930100015_seller_earnings_ledger.sql:16-31` |
| Tampilan saldo | Satu saldo pendapatan; eksplisit penarikan belum tersedia | `src/routes/_authenticated/seller.keuangan.tsx:47-64`; `src/lib/seller.functions.ts:389-397` |
| Penyelesaian service | Approval hasil oleh customer mengubah order ke completed; trigger existing dapat mengkredit item yang memiliki store_id | `supabase/migrations/20260728171844_bfa12cdf-0586-40b7-9f17-a4ea676479b9.sql:279-311` |
| Refund aktual | process_refund menyelesaikan refund, memperbarui payment/order, revoke entitlement, debit seller per store, kredit buyer melalui fungsi existing | `supabase/migrations/20261001100001_fix_seller_credit_and_refund.sql:97-164` |
| Kredit buyer | Ledger terpisah; apply_credit mengurangi expected_amount payment; cancellation/expiry reversal sudah diperbaiki | `supabase/migrations/20261002100001_fix_h1_h4_security.sql:181-194,204-234,249-278` |

**Arti “release” saat ini:** kredit akuntansi seller terjadi melalui transisi order di atas. Tidak ada release dana menjadi saldo withdrawable. Digital completion juga bukan bukti download/receipt buyer. Ini keterbatasan existing yang harus ditulis jujur, bukan alasan mengubah state machine dalam slice manual.

Total order bukan selalu nominal tunai manual setelah penggunaan kredit buyer. Untuk form transfer, gunakan `payment.expected_amount` terkini. Jangan kembali memakai `order.total` ketika porsi kredit sudah mengurangi tagihan.

## 4. Trace aplikasi dan storage

### 4.1 Server settings dan buyer

- `src/lib/transaction.server.ts:45-59`: instruksi manual, expiry, admin fee dari settings.
- `src/lib/transaction.server.ts:62-76`: detail rekening privat dibaca service role; return method/number/holder/active. Tidak menyalin nilai rekening dalam riset.
- `src/lib/orders.functions.ts:197-273`: order/detail melalui user client, kemudian return rekening/instruksi serta QRIS availability. Select order `:205-207` belum memuat `credit_used`/`amount_due`, walaupun route membaca keduanya; gap existing credit UI, bukan syarat redesign kredit.
- `src/routes/_authenticated/dashboard.pesanan.$id.tsx:79-82,190-232`: canPay ditentukan status order/payment; bagian payment hanya credit + QRIS atau pesan QRIS tidak tersedia. Tidak merender `manualAccount`, `instruction`, form bukti, atau caller `submitPaymentProof`.
- `src/lib/orders.functions.ts:279-310`: submit wrapper existing, auth + rate limit `payment.proof`, lalu RPC. Full-text source search hanya menemukan definisi `submitPaymentProof`, tidak menemukan caller. Tidak ditemukan proof prepare/signed-upload server function manual biasa; upload PO merupakan jalur berbeda, di luar scope.

### 4.2 Finance

- `src/lib/admin-transaction.functions.ts:244-280`: guard `payments.view`, ambil proofs, signed URL service role `payment-proofs` selama 300 detik.
- `src/lib/admin-transaction.functions.ts:282-314`: decision UI di-map ke approved/rejected/reupload_requested; guard permission sesuai aksi; RPC user client.
- `src/routes/_authenticated/admin/payments.$id.tsx:97,187-225`: tombol menganggap waiting_verification/waiting_payment/pending actionable, padahal RPC hanya menerima waiting_verification.
- `src/lib/mcp/tools/verify-payment.ts:6-24`: caller RPC manual lainnya. Guard inti harus di SQL, bukan hanya UI/admin wrapper.

### 4.3 Storage/RLS: bukti yang tersedia

- `supabase/migrations/20260728131741_24cbeefc-f5ab-48d6-843f-4115f28ff158.sql:1-9`: storage.objects INSERT/SELECT untuk folder UID pemilik; SELECT staff `payments.view`. Tidak ada kebijakan UPDATE/DELETE proof di file ini; upload ulang sebaiknya path baru, bukan overwrite.
- `supabase/migrations/20260728131303_a6b697c9-8537-4484-b7cc-dc81be8b40d5.sql:259-287`: proof table menyimpan metadata bebas; SELECT own/staff; INSERT customer ketika payment miliknya. Policy INSERT tidak membatasi status proof, status payment, rail, path, ukuran, MIME, atau expiry.
- `supabase/migrations/20260728164234_43ce9887-2659-42c5-a121-169a9b30707c.sql:16-19`: authenticated tetap memiliki SELECT, INSERT tabel proof. Jadi RPC bukan satu-satunya jalur tulis proof saat ini.
- Search seluruh `supabase` SQL/config tidak menemukan `storage.buckets`, `createBucket`, atau deklarasi bucket `payment-proofs` selain policy object di atas. `supabase/config.toml` tidak memuat provisioning storage.

**Batas kesimpulan:** repository belum mereproduksi provisioning bucket privat/size/MIME. Ini bukan bukti bucket deployed tidak ada atau public. Audit lama `docs/audit/02-database-map.md:44` menyebut bucket privat dan upload VERIFIED; status tersebut tidak diuji ulang. Perbaikan boleh menambahkan provisioning bucket non-public idempoten untuk fresh setup, tetapi tidak boleh menganggap setting deployed diketahui atau menjalankan migration saat riset.

## 5. Defect scoped yang terbukti secara statis

### D-01 — HIGH: manual rail tidak tersedia untuk buyer

**Bukti:** route `dashboard.pesanan.$id.tsx:190-232` hanya QRIS; wrapper/settings masih ada sebagaimana §4.1. Checkout tetap manual/DANA.

**Dampak:** buyer tidak dapat menemukan instruksi rekening atau mengirim bukti manual lewat UI repository ini; ketika QRIS unavailable, hanya disuruh menghubungi tim.

**Fix minimal:** isi section existing dengan opsi DANA saat account active, rekening lengkap, rail masih manual, payment status eligible, order awaiting_payment, belum expired. Tampilkan expected_amount/instruksi/deadline. Tambahkan form upload + sender/amount/note, panggil submit RPC existing setelah upload berhasil. Loading/error/success/reupload count; refresh query existing. Tidak menyelesaikan order/menambah entitlement di client. Tidak menampilkan rekening ke guest.

### D-02 — HIGH: submit/verify manual dapat menimpa state gateway

**Bukti:** `src/lib/payments.functions.ts:73-82` mengubah payment **yang sama** menjadi sumopod/qris. Submit RPC `20260728131658_...sql:91-113` hanya memeriksa ownership/status/expiry, tidak provider/method. Verify terbaru `20260807132231_...sql:19-35` hanya status waiting_verification, tidak rail/proof wajib.

**Skenario statis:** QRIS sudah dibuat tetapi payment masih waiting_payment; customer memanggil submit RPC untuk payment itu; status menjadi waiting_verification; finance approval melunaskan dan memicu entitlement/completed/ledger tanpa konfirmasi gateway, sambil row tetap berlabel gateway. Rejected/reupload juga dapat memutasi row gateway. Row locks membantu serialisasi, **tidak** membedakan rail.

**Fix minimal:** SQL submit dan verify wajib menerima hanya manual/DANA; jangan mengganti provider kembali dari gateway. Verify wajib punya submitted proof yang sah. UI buyer/admin mengikuti guard. Tambahan paling kecil untuk race saat start QRIS sudah membaca row manual sebelum proof masuk: update row QRIS dengan predikat status/rail yang masih eligible, cek hasil update; jangan overwrite metadata row yang sudah waiting_verification/paid. Ini guard cross-rail saja, bukan refactor QRIS/provider/webhook. Jika provider request sudah terlanjur dibuat, laporkan konflik; jangan mengaktifkan manual fallback pada row gateway.

### D-03 — HIGH: proof belum terikat ke object/pemilik/payment

**Bukti:** submit RPC `20260728131658_...sql:104-106` menyimpan path/MIME/size yang dikirim customer tanpa memeriksa storage.objects; signed URL finance `admin-transaction.functions.ts:271-275` memakai service role untuk path tersebut. Tabel proof juga menerima INSERT authenticated langsung (§4.3).

**Dampak:** proof dapat menunjuk object tidak ada atau object UID lain jika path diketahui; service-role preview melewati pemeriksaan folder customer. INSERT langsung dapat menginjeksi status/metadata proof, melewati lifecycle submission. Tidak mengklaim path korban mudah ditebak atau exploitation runtime sudah terbukti.

**Fix minimal:** prepare server function di file orders existing memeriksa payment owner, rail, state/expiry, lalu menghasilkan path unik `<uid>/<payment-id>/<uuid>.<ext>` dan upload terotorisasi untuk bucket fixed. Submit RPC tetap memvalidasi UID/payment prefix, object existence, metadata ukuran/MIME dari storage; jangan percaya metadata client saja. Cabut INSERT langsung authenticated pada tabel proof jika jalur resmi seluruhnya RPC (PO memakai tabel berbeda); SECURITY DEFINER RPC tetap dapat menulis. Verify wajib submitted proof. Jangan memakai URL publik atau signed URL preview sebagai upload proof.

### D-04 — MEDIUM: BR-62 tidak ditegakkan

**Bukti:** kebijakan `payment-manual-policy.md:15` maksimal 5 MB/allowlist MIME; `orders.functions.ts:286-288` MIME string bebas/opsional dan size maksimum 10 MiB; SQL submit tidak mengecek batas atau MIME. Schema proof `20260728131303_...sql:265-270` tidak memiliki CHECK terkait.

**Fix minimal:** satu batas konsisten 5 MiB (`5 * 1024 * 1024`) untuk client/prepare/submit/SQL/bucket, allowlist image/jpeg, image/png, image/webp, application/pdf. Metadata object authoritative; validasi client hanya UX. Nyatakan eksplisit konvensi MB/MiB dalam rencana, bukan diam-diam menetapkan nilai berbeda antarlayer.

### D-05 — LOW: finance menawarkan aksi yang pasti ditolak DB

**Bukti:** `admin/payments.$id.tsx:97` memasukkan pending/waiting_payment; SQL verify terbaru `:21-25` hanya waiting_verification dan mencari submitted proof. UI juga tidak membedakan rail pada actionable.

**Fix minimal:** actionable hanya manual/DANA + waiting_verification + submitted proof; permission per tombol sesuai RPC. Wajib alasan reject/reupload tetap dipertahankan. SQL tetap boundary otoritatif. Jangan melonggarkan RPC ke pending/waiting_payment agar cocok dengan UI.

### D-06 — MEDIUM: kontrak mismatch nominal belum lengkap

**Bukti:** BR-60 pada `payment-manual-policy.md:13` menyebut needs_review. Payment CHECK `20260728131303_...sql:203-205` tidak memuat needs_review; proof CHECK `:270` juga tidak. Submit RPC hanya menyimpan amount_claimed; verify `20260807132231_...sql:34-35` selalu mengisi paid_amount dari expected_amount, tidak membandingkan klaim proof. Admin menampilkan klaim dan expected di lokasi berbeda (`admin/payments.$id.tsx:119,141-142`).

**Dampak terbukti:** tidak ada flag/guard mismatch yang dijanjikan; persetujuan finance tetap manual, bukan auto-approval. **Tidak menyimpulkan setiap klaim mismatch pasti uang kurang**, sebab klaim customer bukan bukti saldo penerima.

**Fix minimal yang tidak menambah state:** tandai mismatch jelas di review; submit tetap waiting_verification; tolak approval ketika proof.amount_claimed berbeda expected_amount dan minta reupload koreksi. Tidak menambah status baru pada semua consumer. Rencana harus menyebut gap literal BR-60/needs_review dan pilihan konservatif ini; jangan mengklaim BR-60 selesai sepenuhnya tanpa penyesuaian dokumentasi kontrak. Dukungan nominal actual berbeda/overpayment berada di luar slice.

## 6. Hal yang tidak boleh dilabeli defect baru

- Reupload counter bertambah pada **setiap submission**, termasuk pertama. Guard `reupload_count > limit` sebelum increment memungkinkan empat submission ketika limit=3: satu awal + tiga ulang. Jadi ini bukan off-by-one yang harus diganti menjadi `>= 3` begitu saja. Bukti `20260728131658_...sql:96-110`. UI dapat menampilkan `max(0, count-1)` sebagai jumlah ulang.
- Entitlement baru dibuat saat finance approved, bukan saat proof submitted. Ini hook benar yang wajib dipertahankan.
- Digital completed/credit seller walaupun berkas belum siap adalah perilaku existing (§3), bukan scope penggantian completion/hold.
- Bug trigger/idempotency/refund historis F-01/F-02/F-03 sudah memiliki definisi pengganti 1 Oktober. Jangan mengedit ledger hanya berdasarkan audit lama.
- Saldo credit buyer berbeda dari seller earnings. Jangan membuat wallet baru.
- Privasi rekening telah memakai service-role settings; tidak ditemukan rekening manual publik di route buyer yang ditelusuri. Tetap tambahkan explicit owner filter di lookup order/payment untuk endpoint baru, karena staff punya read permission lebih luas.

## 7. Rekomendasi slice terkecil untuk MGRCAO V3

Urutan pelaksanaan setelah riset disetujui sebagai dasar rencana:

1. Restore manual buyer UI dalam section existing, memakai settings dan RPC existing.
2. Tambahkan prepare upload di `orders.functions.ts`; selaraskan validation 5 MiB/allowlist; RPC checks object/rail/state tetap otoritatif.
3. Satu migration aditif baru untuk definisi submit/verify hardened, revoke INSERT proof langsung, provisioning bucket privat idempoten bila dibutuhkan fresh setup. Pertahankan seluruh efek entitlement/task/history/notifications/audit dan seller trigger existing. Jangan mengedit history migration published.
4. Finance actionable/proof/mismatch guard; satu conditional-write guard kecil di startQrisPayment agar metadata gateway tidak ditempel pada payment yang sudah masuk review/paid.
5. Targeted unit/static/component tests. DB integration/GUI runtime hanya pada tahap terpisah berizin; jangan menjalankannya sebagai bagian riset ini.

### Allowlist perubahan yang disarankan

- `src/routes/_authenticated/dashboard.pesanan.$id.tsx` — manual UI dalam detail order existing.
- `src/lib/orders.functions.ts` — prepare upload, input validation, owner-scoped data yang diperlukan; select credit_used/amount_due hanya jika dipakai untuk tampilan nominal existing.
- `src/lib/transaction.server.ts` — mapping error manual tambahan saja, jika diperlukan.
- `src/routes/_authenticated/admin/payments.$id.tsx` — actionable, proof/mismatch state, alasan/permission.
- `src/lib/admin-transaction.functions.ts` — hanya validasi wrapper bila diperlukan; SQL guard tetap wajib.
- `src/lib/payments.functions.ts` — hanya conditional metadata write/hasil konflik cross-rail.
- Satu file SQL baru di `supabase/migrations/` — boundary manual/proof/storage; tidak menjalankan migration otomatis.
- Test minimal terkait di `src/lib/__tests__/` atau test route/component existing bila harness mendukung.

### Non-goals

Tidak membangun escrow legal, split held/available, release schedule, payout, dispute/freeze, refund redesign, PO redesign, QRIS/provider refactor, webhook redesign, order completion/delivery redesign, wallet baru, billing reconciliation besar, perubahan seluruh status enum, perubahan AGENTS.md, atau mutasi DB produksi. Tidak mengganti append-only ledger/trigger existing dengan logika saldo di aplikasi.

## 8. Verifikasi yang tersedia dan yang perlu ditambahkan

### Existing tests/scripts

- `package.json:6-18`: test:unit=`vitest run`; lint=`eslint .`; verify juga menjalankan build; tidak ada script khusus manual.
- `src/lib/__tests__/escrow-invariants.test.ts:3-8,12-46,59-76`: simulasi test-local ledger/key, bukan import SQL/production escrow. Jangan melabelinya bukti settlement/RLS/row-lock runtime.
- `src/lib/__tests__/security-h1-h4.test.ts:1-25,45-107`: pola pembacaan migration/static regression untuk boundary SQL, berguna tetapi tidak membuktikan DB terpasang.
- `tests/e2e/authenticated/dashboard.spec.ts:3-26`: page-smoke dashboard/list/library/settings, tidak menguji manual proof/detail/approval.
- `playwright.config.ts:37-42`: webServer menjalankan `bun run dev` jika belum ada. **Jangan menjalankan npm run test:e2e/test/verify untuk riset ini.** Unit/lint/build juga tidak dijalankan; laporan ini bukti inspeksi saja.

### Targeted checks setelah implementasi

Command unit yang tidak menyalakan server: `npm run test:unit -- src/lib/__tests__/escrow-invariants.test.ts src/lib/__tests__/security-h1-h4.test.ts` lalu file regression manual baru secara eksplisit. Lint hanya file yang diubah: `npx --no-install eslint <daftar-file-source/test>` dari workspace. Tidak menginstal dependencies.

Acceptance tests yang disarankan:

1. Manual owner dapat melihat rekening/instruksi/expected_amount, hanya saat aktif dan eligible; guest/owner lain tidak; flag inactive/missing account memberi unavailable tanpa upload.
2. File allowlist/5 MiB tepat batas diterima; oversize/MIME lain/path UID lain/path payment lain/object absent ditolak. Client metadata palsu tidak menentukan hasil.
3. Proof submit hanya mengubah review state/task/audit, tidak entitlement/paid/ledger. Submission awal + tiga ulang boleh; kelima gagal; counter tidak memblokir initial submission.
4. Approval submitted proof manual tepat nominal menghasilkan invoice paid, entitlement sekali, order status existing, satu seller key sale per store. Duplicate approval gagal aman tanpa double credit; reject/reupload tidak membuat earnings.
5. Gateway-labeled row ditolak submit **dan** verify langsung via RPC meskipun UI disembunyikan. Race start QRIS versus proof tidak menempelkan metadata gateway setelah review/paid; tidak mengganti provider ke manual.
6. Admin pending/waiting_payment tidak menawarkan verify; missing proof/mismatch tidak approved. Reject/reupload wajib reason dan permission existing.
7. Dengan buyer credit terpakai, transfer memakai expected_amount sisa, bukan total original. Refund/cancel effects tetap existing; tidak menguji/memperbaiki redesign refund di slice ini.
8. Fresh isolated DB (hanya berizin nanti): bucket non-public, size/MIME configured; owner/staff RLS; direct INSERT proofs denied; SQL metadata/locks/entitlement/ledger assertions nyata. Unit/static pass tidak menggantikan test ini.

**Hasil riset:** ada defect manual terkonfirmasi secara statis. Prioritas paling kecil: restore buyer manual + harden boundary proof/rail, tanpa mengubah escrow/ledger architecture. Semua klaim deployment tetap NOT CHECKED.
