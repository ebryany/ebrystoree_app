# EBRYSTORE — Manual Seller Withdrawal & Rekber Financial System Implementation

Tanggal: 2026-10-27
Status rilis: **IMPLEMENTED_AND_VERIFIED_IN_STAGING_CODE — MENUNGGU APPLY MIGRATION + AKTIVASI GATE**
(migration belum diterapkan ke Supabase production; `feature_manual_payout` default MATI;
belum ada pengujian di Postgres sungguhan — lihat bagian H dan K)

Implementasi sesuai MASTER PROMPT "Manual Rekber, Seller Wallet & Withdrawal System":
minimum penarikan bruto Rp5.000, fee 15% (1500 bps), payout transfer bank manual oleh
finance, ledger integrity, finance approval. **Tidak ada transfer nyata yang dijalankan
dan tidak ada deployment production.**

---

## A. Existing architecture findings

Audit (Batch 1) menemukan arsitektur berikut — fitur withdrawal dibangun DI ATAS ini,
bukan sistem kedua:

| Komponen | Lokasi | Peran |
|---|---|---|
| `seller_ledger` | `20260930100015_seller_earnings_ledger.sql` | Buku besar append-only pendapatan seller. Saldo **DIHITUNG**, bukan kolom. `source_type` sudah menyediakan `'payout'` sejak awal (slot kosong). |
| `get_store_finances` | `20261002130000_digital_seller_funds_release.sql:59` | Sumber kebenaran bucket: `ledger_balance`, `held_receipt`, `refund_reserved`, `available_balance = ledger − refund_reserved`. |
| `credit_seller_earnings` | `20261003120000_marketplace_service_finance_dispatch.sql:28` | Rilis dana: digital wajib receipt `accepted`; jasa marketplace wajib `accept_service_delivery`; idempoten `sale:<order>:<store>`. |
| Refund | `process_refund` (file sama) | Debit seller per store `refund:<id>:<store>`; hanya full single-store; menolak `platform_fee <> 0`. |
| Settings registry | `src/lib/website-settings.ts` | Key existing `marketplace_min_payout` (default lama 50000, tanpa consumer — status NOT_VERIFIED di audit 2026-10-26). `admin_fee` Rp2.500 adalah fee flat checkout — **tidak digabung** dengan withdrawal fee. |
| RBAC | `permissions`/`role_permissions`/`has_permission()` | Pola permission transaksional (`payments.*`, `refunds.*`). |
| Yang TIDAK ada sebelumnya | — | Tabel payout/withdrawal, bank account, antrean finance payout, fee 15%, permission payout. |

Keputusan desain terpenting: **reservasi penarikan = entri debit `source_type='payout'`
di `seller_ledger`** (bukan kolom reserved). Karena saldo dihitung dari ledger,
`available_balance` turun otomatis saat pengajuan dan pulih saat pembatalan — satu
sumber kebenaran, tanpa state terpisah yang bisa desinkron. Entri payout dibiarkan
`order_id NULL` sehingga matematika refund per-order `process_refund` tidak tersentuh.

## B. Implemented financial policy

- `marketplace_min_payout` (key existing, TIDAK dibuat duplikat): nilai DB ditimpa
  50000 → **5000** hanya bila masih persis default lama; default registry → 5000.
- Fee: key baru `marketplace_withdrawal_fee_bps` = **1500** (15%), rentang sah 0–5000.
- Rumus (identik di SQL CHECK, SQL RPC, dan TS): `fee = (gross × bps + 5000) / 10000`
  (pembagian integer, half-up). Contoh 5.000 → 750/4.250; 50.000 → 7.500/42.500.
- **Snapshot**: `withdrawals.fee_bps` + `fee_amount` + rekening tujuan tersimpan saat
  pengajuan. Perubahan setting/rekening belakangan tidak pernah menyentuh pengajuan lama
  (CHECK immutable `fee_amount = (gross_amount*fee_bps+5000)/10000`,
  `net_amount = gross_amount − fee_amount`, `fee_bps BETWEEN 0 AND 5000`).
- Fee menjadi pendapatan platform **hanya saat `complete_withdrawal`** (transfer
  direkonsiliasi selesai). Reject/cancel/rekonsiliasi-cancelled → fee tidak dipungut.
- Guardrail dihormati: `admin_fee` checkout, komisi penjualan (O-01, tetap 0),
  refund fee, buyer fee — tidak satu pun diubah.

## C. Rekber lifecycle

Earnings hanya berasal dari jalur rilis existing yang tidak diubah: manual payment
diverifikasi finance (`verify_manual_payment`) → order `paid` + receipt `pending`
(digital, funds HELD) → buyer konfirmasi (`confirm_digital_receipt`) atau buyer menerima
delivery jasa (`accept_service_delivery`) → order `completed` → `credit_seller_earnings`
→ ledger credit → `available_balance` naik → **baru bisa ditarik**. Refund aktif
mem-bekukan saldo via `refund_reserved` (dihitung), jadi dana yang sedang disengketa
tidak dapat masuk pengajuan penarikan. Bukti transfer buyer tetap bukan dasar rilis.

## D. Seller withdrawal implementation

- **Migration** `supabase/migrations/20261027100000_seller_withdrawal_system.sql`:
  - Tabel `seller_bank_accounts` (1 rekening aktif per toko; ubah hanya via RPC
    `save_seller_bank_account` ber-audit; nomor divalidasi `^[0-9]{6,25}$`).
  - Tabel `withdrawals` (status CHECK 7 nilai, snapshot fee + rekening, nomor
    `WDR-YYYYMMDD-NNNNNN`, `idempotency_key UNIQUE`).
  - Tabel `withdrawal_events` (timeline audit per pengajuan).
  - RLS: seller lihat miliknya, staff dengan `payouts.view` lihat semua;
    INSERT/UPDATE/DELETE di-REVOKE + tanpa policy (mutasi hanya via SECURITY DEFINER).
  - RPC: `get_my_withdrawal_policy`, `request_withdrawal`, `cancel_own_withdrawal`,
    `review_withdrawal`, `record_withdrawal_transfer`, `complete_withdrawal`,
    `mark_withdrawal_reconciliation`, `resolve_withdrawal_reconciliation`,
    `notify_payout_staff`, `next_withdrawal_number`.
- **Transaksi pengajuan** (`request_withdrawal`, satu transaksi):
  1. auth + idempotency pre-check → 2. gate fitur → 3. toko `active` (FOR UPDATE) →
  4. rekening ada → 5. baca kebijakan (setting_int + clamp) → 6. validasi nominal →
  7. `pg_advisory_xact_lock(710006, hashtext(store))` → 8. re-check idempotency →
  9. `available_balance` ≥ gross → 10. hitung fee/net → 11. insert withdrawal →
  12. insert ledger debit → 13. event + admin_task `review_payout` + notifikasi + audit.
  Gagal di langkah mana pun = rollback total; dua pengajuan paralel tidak bisa
  mengonsumsi saldo yang sama.
- **UI seller**: `src/components/ebry/withdrawal-panel.tsx` di
  `seller.keuangan.tsx` — saldo tersedia, registrasi/ubah rekening, form nominal,
  breakdown fee real-time (preview saja; server menghitung ulang), status UI
  (min/saldo kurang/valid/submit), riwayat penarikan (bruto−fee=neto, rekening
  tersamarkan, alasan penolakan, tombol batalkan untuk requested/approved),
  warning transfer manual non-instan.
- **Server fns**: `src/lib/seller.functions.ts` (getWithdrawalPolicy,
  listMyWithdrawals, saveSellerBankAccount, requestWithdrawal, cancelWithdrawal) +
  rate limit fail-closed `seller.payout` (5/300 dtk).

## E. Finance payout workflow

- **Antrean**: `/admin/payouts` (filter status, cari nomor) + detail
  `/admin/payouts/$id` (ringkasan, rekening tujuan snapshot penuh, timeline event,
  tindakan per status). Nav "Payout Seller" (permission `payouts.view`).
- **Alur**: requested → (approve/reject oleh `payouts.approve`) → approved →
  catat transfer + bank reference (`payouts.process`) → transferred → konfirmasi
  selesai ATAU buka rekonsiliasi → completed / (needs_reconciliation → keputusan
  `payouts.approve`: completed atau cancelled+reversal). Task `review_payout` muncul
  di /admin/tasks. Notifikasi ke seller & staff di setiap transisi.
- **Separation of duties**: approve (payouts.approve) dan proses transfer
  (payouts.process) adalah permission terpisah; keduanya diberikan ke finance+admin
  (operator tunggal saat ini). **Kontrol anti self-approval di database**: pemilik
  toko tidak bisa review/transfer/complete/rekonsiliasi payout toko sendiri
  (`SELF_APPROVAL_FORBIDDEN`) bahkan bila memegang permission. Risiko satu-operator
  dicatat di bagian J.
- Transfer tidak pernah dijalankan kode; hanya dicatat dengan referensi bank.
  Status tak pasti tidak pernah auto-retry atau auto-reverse.

## F. Ledger integrity

- Entri ledger payout: debit `payout:<withdrawal_id>:reserve` saat pengajuan;
  kredit `reversal` `payout:<withdrawal_id>:reversal` saat reject/cancel/
  rekonsiliasi-cancelled. Insert fail-loud (tanpa ON CONFLICT) di dalam transaksi.
- Rekonsiliasi contoh 50.000: available −50.000 (reservasi) → setelah transfer
  selesai: 42.500 cash ke seller + 7.500 fee platform = 50.000 settled. Total
  debit/kredit ledger tetap konsisten; tidak ada kolom saldo baru.
- Economic events: requested/approved/rejected/cancelled/transferred/completed/
  reconciliation_opened/resolved tersimpan di `withdrawal_events` + `audit_logs`
  (actor, waktu, alasan) + notifikasi. Laporan payout liability marketplace
  (O-03/O-04) sengaja belum ditambahkan ke admin_marketplace_overview — di luar
  patch minimal ini.

## G. Security controls

- RLS 3 tabel baru + REVOKE INSERT/UPDATE/DELETE; mutasi hanya RPC SECURITY DEFINER
  `SET search_path = public`, qualified names, EXECUTE di-REVOKE dari PUBLIC/anon.
- Permission: `payouts.view/approve/process` (finance + admin; super_admin bypass
  ter-audit via assertPermission).
- Idempotency: `withdrawals.idempotency_key UNIQUE` (client UUID per form-session,
  validasi ≥8 char) + re-check di dalam lock; retry timeout mengembalikan pengajuan
  yang sama, bukan menggandakan.
- Concurrency: `pg_advisory_xact_lock(710006, hashtext(store_id))` — keyspace
  terpisah dari 710003 (kredit pembeli) dan 710004 (checkout) — diambil SEBELUM
  saldo dibaca (pola H-3 `apply_credit_to_order`).
- Anti self-approval, store harus `active`, feature gate `feature_manual_payout`
  default **false** (saklar legal/operational readiness), nominal divalidasi ulang
  server, rate limit fail-closed, audit trail penuh.
- Threat model dari prompt: setiap skenario (double withdrawal, request tampering,
  dua finance approve sama request, rekening diganti setelah request, dsb.)
  dipetakan ke kontrol — lihat test WD-* dan kontrak SQL.

## H. Test evidence

**Dijalankan & lulus** (`npx vitest run`; 42 file, 554 test lulus):

- `src/lib/__tests__/withdrawal-fee.test.ts` (9 test): tabel fee dari master prompt
  (5.000/10.000/25.000/50.000/100.000), half-up pecahan (350→53, 5003→750, 5004→751),
  cap bps, kesamaan rumus TS ↔ SQL CHECK.
- `src/lib/__tests__/withdrawal-invariants.test.ts` (16 test): gate minimum/saldo/
  held/refund, reservasi & reversal, dua pengajuan paralel (simulasi terkunci),
  state machine lengkap, idempotency.
- `src/lib/__tests__/withdrawal-sql-contract.test.ts` (28 test): kontrak statis SQL —
  urutan lock-sebelum-baca, dua idempotency check, fail-loud tanpa ON CONFLICT,
  snapshot, feature gate, transition guard tiap RPC, anti self-approval di 5 RPC,
  RLS + REVOKE, permission, settings binding, registry.
- Build `vite build` ✓; `tsc --noEmit` bersih dari error baru (sisa 6 error
  pre-existing di `route-fallback.test.tsx` & `__root.tsx:153`, terverifikasi
  pre-existing via stash); eslint 0 error.

**Dijalankan & gagal (pre-existing, bukan dari perubahan ini)**: 9 test homepage
(`marketplace-home.test.tsx` ×8, `public-storefront.test.tsx` ×1) — gagal identik
sebelum dan sesudah perubahan (diverifikasi via `git stash`).

**Disiapkan, BELUM dijalankan** (butuh Postgres sungguhan; tidak ada Docker/psql di
mesin ini): `.zcode/withdrawal-rpc-test.sql` — harness lengkap untuk staging
(FEE-01..06, WD-00..11: fitur gate, bank wajib, minimum, saldo, idempotency,
RLS antar-seller, anti self-approval, lifecycle penuh, rekonsiliasi, cleanup) +
prosedur concurrency dua koneksi (CONC). **Atomicity PostgreSQL belum dibuktikan
dengan database sungguhan** — unit test bukan pengganti integration test.

## I. Files changed

| File | Alasan |
|---|---|
| `supabase/migrations/20261027100000_seller_withdrawal_system.sql` | Baru — tabel, RLS, RPC, permission, settings, nomor dokumen. |
| `src/lib/withdrawal.ts` | Baru — rumus fee bersama TS (mirror SQL) untuk preview & test. |
| `src/lib/admin-payout.functions.ts` | Baru — server fns antrean/detail/aksi finance (assertPermission + RPC). |
| `src/components/ebry/withdrawal-panel.tsx` | Baru — UI tarik saldo seller. |
| `src/routes/_authenticated/admin/payouts.index.tsx` / `payouts.$id.tsx` | Baru — antrean & detail payout finance. |
| `src/lib/seller.functions.ts` | +5 server fn payout, +14 pesan error RPC. |
| `src/lib/website-settings.ts` | default min 5000, field `marketplace_withdrawal_fee_bps`, flag `feature_manual_payout` (default false, confirm peringatan legal). |
| `src/lib/rate-limit.server.ts` | bucket `seller.payout` & `admin.payout.decision` (fail-closed). |
| `src/lib/admin-nav.ts` | Nav "Payout Seller". |
| `src/routes/_authenticated/seller.keuangan.tsx` | Panel withdrawal + realtime refresh. |
| `src/integrations/supabase/types.ts` | Tipe 3 tabel + 9 RPC (sinkron dengan migration). |
| `src/lib/__tests__/withdrawal-{fee,invariants,sql-contract}.test.ts` | Test (53 test). |
| `.zcode/withdrawal-rpc-test.sql` | Harness integration test staging (belum dijalankan). |

## J. Remaining decisions (Owner)

1. **Legal & compliance gate** (PP 80/2019, Permendag 19/2026, ketentuan BI, pajak):
   wajib selesai + disetujui SEBELUM `feature_manual_payout` dinyalakan untuk uang
   nyata. Jangan menyebut "escrow berizin"/"rekber resmi" tanpa dasar verifiable.
2. **Pengakuan komisi penjualan** (O-01) tetap 0 — withdrawal fee 15% adalah biaya
   pencairan, terpisah dari komisi penjualan. Jangan konfluen di `seller_ledger.platform_fee`.
3. **Payer biaya transfer bank**: saat ini di luar 15% (ditanggung marketplace secara
   implisit). Perlu keputusan eksplisit bila ingin dipindahkan ke seller.
4. **SLA pencairan**: belum ditetapkan (disengaja — transfer manual, tanpa janji waktu).
5. **Separation of duties**: saat ini satu operator finance bisa approve + transfer.
   Risiko dicatat; kontrol kompensasi = audit trail + anti self-approval. Bila tim
   bertambah, pisahkan `payouts.approve` dan `payouts.process` ke dua orang.
6. **Risiko refund setelah payout** (pre-existing R-05): bila refund selesai terjadi
   setelah dana tertarik, saldo ledger bisa minus — butuh proses adjustment/recovery
   yang sah (belum dibangun, di luar scope ini).
7. **Apply migration ke Supabase** + deploy VPS: butuh approval terpisah (lihat K).

## K. Release decision

**PARTIALLY_IMPLEMENTED** — kode, kebijakan, UI, dan test kontrak lengkap dan lulus;
dua hal mencegah klaim penuh sebelum langkah berikut:

1. **Integration test di Postgres sungguhan belum dijalankan** — jalankan
   `.zcode/withdrawal-rpc-test.sql` di staging/DB throwaway (termasuk concurrency
   dua koneksi) setelah migration diterapkan di sana.
2. **Migration belum diterapkan** dan **feature_manual_payout sengaja OFF**.

Langkah aktivasi berurutan saat siap (masing-masing butuh approval):
(a) apply migration `20261027100000` → (b) jalankan harness SQL di staging →
(c) deploy aplikasi ke VPS → (d) selesaikan legal gate → (e) nyalakan
`feature_manual_payout` di /admin/settings → (f) uji end-to-end dengan dana sintetis
di staging → (g) baru aktif untuk transaksi riil. Tidak ada deployment, migration
production, atau transfer nyata yang dilakukan dalam pengerjaan ini.
