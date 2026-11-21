# Defect Register & Status Baseline QA — EBRYSTORE

## 1. Perbandingan Baseline Audit 21 November 2026

| Item Baseline | Kondisi Awal | Kondisi Saat QA (21 Nov 2026) | Status |
| :--- | :--- | :--- | :--- |
| TypeScript errors | 6 error di 2 file (`tsc` exit `2`) | 0 error (`tsc` exit `0`) | **FIXED & VERIFIED** |
| Unit test failures | 16 gagal dari 648 test (8 file) | 656/656 lulus (52/52 file, exit `0`) | **FIXED & VERIFIED** |
| MCP SDK & Hono CVEs | 2 High (`@modelcontextprotocol/sdk`), 2 Mod (`hono`, `@hono/node-server`), 1 Low (`esbuild`) | 0 High, 0 Moderate; tersisa 1 Low (`esbuild` dev-only Windows) | **FIXED & VERIFIED** |
| Guest review auto-publish & rating mixing | `is_visible` tidak diset `false`; semua ulasan dihitung ke rating | Kode aplikasi diperbaiki + unit test lulus; migrasi DB `store_rating_summary` baru dibuat lokal | **PARTIALLY FIXED** *(menunggu migrasi DB)* |
| `payment_success` analytics spoofing | Diterima endpoint publik & cek `content-length` saja | Ditolak skema publik + stream reader maks. 4 KB | **FIXED & VERIFIED** |
| CI & verification pipeline | Tidak ada `tsc` di `ci`/`verify`; tidak ada `.github/workflows` | `typecheck` di `ci`/`verify` + `.github/workflows/ci.yml` tersedia | **FIXED & VERIFIED** |
| React Hooks warnings | 13 warnings `react-hooks/exhaustive-deps` | 0 warnings `react-hooks/exhaustive-deps` | **FIXED & VERIFIED** |
| Frontend HTML `lang`, hero LCP, Google verification | `lang="en"`, tanpa `fetchPriority="high"`, tag verifikasi ganda, skeleton login di navbar | `lang="id"`, `fetchPriority="high"`, tag tunggal, tombol Masuk/Daftar langsung tampil | **FIXED & VERIFIED** |
| Line endings & Prettier warnings | 23.572 warnings (tanpa `.gitattributes`) | `.gitattributes` ditambahkan (`eol=lf`); file lama belum di-reformat massal | **PARTIALLY FIXED** |
| Dua lockfile (`package-lock.json` & `bun.lock`) | Keduanya dilacak Git | Masih sama, menunggu keputusan tim | **STILL PRESENT** |

---

## 2. Daftar Defect Aktif & Celah QA

### DEF-01 — Migrasi `store_rating_summary` Belum Diterapkan di Database Produksi
- **Severity:** **P1 High**
- **Modul:** Database / Rating Toko (`supabase/migrations/20261121132000_verified_reviews_rating_only.sql`)
- **Deskripsi:** Di sisi kode TypeScript, agregasi rating sudah memfilter `is_verified = true`, tetapi fungsi PostgreSQL `public.store_rating_summary(_store_id)` di database produksi masih menggunakan definisi lama (`is_visible = true` tanpa `is_verified = true`) sampai migrasi lokal baru diterapkan.
- **Dampak Bisnis:** Halaman `/toko/$slug` dan dashboard performa seller masih dapat menghitung ulasan tidak terverifikasi ke dalam skor rating bila ada baris `is_visible = true, is_verified = false` di DB.
- **Rekomendasi:** Terapkan `20261121132000_verified_reviews_rating_only.sql` pada jendela rilis berikutnya.

### DEF-02 — Selector E2E `tests/e2e/public/product-rail.spec.ts` Usang Pasca-Redesain Beranda
- **Severity:** **P2 Medium**
- **Modul:** QA Automation (`tests/e2e/public/product-rail.spec.ts`)
- **Preconditions:** Beranda (`src/routes/index.tsx`) kini merender `ProductTabs` + `ProductTile`, bukan lagi `region "Daftar produk digital"` dengan `CompactProductCard`.
- **Expected vs Actual:** Spec `product-rail.spec.ts` mencari `getByRole("region", { name: "Daftar produk digital" })` dan tombol `"Beli langsung"`, yang tidak lagi ada di DOM beranda.
- **Rekomendasi:** Perbarui `product-rail.spec.ts` agar menguji `ProductTabs` (`role="tablist"`, navigasi tab, dan kartu `ProductTile`).

### DEF-03 — Lingkungan E2E Lokal Tidak Memiliki Binary Chromium & Sesi Terautentikasi
- **Severity:** **P2 Medium (Environment Blocker)**
- **Modul:** QA Environment (`tests/e2e/`, `playwright.config.ts`)
- **Bukti:** Eksekusi `playwright test --project=publik --project=mobile` gagal dengan `Executable doesn't exist at ...\chromium_headless_shell.exe`, dan `playwright.config.ts` memakai `baseURL: http://localhost:8080` serta `webServer.command: "bun run dev"`.
- **Rekomendasi:** Jalankan `npx playwright install chromium` dan sinkronkan `webServer.command` dengan `npm run dev` (atau sediakan variabel `E2E_BASE_URL` dan sesi uji di CI).

### DEF-04 — Celah Cakupan E2E: Alur Seller, Moderasi Produk, Refund, dan Withdrawal
- **Severity:** **P2 Medium**
- **Modul:** Marketplace Seller & Finance (`tests/e2e/`)
- **Deskripsi:** Belum ada spec E2E end-to-end untuk pengajuan toko, pembuatan/moderasi produk, pengerjaan jasa seller, pengajuan/approval refund, serta permintaan withdrawal. Baru tercakup di level unit/SQL contract test.

### DEF-05 — Kerentanan Low `esbuild@0.27.7` & Kebersihan Dependensi/Lockfile
- **Severity:** **P3 Low**
- **Modul:** Tooling & Supply Chain (`package.json`, `bun.lock`)
- **Deskripsi:** `npm audit --omit=dev` menyisakan 1 temuan Low (`GHSA-g7r4-m6w7-qqqr` pada `esbuild` dev server Windows). Selain itu `bun.lock` masih berdampingan dengan `package-lock.json`, dan kode mati `src/components/home/hero-shader-background.tsx` beserta dependensi `three`, `@react-three/fiber`, `@shadergradient/react`, `lenis`, `date-fns`, `@hookform/resolvers`, `dotenv` masih tersimpan.

### DEF-06 — Impor Top-Level `*.server.ts` di 13 File `*.functions.ts` dan `sitemap[.]xml.ts`
- **Severity:** **P4 Informational**
- **Modul:** Arsitektur Server/Client Boundary
- **Deskripsi:** Compiler TanStack Start memisahkan handler server saat build, namun secara konvensi di `client.server.ts`, modul `.server.ts` lebih aman diimpor dinamis di dalam handler agar tidak rawan bocor saat refactoring.
