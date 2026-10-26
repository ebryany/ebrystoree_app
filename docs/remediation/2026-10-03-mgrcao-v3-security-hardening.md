# MGRCAO V3: security hardening menuju standar marketplace

Tanggal: 2026-10-03. Dasar: [riset security menyeluruh](../audit/2026-10-03-riset-security-menyeluruh.md). Status: framework untuk pekerjaan berikutnya.

## M: Mindset

Keamanan marketplace bukan satu fitur, melainkan lapisan. Yang sudah kuat (RLS, RPC, idempotency, audit) harus dipertahankan; yang kurang adalah pengerasan perimeter dan tata kelola.

Prinsip kerja: **least privilege di setiap lapisan**, **gagal tertutup untuk data sensitif**, dan **terlihat oleh admin** supaya kondisi keamanan dapat dipantau, bukan hanya diasumsikan.

Tidak ada temuan yang menunjukkan kebocoran aktif. Semua pekerjaan di sini bersifat pencegahan dan harus dikerjakan tanpa mengubah perilaku bisnis.

## G: Goal

1. `anon` tidak lagi punya grant tulis di tabel mana pun; hanya SELECT pada yang memang publik.
2. `anon` tidak dapat memanggil fungsi internal; hanya fungsi yang sengaja publik.
3. Semua fungsi SECURITY DEFINER memakai `search_path` eksplisit.
4. Security header aktif di seluruh halaman: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy.
5. Endpoint API publik punya batas laju dan batas ukuran body.
6. Dashboard admin punya halaman **Pengaturan > Keamanan** yang menampilkan kondisi nyata.
7. Tidak ada regresi: seluruh alur transaksi, jasa, dan katalog tetap bekerja.

## R: Role

**Security Engineer** (application, database, dan infrastructure security), bekerja sendiri tanpa spawn agent. Mandat terbatas pada:

- Migration baru untuk pencabutan grant dan perbaikan `search_path`.
- Konfigurasi header keamanan di `vite.config.ts` / nitro.
- Route dan server function halaman keamanan admin.
- `src/lib/rate-limit.server.ts` dan endpoint API publik.
- Test terkait.

Di luar allowlist: berhenti dan catat blocker. Tidak menyentuh jalur uang, lifecycle, atau aturan bisnis.

## C: Constraints

- Jangan mengedit migration yang sudah diterapkan; buat migration baru.
- Pencabutan grant harus menyisakan akses yang memang dibutuhkan `anon` (katalog publik, settings publik, artikel). Daftar putih eksplisit, bukan mencabut lalu menebak.
- Verifikasi setelah pencabutan: setiap alur publik yang sah harus tetap lulus.
- CSP tidak boleh mematahkan aplikasi; mulai dari kebijakan yang terukur dan catat pengecualian yang diperlukan.
- Halaman keamanan hanya untuk `super_admin`; jangan membocorkan detail yang membantu penyerang.
- Tanpa dependency baru bila memungkinkan.
- Setiap klaim keamanan harus disertai bukti query atau hasil uji.

## A: Actions

### Fase 1: Database least privilege

1. Inventaris grant `anon` per tabel; susun daftar putih akses publik yang sah.
2. Migration: cabut INSERT/UPDATE/DELETE/TRUNCATE dari `anon` di seluruh tabel `public`, lalu berikan kembali SELECT hanya pada daftar putih.
3. Migration: cabut `EXECUTE` dari `anon` pada fungsi internal; pertahankan fungsi publik yang disetujui.
4. Migration: tambah `SET search_path = public` pada lima fungsi yang belum.
5. Verifikasi: query ulang grant `anon`, jalankan alur publik (katalog, layanan, toko, artikel, settings publik) dan pastikan tetap bekerja.

### Fase 2: Perimeter

6. Tambah `Strict-Transport-Security` dan `X-Content-Type-Options: nosniff` pada respons HTML di `src/server.ts` (CSP, X-Frame-Options, Permissions-Policy, Referrer-Policy sudah ada).
7. Batas ukuran body dan rate limit untuk endpoint API publik.
8. Uji bahwa halaman dan endpoint tetap berfungsi dengan header aktif.

### Fase 3: Visibilitas admin

9. Server function `getSecurityOverview`: ringkasan RLS, grant `anon` yang tersisa, fungsi definer tanpa `search_path`, bucket publik, dan audit keamanan terakhir.
10. Halaman `/admin/settings/security` dengan permission baru `settings.security.view` untuk `super_admin`.
11. Test dan evidence.

## O: Acceptance

- Tidak ada grant tulis `anon` tersisa di tabel `public`.
- `anon` hanya dapat memanggil fungsi publik yang disetujui.
- Semua fungsi SECURITY DEFINER memiliki `search_path` eksplisit.
- Header keamanan terverifikasi ada di respons halaman.
- Endpoint API publik menolak body berlebih dan membatasi laju.
- Halaman keamanan admin menampilkan kondisi nyata dan hanya dapat diakses `super_admin`.
- Seluruh alur publik dan transaksi tetap bekerja; test/build dilaporkan apa adanya.
