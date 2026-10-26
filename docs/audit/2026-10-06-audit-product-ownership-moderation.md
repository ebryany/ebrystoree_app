# Ebrystore Product Ownership & Moderation — Business Logic Audit

Tanggal: 2026-10-06 · Mode: **Audit Only — Read-Only** (uji pakai akun sintetis, sudah dihapus)
Cakupan: `digital_products` · `stores` · RLS · trigger moderasi · checkout · order snapshot

---

## A. Executive Summary

**Ownership dan transaction integrity terbukti kuat. Moderation integrity punya satu lubang besar.**

Tiga prioritas yang diminta, hasilnya:

| Prioritas | Hasil | Bukti |
|---|---|---|
| **1. Ownership integrity** | ✅ **LULUS** | Seller B mencoba PATCH produk Seller A → 204 tanpa perubahan data (RLS memblokir, 0 baris) |
| **2. Publication integrity** | ⚠️ **SEBAGIAN** | Seller tak bisa publish tanpa moderasi (dipaksa draft) ✅. Tapi **produk approved bisa diubah isinya tanpa moderasi ulang** ❌ |
| **3. Transaction integrity** | ✅ **LULUS** | Harga berubah 75.000→200.000 setelah order dibuat; order tetap 75.000 (snapshot utuh) |

**Kontrol yang sudah benar dan terbukti:**

| Kontrol | Bukti uji |
|---|---|
| Isolasi tenant | PATCH lintas seller → 0 baris berubah |
| Publish tanpa moderasi | `status='published'` dipaksa kembali `draft` oleh trigger |
| Ubah `moderation_status` langsung | **HTTP 403** `permission denied for table digital_products` |
| Concurrent moderation | 2 admin approve+reject paralel → 1 sukses, 1 `INVALID_STATE` |
| Price snapshot | `order_items.unit_price` tetap 75.000 setelah produk jadi 200.000 |
| Arsip produk saat order aktif | Order & snapshot tetap utuh |
| Atomicity update invalid | Harga negatif → seluruh update ditolak, nama tidak berubah |
| Anon tidak lihat draft | Hanya `published` + `approved` yang tampil |

**Risiko utama:**
1. **PRODUCT-BL-001 (High)** — Produk `approved` bisa diubah nama/harga/deskripsi oleh seller dan **tetap `published` + `approved`**. Approval berlaku untuk konten yang sudah berbeda.
2. **PRODUCT-BL-002 (High)** — Produk toko `suspended` **masih tampil di katalog publik** (PT-07 gagal).
3. **PRODUCT-BL-003 (Medium)** — Produk bisa diedit saat `pending`; admin bisa menyetujui versi yang berbeda dari yang direview.

---

## B. Product Lifecycle State Transition Matrix

Status yang ada (`digital_products.status`): `draft` · `published` · `archived`
Moderasi (`moderation_status`): `pending` · `approved` · `rejected`

| # | Current state | Action | Actor | Target state | Validation | Result |
|---|---|---|---|---|---|---|
| 1 | — | INSERT produk | Seller (role aktif) | `draft` + `pending` | RLS `store_id = my_store_id()`; trigger paksa `pending` | **Valid** ✅ |
| 2 | `draft/pending` | PATCH `status=published` | Seller | tetap `draft` | trigger `enforce_product_moderation` | **Dipaksa draft** ✅ |
| 3 | `pending` | PATCH `moderation_status=approved` | Seller | — | grant kolom dicabut | **403 ditolak** ✅ |
| 4 | `pending` | PATCH `name/price/...` | Seller | tetap `pending` | grant kolom diizinkan | **Diizinkan** ⚠️ (BL-003) |
| 5 | `pending` | `submit_product_for_review` | Seller | `pending` + `draft` | cek `store_id` = miliknya | **Valid** ✅ |
| 6 | `pending` | `review_product(approve)` | Admin `products.update` | `published` + `approved` | `FOR UPDATE`, status harus `pending` | **Valid** ✅ |
| 7 | `pending` | `review_product(reject)` | Admin | `draft` + `rejected` | idem | **Valid** ✅ |
| 8 | `approved/published` | PATCH `name/price` | Seller | **tetap `published` + `approved`** | tidak ada reset moderasi | **LUBANG** ❌ (BL-001) |
| 9 | `approved` | `review_product` | Admin | — | status ≠ `pending` | **Ditolak** `INVALID_STATE` ✅ |
| 10 | `published` | PATCH `status=archived` | Seller | `archived` | grant `status` ada | **Valid** ✅ |
| 11 | `archived` | `submit_product_for_review` | Seller | — | cek `archived` → exception | **Ditolak** `INVALID_STATE` ✅ |
| 12 | `published` | PATCH (Seller lain) | Seller B | — | RLS `store_id = my_store_id()` | **0 baris** ✅ |
| 13 | `published` | Toko di-suspend | Admin | produk **tetap published** | tidak ada sinkronisasi | **LUBANG** ❌ (BL-002) |

**Transisi yang tidak ada:**
- `rejected → pending` (ajukan ulang produk) — perlu cek apakah ada
- `published → pending` (re-moderasi otomatis setelah edit) — **tidak ada**

---

## C. Business Logic Findings

### PRODUCT-BL-001 — Edit produk approved tidak memicu moderasi ulang

| Field | Isi |
|---|---|
| **Severity** | **High** |
| **Affected module** | `digital_products` RLS + trigger `protect_moderation_fields` |
| **Expected** | Perubahan atribut yang direview (nama, deskripsi, harga, thumbnail) harus mengembalikan produk ke `pending` |
| **Actual** | Seller mengubah nama & harga produk `approved`+`published`; hasilnya tetap `published` + `approved`. Approval "melekat" ke produk, bukan ke versi konten |
| **Evidence** | **Uji langsung**: sebelum `{name:"Produk A (diedit saat pending)", price:200000, status:published, moderation:approved}` → PATCH `{name:"Produk A - nama baru total", price:999000}` → HTTP 204 → sesudah `{name:"Produk A - nama baru total", price:999000, status:published, moderation:approved}`<br>`20261004093000_protect_product_transaction_fields_v2.sql` — trigger hanya memblokir `moderation_status`, tidak me-reset saat field konten berubah |
| **Root cause** | Trigger memproteksi *kolom* moderasi, bukan *versi konten*. Tidak ada pembanding `OLD` vs `NEW` untuk field yang direview |
| **Business impact** | Seller bisa lolos moderasi dengan konten aman, lalu menggantinya dengan konten apa pun (judul menyesatkan, harga ekstrem, deskripsi terlarang) tanpa review ulang. Ini melemahkan seluruh gerbang moderasi |
| **Recommendation** | Di trigger `protect_moderation_fields`, bila `NEW.name/description/short_description/thumbnail_url/price/discount_price` berbeda dari `OLD` dan produk `approved`, set `moderation_status='pending'` + `status='draft'`. Alternatif: paksa lewat `submit_product_for_review` setiap edit |
| **Verification** | **VERIFIED** (uji langsung) |

---

### PRODUCT-BL-002 — Produk toko suspended tetap tampil publik

| Field | Isi |
|---|---|
| **Severity** | **High** |
| **Affected module** | `set_seller_suspended` + katalog publik |
| **Expected** | Toko suspended tidak menampilkan produk yang bisa dibeli |
| **Actual** | Suspend hanya mengubah `stores.status`. Produk tetap `published` dan **masih dikembalikan ke anon** |
| **Evidence** | **Uji PT-07**: suspend toko A → `GET /digital_products?id=eq.<produk>` dengan **anon key** → tetap mengembalikan produk `published`<br>`20260930100011_seller_onboarding.sql:109-133` — tidak ada `UPDATE digital_products`<br>`src/lib/catalog.functions.ts` — hanya `.eq("status","published")`, tanpa join status toko |
| **Root cause** | Dua sumber kebenaran (toko & produk) tanpa sinkronisasi; katalog tidak memfilter status toko |
| **Business impact** | Pembeli melihat produk, klik, lalu gagal di checkout (`STORE_SUSPENDED`). Kepercayaan turun. Toko yang di-suspend karena pelanggaran masih "terlihat berjualan" |
| **Recommendation** | Filter `stores.status='active'` di katalog publik **atau** set produk ke `draft` saat suspend dan pulihkan saat aktif |
| **Verification** | **VERIFIED** (uji langsung) |

---

### PRODUCT-BL-003 — Produk bisa diedit saat menunggu moderasi

| Field | Isi |
|---|---|
| **Severity** | **Medium** |
| **Expected** | Produk `pending` sebaiknya read-only, atau setiap edit mengulang antrean |
| **Actual** | Seller bisa PATCH nama & harga saat `pending`; status tetap `pending` |
| **Evidence** | **Uji PT-03**: PATCH `{name:"Produk A (diedit saat pending)", price:75000}` → HTTP 204 → tetap `draft`+`pending` |
| **Root cause** | Tidak ada pembatasan edit berdasarkan status moderasi |
| **Business impact** | Admin bisa menyetujui versi yang berbeda dari yang ia baca (race antara review dan edit). Risiko moderasi tidak efektif |
| **Recommendation** | Tolak PATCH field konten saat `moderation_status='pending'`, atau tampilkan peringatan "edit akan mengulang antrean" dan reset `reviewed_*` |
| **Verification** | **VERIFIED** (uji langsung) |

---

### PRODUCT-BL-004 — `submit_product_for_review` tidak memeriksa role seller aktif

| Field | Isi |
|---|---|
| **Severity** | **Low** |
| **Expected** | Hanya seller dengan toko aktif yang boleh mengajukan moderasi |
| **Actual** | Fungsi memeriksa `my_store_id()` dan kepemilikan, tetapi **tidak** memeriksa `stores.status`. Seller suspended/pending bisa mengajukan |
| **Evidence** | `20260930100013_catalog_ownership_moderation.sql` — `submit_product_for_review`: cek `v_p.store_id <> v_store`, tidak ada cek status toko |
| **Business impact** | Antrean moderasi bisa dipenuhi produk dari toko yang belum/tidak aktif |
| **Recommendation** | Tambah `IF store.status <> 'active' THEN RAISE EXCEPTION 'STORE_NOT_ACTIVE'` |
| **Verification** | **Partially verified** (kode; belum diuji langsung) |

---

## D. Test Scenario Matrix

| ID | Precondition | Aksi | Expected | Assertion | Status | Bukti |
|---|---|---|---|---|---|---|
| PT-01 | Seller A & B, produk A | B PATCH produk A | Gagal / 0 baris | `name` tetap | **LULUS** ✅ | 204, nama tidak berubah |
| PT-02 | Produk `pending` | Seller PATCH `published` | Tetap `draft` | `status='draft'` | **LULUS** ✅ | dipaksa draft |
| PT-03 | Produk `pending` | Seller PATCH nama/harga | Ditolak atau reset antrean | `moderation` berubah | **GAGAL** ❌ | tetap `pending` |
| PT-04 | Produk `pending` | 2 admin approve+reject paralel | 1 sukses, 1 `INVALID_STATE` | state konsisten | **LULUS** ✅ | approved + INVALID_STATE |
| PT-05 | Order dibuat 75.000 | Harga produk → 200.000 | Order tetap 75.000 | `order_items.unit_price=75000` | **LULUS** ✅ | snapshot utuh |
| PT-06 | Order aktif | Seller arsipkan produk | Order tetap valid | order & item utuh | **LULUS** ✅ | status order tidak berubah |
| PT-07 | Toko suspended | Anon GET produk | Tidak tampil | 0 baris | **GAGAL** ❌ | produk masih tampil |
| PT-08 | Produk approved | 2× PATCH publish paralel | Idempoten | tidak ada duplikasi | **LULUS** ✅ | 204 & 204 |
| PT-09 | Produk valid | PATCH harga negatif + nama | Seluruh update ditolak | nama tidak berubah | **LULUS** ✅ | 400, nama tetap |
| PT-10 | Produk milik seller | PATCH `moderation_status` | Ditolak | 403 | **LULUS** ✅ | permission denied |
| PT-11 | Produk approved | Seller ubah nama/harga | Kembali `pending` | `moderation='pending'` | **GAGAL** ❌ | tetap `approved` |
| PT-12 | Toko suspended | `submit_product_for_review` | Ditolak | exception | **Belum diuji** | — |

---

## E. Remediation Roadmap

### P0 — Integritas moderasi & katalog

| # | Perbaikan | File/modul | Temuan | Risiko regresi | Kriteria terima |
|---|---|---|---|---|---|
| P0-1 | Reset moderasi saat field konten berubah | `protect_moderation_fields` (trigger) | BL-001 | **Sedang**: seller bisa "kehilangan" status published setelah edit kecil. Perlu UX yang menjelaskan | PT-11 lulus: edit produk approved → `pending` |
| P0-2 | Sinkronkan suspend toko → produk | `set_seller_suspended` + `catalog.functions.ts` | BL-002 | Rendah | PT-07 lulus: produk toko suspended tidak tampil ke anon |

### P1 — Konsistensi alur

| # | Perbaikan | Temuan |
|---|---|---|
| P1-1 | Blokir/peringatkan edit saat `pending` | BL-003 |
| P1-2 | Cek `stores.status='active'` di `submit_product_for_review` | BL-004 |
| P1-3 | Uji PT-12 dan tambah regression test untuk PT-01/PT-04/PT-05 | — |

### P2 — Kualitas

| # | Perbaikan |
|---|---|
| P2-1 | Regression test otomatis untuk 10 skenario PT (Vitest + Playwright) |
| P2-2 | Dokumentasikan aturan "edit setelah approve" di decision register |

---

## F. Keputusan Produk yang Diperlukan

1. **Edit produk yang sudah approved:** apakah harus selalu kembali ke antrean moderasi (aman, tapi merepotkan seller), atau hanya field tertentu (nama, harga, thumbnail) yang memicu re-moderasi?
2. **Produk toko suspended:** disembunyikan total, atau tetap tampil dengan label "toko tidak aktif"?
3. **Edit saat pending:** diblokir, atau diizinkan dengan reset antrean?

---

## G. Batasan Audit

- Uji memakai **2 seller + 1 pembeli sintetis**; semuanya sudah dihapus beserta produk, order, payment, dan order_items.
- Tidak ada perubahan kode, skema, RLS, atau data produksi.
- **PT-12 belum diuji** (butuh toko suspended + produk baru).
- **Concurrency** diuji dengan request paralel nyata pada PT-04 dan PT-08; bukan uji beban.
- **Lost update** (dua edit bersamaan pada produk yang sama) belum diuji; perlu uji khusus dengan dua request PATCH simultan.
- Trigger `protect_moderation_fields` dibaca dari migrasi `20261004093000`; tidak ada migrasi lebih baru yang mengubahnya (dicek urutan migrasi).
