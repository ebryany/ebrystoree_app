# Laporan Slice — Prompt 35 & 37: Admin Marketplace Operations + Laporan

Tanggal: 2026-09-30 · Prompt: MGRCAO V3 **#35** (admin ops) + **#37** (analytics) · Status: **VERIFIED (lokal)**
Lingkungan: **Supabase baru `wcxaheqnnsbhifpgiedk` SAJA — TIDAK production.**

---

## 1. Current Evidence (sebelum)

| Objek | Temuan | Bukti |
|---|---|---|
| Permission `sellers.view/approve/manage` | ✅ ada di DB | `permissions`, grup "Marketplace" |
| Permission `seller.*` (5 buah) | ✅ ada di DB | grup "Seller" |
| RPC `review_seller`, `set_seller_suspended`, `review_product` | ✅ ada | migrasi 100011–100013 |
| Task `review_seller` otomatis | ✅ dibuat saat seller ajukan | migrasi 100011 |
| Halaman admin seller | ❌ **TIDAK ADA** | `ls admin/` = 0 file seller |
| Label task `review_seller` | ❌ tidak ada | `TASK_TYPE_LABEL` hanya 5 tipe lama |
| RPC daftar seller (admin) | ❌ belum ada | grep `list_sellers` = kosong |
| Laporan marketplace | ❌ belum ada | `admin/reports.tsx` tidak menyebut seller |
| **IDOR `get_store_balance`** | ❌ **BOCOR** | user biasa baca saldo toko orang lain |

**Klasifikasi:** `SCHEMA_ONLY` (backend siap, UI nol) + **1 kerawanan kritis**.

---

## 2. Problem Solved

1. **IDOR ditutup** — kebocoran data finansial antar-seller diperbaiki dan dibuktikan.
2. **Alur seller tidak lagi putus** — admin kini bisa menyetujui/menolak pengajuan lewat UI.
3. **Moderasi produk berfungsi** — antrean lintas seller + approve/reject.
4. **Drill-down seller** — profil, produk, transaksi, saldo, rating, jejak audit.
5. **Laporan marketplace** — angka dari transaksi nyata, bukan event UI.

---

## 3. Files Changed

### Migrasi (5)
| File | Isi |
|---|---|
| `20260930100019_fix_store_data_idor.sql` | Helper `can_access_store` + guard 2 RPC |
| `20260930100020_fix_can_access_store_null.sql` | **Perbaikan bug perbaikan** (NULL + service_role) |
| `20260930100021_admin_seller_queues.sql` | 4 RPC admin (list, summary, orders, ledger) |
| `20260930100022_marketplace_reports.sql` | 2 RPC laporan (overview, leaderboard) |
| `20260930100023_fix_leaderboard_ambiguous.sql` | **Perbaikan** `store_id` ambigu |

### Kode
| File | Isi |
|---|---|
| `src/lib/admin-seller.functions.ts` | **BARU** — 9 server fn admin seller |
| `src/lib/rate-limit.server.ts` | +bucket `admin.seller.decision` |
| `src/lib/transaction-labels.ts` | +label `review_seller`, `review_product`, `MODERATION_STATUS_LABEL`, `STORE_STATUS_LABEL` |
| `src/lib/admin-nav.ts` | +grup "Marketplace" (Seller, Moderasi Produk, Laporan) |
| `src/routes/_authenticated/admin/seller.index.tsx` | **BARU** — antrean + daftar seller |
| `src/routes/_authenticated/admin/seller.$id.tsx` | **BARU** — drill-down + kontrol suspend |
| `src/routes/_authenticated/admin/seller.produk.tsx` | **BARU** — moderasi produk |
| `src/routes/_authenticated/admin/seller.laporan.tsx` | **BARU** — laporan marketplace |

---

## 4. Database/Domain Changes

### Helper otorisasi objek (dipakai ulang)
`can_access_store(_store_id)` = pemilik toko **ATAU** staff `sellers.view` **ATAU** `service_role`.
Mengembalikan boolean tegas via `COALESCE(..., false)`.

### RPC baru (6)
| Fungsi | Peran |
|---|---|
| `admin_list_stores(_status, _search)` | Antrean + daftar seller dengan agregat |
| `admin_store_summary(_store_id)` | Drill-down: profil, owner, produk, order, saldo, rating |
| `admin_store_orders(_store_id, _limit)` | Transaksi seller (kolom aman) |
| `admin_store_ledger(_store_id, _limit)` | Riwayat saldo seller |
| `admin_marketplace_overview()` | GMV, seller, produk, refund, saldo |
| `admin_seller_leaderboard(_limit)` | Peringkat seller dari ledger |

---

## 5. Authorization Impact

- Semua RPC admin: `SECURITY DEFINER` + guard `has_permission` eksplisit + `REVOKE` dari anon.
- `can_access_store` dipakai bersama, sehingga tidak ada dua definisi akses yang menyimpang.
- **Tidak ada policy RLS baru yang membuka `orders`** — PII pembeli tetap terlindungi.
- Rate limit `admin.seller.decision` (60/5 menit) untuk aksi keputusan.

---

## 6. Financial/Data Integrity Impact

- Ledger tetap append-only; admin **tidak bisa** mengubah uang (read-only).
- Aksi suspend **tidak menghapus** data/order — hanya mengubah status.
- Laporan menyatakan eksplisit bahwa komisi & payout belum ditampilkan (menunggu O-01, O-03/O-04).

---

## 7. UI/UX Impact

| Halaman | Isi | States |
|---|---|---|
| `/admin/seller` | Antrean pengajuan (filter), panel keputusan | loading/error/empty/forbidden |
| `/admin/seller/$id` | Drill-down + kontrol status + pesanan + ledger | lengkap |
| `/admin/seller/produk` | Antrean moderasi lintas seller | lengkap |
| `/admin/seller/laporan` | Metrik + peringkat seller | lengkap |

Aksi berisiko (setujui/tolak/suspend) **wajib alasan ≥5 karakter**; tombol mati bila kurang.

---

## 8. Tests Executed (bukti nyata)

### Keamanan (4 test) — inti slice ini
| # | Test | Hasil |
|---|---|---|
| 1 | User biasa baca saldo toko orang lain | **FORBIDDEN** ✅ (sebelumnya `500000`) |
| 2 | User biasa baca rating toko orang lain | **FORBIDDEN** ✅ |
| 3 | Anon akses RPC | `permission denied` ✅ |
| 4 | `service_role` (job server-side) | **boleh** ✅ |

### Guard admin (4 test)
| # | Test | Hasil |
|---|---|---|
| 5 | User biasa → `admin_list_stores` | FORBIDDEN ✅ |
| 6 | User biasa → `admin_store_summary` | FORBIDDEN ✅ |
| 7 | User biasa → `admin_store_orders` | FORBIDDEN ✅ |
| 8 | User biasa → `admin_store_ledger` | FORBIDDEN ✅ |

### Alur operasional (end-to-end, browser)
| # | Aksi | Hasil |
|---|---|---|
| 9 | Seller ajukan toko → muncul di antrean admin | ✅ |
| 10 | Tombol mati saat alasan "abc" (3 karakter) | ✅ |
| 11 | Tombol aktif saat alasan valid | ✅ |
| 12 | Admin setujui → DB: `status=active`, `reviewed_by`, `reviewed_at`, `verification_note` terisi | ✅ |
| 13 | Role `seller` diberikan setelah approve | ✅ |
| 14 | Moderasi produk → `published` + `approved` + jejak audit | ✅ |
| 15 | Suspend toko → `suspended` + `suspended_reason` | ✅ |
| 16 | Laporan marketplace menampilkan angka nyata | ✅ |

### Pipeline
```
lint  : 0 error
tests : 33 passed
build : sukses
```

### Pembersihan
Semua data uji dihapus: 3 user, 2 store, 1 produk, task, notif, ledger.
Platform store `Ebrystore Official` tetap. Store `gila` (milik Owner) tidak disentuh.

---

## 9. Backward Compatibility

- Semua migrasi **aditif**; tidak ada tabel/policy lama yang diubah.
- `get_store_balance` / `store_rating_summary` berganti isi (bukan signature) — pemanggil lama
  di dashboard seller tetap bekerja karena pemilik toko selalu lolos guard.
- Halaman admin lama tidak tersentuh; menu baru ditambahkan, bukan mengganti.
- **Rollback:** drop 6 RPC + helper; UI admin error (bukan rusak data).

---

## 10. Remaining Gaps

| Item | Status |
|---|---|
| IDOR data toko | **FIXED & VERIFIED** |
| Antrean + moderasi + drill-down + laporan | **VERIFIED** (lokal) |
| **Seller `pending` tidak bisa menyiapkan produk** | **TEMUAN BARU** — UI bilang bisa, RLS menolak |
| Payout / penarikan | `OWNER_DECISION_REQUIRED` (O-01..O-04) |
| Dispute & freeze | `NOT_IMPLEMENTED` (Prompt 25) |
| Risk flags | `NOT_IMPLEMENTED` (Prompt 08) |
| Upload file produk | `NOT_IMPLEMENTED` (Prompt 14) |
| Deploy production | **DILARANG** sampai persetujuan |

---

## 11. Catatan Penting

1. **Dua bug ditemukan di perbaikan saya sendiri** dan diperbaiki terpisah:
   - `can_access_store` mengembalikan `NULL` (logika tiga-nilai SQL) sehingga guard LOLOS.
   - `admin_seller_leaderboard` gagal karena `store_id` ambigu (OUT parameter vs kolom).
   Keduanya hanya ketahuan lewat **uji nyata**, bukan review kode.
2. **Temuan baru:** seller berstatus `pending` **tidak bisa** membuat produk — role `seller`
   baru diberikan saat approve. Tapi UI `/seller` menulis *"Anda dapat menyiapkan produk,
   tetapi belum tampil sampai toko disetujui"*. **Teks ini tidak akurat** dan perlu
   diputuskan: ubah teks, atau longgarkan policy. Belum saya ubah (butuh keputusan).
3. Admin tidak bisa mengubah uang — hanya status dan moderasi.
