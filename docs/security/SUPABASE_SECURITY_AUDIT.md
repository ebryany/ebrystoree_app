# Supabase & PostgreSQL Security Audit

Audit menyeluruh terhadap postur database Supabase (`postgres` schema `public`), RLS policies, `SECURITY DEFINER` RPCs, grants, Storage buckets, serta lapisan Realtime & Edge.

## 1. Postur Existing (Diverifikasi dari Migrasi & Katalog)
- **RLS & Least Privilege `anon` (`20261003210000` & `20261003220000`):**
  - Seluruh tabel di schema `public` telah mengaktifkan RLS (`relrowsecurity = true`) dan mencabut hak `INSERT/UPDATE/DELETE/TRUNCATE` dari `anon`.
  - Hak `SELECT` untuk `anon` dibatasi pada daftar putih tabel publik (katalog, toko, ulasan, artikel, settings publik).
  - Eksekusi fungsi `anon` hanya diperbolehkan untuk `search_products_fts`, `product_rating_summary`, dan `store_rating_summary`.
- **Storage (`20261003240000`):** Bucket privat dengan batasan tipe file & proxy endpoint (`/api/public/catalog-image/*`, `/api/public/service-media/*`) ber-header `Content-Security-Policy: default-src 'none'; sandbox` dan `X-Content-Type-Options: nosniff`.
- **Finance & Concurrency (`20261002100001_fix_h1_h4_security.sql`):** Advisory lock per-user pada pemakaian saldo kredit, trigger `protect_store_privileged_fields` dan `protect_moderation_fields`.

## 2. Celah PostgreSQL yang Ditemukan & Diperbaiki (Migrasi `20261122100000`)

1. **`public.user_roles` (`protect_role_changes`) — FIXED:**
   - Sebelumnya trigger hanya menolak jika `NEW.user_id = auth.uid()`. Akun dengan role `admin` (yang memiliki `roles.manage`) bisa mengeksekusi PostgREST `INSERT` untuk menetapkan role `super_admin` ke akun lain miliknya.
   - Sekarang trigger memblokir semua operasi `INSERT`/`DELETE` bertarget `super_admin` kecuali pemanggil adalah `public.is_super_admin(auth.uid())` atau `service_role`.
2. **`public.permissions` & `public.role_permissions` — FIXED:**
   - Policy `permissions_write_admin` dan `role_permissions_write_admin` sebelumnya memakai `public.is_admin(auth.uid())`. Karena `is_admin()` mengembalikan `true` untuk role `admin` biasa, role `admin` bisa langsung menambah permission ke role miliknya sendiri lewat Data API.
   - Sekarang diperketat ke `public.is_super_admin(auth.uid())` (untuk `permissions`), `public.has_permission(auth.uid(), 'permissions.manage')` (untuk `role_permissions`), plus trigger `protect_role_permissions_changes()` yang melarang modifikasi role `super_admin` maupun role milik pemanggil non-`super_admin`.

## 3. Tata Kelola Keamanan Tabel Monitoring Baru
- `public.security_events`, `public.security_event_histories`, `public.security_alerts`:
  - `REVOKE ALL FROM PUBLIC, anon, authenticated` -> tidak ada client yang dapat menyisipkan atau memalsukan event keamanan.
  - `GRANT SELECT TO authenticated` dengan RLS `public.has_permission(auth.uid(), 'security.events.read')` (dan `security.alerts.read` / `security.events.view_details`).
  - Penulisan event hanya lewat `SECURITY DEFINER` RPC `public.record_security_event(...)` yang hanya diberi `GRANT EXECUTE` ke `service_role`.
  - Publikasi `supabase_realtime` diaktifkan pada `security_events` dan `security_alerts` (terlindungi RLS SELECT di atas).
