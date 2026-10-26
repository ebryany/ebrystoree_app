# Gap Analysis Transaksi (Slice 2)

| # | Kapabilitas | Sekarang | Target Slice 2 | Gap | Blocker |
|---|---|---|---|---|---|
| G-01 | Detail produk/layanan | tidak ada | `/produk/$slug`, `/layanan/$slug` | halaman + server fn publik | — |
| G-02 | Checkout produk digital | tidak ada | `/checkout/produk/$slug` | schema order + kalkulasi server | tabel order |
| G-03 | Checkout layanan | tidak ada | `/checkout/layanan/$slug` | form kebutuhan + upload | bucket storage |
| G-04 | Kalkulasi harga server-side | tidak ada | wajib | `pricing.server.ts` | — |
| G-05 | Order + item snapshot | tidak ada | `orders`, `order_items` | migrasi | — |
| G-06 | State machine order | dokumen saja | kode + enforcement | `order-state.server.ts` | — |
| G-07 | Invoice | tidak ada | `invoices` + halaman | migrasi | — |
| G-08 | Payment manual | setting saja | `payments`, proof, verifikasi | migrasi + bucket | Owner: nama pemilik DANA |
| G-09 | Payment gateway | placeholder `midtrans` | adapter contract + mock | interface adapter | Owner: U-01 provider |
| G-10 | Webhook idempotent | tidak ada | `/api/public/payments/$provider/webhook` + `payment_events` | route + unique event id | provider final |
| G-11 | Entitlement digital | tidak ada | `digital_entitlements`, `download_logs` | migrasi + signed URL | bucket |
| G-12 | Dashboard customer | `/akun` saja | dashboard, order, pembayaran, produk saya, refund, notifikasi | halaman baru | order |
| G-13 | Admin order | placeholder | list + detail + aksi | halaman + server fn | order |
| G-14 | Admin payment | placeholder | list + verifikasi | halaman + server fn | payment |
| G-15 | Refund | placeholder | `refunds` + review | migrasi | Owner: refund window |
| G-16 | Task operasional | placeholder | `admin_tasks` + event service | migrasi + unique aktif | — |
| G-17 | Laporan dasar | placeholder | agregasi nyata | view/query | data order |
| G-18 | Pengaturan transaksi | tabel ada, UI tidak | halaman settings | UI + audit | — |
| G-19 | Notifikasi | tidak ada | `notifications` + bell | migrasi | — |
| G-20 | Assignment operator | tidak ada | `operator_assignments` + dashboard operator dasar | migrasi | — |
| G-21 | Storage privat | 0 bucket | 3 bucket + policy | tool bucket + RLS objects | — |
| G-22 | Permission baru | 31 key | +6 key | migrasi | — |
| G-23 | Test transaksi | 8 unit test authz | unit + integrasi + E2E | vitest + playwright | — |

## Urutan Vertical Slice

1. **VS-1 Produk digital**: detail → checkout → order+invoice → payment manual →
   verifikasi admin → entitlement → download customer. (termasuk migrasi inti,
   task verifikasi, notifikasi, audit, histori status)
2. **VS-2 Layanan**: detail → checkout dengan kebutuhan+lampiran → payment manual →
   verifikasi → assignment operator → tracking dasar customer.
3. **VS-3**: adapter gateway + webhook mock, refund, task automation & scheduler,
   laporan, pengaturan transaksi.

Mixed cart (produk digital + jasa dalam satu order) **NON-SCOPE Slice 2**; checkout
bersifat direct dan menolak pencampuran secara eksplisit.