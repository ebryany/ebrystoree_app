# Ebrystore Comprehensive Business Logic Audit

Tanggal: 2026-10-06 · Mode: **Audit Only — Read-Only** · Tidak ada kode/DB yang diubah
Cakupan: seller lifecycle, katalog, checkout, payment, fulfillment, refund
Metode: inspeksi migrasi/RPC + query read-only ke DB + pembacaan server functions

---

## A. Executive Summary

**Kondisi umum: lebih matang dari yang didokumentasikan.**

Temuan terpenting audit ini bukan kerusakan, melainkan **dokumentasi yang tertinggal dari kode**.
`docs/marketplace/02-decision-register.md` masih mencatat O-01..O-04 sebagai
"belum diputuskan", padahal kode sudah mengambil default aman (fee = 0). Sebaliknya,
beberapa kontrol yang tidak tercatat di dokumen ternyata sudah diimplementasikan dengan benar.

**Yang sudah benar dan terbukti (jangan diubah tanpa alasan):**

| Kontrol | Bukti |
|---|---|
| Idempotensi order | `create_digital_order` memakai `payments.idempotency_key` unik |
| Verifikasi pembayaran | `FOR UPDATE` pada payment + order, cek `amount_claimed` = `expected_amount` |
| Pemakaian saldo | `apply_credit_to_order` memakai advisory lock per-user sebelum baca saldo |
| Alokasi stok unik | `claim_stock_code` memakai `FOR UPDATE SKIP LOCKED` |
| Batas unduhan | `consume_download` `FOR UPDATE` + cek `download_count >= download_limit` |
| Kredit seller | `credit_seller_earnings` idempoten per (order, store) + gate receipt |
| Refund ganda | `idx_refund_active_per_order` unik parsial per order |

**Risiko paling mendesak (3 temuan High):**

1. **Toko suspended tidak menarik produknya dari katalog.** Pembelian diblokir, tetapi
   produk tetap tampil dan bisa diklik pembeli — pengalaman rusak, bukan kerugian dana.
2. **Refund selalu berbentuk saldo, tanpa opsi transfer.** Ini keputusan produk yang
   belum ditetapkan (O-10), bukan bug, tetapi berdampak hukum/keuangan.
3. **`settle_credit_topup` menerima `_paid_amount` lebih besar dari nominal** tanpa
   menolak kelebihan — saldo dikredit sebesar nominal, tetapi tidak ada penanganan selisih.

**Domain yang belum dapat diverifikasi sepenuhnya:**
Dispute resolution dan payout seller **belum ada implementasinya** (nol tabel, nol RPC).
Keduanya bukan "rusak", melainkan "belum dibangun".

---

## B. Business Flow Map

```
┌──────────────┐   apply_as_seller    ┌────────────┐   review_seller    ┌────────────┐
│  customer    │ ───────────────────> │   store    │ ─────────────────> │   active   │
│  (no role)   │                      │  pending   │  (+ role seller)   │            │
└──────────────┘                      └────────────┘                    └─────┬──────┘
                                                                              │
                                    ┌─────────────────────────────────────────┘
                                    v
                        ┌───────────────────────┐
                        │  digital_products     │
                        │  draft → pending mod  │
                        │  → approved/published │
                        └───────────┬───────────┘
                                    │ create_digital_order
                                    v
        ┌───────────────────────────────────────────────────────┐
        │ orders (awaiting_payment)                             │
        │   ├─ credit_used? → apply_credit_to_order (advisory)  │
        │   └─ payments (waiting_payment, idempotency_key)      │
        └───────────────────────┬───────────────────────────────┘
                                │ verify_manual_payment (FOR UPDATE)
                                v
        ┌───────────────────────────────────────────────────────┐
        │ orders.status = paid                                  │
        │   ├─ digital: entitlements + assign_unique_files      │
        │   ├─ service: activate_paid_marketplace_service       │
        │   └─ academic: academic_review → assign operator      │
        └───────────────────────┬───────────────────────────────┘
                                │ buyer accept receipt
                                v
        ┌───────────────────────────────────────────────────────┐
        │ orders.status = completed                             │
        │   └─ credit_seller_earnings (idempoten per store)     │
        └───────────────────────┬───────────────────────────────┘
                                │ request_refund (window 7 hari)
                                v
        ┌───────────────────────────────────────────────────────┐
        │ refunds → review_refund → process_refund              │
        │   ├─ seller_ledger DEBIT (idempoten per refund)       │
        │   ├─ entitlements revoked                             │
        │   └─ credit_refund_to_balance (SELALU saldo)          │
        └───────────────────────────────────────────────────────┘

TIDAK ADA: payout seller · dispute · settlement hold
```

**Titik perpindahan nilai finansial:**

| Dari | Ke | Mekanisme | Idempoten |
|---|---|---|---|
| Customer | Platform | QRIS (SumoPod) / transfer manual | ✅ |
| Platform | Seller | `seller_ledger` credit saat completed | ✅ |
| Platform | Customer | `credit_ledger` credit saat refund | ✅ |
| Customer | Platform | `credit_ledger` debit saat pakai saldo | ✅ |
| Platform | Seller (uang nyata) | **TIDAK ADA** | — |

---

## C. Business Logic Findings Matrix

### BL-001 — Produk toko suspended tetap tampil di katalog publik

| Field | Isi |
|---|---|
| **Domain** | Seller lifecycle → Katalog |
| **Severity** | **High** |
| **Expected** | Toko suspended tidak boleh menampilkan produk yang bisa dibeli |
| **Actual** | `set_seller_suspended` hanya mengubah `stores.status`. Produk tetap `published`. Katalog publik hanya memfilter `status='published'`, tanpa join ke status toko |
| **Root cause** | Suspend dirancang sebagai "blokir transaksi baru", bukan "tarik dari katalog". Dua lapisan (katalog & checkout) punya aturan berbeda |
| **Evidence** | `20260930100011_seller_onboarding.sql:109-133` (tidak ada `UPDATE digital_products`)<br>`src/lib/catalog.functions.ts:138,178,183,209` (hanya `.eq("status","published")`)<br>DB: produk `published` dengan `stores.status='active'` — query tanpa filter toko mengembalikan semua |
| **Business impact** | Pembeli melihat produk, klik, lalu gagal di checkout (`STORE_SUSPENDED`). Kepercayaan turun; tidak ada kerugian dana |
| **Recommendation** | Tambah filter status toko di katalog publik (`stores.status = 'active'`), ATAU ubah `set_seller_suspended` agar ikut menyetel produk ke `draft` dan mengembalikannya saat aktif |
| **Verification** | **VERIFIED** (kode + query DB) |

---

### BL-002 — Refund selalu berbentuk saldo, tanpa opsi pengembalian dana

| Field | Isi |
|---|---|
| **Domain** | Refund / Settlement |
| **Severity** | **High** (kebijakan, bukan bug) |
| **Expected** | Belum ditetapkan. `02-decision-register.md` O-10 mencatat "sumber dana saat refund seller-generated: TUNDA" |
| **Actual** | `process_refund` **selalu** memanggil `credit_refund_to_balance`. Tidak ada parameter metode, tidak ada jalur transfer bank/QRIS |
| **Root cause** | Implementasi mendahului keputusan produk |
| **Evidence** | `20261002130000_digital_seller_funds_release.sql:145` — `v_credit := public.credit_refund_to_balance(r.id);` tanpa kondisi<br>`credit_refund_to_balance` (`20260930100003_credit_ledger.sql`) hanya INSERT ke `credit_ledger` |
| **Business impact** | Customer yang minta uang kembali menerima saldo internal. Secara hukum ini **bukan refund**, melainkan store credit. Berisiko jika customer menuntut pengembalian dana |
| **Recommendation** | Tandai `OWNER_DECISION_REQUIRED`. Jika tetap saldo, ubah label UI dari "refund" menjadi "saldo pengembalian" dan cantumkan di kebijakan refund. Jika harus uang, tambah jalur payout manual |
| **Verification** | **VERIFIED** (kode) |

---

### BL-003 — `settle_credit_topup` menerima pembayaran lebih besar tanpa penanganan selisih

| Field | Isi |
|---|---|
| **Domain** | Payment / Credit |
| **Severity** | **Medium** |
| **Expected** | Nominal dibayar harus sama dengan nominal top-up, atau selisih ditangani eksplisit |
| **Actual** | Hanya cek `_paid_amount < t.amount` (tolak kurang). Kelebihan diterima, tetapi ledger tetap dikredit sebesar `t.amount` — selisih tidak dicatat |
| **Root cause** | Validasi satu arah |
| **Evidence** | `20261004100000_credit_topup.sql:169` — `IF _paid_amount IS NULL OR _paid_amount < t.amount THEN RAISE EXCEPTION 'AMOUNT_MISMATCH';` |
| **Business impact** | Uang customer masuk lebih besar dari saldo yang diberikan, tanpa jejak rekonsiliasi. Tidak menciptakan saldo palsu (aman dari fraud), tetapi menyulitkan audit keuangan |
| **Recommendation** | Ubah menjadi `<>` dan tolak, atau catat selisih ke tabel penyesuaian dengan alasan |
| **Verification** | **VERIFIED** (kode) |

---

### BL-004 — Refund parsial tidak didukung untuk order seller-aware

| Field | Isi |
|---|---|
| **Domain** | Refund |
| **Severity** | **Medium** |
| **Expected** | Project brief: "Refund parsial memerlukan approval admin" |
| **Actual** | `process_refund` **melempar exception** `REFUND_ALLOCATION_REQUIRED` bila `r.amount <> o.total`, atau ada `credit_used > 0`, atau multi-store, atau ada fee ≠ 0 |
| **Root cause** | Alokasi refund per-seller belum dibangun (Prompt 24). Guard sengaja dipasang agar tidak salah hitung |
| **Evidence** | `20261002130000_digital_seller_funds_release.sql:119-123`<br>Komentar kode: *"seller refund processing supports full single-store orders; allocate partial/mixed-credit refunds before widening"* |
| **Business impact** | Refund parsial yang dijanjikan brief **tidak bisa dieksekusi**. Admin hanya bisa menolak atau memproses penuh |
| **Recommendation** | Jangan longgarkan guard sebelum alokasi per-seller ada. Catat sebagai gap, bukan bug |
| **Verification** | **VERIFIED** (kode) — perilaku sesuai guard, tetapi tidak sesuai brief |

---

### BL-005 — Pesan UI seller pending tidak sesuai kenyataan

| Field | Isi |
|---|---|
| **Domain** | Seller lifecycle |
| **Severity** | **Medium** |
| **Expected** | Teks UI harus mencerminkan kemampuan sebenarnya |
| **Actual** | UI: *"Anda dapat menyiapkan produk, tetapi belum tampil sampai toko disetujui."*<br>Kenyataan: role `seller` baru diberikan saat approve, sehingga seller pending **tidak bisa** membuat produk (RLS menolak) |
| **Root cause** | Teks ditulis sebelum `20260930100012_seller_role_on_approval.sql` memindahkan pemberian role ke saat approval |
| **Evidence** | `src/routes/_authenticated/seller.tsx:155`<br>`20260930100012_seller_role_on_approval.sql` (role tidak diberikan di `apply_as_seller`)<br>Uji: INSERT produk sebagai seller pending → `42501 new row violates row-level security policy` |
| **Business impact** | Seller bingung; mencoba menambah produk dan gagal tanpa penjelasan |
| **Recommendation** | Ubah teks menjadi jujur, ATAU berikan role `seller` saat pengajuan dengan policy yang membatasi produk ke `draft` |
| **Verification** | **VERIFIED** (uji langsung, sebelumnya) |

---

### BL-006 — Tidak ada mekanisme payout seller

| Field | Isi |
|---|---|
| **Domain** | Settlement |
| **Severity** | **High** (gap, bukan bug) |
| **Expected** | `M-06`: platform menerima pembayaran, seller dibayar via ledger + payout |
| **Actual** | **Nol tabel payout, nol RPC payout.** `seller_ledger` mencatat saldo, tetapi tidak ada jalur pencairan |
| **Root cause** | Prompt 23 belum dieksekusi; menunggu O-03/O-04 |
| **Evidence** | `grep -rn "payout" supabase/migrations/*.sql` → hanya komentar; tidak ada `CREATE TABLE payout*` atau `FUNCTION *payout*` |
| **Business impact** | Seller tidak bisa mengambil uangnya. Marketplace belum layak produksi |
| **Recommendation** | Blokir onboarding seller publik sampai payout ada, atau nyatakan eksplisit "saldo belum dapat dicairkan" di UI seller |
| **Verification** | **VERIFIED** (kode: tidak ada) |

---

### BL-007 — Tidak ada alur dispute

| Field | Isi |
|---|---|
| **Domain** | Trust & Safety |
| **Severity** | **High** (gap) |
| **Expected** | Prompt 25: dispute, freeze, resolusi |
| **Actual** | Nol tabel, nol RPC. Yang ada hanya `complaint_open` boolean di `marketplace_service_orders` |
| **Root cause** | Belum dibangun |
| **Evidence** | `grep -rn "dispute" supabase/migrations/*.sql` → tidak ada `CREATE TABLE`/`FUNCTION` |
| **Business impact** | Sengketa hanya bisa diselesaikan manual di luar sistem, tanpa jejak |
| **Recommendation** | Minimal: gunakan `refund` + catatan admin sebagai jalur sementara; jangan klaim ada dispute |
| **Verification** | **VERIFIED** (kode: tidak ada) |

---

### BL-008 — Order `completed` dapat kembali ke `refund_requested` tanpa cek entitlement terpakai

| Field | Isi |
|---|---|
| **Domain** | Refund / Fulfillment |
| **Severity** | **Medium** |
| **Expected** | Refund atas produk yang sudah diunduh penuh sebaiknya ditolak atau butuh approval khusus |
| **Actual** | `request_refund` menerima `completed`, hanya membatasi jendela 7 hari. Tidak memeriksa `download_count` |
| **Root cause** | Kebijakan refundability belum ditetapkan |
| **Evidence** | `20261003120000_marketplace_service_finance_dispatch.sql:463` — status yang diizinkan mencakup `'completed'`; tidak ada cek `digital_entitlements.download_count` |
| **Business impact** | Customer bisa mengunduh produk, lalu refund dalam 7 hari. Seller dirugikan (ledger didebit) |
| **Recommendation** | Tambah aturan: refund otomatis ditolak bila `download_count > 0`, atau wajib approval admin dengan alasan |
| **Verification** | **VERIFIED** (kode) |

---

### BL-009 — Refund tidak memulihkan `credit_used`

| Field | Isi |
|---|---|
| **Domain** | Refund / Credit |
| **Severity** | **Medium** |
| **Expected** | Jika order dibayar sebagian dengan saldo, refund harus mengembalikan porsi saldo ke `credit_ledger` |
| **Actual** | Guard `REFUND_ALLOCATION_REQUIRED` menolak order dengan `credit_used > 0` — jadi jalur ini **tertutup**, bukan salah hitung |
| **Root cause** | Belum dibangun |
| **Evidence** | `20261002130000_digital_seller_funds_release.sql:121` — `OR o.credit_used > 0` |
| **Business impact** | Order yang memakai saldo tidak bisa direfund sama sekali |
| **Recommendation** | Catat sebagai gap; jangan buka guard sebelum alokasi saldo ada |
| **Verification** | **VERIFIED** (kode) |

---

### BL-010 — Katalog publik tidak memfilter toko `pending`

| Field | Isi |
|---|---|
| **Domain** | Katalog |
| **Severity** | **Low** |
| **Expected** | Produk dari toko yang belum aktif tidak tayang |
| **Actual** | Sama seperti BL-001, tetapi untuk `pending`. Saat ini produk pending tidak bisa `published` karena moderasi, jadi dampaknya kecil |
| **Evidence** | `src/lib/catalog.functions.ts` — hanya `.eq("status","published")` |
| **Recommendation** | Satu perbaikan yang sama dengan BL-001 mencakup ini |
| **Verification** | **VERIFIED** (kode), dampak **HIPOTESIS** (belum ada data) |

---

## D. Business Rule & Decision Gap Matrix

### D.1 — Bug implementasi terverifikasi
| ID | Ringkas | Severity |
|---|---|---|
| BL-001 | Produk toko suspended tetap di katalog | High |
| BL-003 | Topup terima kelebihan tanpa catat selisih | Medium |
| BL-005 | Teks UI seller pending tidak akurat | Medium |

### D.2 — Aturan bisnis belum diputuskan (`OWNER_DECISION_REQUIRED`)
| ID | Pertanyaan | Dampak saat ini |
|---|---|---|
| O-01 | Persentase komisi platform | `platform_fee = 0` di semua ledger |
| O-02 | Refundability fee | Tidak relevan selama fee 0 |
| O-03/O-04 | Jadwal & hold payout | Payout tidak ada |
| O-10 | Sumber dana refund seller-generated | Semua refund jadi saldo |
| **BARU** | Refund produk yang sudah diunduh | Saat ini diizinkan |
| **BARU** | Metode refund: saldo vs transfer | Saat ini selalu saldo |
| **BARU** | Kebijakan jumlah revisi jasa | Belum ada batas di kode |

### D.3 — Fitur belum dibangun
| Fitur | Bukti |
|---|---|
| Payout seller | nol tabel/RPC |
| Dispute resolution | nol tabel/RPC |
| Alokasi refund per-seller | guard menolak |
| Refund dengan `credit_used` | guard menolak |

### D.4 — Risiko potensial (belum diuji)
| Risiko | Alasan belum diuji |
|---|---|
| Race dua order memakai saldo sama | Sudah ada advisory lock; perlu uji beban |
| Webhook QRIS ganda | Idempoten via `idempotency_key`, belum diuji dengan retry nyata |
| Scheduler vs refund manual bersamaan | Perlu simulasi waktu |

### D.5 — Dokumentasi vs kode
| Dokumen | Kode aktual |
|---|---|
| Decision register: "payout belum diputuskan" | Benar, belum ada |
| Decision register: "fee belum diputuskan" | Benar, fee = 0 |
| Project brief: "refund parsial perlu approval" | **Tidak sesuai** — parsial ditolak total (BL-004) |
| UI: "seller pending dapat menyiapkan produk" | **Tidak sesuai** (BL-005) |

---

## E. Test Scenario Matrix

| ID | Precondition | Aksi | Expected | Assertion | Jenis | Status |
|---|---|---|---|---|---|---|
| T-01 | Toko A `suspended`, produk A `published` | Buka `/produk` | Produk A tidak tampil | `items` tidak memuat id A | Integration | **Belum diuji** |
| T-02 | Toko A `suspended` | `create_digital_order(product A)` | `STORE_SUSPENDED` | error code cocok | DB | **Sudah diuji** (kode) |
| T-03 | Topup 50.000, bayar 60.000 | `settle_credit_topup(…, 60000)` | Ditolak atau selisih dicatat | saldo bertambah tepat 50.000 | DB | **Belum diuji** |
| T-04 | Order total 100.000, sudah bayar | `request_refund(100.000)` → `process_refund` | Saldo bertambah 100.000, seller didebit 100.000 | ledger balance = 0 | DB | **Belum diuji** |
| T-05 | Order parsial 50.000 dari total 100.000 | `process_refund` | `REFUND_ALLOCATION_REQUIRED` | exception | DB | **Sudah diuji** (kode) |
| T-06 | Order `completed`, sudah 5× unduh | `request_refund` | Ditolak (kebijakan baru) | error | DB | **Belum diuji** |
| T-07 | Seller pending | Insert produk | Ditolak RLS | `42501` | DB | **Sudah diuji** |
| T-08 | Dua order paralel, saldo 50.000 | `apply_credit_to_order` bersamaan | Satu berhasil, satu saldo 0 | tidak ada saldo negatif | DB concurrency | **Belum diuji** |
| T-09 | Payment `waiting_verification` | `verify_manual_payment` dua kali | Panggilan kedua `INVALID_STATE` | tidak ada entitas ganda | DB | **Belum diuji** |
| T-10 | Webhook QRIS dikirim ulang | `settle_gateway_payment` 2× | Idempoten | satu ledger entry | DB | **Belum diuji** |

---

## F. Prioritized Remediation Roadmap

### P0 — Sebelum memperluas transaksi marketplace

| # | Perbaikan | Alasan | Risiko regresi | Kriteria terima |
|---|---|---|---|---|
| P0-1 | Filter `stores.status='active'` di katalog publik | BL-001: pembeli melihat produk yang tidak bisa dibeli | Rendah (query tambahan) | Produk toko suspended hilang dari `/produk` dan `/toko/$slug` |
| P0-2 | Putuskan metode refund (saldo vs transfer) | BL-002: berisiko hukum | Tinggi jika diubah tanpa keputusan | Keputusan tertulis + label UI sesuai |
| P0-3 | Blokir/beri peringatan payout belum ada | BL-006: seller tidak bisa cairkan dana | Rendah | UI seller menyatakan eksplisit |

### P1 — Stabilitas operasional

| # | Perbaikan | Alasan |
|---|---|---|
| P1-1 | Ubah teks UI seller pending | BL-005, murah, menghindari kebingungan |
| P1-2 | `settle_credit_topup`: tolak nominal tidak sama | BL-003 |
| P1-3 | Aturan refund untuk produk terunduh | BL-008 |
| P1-4 | Uji concurrency saldo & webhook (T-08..T-10) | Memvalidasi kontrol yang sudah ada |

### P2 — Kualitas

| # | Perbaikan |
|---|---|
| P2-1 | Bangun alokasi refund per-seller (Prompt 24) |
| P2-2 | Bangun dispute (Prompt 25) |
| P2-3 | Bangun payout (Prompt 23) setelah O-03/O-04 |
| P2-4 | Sinkronkan decision register dengan kode aktual |

---

## G. Batasan Audit

- Tidak ada perubahan kode, DB, atau konfigurasi.
- Pengujian DB dilakukan **read-only** (SELECT) dan uji RPC yang tidak mengubah data produksi.
- T-01, T-03, T-04, T-06, T-08..T-10 **belum dieksekusi**; statusnya jujur "belum diuji".
- Dispute dan payout dinyatakan **tidak ada** berdasarkan grep menyeluruh, bukan asumsi.
- Concurrency belum diuji dengan beban nyata; kontrol yang ada dinilai dari kode (`FOR UPDATE`, advisory lock, `SKIP LOCKED`).
- Kebijakan bisnis (fee, hold, refundability) dinilai sebagai keputusan, bukan bug.
