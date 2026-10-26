# Audit Awal Dashboard Admin Ebrystore

Status: AUDIT_IN_PROGRESS · Tanggal: 2026-07-28

## 1. Codebase Map

| Area | File | Fungsi | Status | Risiko |
|---|---|---|---|---|
| Gate autentikasi | `src/routes/_authenticated/route.tsx` | Cek sesi Supabase di `beforeLoad` (client) + fallback `useEffect`, redirect `/auth` | VERIFIED | `beforeLoad` di-skip saat SSR; aman karena data tetap dilindungi RLS |
| Layout admin | `src/routes/_authenticated/admin/route.tsx` | Nav 4 menu + gate role via server fn `getMyRoles` | PARTIALLY_IMPLEMENTED | Belum ada sidebar penuh, breadcrumb, drawer mobile, notifikasi |
| Ringkasan | `src/routes/_authenticated/admin/index.tsx` | 4 KPI (produk, layanan, kategori, penugasan peran) + audit terbaru | PARTIALLY_IMPLEMENTED | Belum ada KPI finansial/order (tabelnya belum ada) |
| Produk | `src/routes/_authenticated/admin/produk.tsx` | Tabel read-only | PARTIALLY_IMPLEMENTED | Belum CRUD, filter, pagination |
| Layanan | `src/routes/_authenticated/admin/layanan.tsx` | Daftar kartu read-only | PARTIALLY_IMPLEMENTED | Belum CRUD paket/add-on |
| Pengguna & Peran | `src/routes/_authenticated/admin/pengguna.tsx` | Daftar user + peran | PARTIALLY_IMPLEMENTED | Belum bisa ubah peran; tanpa email (RLS profiles) |
| Server fn admin | `src/lib/admin.functions.ts` | `getMyRoles`, `getAdminOverview`, `listAdminProducts/Services/Users` dengan `requireSupabaseAuth` + `assertAdmin` | VERIFIED | Belum ada pagination/filter server-side |
| Header | `src/components/site-header.tsx` | Link "Dashboard admin" muncul bila `isAdmin` | VERIFIED | Hanya penyembunyian UI; backend tetap cek role (benar) |
| Katalog publik | `src/lib/catalog.functions.ts` | Anon read via publishable client | VERIFIED | — |
| RBAC DB | `user_roles`, `has_role`, `is_admin`, `is_staff` | Role terpisah dari profil | VERIFIED | Belum ada tabel permission granular |
| Audit log | tabel `audit_logs` | Skema ada, policy admin-only | NOT_IMPLEMENTED (tulisan) | Belum ada satu pun penulis log |

## 2. Sumber teks "No tasks tracked yet"

Hasil pencarian seluruh repo (`rg -i "no tasks tracked"`): **tidak ditemukan**.
Teks itu berasal dari panel pelacak tugas editor Lovable, bukan dari aplikasi
Ebrystore. Artinya modul Task Tracking memang **NOT_IMPLEMENTED** di aplikasi —
bukan placeholder yang perlu dihapus, melainkan modul yang harus dibangun
(`admin_tasks` + turunannya) lengkap dengan empty state informatif.

## 3. Kondisi Database

Tabel yang ADA: `profiles`, `user_roles`, `categories`, `digital_products`,
`digital_product_files`, `services`, `service_packages`, `service_addons`,
`system_settings`, `audit_logs`.

Tabel yang BELUM ADA (blocker untuk sebagian besar modul admin):
`orders`, `order_items`, `payments`, `payment_events`, `digital_entitlements`,
`service_jobs`, `job_progress`, `revisions`, `complaints`, `disputes`,
`refunds`, `promotions`, `coupons`, `operator_profiles`, `notifications`,
`admin_tasks`, `permissions`/`role_permissions`.

Konsekuensi: KPI pendapatan, order, pembayaran, refund, operator, laporan, dan
task otomatis **belum mungkin** dibuat dari data nyata. Membuatnya sekarang
berarti data dummy — dilarang oleh Definition of Done.

## 4. Gap Analysis (ringkas)

| Modul | Status | Blocker |
|---|---|---|
| Authorization backend | VERIFIED (role) | Permission granular belum ada |
| Layout admin lengkap | PARTIAL | — (bisa dikerjakan sekarang) |
| Ringkasan KPI bisnis | PARTIAL | tabel order/payment |
| Orders, Payments, Refund, Komplain, Revisi | NOT_IMPLEMENTED | skema + state machine |
| Operator, Customer | NOT_IMPLEMENTED | tabel order & operator |
| Produk/Layanan CRUD | NOT_IMPLEMENTED | — (bisa dikerjakan sekarang) |
| Task tracking | NOT_IMPLEMENTED | tabel `admin_tasks` |
| Audit log (tulis + halaman) | NOT_IMPLEMENTED | trigger/helper penulis log |
| Laporan & export | NOT_IMPLEMENTED | data transaksi |
| Pengaturan | NOT_IMPLEMENTED | UI atas `system_settings` (bisa sekarang) |

## 5. Prioritas Implementasi (urutan eksekusi)

1. Fondasi RBAC granular: `permissions`, `role_permissions`, fungsi
   `has_permission()`; helper `assertPermission()` di server fn.
2. Layout admin penuh (sidebar bergrup, breadcrumb, drawer mobile, user menu,
   indikator task/notifikasi) + state UI standar.
3. CRUD Katalog (produk, file produk, kategori, layanan, paket, add-on) +
   penulisan `audit_logs`.
4. Migrasi inti transaksi: `orders`, `order_items`, `payments`,
   `payment_events`, `digital_entitlements`, `service_jobs`.
5. Modul Orders & Payments (verifikasi manual DANA, assign operator).
6. Modul Task Tracking (`admin_tasks` + idempotency `source_type/source_id`).
7. Refund, revisi, komplain, sengketa.
8. Operator & customer 360.
9. Laporan + export CSV.
10. Halaman Audit Log & Pengaturan.
11. Testing (authorization, CRUD, responsif) + evidence.

## 6. Risiko

- Cakupan sangat besar; wajib dikerjakan sebagai vertical slice bertahap.
- Tanpa provider pembayaran final, modul payment hanya dapat menyelesaikan
  jalur manual DANA + adapter stub.
- Email pengguna hanya ada di `auth.users` (tidak boleh diakses lewat Data
  API) — perlu keputusan penyimpanan email di `profiles`.
- Penambahan permission granular mengubah pemeriksaan `is_admin` yang sudah
  dipakai banyak policy; perlu migrasi hati-hati dan tanpa merusak akses.

## 7. Owner Decision Required

- OD-01: Permission granular sekarang, atau tetap role-based dulu?
- OD-02: Simpan email pengguna di `profiles` (disinkron trigger) agar admin
  dapat mencari pelanggan by email?
- OD-03: Urutan slice pertama: Katalog CRUD dulu atau langsung skema transaksi
  (orders/payments)?
- OD-04: Task otomatis dijalankan oleh trigger database atau job terjadwal?