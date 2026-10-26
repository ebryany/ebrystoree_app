# MGRCAO V3: Aktivasi checkout jasa seller

Dasar: `docs/ui-ux/2026-10-03-riset-checkout-jasa-seller.md`. Otorisasi pengguna: "oke aktifkan". Tanpa spawn agent.

## M: Mission

Aktifkan perjalanan katalog jasa seller sampai checkout, pembayaran existing, persetujuan kebutuhan seller, pengiriman hasil, dan peninjauan buyer tanpa melepas dana sebelum acceptance.

## G: Goal

Klik jasa membuka `/checkout/jasa/$id`. Buyer melihat agreement dan total database, mengisi kebutuhan dan consent, membuat satu order idempotent, lalu membuka `/dashboard/pesanan/$id` untuk pembayaran. Listing berubah/inaktif/toko sendiri ditolak. Tidak ada transaksi keuangan nyata saat pengujian.

## R: Role

Senior marketplace engineer dan frontend/UI/UX specialist, bertanggung jawab pada atomic database contract, authorization, payment dispatch, dan pengalaman transaksi mobile. Kerja sendiri.

## C: Constraints

- Riset MD sebelum framework dan implementasi.
- Migration baru, tidak rewrite migration deployed/history Lovable.
- Harga, versi, agreement, ownership dan eligibility ditegakkan SQL.
- Anonymous tidak memperoleh SELECT tabel privat atau EXECUTE checkout.
- Duplicate key memverifikasi pemilik dan service, termasuk balapan request concurrent.
- Consent wajib dan stale total/version ditolak. Snapshot tidak berubah mengikuti edit listing.
- Tidak tambah dependency, abstractions, fake data produksi, artwork, atau fitur upload.
- Perbaiki JSON type guard di lifecycle sebelum aktivasi.
- Acceptance/payment/refund testing hanya fixtures rollback; tidak klik aksi uang pada data asli.
- Arah existing Ebrystore, ENERGY 2 / RHYTHM 2 / MOTION 1. Loading/error/empty/pending, keyboard dan target 44px wajib.

## A: Actions

1. Migration constraint/FK, RPC authenticated quote dan create, lock/idempotency, snapshot invoice/payment/contract, guard JSON lifecycle.
2. Server validators/feature/rate-limit/error mapping, checkout route, card links.
3. Integrasi detail order buyer dan filter jasa customer; ubah copy disabled menjadi ketentuan transaksi aktual.
4. Unit test input, navigasi, security source guards; database rollback test creation/duplicate/self-purchase/stale/inactive/privileges/snapshot/no-ledger.
5. Preflight linked database, transactional migration apply/registry setelah rollback test lulus, read-only verification.
6. Build, scoped lint/typecheck comparison, browser checkout/navigation/validation tanpa submit order nyata. Catat evidence dan batas verifikasi.

## O: Acceptance

- Kartu homepage dan /layanan mempunyai tujuan checkout yang nyata.
- Login dipertahankan; route checkout bukan route akademik.
- Total server terlihat, full agreement terbaca, kebutuhan dan persetujuan diwajibkan.
- RPC menolak unauthorized, inactive, own store, stale dan idempotency misuse.
- Order/contract/items/payment/invoice tersimpan atomik dan duplicate tidak menambah rows.
- Tidak ada seller credit saat creation/payment; guard acceptance/refund tetap ada.
- Pembayaran existing dan komponen lifecycle buyer terhubung; seller kebutuhan bekerja setelah lunas.
- Tests/build dilaporkan sesuai hasil, tanpa mengklaim GUI/payment PASS yang belum dijalankan.
