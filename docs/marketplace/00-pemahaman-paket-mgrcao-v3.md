# Pemahaman Paket MGRCAO V3 — Ebrystore Marketplace

Tanggal dipahami: 2026-09-30 · Status: **DIPAHAMI, BELUM DIEKSEKUSI**

Sumber: `Ebrystore_Marketplace_MGRCAO_V3 (1).zip` (44 file: README, AGENTS.md, MANIFEST.json, PROJECT_ANALYSIS.md, 40 prompt).

---

## 1. Maksud Paket

Mengubah Ebrystore dari **toko digital single-vendor** → **marketplace produk digital multi-vendor**, secara **bertahap (additive evolution), bukan rewrite**.

Kunci: **jangan rusak** order, pembayaran, entitlement, dan workflow lama.

---

## 2. Keputusan Owner yang Sudah Ditetapkan

| Topik | Keputusan |
|---|---|
| Arah visual | **Ikuti paket: identitas Ebrystore sendiri, JANGAN meniru Shopee/Tokopedia** |
| Eksekusi | **Pahami dulu, belum dieksekusi** — menunggu arahan lanjut |

---

## 3. Prinsip Arsitektur Utama (dari README)

1. **Direct checkout 1 seller/order** untuk marketplace MVP (tidak ada cart multi-seller).
2. Ebrystore existing menjadi **"platform store"** untuk produk legacy.
3. Seller earnings pakai **internal append-only ledger** + settlement/hold + payout workflow.
4. **Jangan sebut "escrow"** tanpa dasar provider/legal yang benar.
5. Semua harga, fee, refund, earnings, payout = **server-authoritative**.
6. Storage aset berbayar **privat**; akses pembeli via entitlement + signed access.
7. Isolasi seller dijaga **RLS + server authorization**, bukan UI.
8. UI ikut **Ebrystore**, bukan meniru Shopee/Tokopedia, bukan pola AI-slop.

---

## 4. Kontrak MGRCAO V3 (wajib di setiap tugas)

```
M — Mindset : problem-first, understand-before-generate, evidence-before-claim
G — Goal    : hasil produk nyata + cara membuktikannya
R — Role    : pakai spesialis yang tepat per slice
C — Context : kondisi nyata (dokumen lama = hipotesis)
A — Action  : baca → nyatakan bukti → ubah → test → lapor
O — Output  : laporan lengkap + status jujur
```

**Alur eksekusi default (A):**
baca kode → nyatakan bukti → identifikasi invariant & risiko → usul perubahan terkecil →
migrasi aditif dulu → server function/RPC + object authz → UI → test positif+negatif →
update docs/evidence → lapor status jujur.

---

## 5. 40 Prompt dalam 10 Fase

| Fase | Prompt | Isi |
|---|---|---|
| 01 Foundation | 01–05 | Rebaseline, audit, MVP scope, bounded context, migrasi |
| 02 Seller Domain | 06–10 | Role/toko, onboarding, verifikasi, storefront, dashboard seller |
| 03 Catalog | 11–16 | Schema multi-vendor, CRUD produk, moderasi, file, inventory, search |
| 04 Commerce | 17–19 | Chat pembeli-penjual, snapshot seller, checkout |
| 05 Finance | 20–24 | Fee/komisi, ledger earnings, hold/available, payout, refund allocation |
| 06 Trust & Security | 25–30 | Dispute/freeze, entitlement per seller, review, fraud, RLS, upload security |
| 07 UI/Ops | 31–35 | Homepage, detail produk, dashboard pembeli/seller, admin |
| 08 Realtime & Analytics | 36–37 | Notifikasi, laporan |
| 09 Growth | 38 | SEO & discovery |
| 10 QA & Launch | 39–40 | Testing, staging, rollback, ops |

---

## 6. Aturan Non-Negosiasi (dari AGENTS.md)

1. **Inspect before editing** — sebut file/route/migrasi/RPC/tabel/policy/test yang tepat.
2. **Evidence-before-claim** — pakai status: `VERIFIED` / `PARTIALLY_VERIFIED` / `SCHEMA_ONLY` / `UI_ONLY` / `NOT_IMPLEMENTED` / `OWNER_DECISION_REQUIRED`.
3. **Jangan fabrikasi** kode, tabel, kredensial, kebijakan, hasil test.
4. **Migrasi aditif** — jangan rewrite histori migrasi / destructive tanpa rollback plan.
5. **Preserve** order/file/entitlement/review/payment lama.
6. **Uang** = server-authoritative, idempoten, teraudit, transaksi aman.
7. **Setiap objek sensitif** butuh object-level authz + RLS.
8. **Anti AI-slop** — tidak ada placeholder, fake data, duplikasi state, dashboard generik, UI pura-pura.
9. **Jaga arah visual Ebrystore** — friendly, fast, simple, trustworthy, mobile-first, ink-teal, low elevation.
10. **Slice baru DONE** jika schema/domain/server/UI/test/evidence konsisten, atau menyatakan apa yang blocked.
11. **Jangan ubah** workflow akademik legacy diam-diam.
12. **Jaga integrasi Lovable** — jangan force-push/rebase/amend histori terpublikasi.

---

## 7. Invariant Marketplace

- Uang integer IDR (`bigint`); definisikan pembulatan eksplisit.
- Harga/discount/fee/earning/refund/payout server-authoritative.
- Order item snapshot: produk, seller/store, harga satuan, fee config, delivery/policy.
- Duplikasi payment/webhook/job tidak boleh double-credit seller / double-deliver inventory.
- Ledger seller append-only; koreksi via reversal/adjustment, bukan edit diam.
- Payout hanya dari available balance terverifikasi.
- Refund/dispute freeze/reverse jumlah seller **tepat sekali**.
- Seller **tidak boleh** akses data seller lain (produk/file/inventory/order/inquiry/earnings/payout/dispute).
- File berbayar privat; akses pembeli berbasis entitlement + signed/time-limited.
- Entitlement pembeli lama tetap valid selama migrasi.
- Suspend seller blokir penjualan baru, **tidak** merusak order historis / akses pembeli.

---

## 8. Kondisi Ebrystore vs Target (dari PROJECT_ANALYSIS.md)

**Sudah ada (fondasi kuat):**
- Commerce: `orders`, `order_items`, `payments`, `invoices`, `refunds`, `order_status_histories`, `notifications`, `audit_logs`, `admin_tasks`
- Delivery digital: `digital_products`, `digital_product_files`, `digital_entitlements`, `download_logs`, `product_stock_codes`; mode `shared/unique/code`
- Review sudah verifikasi pembelian; realtime; scheduled job; fulfillment operator; inquiry; payment gateway/webhook (Sumopod)

**Belum ada (gap marketplace nyata):**
1. Seller identity/store ownership
2. Seller-scoped permissions & RLS
3. Seller onboarding/verification/suspension
4. Ownership produk/file/inventory/inquiry/order
5. Moderasi produk seller
6. Immutable seller snapshot pada transaksi
7. Platform fee/commission engine
8. Append-only seller earnings ledger
9. Hold/available settlement
10. Payout workflow
11. Marketplace refund allocation
12. Dispute/freeze/resolution
13. Seller reputation
14. Seller/admin operational surfaces
15. Reconciliasi, QA, launch controls marketplace

---

## 9. Risiko Terbesar (dari PROJECT_ANALYSIS.md)

- Mencampur saldo seller dengan status pembayaran tanpa ledger.
- Menambah `seller_id` tapi lupa RLS/object authorization.
- Mengubah file ownership → entitlement pembeli lama rusak.
- Seller publish langsung tanpa moderasi.
- Payout dibuat sebelum refund/dispute/settlement stabil.
- Mengubah total/fee di frontend.
- Klaim "escrow/KYC/fraud detection" padahal belum ada.
- Migrasi destruktif → rusak histori Lovable/production.
- Bangun banyak UI sebelum state machine & source of truth beres.

---

## 10. Catatan Konflik dengan Pekerjaan Sebelumnya

| Topik | Permintaan lama | Paket MGRCAO V3 | Keputusan Owner |
|---|---|---|---|
| Arah visual | "seperti Shopee" | "jangan clone Shopee" | **Ikut paket** |
| "Pelanggan/Promo" di sidebar | diminta ala Shopee Seller | dashboard pembeli ≠ penjual | Ikut paket |

---

## 11. Cara Pakai Paket (dari README)

1. Copy `AGENTS.md` ke root repo, **merge** dengan blok Lovable (file paket sudah memuat blok itu).
2. Jalankan prompt **01→05 lebih dulu** (kunci scope, arsitektur, migrasi).
3. Setelah itu per vertical slice — **jangan** lempar 40 prompt sekaligus.
4. Setiap prompt: minta tunjukkan file berubah, migrasi, test, evidence, blocker.
5. **Jangan** lanjut ke payout/production jika ledger, RLS, refund allocation, migration test belum `VERIFIED`.

---

## 12. Status

**DIPAHAMI. Menunggu keputusan Owner untuk mulai eksekusi.**

Langkah paling aman bila mulai: **Prompt 01** (hanya menulis dokumen rebaseline — tidak menyentuh kode).
