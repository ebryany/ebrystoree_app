# Laporan Slice — Rate Limiting (FASE 0 #3)

Tanggal: 2026-09-30 · Slice: A-03 · Status: **VERIFIED (lokal)**
Lingkungan: **Supabase baru `wcxaheqnnsbhifpgiedk` SAJA — TIDAK production.**

---

## 1. Current Evidence (sebelum)

| Objek | Temuan | Bukti |
|---|---|---|
| Rate limiting | **0 implementasi** | grep `rate.?limit\|throttle` = 0 hasil |
| Endpoint rawan | Login, chat, PO, order, bukti bayar, refund, QRIS, webhook, ingest — semua tanpa batas | — |

**Dampak:** 1 aktor bisa membanjiri sistem (spam inkuiri/pesan, abuse QRIS berbayar, flooding DB).
**Klasifikasi:** `NOT_IMPLEMENTED`.

---

## 2. Problem Solved

Mekanisme rate limiting berbasis **database** (bukan penghitung in-memory yang hilang saat restart/tidak akurat di banyak instance):

- **Atomik** via `pg_advisory_xact_lock` per bucket+subject → benar walau dipanggil bersamaan.
- **Isolasi** per bucket & subject → subject A tidak memblokir subject B.
- **Window reset** otomatis → pembersihan oportunistik saat pemanggilan.
- **Fail-open** saat infrastruktur error → pengguna sah tidak terhalang masalah sementara.

---

## 3. Files Changed

| File | Isi |
|---|---|
| `supabase/migrations/20260930100009_rate_limit.sql` | **BARU** — tabel `rate_limit_hits` + RPC `check_rate_limit` |
| `src/lib/rate-limit.server.ts` | **BARU** — helper `enforceRateLimit` + kebijakan |
| `src/lib/inquiries.functions.ts` | +rate limit (create, message) |
| `src/lib/po.functions.ts` | +rate limit (create, message) |
| `src/lib/orders.functions.ts` | +rate limit (order.create, payment.proof, refund.request) |
| `src/lib/payments.functions.ts` | +rate limit (qris.create) |

---

## 4. Database/Domain Changes

| Objek | Isi |
|---|---|
| Tabel `rate_limit_hits` | `id, bucket, subject, created_at`; index `(bucket, subject, created_at DESC)`; RLS aktif, **tanpa policy** → tertutup total untuk klien |
| RPC `check_rate_limit(bucket, subject, limit, window_seconds)` | Periksa & catat atomik; `REVOKE` dari anon/authenticated, `GRANT` hanya service_role |

---

## 5. Kebijakan Rate Limit (default)

| Bucket | Limit | Window |
|---|---|---|
| `inquiry.create` | 10 | 60 detik |
| `inquiry.message` | 20 | 60 detik |
| `po.create` | 5 | 300 detik |
| `po.message` | 20 | 60 detik |
| `order.create` | 20 | 60 detik |
| `payment.proof` | 10 | 300 detik |
| `refund.request` | 5 | 3600 detik |
| `qris.create` | 10 | 300 detik |

---

## 6. Authorization Impact

- `rate_limit_hits`: RLS aktif, tanpa policy → klien tidak bisa baca/tulis.
- `check_rate_limit`: hanya `service_role` yang bisa memanggil (dipakai helper server).
- Helper dipanggil di server function (setelah auth), memakai `supabaseAdmin`.

---

## 7. Financial/Data Integrity Impact

Melindungi alur uang (QRIS, bukti bayar, refund) dari abuse. Tidak mengubah data transaksi.

---

## 8. Tests Executed (bukti nyata)

| # | Test | Hasil |
|---|---|---|
| 1 | Limit 3, panggil 4× | 1–3 `allowed:true`; 4 `allowed:false, retry_after:60` ✅ |
| 2 | Subject berbeda | `allowed:true` (tidak terpengaruh) ✅ |
| 3 | Bucket berbeda | `allowed:true` (tidak terpengaruh) ✅ |
| 4 | Window 2 detik | panggilan ke-2 diblokir → setelah 3 detik izin lagi ✅ |

**Verifikasi output:**
```
panggilan 1,2,3 → {"allowed":true,"count":1,2,3,"limit":3}
panggilan 4     → {"allowed":false,"count":3,"limit":3,"retry_after":60}
```

### Pembersihan
Data tes `test.*` dihapus → `rate_limit_hits` kosong.

---

## 9. Backward Compatibility

- Tabel & fungsi baru → tidak mengganggu apa pun.
- Helper bersifat **fail-open** → bila RPC error, aksi tetap jalan (tidak memblokir pengguna sah).
- Migrasi aditif.
- **Rollback:** drop tabel + fungsi; hapus pemanggilan di server fn.

---

## 10. Remaining Gaps

| Item | Status |
|---|---|
| Rate limit 8 bucket | **VERIFIED** (lokal) |
| Rate limit login (Supabase Auth) | `NOT_IMPLEMENTED` — di luar kendali app (platform) |
| Rate limit webhook/ingest publik | `NOT_IMPLEMENTED` — sudah punya token; bisa ditambah bila perlu |
| Rate limit di production | ❌ belum (production tidak disentuh) |
| Pembersihan terjadwal tabel rate_limit | Oportunistik (saat dipanggil); job pembersihan bisa ditambah |

---

## 11. Catatan Penting

1. **Hanya di Supabase baru.** Production Loveland belum menerima.
2. **Login** tidak tercakup — itu dikelola Supabase Auth (platform), bukan aplikasi.
3. **Fail-open** dipilih sengaja: lebih baik pengguna sah lolos daripada diblokir karena error infrastruktur.
4. Endpoint publik (webhook/ingest) sudah dilindungi token rahasia; rate limit bisa ditambah menyusul.
