# 02 — Database Map

26 tabel `public`. Data aktual saat audit (query langsung):

| Tabel | Baris | Status pemakaian |
|---|---:|---|
| orders | 2 | VERIFIED (jalur digital+jasa membuat baris) |
| payments | 2 | PARTIALLY_VERIFIED (manual saja) |
| invoices | 2 | PARTIALLY_VERIFIED (tanpa halaman/PDF invoice) |
| order_status_histories | 6 | VERIFIED sebagai sumber timeline |
| notifications | 13 | PARTIALLY_VERIFIED (in-app saja) |
| admin_tasks | 3 | PARTIALLY_VERIFIED |
| digital_entitlements | 1 | PARTIALLY_VERIFIED |
| download_logs | 0 | NOT_TESTED — belum pernah ada unduhan sukses |
| digital_product_files | 0 | BROKEN — tidak ada file, tidak ada UI unggah |
| operator_assignments | 0 | SCHEMA_ONLY — tidak dirujuk kode |
| refunds | 0 | NOT_TESTED — RPC & UI ada, belum pernah dijalankan |
| payment_events | 0 | SCHEMA_ONLY — tidak ada webhook |
| payment_verifications | ada | PARTIALLY_VERIFIED |
| audit_logs | 23 | VERIFIED |
| user_roles / permissions / role_permissions | 13 / 31+ | VERIFIED |
| digital_products (published) | 1 | PARTIALLY_VERIFIED |
| services (published) | 1 | PARTIALLY_VERIFIED |

## Constraint status

`orders.status` CHECK memuat 16 status, `payments.status` 12 status,
`refunds.status` 8 status, `admin_tasks.status` 5 status.

**Temuan:** CHECK hanya membatasi *nilai*, bukan *transisi*. Tidak ada trigger
guard transisi. Perlindungan transisi hanya berada di dalam RPC
(`verify_manual_payment`, `cancel_own_order`, `submit_payment_proof`,
`review_refund`, `process_refund`) yang memeriksa status awal. Karena `authenticated`
tidak punya GRANT UPDATE pada `orders`/`payments` (policy denied UPDATE), risiko
transisi liar dari client rendah — tetapi **belum diuji** secara eksplisit.

## Realtime

`select count(*) from pg_publication_tables where pubname='supabase_realtime'` → **0**.
Tidak ada satu tabel pun dipublikasikan. Realtime = NOT_IMPLEMENTED.

## Storage

- `payment-proofs` (privat) — dipakai upload bukti bayar dari client. VERIFIED alur unggah.
- `product-files` (privat) — **kosong**, hanya dibaca lewat `createSignedUrl` di
  `transaction.server.ts`. NOT_TESTED.
- Tidak ada bucket `order-attachments` → lampiran kebutuhan jasa NOT_IMPLEMENTED.