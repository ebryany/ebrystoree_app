# Release Readiness Assessment — EBRYSTORE

**Tanggal Evaluasi:** 21 November 2026  
**Keputusan Rilis:** **NOT READY FOR RELEASE (BLOCKED BY PENDING MIGRATION, BUILD & E2E VERIFICATION)**

---

## 1. Ringkasan Bukti Pengujian Terbaru

| Gerbang Kualitas | Hasil Terverifikasi | Catatan |
| :--- | :--- | :--- |
| TypeScript (`npx tsc --noEmit`) | **PASS** (0 error) | Diverifikasi setelah perubahan terakhir |
| Unit & Contract Tests (`npm run test:unit`) | **PASS** (52 file, 656 test, 0 gagal) | Mencakup keamanan webhook, escrow, withdrawal, RBAC, catalog API, P1 security |
| ESLint (`npm run lint`) | **PASS** (0 error, 0 hooks warning) | 23.592 Prettier CRLF warnings lama tetap tercatat sebagai baseline |
| Dependency Audit (`npm audit --omit=dev`) | **PASS (0 High/Crit/Mod)** | Tersisa 1 Low (`esbuild` dev server Windows) |
| Live Local Dev HTTP Probe (`localhost:8081`) | **PASS** | `/`, `/produk`, `/layanan`, 404, `/api/v1/catalog/*`, anti-spoofing `analytics/track` |
| Production Build (`npm run build`) | **NOT RUN** | Belum dijalankan agar tidak menimpa `.output` aktif tanpa jendela rilis |
| Playwright E2E (`publik`, `mobile`, `terautentikasi`) | **BLOCKED** | Binary Chromium Playwright belum terinstal (`npx playwright install`), serta `DEF-02` pada `product-rail.spec.ts` |
| Migrasi SQL Baru di Production | **BLOCKED / PENDING** | `20261104090000_general_service_checkout.sql` & `20261121132000_verified_reviews_rating_only.sql` belum diterapkan |

## 2. Alasan Keputusan

1. Masih terdapat **1 defect P1 terbuka (`DEF-01`)**: fungsi database `store_rating_summary` di produksi belum diperbarui dengan migrasi `20261121132000_verified_reviews_rating_only.sql`.
2. **Production build (`NITRO_PRESET=node-server npm run build`)** dan **Playwright E2E** belum dijalankan untuk memverifikasi perilaku bundling produksi maupun interaksi browser nyata pasca-perubahan.
3. Terdapat perubahan fitur lokal yang belum di-commit (`/api/v1/catalog/*`, migrasi `20261104090000_general_service_checkout.sql`, dan aset Capacitor).

## 3. Syarat Wajib Sebelum Status Berubah Menjadi `READY FOR RELEASE`

1. Terapkan migrasi `20261121132000_verified_reviews_rating_only.sql` (dan `20261104090000_general_service_checkout.sql` bila fitur dirilis) ke Supabase.
2. Instal browser Playwright (`npx playwright install chromium`), perbarui selector `tests/e2e/public/product-rail.spec.ts`, lalu jalankan `npm run verify` (`typecheck`, `lint`, `test:unit`, `build`) dan `npm run test:e2e`.
3. Perbarui `CHANGELOG.md`, commit perubahan terkurasi (tanpa file residu/rahasia), dan ikuti urutan deploy VPS di `AGENTS.md`.
