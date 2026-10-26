# Event–Effect Matrix (Slice 2)

| Event | Order | Payment | Dashboard Customer | Dashboard Admin | Task | Notifikasi | Audit |
|---|---|---|---|---|---|---|---|
| OrderCreated | awaiting_payment | pending→waiting_payment | order & invoice muncul, aksi "Bayar sekarang" | order baru di list | — | customer: order dibuat | ya |
| InvoiceIssued | — | — | invoice dapat dibuka | invoice tampil | — | customer | ya |
| PaymentProofSubmitted | payment_under_review | waiting_verification | "Bukti sedang diperiksa" | antrian verifikasi | buat `verify_payment` | finance/admin | ya |
| PaymentVerified (digital) | paid→completed | paid | produk masuk library | order selesai | tutup `verify_payment` | customer: produk siap | ya |
| PaymentVerified (jasa) | paid→waiting_assignment | paid | "Menunggu penugasan" | perlu assign | tutup `verify_payment`, buat `assign_operator` | customer + admin | ya |
| PaymentRejected | awaiting_payment | rejected | "Bukti ditolak, unggah ulang" | tercatat | tutup `verify_payment` | customer | ya |
| ReuploadRequested | awaiting_payment | waiting_payment | "Unggah ulang bukti" | menunggu customer | tetap terbuka | customer | ya |
| PaymentExpired | cancelled | expired | order kedaluwarsa | tercatat | tutup task terkait | customer | ya |
| EntitlementCreated | — | — | produk di library | — | — | customer | ya |
| DigitalDownloaded | — | — | sisa kuota berkurang | log unduhan | — | — | log |
| OperatorAssigned | assigned | — | "Sedang ditangani" | operator tercatat | tutup `assign_operator`, buat `operator_work` | customer + operator | ya |
| WorkStarted | in_progress | — | timeline diperbarui | progres tampil | task in progress | customer | ya |
| CustomerDataRequested | waiting_customer_data | — | aksi lengkapi data | menunggu customer | buat `follow_up_customer_data` | customer | ya |
| OrderCancelled | cancelled | cancelled | order dibatalkan | tercatat | tutup task aktif | customer | ya |
| RefundRequested | refund_requested | refund_requested | refund aktif | perlu review | buat `review_refund` | admin + customer | ya |
| RefundApproved | refund_processing | refund_requested | "Refund diproses" | status berubah | task lanjut | customer | ya |
| RefundRejected | status sebelumnya | paid | "Refund ditolak" | tercatat | tutup `review_refund` | customer | ya |
| RefundCompleted | refunded | refunded / partially_refunded | refund selesai, entitlement dicabut | selesai | tutup task refund | customer | ya |
| WebhookFailed | — | — | — | anomali tampil | buat `check_transaction` | admin | ya |

Aturan: setiap efek samping berjalan dalam transaksi yang sama dengan perubahan status
domain dan bersifat idempotent (kunci natural unik per task/entitlement/notifikasi).