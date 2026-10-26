# Audit E2E: Flow Transaksi Produk Digital & Jasa Marketplace

Tanggal: 2026-10-04 · Metode: baca definisi fungsi dari **database live** (sumber kebenaran,
bukan file migrasi yang bisa tertimpa) + uji langsung dalam transaksi `ROLLBACK`.
Status: **AUDIT SELESAI — 1 temuan, sisanya LULUS**

---

## Ringkasan

| Area | Hasil |
|---|---|
| Flow produk digital (buat → bayar → entitlement → terima → dana) | **LULUS** |
| Flow jasa marketplace (buat → bayar → requirements → kirim → terima → dana) | **LULUS** |
| Jalur uang (hold/release, ledger, fee) | **LULUS** |
| Idempotensi & anti-dobel | **LULUS** |
| Authz/RLS (IDOR, self-release, privilege) | **LULUS** |
| Konsistensi data nyata (8 invariant) | 7 LULUS, 1 **data legacy sah** |

**Tidak ada satu pun bug logika bisnis yang ditemukan pada flow berjalan.**
Satu temuan operasional (bagian 6) perlu keputusan Owner.

---

## 1. Flow produk digital — LULUS

Diuji end-to-end di database (`.zcode/audit-e2e-digital.sql`), semua dalam `ROLLBACK`:

| # | Uji | Hasil |
|---|---|---|
| 1 | Buat order | `EBS-20261004-000024`, status `awaiting_payment` |
| 2 | Kunci idempotensi sama | Mengembalikan order **sama**, `duplicate: true` |
| 3 | Pemilik toko beli produknya sendiri | Ditolak `SELF_PURCHASE_DENIED` |
| 4 | Settle pembayaran | `paid`, `stock_missing: 0` |
| 5 | Settle kedua kali | `already_settled: true` (idempoten) |
| 6 | Entitlement terbit | 1 baris |
| 7 | **Dana seller sebelum penerimaan** | **0 baris ledger** (ditahan, benar) |
| 8 | Pembeli konfirmasi penerimaan | `accepted` |
| 9 | Konfirmasi kedua kali | `duplicate: true` |
| 10 | **Dana seller setelah penerimaan** | **1 baris, 1000** (dilepas tepat sekali) |
| 11 | Kredit ulang | `already_credited`, amount 0 (tidak dobel) |
| 12 | Status akhir | `completed` |

**Guard yang terverifikasi ada di `confirm_digital_receipt`:** cek kepemilikan order,
jenis order, status receipt, ada pembayaran lunas, **tidak ada refund aktif**, dan
semua item pengiriman `ready`.

## 2. Flow jasa marketplace — LULUS

Diuji end-to-end (`.zcode/audit-e2e-service.sql`):

| # | Uji | Hasil |
|---|---|---|
| 1 | Quote + buat order jasa | Order dibuat dengan versi kontrak & total dari quote |
| 2 | Settle | `paid` |
| 3 | State setelah bayar | `awaiting_requirements` |
| 4 | **Seller kirim hasil sebelum requirements disetujui** | **Ditolak** `INVALID_STATE` |
| 5 | Seller setujui requirements | `in_progress`, `due_at` dihitung dari `durationDays` |
| 6 | Seller kirim hasil | `delivery_id`, versi 1 |
| 7 | **Dana seller sebelum penerimaan** | **0 baris** (ditahan) |
| 8 | Pembeli terima hasil | `accepted`, kredit **10000** |
| 9 | Terima kedua kali | `already_accepted` |
| 10 | Ledger | 1 baris, 10000 |
| 11 | **Refund setelah penerimaan** | **Ditolak** `SERVICE_POST_ACCEPTANCE_REFUND_UNAVAILABLE` |
| 12 | Status akhir | order `completed`, work_state `accepted` |

**Urutan kerja ditegakkan server-side**: tidak bisa kirim hasil sebelum requirements
disetujui; dana tidak bisa dilepas tanpa penerimaan pembeli.

## 3. Jalur uang — LULUS

- **Hold benar**: 5 order dengan toko & pembayaran lunas tapi tanpa kredit = 2 menunggu
  penerimaan pembeli (`receipt pending`), 1 menunggu penerimaan hasil jasa (`delivered`).
  Dana memang **seharusnya** ditahan. Bukti: query `.zcode/audit-held.sql`.
- **Saldo ledger**: hanya toko `citra` punya saldo = **24000** dari 5 kredit penjualan.
  Tidak ada saldo negatif (INV7 lulus).
- **Fee = 0** konsisten (O-01 belum diputuskan; `platform_fee` semua 0 — sesuai desain).
- **Overpay** diterima (kebijakan wajar); **underpay ditolak** `AMOUNT_MISMATCH`
  (diverifikasi ulang pada payment fresh — lihat bagian 6 catatan).

## 4. Idempotensi & anti-dobel — LULUS

| Uji | Hasil |
|---|---|
| Settle 5× berturut-turut (simulasi webhook retry) | 1 entitlement, 0 kebocoran, status tetap `paid` |
| Konfirmasi penerimaan 3× | 1 baris ledger (tidak dobel) |
| Duplikat `idempotency_key` di `payments` | 0 |
| Duplikat di `seller_ledger` | 0 |
| Duplikat di `credit_ledger` | 0 |
| Duplikat `external_event_id` di `payment_events` | 0 |
| Index unik refund aktif per order | Ada (`idx_refund_active_per_order`) |

Kunci idempotensi konsisten: `sale:<order>:<store>`, `refund:<refund>:<store>`,
`topup:<id>`, `order:<id>`, `cancel/expire:order:<id>`.

## 5. Authz/RLS — LULUS (5 uji negatif)

Semua dijalankan sebagai user nyata dengan `request.jwt.claims` disetel:

| # | Serangan yang dicoba | Hasil |
|---|---|---|
| N1 | Pembeli lain konfirmasi penerimaan order orang | **Ditolak** `NOT_FOUND` |
| N2 | **Seller konfirmasi penerimaan ordernya sendiri** (self-release dana) | **Ditolak** `NOT_FOUND` |
| N3 | Non-staff panggil `process_refund` | **Ditolak** `FORBIDDEN` |
| N4 | Seller lain kirim delivery ke order bukan miliknya | **Ditolak** `INVALID_STATE` |
| N5 | Kredit seller sebelum penerimaan | **Ditolak** `RECEIPT_REQUIRED`, delta 0 |

RLS terverifikasi: `orders` (own/operator/staff), `order_items` (**isolasi per toko**:
`store_id = my_store_id()`), `seller_ledger` (per toko), `entitlements` (per user),
`marketplace_service_deliveries` (pembeli ATAU penjual ATAU staff).

**Tidak ada IDOR. Tidak ada jalur self-release dana.**

## 6. Temuan

### T-01 — Tidak ada auto-release dana (perlu keputusan Owner) — OPERASIONAL

**Fakta:** tidak ada job cron apa pun yang melepas dana otomatis bila pembeli tidak
pernah menekan "terima". Cron yang berjalan: `expire_orders`, `expire_topups`,
`flag_overdue_tasks`, `check_sla_breach`. Tidak ada `auto_accept`.

**Dampak:** dana seller bisa tertahan **selamanya** bila pembeli pasif. Seller tidak
punya cara melepas sendiri (dan itu benar — jangan beri seller kunci pembuka).

**Status:** ini **konsisten dengan keputusan yang terdokumentasi** (O-04: "hold sampai
order `completed`"; O-03 payout masih `OWNER_DECISION_REQUIRED`). Jadi bukan bug,
tapi **gap operasional nyata** yang perlu diputuskan: berapa hari sebelum auto-release?

### T-02 — 2 order tanpa receipt = data legacy sah, BUKAN bug

`EBS-20261002-000008` dan `-000009` berstatus `completed` tanpa baris receipt.
**Terbukti legacy:** keduanya dibuat 03:54 & 05:12, sedangkan fitur receipt mulai
berjalan 12:11 di hari yang sama. Keduanya sudah dikredit dengan benar lewat jalur
legacy (fungsi `credit_seller_earnings` punya cabang `legacy: true` khusus untuk ini).
Semua order digital **setelah** fitur punya receipt (`EBS-...-000011`, `-000014`, `-000021`).

### Catatan metodologi (koreksi diri)

Uji "underpay" pertama saya salah baca: saya menyimpulkan underpay lolos, padahal
payment-nya sudah `paid` lebih dulu sehingga masuk cabang idempoten sebelum cek amount.
Uji ulang pada payment **fresh** membuktikan underpay **ditolak** `AMOUNT_MISMATCH`.
Temuan palsu ini saya buang, bukan dilaporkan sebagai bug.

## 7. Status bukti

| Bagian | Status |
|---|---|
| Flow digital E2E | `VERIFIED` (12 langkah di DB) |
| Flow jasa E2E | `VERIFIED` (12 langkah di DB) |
| Hold/release dana | `VERIFIED` |
| Idempotensi | `VERIFIED` |
| Authz/RLS | `VERIFIED` (5 uji negatif) |
| Invariant data nyata | 7 `VERIFIED`, 1 legacy `VERIFIED` |
| Auto-release dana | `OWNER_DECISION_REQUIRED` (O-03/O-04) |
| Uji bayar sungguhan ke provider | `NOT_TESTED` (env SumoPod tidak ada di lokal) |

## 8. Kesimpulan

Flow transaksi produk digital dan jasa **berjalan sesuai logika bisnis marketplace**:
uang ditahan sampai pembeli menerima, dana dilepas tepat sekali, tidak ada jalur
self-release, tidak ada IDOR, dan semua operasi tahan terhadap retry. Satu-satunya
yang perlu tindakan adalah keputusan kebijakan auto-release (T-01), bukan perbaikan bug.
