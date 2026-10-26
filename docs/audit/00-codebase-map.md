# 00 — Codebase Map (Audit Total)

Status: AUDIT_IN_PROGRESS · Tanggal: 2026-07-28 · Metode: CODEBASE_FIRST

## Stack terverifikasi

| Aspek | Nilai | Bukti |
|---|---|---|
| Framework | TanStack Start v1 + React 19 + Vite 7 | `package.json`, `src/router.tsx` |
| Router | TanStack Router file-based (`src/routes`) | `src/routeTree.gen.ts` |
| Backend | Server function (`createServerFn`) + Postgres RPC | `src/lib/*.functions.ts` |
| Database | Lovable Cloud (Postgres + RLS) | 26 tabel `public` |
| Storage | 2 bucket privat: `payment-proofs`, `product-files` | konfigurasi storage |
| Realtime | **tidak ada** | `pg_publication_tables(supabase_realtime)` = 0 baris; 0 pemakaian `.channel(` di `src` |
| Email/Push | **tidak ada** | pencarian `resend/smtp/nodemailer` = 0 hasil |
| Route API/webhook | **tidak ada** | direktori `src/routes/api` tidak ada |
| Cron/queue/job | **tidak ada** | tidak ada job expiry/SLA/auto-complete |
| Test | 1 file unit (8 test, lulus) | `bunx vitest run` |

## Peta modul kode

| Area | File | Fungsi | Terhubung | Diuji | Status |
|---|---|---|---|---|---|
| Autentikasi | `src/routes/auth.tsx`, `src/hooks/use-session.ts` | login/signup/OAuth, redirect `/dashboard` | Ya | Manual | PARTIALLY_VERIFIED |
| Gate route | `src/routes/_authenticated/route.tsx` | proteksi client-side + RLS | Ya | Manual | PARTIALLY_VERIFIED |
| Otorisasi | `src/lib/authz.server.ts` | `loadAccess`, `assertPermission`, `writeAudit` | Ya | Unit (8) | VERIFIED |
| Katalog publik | `src/lib/catalog.functions.ts` | list produk/layanan, detail layanan | Ya | Tidak | PARTIALLY_VERIFIED |
| Admin katalog/RBAC | `src/lib/admin.functions.ts` (30 fn) | CRUD produk, layanan, paket, addon, peran, izin, audit | Ya | Tidak | PARTIALLY_VERIFIED |
| Transaksi customer | `src/lib/orders.functions.ts` (14 fn) | order, bukti bayar, refund, entitlement, notifikasi | Ya | Tidak | PARTIALLY_VERIFIED |
| Transaksi admin | `src/lib/admin-transaction.functions.ts` (15 fn) | order, payment, refund, task, report, setting | Ya | Tidak | PARTIALLY_VERIFIED |
| Helper server | `src/lib/transaction.server.ts` | signed URL via `supabaseAdmin` | Ya | Tidak | PARTIALLY_VERIFIED |
| UI kit | `src/components/ebry/*`, `src/components/admin/*` | status pill, timeline, kartu, state kosong | Ya | Tidak | UI_ONLY (presentasi) |
| Operator/fulfillment | — | assign, progress, hasil, revisi | — | — | NOT_IMPLEMENTED |
| Dispute/komplain | — | eskalasi, freeze order | — | — | NOT_IMPLEMENTED |
| Payment gateway (QRIS) | — | adapter provider, webhook | — | — | NOT_IMPLEMENTED |
| Upload file produk digital | — | unggah master file ke `product-files` | — | — | NOT_IMPLEMENTED |

## Catatan penting

- `operator_assignments` ada di database tetapi **tidak dirujuk sama sekali** oleh kode
  aplikasi → SCHEMA_ONLY.
- `digital_product_files` berisi **0 baris** dan tidak ada UI unggah → jalur unduhan
  produk digital tidak dapat menyelesaikan `consume_download` (akan gagal
  `FILE_UNAVAILABLE`).
- Tidak ada satu pun langganan realtime; seluruh pembaruan bergantung pada
  `invalidateQueries` setelah mutasi di tab yang sama.