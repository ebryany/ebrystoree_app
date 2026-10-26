# Order, Payment, Refund & Revision State Machine

## Order
Status: `awaiting_payment`, `awaiting_verification`, `payment_rejected`, `paid`, `awaiting_assignment`, `assigned`, `awaiting_customer_data`, `queued`, `in_progress`, `awaiting_customer_review`, `revision_requested`, `in_revision`, `completed`, `cancelled`, `refund_requested`, `refund_processing`, `refunded`, `disputed`.

Progres numerik (0–100) disimpan terpisah dari status agar "progres awal/menengah/hampir selesai" tidak menjadi status tersendiri.

| Dari | Ke | Aktor | Prasyarat | Side effect |
|---|---|---|---|---|
| awaiting_payment | awaiting_verification | Customer | bukti manual diunggah | Notifikasi finance |
| awaiting_payment | paid | Sistem (webhook) | signature + nominal valid | Entitlement digital, notifikasi |
| awaiting_verification | paid | Finance | bukti disetujui | Sama seperti di atas |
| awaiting_verification | payment_rejected | Finance | alasan wajib | Notifikasi customer |
| awaiting_payment | cancelled | Customer/Sistem | belum dibayar / kedaluwarsa | Payment di-expire |
| paid | awaiting_assignment | Sistem | order berisi item jasa | Notifikasi admin |
| awaiting_assignment | assigned | Admin | operator dipilih | Notifikasi operator |
| assigned | awaiting_customer_data | Operator | data pelanggan kurang | Notifikasi customer |
| assigned/queued | in_progress | Operator | order `paid` | Timer SLA mulai |
| in_progress | awaiting_customer_review | Operator | ada result_files | Notifikasi customer |
| awaiting_customer_review | revision_requested | Customer | kuota revisi tersisa | Notifikasi operator |
| revision_requested | in_revision | Operator | — | — |
| in_revision | awaiting_customer_review | Operator | hasil revisi diunggah | — |
| awaiting_customer_review | completed | Customer/Sistem | approval, atau auto setelah SLA review | Minta ulasan |
| paid..in_revision | refund_requested | Customer | dalam masa kebijakan | Notifikasi admin |
| refund_requested | refund_processing | Admin | approval | — |
| refund_processing | refunded | Admin/Finance | dana dikirim | Cabut entitlement bila digital |
| any | disputed | Support | eskalasi | Blokir penutupan otomatis |

Terlarang: melompati status tanpa permission khusus; `refunded` → `paid`; operator mengubah status pembayaran; finance menyelesaikan order jasa; `disputed` ditutup scheduler.

## Payment
`draft → pending → awaiting_payment → {paid | expired | failed}`; manual: `awaiting_manual_verification → {paid | rejected | reupload_requested}`; anomali nominal → `needs_review`; setelah `paid`: `refund_requested → partially_refunded | refunded`; `disputed` dapat dari `paid`.

## Refund
`requested → under_review → {approved → processing → completed | rejected}`. `completed` bersifat final; koreksi hanya lewat entri penyesuaian baru yang teraudit.

## Revision
`requested → accepted → in_progress → submitted → {approved | rejected}`. Melebihi kuota paket → `denied_quota_exceeded`.

## Aturan Umum Transisi
Setiap transisi wajib: validasi prasyarat, cek permission aktor, tulis `order_status_histories`, tulis `audit_logs`, jalankan side effect secara idempotent, dan kirim notifikasi sesuai matrix.