# Test Traceability Matrix — EBRYSTORE

Status mengacu pada eksekusi aktual tanggal **21 November 2026** terhadap kondisi repository terkini.

| Requirement / Kontrol | Modul | Test Case / Bukti | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TypeScript strictness | Seluruh `src/` | `npx tsc --noEmit` | Exit code `0`, 0 error tipe | Exit code `0`, 0 error | **PASS** |
| Perimeter Security Headers | `src/server.ts` | `security-hardening.test.ts` + HTTP probe `localhost:8081` | CSP (`frame-ancestors 'self'`, `object-src 'none'`), HSTS, `X-Frame-Options`, `nosniff` | Terverifikasi pada response HTML aktual | **PASS** |
| Payment Webhook Integrity (SumoPod & ShopeePay) | `webhook.sumopod.ts`, `webhook.shopeepay.ts` | `webhook-signature.test.ts`, `shopeepay.test.ts`, `security-hardening.test.ts` | Signature HMAC/RSA valid, body <= 64 KB, idempoten, query status ulang | 33 test lulus | **PASS** |
| Escrow / Rekber & Release Dana | `20261002130000_digital_seller_funds_release.sql`, `seller.keuangan.tsx` | `rekber-release.test.ts`, `escrow-invariants.test.ts` | Dana ditahan sampai konfirmasi pembeli, serialisasi refund | 20 test lulus | **PASS** |
| Withdrawal & Ledger Invariants | `withdrawal-*.test.ts` | `withdrawal-invariants.test.ts`, `withdrawal-sql-contract.test.ts`, `withdrawal-fee.test.ts` | Saldo tidak negatif, fee konsisten, kontrak SQL aman | 54 test lulus | **PASS** |
| Rate Limiting Financial Fail-Closed | `src/lib/rate-limit.server.ts` | `rate-limit.test.ts` | Bucket finansial menolak saat RPC gagal; non-finansial fail-open | 17 test lulus | **PASS** |
| RBAC & Audit Logging | `src/lib/authz.server.ts` | `authz.test.ts`, `security-h1-h4.test.ts` | Tolak tanpa izin, catat `permission.denied` & bypass `super_admin` | 20 test lulus | **PASS** |
| Multi-Vendor Store & Product Isolation | `stores`, `digital_products` | `regression-fase0.test.ts`, `stores-column-grants.test.ts` | Seller terisolasi ke tokonya, moderasi tidak bisa dinaikkan sepihak | 26 test lulus | **PASS** |
| Guest Review Moderation & Verified Rating | `reviews.functions.ts`, `catalog.functions.ts`, `store-card.server.ts` | `p1-security-hardening.test.ts` | Tamu `is_visible: false`, rating hanya `is_verified = true` | 8 test lulus (migrasi DB lokal belum di-apply) | **PASS (Kode)** |
| Analytics Anti-Spoofing & Body Bound | `src/routes/api/public/analytics/track.ts` | `p1-security-hardening.test.ts` + HTTP probe `POST` | `payment_success` ditolak skema; body > 4 KB tanpa `Content-Length` diputus | Terverifikasi di unit test & HTTP 204 | **PASS** |
| Public Catalog API (`/api/v1/catalog/*`) | `catalog-api.server.ts`, `public-catalog.server.ts` | `catalog-api.test.ts`, `public-catalog.test.ts` + HTTP probe | 200 kategori, 400 query invalid (`page=-1`) | 16 test lulus + HTTP 200/400 terverifikasi | **PASS** |
| SSR 404/500 Fallback & Storefront | `route-fallback.tsx`, `site-header.tsx`, `hero.tsx` | `route-fallback.test.tsx`, `public-storefront.test.tsx`, `hero.test.tsx` + HTTP probe | Status 404/500 tepat, `<html lang="id">`, tombol Masuk/Daftar langsung tampil | 52 test lulus + HTML probe terverifikasi | **PASS** |
| E2E Public & Mobile Journeys | `tests/e2e/public/*`, `tests/e2e/mobile/*` | `playwright test --project=publik --project=mobile` | 42 skenario browser lulus | Gagal launch karena binary Chromium belum terunduh | **BLOCKED** |
| E2E Authenticated & Admin Journeys | `tests/e2e/authenticated/*` | `playwright test --project=terautentikasi` | Dashboard & 8 halaman admin lulus | Tidak ada sesi uji `LOVABLE_BROWSER_SUPABASE_*` | **BLOCKED** |
| E2E Alur Seller End-to-End, Refund, Payout | — | Belum ada spec E2E | Verifikasi UI lengkap seller & transaksi | Belum tersedia di `tests/e2e/` | **NOT RUN (GAP)** |
