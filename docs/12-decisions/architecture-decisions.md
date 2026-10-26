# Architecture Decision Records

## ADR-001 — Runtime: TanStack Start + Lovable Cloud
- **Konteks:** MVP harus cepat rilis, aman, dan dibangun di platform ini.
- **Alternatif:** (A) TanStack Start + Lovable Cloud, (B) Laravel + PostgreSQL di VPS.
- **Keputusan:** A (disetujui Owner).
- **Alasan:** Auth, database, storage, dan RLS tersedia bawaan; waktu ke pasar tercepat; tidak ada beban maintenance server.
- **Konsekuensi:** Background job berat terbatas; mengandalkan cron + server route.
- **Risiko & mitigasi:** Vendor lock-in — dimitigasi dengan domain logic terisolasi di `.server.ts` dan adapter untuk semua integrasi eksternal.
- **Evaluasi ulang bila:** volume job asinkron melampaui kemampuan cron, atau dibutuhkan worker jangka panjang.

## ADR-002 — Payment Provider Adapter
- **Konteks:** Provider QRIS belum diputuskan (U-01).
- **Keputusan:** Definisikan interface pembayaran provider-agnostic; implementasi adapter menyusul setelah Owner memilih.
- **Konsekuensi:** Order, invoice, dan refund dapat dispesifikasikan dan diuji dengan adapter tiruan; integrasi nyata tetap `PARTIALLY_VERIFIED` sampai sandbox lulus.

## ADR-003 — Status sebagai TEXT + CHECK, bukan enum database
- **Konteks:** Status order banyak dan diperkirakan berubah.
- **Keputusan:** Simpan status sebagai `text` dengan `CHECK` constraint dan konstanta bersama di aplikasi.
- **Alasan:** Menambah/mengubah status enum PostgreSQL memerlukan migrasi yang lebih kaku; CHECK lebih mudah direvisi sambil tetap menjaga integritas.
- **Risiko:** Tanpa disiplin konstanta, typo lolos — dimitigasi validasi Zod + state machine terpusat.

## ADR-004 — Refund parsial dengan approval
- **Keputusan Owner:** refund parsial, wajib approval admin, maksimum senilai yang dibayar.
- **Konsekuensi:** Refund adalah entitas tersendiri dengan state machine dan audit sendiri, bukan flag pada order.

## ADR-005 — Entitlement 5 unduhan / 365 hari
- **Keputusan Owner.** Dapat dioverride per produk. Penegakan dilakukan di server saat penerbitan signed URL, bukan di UI.