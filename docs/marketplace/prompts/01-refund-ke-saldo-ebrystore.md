# Prompt MGRCAO V3 — Slice: Refund → Saldo Ebrystore (Store Credit)

**Phase:** FASE 0 (Perbaikan fondasi) — slice keuangan  
**Dependency:** Tidak ada untuk bagian A (perbaikan refund). Bagian B (store credit) bergantung pada ledger yang belum ada.  
**Execution mode:** satu vertical slice; jangan campur dengan slice lain.  
**Status awal slice:** `PARTIALLY_VERIFIED` (refund ada tapi rusak) + `NOT_IMPLEMENTED` (saldo/ledger)

---

## COPY-PASTE PROMPT

Anda bekerja pada codebase **Ebrystore** (TanStack Start + React 19 + Supabase/PostgreSQL). Gunakan **Framework MGRCAO V3** sebagai reasoning/orchestration layer tertinggi. Jangan langsung generate code sebelum memahami kondisi project sebenarnya.

---

### M — Mindset

- Problem-first, understand-before-generate, evidence-before-claim.
- Ini slice **keuangan**. Uang orang lain terlibat. Prioritaskan **kebenaran finansial** di atas kecepatan rilis.
- Jangan mengarang: kalau ada keputusan bisnis/legal yang belum jelas, tandai `OWNER_DECISION_REQUIRED` dan kerjakan bagian yang tidak bergantung padanya.
- **Anti AI-slop:** jangan bikin "saldo" yang hanya angka tanpa ledger di belakangnya. UI yang menampilkan saldo tanpa sumber kebenaran = AI-slop dan berbahaya.

---

### G — Goal

**Bagian A (WAJIB, blocking):** Perbaiki refund yang sekarang rusak sehingga approval/processing refund dapat benar-benar dieksekusi.

**Bagian B (DESAIN, belum implementasi):** Rancang mekanisme "refund sebagai Saldo Ebrystore" (store credit) di atas **ledger append-only**, dengan keputusan owner yang jujur ditandai.

**Hasil yang bisa dibuktikan:**
- A: test end-to-end approve→process refund lulus; status history tercatat.
- B: dokumen desain + daftar keputusan owner + skema ledger yang diusulkan (belum dieksekusi sebelum keputusan).

---

### R — Role

Bertindak sebagai:
- **Financial/backend engineer** (ledger, idempotency, transaksi atomik)
- **PostgreSQL/Supabase engineer** (migrasi aditif, RLS, RPC SECURITY DEFINER)
- **Security reviewer** (object authz, anti-abuse)
- **QA engineer** (test positif + negatif)
- **Marketplace product engineer** (memastikan desain tidak bikin utang teknis di masa marketplace)

Jika slice menyentuh uang → financial correctness dulu. Jika menyentuh data sensitif → authorization dulu.

---

### C — Context

**BUKTI KONDISI NYATA (terverifikasi 2026-09-30 dari kode, bukan asumsi):**

1. Tabel `refunds` ADA di `supabase/migrations/20260728131438_a2549a54-44e5-4e9d-a3ec-816d51f0a6e1.sql:91`
   - Kolom: `id, refund_number, order_id, payment_id, customer_id, amount bigint CHECK(amount>0), reason, status, requested_at, reviewed_by, reviewed_at, decision_note, processing_reference, processed_at`
   - Status: `requested, under_review, information_requested, approved, processing, completed, rejected, cancelled`
   - Ada index unik: `idx_refund_active_per_order` (cegah refund aktif ganda)

2. **BUG KRITIS (blocking):** `review_refund` & `process_refund` di `supabase/migrations/20260728132129_91eaf547-2817-4c3e-bdfa-6ae91eca1d6c.sql` menulis `actor_type='staff'`:
   - Baris 31: `VALUES (r.order_id, v_order.status, 'refund_processing', auth.uid(), 'staff', ...)`
   - Baris 35: `VALUES (r.order_id, v_order.status, 'completed', auth.uid(), 'staff', ...)`
   - Baris 81: `VALUES (r.order_id, v_order.status, 'refunded', auth.uid(), 'staff', ...)`

3. CHECK constraint di `supabase/migrations/20260728131303_a6b697c9-8537-4484-b7cc-dc81be8b40d5.sql:180`:
   ```sql
   actor_type text NOT NULL DEFAULT 'system'
     CHECK (actor_type IN ('customer','admin','finance','operator','support','system'))
   ```
   **`'staff'` TIDAK ADA.** → Setiap approve/reject/process refund memicu CHECK violation → **rollback**. Refund tidak pernah bisa selesai.

4. **Terverifikasi:** constraint `actor_type` **tidak pernah** di-ALTER di migrasi mana pun (grep `DROP CONSTRAINT ... actor` = 0 hasil).

5. **Konsep saldo/ledger/wallet TIDAK ADA.** Grep `balance|wallet|credit|saldo|store_credit` pada `src/lib/*.ts` + `supabase/migrations/*.sql` = **0 hasil relevan**.

6. **Status yang sudah ada:**
   - Order (16): `draft, awaiting_payment, payment_under_review, paid, waiting_assignment, assigned, waiting_customer_data, queued, in_progress, waiting_customer_review, completed, cancelled, refund_requested, refund_processing, refunded, disputed`
   - Payment (12): `draft, pending, waiting_payment, waiting_verification, paid, failed, expired, rejected, cancelled, refund_requested, partially_refunded, refunded`

7. **`process_refund` saat ini:** set status refund → `completed`, update payment → `refunded`/`partially_refunded`, update order → `refunded`, cabut `digital_entitlements.revoked_at`, kirim notifikasi, tulis audit. **Tidak menyentuh saldo apa pun** (karena saldo belum ada).

8. **Permukaan kode refund:**
   - Server fn: `requestMyRefund` (`src/lib/orders.functions.ts:323`), `decideRefund` (`src/lib/admin-transaction.functions.ts:258`), `processRefund` (`src/lib/admin-transaction.functions.ts:282`)
   - UI: `src/routes/_authenticated/admin/refunds.index.tsx`, `refunds.$id.tsx`
   - RPC: `request_refund`, `review_refund`, `process_refund`

**INVARIAN YANG TIDAK BOLEH RUSAK:**
- Refund tidak boleh melebihi jumlah dibayar.
- Total refund atas satu order ≤ total dibayar.
- Refund selesai atas produk digital mencabut entitlement.
- Refund selesai bersifat final; koreksi hanya via entri penyesuaian teraudit.
- Setiap perubahan status menulis `order_status_histories` + `audit_logs`.
- Order/payment lama tidak boleh berubah perilakunya.

**KONTEKS PENTING — DUA SKENARIO BERBEDA:**
- **Skenario A: transaksi GAGAL (belum bayar).** Status payment `failed`/`expired`. **Tidak ada uang masuk** → tidak ada yang perlu dikembalikan. Cukup ubah status. **JANGAN bikin saldo dari sini** (tidak ada uang untuk jadi saldo).
- **Skenario B: transaksi BERHASIL lalu dibatalkan.** Uang sudah masuk. Refund relevan. **Inilah tempat store credit masuk akal.**

Tanyakan/konfirmasi ke owner mana skenario yang dimaksud; jangan asumsikan.

**PRINSIP STORE CREDIT YANG BENAR (standar industri):**
Store credit / saldo yang benar WAJIB punya:
1. **Ledger append-only** sebagai sumber kebenaran (setiap mutasi = 1 entri: credit/debit/reversal/adjustment).
2. **Saldo = hasil hitung ledger**, bukan angka yang disimpan manual dan diedit bebas.
3. **Idempotency** — refund yang sama tidak boleh mengkredit dua kali.
4. **Immutable** — koreksi via entri baru (reversal), bukan edit/hapus entri lama.
5. **Jejak audit** — siapa, kapan, kenapa, terkait order/refund mana.
6. **Trail ke uang nyata** — setiap credit saldo harus bisa dilacak ke pembayaran asal.

**RISIKO LEGAL (OWNER_DECISION_REQUIRED):**
Menampung uang pengguna (saldo) di Indonesia berpotensi masuk ranah regulasi BI/OJK (dompet digital/uang elektronik). **Jangan klaim "aman" atau "legal" tanpa dasar.** Tandai sebagai keputusan owner + konsultasi legal.

---

### A — Action

**BAGIAN A — Perbaiki refund (kerjakan penuh, blocking):**

1. Baca ulang `review_refund`, `process_refund`, dan constraint `actor_type`.
2. Nyatakan status evidence: refund = `PARTIALLY_VERIFIED` (kode ada, tidak pernah berhasil dieksekusi).
3. Identifikasi invariant di atas; jangan rusak.
4. **Usul perubahan TERKECIL.** Pilih salah satu (jelaskan alasannya):
   - (a) Ubah literal `'staff'` → `'finance'` atau `'admin'` di ketiga lokasi (perubahan paling kecil, migrasi `CREATE OR REPLACE FUNCTION`), atau
   - (b) Tambah `'staff'` ke CHECK via migrasi `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ...`.
   - Pertimbangkan: mana yang lebih benar secara semantik? `actor_type` menyatakan **jenis aktor**, dan aktor yang menyetujui refund adalah finance/admin. Jadi (a) lebih tepat secara makna.
5. Buat migrasi **aditif baru** (jangan edit migrasi lama). Nama file baru dengan timestamp terbaru.
6. Tidak perlu RPC baru; ini perbaikan fungsi yang sudah ada.
7. Tidak perlu perubahan UI.
8. **Test wajib:**
   - Positif: approve refund → status `approved`, history tercatat, tanpa error.
   - Positif: process refund → status `completed`, payment `refunded`, entitlement dicabut.
   - Negatif: refund tanpa permission → `FORBIDDEN`.
   - Negatif: process refund dari status salah → `INVALID_STATE`.
   - Idempotency: panggil process 2× → tidak dobel efek.
   - Backward-compat: order lama masih bisa dibuka.
9. Update `docs/audit/` — tandai temuan A-01 sebagai diperbaiki + bukti.
10. Lapor status akhir.

**BAGIAN B — Desain store credit (JANGAN implementasi sebelum keputusan owner):**

1. Tulis dokumen desain: `docs/marketplace/design-store-credit.md`.
2. Isi dokumen:
   - Definisi masalah & tujuan bisnis (mengapa saldo, bukan transfer).
   - **Perbedaan Skenario A vs B** — tegaskan A tidak butuh saldo.
   - Skema ledger yang diusulkan (tabel, kolom, constraint, index) — **nullable/aditif**, konsisten dengan aturan migrasi AGENTS.md.
   - Alur: refund → credit saldo; saldo → dipakai belanja.
   - Idempotency & reconciliation plan.
   - RLS & authz plan.
   - **Risiko legal** + keputusan owner yang dibutuhkan.
   - Non-goal eksplisit (mis. belum ada payout saldo ke bank, belum ada transfer antar-user).
3. **Jangan buat tabel/UI/flow.** Cukup desain + keputusan.
4. Tandai semua yang butuh keputusan sebagai `OWNER_DECISION_REQUIRED`.

---

### O — Output

Laporan akhir WAJIB berisi:

1. **Current evidence** — kondisi sebelum perubahan (dengan file:line).
2. **Problem solved** — masalah nyata yang ditangani.
3. **Files changed** — daftar file aktual (bukan rencana).
4. **Database/domain changes** — migrasi, constraint, RPC.
5. **Authorization impact** — RLS/permission/ownership.
6. **Financial/data integrity impact** — invariant yang dijaga.
7. **UI/UX impact** — termasuk loading/empty/error/denied state.
8. **Tests executed** — command + hasil nyata (bukan klaim).
9. **Backward compatibility** — dampak ke order/payment/entitlement lama.
10. **Remaining gaps** — pakai status: `VERIFIED` / `PARTIALLY_VERIFIED` / `SCHEMA_ONLY` / `UI_ONLY` / `NOT_IMPLEMENTED` / `OWNER_DECISION_REQUIRED`.

---

### Acceptance Criteria

**Bagian A (Wajib):**
- [ ] Refund approve & process benar-benar berjalan (dibuktikan test), tidak rollback.
- [ ] Constraint `actor_type` konsisten; tidak ada literal ilegal tersisa.
- [ ] Migrasi **aditif**; histori migrasi lama tidak diubah.
- [ ] `order_status_histories` + `audit_logs` tetap tertulis tiap transisi.
- [ ] Test positif + negatif + idempotency lulus, dengan output nyata.
- [ ] Order/payment/entitlement lama tidak rusak (smoke test).
- [ ] Dokumentasi audit diperbarui.

**Bagian B (Desain):**
- [ ] Dokumen desain ada, termasuk skema ledger usulan.
- [ ] Perbedaan Skenario A vs B dinyatakan eksplisit.
- [ ] Risiko legal ditandai `OWNER_DECISION_REQUIRED` — tidak diklaim aman.
- [ ] Tidak ada tabel/UI/flow yang dibuat sebelum keputusan owner.
- [ ] Tidak ada "saldo" yang ditampilkan tanpa ledger.

---

### Global Execution Constraints

1. **Inspect before editing** — sebut file/migrasi/RPC/tabel/policy/test yang tepat.
2. **Evidence-before-claim** — pakai status vocabulary.
3. **Jangan fabrikasi** kode, tabel, kredensial, kebijakan, hasil test.
4. **Migrasi aditif** — jangan rewrite histori migrasi / destructive tanpa rollback.
5. **Preserve** order/payment/entitlement lama.
6. **Uang** = server-authoritative, idempoten, teraudit, transaksi aman.
7. **Setiap objek sensitif** butuh object-level authz + RLS.
8. **Anti AI-slop** — tidak ada placeholder, fake balance, duplikasi sumber kebenaran, UI yang pura-pura ada.
9. **Jaga arah visual Ebrystore**.
10. **Slice baru DONE** jika schema/domain/server/UI/test/evidence konsisten, atau menyatakan apa yang blocked.
11. **Jangan ubah** workflow akademik legacy.
12. **Jaga integrasi Lovable** — jangan force-push/rebase/amend histori.

---

### Stop / Escalate Conditions

Berhenti & tandai, jangan menebak, bila:
- **Kebijakan uang ambigu** — apakah saldo bisa dicairkan ke bank? Apakah wajib ada opsi transfer? → `OWNER_DECISION_REQUIRED`.
- **Klaim legal** (uang elektronik, dompet digital) tanpa dasar → `OWNER_DECISION_REQUIRED`.
- **Migrasi produksi ireversibel** tanpa backup/rollback.
- Permintaan yang membuka secret atau data privat pembeli.

Catat blocker, kerjakan bagian yang tidak bergantung padanya, jangan mengarang keputusan.

---

### Final Instruction

Jangan minta konfirmasi untuk hal teknis kecil yang bisa dibuktikan dari codebase. Untuk keputusan yang menentukan **uang, legal, atau kebijakan bisnis** → tandai `OWNER_DECISION_REQUIRED`, kerjakan bagian yang tidak bergantung padanya, jangan mengarang.

**Urutan yang benar:** perbaiki refund dulu (Bagian A) — karena itu bug nyata yang memblokir. Store credit (Bagian B) dirancang, tapi **jangan diimplementasi** sampai keputusan owner.

---

## Lampiran — Mengapa Slice Ini Dua Bagian

| Bagian | Status | Bisa dikerjakan sekarang? |
|---|---|---|
| A — Perbaiki refund | `PARTIALLY_VERIFIED` (rusak) | ✅ Ya — bug jelas, perbaikan kecil |
| B — Store credit | `NOT_IMPLEMENTED` | ⚠️ Desain saja — butuh keputusan owner (legal + kebijakan) |

**Jangan gabungkan implementasinya.** Bagian A adalah perbaikan bug. Bagian B adalah fitur baru yang mengubah cara uang bergerak. Mencampurnya melanggar prinsip "satu vertical slice per waktu" MGRCAO.
