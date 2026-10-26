# 06 — Audit Order Engine

Status: **PARTIALLY_VERIFIED (65%)**

| Aspek | Status | Catatan |
|---|---|---|
| Order creation | VERIFIED | 2 order nyata (digital + jasa) |
| Order number | VERIFIED | `next_order_number()` `EBS-YYYYMMDD-######` |
| Order type terpisah | VERIFIED | keputusan Owner "tanpa mixed cart" dipatuhi |
| Item snapshot | VERIFIED | `order_items.name_snapshot`, `unit_price`, `metadata` |
| Total dihitung server | VERIFIED | harga diambil dari tabel di dalam RPC, bukan dari client |
| Duplicate prevention | VERIFIED | `idempotency_key` dicek sebelum insert |
| Expiration | SCHEMA_ONLY | `expired_at` diisi, tetapi **tidak ada job** yang meng-expire order/payment |
| Cancellation | BACKEND_ONLY | `cancel_own_order` ada, belum pernah dieksekusi (NOT_TESTED) |
| Status transition guard | PARTIALLY_VERIFIED | dijaga di dalam RPC (`IF status NOT IN (...) RAISE`), tidak ada trigger guard; client tidak punya GRANT UPDATE |
| History | VERIFIED | `order_status_histories` terisi 6 baris dari event nyata |
| Ownership | VERIFIED | RLS + cek `user_id = auth.uid()` di RPC |
| Admin access | VERIFIED | via `assertPermission('orders.view')` |
| Operator access | NOT_IMPLEMENTED | tidak ada modul operator |

## Transisi yang benar-benar terbukti

`awaiting_payment → payment_under_review → completed` (produk digital),
`awaiting_payment` (jasa, mandek karena assignment tidak ada).

Transisi `waiting_assignment → assigned → in_progress → waiting_customer_review →
completed` **belum pernah terjadi** karena tidak ada kode yang menuliskannya.

## Transisi invalid — belum diuji

Tidak ada test negatif untuk: `awaiting_payment → completed`, `paid → refunded`
langsung, `completed → in_progress`, operator mengubah payment, customer mengubah
status order. Status: **NOT_TESTED** (bukan aman-terbukti).