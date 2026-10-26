# Audit Fondasi Transaksi (Slice 2)

Status: TRANSACTION_DISCOVERY_IN_PROGRESS · Tanggal: 2026-07-28

## 1. Peta Route

| Route | File | Jenis | Status |
|---|---|---|---|
| `/` | `src/routes/index.tsx` | Publik | ADA |
| `/produk` | `src/routes/produk.tsx` | Publik, daftar produk | ADA (tanpa halaman detail) |
| `/layanan` | `src/routes/layanan.tsx` | Publik, daftar layanan | ADA (tanpa halaman detail) |
| `/auth` | `src/routes/auth.tsx` | Publik | ADA |
| `/_authenticated/akun` | `akun.tsx` | Customer | ADA (profil saja) |
| `/admin` + 5 halaman | `_authenticated/admin/*` | Admin | ADA (katalog, akses, audit) |
| Detail produk/layanan | — | Publik | BELUM ADA |
| Checkout | — | Customer | BELUM ADA |
| Dashboard customer (order, pembayaran, produk saya, refund, notifikasi) | — | Customer | BELUM ADA |
| Admin order/pembayaran/refund/task/laporan/pengaturan | — | Admin | BELUM ADA (placeholder `available: false` di `src/lib/admin-nav.ts`) |
| Route API/webhook (`src/routes/api/**`) | — | Server | BELUM ADA |

## 2. Server Function yang Ada

| File | Isi | Pola |
|---|---|---|
| `src/lib/catalog.functions.ts` | `listProducts`, `listServices`, `getStorefrontSummary` | anon publishable client, read-only |
| `src/lib/admin.functions.ts` (693 baris) | `getMyRoles`, overview, CRUD produk/layanan/kategori, peran, audit | `requireSupabaseAuth` + `assertPermission` + Zod |
| `src/lib/authz.server.ts` | `loadAccess`, `assertPermission`, `writeAudit`, `ForbiddenError` | dipakai semua mutasi admin |
| `src/lib/supabase-public.server.ts` | publishable client server-side | untuk data publik |

Pola wajib diikuti Slice 2: `*.functions.ts` hanya berisi deklarasi server fn; helper/domain service diletakkan di `*.server.ts` terpisah.

## 3. Kondisi Database

Tabel `public` yang ADA (12): `profiles`, `user_roles`, `permissions`, `role_permissions`,
`categories`, `digital_products`, `digital_product_files`, `services`, `service_packages`,
`service_addons`, `system_settings`, `audit_logs`.

Belum ada satu pun tabel transaksi. **Tidak ada konflik nama** dengan 20 tabel baru yang
direncanakan (`orders`, `order_items`, `service_order_details`, `payments`,
`payment_events`, `manual_payment_proofs`, `payment_verifications`, `invoices`,
`order_status_histories`, `digital_entitlements`, `download_logs`,
`operator_assignments`, `refunds`, `admin_tasks`, `notifications`, `coupons` opsional).

Fungsi tersedia: `has_permission`, `is_admin`, `is_staff`, `is_super_admin`, `has_role`,
`write_audit_log`, `set_updated_at`. Semua SECURITY DEFINER dengan `search_path=public`
dan EXECUTE sudah dibatasi (hardening Slice 1).

Catatan kolom katalog yang relevan untuk snapshot harga: `digital_products.price`,
`discount_price`, `status`, `deleted_at`, `download_limit` (default 5), `validity_days`
(default 365); `service_packages.price/estimated_days/free_revisions/sla_hours`;
`service_addons.price`.

## 4. Storage

`storage.buckets` **kosong**. Belum ada bucket untuk file produk digital, bukti
pembayaran, maupun lampiran kebutuhan jasa. Kolom `digital_product_files.storage_path`
sudah ada tetapi belum ada bucket dan belum ada policy — jadi belum ada satupun
mekanisme upload/signed URL di aplikasi.

Rencana bucket (semua privat):
- `product-files` — master file produk digital (baca hanya lewat server fn bersinyal).
- `payment-proofs` — bukti transfer manual.
- `order-attachments` — lampiran kebutuhan jasa.

## 5. Konfigurasi Pembayaran yang Ada

`system_settings` sudah menyimpan: `admin_fee = 2500`, `manual_payment_method = "DANA"`,
`manual_payment_number = "087782462607"`, `manual_payment_holder = ""` (kosong,
butuh Owner), `manual_payment_deadline_hours = 24`, `proof_file_max_mb = 5`,
`product_file_max_mb = 100`, `download_limit_default = 5`, `download_validity_days = 365`,
`payment_provider = "midtrans"`.

PERINGATAN: nilai `payment_provider = "midtrans"` adalah placeholder Slice 1 dan
**bukan keputusan Owner** (U-01 masih terbuka). Slice 2 memakai adapter dengan
provider aktif `manual` + adapter mock untuk pengujian; nilai ini akan dinormalkan
menjadi `"manual"` pada migrasi pengaturan transaksi.

## 6. Permission

Sudah tersedia dan siap dipakai: `orders.view`, `orders.update`, `orders.assign`,
`payments.view`, `payments.verify`, `payments.reject`, `refunds.view`,
`refunds.approve`, `tasks.view`, `tasks.manage`, `reports.view`, `reports.export`,
`settings.view`, `settings.manage`.

Belum ada: `orders.cancel`, `payments.reconcile`, `refunds.reject`, `refunds.process`,
`tasks.assign`, `orders.create` (customer). Perlu ditambah pada migrasi Slice 2 beserta
pemetaan `role_permissions`.

## 7. Temuan Blocker

1. Tidak ada halaman detail produk/layanan → titik masuk checkout belum ada.
2. Tidak ada bucket storage → bukti bayar & pengiriman file digital belum mungkin.
3. Tidak ada dashboard customer sama sekali (hanya `/akun`).
4. Tidak ada infrastruktur notifikasi maupun penulisan histori status.
5. `manual_payment_holder` kosong → instruksi pembayaran belum lengkap (Owner).