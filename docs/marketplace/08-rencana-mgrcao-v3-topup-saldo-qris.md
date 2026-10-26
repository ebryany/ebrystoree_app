# 08 — Rencana Eksekusi MGRCAO V3: Top-Up Saldo Ebrystore via QRIS SumoPod

Tanggal: 2026-10-04 · Sumber temuan: [`../audit/2026-10-04-riset-topup-saldo-qris-sumopod.md`](../audit/2026-10-04-riset-topup-saldo-qris-sumopod.md)
Status: **RENCANA — MENUNGGU KONFIRMASI OWNER SEBELUM EKSEKUSI**

---

## M — Mindset

1. **Problem-first**: melengkapi siklus saldo. Saat ini saldo hanya bisa masuk dari
   refund; pengguna tidak bisa mengisi sendiri. Top-up menutup celah itu memakai
   QRIS SumoPod yang sudah terbukti di jalur order.
2. **Uang orang lain terlibat** — kebenaran finansial di atas kecepatan rilis.
   Setiap rupiah masuk wajib punya: baris pembayaran (topup), entri ledger, jejak
   audit, dan idempotensi. Dilarang menampilkan saldo tanpa ledger di belakangnya.
3. **Evolusi aditif**: tabel baru `credit_topups` + perluasan CHECK `source_type`
   (`topup`) + RPC baru. Tidak mengubah `payments`, `orders`, `settle_gateway_payment`,
   atau jalur order yang sudah berjalan.
4. **Jangan memalsukan**: tidak ada order dummy untuk menumpangkan top-up;
   tidak ada "escrow/KYC" tanpa dasar; copy UI jujur (termasuk batas yang belum ada,
   mis. pencairan ke bank).
5. **Regulasi dihormati**: top-up = uang masuk yang disimpan = mendekati uang
   elektronik. Keputusan O-05 (BI/OJK) **belum ada** → eksekusi hanya di lingkungan
   Supabase baru ini; **produksi dilarang** sampai keputusan Owner.
6. **Ikuti arah visual Ebrystore** (DESIGN.md): ink-teal, low elevation, mobile-first,
   reduced-motion, tanpa glow/gradient dekoratif.

## G — Goal

Pengguna dapat mengisi saldo Ebrystore sendiri lewat QRIS SumoPod; saldo bertambah
otomatis setelah pembayaran terkonfirmasi (webhook + polling), tercatat di ledger
append-only, dan bisa dipakai untuk membayar pesanan (sudah jalan).

### Slice 1 — Skema & RPC (fondasi, wajib dulu)

| Aspek | Target |
|---|---|
| Masalah | Tidak ada tempat menyimpan transaksi top-up; ledger belum mengenal `topup` |
| Target | Tabel `credit_topups` (status flow sendiri) + CHECK `source_type` + `'topup'` + RPC `settle_credit_topup` idempoten + RLS |
| Acceptance | (a) migrasi aditif terpasang; (b) `settle_credit_topup` idempoten (panggil 2× → 1 entri ledger); (c) amount mismatch ditolak; (d) user lain tidak bisa lihat/ubah top-up orang; (e) anon tidak bisa eksekusi RPC |

**Rancangan tabel `credit_topups`:**

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid PK | — |
| `topup_number` | text UNIQUE | `TOP-YYYYMMDD-NNNNNN` (sequence baru) |
| `user_id` | uuid NOT NULL | pemilik |
| `amount` | bigint CHECK (>0) | nominal diminta (server-authoritative) |
| `status` | text CHECK | `waiting_payment`, `paid`, `expired`, `cancelled`, `failed` |
| `provider` | text | `sumopod` |
| `provider_payment_id` | text | id dari SumoPod |
| `payment_url` | text | link checkout provider |
| `qr_reference` | text | JSON sama bentuk dengan `payments.qr_reference` |
| `paid_amount` | bigint NULL | jumlah aktual dibayar |
| `expires_at` | timestamptz | 1 jam (ikut provider) |
| `paid_at` | timestamptz NULL | — |
| `idempotency_key` | text UNIQUE | `topup:<id>` (dibuat saat settle) |
| `created_at` / `updated_at` | timestamptz | — |

**RPC `settle_credit_topup(_topup_id, _provider, _provider_ref, _paid_amount)`:**
lock baris `FOR UPDATE` → sudah `paid`? return `already_settled` → validasi status →
validasi `_paid_amount >= amount` → set `paid` → INSERT `credit_ledger`
(`direction='credit'`, `source_type='topup'`, `source_id=topup.id`,
`idempotency_key='topup:<id>'`, `ON CONFLICT DO NOTHING`) → notifikasi + audit →
return saldo baru. `SECURITY DEFINER`, REVOKE dari anon/authenticated, GRANT ke
service_role (pola `settle_gateway_payment`).

**Batas nominal (usulan, perlu keputusan Owner):** min Rp10.000, maks Rp1.000.000
per top-up; rate limit `topup.create` 5 per 10 menit (bucket baru di
`rate-limit.server.ts`).

### Slice 2 — Server functions, webhook, expiry

| Aspek | Target |
|---|---|
| Masalah | Belum ada pembuatan QRIS top-up; webhook belum mengenal top-up |
| Target | `createCreditTopup` + `checkCreditTopup` server fn; webhook jalur kedua; cron expiry |
| Acceptance | (a) `createCreditTopup` membuat baris + QRIS dan mengembalikan qr payload; (b) `checkCreditTopup` menyelesaikan saat provider bilang paid; (c) webhook `payment.completed` dengan `order_id` `TOP-...` menyelesaikan top-up yang benar; (d) event ganda tidak mengkredit 2×; (e) top-up lewat 1 jam → `expired` tanpa mutasi ledger |

**A — Action:**
1. `createCreditTopup({ amount })` — auth → rate limit → validasi nominal →
   insert `credit_topups` (status `waiting_payment`, `expires_at` +1 jam) →
   `createQrisPayment(cfg, topup_number, amount)` → `fetchQrPayload` → update baris
   dengan `provider_payment_id`, `payment_url`, `qr_reference` → return
   `{ topupNumber, qris, payUrl }`.
2. `checkCreditTopup({ topupId })` — status ke provider → bila paid panggil
   `settle_credit_topup` (service role).
3. **Webhook** (`webhook.sumopod.ts`): setelah lookup `payments` gagal, cari
   `credit_topups` by `provider_payment_id`; fallback parse nomor
   (`TOP-YYYYMMDD-NNNNNN` dari `order_id`). Validasi amount sama; panggil
   `settle_credit_topup`; catat `payment_events` (payment_id NULL, event id unik).
4. **Expiry**: cron baru `job_expire_topups` tiap 10 menit (pola `job_expire_orders`)
   → status `expired`. Tidak ada mutasi ledger (uang belum masuk).
5. Test: idempotensi settle, amount mismatch, status invalid, authz negatif
   (user lain, anon), nominal di luar batas.

### Slice 3 — UI "Isi Saldo"

| Aspek | Target |
|---|---|
| Masalah | Belum ada UI; copy halaman saldo sudah usang |
| Target | Tombol "Isi saldo" di `/dashboard/saldo` + panel QRIS (nominal preset + kustom) + status menunggu/berhasil + perbaiki copy usang |
| Acceptance | (a) preset 10rb/25rb/50rb/100rb + nominal kustom tervalidasi; (b) QR tampil dengan countdown & tombol cek status; (c) saldo bertambah realtime setelah settle; (d) tiga state UI (loading/error/sukses) benar; (e) mobile 390px tanpa overflow; (f) copy lama "belum bisa dipakai untuk membayar pesanan" diganti fakta sekarang |

**A — Action:** perluas `dashboard.saldo.tsx` (kartu saldo + tombol aksi + panel),
pakai ulang pola `src/components/ebry/qris-payment.tsx` (countdown, copy, refresh,
auto-check) yang di-parameterisasi untuk topup; `useRealtimeRefresh` channel
`credit_ledger` sudah ada; label `SOURCE_LABEL` tambah `topup: "Isi saldo"`.

## G-UI — Lapisan UI/UX

| Elemen | Penyempurnaan | Sumber pola |
|---|---|---|
| Panel isi saldo | Dialog/sheet dari tombol "Isi saldo"; di mobile full-width | Komponen `ui/dialog`/`ui/sheet` existing |
| Nominal | Grid chip preset + input kustom `tabular-nums`; validasi inline | Token Ebrystore |
| QR | Kotak QR putih, countdown teks kecil, tombol "Salin kode" + "Cek status" | `qris-payment.tsx` (port) |
| Status | Menunggu = netral; berhasil = `success`; gagal/expired = `danger` + tombol buat ulang | Token semantik existing |
| Riwayat | Baris `topup` di riwayat saldo dengan label "Isi saldo" | `BankListRow` |

Aturan ketat: tanpa dependency baru; transisi ≤200ms; reduced-motion dihormati;
tanpa angka tanpa sumber; em-dash 0.

## R — Role

Financial/backend engineer (ledger, idempotensi, RPC) + PostgreSQL/Supabase engineer
(migrasi aditif, RLS) + security reviewer (authz, rate limit) + frontend engineer
(panel QRIS) + QA (test positif/negatif + klik-through). Tidak ada permission baru;
staff `payments.view` boleh melihat top-up untuk rekonsiliasi.

## C — Context (bukti terverifikasi, rincian di dokumen riset)

- `credit_ledger` ada, append-only, `source_type` CHECK hanya `refund|adjustment|reversal`
  (perlu ditambah `topup`); 0 baris data.
- `apply_credit_to_order` + UI "Pakai saldo" sudah jalan; copy saldo usang.
- SumoPod: adapter (`sumopod.server.ts`), server fn (`payments.functions.ts`),
  webhook (`webhook.sumopod.ts`), semua teruji di jalur order.
- `settle_gateway_payment` **terikat order** (`payments.order_id NOT NULL`) → tidak
  dipakai untuk top-up; perlu RPC terpisah.
- `payment_events.payment_id` nullable + unik per `provider+external_event_id` →
  aman untuk log webhook top-up.
- Cron `expire_orders` pola yang bisa ditiru untuk expiry top-up.
- Env `SUMOPOD_*` tidak ada di `.env` lokal — terkonfigurasi di runtime; pengujian
  lokal memerlukan env sandbox.
- Data live: `payments` 13 baris, `credit_ledger` 0, `credit_used>0` 0 → fitur saldo
  belum pernah terpakai; aman menambah jalur baru.

## A — Action (urutan eksekusi)

1. **Slice 1** → migrasi `credit_topups` + CHECK + RPC + RLS + rate limit bucket +
   test unit RPC (positif & negatif).
2. **Slice 2** → server fn + webhook jalur kedua + cron expiry + test webhook
   (idempoten, amount mismatch, event ganda).
3. **Slice 3** → UI panel isi saldo + perbaikan copy + verifikasi browser
   (buat top-up → QR tampil → simulasi paid di sandbox → saldo & riwayat bertambah).
4. **Setiap slice**: implementasi → `npx eslint --fix` file terubah → `npm run test:unit`
   hijau (tanpa menambah kegagalan) → `npm run build` → verifikasi browser +
   mobile 390px → catat bukti → slice berikutnya.

## O — Output

1. Migrasi aditif + RPC `settle_credit_topup` (idempoten, teraudit).
2. Server functions `createCreditTopup` / `checkCreditTopup` + webhook diperluas +
   cron expiry.
3. UI "Isi saldo" di `/dashboard/saldo` + riwayat dengan label baru.
4. Test unit: idempotensi, amount mismatch, authz negatif, nominal bounds.
5. Laporan evidence: file berubah + hasil test + klik-through + status jujur per
   acceptance criteria (mengikuti pola `docs/audit/2026-10-04-verifikasi-*.md`).

### Non-goals (dilarang masuk)

- Pencairan saldo ke bank (withdrawal) — tetap tidak ada.
- Transfer saldo antar pengguna.
- Refund/penarikan saldo hasil top-up.
- Mengubah `payments`/`orders`/`settle_gateway_payment` atau jalur order.
- Deploy production sebelum keputusan regulasi.

### Keputusan Owner yang diperlukan (OWNER_DECISION_REQUIRED)

| ID usulan | Pertanyaan | Default aman bila belum diputuskan |
|---|---|---|
| O-05 (ada) | Regulasi uang elektronik (BI/OJK) untuk saldo yang bisa di-top-up | Eksekusi hanya di Supabase baru; produksi dilarang |
| O-14 | Bentuk data top-up: tabel `credit_topups` (rekomendasi) vs menumpang `payments` | Pakai tabel baru — tidak menyentuh jalur order |
| O-15 | Batas nominal & frekuensi top-up | Usulan: min Rp10.000, maks Rp1.000.000, 5×/10 menit |
| O-16 | Kredit = nominal penuh atau nominal dikurangi fee provider | Usulan: kredit nominal penuh (fee ditanggung platform, konsisten dengan order) |

### Risiko & rollback

| Risiko | Mitigasi |
|---|---|
| Dobel-kredit (webhook + polling) | `idempotency_key` unik + cek status `FOR UPDATE` di RPC |
| Uang masuk tanpa ledger | Settle + kredit dalam satu transaksi RPC |
| Amount mismatch / nominal palsu | Validasi server-side; nominal dari baris DB, bukan client |
| Webhook top-up salah cocok | Cocokkan `provider_payment_id` dulu; fallback nomor `TOP-` unik |
| Abuse (top-up lalu refund) | Tidak ada withdrawal; rate limit; batas nominal |
| Regulasi | `OWNER_DECISION_REQUIRED` O-05 — produksi dilarang sampai diputuskan |

Rollback: drop tabel `credit_topups` + RPC + cron (belum ada data produksi);
kembalikan CHECK `source_type` ke semula; revert file TS/TSX. Tidak menyentuh data
order/payment lama.
