# Riset: Top-Up Saldo Ebrystore via QRIS (SumoPod)

Tanggal: 2026-10-04 · Status: **RISET SELESAI — BUKTI TERKUMPUL**
Konteks: fitur baru — pengguna dapat mengisi saldo Ebrystore sendiri lewat pembayaran
QRIS SumoPod yang sudah terpasang. Dokumen ini memetakan kondisi nyata sebelum
rancangan (lihat [`../marketplace/08-rencana-mgrcao-v3-topup-saldo-qris.md`](../marketplace/08-rencana-mgrcao-v3-topup-saldo-qris.md)).

---

## 1. Kondisi sistem saldo saat ini

### 1.1 Yang sudah ada (VERIFIED)

**Tabel `credit_ledger`** (migrasi `20260930100003_credit_ledger.sql`), append-only:

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid PK | — |
| `user_id` | uuid NOT NULL | pemilik saldo |
| `direction` | text CHECK (`credit`,`debit`) | arah mutasi |
| `amount` | bigint CHECK (>0) | IDR penuh |
| `source_type` | text CHECK (`refund`,`adjustment`,`reversal`) | **tidak ada `topup`** |
| `source_id` | uuid NULL | id refund/payment/order terkait |
| `reference` | text NULL | nomor referensi |
| `note` | text NULL | — |
| `created_by` | uuid NULL | aktor |
| `idempotency_key` | text NOT NULL UNIQUE | anti dobel |
| `created_at` | timestamptz | — |

**Fungsi terkait:**
- `get_credit_balance(_user_id)` — SUM ledger, `SECURITY DEFINER`.
- `get_my_credit_balance()` — saldo pemanggil.
- `credit_refund_to_balance(_refund_id)` — kredit dari refund (idempoten `refund:<id>`),
  butuh permission `refunds.process`.
- `apply_credit_to_order(_order_id, _max_credit)` — debit saldo untuk membayar order,
  idempoten `order:<id>`, kunci `pg_advisory_xact_lock(710003, hashtext(user_id))`.

**UI terkait:**
- `/dashboard/saldo` (`dashboard.saldo.tsx`) — kartu saldo + riwayat mutasi, realtime
  via tabel `credit_ledger`. Copy saat ini: *"Saldo berasal dari refund pesanan yang
  dibatalkan. Belum bisa dipakai untuk membayar pesanan."* — **sudah usang**, karena
  pemakaian saldo untuk order sebenarnya sudah jalan.
- Detail pesanan (`dashboard.pesanan.$id.tsx`) — tombol "Pakai saldo" memanggil
  `applyCreditToOrder` saat order `awaiting_payment`.
- Navigasi dashboard (`dashboard.index.tsx:109`) — menu "Saldo".

**Kondisi data live:** `credit_ledger` = **0 baris**, order dengan `credit_used > 0` = **0**.
Artinya seluruh jalur saldo belum pernah terpakai di data nyata.

### 1.2 Alur saldo yang sudah jalan

```
Refund selesai → credit_refund_to_balance → ledger credit ('refund')
Order awaiting_payment → apply_credit_to_order → ledger debit ('adjustment')
Order kedaluwarsa/cancel → job_expire_orders → ledger credit ('reversal')
```

### 1.3 Yang belum ada (NOT_IMPLEMENTED)

- **Top-up saldo** — tidak ada tabel, fungsi, server function, route, atau UI.
  Grep `topup|top.?up|isi saldo|deposit` di `src/`, `supabase/migrations/`, `docs/` = 0 hasil.
- `source_type` ledger belum mengizinkan nilai `topup` (CHECK constraint).
- Tidak ada cara memasukkan uang ke saldo selain refund.
- Tidak ada halaman "Isi Saldo" atau nominal preset.

## 2. Integrasi SumoPod/QRIS yang sudah ada (VERIFIED)

### 2.1 Adapter `src/lib/sumopod.server.ts`

- `sumopodConfig()` — butuh env `SUMOPOD_API_KEY`; env `SUMOPOD_ENV` (sandbox/live),
  `SUMOPOD_METHOD` (default `QRIS`). Base URL sandbox: `api-pay-sandbox.sumopod.com`,
  live: `api-pay.sumopod.com`.
- `createQrisPayment(cfg, orderRef, amount, returnUrl?)` — POST `/api/v1/payments`,
  kirim `order_id`, `amount`, `currency IDR`, `expires_in_hours: 1`.
  **Catatan: `orderRef` harus unik per pembuatan.**
- `fetchQrPayload(paymentLinkUrl)` — ambil string QRIS mentah dari halaman checkout
  provider (tanpa iframe), validasi prefix `00020101`.
- `getPaymentStatus(cfg, providerPaymentId)` — status resmi dari provider.
- `verifyWebhook(raw, headers)` — token sederhana (`SUMOPOD_WEBHOOK_TOKEN`) ATAU
  HMAC Svix (`SUMOPOD_WEBHOOK_SECRET`).
- `settleSumopodPayment(paymentId, providerRef, paidAmount)` — panggil RPC
  `settle_gateway_payment`.

### 2.2 Server function `src/lib/payments.functions.ts`

- `startQrisPayment({ paymentId, refresh? })` — buat/ambil QRIS untuk sebuah baris
  `payments`; rate limit `qris.create` (10/5 menit); simpan `qr_reference` (JSON:
  providerPaymentId, payUrl, amount, fee, total, expiredAt, qrString), `payment_url`,
  `external_transaction_id`; optimistic guard `.eq("status", ...)` dst.
- `checkQrisPayment({ paymentId })` — cek ke provider, settle bila sudah dibayar.

### 2.3 Webhook `src/routes/api/public/payments/webhook.sumopod.ts`

- Verifikasi tanda tangan → parse → cari `payments` by `external_transaction_id`
  (fallback: potong `order_id` provider jadi `PAY-YYYYMMDD-NNNNNN` dan cari
  `payment_number`).
- Hanya proses `payment.completed`; cek amount cocok; validasi ulang status ke
  provider; panggil `settle_gateway_payment`; catat `payment_events`
  (unik per `provider + external_event_id`).
- **Webhook terikat erat ke tabel `payments`** — baris payment wajib ada sebelum
  webhook datang.

### 2.4 RPC `settle_gateway_payment(_payment_id, _provider, _provider_ref, _paid_amount, _method)`

Fungsi ini **terikat ke order** dan tidak bisa dipakai langsung untuk top-up:

- `SELECT * FROM payments WHERE id = _payment_id` → ambil `v_pay`, lalu
  `SELECT * INTO v_order FROM orders WHERE id = v_pay.order_id FOR UPDATE`.
- Mengubah status `orders` (`paid` / `academic_review` / `waiting_assignment`),
  membuat entitlement, invoice, notifikasi order, admin task.
- Artinya: butuh `orders` yang valid dengan `order_type` salah satu dari
  `digital_product|service|marketplace_service`.

**Konsekuensi untuk top-up:** tidak boleh menumpangkan top-up ke
`settle_gateway_payment` tanpa order. Dua opsi: (a) buat jalur settle terpisah untuk
top-up, atau (b) jangan pakai tabel `payments` untuk top-up.

## 3. Kendala skema yang ditemukan (bukti query live)

| # | Temuan | Bukti |
|---|---|---|
| 1 | `payments.order_id` **NOT NULL** + FK `REFERENCES orders(id)` | `information_schema` + `pg_constraint` |
| 2 | `payments` UNIQUE `idempotency_key`, UNIQUE `payment_number` (auto `PAY-YYYYMMDD-NNNNNN`) | `next_payment_number()` def |
| 3 | `credit_ledger.source_type` CHECK hanya `refund,adjustment,reversal` | `pg_constraint` |
| 4 | `credit_ledger.amount` CHECK > 0 — kredit top-up aman (positif) | `pg_constraint` |
| 5 | `credit_ledger` RLS: select own + `refunds.view` staff; INSERT hanya via RPC SECURITY DEFINER | `pg_policy` |
| 6 | `payment_events.payment_id` nullable — **bisa** dipakai top-up tanpa payment row | `information_schema` |
| 7 | `payment_events` UNIQUE (`provider`,`external_event_id`) — aman untuk idempotensi webhook | `pg_indexes` |
| 8 | `invoices.order_id` NOT NULL — invoice top-up tidak bisa pakai tabel ini apa adanya | `information_schema` |
| 9 | Cron `expire_orders` tiap 10 menit; mengembalikan `credit_used` via ledger reversal | `cron.job` + def fungsi |
| 10 | `qris_enabled` = true (publik); flag lama `qris_payment_active`/`feature_qris` dibaca di `getMyOrder` dengan default true | query + `orders.functions.ts:256-263` |
| 11 | Env `SUMOPOD_*` **tidak ada di `.env` lokal** — hanya terkonfigurasi di runtime (Lovable/hosting) | grep `.env*` = 0 |
| 12 | Data live: `payments` = 13 baris, `credit_ledger` = 0, `credit_used>0` = 0 | query |

## 4. Titik integrasi yang tersedia

| Kebutuhan top-up | Jalur yang ada dan bisa dipakai ulang |
|---|---|
| Buat QRIS | `createQrisPayment` + `fetchQrPayload` (sama seperti order) |
| Tampilkan QR | Komponen `src/components/ebry/qris-payment.tsx` (sudah: countdown, copy, refresh, auto-check) |
| Cek status | `getPaymentStatus` |
| Webhook | Route yang ada, tapi logika pencocokan payment perlu jalur kedua untuk top-up |
| Ledger | `credit_ledger` + pola idempoten (`idempotency_key` unik) + `write_audit_log` + `notifications` |
| Rate limit | `enforceRateLimit` dengan bucket baru (mis. `topup.create`) |
| Realtime UI | Pola `useRealtimeRefresh` (channel `my-credit` sudah ada) |

## 5. Risiko yang teridentifikasi

| Risiko | Detail | Mitigasi yang mungkin |
|---|---|---|
| Dobel-kredit | Webhook + polling manual bisa sama-sama settle | idempotency key unik per top-up; RPC settle cek status |
| Uang masuk tanpa ledger | Provider bilang paid tapi insert ledger gagal | Settle dan kredit dalam satu transaksi DB (RPC tunggal) |
| Amount mismatch | User bayar nominal beda | Validasi `paid_amount >= expected` seperti order |
| Nominal palsu | Client kirim nominal sembarang | Server-authoritative: nominal dari baris DB, bukan dari client |
| Regulasi uang elektronik | Saldo bisa di-top-up = mendekati e-money (BI/OJK) | **OWNER_DECISION_REQUIRED** — keputusan lama (O-05) masih berlaku |
| Pencucian uang / abuse | Top-up sendiri lalu refund ke bank | Tidak ada withdrawal (belum ada); batasi nominal & rate limit |
| Webhook tanpa payment row | Jalur pencocokan lama butuh `payments` | Top-up perlu tabel/jejak sendiri atau jalur pencocokan kedua |
| QRIS expired | 1 jam | UI countdown + refresh (sudah ada di komponen) |

## 6. Keputusan desain yang harus diambil Owner

1. **Bentuk data top-up**: baris di `payments` (butuh order dummy/palsu — kotor)
   vs **tabel baru `credit_topups`** (bersih, terpisah dari order). Rekomendasi riset:
   tabel baru, karena `payments.order_id NOT NULL` dan `settle_gateway_payment`
   terikat order.
2. **Regulasi**: top-up = uang masuk ke sistem. Keputusan O-05 (konsultasi BI/OJK)
   belum ada. Perlu keputusan eksplisit sebelum production.
3. **Batas nominal**: minimum/maksimum per top-up dan per hari.
4. **Refund top-up**: apakah saldo hasil top-up bisa ditarik/refund? (Saat ini tidak
   ada withdrawal; tetap begitu?)

## 7. Status bukti

| Bagian | Status |
|---|---|
| Ledger saldo + RPC | VERIFIED (ada, terpasang, 0 data) |
| Pemakaian saldo untuk order | VERIFIED (RPC + UI ada) |
| SumoPod QRIS untuk order | VERIFIED (adapter + server fn + webhook) |
| Top-up saldo | NOT_IMPLEMENTED (nol jejak) |
| Skema top-up | OWNER_DECISION_REQUIRED (bentuk data) |
| Regulasi e-money | OWNER_DECISION_REQUIRED (O-05) |
| Env Sumopod lokal | TIDAK ADA di `.env` — hanya runtime |
