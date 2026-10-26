# Inventaris Halaman Ebrystore (32 route)

| Route | Peran | Layout | Mobile | Status redesign |
|---|---|---|---|---|
| `/` | Publik | SiteHeader/Footer | ok | Perlu hero + shortcut layanan |
| `/produk` | Publik | SiteHeader/Footer | ok | Perlu filter chips + card baru |
| `/produk/$slug` | Publik | SiteHeader/Footer | ok | Perlu sticky CTA + info berlapis |
| `/layanan` | Publik | SiteHeader/Footer | ok | Masih ringkas, perlu kategori & card jasa |
| `/auth` | Publik | Standalone | ok | Perlu penyederhanaan form |
| `/checkout/produk/$slug` | Customer | Dashboard shell | ok | Perlu step + sticky bottom CTA |
| `/dashboard` | Customer | Tab bar | lemah | Redesign penuh (greeting, shortcut, action required) |
| `/dashboard/pesanan` | Customer | Tab bar | lemah | Order card baru |
| `/dashboard/pesanan/$id` | Customer | Tab bar | lemah | Timeline tracking baru |
| `/dashboard/produk-saya` | Customer | Tab bar | lemah | Card unduhan |
| `/dashboard/notifikasi` | Customer | Tab bar | lemah | Empty state manusiawi |
| `/akun` | Customer | redirect | - | - |
| `/admin` | Admin | Sidebar | sedang | Blok "Perlu perhatian" |
| `/admin/produk`, `/admin/layanan` | Admin | Sidebar | sedang | Data table responsif |
| `/admin/pengguna`, `/admin/izin`, `/admin/audit` | Admin | Sidebar | sedang | Data table responsif |
| `/admin/orders`, `/admin/orders/$id` | Admin | Sidebar | sedang | Card view + sticky action bar |
| `/admin/payments`, `/admin/payments/$id` | Admin | Sidebar | sedang | Antrian verifikasi + viewer bukti |
| `/admin/refunds`, `/admin/refunds/$id` | Admin | Sidebar | sedang | Idem |
| `/admin/tasks`, `/admin/tasks/$id` | Admin | Sidebar | sedang | Idem |
| `/admin/reports` | Admin | Sidebar | sedang | Chart lazy-load |
| `/admin/settings/transactions` | Admin | Sidebar | sedang | Form terstruktur, bukan JSON mentah |

## Halaman yang belum ada (gap)
- Checkout jasa (paket → kebutuhan → unggah → bayar).
- Detail layanan `/layanan/$slug`.
- Dashboard operator (`/operator`, tugas, revisi, profil).
- Admin: kategori, operator, progres, revisi, komplain, notifikasi.
- Halaman bantuan/komplain customer.
