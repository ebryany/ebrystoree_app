# Laporan Slice — Saldo Ebrystore: UI + Pemakaian Checkout

Tanggal: 2026-09-30 · Status: **VERIFIED (lokal)**
Lingkungan: **Supabase baru `wcxaheqnnsbhifpgiedk` SAJA — TIDAK production.**

---

## Ringkasan

Dua slice dikerjakan:
1. **UI Saldo** — halaman `/dashboard/saldo` menampilkan saldo + riwayat mutasi.
2. **Pakai saldo saat checkout** — pembeli dapat memakai saldo untuk mengurangi tagihan order.

---

## Keputusan Owner

| Topik | Keputusan |
|---|---|
| Cara pakai saldo | **Opsional** (pembeli memilih) saat checkout |
| Refund dari order ber-saldo | **Semua refund → saldo** |
| Lingkungan | Lokal saja, **jangan production** |

---

## Files Changed

| File | Isi |
|---|---|
| `src/lib/orders.functions.ts` | +`getMyCredit`, +`applyCreditToOrder` |
| `src/routes/_authenticated/dashboard.saldo.tsx` | **BARU** — halaman saldo |
| `src/routes/_authenticated/dashboard.pesanan.$id.tsx` | Panel "pakai saldo" di bagian Pembayaran |
| `src/components/ebry/dashboard-sidebar.tsx` | +menu Saldo |
| `src/routes/_authenticated/dashboard.tsx` | +Saldo di bottom nav |
| `supabase/migrations/20260930100005_order_credit_usage.sql` | Kolom `credit_used`, `amount_due` + RPC `apply_credit_to_order` |

---

## Database/Domain Changes

- **Kolom baru (aditif)** pada `orders`:
  - `credit_used bigint NOT NULL DEFAULT 0 CHECK (>= 0)`
  - `amount_due bigint`
- **RPC baru** `apply_credit_to_order(_order_id, _max_credit)`:
  - Hitung saldo via `get_credit_balance`.
  - Pakai `min(max_credit, saldo, total)`.
  - Debit ledger (`idempotency_key = 'order:<id>'`).
  - Update `orders.credit_used`, `orders.amount_due`, dan `payments.expected_amount` (yang belum dibayar).
  - Idempoten: order yang sudah punya `credit_used > 0` → `duplicate: true`.

---

## Authorization Impact

- `apply_credit_to_order`: `SECURITY DEFINER`; hanya pemilik order (`order.user_id = auth.uid()`), hanya status `awaiting_payment`.
- Halaman saldo: RLS `credit_ledger` membatasi SELECT ke entri milik sendiri.
- `REVOKE` dari anon.

---

## Financial/Data Integrity Impact

| Invariant | Dijaga oleh |
|---|---|
| Saldo tak bisa dipakai berlebihan | `LEAST(max, balance, total)` |
| Anti dobel-pakai | `idempotency_key` unik per order |
| Total order tetap konsisten | `amount_due = total - credit_used` |
| Pembayaran sesuai sisa | `payments.expected_amount` diperbarui |
| Trail audit | `audit_logs` (`order.credit_apply`) |

---

## UI/UX Impact

**Halaman Saldo (`/dashboard/saldo`)**:
- Kartu saldo aktif (Rp besar).
- Info keterbatasan (jujur: saldo belum bisa dicairkan).
- Riwayat mutasi (credit hijau `+`, debit abu `−`).
- States: loading, error, empty.

**Detail Pesanan (bagian Pembayaran)**:
- Jika saldo > 0 & belum dipakai → panel "Saldo Ebrystore tersedia" + tombol "Pakai saldo Rp…".
- Jika sudah dipakai → panel "Saldo terpakai" + sisa tagihan.

---

## Tests Executed (bukti nyata)

### Slice 1 — UI Saldo
| Cek | Mobile | Desktop |
|---|---|---|
| Overflow horizontal | 0 | 0 |
| Target sentuh <44px | 0 | 0 |
| Saldo tampil | Rp 50.000 | Rp 50.000 |

### Slice 2 — Pemakaian saldo (order Rp50.000, saldo Rp30.000)
| # | Test | Hasil |
|---|---|---|
| 1 | `apply_credit_to_order` | `{credit_used:30000, amount_due:20000}` ✅ |
| 2 | Order | total=50000, credit_used=30000, amount_due=20000 ✅ |
| 3 | Payment `expected_amount` | 50000 → **20000** ✅ |
| 4 | Saldo sisa | 0 (terpakai penuh) ✅ |
| 5 | **Idempotency** (panggil 2×) | `duplicate: true` — tidak dobel ✅ |

**Kesimpulan:** pembeli dengan saldo Rp30.000 membeli order Rp50.000 → hanya perlu bayar **Rp20.000**.

### Pembersihan
Semua data tes (ledger, payment, history, notif, order, audit, user) dihapus. Ledger & orders kosong kembali.

---

## Backward Compatibility

- Kolom baru `DEFAULT 0` → order lama tidak terpengaruh.
- RPC baru → tidak mengubah RPC lama.
- `apply_credit_to_order` opsional dipanggil → alur checkout lama tetap jalan.
- Migrasi aditif, tidak destruktif.
- **Rollback:** drop 2 kolom + RPC.

---

## Remaining Gaps

| Item | Status |
|---|---|
| UI saldo | **VERIFIED** (lokal) |
| Pakai saldo saat checkout | **VERIFIED** (lokal) |
| Saldo di checkout **layanan** (jasa akademik) | `NOT_IMPLEMENTED` — baru produk digital |
| Pencairan saldo ke bank | `NOT_IMPLEMENTED` |
| Koreksi/reversal saldo oleh admin | `NOT_IMPLEMENTED` |
| Refund order ber-saldo → pisah sumber | `NOT_IMPLEMENTED` (semua refund → saldo, sesuai keputusan) |
| Kepatuhan legal (BI/OJK) | `OWNER_DECISION_REQUIRED` |
| **Deploy production** | **DILARANG** sampai keputusan owner |

---

## Catatan Penting

1. **Hanya di Supabase baru.** Production Lovable tidak menerima apa pun.
2. **Saldo belum bisa dicairkan** — ditampilkan jujur di UI.
3. **Regulasi:** menampung uang pengguna berpotensi masuk ranah BI/OJK. Jangan produksi sebelum konsultasi legal.
4. **Checkout jasa** belum mendukung saldo (hanya produk digital) — slice berikutnya bila diperlukan.
