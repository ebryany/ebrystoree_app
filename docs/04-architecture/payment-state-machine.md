# Payment State Machine (Slice 2)

Status payment: `draft`, `pending`, `waiting_payment`, `waiting_verification`, `paid`,
`failed`, `expired`, `rejected`, `cancelled`, `refund_requested`,
`partially_refunded`, `refunded`.

## Transition Matrix

| Dari | Aksi | Aktor | Ke | Validasi |
|---|---|---|---|---|
| draft | init | sistem | pending | order ada |
| pending | issue_instruction (manual) | sistem | waiting_payment | instruksi manual tersedia |
| pending | create_provider_payment | adapter | waiting_payment | provider merespons, `external_transaction_id` disimpan |
| waiting_payment | submit_proof | customer | waiting_verification | file valid, ukuran ≤ batas |
| waiting_verification | approve | `payments.verify` | paid | `paid_amount` = `expected_amount` |
| waiting_verification | reject | `payments.reject` | rejected | alasan wajib |
| waiting_verification | request_reupload | `payments.reject` | waiting_payment | alasan wajib, proof lama disimpan |
| rejected | reupload | customer | waiting_verification | belum melewati batas upload ulang |
| waiting_payment | webhook_settlement | sistem | paid | signature valid + nominal & currency cocok |
| waiting_payment | webhook_failed | sistem | failed | signature valid |
| waiting_payment | expire | scheduler/webhook | expired | `expired_at` terlewati |
| waiting_payment/pending | cancel | customer/admin | cancelled | order dibatalkan |
| paid | request_refund | customer | refund_requested | eligible |
| refund_requested | settle_partial | finance | partially_refunded | 0 < jumlah < dibayar |
| refund_requested | settle_full | finance | refunded | jumlah = dibayar |

Nominal tidak cocok → payment tetap `waiting_verification` dan task
`review_payment_anomaly` dibuat; **tidak pernah** otomatis `paid`.

## Idempotency

- `payments.idempotency_key` unique → checkout ganda mengembalikan payment yang sama.
- `payment_events(provider, external_event_id)` unique → webhook duplikat ditolak
  setelah dicatat, tanpa efek samping kedua.
- Efek samping (entitlement, task, notifikasi) memakai kunci natural unik sehingga
  pemrosesan ulang aman.