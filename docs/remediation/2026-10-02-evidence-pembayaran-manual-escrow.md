# Evidence perbaikan pembayaran manual

Tanggal: 2026-10-02.
Urutan: satu subagent menulis riset MD; main agent membaca riset, menulis framework MGRCAO V3, lalu mengubah source. Tidak ada subagent implementasi tambahan.

## Hasil

- Buyer detail order kembali menyediakan rekening/instruksi DANA dan form bukti. Nominal memakai payment.expected_amount, bukan total sebelum kredit.
- Rekening dibaca setelah lookup order owner-scoped. Feature flag dan kelengkapan rekening membatasi manual form/prepare.
- Signed upload memakai payment-proofs, path UID/payment/UUID. JPG/PNG/WEBP/PDF maksimal 5 MiB. Submit SQL memeriksa object dan metadata authoritative; direct INSERT proof dicabut melalui migration baru.
- Submission hanya menempatkan order dalam review. Finance approval wajib manual/DANA, submitted proof, nominal sama. Permission reject/reupload dipisahkan dari approve; alasan tetap wajib.
- UI QRIS tidak otomatis dibuat bersamaan saat manual tersedia. Update metadata QRIS memakai predikat status/provider/method/expected_amount dan memeriksa hasil konflik.
- Body fulfillment verify existing dipertahankan identik setelah normalisasi whitespace, dibuktikan regression test. Tidak ada perubahan seller ledger, trigger kredit, refund, payout, PO atau desain escrow.

## Bukti per goal framework

| Goal | Bukti yang dijalankan | Batas |
|---|---|---|
| G-1 | Owner filter source; settings live aktif/lengkap; RPC live menolak buyer lain dan manual nonaktif | Form/prepare server function belum diuji melalui GUI |
| G-2 | Storage SDK signed upload PNG nyata berhasil; oversize/ZIP ditolak; anonymous download ditolak; live RPC menolak path/object/metadata invalid | File bytes dan submit RPC diuji terpisah, bukan satu alur GUI |
| G-3 | Live authenticated RPC: submit hanya review, task terbentuk, tanpa paid/entitlement/ledger; initial + tiga ulang berhasil; kelima ditolak | Uji lock/race konkuren belum dijalankan |
| G-4 | Live role buyer tidak boleh approve; Finance approve/reject/reupload berhasil; gateway/no proof/nominal mismatch ditolak | Klik tombol Finance dan sesi JWT HTTP belum diuji |
| G-5 | Fulfillment live lama identik; approval digital membuat invoice paid, completed, entitlement dan seller credit satu kali; service/academic sesuai status existing | Unique file/code allocation tidak diuji; fixture produk shared |
| G-6 | Live submit/verify menolak gateway; static conditional write QRIS tetap lulus | Race QRIS/manual konkuren belum diuji |
| G-7 | Rerun 87 unit tests lulus; scoped lint 0 error; build sebelumnya sukses; migration dan DB/Storage runtime lulus | Full-project tsc sebelumnya gagal 70 diagnostic di file luar slice; GUI tidak diuji |

## Command dan hasil

1. `npm run test:unit -- src/lib/__tests__/manual-payment.test.ts src/lib/__tests__/escrow-invariants.test.ts src/lib/__tests__/security-h1-h4.test.ts`: 40/40 lulus.
2. `npm run test:unit`: 87/87 lulus, 9 test files; 14 test manual baru. Unit escrow existing merupakan simulasi; test SQL manual merupakan static regression, bukan integrasi database.
3. `npx --no-install eslint --quiet` pada delapan source/test slice: 0 error. Run lint tanpa quiet sebelumnya memiliki warning formatting; tidak memformat seluruh file legacy agar diff tidak melebar. Tiga file baru diformat dengan Prettier.
4. `npm run build`: sukses. Log: `manual-payment-build.log`. Build saja, tidak menjalankan preview/dev server.
5. `npx --no-install tsc --noEmit`: gagal, 70 diagnostic pada file di luar slice. Tidak ada diagnostic pada delapan source/test berubah. Log: `manual-payment-typecheck.log`. Tidak memperbaiki stale generated types/PO karena di luar scope.

## Gate UI dan batas delivery

- Inspeksi source: kontrol manual punya handler submit, validasi, error role=alert, busy state, label input, tombol utama 44px. Tidak menambah aset, font, warna, animasi, navbar atau klaim escrow legal.
- Build PASS; source functionality checks PASS.
- Click-through, responsive/theme/contrast visual: NOT CHECKED. Owner melarang browser-use pada kelanjutan ini; tidak memakai browser lain sebagai pengganti. Network Storage dan DB sudah diuji, bukan end-to-end UI. Server existing port 8081 tidak dinyalakan, dihentikan atau direstart; tidak menjalankan dev/preview/Playwright webServer.

## Daftar perubahan slice

- `src/lib/manual-payment.ts` (baru).
- `src/components/ebry/manual-payment.tsx` (baru).
- `src/lib/orders.functions.ts` (owner-scoped detail, kredit untuk tampilan existing, prepare proof, validasi submit).
- `src/lib/transaction.server.ts` (settings/feature flag/reupload limit, error manual).
- `src/routes/_authenticated/dashboard.pesanan.$id.tsx` (form manual, opsi QRIS, review state).
- `src/routes/_authenticated/admin/payments.$id.tsx` (proof/state/rail/mismatch/permission).
- `src/lib/payments.functions.ts` (owner filter dan conditional write cross-rail saja).
- `supabase/migrations/20261002110000_manual_payment_boundary.sql` (baru).
- `src/lib/__tests__/manual-payment.test.ts` (baru).
- Riset, framework, evidence dan log di docs. Backup lima file existing di `docs/remediation/backups/manual-payment-20261002/`.

## Status deployment dan keterbatasan

Migration `20261002110000_manual_payment_boundary.sql` SUDAH diterapkan pada project `wcxaheqnnsbhifpgiedk`, 2026-10-02, sesudah otorisasi owner. Linked project, URL .env dan Management API cocok. Perbandingan semua migration remote/lokal menunjukkan hanya versi ini pending. Apply menjalankan SQL dan pencatatan migration dalam satu transaksi; tidak menerapkan migration lain.

Bucket payment-proofs sebelumnya tidak ada; kini privat, batas 5.242.880 byte dan MIME JPG/PNG/WEBP/PDF. Definisi dua RPC deployed cocok dengan body migration. Privilege direct proof INSERT authenticated/anon dicabut; EXECUTE RPC authenticated tersedia, anon tidak tersedia. Bukti lama hanya dapat approved jika object ada, folder UID pemilik, ukuran/MIME valid dan nominal cocok; invalid memerlukan reupload. Initial + jumlah ulang memakai proof_reupload_limit existing (live 3).

## Evidence runtime tanpa browser

- CLI koneksi PostgreSQL meminta password yang tidak tersimpan untuk project ini; tidak mereset password. CLI login existing tersedia. Deployment memakai Supabase Management API melalui credential CLI tersimpan, tanpa mencetak/menulis token.
- Snapshot definisi sebelum/sesudah: `manual-payment-db-before.json`, `manual-payment-db-after.json`. Body fulfillment lama live dan baru identik setelah normalisasi whitespace.
- `manual-payment-db-runtime.json`: 16 kelompok assertion lulus pada DB remote. Menggunakan RPC deployed, `SET LOCAL ROLE authenticated` dan `auth.uid` buyer/Finance existing; bukan sesi login browser atau pengujian JWT HTTP. Fixture order/product berlabel test, nominal sintetis; tidak ada transfer nyata.
- Scope runtime: owner, direct INSERT, buyer tanpa permission, dua rail gateway, expiry order/payment, manual disabled, path/payment, object hilang, metadata size/MIME, oversize/ZIP, review-only submission, duplicate submit, expected_amount setelah kredit, proof wajib, reject/reupload, empat submission, limit kelima, approval digital dan service/academic, invoice, entitlement, seller credit idempotent, history/audit.
- Seluruh fixture DB dijalankan dalam subtransaction yang sengaja rollback. Jumlah order/payment/proof/entitlement/ledger/notifikasi/audit/task/storage sebelum dan sesudah identik. Settings sementara rollback juga; manual tetap aktif. Sequence angka internal dapat maju walau rollback, tidak mengubah transaksi existing.
- `manual-payment-storage-runtime.json`: upload PNG nyata melalui publishable-key SDK `uploadToSignedUrl` berhasil; 5 MiB+1 dan ZIP ditolak Storage; anonymous download ditolak; authorized temporary preview berhasil. Hanya object milik uji ini dihapus sesudahnya. Ini menguji Storage nyata terpisah dari fixture metadata pada uji RPC.
- `manual-payment-deployed-check.json`: versi migration tercatat, bucket/privilege sesuai, object proof uji tersisa 0, order/payment existing tetap 1, proof/entitlement/seller ledger tetap 0.
- Rerun `npm run test:unit`: 87/87 lulus (9 file). Rerun scoped ESLint `--quiet`: 0 error. Tidak mengubah source UI selama deployment ini.

Batas: GUI buyer/Finance, prepare server function melalui aplikasi, authenticated HTTP JWT, visual/mobile/theme, unique allocation dan race konkuren QRIS/manual belum diuji. DB dan Storage aktif serta teruji; jangan melabeli seluruh alur UI end-to-end PASS.

Tidak menambahkan status needs_review global. Mismatch memakai review existing dan approval guard. Klaim literal BR-60 needs_review belum terpenuhi; penambahan state/overpayment/reconciliation berada di luar slice.

Saldo seller existing masih satu ledger credits minus debits, bukan held/available atau withdrawable escrow. Tidak menambah hold period, release RPC, payout, refund redesign atau completion baru.
