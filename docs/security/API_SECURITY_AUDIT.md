# Ebrystore API Security Audit Report

Laporan audit keamanan menyeluruh terhadap endpoint HTTP, TanStack Start Server Functions, MCP, dan lapisan otorisasi database Ebrystore.

## Ringkasan Eksekutif

Ebrystore telah memiliki fondasi keamanan yang baik pada transaksi utama (idempotent RPC untuk pembayaran/top-up/escrow, atomic `check_rate_limit` fail-closed pada bucket finansial, pembatasan `anon` di PostgreSQL, dan enkripsi AES-256-GCM untuk kredensial SMTP). Namun, audit menyeluruh menemukan **10 celah keamanan kritis hingga rendah** di lapisan boundary otorisasi, MCP, RLS/trigger RBAC, serta ketiadaan sistem deteksi & pemantauan terstruktur.

Seluruh temuan kritis hingga rendah pada audit ini telah dipetakan dan diperbaiki dalam paket hardening ini.

## Daftar Temuan Audit

| ID | Severity | Kategori | Ringkasan Temuan | Status |
|---|---|---|---|---|
| **AUD-01** | **CRITICAL** | Privilege Escalation (DB & MCP) | `protect_role_changes()` dan RLS `user_roles_insert_manage` mengizinkan role `admin` (punya `roles.manage`) memberi peran `super_admin` kepada akun lain lewat PostgREST/MCP (`manage_user_role`). | **Fixed** (Trigger DB + MCP guard + Critical Event) |
| **AUD-02** | **CRITICAL** | Privilege Escalation (RLS) | Policy `role_permissions_write_admin` & `permissions_write_admin` memakai `is_admin()` (bukan `is_super_admin()` / `permissions.manage`), sehingga `admin` biasa dapat menulis langsung ke tabel izin via Supabase Data API. | **Fixed** (RLS policy + trigger `protect_role_permissions_changes`) |
| **AUD-03** | **HIGH** | Broken Function Level Authorization | `email-admin.functions.ts` memakai array role manual (`support` bisa kirim `sendTestEmail` tanpa rate limit ke alamat bebas; `admin` biasa bisa ubah SMTP via `supabaseAdmin`). | **Fixed** (`settings.view` / `settings.manage` + rate limit `email.test`) |
| **AUD-04** | **HIGH** | Vibe-Coding Auth Mismatch | `growth.functions.ts`, `growth-actions.functions.ts`, `campaigns.functions.ts`, & `seo-audit.functions.ts` memakai check role manual alih-alih matriks izin (`articles.view`, `articles.update`, `settings.seo.update`), membocorkan draf artikel dan mengizinkan spam audit SEO. | **Fixed** (Permission guards + rate limit `seo.audit`) |
| **AUD-05** | **HIGH** | Missing Security Monitoring Pipeline | Penolakan akses `401`/`403`/`429`, gagal signature webhook, gagal token job internal, serta probing rute `/admin` dan `/see` tidak tercatat ke pipeline event/alert keamanan. | **Fixed** (`security_events`, `security_alerts`, `record_security_event`, hook integrasi lengkap) |
| **AUD-06** | **MEDIUM** | Missing Explicit Server Guard | `listAllInquiries`, `listAllPoRequests`, dan `setInquiryStatus` mengandalkan RLS secara implisit tanpa `assertPermission(ctx, "orders.view")` atau logging ownership violation. | **Fixed** (Permission guard + ownership validation + logging) |
| **AUD-07** | **MEDIUM** | Internal Information Leakage | `AdminLayout` dan `ForbiddenState` menampilkan nama permission internal (`admin.dashboard.view`, `"{permission}"`) di DOM browser. | **Fixed** (Dihapus total, diganti `SecurityErrorView` + Request Reference ID) |
| **AUD-08** | **MEDIUM** | Missing Request Correlation & Branded Security Pages | Tidak ada header `X-Request-Id` terstandar maupun halaman error keamanan khusus 401/403/404/429 yang membedakan JSON API vs HTML navigasi browser. | **Fixed** (`src/server.ts`, `src/lib/error-page.ts`, `src/components/security-error-page.tsx`) |
| **AUD-09** | **MEDIUM** | Unthrottled Public Catalog API | `/api/v1/catalog/*` belum memiliki rate limiter level aplikasi per IP untuk perlindungan lapis kedua di belakang Cloudflare/Nginx. | **Fixed** (`catalog.public` rate limit + 429 JSON) |
| **AUD-10** | **LOW** | OAuth Error Copy Exposure | `/.lovable/oauth/consent` merender raw `error.message` pada batas error route; validasi scheme sudah `http/https` aman. | **Documented** (Mitigated by session & origin guards) |
