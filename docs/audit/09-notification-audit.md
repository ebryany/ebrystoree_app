# 09 — Audit Notification

Status keseluruhan: **PARTIALLY_VERIFIED (in-app record saja)**

## Yang ada

- Tabel `notifications` (13 baris nyata) dengan `recipient_id`, `type`, `title`,
  `message`, `related_type/id`, `read_at`.
- Penulisan notifikasi dilakukan **di dalam RPC** (bukan job), sehingga atomik
  dengan perubahan bisnis. Ini benar secara desain.
- Halaman `/dashboard/notifikasi` + `markNotificationRead` berfungsi.

## Yang tidak ada

| Aspek | Status | Bukti |
|---|---|---|
| Email | NOT_IMPLEMENTED | 0 hasil pencarian `resend/smtp/nodemailer` |
| Push | NOT_IMPLEMENTED | tidak ada service worker/VAPID |
| Delivery status & retry | NOT_IMPLEMENTED | tidak ada kolom/tabel delivery |
| Deduplication | NOT_IMPLEMENTED | tidak ada unique key event |
| Realtime unread badge | NOT_IMPLEMENTED | lihat audit 08 |

## Cakupan event wajib

| Event | Notifikasi dibuat | Sumber |
|---|---|---|
| Order created | YA | `create_digital_order`, `create_service_order` |
| Payment proof submitted | YA (customer + staf finance) | `submit_payment_proof` |
| Payment verified / rejected / reupload | YA | `verify_manual_payment` |
| Order completed (digital) | YA | `verify_manual_payment` |
| Order paid (jasa) | YA | `verify_manual_payment` |
| Order cancelled | YA | `cancel_own_order` |
| Refund requested/approved/rejected/completed | YA (kode ada, 0 data uji) | `request_refund`, `review_refund`, `process_refund` |
| Operator assigned | TIDAK | modul tidak ada |
| Work started | TIDAK | modul tidak ada |
| Progress updated | TIDAK | modul tidak ada |
| Customer data requested | TIDAK | modul tidak ada |
| Result submitted | TIDAK | modul tidak ada |
| Revision requested/completed | TIDAK | modul tidak ada |

Cakupan event: **9 dari 16** memiliki penulis notifikasi; 4 di antaranya belum
pernah dieksekusi dengan data nyata.