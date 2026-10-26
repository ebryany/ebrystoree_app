# Security Requirements & Threat Model

## Kontrol Wajib
Hash password modern (dikelola platform auth), sesi aman + cookie SameSite, HTTPS, secure headers, CORS terbatas, validasi input Zod di semua boundary, proteksi XSS/SQLi (query terparameterisasi), rate limiting pada auth/checkout/webhook, RBAC + object-level authorization, secret hanya lewat environment (tidak pernah di repository), audit trail, dependency scanning, dan sanitasi pesan error.

## File & Storage
Bucket privat; nama file diacak; validasi MIME + ekstensi + ukuran; tidak pernah mempercayai `Content-Type` klien; signed URL maksimal 5 menit; kepemilikan divalidasi pada setiap permintaan unduh; pencegahan path traversal.

## Webhook
Endpoint `/api/public/payments/webhook/{provider}`. Urutan wajib: baca raw body → verifikasi signature → simpan event (unique `provider_event_id`) → cocokkan nominal & currency → perbarui payment dalam satu transaksi database → jalankan side effect sekali. Signature invalid → 401 tanpa perubahan data. Body mentah tidak boleh dilog secara utuh bila mengandung data pribadi.

## Threat Model (ringkas STRIDE)
| Ancaman | Vektor | Mitigasi |
|---|---|---|
| Spoofing | Webhook palsu | Verifikasi signature + allowlist provider |
| Tampering | Total harga dari klien | Kalkulasi ulang server-side |
| Repudiation | Sengketa pembayaran | Audit log + histori verifikasi |
| Info disclosure | IDOR order/file | Object-level authz + RLS + signed URL |
| DoS | Spam checkout/webhook | Rate limit + idempotency |
| Elevation | Ubah role sendiri | Role di tabel terpisah + `has_role()` + hanya super_admin |
| Fraud | Bukti transfer palsu | Verifikasi manual + rekonsiliasi |
| Replay | Webhook diulang | Unique event id + processed flag |

## Security Gate (memblokir release)
Customer melihat order orang lain; operator mengakses order yang bukan tugasnya; finance mengubah role; endpoint admin tanpa authorization; webhook menerima signature invalid; file sensitif dapat diakses publik; secret di repository; password/token muncul di log; SQLi/XSS critical; kerentanan dependency critical; backup atau restore belum diuji.