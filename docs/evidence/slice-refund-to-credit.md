# Laporan Slice — Refund → Saldo Ebrystore (Store Credit)

Tanggal: 2026-09-30 · Slice: FASE 0 lanjutan (store credit) · Status: **VERIFIED (lokal)**
Lingkungan: **Supabase baru `wcxaheqnnsbhifpgiedk` SAJA — TIDAK production.**

---

## 1. Keputusan Owner

| Topik | Keputusan |
|---|---|
| Refund → Saldo | **Ya** — uang tetap di Ebrystore sebagai saldo |
| Lingkungan | **Lokal saja** — jangan deploy ke production |
| Legal (uang elektronik BI/OJK) | Belum dikonsultasikan → `OWNER_DECISION_REQUIRED` |

---

## 2. Problem Solved

Sebelumnya refund (setelah bug `actor_type` diperbaiki) hanya mengembalikan status order — tidak ada "nilai" yang bisa dipakai pembeli. Sekarang refund atas transaksi berbayar dapat dikonversi menjadi **saldo Ebrystore** yang tercatat di **ledger append-only**.

---

## 3. Files Changed

| File | Isi |
|---|---|
| `supabase/migrations/20260930100003_credit_ledger.sql` | Tabel `credit_ledger` + RLS + `get_credit_balance` + `get_my_credit_balance` + `credit_refund_to_balance` |
| `supabase/migrations/20260930100004_process_refund_to_credit.sql` | `process_refund` memanggil kredit saldo |
| `docs/marketplace/design-store-credit.md` | Dokumen desain |

---

## 4. Database/Domain Changes

### Tabel baru: `credit_ledger` (append-only)

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL | pemilik saldo |
| `direction` | text CHECK (`credit`,`debit`) | arah mutasi |
| `amount` | bigint CHECK (>0) | IDR penuh |
| `source_type` | text CHECK (`refund`,`adjustment`,`reversal`) | trail ke sumber |
| `source_id` | uuid | id refund terkait |
| `reference` | text | nomor refund |
| `idempotency_key` | text **UNIQUE** | anti dobel-kredit |
| `created_at` | timestamptz | |

Index: `(user_id, created_at DESC)`, `(source_type, source_id)`.

### Fungsi baru

| Fungsi | Peran |
|---|---|
| `get_credit_balance(uuid)` | Saldo = SUM(credit) − SUM(debit). **Bukan kolom tersimpan.** |
| `get_my_credit_balance()` | Saldo milik pemanggil |
| `credit_refund_to_balance(uuid)` | Kredit saldo dari refund, idempoten (`refund:<id>`) |

### Perubahan

- `process_refund` kini memanggil `credit_refund_to_balance()` setelah refund selesai.
- Logic lain IDENTIK; hanya menambah 1 langkah kredit + mencatat hasil ke audit.

---

## 5. Authorization Impact

- `credit_ledger` RLS aktif: pembeli SELECT miliknya (`user_id = auth.uid()`); staff dengan `refunds.view` bisa SELECT.
- INSERT **hanya** lewat RPC SECURITY DEFINER (tidak dari klien).
- `credit_refund_to_balance`: butuh `refunds.process`; `REVOKE` dari anon.

---

## 6. Financial/Data Integrity Impact

| Invariant | Cara dijaga |
|---|---|
| Saldo = sumber kebenaran ledger | Saldo dihitung, bukan kolom |
| Anti dobel-kredit | `idempotency_key` UNIQUE |
| Trail ke uang nyata | `source_type='refund'` + `source_id` |
| Ledger append-only | Tidak ada UPDATE/DELETE policy untuk klien |
| Koreksi | Lewat entri `reversal` (belum dibuat UI-nya — future) |

---

## 7. UI/UX Impact

**Belum ada UI.** Tabel & RPC siap, tapi belum ada halaman yang menampilkan saldo.
- Gap: halaman "Saldo Saya" di dashboard pembeli → `NOT_IMPLEMENTED` (future)
- Gap: integrasi saldo ke checkout → `NOT_IMPLEMENTED` (future)

---

## 8. Tests Executed (bukti nyata)

Lingkungan: Supabase `wcxaheqnnsbhifpgiedk`. Setup: user finance + order + payment paid + refund, refund Rp50.000.

| # | Test | Hasil |
|---|---|---|
| 1 | `review_refund(approve)` | `{"status":"approved"}` ✅ |
| 2 | `process_refund` | `{"status":"completed","credit":{"status":"credited","amount":50000,"balance":50000}}` ✅ |
| 3 | Cek ledger | 1 baris: credit 50000, `source_type=refund`, `reference=RFD-...` ✅ |
| 4 | **Idempotency** — panggil credit 2× | `{"status":"already_credited","balance":50000}` ✅ |
| 5 | Saldo akhir | `50000` (tetap, **tidak** jadi 100000) ✅ |

**Kesimpulan:** refund berhasil dikonversi ke saldo, tercatat di ledger, tahan dobel-kredit.

### Pembersihan
Semua data tes (ledger, refund, payment, history, notif, order, user) dihapus → 204/200. Ledger & refunds kosong kembali.

---

## 9. Backward Compatibility

- Tabel baru (`credit_ledger`) → tidak mengganggu tabel lama.
- `process_refund` signature sama → pemanggil lama tetap kompatibel.
- Menambah 1 langkah (kredit) + field `credit` di return (aditif).
- Migrasi aditif, tidak destruktif.
- **Rollback:** drop tabel + fungsi, kembalikan `process_refund` ke versi tanpa kredit.

---

## 10. Remaining Gaps

| Item | Status |
|---|---|
| Ledger saldo | **VERIFIED** (lokal) |
| Refund → saldo otomatis | **VERIFIED** (lokal) |
| Halaman "Saldo Saya" (UI) | `NOT_IMPLEMENTED` |
| Pakai saldo saat checkout | `NOT_IMPLEMENTED` |
| Pencairan saldo ke bank | `NOT_IMPLEMENTED` |
| Koreksi/reversal admin | `NOT_IMPLEMENTED` |
| Kepatuhan legal (BI/OJK) | `OWNER_DECISION_REQUIRED` |
| **Deploy production** | **DILARANG** sampai keputusan owner |

---

## 11. Catatan Penting

1. **Hanya di Supabase baru.** Production Lovable **belum** menerima apa pun.
2. **UI belum ada** — saldo ada di backend, belum tampil di layar.
3. **Regulasi:** menampung uang pengguna berpotensi masuk ranah BI/OJK. **Jangan produksi** sebelum konsultasi legal.
4. **Saldo belum bisa dipakai belanja** — integrasi checkout adalah slice berikutnya.
5. **Non-goal saat ini:** pencairan ke bank, transfer antar-user.
