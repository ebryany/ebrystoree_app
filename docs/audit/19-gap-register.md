# 19 — Gap Register

Severity: CRITICAL (blocker MVP) · HIGH · MEDIUM · LOW

| ID | Gap | Area | Severity | Dependency | Status |
|---|---|---|---:|---|---|
| GAP-01 | Operator & service fulfillment tidak ada (assign, terima, progress, hasil, revisi, selesai) | Fulfillment 12% | CRITICAL | migrasi tabel progress/hasil/revisi + RPC + route operator | NOT_IMPLEMENTED |
| GAP-02 | Produk digital tidak dapat diunduh: `digital_product_files` kosong, tidak ada UI unggah admin | Delivery 8% | CRITICAL | UI unggah + signed upload ke `product-files` | BROKEN |
| GAP-03 | Tidak ada payment gateway/webhook QRIS | Payment 12% | CRITICAL | keputusan provider Owner (U-01) | OWNER_ACTION_REQUIRED |
| GAP-04 | Realtime tidak aktif (0 publikasi, 0 subscription) | Realtime 6% | HIGH | publikasi tabel + hook langganan | NOT_IMPLEMENTED |
| GAP-05 | Notifikasi hanya in-app; 7 event tanpa penulis; tanpa email/retry/dedup | Notification 5% | HIGH | GAP-01 (event fulfillment) + provider email | PARTIALLY_VERIFIED |
| GAP-06 | Refund selalu penuh; tidak ada input nominal parsial | Refund 6% | HIGH | ubah `request_refund`/`review_refund` + UI | SCHEMA_ONLY |
| GAP-07 | Tidak ada job terjadwal: expiry order/payment, SLA, overdue task, auto-complete | Order/Task | HIGH | endpoint `/api/public/cron` + scheduler | NOT_IMPLEMENTED |
| GAP-08 | Nyaris tanpa test otomatis; IDOR/RLS/transisi invalid NOT_TESTED | QA 4% | HIGH | suite vitest + E2E | NOT_TESTED |
| GAP-09 | Dispute/komplain tidak ada (status `disputed` tak terjangkau) | Refund 6% | MEDIUM | tabel + workflow | NOT_IMPLEMENTED |
| GAP-10 | Lampiran kebutuhan jasa tidak dapat diunggah (bucket `order-attachments` tidak ada) | Fulfillment | MEDIUM | bucket + policy | NOT_IMPLEMENTED |
| GAP-11 | Tidak ada cek duplikat refund aktif per order | Refund | MEDIUM | guard di RPC | NOT_IMPLEMENTED |
| GAP-12 | Validasi upload bukti bayar hanya di client (mime/size) | Security | MEDIUM | validasi server/storage policy | PARTIALLY_VERIFIED |
| GAP-13 | Tidak ada rate limit pada aksi sensitif | Security | MEDIUM | — | NOT_IMPLEMENTED |
| GAP-14 | Invoice tanpa halaman/unduhan PDF untuk customer | Payment | LOW | — | SCHEMA_ONLY |
| GAP-15 | Admin tidak punya inbox notifikasi & tampilan entitlement | Admin ops | LOW | — | NOT_IMPLEMENTED |
| GAP-16 | Tidak ada staging terpisah, backup/restore belum diuji, tanpa runbook | Deployment | LOW | — | NOT_IMPLEMENTED |
| GAP-17 | Manajemen versi file produk digital belum ada | Delivery | LOW | GAP-02 | SCHEMA_ONLY |

## Owner Action Required

- **OA-01 (GAP-03):** tentukan provider QRIS (Midtrans / Xendit / iPaymu / tetap manual dulu).
  Tanpa keputusan ini, area Payment tertahan di 50%.
- **OA-02 (GAP-05):** setujui pemakaian email provider untuk notifikasi transaksional.
- **OA-03 (GAP-06):** konfirmasi aturan nominal refund parsial (persentase vs nominal bebas, siapa yang menentukan).
- **OA-04 (GAP-01):** konfirmasi model kerja operator (satu operator per order, kapasitas, SLA default).