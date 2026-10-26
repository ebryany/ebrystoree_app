# Desain: Refund → Saldo Ebrystore (Store Credit)

Tanggal: 2026-09-30 · Status: **DALAM PENGERJAAN (lokal saja)**
Lingkungan: **Supabase baru `wcxaheqnnsbhifpgiedk` SAJA — JANGAN production.**

---

## 1. Keputusan Owner

| Topik | Keputusan |
|---|---|
| Bentuk refund | **Refund → Saldo Ebrystore** (uang tetap di Ebrystore) |
| Lingkungan | **Lokal / Supabase baru saja.** Jangan deploy ke production. |
| Legal (uang elektronik BI/OJK) | **Belum dikonsultasikan** → tetap `OWNER_DECISION_REQUIRED` sebelum production |

---

## 2. Ruang Lingkup

**Termasuk (in scope):**
- Menerima refund sebagai kredit saldo (hanya untuk **transaksi yang sudah dibayar lalu dibatalkan**).
- Ledger saldo append-only sebagai sumber kebenaran.
- Saldo = hasil hitung ledger (bukan kolom yang diedit bebas).
- Idempoten: satu refund tidak boleh mengkredit dua kali.

**Tidak termasuk (non-goal, tahap ini):**
- Pencairan saldo ke bank (withdrawal).
- Transfer saldo antar pengguna.
- Saldo dipakai untuk belanja (integrasi checkout) — tahap berikutnya.
- Pilihan "transfer balik ke bank" — belum.

---

## 3. Prinsip Wajib (anti-slop)

Store credit yang benar WAJIB punya:

1. **Ledger append-only** — setiap mutasi = 1 baris (credit/debit/reversal/adjustment).
2. **Saldo terhitung** — dijumlah dari ledger, tidak disimpan manual.
3. **Idempotency** — kunci unik mencegah dobel-kredit.
4. **Immutable** — koreksi via entri baru (reversal), bukan edit/hapus.
5. **Jejak audit** — siapa, kapan, kenapa, terkait order/refund mana.
6. **Trail ke uang nyata** — setiap kredit bisa dilacak ke pembayaran asal.

**Dilarang:** menampilkan saldo tanpa ledger di belakangnya.

---

## 4. Skema yang Diusulkan

### Tabel `credit_ledger` (append-only)

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | uuid PK | — |
| `user_id` | uuid NOT NULL | pemilik saldo |
| `direction` | text CHECK (`credit`,`debit`) | arah mutasi |
| `amount` | bigint CHECK (>0) | jumlah (IDR penuh) |
| `source_type` | text | `refund` / `adjustment` / `reversal` |
| `source_id` | uuid | id refund/payment terkait |
| `reference` | text | nomor refund / keterangan |
| `note` | text | alasan |
| `created_by` | uuid | aktor |
| `created_at` | timestamptz | — |
| **`idempotency_key`** | text **UNIQUE** | cegah dobel-kredit |

**Invariant:**
- Append-only (tidak ada UPDATE/DELETE dari klien).
- `idempotency_key` unik → refund sama tidak bisa dikredit 2×.
- Setiap baris harus punya `source_type` + `source_id` (trail ke uang nyata).

### Fungsi `get_credit_balance(user_id)`
Menghitung saldo = `SUM(credit) - SUM(debit)` dari ledger. **Bukan kolom tersimpan.**

### RPC `credit_refund_to_balance(_refund_id)`
Dipanggil dari `process_refund`. Membuat 1 entri ledger credit dengan `idempotency_key = 'refund:' || refund_id`.

---

## 5. Alur

```
Pembeli bayar → order paid
        ↓
Order dibatalkan / gagal dipenuhi
        ↓
Pembeli ajukan refund → review_refund (approve)
        ↓
process_refund (finance)
   ├─ status refund → completed
   ├─ order → refunded
   ├─ cabut entitlement
   └─ credit_refund_to_balance()  ← BARU
          └─ entri ledger credit (idempotent)
```

---

## 6. RLS & Authz

- `credit_ledger`: RLS aktif. Pembeli hanya bisa SELECT entri miliknya (`user_id = auth.uid()`). Staff dengan permission `refunds.view` bisa melihat.
- INSERT hanya lewat RPC SECURITY DEFINER, bukan dari klien.
- `get_credit_balance`: hanya bisa baca saldo sendiri.

---

## 7. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Dobel-kredit | `idempotency_key` unik |
| Saldo tidak cocok | Saldo = SUM(ledger), tidak ada kolom terpisah |
| Koreksi salah | Entri reversal baru, bukan edit |
| Regulasi uang elektronik | **`OWNER_DECISION_REQUIRED`** — jangan produksi |
| Integrasi checkout belum ada | Non-goal tahap ini — catat sebagai gap |

---

## 8. Status Evidence

| Bagian | Status |
|---|---|
| Perbaikan refund (`actor_type`) | `VERIFIED` (slice sebelumnya) |
| Ledger saldo | target `VERIFIED` (lokal) |
| Integrasi checkout (pakai saldo) | `NOT_IMPLEMENTED` (future) |
| Pencairan saldo ke bank | `NOT_IMPLEMENTED` (future) |
| Kepatuhan legal | `OWNER_DECISION_REQUIRED` |
| Deploy production | **DILARANG sampai keputusan owner** |
