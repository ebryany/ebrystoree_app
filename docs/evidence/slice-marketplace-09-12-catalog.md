# Laporan Slice — Marketplace 09–12: Katalog Seller, Moderasi & Storefront

Tanggal: 2026-09-30 · Prompt: MGRCAO V3 #09, #10, #11–12 · Status: **VERIFIED (lokal)**
Lingkungan: **Supabase baru `wcxaheqnnsbhifpgiedk` SAJA — TIDAK production.**

---

## 1. Current Evidence (sebelum)

| Objek | Temuan | Bukti |
|---|---|---|
| Kepemilikan produk | `digital_products` **tanpa** `store_id` | migrasi |
| Moderasi | **TIDAK ADA** — seller tak ada, semua produk admin | policy `products_write_admin` |
| Storefront publik | **TIDAK ADA** | grep route = kosong |
| Dashboard seller | **TIDAK ADA** | grep route = kosong |
| Policy produk | admin-only write; public read `published` | `20260728115920:206-211` |

**Klasifikasi:** `NOT_IMPLEMENTED`.

---

## 2. Problem Solved

1. Produk digital **punya pemilik** (`store_id`); produk legacy → **platform store**.
2. Seller hanya mengelola produk **miliknya**; **wajib moderasi** sebelum publish.
3. Ada **storefront publik** (`/toko/$slug`) dan **dashboard seller** (`/seller`).

---

## 3. Files Changed

| File | Isi |
|---|---|
| `supabase/migrations/20260930100013_catalog_ownership_moderation.sql` | `store_id`, moderasi, trigger, RLS, RPC |
| `src/lib/seller.functions.ts` | **BARU** — 8 server fn seller |
| `src/lib/rate-limit.server.ts` | +2 bucket (seller.apply, seller.product) |
| `src/routes/toko.$slug.tsx` | **BARU** — storefront publik |
| `src/routes/_authenticated/seller.tsx` | **BARU** — layout + form pendaftaran |
| `src/routes/_authenticated/seller.produk.tsx` | **BARU** — daftar produk |
| `src/routes/_authenticated/seller.produk.$id.tsx` | **BARU** — kelola produk |
| `src/routes/_authenticated/seller.produk.baru.tsx` | **BARU** — produk baru |
| `src/lib/__tests__/regression-fase0.test.ts` | +6 test regresi katalog |

---

## 4. Database/Domain Changes

### Kolom baru pada `digital_products`
| Kolom | Keterangan |
|---|---|
| `store_id` | Pemilik (FK ke `stores`, ON DELETE RESTRICT) |
| `moderation_status` | `pending` / `approved` / `rejected` (default `approved` untuk legacy) |
| `moderation_note`, `reviewed_by`, `reviewed_at` | Jejak moderasi |

**Backfill:** produk lama → platform store (`Ebrystore Official`), moderasi `approved`.

### Store platform
- `stores.owner_id` dilonggarkan (nullable), + `is_platform boolean`.
- Unique owner hanya untuk non-platform.
- Satu store platform: `Ebrystore Official` (slug `ebrystore-official`).

### Trigger moderasi
`enforce_product_moderation` — **memblokir seller publish langsung**: bila `status='published'` tapi moderasi ≠ approved dan bukan admin → dipaksa `draft` + `pending`.

### RPC
| Fungsi | Peran |
|---|---|
| `submit_product_for_review(product_id)` | Seller ajukan produk ke moderasi |
| `review_product(product_id, decision, reason)` | Admin approve/reject + publish |

---

## 5. Authorization Impact

- **RLS produk baru:** `products_select_seller_own`, `products_write_seller_own`, `products_update_seller_own` — scoped ke `my_store_id()`.
- **RLS store publik:** `stores_select_public` — anon boleh lihat store `active` (storefront).
- `submit_product_for_review` / `review_product`: SECURITY DEFINER, REVOKE dari anon.
- Rate limit: `seller.apply` (3/jam), `seller.product` (30/5 menit).

---

## 6. Financial/Data Integrity Impact

Tidak ada transaksi uang. Invariant: produk legacy **tidak hilang** (backfill ke platform store, moderasi approved).

---

## 7. UI/UX Impact

| Halaman | Isi |
|---|---|
| `/seller` | Dashboard seller: header toko + status + aksi; **form pendaftaran** bila belum punya toko |
| `/seller/produk` | Daftar produk + status moderasi |
| `/seller/produk/baru` | Form produk baru |
| `/seller/produk/$id` | Kelola produk (edit, ajukan moderasi, hapus) |
| `/toko/$slug` | **Storefront publik** — header toko + grid produk aktif |

States: loading, error, empty semua tersedia. Target sentuh ≥44px, tanpa overflow.

---

## 8. Tests Executed (bukti nyata)

Lingkungan: Supabase `wcxaheqnnsbhifpgiedk`.

### API / DB (10 test)
| # | Test | Hasil |
|---|---|---|
| 1 | Seller buat produk | ✅ |
| 2 | **Seller coba publish langsung** | dipaksa `draft`+`pending` ✅ |
| 3 | Admin moderasi approve | `approved` ✅ |
| 4 | Produk tayang | `published`+`approved` ✅ |
| 5 | Storefront publik | toko + produk terlihat ✅ |
| 6 | Seller 2 lihat produk published seller 1 | terlihat (memang publik) ✅ |
| 7 | Seller 2 update produk seller 1 | **gagal** (nama tidak berubah) ✅ |
| 8 | **Seller 2 lihat DRAFT seller 1** | `[]` **kosong** ✅ |
| 9 | Seller 2 lihat semua draft | `[]` kosong ✅ |
| 10 | Guest lihat draft | `[]` kosong ✅ |

### UI (browser, mobile + desktop)
| Halaman | Overflow | Target <44px |
|---|---|---|
| `/seller` | 0 | 0 |
| `/seller/produk` | 0 | 0 |
| `/seller/produk/baru` | 0 | 0 |
| `/toko/demo-store` | 0 | 0 |

### Pipeline
```
lint  : 0 error
tests : 33 passed (6 test katalog baru)
```

### Pembersihan
Semua data tes (produk, task, notif, role, store, user) dihapus. Platform store tetap.

---

## 9. Backward Compatibility

- Kolom baru: `store_id` nullable, `moderation_status` default `approved` → **produk lama tidak rusak**.
- Backfill aman (produk lama → platform store).
- Policy lama (`products_select_public`, admin) dipertahankan.
- Migrasi aditif.
- **Rollback:** drop kolom/policy/trigger/RPC; produk tetap ada.

---

## 10. Remaining Gaps

| Item | Status |
|---|---|
| Kepemilikan katalog + moderasi | **VERIFIED** (lokal) |
| Storefront + dashboard seller | **VERIFIED** (lokal) |
| Upload file produk oleh seller | `NOT_IMPLEMENTED` (Prompt 14) |
| Inventory per seller | `NOT_IMPLEMENTED` (Prompt 15) |
| Search/filter lintas seller | `NOT_IMPLEMENTED` (Prompt 16) |
| Checkout seller-aware (snapshot seller) | `NOT_IMPLEMENTED` (Prompt 18–19) |
| Kriteria moderasi (O-07) | `OWNER_DECISION_REQUIRED` |
| Deploy production | **DILARANG** sampai persetujuan |

---

## 11. Catatan Penting

1. **Hanya di Supabase baru.** Production tidak disentuh.
2. **Moderasi bekerja** — seller tidak bisa publish langsung (dibuktikan test 2).
3. **Isolasi terbukti** — draft seller lain tidak terlihat (test 8–10).
4. **Produk published memang publik** — memang tujuan katalog; yang dilindungi adalah draft/pending.
5. Checkout belum seller-aware → pembelian produk seller belum tercatat ke seller (Prompt 18–19).
