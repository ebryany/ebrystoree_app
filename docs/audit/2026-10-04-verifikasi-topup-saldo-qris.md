# Verifikasi: Top-Up Saldo Ebrystore via QRIS SumoPod

Tanggal: 2026-10-04 · Rencana: [`../marketplace/08-rencana-mgrcao-v3-topup-saldo-qris.md`](../marketplace/08-rencana-mgrcao-v3-topup-saldo-qris.md)
Riset: [`2026-10-04-riset-topup-saldo-qris-sumopod.md`](./2026-10-04-riset-topup-saldo-qris-sumopod.md)
Status: **SELESAI — VERIFIED (kode & data), dengan 1 catatan jujur di bagian 5**

---

## 1. Yang dikerjakan

| Slice | Isi | Status |
|---|---|---|
| 1 | Migrasi `20261004100000_credit_topup.sql`: tabel `credit_topups`, CHECK `source_type` + `topup`, 5 fungsi (create/attach/settle/expire/next-number), RLS 2 policy, sequence, cron `expire_topups` | TERPASANG |
| 2 | `credit-topup.functions.ts` (createCreditTopup, checkCreditTopup), `credit-topup.server.ts` (settleCreditTopup), webhook jalur kedua `handleTopupEvent`, rate limit bucket `topup.create` | TERPASANG |
| 3 | `topup-panel.tsx` (panel QRIS), `topup-dialog.tsx` (dialog + tombol), slot `action` di `BalanceCard`, wiring dashboard + halaman saldo, perbaikan copy usang, label `topup: "Isi saldo"` | TERPASANG |

Keputusan UI (arahan Owner): **satu card saldo saja** di dashboard utama; tombol "Isi
Saldo" di kiri "Riwayat saldo"; panel QRIS di dalam dialog (bukan card kedua). Scope
tidak menyentuh card saldo penjual.

## 2. Bukti database (integration test langsung)

`node .zcode/topup-rpc-test.sql` — semua di dalam transaksi yang di-ROLLBACK:

| # | Uji | Hasil |
|---|---|---|
| 1 | `create_credit_topup(25000)` | `TOP-20261004-000003`, status `waiting_payment` |
| 2 | `attach_credit_topup_qris` | ok |
| 3 | `settle_credit_topup(..., 25000)` | `credited`, saldo 25000 |
| 4 | Settle kedua kali | `already_settled` (idempoten) |
| 5 | Ledger untuk topup itu | **1 entri**, 25000 (tidak dobel) |
| 6 | Settle dengan bayar kurang (40000 < 50000) | ditolak `AMOUNT_MISMATCH` |
| 7a | Nominal 5000 | ditolak `AMOUNT_TOO_SMALL` |
| 7b | Nominal 2000000 | ditolak `AMOUNT_TOO_LARGE` |
| 8 | `job_expire_topups` | 1 top-up → `expired` |
| 9 | Settle top-up expired | ditolak `INVALID_STATE` |

Hak akses terverifikasi (script `credit-topup-deploy.mjs verify`): anon **tidak bisa**
create/settle; authenticated bisa create tapi **tidak bisa** settle; service_role bisa
settle & expire; RLS tabel aktif dengan 2 policy (own + staff `payments.view`);
CHECK `source_type` memuat `topup`.

## 3. Bukti UI (browser, dev server)

| Cek | Hasil |
|---|---|
| Card saldo di `/dashboard` | **1 card** (`cardCount=1`), teks: "Saldo Ebrystore Rp 25.000 ... Isi Saldo, Riwayat saldo" |
| Urutan tombol | `["Isi Saldo", "Riwayat saldo"]` — Isi Saldo di kiri, sesuai arahan |
| Klik "Isi Saldo" | Dialog terbuka: 4 preset (10rb/25rb/50rb/100rb) + "Nominal lain" + batas 10rb-1jt |
| SumoPod belum dikonfigurasi lokal | Pesan jujur "Pembayaran QRIS belum dikonfigurasi. Coba lagi nanti." — **tidak crash, tidak QR kosong** |
| Saldo setelah settle | Card menampilkan `Rp 25.000` + caption "Bisa dipakai untuk membayar pesanan" |
| Riwayat di `/dashboard/saldo` | "Isi saldo · TOP-20261004-000005 · +Rp 25.000" (label `topup` bekerja) |
| Copy usang | "Belum bisa dipakai untuk membayar pesanan" hilang; copy baru jujur soal pencairan |
| Mobile 390px | Tanpa overflow (`bodyScrollWidth=375`); dialog full-width (390) |

Catatan: data saldo 25.000 di atas adalah **simulasi** untuk membuktikan rantai
`create → attach → settle → ledger → UI`, sudah dibersihkan setelah verifikasi
(0 top-up, 0 ledger). User test `topup-verify@ebrystore.local` juga sudah dihapus.

## 4. Test & build

| Cek | Hasil |
|---|---|
| `credit-topup-invariants.test.ts` (baru) | **9/9 lulus** |
| `npm run test:unit` | 420 lulus / 431; 11 gagal = **baseline lama** (marketplace-home.test.tsx, terbukti gagal juga tanpa perubahan ini) |
| `npx tsc --noEmit` file terubah | bersih (22 error tersisa = `po-thread.tsx` + `route-fallback.test.tsx`, pra-ada) |
| `npx eslint` file terubah | 0 error (warning `any` mengikuti pola repo) |
| `npm run build` | sukses |

## 5. Catatan jujur

1. **Uji end-to-end ke provider SumoPod belum dilakukan** — env `SUMOPOD_*` tidak ada
   di `.env` lokal (hanya terkonfigurasi di runtime hosting). Yang terverifikasi:
   seluruh logika kita (RPC, idempotensi, UI, pesan error jujur) + jalur settle
   simulasi. Uji bayar sungguhan perlu di lingkungan yang punya kredensial sandbox.
2. **Webhook jalur top-up belum diuji dengan payload nyata** — logikanya mengikuti
   pola jalur order yang sudah terbukti, tapi bukti empiris menunggu event provider
   sungguhan.
3. **Regulasi (O-05) masih `OWNER_DECISION_REQUIRED`** — fitur ini menambah uang
   masuk yang disimpan sebagai saldo, makin dekat ke uang elektronik. Jangan
   production sebelum keputusan Owner.
4. **Keputusan nominal (O-15) & fee (O-16)** dipakai usulan default: min 10rb, maks
   1jt, rate limit 5×/10 menit, kredit = nominal penuh (fee ditanggung platform).
   Mudah diubah (satu tempat di RPC + konstanta).
5. **Types Supabase di-regenerate** (`supabase gen types`) — diff bersih: hanya
   tambahan blok `credit_topups` + `graphql_public` bawaan CLI baru.

## 6. Rollback

- DB: `DROP TABLE credit_topups`; `DROP FUNCTION create_credit_topup,
  attach_credit_topup_qris, settle_credit_topup, job_expire_topups, next_topup_number`;
  `DROP SEQUENCE topup_number_seq`; `cron.unschedule('expire_topups')`; kembalikan
  CHECK `source_type` tanpa `topup`.
- Kode: hapus `credit-topup.functions.ts`, `credit-topup.server.ts`,
  `topup-panel.tsx`, `topup-dialog.tsx`; revert slot `action` di `cards.tsx` +
  wiring di `dashboard.index.tsx`/`dashboard.saldo.tsx`.
- Tanpa data produksi → tanpa risiko data.
