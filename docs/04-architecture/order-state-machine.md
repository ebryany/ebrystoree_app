# Order State Machine (Slice 2)

Status order (terpisah total dari status pembayaran):
`draft`, `awaiting_payment`, `payment_under_review`, `paid`, `waiting_assignment`,
`assigned`, `waiting_customer_data`, `queued`, `in_progress`,
`waiting_customer_review`, `completed`, `cancelled`, `refund_requested`,
`refund_processing`, `refunded`, `disputed`.

## Transition Matrix

| Dari | Aksi | Aktor | Ke | Validasi |
|---|---|---|---|---|
| draft | checkout | customer | awaiting_payment | item valid, published, harga dihitung server |
| awaiting_payment | submit_manual_proof | customer | payment_under_review | proof valid, payment milik order |
| payment_under_review | verify_payment | finance/admin (`payments.verify`) | paid | nominal cocok |
| payment_under_review | reject_payment | finance/admin (`payments.reject`) | awaiting_payment | alasan wajib |
| awaiting_payment | webhook_paid | sistem | paid | signature + nominal valid |
| paid | deliver_digital | sistem | completed | entitlement dibuat (order digital) |
| paid | queue_service | sistem | waiting_assignment | order jasa |
| waiting_assignment | assign_operator | admin (`orders.assign`) | assigned | operator aktif, tidak duplikat |
| assigned | request_customer_data | operator/admin | waiting_customer_data | kebutuhan tidak lengkap |
| waiting_customer_data | submit_data | customer | queued | kebutuhan lengkap |
| assigned/queued | start_work | operator | in_progress | assignment aktif milik operator |
| in_progress | submit_result | operator | waiting_customer_review | ada hasil |
| waiting_customer_review | approve | customer/sistem | completed | — |
| awaiting_payment | cancel | customer/admin (`orders.cancel`) | cancelled | belum dibayar |
| awaiting_payment | expire | scheduler | cancelled | melewati `expired_at` |
| paid..waiting_customer_review | request_refund | customer | refund_requested | dalam refund window, tidak ada refund aktif |
| refund_requested | approve_refund | admin (`refunds.approve`) | refund_processing | — |
| refund_processing | complete_refund | finance (`refunds.process`) | refunded | dana dikirim |
| any (kecuali refunded/cancelled) | dispute | support | disputed | eskalasi |

Terlarang: `refunded → paid`; melompati status; operator mengubah status pembayaran;
finance mengubah progres jasa; scheduler menutup order `disputed`.

## Aturan Wajib Setiap Transisi

1. Autentikasi + `assertPermission`.
2. Muat order dengan kunci baris (`select ... for update` via RPC/transaksi).
3. Cek transisi terhadap matrix di atas; transisi tak dikenal → tolak.
4. Update baris domain, tulis `order_status_histories`, jalankan efek samping
   (task, notifikasi, entitlement) secara idempotent, tulis `audit_logs`.
5. Commit tunggal, kembalikan state server terbaru.