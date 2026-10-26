# EBRYSTORE — Seller Withdrawal & Admin Notification Integration Report

Tanggal: 2026-10-27 | Status: **PARTIALLY_VERIFIED** (rantai kode & DB terverifikasi;
runtime E2E withdrawal nyata menunggu staging — lihat bagian G)

Pertanyaan pemicu: "Saat seller request withdrawal, apakah notifikasi muncul di
dashboard admin?" — Jawaban singkat: **ya, dan kini tampil juga di dalam shell
dashboard admin**. Sebelum perbaikan ini notifikasi sudah tersimpan & muncul di
lonceng header website publik, tetapi shell `/admin/*` tidak memuat lonceng, dan
item notifikasi tidak punya tautan ke detail permintaan.

## A. Existing System Findings

Rantai yang SUDAH ada sejak implementasi withdrawal (diverifikasi ke kode):

| Tahap | Mekanisme | Bukti |
|---|---|---|
| Withdrawal dibuat | RPC `request_withdrawal` — satu transaksi: validasi → advisory lock → reservasi ledger → withdrawal → event | `20261027100000_seller_withdrawal_system.sql` |
| Notifikasi staff | `INSERT notifications` via `notify_payout_staff` (finance + admin + super_admin) DI DALAM transaksi yang sama | fungsi yang sama |
| Antrean finance | Tabel `withdrawals` + halaman `/admin/payouts` + task `review_payout` di `/admin/tasks` | `payouts.index.tsx`, `admin_tasks` |
| Persistensi | Tabel `notifications` (RLS `recipient_id = auth.uid()`), notif committed atomik bersama withdrawal | `20260728131438:169-172` |
| Realtime | Tabel `notifications` ada di publication `supabase_realtime`; bell subscribe per-penerima (`recipient_id=eq.{uid}`) | `20260728180436` (loop ADD TABLE), verifikasi live DB: publication berisi `notifications` ✓ |
| Unread badge | `listMyNotifications` + filter `read_at`, badge merah di lonceng | `notification-bell.tsx` |
| Seller updates | approved/rejected/transferred/completed/cancelled/reconciliation → notifikasi ke seller di tiap RPC | migration withdrawal |

Klasifikasi sebelum perbaikan: **PARTIALLY_CONNECTED** — event, persistensi,
realtime, dan antrean lengkap; yang kurang: (1) lonceng tidak dirender di shell
admin, (2) tidak ada deep-link ke detail, (3) seller tidak menerima tanda terima
pengajuan.

## B. Notification Flow (final)

```text
Seller Request → RPC request_withdrawal (SATU transaksi)
  ├─ validasi (fitur, toko aktif, rekening, min Rp5.000, saldo) 
  ├─ advisory lock 710006 + reservasi ledger debit payout
  ├─ INSERT withdrawals + withdrawal_events
  ├─ INSERT notifications → seller (tanda terima, baru)
  ├─ INSERT notifications → finance/admin/super_admin (notify_payout_staff)
  ├─ INSERT admin_tasks 'review_payout'
  └─ COMMIT
       ↓ Supabase Realtime (INSERT notifications, filtered per recipient)
Lonceng admin (di shell /admin SEKARANG) → badge +1, suara, toast
       → "Lihat permintaan" → /admin/payouts/$id
Finance review/approve/reject/transfer/complete (RPC, permission payouts.*)
       → notifikasi status ke seller → seller "Lihat" → /seller/keuangan
```

Notifikasi hanya lahir bila reservasi berhasil (commit). Gagal di langkah mana
pun = rollback total, tidak ada notifikasi palsu. Tautan tidak memberi akses
baru: `/admin/payouts/$id` tetap dijaga `payouts.view` (server fn + RPC + RLS),
`/seller/keuangan` tetap RLS per-toko.

## C. Files & Components

| File | Perubahan |
|---|---|
| `src/routes/_authenticated/admin/route.tsx` | `NotificationBell` dirender di header shell admin (gap utama). |
| `src/components/ebry/notification-meta.tsx` | Helper `isPayoutStaff(roles)`. |
| `src/components/ebry/notification-bell.tsx` | Query `getMyRoles` (cache key `["my-roles"]`, dibagi dengan site-header); item notifikasi payout mendapat tautan "Lihat permintaan" (staff) / "Lihat keuangan" (seller). |
| `src/routes/_authenticated/dashboard.notifikasi.tsx` | Pusat notifikasi: tautan "Lihat" per item payout, role-aware. |
| `supabase/migrations/20261027100000_...sql` | Tanda terima seller `payout.requested` di dalam transaksi `request_withdrawal` (pola receipt `submit_payment_proof`). |
| `src/lib/__tests__/withdrawal-sql-contract.test.ts` | +1 kontrak: notifikasi staff & tanda terima seller dalam transaksi yang sama. |

## D. Database Changes

Tidak ada tabel baru. Pemanfaatan: `notifications` (existing), `admin_tasks`
(existing), `withdrawal_events` (existing). Satu perubahan fungsi:
`request_withdrawal` kini menyisipkan 1 baris notifikasi untuk seller —
diterapkan ke produksi (repair + repush migration; diverifikasi
`pg_get_functiondef` berisi tanda terima ✓). Idempotensi notifikasi mengikuti
idempotensi withdrawal: idempotency key sama = transaksi kedua return duplicate
sebelum membuat notifikasi kedua (cek di dalam lock) → satu withdrawal, satu
reservasi, satu set notifikasi.

## E. Permission Enforcement

- Penerima staff: `user_roles` role finance/admin/super_admin (bukan "semua
  yang berlabel admin" — pakai tabel role, sama dengan `notify_payment_staff`).
- RLS `notifications_select_own`: tiap penerima hanya melihat miliknya; anon
  tidak bisa SELECT.
- Deep-link staff → `/admin/payouts/$id`: dijaga `payouts.view` di server fn,
  `has_permission` di RPC, RLS `withdrawals`; admin tanpa izin payout tidak
  bisa memproses (tombol disabled + RPC menolak `FORBIDDEN`).
- Deep-link seller → `/seller/keuangan`: RLS per-toko; seller A tidak melihat
  withdrawal seller B. Customer biasa tidak pernah menerima notifikasi payout.

## F. Financial Integrity

Tidak ada perubahan fee 15%, minimum Rp5.000, reservasi atomik, state machine,
atau ledger. Notifikasi berada DI DALAM transaksi finansial (pola event-outbox
sederhana milik codebase): committed bersama, rollback bersama; kegagalan
pengiriman realtime tidak memengaruhi saldo (realtime hanya penyampai — DB
tetap sumber kebenaran; queue `/admin/payouts` selalu benar). SMTP tidak
dilibatkan sama sekali pada alur ini — gangguan email tidak berdampak.

## G. Tests

- `vitest`: 555 lulus termasuk 30 kontrak withdrawal; 9 gagal = pre-existing
  homepage (baseline terverifikasi via stash).
- `tsc --noEmit`: bersih dari error baru; eslint 0 error pada file yang diubah.
- Verifikasi DB live (read-only): publication `supabase_realtime` memuat
  `notifications` ✓; `pg_get_functiondef(request_withdrawal)` berisi tanda
  terima seller ✓.
- Build `NITRO_PRESET=node-server`: exit 0.
- **Runtime E2E (seller menarik → lonceng admin berbunyi) belum dijalankan di
  produksi** — sengaja: butuh seller sintetis + saldo uji + fitur ON di
  lingkungan staging, dan dilarang diuji dengan dana produksi. Mekanisme
  realtime + bell yang sama sudah menjadi jalur notifikasi order/pembayaran
  yang berjalan di produksi; risiko tambahan terbatas pada mapping link baru
  yang tertutup unit-kontrak dan tipe TypeScript.

## H. Final Status

**PARTIALLY_VERIFIED** — menunggu satu runtime pass di staging
(buat seller uji → ajukan withdrawal → cek lonceng + badge + tautan) untuk
naik ke `VERIFIED`. Perubahan frontend belum di-deploy (menunggu persetujuan;
migration tanda terima seller sudah diterapkan).
