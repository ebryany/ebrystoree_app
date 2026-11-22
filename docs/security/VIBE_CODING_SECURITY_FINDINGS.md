# Vibe Coding Security Findings

Dokumen ini mencatat pola antipattern umum pengembangan cepat (*vibe coding*) yang ditemukan di codebase aktual dan perbaikan yang diterapkan:

## 1. Komentar Kode Mengklaim Proteksi yang Tidak Diimplementasikan
- **Lokasi Sebelumnya:** `src/lib/growth.functions.ts` (baris 16–29).
- **Antipattern:** Docstring menyatakan *"bagian konten juga butuh `articles.view` supaya orang marketing tidak otomatis melihat draf"*, tetapi implementasinya hanya menulis `assertAccess()` yang mengecek role `["admin", "super_admin", "support", "finance"]`, lalu membaca seluruh artikel lewat `supabaseAdmin` (`service_role` bypass RLS).
- **Dampak:** Role `finance` dapat melihat seluruh draf artikel dan memicu mutasi kampanye/SEO.
- **Perbaikan:** Mengganti `assertAccess()` dengan `canGrowth(ctx, "articles.view")` pada `getContentSummary` & `listArticlesForBoard`, serta `canGrowth(ctx, "admin.dashboard.view")` dan `settings.seo.update` pada aksi tulis.

## 2. Guard UI Dianggap Pengaman Tunggal untuk Rute Sensitif
- **Lokasi Sebelumnya:** `src/routes/_authenticated/admin/route.tsx` dan `src/routes/see/_dashboard/route.tsx`.
- **Antipattern:** Komponen layout melakukan pengecekan akses hanya di client (`useQuery(["my-access"])`), sehingga ketika pengguna tidak berhak membuka `/admin/*`, server tetap menjawab normal dan penolakan tidak pernah tercatat di sisi backend.
- **Perbaikan:** Menambahkan `reportUnauthorizedRouteAccess` server function (`forbidden_admin_access`) yang dipanggil saat guard menolak navigasi dan mengembalikan `Request Reference ID` resmi ke `SecurityErrorView`. (Seluruh data sensitif di dalam halaman tetap dilindungi `assertPermission` di setiap server function).

## 3. Menampilkan Nama Internal Permission di Pesan Error UI
- **Lokasi Sebelumnya:** `AdminLayout` (`<code>admin.dashboard.view</code>`) dan `ForbiddenState` (`Akun Anda tidak memiliki izin "${permission}"`).
- **Antipattern:** Membantu penyerang memetakan nama permission internal dan struktur RBAC untuk mencari celah pada endpoint lain.
- **Perbaikan:** Menghapus seluruh tampilan nama permission internal dari DOM `AdminLayout` dan `ForbiddenState`; menampilkan pesan umum yang profesional beserta Kode Referensi (`requestId`) untuk eskalasi ke admin.

## 4. Memeriksa Role secara Ad-Hoc dan Memakai `supabaseAdmin` untuk Konfigurasi Sensitif
- **Lokasi Sebelumnya:** `src/lib/email-admin.functions.ts` (`isStaff` / `assertStaff`).
- **Antipattern:** Melewati matriks izin granular `permissions` / `role_permissions` sehingga perubahan izin di `/admin/izin` tidak berpengaruh pada endpoint SMTP/test email.
- **Perbaikan:** Menggunakan `assertPermission(ctx, "settings.view")` dan `assertPermission(ctx, "settings.manage")` secara konsisten serta menambahkan `enforceRateLimit(ctx.userId, "email.test")`.

## 5. Ketidakcocokan Kebijakan UI Admin vs Database RLS/Trigger (`roles.manage` & `permissions`)
- **Lokasi Sebelumnya:** `src/lib/admin.functions.ts` melarang non-`super_admin` memberi role `super_admin` dan mengubah `role_permissions`, tetapi RLS database masih memakai `is_admin()` dan trigger DB tidak memeriksa `is_super_admin()`.
- **Perbaikan:** Menyamakan boundary di lapisan database PostgreSQL lewat `protect_role_changes()` dan `protect_role_permissions_changes()` serta validasi ulang di MCP tool `manage_user_role`.
