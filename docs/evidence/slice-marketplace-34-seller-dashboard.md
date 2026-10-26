# Laporan Slice — Marketplace: Dashboard Seller End-to-End

Tanggal: 2026-09-30 · Prompt: MGRCAO V3 #10, #21, #27, #34 · Status: **VERIFIED (lokal)**
Lingkungan: **Supabase baru `wcxaheqnnsbhifpgiedk` SAJA — TIDAK production.**

---

## 1. Current Evidence (sebelum)

| Objek | Temuan | Bukti |
|---|---|---|
| Halaman `/seller` | Hanya layout + form pendaftaran; tanpa sidebar | `seller.tsx` (19:17) |
| Route sidebar | **TIDAK ADA** `/seller/pesanan`, `/keuangan`, `/performa`, `/pengaturan` | grep route = kosong |
| Komponen sidebar | `seller-sidebar.tsx` ada tapi **belum dipakai** | grep import = kosong |
| Data pesanan seller | RPC belum ada; `orders` tidak terbaca seller | temuan saat verifikasi UI |
| Ulasan toko | Server function belum ada | grep `listStoreReviews` = kosong |

**Klasifikasi:** `UI_ONLY` (kerangka) → naik ke `VERIFIED` (end-to-end).

---

## 2. Problem Solved

1. Dashboard seller punya **5 halaman berfungsi**: Ringkasan, Pesanan, Keuangan, Performa, Pengaturan.
2. Semua angka **data nyata dari DB**, bukan placeholder.
3. Ditemukan & diperbaiki **bug akses nyata**: seller tidak bisa membaca `orders` → join kosong.

---

## 3. Files Changed

| File | Isi |
|---|---|
| `supabase/migrations/20260930100018_seller_order_list.sql` | **BARU** — RPC `list_my_store_orders` (SECURITY DEFINER, kolom aman) |
| `src/lib/seller.functions.ts` | +`listStoreReviews`; `listSellerOrders` dialihkan ke RPC |
| `src/routes/_authenticated/seller.index.tsx` | **BARU** — Ringkasan: 4 KPI + grafik tren 30 hari |
| `src/routes/_authenticated/seller.pesanan.tsx` | **BARU** — daftar pesanan + filter (Semua/Dibayar/Menunggu) |
| `src/routes/_authenticated/seller.keuangan.tsx` | **BARU** — saldo + riwayat mutasi ledger |
| `src/routes/_authenticated/seller.performa.tsx` | **BARU** — rating + ulasan toko |
| `src/routes/_authenticated/seller.pengaturan.tsx` | **BARU** — edit identitas toko |
| `src/routes/_authenticated/seller.tsx` | Wrapper padding halaman (perbaikan overflow mobile) |

---

## 4. Database/Domain Changes

### RPC baru: `list_my_store_orders(_filter text)`
Mengembalikan kolom aman: `item_id, order_id, order_number, order_status, item_name, unit_price, quantity, total, created_at, paid_at`.

**Kenapa RPC, bukan policy RLS pada `orders`:**
RLS tidak bisa membatasi kolom. Policy apa pun yang membuka baris `orders` untuk seller
ikut membocorkan PII pembeli (`user_id`, `customer_note`, `internal_note`).
RPC ini `SECURITY DEFINER`, di-scope ke `my_store_id()`, dan `REVOKE` dari anon.

---

## 5. Authorization Impact

- `list_my_store_orders`: `REVOKE` dari `PUBLIC, anon`; `GRANT` ke `authenticated`.
- Scope dikunci ke `my_store_id()` — seller tidak bisa memilih toko lain.
- Tidak ada policy RLS baru yang membuka `orders`.

---

## 6. Financial/Data Integrity Impact

Tidak ada perubahan skema ledger. Trigger `orders_credit_seller_on_paid` (migrasi 100016) **terbukti bekerja**:
2 order `paid` → 2 kredit @Rp49.000 → saldo Rp98.000.

---

## 7. UI/UX Impact

| Halaman | Isi | Sumber data |
|---|---|---|
| `/seller` | Saldo, total penjualan, produk tayang, rating; grafik area 30 hari | `getSellerSummary` |
| `/seller/pesanan` | Daftar item + nomor order + status + filter | `list_my_store_orders` |
| `/seller/keuangan` | Kartu saldo + riwayat mutasi (+/−) | `listSellerLedger` |
| `/seller/performa` | Rating agregat + daftar ulasan | `listStoreReviews` |
| `/seller/pengaturan` | Form edit nama/deskripsi/logo/WA | `updateMyStore` |

States: loading, error, empty tersedia. Grafik hanya render setelah mount (aman SSR).

---

## 8. Tests Executed (bukti nyata)

### API / DB (8 test)
| # | Test | Hasil |
|---|---|---|
| 1 | RPC `list_my_store_orders(all)` | 2 pesanan, nomor `EBS-…`, status `paid` ✅ |
| 2 | Filter `paid` | 2 pesanan ✅ |
| 3 | Filter `pending` | 0 (benar) ✅ |
| 4 | **Anon akses RPC** | `permission denied` ✅ |
| 5 | **Seller 2 lihat pesanan seller 1** | 0 — isolasi ✅ |
| 6 | **Seller 2 lihat ledger seller 1** | 0 — isolasi ✅ |
| 7 | Trigger kredit saat `paid` | 2 kredit @49.000 ✅ |
| 8 | `store_rating_summary` | `{average: 5.00, total: 1}` ✅ |

### UI (browser, viewport 390×844 + 1280×900)
| Halaman | Overflow X | Target <44px | Data tampil |
|---|---:|---:|---|
| `/seller` | 0 | 0 | Saldo Rp98.000, rating 5(1), grafik ter-render |
| `/seller/pesanan` | 0 | 0 | `EBS-…`, "Pembayaran diterima" |
| `/seller/keuangan` | 0 | 0 | Rp98.000 + 2 mutasi |
| `/seller/performa` | 0 | 0 | Rating 5, 1 ulasan |
| `/seller/pengaturan` | 0 | 0 | Simpan → toast "tersimpan" → DB terverifikasi |
| `/seller/produk` | 0 | 0 | (halaman lama, regresi aman) |

### Pipeline
```
lint  : 0 error (18 warning no-explicit-any, konvensi proyek)
tests : 33 passed
build : sukses
```

### Pembersihan
Semua data uji dihapus: 2 store, 2 user, 2 order, 2 order_item, 2 ledger, 1 ulasan, 2 produk.
Platform store `Ebrystore Official` tetap.

---

## 9. Backward Compatibility

- Migrasi **aditif**: hanya menambah fungsi, tidak mengubah tabel/policy lama.
- `listSellerOrders` di server function berganti sumber (RPC), bentuk respons berubah
  dari nested (`it.orders.status`) ke datar (`it.order_status`) — hanya dipakai halaman baru.
- Halaman `/seller/produk` (lama) tidak disentuh dan tetap lulus verifikasi.
- **Rollback:** drop `list_my_store_orders`; halaman pesanan kembali error (bukan rusak data).

---

## 10. Remaining Gaps

| Item | Status |
|---|---|
| Dashboard seller end-to-end | **VERIFIED** (lokal) |
| Upload file produk | `NOT_IMPLEMENTED` (Prompt 14) |
| Inventory per seller | `NOT_IMPLEMENTED` (Prompt 15) |
| Search lintas seller | `NOT_IMPLEMENTED` (Prompt 16) |
| Payout / penarikan saldo | `NOT_IMPLEMENTED` — tunggu O-01..O-04 |
| Grafik pesanan (bukan hanya pendapatan) | Belum ada |
| Deploy production | **DILARANG** sampai persetujuan |

---

## 11. Catatan Penting

1. **Hanya di Supabase baru.** Production tidak disentuh.
2. **Bug nyata ditemukan lewat verifikasi UI** — bukan lewat test unit. Ini alasan verifikasi
   browser wajib, bukan opsional.
3. **Isolasi terbukti** — seller 2 tidak melihat pesanan/ledger seller 1 (test 5–6).
4. **Seller tidak bisa membaca `orders`** — memang dirancang begitu (PII pembeli);
   akses lewat RPC berkolom aman.
5. Penarikan saldo belum ada; halaman Keuangan menyatakannya eksplisit ke pengguna.
