# Laporan Slice — Marketplace Prompt 06: Seller Role, Store & Onboarding

Tanggal: 2026-09-30 · Prompt: MGRCAO V3 #06 · Status: **VERIFIED (lokal)**
Lingkungan: **Supabase baru `wcxaheqnnsbhifpgiedk` SAJA — TIDAK production.**

---

## 1. Current Evidence (sebelum)

| Objek | Temuan | Bukti |
|---|---|---|
| Role `seller` | **TIDAK ADA** — enum hanya customer/operator/support/finance/admin/super_admin | `CREATE TYPE app_role` (`20260728115920:11`) |
| Tabel store | **TIDAK ADA** | grep = kosong |
| Permission seller | **TIDAK ADA** | — |
| Trigger proteksi | `protect_role_changes` melarang memberi role untuk diri sendiri | `20260728122903:216` |

**Klasifikasi:** `NOT_IMPLEMENTED`.

---

## 2. Problem Solved

Seller menjadi **aktor first-class**: punya toko, permission, dan isolasi RLS — **belum bisa jualan** (kepemilikan katalog = slice 11–16).

---

## 3. Files Changed

| File | Isi |
|---|---|
| `supabase/migrations/20260930095959_add_seller_enum.sql` | ALTER TYPE tambah nilai `seller` |
| `supabase/migrations/20260930100010_seller_role_and_stores.sql` | Permission + tabel `stores` + RLS + trigger + helper |
| `supabase/migrations/20260930100011_seller_onboarding.sql` | RPC `apply_as_seller`, `review_seller`, `set_seller_suspended` |
| `supabase/migrations/20260930100012_seller_role_on_approval.sql` | **Perbaikan** — role diberikan saat approval |
| `src/lib/__tests__/regression-fase0.test.ts` | +5 test regresi seller |

---

## 4. Database/Domain Changes

### Role & permission
- `app_role` + nilai `seller`.
- 8 permission baru: 5 seller (`seller.*`) + 3 platform (`sellers.view/approve/manage`).
- Pemetaan: seller → 5 permission + `catalog.view`; admin → 3 platform; support → `sellers.view`.

### Tabel `stores`
| Kolom | Keterangan |
|---|---|
| `id`, `owner_id`, `name`, `slug`, `description`, `logo_url` | identitas toko |
| `status` | `pending` / `active` / `suspended` / `rejected` |
| `contact_phone`, `contact_email` | kontak (nullable — O-06 belum diputuskan) |
| `verification_note`, `reviewed_by`, `reviewed_at`, `suspended_reason` | jejak verifikasi |

**Constraint:** unique `owner_id` (satu toko per seller, M-05), unique `slug`.
**Index:** `(status)`.

### RPC
| Fungsi | Peran |
|---|---|
| `apply_as_seller(name, slug, ...)` | customer mendaftar toko (status `pending`) |
| `review_seller(store_id, decision, reason)` | admin approve/reject; **beri role seller saat approve** |
| `set_seller_suspended(store_id, suspend, reason)` | admin suspend/aktifkan |
| `my_store_id()`, `has_store(user_id)` | helper akses |

---

## 5. Authorization Impact

- `stores` RLS aktif:
  - `stores_select_own` → owner hanya lihat tokonya
  - `stores_select_staff` → staff ber-`sellers.view` lihat semua
  - `stores_update_own` → owner update tokonya sendiri
- `apply_as_seller` / `review_seller` / `set_seller_suspended`: `SECURITY DEFINER`, `REVOKE` dari anon.
- **Pelajaran penting:** `protect_role_changes` memblokir pemberian role untuk diri sendiri → role dipindah ke saat **approval admin** (aktor berbeda), menutup celah privilege escalation.

---

## 6. Financial/Data Integrity Impact

Tidak ada transaksi uang di slice ini. Tabel `admin_tasks` + `notifications` + `audit_logs` dipakai (pola yang sudah ada).

---

## 7. UI/UX Impact

**Belum ada UI.** Slice ini murni fondasi data & server (sesuai MGRCAO: "jangan bangun UI sebelum state machine beres"). Halaman seller & storefront menyusul (Prompt 09–10).

---

## 8. Tests Executed (bukti nyata)

Lingkungan: Supabase `wcxaheqnnsbhifpgiedk`. Setup: 2 customer + 1 admin.

| # | Test | Hasil |
|---|---|---|
| 1 | Seller A daftar | `{status:"pending", duplicate:false}` ✅ |
| 2 | Seller B daftar | `{status:"pending", duplicate:false}` ✅ |
| 3 | A daftar lagi (idempotensi) | `{duplicate:true}` ✅ |
| 4 | B daftar lagi | `{duplicate:true}` ✅ |
| 5 | **RLS** A lihat daftar toko | hanya **Toko A** ✅ |
| 6 | **RLS** B lihat daftar toko | hanya **Toko B** ✅ |
| 7 | **RLS** A lihat toko B langsung | `[]` **kosong** (terisolasi) ✅ |
| 8 | Admin approve seller B | `{status:"active"}` ✅ |
| 9 | Role seller B diberikan? | **ya** (`role:seller`) ✅ |
| 10 | Approval ganda | `INVALID_STATE` (ditolak) ✅ |
| 11 | Admin suspend | `{status:"suspended"}` ✅ |
| 12 | Aktifkan ulang | `{status:"active"}` ✅ |
| 13 | Non-admin approve | `FORBIDDEN` ✅ |

**Kesimpulan:** onboarding berjalan, **isolasi seller terbukti**, otorisasi admin benar.

### Pembersihan
Data tes (tasks, notifs, role, stores, 2 user) dihapus → semua kosong.

---

## 9. Backward Compatibility

- Migrasi **aditif** — enum ditambah (bukan diganti), tabel baru.
- Tabel/perilaku lama tidak disentuh.
- **Catatan PostgreSQL:** nilai enum baru tidak bisa dipakai di transaksi yang sama dengan `ALTER TYPE ADD VALUE` (SQLSTATE 55P04) → dipisah ke migrasi tersendiri.
- **Rollback:** drop tabel/policy/trigger/functions; hapus permission seller (nilai enum dibiarkan — PG tidak bisa hapus nilai enum).

---

## 10. Remaining Gaps

| Item | Status |
|---|---|
| Role seller + toko + permission + RLS | **VERIFIED** (lokal) |
| Onboarding (daftar → verifikasi → suspend) | **VERIFIED** (lokal) |
| UI onboarding seller | `NOT_IMPLEMENTED` (Prompt 10) |
| Storefront publik | `NOT_IMPLEMENTED` (Prompt 09) |
| Kepemilikan produk (`seller_id`) | `NOT_IMPLEMENTED` (Prompt 11–12) |
| Kriteria verifikasi (O-06) | `OWNER_DECISION_REQUIRED` |
| Kebijakan moderasi (O-07) | `OWNER_DECISION_REQUIRED` |
| Deploy production | **DILARANG** sampai persetujuan |

---

## 11. Catatan Penting

1. **Hanya di Supabase baru.** Production tidak disentuh.
2. **Seller belum bisa jualan** — belum ada produk milik seller. Ini disengaja (slice kepemilikan katalog menyusul).
3. **Isolasi terbukti** lewat test RLS nyata (B tidak terlihat oleh A).
4. **Dua batasan PostgreSQL yang ditemukan & diatasi:**
   - Nilai enum baru tidak bisa dipakai dalam transaksi yang sama dengan `ALTER TYPE` → dipisah.
   - Trigger proteksi role memblokir pemberian role untuk diri sendiri → role dipindah ke saat approval.
