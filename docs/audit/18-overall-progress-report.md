# AUDIT OVERALL EBRYSTORE

## Status
AUDIT_COMPLETED (audit awal, evidence-based) · 2026-07-28

## Overall Progress
- Claimed: 80–85%
- Verified: **50%**
- Difference: **−30 s.d. −35 poin**

## Weighted Score

| Area | Bobot | Skor Area | Kontribusi |
|---|---:|---:|---:|
| Foundation, Auth, RBAC | 8% | 85% | 6,80 |
| Katalog Produk & Layanan | 7% | 80% | 5,60 |
| Checkout & Order Engine | 12% | 65% | 7,80 |
| Payment & Invoice | 12% | 50% | 6,00 |
| Produk Digital Delivery | 8% | 40% | 3,20 |
| Service Fulfillment & Operator | 12% | 15% | 1,80 |
| Timeline & Dashboard Sync | 8% | 60% | 4,80 |
| Realtime | 6% | 10% | 0,60 |
| Notification | 5% | 35% | 1,75 |
| Refund & Dispute | 6% | 45% | 2,70 |
| Admin Operations & Task | 5% | 70% | 3,50 |
| Reporting & Settings | 3% | 70% | 2,10 |
| Security | 4% | 70% | 2,80 |
| QA, Deployment, Production Readiness | 4% | 20% | 0,80 |
| **Total** | **100%** | — | **50,25** |

## Verified Features
- Otorisasi granular (`assertPermission`) + audit log — satu-satunya area dengan test otomatis.
- Pembuatan order digital & jasa dengan harga dihitung server + idempotency key.
- Verifikasi pembayaran manual DANA → payment paid → entitlement → order completed (produk digital, sampai titik file).
- Order status history sebagai satu-satunya sumber timeline, tanpa data hard-coded.
- Dedup task operasional lewat unique partial index.

## Partially Verified
Katalog publik, checkout, dashboard customer, seluruh halaman admin transaksi,
laporan, pengaturan, notifikasi in-app, task.

## UI Only
Komponen `src/components/ebry/*` (presentasi murni — wajar), halaman
"Produk Saya" yang tampil tetapi tidak dapat mengunduh.

## Backend Only
`cancel_own_order`, `request_refund`, `review_refund`, `process_refund`,
`consume_download`, revocation entitlement saat refund — semua ada kodenya,
nol eksekusi nyata.

## Schema Only
`operator_assignments`, `payment_events`, `download_logs`, `orders.status='disputed'`,
`admin_tasks.due_at`, `expired_at` (tanpa job).

## Mock Only
Tidak ditemukan mock adapter pembayaran — bukan karena sudah nyata, melainkan
karena **adapter provider belum dibuat sama sekali**.

## Not Implemented
Operator dashboard, assignment, progress, hasil, revisi, SLA/overdue, dispute,
QRIS/webhook, email/push, realtime, upload master file produk, upload lampiran
kebutuhan jasa, job terjadwal, E2E test.

## Critical Gaps
1. GAP-01 Service fulfillment & operator (order jasa lunas mandek permanen).
2. GAP-02 Produk digital tidak dapat diunduh (0 file, tidak ada UI unggah).
3. GAP-03 Tidak ada payment gateway/webhook (QRIS) — keputusan provider masih terbuka.

## High-Risk Gaps
4. GAP-04 Tidak ada realtime sama sekali.
5. GAP-05 Notifikasi hanya in-app record; 7 dari 16 event tidak punya penulis.
6. GAP-06 Refund parsial belum diimplementasikan (selalu full) — menyimpang dari keputusan Owner.
7. GAP-07 Tidak ada job expiry order/payment.
8. GAP-08 Nyaris tanpa test otomatis; klaim isolasi/IDOR NOT_TESTED.

## Realtime Status
MANUAL_REFRESH (bukan realtime, bukan near-realtime). Bukti: 0 tabel di publikasi
`supabase_realtime`, 0 `.channel(` di kode, 0 `refetchInterval`.

## Notification Status
PARTIALLY_VERIFIED — in-app atomik di dalam RPC (desain benar), tanpa email, push,
delivery status, retry, dedup, atau badge live.

## Order Engine Status
PARTIALLY_VERIFIED — pembuatan, snapshot, total server-side, idempotency, dan
history solid; siklus jasa dan expiry belum ada; transisi invalid belum diuji.

## Timeline Status
PARTIALLY_VERIFIED — satu sumber, tanpa duplikasi, `internal_note` tidak bocor ke
customer (diverifikasi di kode); hanya 5 dari 9 jenis event yang punya penulis.

## Dashboard Synchronization Status
Konsisten pada level data (satu sumber DB), tidak sinkron lintas aktor tanpa reload.

## Security Status
PARTIALLY_VERIFIED — postur otorisasi kuat, bukti pengujian lemah.

## Production Readiness Status
NOT_READY — tanpa cron, email, webhook, staging terpisah, backup/restore teruji,
dan E2E.

## Realistic Percentage
**50%** (rentang kepercayaan 48–55%). Angka 80–85% **tidak dapat dipertahankan**:
angka tersebut menghitung schema dan UI sebagai fitur selesai.

## Remaining Work to 100%
Lihat `19-gap-register.md` dan `20-remediation-roadmap.md`.

## Recommended Execution Order
1. Slice 3 — Digital delivery end-to-end (unggah file admin + unduhan teruji).
2. Slice 4 — Operator & service fulfillment (assignment → progress → hasil → revisi → completed).
3. Slice 5 — Realtime + notification delivery.
4. Slice 6 — Refund parsial, dispute, job terjadwal (expiry/SLA/overdue).
5. Slice 7 — Payment gateway QRIS + webhook (menunggu keputusan Owner).
6. Slice 8 — QA otomatis (RPC, RLS/IDOR, E2E) + production readiness.