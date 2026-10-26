# 01 — Rencana Perbaikan H-1..H-4 (MGRCAO V3)

Tanggal: 2026-10-02 · Prasyarat: `docs/security/00-security-audit-mgrcao-v3.md`
Status scope: **DIKUNCI — hanya H-1, H-2, H-3, H-4. Tidak ada yang lain.**

---

## M — Mindset

Problem-first, perubahan terkecil, migrasi aditif. Setiap fix menyasar **root cause** di
boundary database (bukan menambal handler saja), karena keempat bug ini semuanya
dieksploitasi lewat jalur yang melewati application layer (REST langsung / konkurensi).

**Non-goals eksplisit (dilarang masuk scope ini):**
- M-1..M-12 dan L-1..L-10 dari laporan audit (reconcilasi amount QRIS, alokasi refund,
  webhook freshness, CSP, dsb.) — menunggu keputusan terpisah.
- Tidak mengubah schema tabel, tidak menambah kolom, tidak menyentuh handler TypeScript
  (semua fix di SQL; handler sudah benar, DB-nya yang bolong).
- Tidak rewrite migrasi lama — semua lewat `CREATE OR REPLACE` di migrasi baru.

## G — Goal

| ID | Tujuan terukur | Cara membuktikan |
|---|---|---|
| H-1 | User tanpa `tasks.update`/`tasks.assign` dan tanpa assignee TIDAK BISA claim/complete/cancel/reopen task siapa pun | Definisi terakhir `update_admin_task` memakai predikat `IS NOT TRUE` (NULL-safe) |
| H-2 | Seller TIDAK BISA membuat/mengubah baris produknya sendiri menjadi `moderation_status='approved'` lewat jalur API mana pun | Trigger `protect_moderation_fields` memaksa INSERT seller → `pending`; UPDATE seller tidak bisa menaikkan ke `approved`; admin/service_role tidak terganggu |
| H-3 | Dua `apply_credit_to_order` konkuren untuk user yang sama TIDAK BISA menghasilkan saldo negatif | Advisory lock transaksi per-user (`pg_advisory_xact_lock` dua-argumen) diperoleh SEBELUM baca saldo |
| H-4 | Cancel manual dan job expire TIDAK BISA mengembalikan kredit yang sama dua kali | Kunci idempotensi reversal tunggal `reverse:order:<id>` di KEDUA jalur + kursor job `FOR UPDATE SKIP LOCKED` |

## R — Role

Database security engineer. Satu peran, satu concern: otorisasi & konsistensi transaksi
di PostgreSQL/Supabase.

## C — Context (bukti saat ini)

| Objek | Definisi terakhir | Masalah |
|---|---|---|
| `update_admin_task` | `20260728180436_...sql:22-79` | Baris 38: `NOT (perm OR assignee)` → NULL saat assignee NULL & no perm → tidak raise |
| `digital_products` moderasi | `20260930100013_...sql:35,62-96` + grant `20260728115920_...sql:202` | Default `'approved'` + RLS UPDATE own-row tak batasi kolom moderasi + trigger hanya cek `<> 'approved'` |
| `apply_credit_to_order` | `20260930100005_...sql:29-84` | Lock `FOR UPDATE` di **order** (baris 40), saldo dibaca baris 48 → race lintas-order |
| `cancel_own_order` / `job_expire_orders` | `20261001100001_...sql:196-291` | Kunci `cancel:<id>` (207) vs `expire:<id>` (249) berbeda; kursor job tanpa lock (239-245) |

Fakta pendukung:
- `check_rate_limit` memakai `pg_advisory_xact_lock(hashtext(...))` bentuk satu-argumen
  (`20260930100009_...sql:49`) → lock baru pakai bentuk **dua-argumen** `(710003, hash)`
  agar keyspace terpisah, mustahil kolisi.
- Alur resmi yang harus tetap jalan: `submit_product_for_review` (seller: approved→pending
  boleh), `review_product` (admin via RPC: set approved boleh), insert produk platform
  via service_role (auth.uid() NULL → skip restriksi).

## A — Action

Satu migrasi aditif `20261002100001_fix_h1_h4_security.sql`, empat bagian:

1. **H-1** — `CREATE OR REPLACE update_admin_task`: satu perubahan saja,
   `ELSIF (...) IS NOT TRUE THEN RAISE`.
2. **H-2** — trigger baru `protect_moderation_fields` BEFORE INSERT OR UPDATE pada
   `digital_products`: lewati jika `auth.uid() IS NULL OR is_admin()`; baris seller
   (`store_id NOT NULL`): INSERT → paksa `pending` + null-kan note/reviewer; UPDATE →
   tolak transisi ke `approved`, kunci `reviewed_by/reviewed_at` ke nilai lama.
3. **H-3** — `CREATE OR REPLACE apply_credit_to_order`: tambah
   `PERFORM pg_advisory_xact_lock(710003, hashtext(user_id))` setelah cek duplikat,
   sebelum baca saldo. Body lain identik.
4. **H-4** — `CREATE OR REPLACE` kedua fungsi: kunci reversal seragam
   `reverse:order:<id>`; kursor job expire ditambah `FOR UPDATE SKIP LOCKED`.

Lalu test regresi statis `src/lib/__tests__/security-h1-h4.test.ts` (pola
`regression-fase0.test.ts`: baca file migrasi, urut kronologis, ambil definisi terakhir):
verifikasi keempat fix hadir dan tidak bisa "kembali rusak" diam-diam.

## O — Output

1. Migrasi di atas (aditif, ada header rollback di komentar).
2. Test regresi statis (tanpa klaim runtime: isolasi DB runtime tetap perlu uji
   integrasi terpisah di environment berizin).
3. `npm run test:unit` + `npm run lint` hijau.
4. Update status H-1..H-4 di laporan audit (`00-security-audit-mgrcao-v3.md`).
5. Laporan jujur: apa yang diverifikasi statis vs apa yang belum.
