# Evidence Report — Slice 1: RBAC Granular, Layout Admin, CRUD Katalog, Audit Log

Tanggal: 2026-07-28
Ruang lingkup: OD-01 (permission granular), OD-02 (sinkronisasi email), OD-03 (Slice 1 A–F), OD-04 (spesifikasi kontrak task saja).

## 1. Ringkasan status

| Item Slice 1 | Status | Bukti |
|---|---|---|
| A. RBAC granular (permissions, role_permissions, assertPermission) | SELESAI | TC-1.1 … TC-1.6 |
| B. Layout admin penuh (sidebar berkelompok, breadcrumb, drawer mobile, user menu) | SELESAI | TC-2.1, TC-2.2 |
| C. CRUD produk digital + publish/unpublish + audit | SELESAI | TC-3.1 … TC-3.5 |
| D. CRUD layanan + publish/unpublish + audit | SELESAI | TC-4.1 |
| E. Pengguna, peran, matriks izin | SELESAI | TC-5.1 … TC-5.4 |
| F. Audit log write path + UI | SELESAI | TC-6.1 |
| Sinkronisasi email ke profiles (terkontrol) | SELESAI | TC-7.1 |
| Modul task operasional | TIDAK DIKERJAKAN (sesuai OD-04) | Kontrak konseptual di `docs/10-operations/task-engine-contract.md` |

## 2. Hasil uji unit (vitest)

Perintah: `bunx vitest run src/lib/__tests__/authz.test.ts` → **8 passed / 8**.

| ID | Kasus | Hasil |
|---|---|---|
| TC-1.1 | `slugify` menghasilkan slug aman | PASS |
| TC-1.2 | `loadAccess` mengembalikan roles + permissions + flag admin | PASS |
| TC-1.3 | Permission dimiliki → akses diizinkan | PASS |
| TC-1.4 | Admin tanpa `permissions.manage` → `ForbiddenError` | PASS |
| TC-1.5 | Customer akses `admin.dashboard.view` → `ForbiddenError` | PASS |
| TC-1.6 | Super admin bypass berhasil DAN tercatat `permission.super_admin_bypass` | PASS |
| TC-6.1 | `writeAudit` mengirim action/entity/IP ke `write_audit_log` | PASS |
| TC-6.2 | Kegagalan audit tidak menggagalkan operasi bisnis | PASS |

## 3. Hasil uji end-to-end (Playwright, akun super_admin)

| ID | Skenario | Observasi | Hasil |
|---|---|---|---|
| TC-2.1 | Buka `/admin` sebagai super_admin | Sidebar berkelompok (Ringkasan / Katalog / Akses / Transaksi), modul Slice 2 bertanda "Belum tersedia", breadcrumb + user menu tampil | PASS |
| TC-2.2 | Viewport 390px | Drawer mobile terbuka via tombol "Buka menu admin" | PASS |
| TC-2.3 | Guest membuka `/admin` | Redirect ke `/auth` | PASS |
| TC-3.1 | Buat produk "Template Landing Page QA" (150.000 / diskon 99.000) | Row baru status `draft`; DB: `slug=template-landing-page-qa` | PASS |
| TC-3.2 | Publish produk | Status berubah `published` | PASS |
| TC-3.3 | Cari "QA" | 1 baris hasil | PASS |
| TC-3.4 | Hapus produk | Soft delete: `deleted_at` terisi, status `archived`, hilang dari tabel | PASS |
| TC-3.5 | Audit trail CRUD | `product.create`, `product.publish`, `product.delete` tercatat dengan `actor_role` | PASS |
| TC-4.1 | Halaman layanan joki (CRUD + publish) | Form dan tabel berfungsi, label terhubung ke input | PASS |
| TC-5.1 | Cari pengguna "ebryany6" | 1 hasil dari `profiles.email` | PASS |
| TC-5.2 | Beri peran Support | DB: `ebryany6@gmail.com → customer,support`; audit `user_role.assign` | PASS |
| TC-5.3 | Cabut peran Support | DB kembali `customer`; audit `user_role.remove` | PASS |
| TC-5.4 | Cabut peran admin milik akun sendiri | Ditolak: "Anda tidak dapat mengubah peran akun sendiri (proteksi privilege escalation)" | PASS |
| TC-7.1 | Matriks izin | 31 permission × 6 peran; kolom super admin terkunci sistem | PASS |

Screenshot tersimpan pada sesi uji: overview, form produk, hasil create/publish/search/delete, audit log, matriks izin, pengguna, drawer mobile.

## 4. Verifikasi database

- Permission per peran: super_admin 31, admin 22, finance 10, support 6, operator 5.
- `has_permission()`, `is_super_admin()`, `get_my_permissions()` SECURITY DEFINER, `search_path=public`, EXECUTE dicabut dari PUBLIC.
- `profiles.email` tersinkron dari `auth.users` melalui `handle_new_user()` (trigger tunggal `on_auth_user_created`, tidak ada duplikasi) dan dilindungi trigger `profiles_protect_email` sehingga user tidak dapat mengubahnya lewat update profil biasa.
- Audit log ditulis lewat RPC `write_audit_log()`; tabel `audit_logs` hanya dapat dibaca admin dan tidak dapat diubah/dihapus dari klien.

## 5. Batasan / belum terverifikasi

- **Proteksi "super admin terakhir" pada level database belum diuji runtime**: akses SQL yang tersedia hanya select/insert sehingga skenario DELETE tidak dapat dijalankan. Proteksi tetap aktif di jalur server function (`changeUserRole`).
- IP pada audit log kosong pada pengujian lokal karena tidak ada header `x-forwarded-for`; pada lingkungan terpublikasi header tersedia.
- Modul Order, Pembayaran, Refund, Task, Laporan, Pengaturan masih placeholder "Belum tersedia" — dijadwalkan Slice 2.
