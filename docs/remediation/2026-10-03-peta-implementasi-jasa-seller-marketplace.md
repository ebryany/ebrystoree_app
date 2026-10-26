# Peta implementasi lokal jasa seller marketplace

Dasar: [framework MGRCAO V3](2026-10-02-mgrcao-v3-jasa-seller-marketplace-dan-rekber.md), [riset JS-01 sampai JS-11](../audit/2026-10-02-riset-jasa-seller-marketplace-dan-rekber.md).
Otorisasi: user meminta langsung kerjakan. Izin deployment bucket sebelumnya tidak mencakup schema/finansial jasa seller baru.

## Batas tahap sekarang

JDO-01 sampai JDO-08 belum mempunyai keputusan baru. Implementasi kontrak dilakukan lokal dengan checkout dan listing publik terkunci di server/database. Tidak aktifkan gate, deploy database/frontend, atau menyebut jasa siap dijual. Tidak menetapkan fee, timeout, kategori artifact, retensi, payout, atau aturan sengketa baru.

Tahap fondasi ini menyediakan katalog draft/moderasi, kontrak order dan state/RPC jasa, acceptance/release guard, complaint/refund integration, server dan tampilan scoped. Aktivasi publik, artifact upload dengan policy final, runtime PostgreSQL/RLS/race/GUI masih merupakan gate terpisah. URL HTTPS dapat dipakai untuk kontrak delivery; upload artifact belum dibuka tanpa JDO-07.

## Allowlist exact

Baru:
- supabase/migrations/20261003110000_marketplace_service_contract.sql
- supabase/migrations/20261003120000_marketplace_service_finance_dispatch.sql
- src/lib/marketplace-service.ts
- src/lib/marketplace-service.functions.ts
- src/components/seller/marketplace-service-catalog.tsx
- src/components/ebry/marketplace-service-order.tsx
- src/routes/_authenticated/seller.jasa.tsx
- src/routes/_authenticated/admin/seller.jasa.tsx
- src/routes/_authenticated/dashboard.jasa.$id.tsx
- src/routes/_authenticated/seller.jasa-pesanan.tsx
- src/lib/__tests__/marketplace-service.test.ts
- docs/audit/2026-10-03-verifikasi-jasa-seller-marketplace.md

Existing, hanya integrasi jasa:
- src/components/seller/seller-sidebar.tsx
- src/components/ebry/dashboard-sidebar.tsx
- src/lib/transaction-labels.ts
- src/routeTree.gen.ts (regenerasi manifest saja)

Evidence privat: .zcode/marketplace-service-*.

Tidak mengedit fungsi source legacy untuk refactor umum. Redefinisi SQL bersama mengikuti cabang marketplace_service; definisi digital/operator dipertahankan. Consumer/report/MCP yang tidak mengerti order baru belum dapat menerima transaksi baru karena gate DB/server tetap mati. Sebelum aktivasi semua consumer itu wajib diperiksa lagi.

## Kontrak yang disiapkan

- Listing tabel marketplace_services, satu harga integer IDR, store pemilik, kategori service existing, snapshot persetujuan, moderasi oleh services.update. Seller hanya own store; admin tidak memperluas endpoint seller.
- Detail marketplace_service_orders, order_id unique, store/listing snapshot, requirements version/approval, latest delivery, acceptance, revision allowance, prior state complaint/refund.
- Delivery immutable marketplace_service_deliveries, unique order/version; HTTPS tanpa credential URL. Event order immutable dengan actor server-derived.
- Checkout database dan server fail closed. Transaction order/item/invoice/payment satu seller, satu listing, quantity 1. Unsupported fee/credit/discount tidak digunakan; aktivasi memerlukan JDO-05.
- Order lock dahulu pada RPC jasa; payment legacy tetap payment-first, tidak diklaim seragam. Acceptance exact latest delivery, buyer owner, pembayaran sah, no complaint/refund, sale credit idempoten.
- Complaint pra-acceptance membekukan release. Admin melanjutkan prior state atau membuat full refund lewat pipeline existing. Refund reject memulihkan state tersimpan, bukan completed. Pasca-acceptance complaint diblokir sampai JDO-03 diputuskan.
- Monitoring jasa menggunakan query detail/held service server; available tetap ledger minus reserve existing. Tidak credit sementara.

## Arah UI

Halaman data untuk seller/admin, mengikuti DESIGN.md; ENERGY 1 / RHYTHM 2 / MOTION 1. Form agreement dan status nyata menjadi fokus, bukan kartu metrik/template landing. Token existing, aksen hanya aksi utama, tanpa asset baru. Browser/server tidak dinyalakan; GUI tidak diklaim lulus.
