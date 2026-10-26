# Verifikasi implementasi jasa seller marketplace (tahap lokal)

Tanggal: 2026-10-03. Dasar: [framework MGRCAO V3](../remediation/2026-10-02-mgrcao-v3-jasa-seller-marketplace-dan-rekber.md), [peta implementasi](../remediation/2026-10-03-peta-implementasi-jasa-seller-marketplace.md).

Status: implementasi lokal dua tahap selesai ditulis. Checkout dan listing publik tetap terkunci di SQL dan server. Tidak ada deployment database, tidak ada aktivasi, dan jalur uang tidak berubah sampai keputusan JDO dan pengujian PostgreSQL tersedia.

## Tahap 1: katalog draft dan moderasi

File baru:

- supabase/migrations/20261003110000_marketplace_service_contract.sql
- src/lib/marketplace-service.ts
- src/lib/marketplace-service.functions.ts
- src/components/seller/marketplace-service-catalog.tsx
- src/routes/_authenticated/seller.jasa.tsx
- src/routes/_authenticated/admin/seller.jasa.tsx
- src/lib/__tests__/marketplace-service.test.ts

Isi: tabel marketplace_services milik toko (satu harga IDR, agreement wajib: scope, exclusions, deliverable, requirements, durasi, revisi), moderasi berversi dengan audit log, RPC `save_marketplace_service_draft` dan `transition_marketplace_service` (permission `services.update`, penolakan moderasi mandiri, versi stale ditolak), serta `create_marketplace_service_order` yang selalu melempar `MARKETPLACE_SERVICE_DISABLED` tanpa INSERT.

## Tahap 2: kontrak order dan guard finansial

Tambahan di migration 110000 dan file baru:

- Kontrak order: marketplace_service_orders (work_state tertutup, revision_used <= limit, complaint_open tidak bisa bersama acceptance), marketplace_service_deliveries immutable berversi (URL HTTPS tanpa kredensial, unik per order+version), marketplace_service_events immutable (actor diturunkan server).
- RLS baca: buyer pemilik order, seller pemilik toko (helper SECURITY DEFINER `is_service_order_buyer/seller`), admin `orders.view`. INSERT/UPDATE/DELETE dilucuti dari authenticated; semua tulisan lewat RPC.
- RPC lifecycle order-first: `approve_service_requirements` (ready_at/due_at dicatat sekali dari durasi agreement), `submit_service_delivery`, `request_service_revision` (jatah habis ditolak, diarahkan ke komplain), `accept_service_delivery` (buyer saja, delivery terakhir saja, complaint memblokir, credit dilepas di transaksi yang sama via `credit_seller_earnings`, duplicate exact idempoten), `open_service_complaint` (membekukan release, prior state tersimpan), `resolve_service_complaint` (admin: resume via `orders.update` atau full refund via `refunds.approve` yang menulis baris refund mengikuti invariant request_refund tanpa window), plus read RPC `list_my_service_orders` dan `get_my_service_order` agar seller tidak tersandung RLS orders.
- supabase/migrations/20261003120000_marketplace_service_finance_dispatch.sql: `credit_seller_earnings` mendapat cabang marketplace_service eksplisit (tanpa acceptance valid melempar `ACCEPTANCE_REQUIRED`, termasuk pemanggil service-role); trigger `trg_credit_seller_on_paid` melewati marketplace_service sepenuhnya; `verify_manual_payment` dan `settle_gateway_payment` mendapat cabang jasa sebelum fallback operator (tanpa entitlement, tanpa receipt, tanpa assign_operator; kontrak hilang gagal keras lewat `activate_paid_marketplace_service`); `review_refund` reject memulihkan prior_order_status/prior_work_state tersimpan, bukan fallback completed; `process_refund` menandai work_state refunded; `request_refund` menolak refund langsung pasca-acceptance (`SERVICE_POST_ACCEPTANCE_REFUND_UNAVAILABLE`) sampai JDO-03 diputuskan.
- Server functions tambahan: detail pesanan buyer (RLS sendiri), aksi buyer (accept, revisi, komplain), daftar/detail pesanan seller via RPC, aksi seller (approve requirements, submit delivery), antrean komplain admin (`orders.view`) dan resolver dengan `assertPermission` per keputusan.
- UI: src/components/ebry/marketplace-service-order.tsx (detail buyer: agreement, hasil berversi, riwayat, terima/revisi/komplain), src/routes/_authenticated/seller.jasa-pesanan.tsx (daftar dan detail seller, kirim hasil link/note), section komplain pada admin/seller.jasa.tsx. Label marketplace_service dan review_service_complaint di transaction-labels.ts. Link "Draft Jasa" dan "Pesanan Jasa" di seller-sidebar.tsx dan dashboard-sidebar.tsx. routeTree.gen.ts diregenerasi.

## Evidence yang tercatat

- Unit test: 265 lulus pada 17 file (.zcode/marketplace-service-unit-final.log). Termasuk 22 test kontrak jasa: boundary draft, checkout fail closed dua lapis, RLS/grants, acceptance hanya buyer + delivery terakhir + credit sekali, komplain membekukan release, dispatcher sebelum fallback tanpa entitlement/assignment, restore refund berbasis state tersimpan, blokir refund pasca-acceptance. Semua static assertion, bukan eksekusi PostgreSQL.
- Lint file jasa: exit 0 (.zcode/marketplace-service-lint-final.log). Prettier diterapkan ke seluruh file jasa.
- TypeScript: baseline 71 error. Run lengkap terakhir sebelum perbaikan tipe menunjukkan 73 (dua error baru di getSellerServiceOrder dan konsumennya, akar masalah `Record<string, unknown>` pada return server function yang gagal memenuhi constraint serializable). Setelah perbaikan `Record<string, any>`, baseline terverifikasi kembali ke 71: added 0, removed 0 terhadap baseline awal (.zcode/tambah-produk-tsc-before.log dan .zcode/tambah-produk-tsc-after.log, log baseline jasa di .zcode/marketplace-service-tsc-before.log).
- Build tahap 1: client build lulus, Nitro terputus (pola sama dengan kejadian historis environment ini). Build tahap 2 belum dijalankan ulang.
- psql lokal tidak tersedia; migration 110000/120000 belum diterapkan ke database mana pun, lokal maupun live.

## Belum diuji dan blocker aktivasi

- Eksekusi PostgreSQL nyata: RPC, RLS, constraint, lock order-first, idempotensi credit.
- Race dua sesi nyata (acceptance vs komplain/refund, duplicate submit/accept) sesuai J-T17.
- Storage/artifact: JDO-07 masih terbuka, jadi delivery hanya URL HTTPS; tidak ada jalur upload artifact.
- GUI/visual: tidak dinyalakan sesuai batasan kerja; semua state UI belum diklik-through.
- Aktivasi checkout menunggu keputusan JDO-01 sampai JDO-08 (jenis jasa, kebijakan revisi, komplain pasca-acceptance, fee/discount, retensi artifact, payout), pengujian race, dan otorisasi produksi terpisah. Persetujuan moderasi sengaja tidak membuat jasa dapat dibeli.
- Deployment migration jasa membutuhkan izin eksplisit terpisah; izin bucket sebelumnya tidak mencakup ini.
