# 01. System Overview & 02. Requirements Specification

## 1. System Overview

### 1.1 Product Overview
**EBRYSTORE** (`VERIFIED`) adalah platform marketplace multi-vendor berbasis web (SSR) dan shell seluler Capacitor untuk pasar Indonesia yang menyediakan dua jalur penawaran utama:
1. **Produk Digital**: file, template, lisensi, dan kode/stok unik yang diserahkan otomatis melalui entitlement dan signed URL setelah pembayaran terverifikasi (`digital_products`, `digital_entitlements`, `product_stock_codes`).
2. **Layanan / Jasa**: baik jasa seller marketplace dengan mekanisme penahanan dana/rekber (`marketplace_services`, `marketplace_service_orders`) maupun layanan platform/pendampingan akademik bertahap dengan antrean operator, progres, hasil, dan revisi (`services`, `service_packages`, `service_order_details`).

Identitas visual (`USER CONTEXT` / `VERIFIED` di `src/styles.css` & `capacitor.config.ts`): palet **Cream** (`#faf9f5`), **Deep Teal**, **Soft Mint**, dan **Charcoal**.

### 1.2 Business Objectives
- Menyediakan katalog terpusat produk digital dan jasa dari banyak toko terverifikasi dengan checkout terhitung di server (`VERIFIED`).
- Menjamin keamanan transaksi melalui idempotency key, verifikasi signature webhook, dan escrow/rekber sebelum dana masuk ke saldo seller (`VERIFIED`).
- Menyediakan kontrol penuh bagi admin & operator (moderasi toko/produk/jasa, verifikasi pembayaran manual, refund, audit log, pengaturan website dinamis, serta 51 tool MCP) (`VERIFIED`).

### 1.3 System Scope
- **Included (`VERIFIED`)**: Storefront publik (`/`, `/produk`, `/layanan`, `/toko/$slug`, `/artikel`, `/bantuan`), autentikasi & akun (`/auth`, `/dashboard/*`), portal seller (`/seller/*`), portal operator (`/operator/*`), panel admin (`/admin/*`), API publik & webhook (`/api/public/*`, `/api/v1/catalog/*`), endpoint MCP (`/mcp`), dan Capacitor WebView shell (`capacitor.config.ts`).
- **Deferred / Partial (`VERIFIED` & `CONFLICT`)**: ShopeePay Dynamic QR ada pada kode (`shopeepay.server.ts`) namun nonaktif secara default kecuali env lengkap; komisi marketplace & beberapa aturan lanjutan masih bergantung pada pengaturan dinamis `system_settings` dan migrasi SQL terbaru.

---

## 2. Requirements Specification

### 2.1 Stakeholders & User Roles (`VERIFIED`)

Pemeriksaan `README.md`, `src/routes/_authenticated/`, dan `supabase/migrations/` mengonfirmasi 7 role aktif plus aktor publik & eksternal:

| Aktor / Role | Tujuan Utama | Hak Akses & Batasan Kewenangan | Data yang Diakses |
|---|---|---|---|
| **Guest** (Anon) | Menjelajah katalog, membaca artikel, melihat halaman toko | Baca publik (`approved` & `published`); tidak dapat checkout atau akses dashboard | Katalog publik, profil toko aktif, ulasan terverifikasi (`is_visible = true`) |
| **Customer** | Membeli produk/jasa, membayar, mengunduh file, komplain/refund | Membuat order sendiri, unggah bukti bayar, unduh entitlement milik sendiri, buka komplain/refund | Order, invoice, pembayaran, chat, entitlement, dan saldo kredit milik sendiri |
| **Seller** | Mengelola toko, produk digital, jasa, pesanan toko, dan penarikan dana | Hanya data toko sendiri (RLS + `owner_id` check); tidak bisa memoderasi/publish langsung tanpa tinjauan (kecuali setting auto-approve) | Toko, produk, jasa, pesanan toko, `seller_ledger`, `withdrawals`, `seller_bank_accounts` |
| **Operator** | Mengerjakan pesanan jasa platform/akademik | Mengakses tugas yang ditugaskan (`operator_assignments`), update progres, kirim draft/hasil; tidak mengelola izin/keuangan | Order yang ditugaskan, `job_progress`, `job_results`, `job_revisions` |
| **Support** | Menangani komplain dan membantu proses refund | Izin terbatas pada tiket/komplain & dukungan pelanggan | Data komplain, chat, dan status order terkait |
| **Finance** | Memverifikasi pembayaran manual & memproses refund/payout | Akses verifikasi bukti transfer & approval refund (`refunds.approve`) | `payments`, `manual_payment_proofs`, `refunds`, `withdrawals` |
| **Admin** | Operasional harian: moderasi, penugasan operator, pengaturan | Izin granular via `role_permissions` (`orders.*`, `products.*`, `services.*`, `sellers.*`) | Seluruh domain operasional sesuai permission |
| **Super Admin** | Konfigurasi sistem, manajemen izin, maintenance | Akses penuh termasuk `permissions.manage`, `settings.maintenance.update` | Seluruh tabel sistem, `system_settings`, `audit_logs` |
| **External Provider** | Memproses pembayaran QRIS, email SMTP, notifikasi Telegram, storage | Hanya melalui endpoint webhook bertanda tangan atau API key server-only | Payload transaksi terverifikasi |

### 2.2 Functional Requirements (`VERIFIED`)

- **A. Public Marketplace**: Beranda (`/`), katalog produk (`/produk`), katalog jasa (`/layanan`), detail produk (`/produk/$slug`), detail jasa (`/jasa/$id`), halaman toko (`/toko/$slug`), pencarian FTS (`search_products_fts`), kategori, artikel (`/artikel`), dan API katalog v1 (`/api/v1/catalog/*`).
- **B. Customer Management**: Registrasi/login Supabase Auth (`/auth`, `/auth/callback`), manajemen profil (`/akun`), keranjang (`/keranjang`), checkout produk/jasa/layanan (`/checkout.*`), riwayat pesanan (`/dashboard/pesanan/*`), unduhan digital (`/dashboard/produk-saya`), saldo kredit (`/dashboard/saldo`), chat (`/dashboard/chat/*`), notifikasi (`/dashboard/notifikasi`).
- **C. Seller Management**: Onboarding toko (`apply_as_seller`), manajemen produk digital & varian (`/seller/produk/*`), manajemen jasa seller (`/seller/jasa`), pemrosesan pesanan (`/seller/pesanan`, `/seller/jasa-pesanan`), keuangan & penarikan (`/seller/keuangan`), performa (`/seller/performa`), pengaturan toko (`/seller/pengaturan`).
- **D. Administrator**: Dashboard ringkas (`/admin`), moderasi produk/jasa/seller (`/admin/produk`, `/admin/seller/*`), monitoring pesanan/pembayaran/refund/payout (`/admin/orders/*`, `/admin/payments/*`, `/admin/refunds/*`, `/admin/payouts/*`), penugasan operator (`/admin/pengerjaan/*`), manajemen pengguna & izin (`/admin/pengguna`, `/admin/izin`), pengaturan website/transaksi/keamanan (`/admin/settings.*`), audit log (`/admin/audit`), laporan (`/admin/reports`).
- **E. Commerce & Transactions**: Pembuatan order atomik via SQL RPC, kalkulasi biaya admin & expiry di server, pembayaran manual (bukti transfer) & QRIS SumoPod, verifikasi webhook idempoten, penerbitan entitlement & stok kode unik, rekber/escrow jasa (`marketplace_service_orders`), refund ke saldo kredit (`credit_ledger`), penarikan dana seller (`withdrawals`).
- **F. External Integrations**: SumoPod QRIS (aktif via env), ShopeePay Dynamic QR (opsional/config-gated), Supabase Auth/PostgreSQL/Storage/Realtime, SMTP via Nodemailer, Telegram bot dispatch, JioFarm stock-code ingest.

### 2.3 Non-Functional Requirements

| Kategori | Kondisi Aktual (`VERIFIED`) | Target Rekomendasi (`INFERRED`) |
|---|---|---|
| **Security** | CSP, HSTS, `X-Content-Type-Options`, RLS di seluruh tabel sensitif, `requireSupabaseAuth`, `assertPermission`, HMAC webhook, rate limit RPC fail-closed pada bucket finansial | Pertahankan zero-trust pada input klien; wajibkan audit berkala pada setiap RPC baru |
| **Data Integrity** | Ledger append-only (`credit_ledger`, `seller_ledger`), advisory locks, unique idempotency keys, `CHECK` constraints | Pertahankan semua transisi status finansial di dalam transaksi PostgreSQL (`SECURITY DEFINER` RPC) |
| **Reliability & Availability** | SSR error boundary (`normalizeCatastrophicSsrResponse`), cron job DB + endpoint `/api/public/jobs/*`, VPS systemd `ebrystore` | Tambahkan health-check endpoint terdedikasi (`/api/health`) dan alerting error rate |
| **Performance** | Vite code-splitting, lazy image loading, FTS RPC `search_products_fts`, public settings cache | Monitor query latency PostgreSQL (`pg_stat_statements`) seiring pertumbuhan katalog |
| **Maintainability** | TypeScript strict (`tsc --noEmit`), ESLint, 53 file unit test Vitest (665 test), Playwright E2E, GitHub Actions CI | Pertahankan gate `npm run ci` sebelum rilis |
| **Accessibility** | HTML `lang` dinamis (`id`/`en`), focus-visible ring, target sentuh `min-h-11`, label semantik | Audit kontras & keyboard navigation rutin pada route baru |

### 2.4 Requirement Traceability Matrix

| ID | Requirement | Domain | Prioritas | Komponen Terkait | Acceptance Criteria |
|---|---|---|---|---|---|
| `REQ-01` | Katalog & pencarian publik | Public Marketplace | Wajib (P0) | `src/routes/index.tsx`, `public-catalog.server.ts`, `search_products_fts` | Produk/jasa tayang hanya bila `published` & `approved`; hasil gagal tidak disamarkan sebagai kosong |
| `REQ-02` | Checkout & kalkulasi harga server-side | Commerce | Wajib (P0) | `orders.functions.ts`, `academic.functions.ts`, `create_digital_order`, `create_marketplace_service_order` | Total, fee, dan stok dihitung ulang di DB; idempotency key mencegah duplikasi |
| `REQ-03` | Pembayaran QRIS & manual verification | Payments | Wajib (P0) | `payments.functions.ts`, `sumopod.server.ts`, `webhook.sumopod.ts` | Webhook terverifikasi signature/token; browser tidak dapat memalsukan status lunas |
| `REQ-04` | Isolasi multi-vendor & RBAC | Security | Wajib (P0) | `auth-middleware.ts`, `authz.server.ts`, RLS policies | Seller hanya mengakses data tokonya; admin diperiksa per permission |
| `REQ-05` | Digital fulfillment & service escrow | Fulfillment | Wajib (P0) | `digital_entitlements`, `marketplace_service_orders`, `seller_ledger` | Download via signed URL berkuota; dana jasa masuk `seller_ledger` setelah diterima |
| `REQ-06` | Pengaturan admin dinamis end-to-end | Admin | Wajib (P1) | `website-settings.ts`, `website-settings.server.ts`, `admin-transaction.functions.ts` | Perubahan disimpan tervalidasi, cache publik dibersihkan, dan dibaca konsumen |
| `REQ-07` | ShopeePay Dynamic QR & partial refund | Integrations / Commerce | Opsional / Keputusan Pemilik | `shopeepay.server.ts`, `resolve_service_complaint` | Tetap nonaktif by default (`SHOPEEPAY_ENABLED=false`, `marketplace_partial_refund=false`) sampai diaktifkan pemilik |
