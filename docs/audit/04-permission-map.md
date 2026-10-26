# 04 — Permission Map

Sumber: tabel `permissions` + `role_permissions`, fungsi `has_permission`,
`get_my_permissions`, `is_admin`, `is_staff`, `is_super_admin`.

| Kelompok | Contoh key | Dipakai di kode | Status |
|---|---|---|---|
| Dashboard | `admin.dashboard.view` | gate `/admin` | VERIFIED |
| Katalog | `products.*`, `services.*`, `categories.*` | `admin.functions.ts` | VERIFIED |
| Order | `orders.view`, `orders.update`, `orders.assign`, `orders.cancel`, `orders.create` | list/detail order; **`orders.assign` belum punya pemakai** | PARTIALLY_VERIFIED |
| Payment | `payments.view`, `payments.verify`, `payments.reject` | `verifyPayment` + RPC | VERIFIED |
| Refund | `refunds.view/approve/reject/process` | UI + RPC | BACKEND_ONLY |
| Task | `tasks.view/update/assign` | UI + RPC | PARTIALLY_VERIFIED |
| Report/Setting | `reports.view/export`, `settings.view/manage` | halaman admin | PARTIALLY_VERIFIED |
| Peran & izin | `users.*`, `roles.*`, `permissions.*` | `/admin/pengguna`, `/admin/izin` | VERIFIED |

## Temuan

- `super_admin` mendapat bypass terkontrol dan **dicatat di audit log**
  (`permission.super_admin_bypass`) — desain benar.
- Permission untuk fulfillment operator (`jobs.progress`, `jobs.result`,
  `jobs.revision`) **belum ada** → harus ditambahkan pada Slice 4.
- Pengujian negatif ("admin tanpa `payments.verify` mencoba verifikasi") belum ada
  → NOT_TESTED.