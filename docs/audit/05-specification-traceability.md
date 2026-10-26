# 05 — Specification Traceability

Dokumentasi **tidak** dihitung sebagai bukti implementasi.

| Requirement | Spesifikasi | Implementasi | Test | Evidence | Status |
|---|---|---|---|---|---|
| Checkout terpisah (tanpa mixed cart) | `mvp-scope.md` | `create_digital_order` / `create_service_order` | tidak | 2 order | VERIFIED |
| Harga divalidasi server | `business-rules.md` | harga dibaca dari tabel di RPC | tidak | kode | VERIFIED |
| Order expiry 24 jam | keputusan Owner | `expired_at` diisi; **tidak ada job** | tidak | — | SCHEMA_ONLY |
| Refund window 7 hari | keputusan Owner | dicek di `request_refund` | tidak | — | BACKEND_ONLY |
| Refund parsial + approval admin | keputusan Owner | approval ADA, parsial TIDAK | tidak | — | PARTIALLY_VERIFIED |
| Entitlement 5 unduhan / 365 hari | keputusan Owner | diisi saat verifikasi | tidak | 1 entitlement, 0 unduhan | BACKEND_ONLY |
| Payment Adapter (anti vendor lock-in) | `architecture.md` | **tidak ada adapter** | — | — | NOT_IMPLEMENTED |
| Webhook bersignature + idempotent | `security-requirements.md` | tidak ada route API | — | — | NOT_IMPLEMENTED |
| Order state machine 16 status | `order-state-machine.md` | 16 nilai di CHECK; hanya 5 status tercapai nyata | tidak | `orders` | PARTIALLY_VERIFIED |
| Payment state machine 12 status | `payment-state-machine.md` | 12 nilai; jalur manual saja | tidak | `payments` | PARTIALLY_VERIFIED |
| Refund state machine | `refund-state-machine.md` | RPC lengkap | tidak | 0 baris | BACKEND_ONLY |
| Notification matrix 16 event | `notification-matrix.md` | 9 event punya penulis | tidak | 13 notifikasi | PARTIALLY_VERIFIED |
| Permission matrix | `role-permission-matrix.md` | 31+ key aktif | unit sebagian | audit log | VERIFIED |
| Timeline/history engine | `event-effect-matrix.md` | `order_status_histories` | tidak | 6 baris | PARTIALLY_VERIFIED |
| Definition of Done (evidence wajib) | `definition-of-done.md` | hanya Slice 1 punya evidence | — | `docs/11-evidence/` | PARTIALLY_VERIFIED |