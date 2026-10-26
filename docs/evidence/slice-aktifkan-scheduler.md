# Laporan Slice — Aktifkan Scheduler (FASE 0 #2)

Tanggal: 2026-09-30 · Slice: A-02 · Status: **VERIFIED (lokal)**
Lingkungan: **Supabase baru `wcxaheqnnsbhifpgiedk` SAJA — TIDAK production.**

---

## 1. Current Evidence (sebelum)

| Objek | Temuan | Bukti |
|---|---|---|
| `pg_cron` + `pg_net` | Sudah diinstal | `20260729024546:2-3` |
| 3 job function | Ada: `job_expire_orders`, `job_flag_overdue_tasks`, `job_check_sla_breach` | `20260729024546` |
| `cron.schedule()` | **0 hasil** (grep) | tidak pernah dijadwalkan |
| `runJobNow` permission | Pakai `settings.update` yang **tidak ada** di DB | `jobs.functions.ts:71`; DB hanya `settings.view`/`settings.manage` |

**Dampak:** job tidak pernah berjalan otomatis. Order kedaluwarsa menumpuk, SLA breach tak terdeteksi.
**Klasifikasi:** `NOT_IMPLEMENTED` (efektif) — kode ada, scheduler tidak.

---

## 2. Problem Solved

1. Job terjadwal via `pg_cron` → berjalan otomatis.
2. `runJobNow` diperbaiki ke permission yang benar → admin non-super bisa memicu manual.

---

## 3. Files Changed

| File | Isi |
|---|---|
| `supabase/migrations/20260930100006_schedule_jobs.sql` | **BARU** — `cron.schedule` untuk 3 job |
| `supabase/migrations/20260930100008_cleanup_cron_verify.sql` | Cleanup RPC verifikasi sementara |
| `src/lib/jobs.functions.ts` | `settings.update` → `settings.manage` |

---

## 4. Database/Domain Changes

Jadwal cron (idempoten — `unschedule` dulu lalu `schedule`):

| Job | Schedule | Arti |
|---|---|---|
| `expire_orders` | `*/10 * * * *` | setiap 10 menit |
| `flag_overdue_tasks` | `5 * * * *` | setiap jam (menit ke-5) |
| `check_sla_breach` | `*/30 * * * *` | setiap 30 menit |

---

## 5. Authorization Impact

- `runJobNow` kini butuh `settings.manage` (sebelumnya `settings.update` yang tidak ada → hanya super-admin bypass yang bisa).
- Job function tetap `REVOKE` dari klien; dijalankan oleh `pg_cron` (service context).

---

## 6. Financial/Data Integrity Impact

Tidak ada. Job hanya mengubah status order/task/notifikasi yang sudah lewat tenggat.

---

## 7. UI/UX Impact

Tidak ada perubahan UI. Halaman `/admin/jobs` sekarang tombol "Jalankan sekarang" berfungsi untuk admin (sebelumnya hanya super-admin).

---

## 8. Tests Executed (bukti nyata)

Setup: user + order `awaiting_payment` dengan `expired_at = 2020-01-01` (sudah lewat).

| # | Test | Hasil |
|---|---|---|
| 1 | Verifikasi `cron.job` | 3 job `active=true` dengan schedule benar ✅ |
| 2 | `job_expire_orders()` | `{"job":"expire_orders","affected":1}` ✅ |
| 3 | Status order | `awaiting_payment` → **`cancelled`** ✅ |
| 4 | `scheduled_job_runs` | `status=success, affected_count=1` ✅ |

**Verifikasi job terjadwal:**
```json
{ "job_count": 3, "jobs": [
  {"name":"check_sla_breach","schedule":"*/30 * * * *","active":true},
  {"name":"expire_orders","schedule":"*/10 * * * *","active":true},
  {"name":"flag_overdue_tasks","schedule":"5 * * * *","active":true}
]}
```

### Pembersihan
Data tes + RPC verifikasi dihapus. `__verify_cron` → 404 (hilang).

---

## 9. Backward Compatibility

- Job function tidak diubah.
- `runJobNow` hanya ganti nama permission (lebih permisif ke admin, sesuai maksud).
- Migrasi aditif; `cron.schedule` idempoten.
- **Rollback:** `SELECT cron.unschedule('expire_orders');` dst.

---

## 10. Remaining Gaps

| Item | Status |
|---|---|
| Scheduler aktif (3 job) | **VERIFIED** (lokal) |
| `runJobNow` permission | **VERIFIED** (lokal) |
| Job berjalan otomatis di production | ❌ belum (production tidak disentuh) |
| Verifikasi job benar-benar berjalan berkala (tunggu 10 menit) | `NOT_TESTED` — diuji via pemanggilan manual |

---

## 11. Catatan Penting

1. **Hanya di Supabase baru.** Production Lovable belum menerima.
2. **Diuji via pemanggilan manual** (bukan menunggu cron 10 menit). Schedule terdaftar `active=true`; perlu observasi produksi untuk konfirmasi periodik.
3. Job berjalan di server Supabase — tidak butuh VPS.
