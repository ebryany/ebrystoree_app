# 00 — Rebaseline Produk: Single-Vendor → Marketplace

**Status:** DRAFT (menunggu persetujuan Owner) · Tanggal: 2026-09-30
**Prompt:** MGRCAO V3 — Prompt 01 (Foundation & Rebaseline)
**Sifat:** DOKUMEN. Tidak ada kode aplikasi berubah dalam slice ini.

---

## 1. Problem addressed

Ebrystore dibangun dan didokumentasikan sebagai **toko digital single-vendor**. Dokumen produk (`docs/00-product/product-brief.md`) menempatkan multi-vendor sebagai *non-scope*. Owner kini memutuskan Ebrystore **berevolusi menjadi marketplace multi-vendor** tempat orang lain dapat berjualan.

Dokumen ini **menggantikan asumsi single-vendor** secara resmi dan menetapkan arah, batas, serta risiko — **sebelum** kode disentuh.

---

## 2. Current Evidence (diverifikasi dari kode/DB, 2026-09-30)

| Aspek | Nilai | Bukti |
|---|---|---|
| Tabel `public` | **42** | `grep CREATE TABLE` atas 51 migrasi |
| Migrasi | **51** | `supabase/migrations/*.sql` |
| Server function | **137** deklarasi | `grep createServerFn` |
| Route file | **70** | `src/routes/**` (di luar generated) |
| Role | customer, operator, support, finance, admin, super_admin | `CREATE TYPE app_role` (`20260728115920:11`) |
| **Role `seller`** | **TIDAK ADA** | enum di atas |
| Kepemilikan produk | **TIDAK ADA** (`digital_products` tanpa `seller_id`/`user_id`) | grep migrasi = kosong |
| Kepemilikan order | **TIDAK ADA** (`orders` tanpa seller/store) | grep migrasi = kosong |
| Delivery mode | `shared`, `unique`, `code` | `20260807132122`, `20260917020442` |
| Entitlement digital | Ada (`digital_entitlements`, `download_logs`) | migrasi |
| Review terverifikasi | Ada (`product_reviews`, cek pembelian) | `20260810104940` |
| Realtime | Aktif (16 tabel) | `ALTER PUBLICATION` |
| Scheduler | **Aktif** (3 job, baru diperbaiki) | `20260930100006` |
| Rate limiting | **Ada** (baru) | `20260930100009` |
| Store credit | **Ada** (baru) | `20260930100003` |
| Pembayaran | Manual (DANA) + QRIS (SumoPod) | `sumopod.server.ts`, webhook |

**Status evidence (MGRCAO):**

| Domain | Status |
|---|---|
| Katalog produk/layanan | `VERIFIED` |
| Checkout & order engine | `VERIFIED` |
| Payment (manual + gateway) | `VERIFIED` |
| Digital delivery | `VERIFIED` (lokal) |
| Fulfillment jasa (operator) | `VERIFIED` |
| Refund | `VERIFIED` (lokal, baru diperbaiki) |
| Store credit | `VERIFIED` (lokal) |
| Scheduler | `VERIFIED` (lokal) |
| Rate limiting | `VERIFIED` (lokal) |
| Test pipeline | `VERIFIED` (lokal) |
| **Seller/store domain** | `NOT_IMPLEMENTED` |
| **Ownership produk/order** | `NOT_IMPLEMENTED` |
| **Ledger earnings seller** | `NOT_IMPLEMENTED` |
| **Payout** | `NOT_IMPLEMENTED` |
| **Moderasi produk** | `NOT_IMPLEMENTED` |
| **Dispute/freeze** | `NOT_IMPLEMENTED` |

---

## 3. Mengapa "evolusi", bukan "rewrite"

Multi-vendor **tidak memerlukan pembongkaran** karena:

1. **Fondasi commerce sudah matang** — order, payment, invoice, refund, entitlement, audit, task semuanya ada dan **teruji jalan**.
2. **Delivery digital sudah multi-mode** (`shared`/`unique`/`code`) — marketplace tidak perlu merancang pengiriman dari nol.
3. **Review sudah cek pembelian** — tinggal dipakai per-seller.
4. **Realtime, scheduler, rate limit** sudah aktif.
5. **RLS + server authorization** sudah jadi pola di seluruh aplikasi.
6. **Store credit ledger** (baru) menjadi **preseden** untuk seller earnings ledger.

Yang **belum ada** adalah **kepemilikan** (siapa punya apa) dan **aktor seller**. Ini **penambahan**, bukan penggantian.

---

## 4. Keputusan Domain: KEEP / EXTEND / REPLACE / DEFER

| Domain | Keputusan | Alasan |
|---|---|---|
| Auth & RBAC | **EXTEND** | Tambah role `seller` + permission + RLS scoped; jangan ganti sistem yang ada |
| Katalog (products/services) | **EXTEND** | Tambah `seller_id` (nullable → backfill → wajib) |
| Order & payment | **KEEP + EXTEND** | Tambah snapshot seller + ownership per baris |
| Digital delivery | **KEEP** | `shared`/`unique`/`code` dipakai ulang |
| Invoice | **KEEP** | Tidak berubah |
| Refund | **KEEP + EXTEND** | Tambah alokasi per-seller (produk digital single-seller/order menyederhanakan) |
| Store credit | **KEEP** | Jadi preseden ledger; seller earnings = ledger terpisah |
| Review | **EXTEND** | Tambah reputasi seller |
| Fulfillment jasa | **KEEP** | Boundary terpisah; tidak jadi template seller |
| Services akademik | **KEEP (terisolasi)** | Bukan template marketplace; jangan diubah |
| PO custom | **KEEP** | Fitur platform; tidak masuk scope seller awal |
| Notifikasi | **EXTEND** | Tambah event marketplace |
| Audit & task | **KEEP** | Dipakai apa adanya |
| Realtime / scheduler / rate limit | **KEEP** | Aset baru; dipakai ulang |
| **Seller identity/store** | **NEW** | Domain inti marketplace |
| **Moderasi produk** | **NEW** | Seller tidak boleh publish langsung |
| **Earnings ledger + payout** | **NEW** | Uang seller |
| **Dispute/freeze** | **NEW** | Sengketa |
| Multi-seller cart | **DEFER** | Non-goal MVP |
| Payout otomatis ke bank | **DEFER** | Butuh provider/legal |
| Multi-store per seller | **DEFER** | Satu toko/seller untuk MVP; model jangan dibuat buntu |
| KYC / escrow | **DEFER** | Butuh dasar legal; jangan klaim |

---

## 5. Marketplace MVP (usulan)

### In-scope MVP
1. Seller dapat mendaftar, diverifikasi admin, punya **satu toko**.
2. Seller mengelola **produk digital** sendiri (CRUD), lewat **moderasi** sebelum publish.
3. Produk punya **kepemilikan** (`seller_id`); produk lama masuk **"platform store"**.
4. Pembeli checkout **satu seller per order** (direct checkout).
5. Order menyimpan **snapshot seller** (identitas saat transaksi).
6. **Platform fee/komisi** dihitung server-side, dicatat di **ledger earnings** append-only.
7. **Hold/available** balance + **payout terkontrol** (manual di MVP).
8. **Refund allocation** per-seller.
9. **Isolasi seller** (RLS + authz): seller tidak melihat data seller lain.
10. Dashboard seller dasar + operasi admin marketplace.

### Non-goal MVP (eksplisit)
- Multi-seller cart / mixed cart.
- Split payment real-time ke seller.
- Payout otomatis ke bank (butuh provider/legal).
- Multi-store per akun.
- Crypto, multi-currency, dynamic ML pricing, affiliate bertingkat, microservices.
- KYC/escrow (butuh dasar legal).
- Integrasi akuntansi enterprise.

---

## 6. Risiko Terbesar

| # | Risiko | Mitigasi |
|---|---|---|
| 1 | Mencampur saldo seller dengan status pembayaran tanpa ledger | Ledger append-only; saldo dihitung, bukan kolom |
| 2 | Menambah `seller_id` tapi lupa RLS/authz | RLS + object authz + test IDOR wajib tiap slice |
| 3 | Mengubah file ownership → entitlement pembeli lama rusak | Migrasi aditif; entitlement lama tetap valid |
| 4 | Seller publish langsung tanpa moderasi | Boundary moderasi wajib |
| 5 | Payout sebelum refund/dispute stabil | Urutan: ledger → refund allocation → dispute → payout |
| 6 | Mengubah total/fee di frontend | Semua uang server-authoritative |
| 7 | Klaim "escrow/KYC" tanpa mekanisme nyata | Tandai `OWNER_DECISION_REQUIRED` |
| 8 | Migrasi destruktif → rusak data | Aditif: nullable → backfill → verify → constrain |
| 9 | Bangun banyak UI sebelum state machine beres | UI mengikuti kontrak server |
| 10 | Regresi pada fitur yang sudah jalan | Pipeline test (sudah ada) dijalankan tiap slice |

---

## 7. Prinsip Arsitektur Marketplace

1. **Direct checkout 1 seller/order** (MVP).
2. Ebrystore existing = **"platform store"** untuk produk legacy setelah backfill.
3. **Ledger earnings append-only**; settlement/hold; payout terkontrol.
4. **Jangan sebut "escrow"** tanpa dasar legal/provider.
5. Semua harga, fee, refund, earnings, payout = **server-authoritative**.
6. Storage aset berbayar **privat**; akses pembeli via entitlement + signed URL.
7. Isolasi seller via **RLS + server authorization**, bukan UI.
8. UI ikut **identitas Ebrystore** — bukan meniru Shopee/Tokopedia, bukan AI-slop.
9. Legacy services/akademik **terisolasi**, tidak jadi template seller.
10. Jangan rewrite histori migrasi; jangan force-push (Lovable).

---

## 8. Urutan Eksekusi (rangkuman)

```
Prompt 01 (dokumen ini) → 02 audit → 03 MVP/non-goal → 04 bounded context → 05 strategi migrasi
   ↓
Seller domain (06–10) → Catalog ownership (11–16) → Commerce (17–19)
   ↓
Finance: fee → ledger → hold → payout → refund allocation (20–24)
   ↓
Trust/Security (25–30) → UI/Ops (31–35) → Realtime/Analytics (36–37) → SEO (38)
   ↓
QA & Launch (39–40)
```

**Aturan:** satu vertical slice per waktu; jangan lanjut payout/production sebelum ledger, RLS, refund allocation, dan migration test `VERIFIED`.

---

## 9. Keputusan Owner yang Dibutuhkan

Lihat `02-decision-register.md` (Prompt 01 deliverable).

---

## 10. Acceptance Criteria (Prompt 01)

- [x] Dokumen menjelaskan mengapa multi-vendor = evolusi, bukan rewrite.
- [x] Tidak ada klaim capability/provider yang belum diverifikasi.
- [x] Tidak ada security/financial rule yang hanya di client.
- [x] Tidak ada perubahan kode aplikasi (dokumen saja).
- [x] Setiap domain punya keputusan KEEP/EXTEND/REPLACE/DEFER.
- [x] Status evidence dinyatakan jujur.
