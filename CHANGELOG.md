# Catatan pembaruan EBRYSTORE

## 2026-11-21

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
