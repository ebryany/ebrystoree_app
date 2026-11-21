# Strategi Quality Engineering — EBRYSTORE

## 1. Stack & Lingkungan Uji Aktual

- **Framework:** TanStack Start (SSR) + React 19 + TanStack Router + TanStack Query v5 + TypeScript 5.8
- **UI & Styling:** Tailwind CSS v4 + Radix UI + Lucide Icons
- **Database & Auth:** Supabase PostgreSQL (RLS + `SECURITY DEFINER` RPC) + Supabase Auth + Supabase Storage
- **Pembayaran:** SumoPod QRIS, ShopeePay MPM QR, Manual Transfer (DANA) + verifikasi Finance, dan Store Credit (`credit_ledger`)
- **Test Runner:** Vitest v4 (`environment: "node"`) dan Playwright Test v1.62
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) menjalankan `typecheck`, `lint`, dan `test:unit`

## 2. Test Pyramid & Batasan Lapisan

1. **Unit & Invariant Tests (Vitest — Lapisan Dasar, Cepat & Deterministik):**
   - Menguji fungsi murni, validasi Zod, kalkulasi harga/diskon/fee, state machine order/jasa, verifikasi signature webhook, pembatas ukuran stream request, dan kontrak SQL/RLS statis.
2. **Server & API Boundary Tests (Vitest + HTTP Probe Lokal):**
   - Menguji handler `POST /api/public/analytics/track`, `GET /api/v1/catalog/*`, header keamanan `src/server.ts`, dan guard otorisasi MCP (`authGuard` + `supabaseForUser`).
3. **End-to-End Browser Tests (Playwright — Lapisan Atas):**
   - `publik` (`Desktop Chrome`): auth guard rute privat, storefront, pencarian, halaman legal/artikel.
   - `mobile` (`Pixel 7`): menu seluler, scroll lock saat resize ke desktop, bebas overflow horizontal.
   - `terautentikasi` (`Desktop Chrome` + `storageState`): dashboard customer dan 8 halaman operasional admin.

## 3. Prioritas Risiko

| Tingkat | Domain | Fokus QA |
| :--- | :--- | :--- |
| **P0** | Pembayaran, Escrow (`rekber`), Saldo Seller/Credit, AuthZ | Idempotensi webhook, validasi nominal server, lock transaksi (`FOR UPDATE`), RLS & `assertPermission` |
| **P1** | Isolasi Multi-Vendor, Ulasan & Reputasi, Analitik Konversi | Isolasi `stores`/`orders`/`seller_ledger`, moderasi ulasan tamu, pemisahan rating terverifikasi (`is_verified = true`), anti-spoofing `payment_success` |
| **P2** | SSR/Hydration, Aksesibilitas, Performa, Hooks | `<html lang="id">`, LCP `fetchPriority`, `react-hooks/exhaustive-deps`, 404/500 fallback tanpa bocor pesan DB |
| **P3** | Kebersihan Repo & E2E Sinkronisasi | Konsistensi lockfile, pembersihan kode mati, sinkronisasi selector E2E dengan redesain UI |

## 4. Tata Kelola Data Uji & Keamanan Lingkungan

- Seluruh pengujian otomatis wajib memakai data sintetis/mock atau akun uji non-produksi.
- Dilarang menjalankan pengujian destruktif, migrasi, stress test, atau transaksi pembayaran nyata terhadap Supabase produksi maupun VPS produksi.
