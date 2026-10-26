# 03 — Audit Logika Bisnis Escrow & Rancangan Perbaikan

Tanggal: 2026-10-01 · Status: **AUDIT SELESAI, PERBAIKAN BELUM DIEKSEKUSI**

---

## 1. Konteks: Apa yang Dimaksud "Escrow" di Marketplace Digital

### 1.1 Definisi Operasional

Marketplace digital umumnya menggunakan **sistem rekening bersama (held funds)**:

1. **Buyer membayar** ke platform (bukan langsung ke seller).
2. **Platform menahan dana** sampai syarat terpenuhi (produk terkirim, periode dispute lewat).
3. **Platform mentransfer** ke saldo seller internal (ledger credit).
4. **Seller mencairkan** dari saldo internal ke rekening bank pribadi (payout).

**Penting:** istilah "escrow" punya definisi hukum yang ketat. Stripe secara eksplisit menyatakan:

> "Escrow has a precise legal definition, and Stripe doesn't provide escrow services or support escrow accounts."
> — [Stripe Manual Payouts](https://docs.stripe.com/connect/manual-payouts)

Ebrystore **tidak boleh mengklaim menjalankan escrow** tanpa dasar legal/provider (M-07 di decision register). Sistem ini adalah **held-funds internal** menggunakan ledger append-only.

### 1.2 Empat Event Terpisah (Tidak Boleh Dicampur)

| # | Event | Aktor | Bukti |
|---|---|---|---|
| 1 | **Payment collection** | Buyer → Platform | Payment gateway callback/webhook, atau admin verify manual |
| 2 | **Seller ledger credit** | Platform internal | Entri ledger `credit`/`sale`, idempotency key |
| 3 | **Digital delivery** | Platform → Buyer | Entitlement created, file/code allocated, download log |
| 4 | **Payout** | Platform → Seller bank | Transfer reference, payout ledger entry |

Event 1 ≠ Event 2. Event 2 ≠ Event 4. Saat ini Ebrystore hanya mengimplementasikan Event 1-3 (parsial). Event 4 belum ada workflow nyata.

---

## 2. Alur Saat Ini (Kondisi Nyata yang Diaudit)

### 2.1 State Machine Order Digital

```
[awaiting_payment] ──payment approved──→ [completed]
                                           │
                                  (entitlement created,
                                   file/code allocated)
                                           │
                       ┌───────────────────┤
                       ▼                   ▼
              [refund_requested]    (buyer downloads)
                       │
              [refund_processing]
                       │
                 [refunded]
                 (entitlements revoked)
```

**Masalah kritis:** order digital langsung `completed` saat pembayaran diverifikasi, bahkan ketika `v_missing > 0` (stok file/kode kurang). Artinya `completed` bukan bukti buyer telah menerima produk.

### 2.2 File Sumber yang Diaudit

| Fungsi | File efektif (CREATE OR REPLACE terbaru) |
|---|---|
| `verify_manual_payment` | `20260807132231_...sql:1-113` |
| `settle_gateway_payment` | `20260816165151_...sql:1-106` |
| `trg_credit_seller_on_paid` | `20260930100016_credit_seller_on_paid.sql:11-24` |
| `credit_seller_earnings` | `20260930100015_seller_earnings_ledger.sql:64-102` |
| `create_digital_order` | `20260930100028_checkout_seller_enforcement.sql:4-84` |
| `request_refund` | `20260728131658_...sql:261-302` |
| `review_refund` | `20260930100000_fix_refund_actor_type.sql:21-70` |
| `process_refund` | `20260930100004_process_refund_to_credit.sql:15-58` |
| `apply_credit_to_order` | `20260930100005_order_credit_usage.sql:29-83` |
| `get_credit_balance` | `20260930100003_credit_ledger.sql:55-60` |
| `get_store_balance` | `20260930100019_fix_store_data_idor.sql:38-53` |
| `cancel_own_order` | `20260728131658_...sql:236-258` |
| `job_expire_orders` | `20260729024546_...sql:29-78` |
| `consume_download` | `20260728131658_...sql:305-329` |

---

## 3. Temuan Audit (Diurutkan dari Dampak Finansial Tertinggi)

### BUG-01 — CRITICAL: Trigger Kredit Seller Tidak Pernah Terpicu

**File:** `20260930100016_credit_seller_on_paid.sql:14-16`
**Kondisi:** Trigger hanya jalan saat `NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid'`
**Fakta:** Kedua jalur pembayaran (`verify_manual_payment:48-50`, `settle_gateway_payment:55-57`) langsung set order status ke `'completed'`, bukan `'paid'`.
**Dampak:** Seller **tidak pernah menerima kredit pendapatan** dari transaksi nyata manapun. Saldo seller selalu nol.
**Severity:** CRITICAL — uang buyer diterima platform tetapi ledger seller kosong.

### BUG-02 — HIGH: Idempotency Key Mismatch pada credit_seller_earnings

**File:** `20260930100015_seller_earnings_ledger.sql:73,76,95`
**Kondisi:** Cek idempotensi menggunakan `v_key = 'sale:' || _order_id`, tetapi INSERT menulis `v_key || ':' || r.store_id`.
**Fakta:** Lookup mencari `sale:<order_id>`, tetapi yang tersimpan adalah `sale:<order_id>:<store_id>`.
**Dampak:** Jika fungsi dipanggil ulang (seharusnya idempoten), SELECT tidak menemukan entri lama → INSERT dengan key berbeda → unique violation exception (bukan graceful `already_credited`).
**Severity:** HIGH — idempotensi yang dijanjikan tidak berfungsi.

### BUG-03 — HIGH: Refund Tidak Mendebit Saldo Seller

**File:** `20260930100004_process_refund_to_credit.sql:15-58`
**Kondisi:** `process_refund` hanya:
  1. Mengkredit saldo buyer (via `credit_refund_to_balance`).
  2. Merevoke entitlement.
  3. Mengubah status order/payment.
**Fakta:** Tidak ada `INSERT INTO seller_ledger (direction='debit', source_type='refund', ...)`.
**Dampak:** Saat refund terjadi, **saldo seller tidak berkurang**. Platform membayar refund dari kantong sendiri, seller tetap memegang kredit penjualan.
**Severity:** HIGH — kerugian platform langsung.

### BUG-04 — HIGH: request_refund Mengabaikan credit_used

**File:** `20260728131658_...sql:279-280`
**Kondisi:** `refunds.amount = v_pay.paid_amount` (hanya dari payment).
**Fakta:** Order dengan `credit_used > 0` punya `paid_amount < total`. Refund request hanya mencakup porsi yang dibayar tunai, bukan total yang buyer keluarkan (tunai + saldo).
**Dampak:** Buyer yang pakai saldo lalu refund kehilangan bagian saldo yang sudah dipakai. Saldo itu sudah didebit dari credit_ledger saat checkout tetapi tidak dikembalikan saat refund.
**Severity:** HIGH — buyer kehilangan uang.

### BUG-05 — HIGH: process_refund Salah Bandingkan Amount

**File:** `20260930100004_process_refund_to_credit.sql:36-38`
**Kondisi:** `v_paid >= v_order.total` membandingkan jumlah refund yang completed dengan total order.
**Fakta:** Untuk order mixed-credit, `v_order.total` termasuk `credit_used`, tetapi refund hanya menutupi `paid_amount`. Sehingga `v_paid` tidak akan pernah mencapai `v_order.total` → payment status selalu `partially_refunded` padahal seluruh porsi tunai sudah dikembalikan.
**Severity:** HIGH — status pembayaran tidak pernah benar untuk order campuran.

### BUG-06 — MEDIUM: Race Condition pada apply_credit_to_order

**File:** `20260930100005_order_credit_usage.sql:40,48`
**Kondisi:** `FOR UPDATE` hanya pada order, bukan pada saldo. `get_credit_balance` dihitung tanpa lock.
**Fakta:** Dua order dari user yang sama secara bersamaan bisa membaca saldo yang sama → keduanya mendebit → saldo negatif.
**Severity:** MEDIUM — race window sempit tetapi dampak finansial nyata jika terjadi.

### BUG-07 — MEDIUM: get_credit_balance Tanpa Guard Ownership

**File:** `20260930100003_credit_ledger.sql:55-60,115-116`
**Kondisi:** `get_credit_balance(_user_id uuid)` SECURITY DEFINER, GRANT TO authenticated. Tidak ada cek apakah pemanggil = `_user_id` atau staff.
**Fakta:** Siapapun yang login bisa memanggil RPC ini dengan UUID user lain dan melihat saldo kredit mereka.
**Dampak:** Kebocoran data finansial buyer (IDOR).
**Catatan:** `get_store_balance` sudah diperbaiki di `20260930100019`. `get_credit_balance` belum.

### BUG-08 — MEDIUM: cancel_own_order dan job_expire_orders Tidak Kembalikan Kredit

**File:** `cancel_own_order:236-258`, `job_expire_orders:37-68`
**Kondisi:** Keduanya membatalkan order tetapi tidak memeriksa `credit_used`.
**Fakta:** Jika buyer sudah apply saldo lalu membatalkan sebelum bayar sisa, saldo sudah didebit di credit_ledger tetapi tidak di-reversal.
**Dampak:** Buyer kehilangan saldo pada pembatalan order.
**Severity:** MEDIUM — terjadi hanya jika buyer apply credit lalu batal/expire.

### BUG-09 — MEDIUM: review_refund Reject Selalu Set Order completed

**File:** `20260930100000_fix_refund_actor_type.sql:52`
**Kondisi:** `UPDATE orders SET status = 'completed' WHERE id = r.order_id AND status = 'refund_requested'`
**Fakta:** Jika order sudah `completed` (dari pembayaran) lalu buyer request refund (status berubah ke `refund_requested`), reject mengembalikan ke `completed` — ini benar. Tetapi payment status masih `refund_requested` (tidak direset).
**Dampak:** Payment status inkonsisten setelah reject. Audit melihat payment "refund_requested" pada order "completed".
**Severity:** MEDIUM — data inconsistency, bukan financial loss langsung.

### INFO-01 — Download Setelah Refund Request

**File:** `consume_download:310-312`, `request_refund:282`
**Kondisi:** `request_refund` hanya mengubah order status ke `refund_requested`; tidak merevoke entitlement. Entitlement di-revoke hanya saat `process_refund` (setelah admin approve dan proses).
**Fakta:** Buyer bisa terus download antara request dan process refund. Download count bertambah.
**Implikasi:** Ini bukan bug per se (admin bisa melihat download count saat review), tetapi perlu keputusan bisnis apakah akses harus diblokir sejak request atau baru saat completed.

### INFO-02 — Payout/Hold/Dispute Belum Ada Workflow

**File:** Seller ledger `source_type IN ('sale','refund','adjustment','reversal','payout')` — label `payout` ada, tetapi:
  - Tidak ada fungsi `create_payout`, `process_payout`, atau sejenisnya.
  - Tidak ada tabel `payouts` atau `payout_requests`.
  - Tidak ada workflow dispute/freeze/resolution.
  - Seller UI (`seller.keuangan.tsx:63-64`) sudah menampilkan bahwa penarikan belum tersedia.

**Status:** `OWNER_DECISION_REQUIRED` (O-03, O-04).

---

## 4. Riset Sumber Resmi

### 4.1 Stripe Connect — Separate Charges and Transfers

**Sumber:** https://docs.stripe.com/connect/separate-charges-and-transfers

Fakta yang relevan untuk desain Ebrystore:

- **Charge pada platform, transfer ke seller terpisah.** Platform menanggung Stripe fees, refund, chargeback.
- **Refund charge TIDAK otomatis membalik transfer.** Platform harus membuat transfer reversal terpisah.
- **Transfer reversal** bisa full/partial, subject to seller available balance.
- **Failed transfer tidak auto-retry.** Platform harus handle.
- **Async payment failure tidak auto-reverse transfer.** Reconciliation tanggung jawab platform.
- Indonesia (`ID`) **tidak ada** di daftar supported countries untuk fitur ini (per dokumen yang diambil).

### 4.2 Stripe Connect — Manual Payouts

**Sumber:** https://docs.stripe.com/connect/manual-payouts

- **Manual schedule menahan dana** sampai instruksi payout.
- **Maximum holding period** varies: Thailand 10 hari, US 2 tahun, negara lain 90 hari. Ini constraint provider, bukan kebijakan Ebrystore.
- Stripe **secara eksplisit menolak label "escrow"** (dikutip di atas).

### 4.3 Dispute Evidence untuk Produk Digital

**Sumber:** https://docs.stripe.com/disputes/categories

Bukti yang diperlukan untuk dispute produk digital:
- IP address saat pembelian
- Nama dan email customer
- **Access/activity logs** yang membuktikan customer mengakses/download produk setelah pembayaran
- Kebijakan refund dan kapan disclosed

**Relevansi Ebrystore:** Download log (`download_logs`) sudah merekam IP, user agent, timestamp. Tetapi log ditulis **sebelum** signed URL dibuat — ini membuktikan intent, bukan successful receipt. Perlu dipertimbangkan untuk dispute evidence.

### 4.4 Sumber Lokal yang Gagal Diverifikasi

| URL | Status |
|---|---|
| Xendit XenPlatform docs | Connect timeout |
| Bank Indonesia PBI_230621 | ECONNRESET |
| Midtrans Iris docs | HTTP 404 |

Sumber ini **tidak dikutip** karena tidak berhasil diambil. Jangan mengasumsikan konten mereka.

---

## 5. Rancangan Perbaikan

### 5.1 Prinsip

1. **Additive migration.** Tidak mengubah/menghapus migrasi lama.
2. **Evidence-before-claim.** Setiap perubahan merujuk BUG-XX di atas.
3. **Tidak mengarang kebijakan.** Fee = 0 (O-01), payout/hold menunggu Owner (O-03/O-04).
4. **Preserve entitlement buyer lama.** Tidak merevoke/mengubah data historis.
5. **Server-authoritative.** Semua perbaikan di SQL/server function, bukan UI.

### 5.2 Perbaikan yang Aman Dilakukan (Tidak Butuh Keputusan Owner)

| Fix | Target BUG | Perubahan |
|---|---|---|
| F-01 | BUG-01 | **Perbaiki trigger kredit seller.** Ubah kondisi trigger dari `NEW.status = 'paid'` menjadi `NEW.status IN ('paid','completed')`. Atau: tambahkan `PERFORM credit_seller_earnings(NEW.id)` langsung di `verify_manual_payment` dan `settle_gateway_payment` (opsi lebih eksplisit). |
| F-02 | BUG-02 | **Perbaiki idempotency key.** Selaraskan: lookup dan insert menggunakan key yang sama. Opsi A: lookup per-store (`sale:<order>:<store>`). Opsi B: insert tanpa store suffix (sesuai lookup `sale:<order>`), tetapi ini bermasalah untuk multi-store future. **Pilih Opsi A.** |
| F-03 | BUG-03 | **Tambah debit seller saat refund.** Di `process_refund`, setelah `credit_refund_to_balance`, INSERT ke `seller_ledger` (direction='debit', source_type='refund') per store yang terlibat di order. Idempotency key: `refund:<refund_id>:<store_id>`. |
| F-04 | BUG-07 | **Tambah guard pada get_credit_balance.** Cek `_user_id = auth.uid() OR has_permission(auth.uid(), 'refunds.view')`. Sama seperti pola yang sudah diterapkan di `get_store_balance`. |
| F-05 | BUG-08 | **Reversal kredit pada cancel/expire.** Jika `credit_used > 0`, INSERT ke `credit_ledger` (direction='credit', source_type='reversal', idempotency_key='cancel:<order_id>'). |
| F-06 | BUG-09 | **Reset payment status saat reject refund.** Kembalikan payment status dari `refund_requested` ke `paid`. |

### 5.3 Perbaikan yang Butuh Keputusan Owner

| Fix | Target BUG | Keputusan yang Dibutuhkan |
|---|---|---|
| F-07 | BUG-04, BUG-05 | **Refund mixed-credit order.** Berapa yang dikembalikan? Opsi A: kembalikan full (tunai + saldo). Opsi B: kembalikan tunai saja, saldo sudah terpakai. Opsi C: kembalikan sesuai proporsi. → `OWNER_DECISION_REQUIRED` |
| F-08 | BUG-06 | **Lock saldo saat checkout.** Apakah concurrent checkout harus ditolak (safe) atau boleh race (performance)? → Rekomendasi: advisory lock per user, tetapi Owner perlu tahu tradeoff. |
| F-09 | INFO-01 | **Akses download saat refund pending.** Blokir sejak request, atau baru saat approved/completed? → `OWNER_DECISION_REQUIRED` |
| F-10 | INFO-02 | **Payout workflow.** Menunggu O-03, O-04, O-05. |

### 5.4 State Machine yang Diusulkan (Setelah Perbaikan)

```
                    ┌──────────────────────────────────┐
                    │          PAYMENT FLOW             │
                    │                                   │
[awaiting_payment]──┤  verify_manual / settle_gateway   │
                    │         ↓                         │
                    │  payment.status = 'paid'          │
                    │  order.status = 'completed'       │
                    │  entitlement created              │
                    │  file/code allocated              │
                    │  ★ seller ledger CREDITED (F-01)  │
                    └──────────────────────────────────┘
                                 │
                    ┌────────────┴──────────────┐
                    ▼                           ▼
            [buyer downloads]          [refund_requested]
                                               │
                                      [refund_processing]
                                               │
                                         [refunded]
                                      ★ buyer credit_ledger CREDITED
                                      ★ seller ledger DEBITED (F-03)
                                      ★ entitlements REVOKED
                                      ★ payment status CORRECT (F-05 context)

                    ┌──────────────────────────────────┐
                    │        CANCEL / EXPIRE            │
                    │                                   │
[awaiting_payment]──┤  cancel_own_order / job_expire    │
                    │  ★ credit_used REVERSED (F-05)   │
                    │  order.status = 'cancelled'       │
                    └──────────────────────────────────┘
```

### 5.5 Invariant Finansial (Harus Selalu Benar)

```
INV-01: SUM(seller_ledger credits) - SUM(seller_ledger debits) = seller balance
INV-02: Setiap order 'completed' dengan store_id HARUS punya entri seller_ledger credit
INV-03: Setiap refund 'completed' pada order dengan store_id HARUS punya entri seller_ledger debit
INV-04: credit_used pada cancelled order HARUS punya reversal di credit_ledger
INV-05: SUM(credit_ledger credits) - SUM(credit_ledger debits) >= 0 (buyer saldo tidak negatif)
INV-06: Refund amount (tunai) + refund amount (saldo) = total uang yang dikembalikan ke buyer
INV-07: get_credit_balance() hanya bisa dipanggil untuk diri sendiri atau oleh staff
```

---

## 6. Urutan Implementasi (MGRCAO V3 Compliant)

Sesuai alur MGRCAO: baca → bukti → migrasi aditif → server function → test → lapor.

### Slice A: Perbaikan Kritis (Tanpa Keputusan Owner)

**Migrasi:** `20261001100001_fix_seller_credit_and_refund.sql`

Isi:
1. **F-01:** Perbaiki trigger `trg_credit_seller_on_paid` — juga terpicu pada `completed`.
2. **F-02:** Perbaiki `credit_seller_earnings` — lookup key = insert key = `sale:<order>:<store>`.
3. **F-03:** Perbaiki `process_refund` — tambah debit seller_ledger.
4. **F-04:** Perbaiki `get_credit_balance` — tambah guard ownership.
5. **F-05:** Perbaiki `cancel_own_order` dan `job_expire_orders` — reversal credit_used.
6. **F-06:** Perbaiki `review_refund` reject — reset payment status.

**Test wajib:**
- Positif: pembayaran → seller ledger terkredit.
- Positif: refund → seller ledger terdebit.
- Positif: cancel order dengan credit_used → saldo buyer dikembalikan.
- Negatif: panggil get_credit_balance dengan UUID user lain → FORBIDDEN.
- Idempotensi: credit_seller_earnings dipanggil dua kali → `already_credited`, bukan exception.
- Invariant INV-01 sampai INV-07 dicek setelah setiap skenario.

### Slice B: Keputusan Owner (BLOCKED)

Menunggu jawaban O-01, O-03, O-04, O-05, O-10 sebelum:
- Payout workflow
- Mixed-credit refund allocation
- Platform fee engine
- Regulasi uang elektronik

---

## 7. Apa yang TIDAK Dilakukan (dan Alasannya)

| Tidak dilakukan | Alasan |
|---|---|
| Implementasi payout | O-03, O-04 belum diputuskan |
| Implementasi dispute/freeze | Fase 06 (Trust & Security), bukan fase saat ini |
| Menentukan commission rate | O-01 belum diputuskan; fee = 0 |
| Mengubah order status flow menjadi paid→completed terpisah | Perubahan besar, perlu desain state machine marketplace penuh |
| Mengklaim "escrow" di UI atau docs | M-07 melarang tanpa dasar legal |
| Menerapkan regulasi BI/OJK | O-05 belum diputuskan; konsultasi legal dulu |
| Mengubah harga/total di frontend | Server-authoritative (M-08) |
| Backfill seller ledger untuk transaksi lama | Membutuhkan reconciliation script khusus, bukan migrasi aditif standar |

---

## 8. Referensi

| # | Sumber | URL | Status |
|---|---|---|---|
| 1 | Stripe Separate Charges & Transfers | https://docs.stripe.com/connect/separate-charges-and-transfers | ✅ Diverifikasi |
| 2 | Stripe Manual Payouts | https://docs.stripe.com/connect/manual-payouts | ✅ Diverifikasi |
| 3 | Stripe Dispute Categories | https://docs.stripe.com/disputes/categories | ✅ Diverifikasi |
| 4 | MGRCAO V3 Framework | `docs/marketplace/00-pemahaman-paket-mgrcao-v3.md` | ✅ Lokal |
| 5 | Decision Register | `docs/marketplace/02-decision-register.md` | ✅ Lokal |
| 6 | Xendit XenPlatform | https://docs.xendit.co/xenplatform | ❌ Timeout |
| 7 | Bank Indonesia PBI | https://www.bi.go.id/id/publikasi/peraturan/Pages/PBI_230621.aspx | ❌ ECONNRESET |
| 8 | Midtrans Iris | https://docs.midtrans.com/docs/iris | ❌ 404 |

---

*Dokumen ini ditulis sebagai prasyarat implementasi sesuai MGRCAO V3: baca → bukti → rancang → implementasi. Implementasi dimulai setelah dokumen ini di-review.*
