# Verifikasi eksekusi framework realtime marketplace

Tanggal: 2026-10-03. Dasar: [framework MGRCAO V3 realtime](../remediation/2026-10-03-mgrcao-v3-realtime-marketplace.md) dan [riset realtime](2026-10-03-riset-realtime-marketplace.md). Semua perubahan source-only; tidak ada perubahan SQL, dependency, atau deployment.

> Addendum 2026-10-03 (setelah laporan owner): verifikasi asli di bawah hanya mencakup wiring source. Ditemukan kemudian bahwa tabel `product_inquiries`, `product_inquiry_messages`, dan `digital_products` tidak terdaftar di publication `supabase_realtime`, sehingga postgres_changes untuk tabel-tabel itu tidak pernah mengirim event meski subscribe sukses. Akar masalah diperbaiki lewat migration `20261003131000_chat_realtime_publication.sql` yang diterapkan live — lihat [verifikasi chat](2026-10-03-verifikasi-realtime-chat-marketplace.md). Tabel yang sudah terdaftar sejak sebelumnya (orders, payments, notifications, dan lainnya) tidak terdampak.

## A-01 Hook dan bell

- src/hooks/use-realtime-refresh.ts diperluas backward compatible:
  - `mapRealtimeStatus` memetakan status subscribe supabase-js: SUBSCRIBED ke subscribed, CHANNEL_ERROR/TIMED_OUT ke reconnecting, CLOSED ke error.
  - Status ditulis ke query key `["realtime-status", <channel>]` via `realtimeStatusKey(channel)`; tidak ada UI baru, pemanggil existing tidak berubah.
  - Resync dijadwalkan saat SUBSCRIBED (termasuk reconnect), tab kembali visible, dan window event `online`.
  - Opsi `onEvent` (ref, tidak memicu re-subscribe) untuk kebutuhan per-event.
  - Cleanup, penamaan channel per-instance, dan debounce 300 ms tetap seperti sebelumnya.
- src/components/ebry/notification-bell.tsx dimigrasi ke hook: tables notifications, filter `recipient_id=eq.<uid>`, keys my-notifications + customer-summary, onEvent mempertahankan suara/pulse/toast INSERT. Channel manual `supabase.channel` hilang dari bell.

## A-02 Seller (sadar-RLS)

- seller.index.tsx: notifications → keys seller-summary + my-store.
- seller.pesanan.tsx: notifications → keys seller-orders + seller-summary.
- seller.keuangan.tsx: notifications → keys seller-ledger.
- seller.produk.index.tsx: digital_products (baris milik toko via RLS) → keys my-store-products + my-inventory-summary; keputusan moderasi admin kini muncul tanpa refresh.
- seller.jasa-pesanan.tsx: marketplace_service_orders + marketplace_service_deliveries → keys my-service-orders + seller-service-order; acceptance/komplain buyer tersegarkan.
- Komponen katalog jasa (marketplace-service-catalog.tsx): marketplace_services → keys my-marketplace-services; status moderasi draft tersegarkan.

## A-03 Buyer dan admin jasa

- dashboard.pesanan.index.tsx: orders dengan filter `user_id=eq.<uid>` → keys my-orders.
- admin/seller.jasa.tsx: dua channel — marketplace_services untuk antrean moderasi, marketplace_service_orders untuk komplain aktif (admin orders.view/services.view menerima event sesuai policy).

## A-04 Pengujian

- src/hooks/use-realtime-refresh.test.ts: unit murni untuk mapRealtimeStatus dan realtimeStatusKey, plus static contract hook (cleanup removeChannel, debounce, resync visibility+online, onEvent, filter kondisional). Lingkungan vitest node tanpa DOM/testing-library, jadi hook tidak dirender; itu dicatat jujur sebagai batas.
- Static cakupan halaman: seller memakai notifications dan tidak pernah `tables: ["orders"` (anti-pola RLS RT-08); halaman produk/buyer/jasa/admin memakai tabel dan keys sesuai framework; bell tanpa channel manual.

## Evidence

- Unit: 275 lulus pada 18 file (.zcode/realtime-unit.log), naik dari 265.
- Lint file terubah: exit 0 (.zcode/realtime-lint.log). Prettier diterapkan.
- TypeScript: 71 sebelum → 71 sesudah, added 0 / removed 0 (.zcode/realtime-tsc.log vs .zcode/tambah-produk-tsc-before.log).
- Build produksi: exit 0 (.zcode/realtime-build.log).
- Belum diuji dan tidak diklaim: websocket live (SUBSCRIBED/error nyata), pengiriman event lintas sesi, RLS delivery realtime di database, perilaku GUI. Semua itu butuh dua sesi nyata dan browser, di luar batasan kerja ini.
