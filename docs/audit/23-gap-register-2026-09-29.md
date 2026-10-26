# 23 — Gap Register (Revisi 2026-09-29)

Menggantikan `19-gap-register.md` (2026-07-28). Berbasis bukti kode, bukan dokumen.
Severity: CRITICAL (blocker) · HIGH · MEDIUM · LOW.
ID memakai prefix `A-` (critical), `B-` (high), `C-` (medium), `D-` (low) sesuai `22-audit-2026-09-29.md`.

## Gap Terbuka

| ID | Gap | Area | Severity | Dependency | Status |
|---|---|---|---:|---|---|
| A-01 | `actor_type='staff'` melanggar CHECK → refund approve/process rollback | Refund | CRITICAL | migrasi ALTER atau ubah literal | OPEN |
| A-02 | Scheduler tidak aktif (`pg_cron` ada, tanpa `cron.schedule`, tanpa route cron) | Ops/Job | CRITICAL | migrasi cron atau route + cron eksternal | OPEN |
| A-03 | Tidak ada rate limiting (auth, pesan, QRIS, webhook, ingest) | Security | CRITICAL | edge/WAF + limit aplikasi | OPEN |
| B-01 | `internal_note`/`internal_deadline` bocor ke customer via `getOrderFulfillment` | Otorisasi/Data | HIGH | split payload per peran | OPEN |
| B-02 | RPC `po_*` pakai `is_staff` coarse (verifikasi bayar tanpa `payments.verify`) | Otorisasi | HIGH | permission granular di RPC/policy | OPEN |
| B-03 | Refund selalu penuh; tanpa nominal parsial & guard ≤ paid | Refund | HIGH | `_amount` + validasi + UI | OPEN |
| B-04 | Webhook memakai status dari body bila endpoint status provider null | Payment | HIGH | fail-closed | OPEN |
| B-05 | Test regresi AS-1 gagal (copy "joki" masih ada) | QA/Brand | HIGH | hapus string | OPEN |
| B-06 | Key permission `settings.update` + `settings.*` website tidak ada di DB | Otorisasi | HIGH | migrasi key/grant atau ubah string | OPEN |
| B-07 | Tanpa kanal email, `notification_deliveries`, retry, dedup | Notifikasi | HIGH | provider email + tabel delivery | OPEN |
| B-08 | 5 tabel subscribe realtime tanpa publikasi (chat/PO/queue no-op) | Realtime | HIGH | `ALTER PUBLICATION ADD TABLE` | OPEN |
| B-09 | Telegram dispatch tak dipanggil otomatis; HTML injection | Notifikasi | HIGH | wire cron + escape | OPEN |
| C-01 | Tanpa trigger guard matriks transisi status | Transaksi | MEDIUM | trigger DB | OPEN |
| C-02 | `job_expire_orders` tanpa audit & tanpa `FOR UPDATE SKIP LOCKED` | Job | MEDIUM | patch RPC | OPEN |
| C-03 | Webhook tanpa cek currency & tanpa `ON CONFLICT` pada `payment_events` | Payment | MEDIUM | patch route | OPEN |
| C-04 | `quote_academic_order` SECURITY DEFINER tanpa cek `auth.uid()` | Otorisasi | MEDIUM | patch RPC | OPEN |
| C-05 | Kuota revisi tidak ditegakkan (hanya flag `is_chargeable`) | Fulfillment | MEDIUM | patch RPC + kebijakan | OPEN |
| C-06 | Guard duplikat refund tidak ramah (hanya index) | Refund | MEDIUM | pre-check RPC | OPEN |
| C-07 | Refund tidak membebaskan stok code/file ter-assign | Delivery | MEDIUM | patch `process_refund` | OPEN |
| C-08 | Operator punya `tasks.manage` tapi RPC butuh `tasks.update` | Otorisasi | MEDIUM | samakan key | OPEN |
| C-09 | BR-13/BR-60 dilanggar: nominal manual tak dibandingkan; `needs_review` tak ada | Payment | MEDIUM | komparasi + status baru | OPEN |
| C-10 | Bell tanpa error state; unread undercount; toast tanpa deep-link | Notifikasi/UX | MEDIUM | patch komponen | OPEN |
| C-11 | Reset password (US-AUTH-02) tidak ada | Auth | MEDIUM | route + alur | OPEN |
| C-12 | Modul komplain/dispute tidak ada; `disputed` tak terjangkau | Aftersales | MEDIUM | tabel + workflow | OPEN |
| C-13 | Cakupan test tipis (tanpa RLS/IDOR/RPC/transaksi/E2E penuh) | QA | MEDIUM | suite vitest + E2E | OPEN |
| C-14 | Dokumentasi stale ±7 minggu | Docs | MEDIUM | tandai superseded + regenerasi | OPEN |
| D-01..D-12 | Lihat `22-audit-2026-09-29.md` §5 (over-payment, idempotency global, off-by-one reupload, audit download, HSTS/nosniff, token timing, bucket, `.env`/PII, env doc, observability, dead code, route dead) | beragam | LOW | — | OPEN |

## Gap Lama yang Sudah Tertutup (verifikasi 2026-09-29)

| Gap lama (2026-07-28) | Status sekarang | Bukti |
|---|---|---|
| GAP-02 Produk digital tak dapat diunduh | **CLOSED** | `product-files.functions.ts`, 3 mode kirim, `consume_download` menegakkan kuota |
| GAP-03 Tak ada payment gateway/webhook QRIS | **CLOSED** | SumoPod adapter + `webhook.sumopod.ts` + `settle_gateway_payment` |
| GAP-04 Realtime tidak aktif | **CLOSED** | 16 tabel dipublikasikan, hook subscriber di 14 file |
| GAP-05 Notifikasi hanya in-app, 7 event tanpa penulis | **PARTIAL** | ~11/16 event punya penulis; email tetap belum ada (B-07) |
| GAP-07 Tak ada job terjadwal | **PARTIAL** | Job RPC ADA, tetapi tak dijadwalkan (A-02) |
| GAP-08 Test otomatis minim | **PARTIAL** | 2 unit + 6 E2E; cakupan tetap tipis (C-13) |
| GAP-09 Dispute/komplain | **OPEN** | Masih tidak ada (C-12) |
| GAP-10 Lampiran jasa tak dapat diunggah | **CLOSED** | Bucket `academic-order-attachments` + `academic.functions.ts` |
| GAP-11 Tanpa cek duplikat refund | **CLOSED** | Index `idx_refund_active_per_order` (guard RPC belum ramah: C-06) |
| GAP-15 Admin tanpa inbox notifikasi | **CLOSED** | `/admin/notifikasi` (broadcast) |
| GAP-17 Manajemen versi file | **CLOSED** | `product-files-dialog.tsx` + versi di `digital_product_files` |
| GAP-01 Operator & fulfillment | **CLOSED** | Pipeline lengkap + route `/operator`, `/admin/pengerjaan` |
| GAP-06 Refund parsial | **OPEN** | Masih penuh (B-03) |

## Owner Action Required

- **OA-01 (B-03/C-09):** konfirmasi aturan nominal refund parsial & selisih pembayaran manual (persentase vs nominal bebas; siapa yang menentukan; how to handle overpay).
- **OA-02 (B-07):** setujui provider email transaksional (Resend/SMTP) untuk mengaktifkan baris email di notification matrix.
- **OA-03 (C-12):** putuskan apakah komplain/dispute masuk MVP atau dikeluarkan dari spec.
- **OA-04 (C-05):** kebijakan revisi (tolak saat kuota habis vs add-on berbayar).
- **OA-05 (D-07/D-08):** konfirmasi flag bucket publik `catalog-images`; setujui pemindahan PII dari migrasi & gitignore `.env`.
