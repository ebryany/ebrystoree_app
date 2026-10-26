# 01 — Route Map

Total route file: 34 (di luar `routeTree.gen.ts`).

## Publik

| Route | File | Data | Status |
|---|---|---|---|
| `/` | `routes/index.tsx` | `getStorefrontSummary` | PARTIALLY_VERIFIED |
| `/produk` | `produk.index.tsx` | `listProducts` | PARTIALLY_VERIFIED |
| `/produk/$slug` | `produk.$slug.tsx` | `getProductDetail` | PARTIALLY_VERIFIED |
| `/layanan` | `layanan.index.tsx` | `listServices` | PARTIALLY_VERIFIED |
| `/layanan/$slug` | `layanan.$slug.tsx` | `getServiceDetail` | PARTIALLY_VERIFIED |
| `/auth` | `auth.tsx` | Supabase auth | PARTIALLY_VERIFIED |

## Customer (`_authenticated`)

| Route | Fungsi | Status |
|---|---|---|
| `/dashboard` | ringkasan, shortcut, alert aksi | PARTIALLY_VERIFIED |
| `/dashboard/pesanan` | daftar order | PARTIALLY_VERIFIED |
| `/dashboard/pesanan/$id` | detail, timeline, upload bukti, batal, refund | PARTIALLY_VERIFIED |
| `/dashboard/produk-saya` | entitlement + unduhan | BROKEN (tidak ada file aktif; `consume_download` → `FILE_UNAVAILABLE`) |
| `/dashboard/notifikasi` | daftar + mark as read | PARTIALLY_VERIFIED |
| `/checkout/produk/$slug` | checkout produk | PARTIALLY_VERIFIED |
| `/checkout/layanan/$slug` | checkout jasa + requirements | PARTIALLY_VERIFIED (tanpa upload lampiran) |
| `/akun` | redirect ke dashboard | VERIFIED |

## Admin

`/admin`, `/admin/produk`, `/admin/layanan`, `/admin/pengguna`, `/admin/izin`,
`/admin/audit`, `/admin/orders`, `/admin/orders/$id`, `/admin/payments`,
`/admin/payments/$id`, `/admin/refunds`, `/admin/refunds/$id`, `/admin/tasks`,
`/admin/tasks/$id`, `/admin/reports`, `/admin/settings/transactions`.

Semua di-gate `getMyAccess` + `assertPermission` server-side → PARTIALLY_VERIFIED
(fungsi jalan, tetapi tanpa test otomatis dan tanpa evidence E2E).

## Tidak ada

| Route yang hilang | Dampak |
|---|---|
| `/operator/*` (dashboard operator) | Workflow jasa terputus setelah pembayaran |
| `/admin/orders/$id` aksi assign operator | Order jasa mandek di `waiting_assignment` |
| Halaman progress/hasil/revisi | Tahap fulfillment tidak dapat dijalankan |
| `/api/public/*` webhook pembayaran | QRIS/gateway tidak mungkin |
| Halaman dispute/komplain | Tidak ada eskalasi |