# 20 — Remediation Roadmap

Estimasi progres kumulatif setelah tiap slice (berbasis weighted scoring 18).

| Slice | Isi | Gap | Progres setelah slice |
|---|---|---|---:|
| **S3 — Digital Delivery End-to-End** | UI unggah master file di admin (signed upload ke `product-files`), aktivasi versi, uji unduh: limit 5, 365 hari, download_logs, revocation | GAP-02, GAP-17 | ~56% |
| **S4 — Operator & Service Fulfillment** | Tabel `job_progress`, `job_results`, `revisions`; RPC `assign_operator`, `accept_assignment`, `start_work`, `update_progress`, `submit_result`, `request_revision`, `approve_result`; route `/operator/*`; aksi assign di admin; timeline + task + notifikasi tiap tahap | GAP-01, GAP-10 | ~68% |
| **S5 — Realtime & Notification Delivery** | Publikasi realtime `orders`, `order_status_histories`, `notifications`, `admin_tasks`; hook langganan + fallback polling; badge unread live; email transaksional + retry + dedup | GAP-04, GAP-05 | ~76% |
| **S6 — Refund Parsial, Dispute, Job Terjadwal** | Nominal refund parsial, guard duplikat, tabel dispute + freeze order, endpoint cron `/api/public/cron` untuk expiry/SLA/overdue/auto-complete | GAP-06, GAP-07, GAP-09, GAP-11 | ~84% |
| **S7 — Payment Gateway QRIS** | Payment Adapter (manual + provider), webhook bersignature & idempotent di `/api/public/*`, rekonsiliasi `payment_events` | GAP-03 (butuh OA-01) | ~91% |
| **S8 — QA & Production Readiness** | Test RPC, test RLS/IDOR, test transisi invalid, E2E Playwright dua workflow penuh, rate limit, validasi upload server, monitoring, backup/restore, runbook, evidence pack | GAP-08, GAP-12, GAP-13, GAP-16 | **100%** |

## Aturan eksekusi

1. Satu slice = satu vertical slice lengkap (DB → RPC → server fn → UI → test → evidence).
2. Tidak ada klaim selesai tanpa evidence di `docs/11-evidence/`.
3. S7 boleh ditunda tanpa memblokir S3–S6; jalur manual DANA tetap operasional.
4. Urutan S3 → S4 dipilih karena S3 lebih murah dan langsung membuka pendapatan
   produk digital, sedangkan S4 adalah pekerjaan terbesar.