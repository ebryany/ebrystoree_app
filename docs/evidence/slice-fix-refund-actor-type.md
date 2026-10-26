# Laporan Slice — Perbaikan A-01: Refund `actor_type`

Tanggal: 2026-09-30 · Slice: FASE 0 #1 · Status: **VERIFIED**

---

## 1. Current Evidence (sebelum perubahan)

| Objek | Temuan | Bukti |
|---|---|---|
| CHECK constraint | `actor_type IN ('customer','admin','finance','operator','support','system')` — **`'staff'` tidak ada** | `supabase/migrations/20260728131303_a6b697c9-...sql:180` |
| `review_refund` | Menulis `actor_type='staff'` di 2 lokasi | `20260728132129_91eaf547-...sql:31, 35` |
| `process_refund` | Menulis `actor_type='staff'` di 1 lokasi | `20260728132129_91eaf547-...sql:81` |
| Konfirmasi | Constraint **tidak pernah** di-ALTER | grep `DROP CONSTRAINT ... actor` = 0 hasil |
| Klasifikasi | `PARTIALLY_VERIFIED` — kode ada, tidak pernah berhasil dieksekusi | — |

**Dampak:** setiap approve/reject/process refund memicu CHECK violation → **rollback seluruh RPC** → refund tidak mungkin diselesaikan.

---

## 2. Problem Solved

Alur refund (approve → process) tidak dapat dijalankan sama sekali karena `actor_type='staff'` melanggar CHECK. Fitur ini sebelumnya mati total.

---

## 3. Files Changed

| File | Aksi |
|---|---|
| `supabase/migrations/20260930100000_fix_refund_actor_type.sql` | **BARU** — `CREATE OR REPLACE FUNCTION` untuk `review_refund` & `process_refund` dengan `actor_type='finance'` |
| `supabase/migrations/20260930100002_cleanup_refund_verify_tmp.sql` | **BARU** — hapus RPC verifikasi sementara |
| `docs/audit/22-audit-2026-09-29.md` | Akan ditandai A-01 = FIXED |

---

## 4. Database/Domain Changes

- **Tidak ada perubahan skema.** Hanya `CREATE OR REPLACE FUNCTION`.
- Kedua fungsi ditulis ulang dengan `actor_type` = `'finance'` (aktor yang menyetujui/memproses refund adalah finance/admin — nilai yang benar secara semantik).
- Seluruh logic lain **identik** dengan versi lama (permission check, FOR UPDATE, state guard, notifikasi, audit, revoke entitlement).
- `REVOKE ... FROM PUBLIC, anon` + `GRANT ... TO authenticated` dipertahankan.
- Migrasi **aditif** — histori migrasi lama tidak disentuh.

**Alasan pilih `'finance'` bukan tambah `'staff'` ke CHECK:** `actor_type` menyatakan **jenis aktor**, dan aktor yang menyetujui refund adalah finance/admin. `'staff'` adalah istilah umum yang tidak spesifik, jadi menambahkannya akan memperlemah semantik data.

---

## 5. Authorization Impact

Tidak berubah. Kedua fungsi tetap:
- `SECURITY DEFINER` + `SET search_path = public`
- `review_refund`: butuh `refunds.approve` / `refunds.reject`
- `process_refund`: butuh `refunds.process`
- `REVOKE` dari `anon`, `GRANT` ke `authenticated`

---

## 6. Financial/Data Integrity Impact

Invariant yang dijaga (tidak berubah):
- `refund.amount ≤ pembayaran` (dijaga di `request_refund`)
- Total refund ≤ total dibayar
- Refund selesai mencabut entitlement digital
- Setiap transisi menulis `order_status_histories` + `audit_logs`

---

## 7. UI/UX Impact

Tidak ada. Perbaikan murni backend. UI refund (`/admin/refunds`) sekarang berfungsi karena RPC-nya berhasil.

---

## 8. Tests Executed (bukti nyata)

Lingkungan: Supabase baru `wcxaheqnnsbhifpgiedk`.

### Verifikasi 1 — isi fungsi
Query `pg_get_functiondef`:
```json
{ "review_has_staff": false, "process_has_staff": false,
  "review_has_finance": true, "process_has_finance": true }
```
✅ `'staff'` hilang, `'finance'` terpasang.

### Verifikasi 2 — test end-to-end nyata
Setup: user `finance` + order `refund_requested` + payment `paid` + refund `requested`.

| # | Test | Perintah | Hasil |
|---|---|---|---|
| 1 | Approve refund | `rpc/review_refund(_decision='approve')` | `{"status": "approved"}` ✅ |
| 2 | Process refund | `rpc/process_refund(_reference='...')` | `{"status": "completed"}` ✅ |
| 3 | Histori status | `select from order_status_histories` | 2 baris, `actor_type='finance'` ✅ |

**Sebelum perbaikan:** kedua panggilan akan **rollback** (CHECK violation).
**Sesudah:** keduanya **berhasil & tercatat**.

### Verifikasi 3 — pembersihan
- Data tes (refund/payment/histories/order/notifications) dihapus → HTTP 204
- RPC verifikasi sementara dihapus → HTTP 404
- User tes dihapus → HTTP 200

---

## 9. Backward Compatibility

- Tidak ada perubahan skema → order/payment/entitlement lama tidak terpengaruh.
- Fungsi ditulis ulang dengan tanda tangan (signature) sama → pemanggil lama tetap kompatibel (`decideRefund`, `processRefund`, `requestMyRefund`).
- Tidak ada migrasi destruktif.
- **Rollback:** jalankan ulang definisi lama dari `20260728132129` (akan mengembalikan bug, tapi tersedia).

---

## 10. Remaining Gaps

| Item | Status |
|---|---|
| A-01 Refund `actor_type` | **VERIFIED** (diperbaiki + diuji) |
| Refund parsial (nominal bebas) | `NOT_IMPLEMENTED` — B-03, slice terpisah |
| Store credit / saldo Ebrystore | `OWNER_DECISION_REQUIRED` — butuh keputusan legal + kebijakan |
| **⚠️ Migrasi belum diterapkan ke production Lovable** | Perubahan hanya ada di Supabase baru `wcxaheqnnsghifpgiedk`. Production (`ayhwmcptscfbuzcobcav`) **belum** menerima perbaikan ini. |

---

## Catatan Penting

**Perbaikan ini diterapkan di Supabase baru saja** (untuk pengujian aman). Agar berlaku di **production Lovable**, migrasi yang sama perlu diterapkan ke project produksi — dan itu butuh persetujuan Owner karena menyentuh sistem live.

**Risiko bila tidak diterapkan ke production:** customer tetap tidak bisa refund di situs live.
