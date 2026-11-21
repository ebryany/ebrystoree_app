# Catatan pembaruan EBRYSTORE

## 2026-11-21

### Hardening keamanan aplikasi, proxy media, moderasi file seller, dan ekspor CSV

- **Proxy media publik (`SEC-01`)**: Menambahkan `try/catch` untuk `decodeURIComponent` (`404` pada URI cacat), whitelist ekstensi raster (`jpg`/`jpeg`/`png`/`webp`/`avif`), pemetaan MIME eksplisit dari ekstensi, dan `Content-Security-Policy: default-src 'none'; sandbox` pada `src/routes/api/public/catalog-image.$.tsx`, `src/routes/api/public/service-media.$.tsx`, dan `src/routes/api/public/og-image.$.tsx`.
- **Moderasi file produk seller (`SEC-02`)**: Menambahkan `resetProductModerationForVersion` di `src/lib/seller-files.functions.ts` agar pembaruan versi file lewat `supabaseAdmin` tetap mereset `moderation_status` ke `pending` dan menurunkan produk `published` ke `draft`.
- **CSV Injection, JioFarm, OAuth Redirect & QRIS (`SEC-03` s.d. `SEC-05`)**: Menetralkan awalan formula spreadsheet (`=`, `+`, `-`, `@`, `\t`, `\r`) di `src/lib/mcp/tools/export-orders-csv.ts`; menambah batas ukuran payload 128 KB (`413`) di `src/routes/api/public/integrations/jiofarm/links.ts` dan filter `.is("deleted_at", null)` di `src/lib/stock-codes.server.ts`; menambah validasi skema `http:`/`https:` di `src/routes/[.]lovable.oauth.consent.tsx` serta filter `.eq("user_id", ...)` eksplisit di `checkQrisPayment` (`src/lib/payments.functions.ts`).
- **Verifikasi**: `npx tsc --noEmit` keluar `0`, targeted `eslint` keluar `0`, `npm run test:unit` lulus **55/55 file, 678/678 test** (termasuk `src/lib/__tests__/security-audit-20261121.test.ts`).

### Dokumentasi System Design, endpoint `/api/health`, dan sinkronisasi migrasi SQL produksi

- Menambahkan paket dokumentasi arsitektur di `docs/system-design/` (Deliverables 01–13).
- Menambahkan endpoint health check non-sensitif `GET /api/health` (`src/routes/api/health.ts` dan `src/lib/health.server.ts`) beserta pengujian kontrak `src/lib/__tests__/health-and-sql-contract.test.ts`.
- Menerapkan dan memverifikasi 3 migrasi SQL terbaru (`20261121132000`, `20261121150000`, `20261121160000`) ke database Supabase produksi (`wcxaheqnnsbhifpgiedk`).
- Verifikasi: `npx tsc --noEmit` keluar `0`, `npm run test:unit` lulus **54/54 file, 671/671 test**.

### Menonaktifkan banner gambar latar pada HomeHero

- Menghapus render `HeroBannerBackground` di `src/components/home/hero.tsx` dan `src/routes/index.tsx` agar hero section tetap tampil bersih tanpa gambar banner latar.
- Verifikasi: `npx tsc --noEmit` keluar `0`, `npm run test:unit` lulus **53/53 file, 665/665 test**.

### Remediasi keamanan, stabilitas UI, dan integrasi penuh Pengaturan Admin

- **Keamanan & integritas data**:
  - Memperbarui override dependensi (`@modelcontextprotocol/sdk`, `hono`, `@hono/node-server`) di `package.json` dan `package-lock.json`.
  - Menghapus `payment_success` dari event analitik publik dan menambahkan batas ukuran payload 4 KB pada `src/routes/api/public/analytics/track.ts`.
  - Memaksa ulasan tamu masuk moderasi (`is_visible: false`, `is_verified: false`) di `src/lib/reviews.functions.ts`, serta menyaring agregasi rating hanya pada ulasan terverifikasi di server dan migrasi `supabase/migrations/20261121132000_verified_reviews_rating_only.sql`.
- **UI & pengalaman pengguna**:
  - Menghapus placeholder skeleton pada tombol Masuk & Daftar di `src/components/site-header.tsx` agar langsung tampil saat halaman dimuat.
  - Menghubungkan `home_banner_*` (termasuk `home_banner_position_x`/`home_banner_position_y`) di `src/components/home/hero-banner-background.tsx` dan `src/components/home/hero.tsx`, serta `feature_home_tracking_preview` dan `feature_home_faq` di `src/routes/index.tsx`.
- **Dashboard Admin → Pengaturan (end-to-end)**:
  - Memperbaiki validasi registry, pemeriksaan baris terupdate, dan pembersihan cache di `src/lib/admin-transaction.functions.ts` (`updateSetting`), invalidasi cache di `src/routes/_authenticated/admin/settings.transactions.tsx`, serta sinkronisasi state reset di `src/routes/_authenticated/admin/settings.website.tsx`.
  - Menambahkan helper server di `src/lib/website-settings.server.ts` dan menghubungkan konsumen backend (`feature_refund`, `feature_registration`, `qris_expiry_minutes`, `marketplace_delivery_max_mb`, `notify_test_recipient`, `academic_integrity_confirmation`, `academic_max_upload_mb`, `academic_allowed_formats`) serta frontend (`site_accent_color`, `seo_title_template`, `site_language`, `site_tagline`, `site_phone`, `site_address`, `site_help_url`, `site_timezone`/`site_date_format`/`site_time_format`, `storefront_show_products`, `storefront_show_services`, `storefront_featured_*`, `storefront_default_sort`, `marketplace_store_products_per_page`, `maintenance_allow_admin`).
  - Menambahkan migrasi SQL `supabase/migrations/20261121150000_wire_remaining_admin_settings.sql` (`invoice_number_prefix`, `order_min_amount`, `marketplace_max_active_services`, `marketplace_complaint_window_hours`, gate `notify_inapp_enabled` + toggle per-event) dan `supabase/migrations/20261121160000_wire_seller_and_marketplace_rules.sql` (`marketplace_seller_auto_approve`, `marketplace_partial_refund`).
- **CI & dokumentasi QA**:
  - Menambahkan `.github/workflows/ci.yml`, `.gitattributes`, dan dokumen QA di `docs/qa/`.
- **Verifikasi**:
  - `npx tsc --noEmit` keluar dengan kode `0`.
  - `npm run test:unit` lulus **53/53 file, 665/665 test** (termasuk `src/lib/__tests__/admin-settings-functional.test.ts`).
- **Status deploy**:
  - Perubahan masih berada di working tree lokal — belum di-commit, belum di-push ke GitHub, belum di-deploy ke VPS, dan migrasi `.sql` belum dijalankan ke database Supabase produksi.

## 2026-11-18

### Navigasi saat beralih ke desktop (`2cf6310`)

- Menu dan pencarian seluler kini ditutup saat layar masuk ukuran desktop. Ini melepas overlay dan kunci scroll serta memindahkan fokus ke tautan Beranda.
- Tes Playwright di build lokal lulus. Setelah resize ke 1280 px, halaman bisa digulir dan tautan Produk bisa diklik.
- Rilis aktif di produksi dan halaman utama merespons HTTP 200. Skenario resize belum diuji ulang di situs publik.
