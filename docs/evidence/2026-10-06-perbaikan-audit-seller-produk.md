# Laporan Perbaikan — Temuan Audit Seller & Produk

Tanggal: 2026-10-06 · Status: **SELESAI, terverifikasi**
Lingkungan: Supabase `wcxaheqnnsbhifpgiedk` (lokal/staging) — **production tidak disentuh**

---

## Ringkasan

Tujuh temuan dari tiga audit diperbaiki. Setiap perbaikan diuji ulang di database
dengan akun sintetis, lalu datanya dihapus.

| # | Temuan | Severity | Status |
|---|---|---|---|
| 1 | Suspend toko tidak mencabut role seller | High | ✅ **FIXED** |
| 2 | Produk toko suspended tampil publik | High | ✅ **FIXED** |
| 3 | `rejected` dead-end | High | ✅ **FIXED** |
| 4 | Race `apply_as_seller` → error mentah | Medium | ✅ **FIXED** |
| 5 | Edit produk approved tidak reset moderasi | High | ✅ **FIXED** |
| 6 | Topup terima kelebihan tanpa catat selisih | Medium | ✅ **FIXED** |
| 7 | UI seller pakai sidebar customer + teks salah | High | ✅ **FIXED** |

**Tidak dikerjakan (butuh keputusan produk):** refund saldo vs transfer, payout, dispute.

---

## Perubahan

### Migrasi (4)
| File | Isi |
|---|---|
| `20261006100001_fix_seller_lifecycle.sql` | Trigger sinkronisasi role, `apply_as_seller` baru (reapply + advisory lock), cek status toko di `submit_product_for_review` |
| `20261006100002_fix_product_moderation.sql` | Helper `store_is_publicly_visible`, trigger reset moderasi, policy publik filter toko aktif |
| `20261006100003_fix_payment_integrity.sql` | `settle_credit_topup` tolak nominal tidak sama, FK `user_roles → auth.users` |
| `20261006100004_fix_reapply_trigger.sql` | Perbaikan: trigger proteksi toko mengizinkan transisi `rejected → pending` lewat penanda GUC |

### Kode
| File | Perubahan |
|---|---|
| `src/routes/_authenticated/seller.tsx` | `DashboardSidebar` → `SellerSidebar`; teks pending diperbaiki |

---

## Bukti Uji (dijalankan ulang setelah perbaikan)

| # | Skenario | Hasil |
|---|---|---|
| 1 | Toko pending → role seller | **Tidak ada** ✅ |
| 2 | Toko di-approve → role seller | **Ada** ✅ |
| 3 | Toko di-suspend → role seller | **Dicabut** ✅ |
| 4 | Seller suspended buat produk | **Ditolak RLS** (`42501`) ✅ |
| 5 | Toko `rejected` → ajukan ulang | **`status='pending'`**, nama terupdate ✅ |
| 6 | 2× `apply_as_seller` paralel | Satu `duplicate:false`, satu `duplicate:true` — **tanpa error mentah** ✅ |
| 7 | Produk approved → ubah harga | **Kembali `draft` + `pending`** ✅ |
| 8 | Anon lihat produk toko `pending` | **Tidak tampil** ✅ |
| 9 | `store_is_publicly_visible(pending)` | `false` ✅ |
| 10 | Role yatim setelah user dihapus | **Bersih** (FK CASCADE) ✅ |

**Pipeline:** build sukses · lint 0 error · 471/482 test lulus.

**Catatan test gagal:** 11 test di `src/components/home/` gagal karena alasan
**pre-existing** (komponen home, bukan area yang diubah). Sudah diverifikasi:
tidak ada file di `src/components/home` yang tersentuh perbaikan ini.

---

## Detail Perbaikan Penting

### 1. Sinkronisasi role lewat trigger
`sync_seller_role_from_store` bereaksi pada `AFTER INSERT OR UPDATE OF status`.
Selama toko bukan `active`, role `seller` dicabut. Saat `active`, role diberikan
(idempoten). Ini menutup celah "suspend tapi masih bisa menulis".

### 2. Katalog publik memakai helper, bukan subquery RLS
Policy produk memanggil `store_is_publicly_visible(store_id)` yang `SECURITY DEFINER`.
Alasannya: subquery langsung ke `stores` bergantung pada RLS tabel itu dan rapuh bila
policy berubah.

### 3. Pengajuan ulang butuh jalur eksplisit
Trigger `protect_store_privileged_fields` mengembalikan `status` ke nilai lama untuk
semua non-admin. Perbaikan pertama saya gagal karena itu (status tetap `rejected`).
Solusi: `apply_as_seller` menandai transaksi lewat `set_config('app.seller_reapply','on')`,
dan trigger hanya mengizinkan transisi `rejected → pending` bila penanda itu ada.
Seller tidak bisa memalsukannya dari PostgREST.

### 4. Reset moderasi memakai daftar field eksplisit
Yang memicu: `name`, `short_description`, `description`, `thumbnail_url`, `price`,
`discount_price`. Yang tidak: `status`, `download_limit`, `validity_days`, `usage_notes`,
`category_id`. Daftar ini perlu dikonfirmasi Owner.

---

## Yang Belum Dikerjakan

| Item | Alasan |
|---|---|
| Refund saldo vs transfer | Butuh keputusan O-10 |
| Payout seller | Butuh keputusan O-03/O-04 |
| Dispute resolution | Belum dibangun (Prompt 25) |
| Edit produk saat `pending` | Belum diputuskan: blokir atau reset antrean |
| 11 test home gagal | Pre-existing, di luar cakupan |

---

## Rollback

Setiap migrasi aditif dan bisa dibalik:
- Drop trigger `stores_sync_seller_role`, `products_protect_moderation`
- `CREATE OR REPLACE` fungsi ke definisi sebelumnya (tersedia di migrasi asal)
- Drop FK `user_roles_user_id_fkey`
- Kode: kembalikan `SellerSidebar` → `DashboardSidebar` (satu baris)
