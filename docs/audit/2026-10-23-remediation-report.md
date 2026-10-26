# Ebrystore — API Security Remediation Report

Tanggal: 23 Oktober 2026
Baseline: `docs/audit/2026-10-23-audit-api-security-infrastructure.md`
Lingkungan: lokal (bukan git repo, tanpa staging)

---

## A. Remediation Summary

| Finding | Sebelum | Akar masalah | Perbaikan | Status |
|---|---|---|---|---|
| API-SEC-001 | `.env` berisi `SUPABASE_SERVICE_ROLE_KEY`, tidak di-ignore | `.gitignore` hanya punya `*.local`, tidak ada `.env` | Tambah `.env`, `.env.*`, `*.env`, `.env.backup-*`, `.envrc`; tambah `.env.example` | DIPERBAIKI (lokal) |
| API-SEC-002 | 7 critical, 8 high, 2 moderate, 1 low | Dependency TanStack/seroval di bawah versi patch | Upgrade `react-start` 1.169.3, `react-router` 1.170.45, `vite` 8.1.6+, `vitest` 4.1.12; override 6 paket transitive | DIPERBAIKI: 0 critical |
| API-SEC-003 | Rate limiter fail-open saat RPC error | `return null` pada catch dan pada `error` | Fail-closed untuk 6 bucket finansial; fail-open dipertahankan untuk non-finansial | DIPERBAIKI |
| API-SEC-007 | Kolom privat `stores` terbaca anon | Grant SELECT level tabel + policy baris saja | Migrasi grant per-kolom | MIGRASI SIAP, BELUM DITERAPKAN |
| API-SEC-004 | Review tanpa rate limit | Dibatasi unique constraint + validasi pembelian | Tidak diubah (tidak ada bukti abuse) | TIDAK DIKERJAKAN (sengaja) |
| API-SEC-005 | 17 server fn tanpa `assertPermission` | Dua pola sah: RLS milik-sendiri vs permission admin | Didokumentasikan | DIDOKUMENTASIKAN |
| API-SEC-006 | Katalog publik tanpa auth | Desain yang disengaja | Tidak diubah | SESUAI DESAIN |

### Temuan tambahan di luar laporan awal

**Regresi upgrade yang ditemukan dan diperbaiki:** TanStack Start 1.169 menghapus
`createServerFn().inputValidator()`. 161 pemakaian di 28 file membuat seluruh SSR
gagal (`inputValidator is not a function`) dan situs tidak bisa dibuka. Dimigrasikan
ke `.validator()`.

**Bug noindex 404:** Router 1.171 menandai not-found global lewat `_notFound` dengan
`status: "success"`, bukan `status: "notFound"`. `routeFailureHead()` tidak mengenali
bentuk baru, sehingga halaman 404 kehilangan `noindex`. Diperbaiki dan diverifikasi
lewat HTTP nyata.

**Webhook hardening:** perbandingan token memakai `===` (timing leak) dan tidak ada
validasi timestamp (replay). Diganti constant-time compare + toleransi 5 menit.

---

## B. Changed Files

| File | Alasan | Dampak |
|---|---|---|
| `.gitignore` | Proteksi secret | Tidak ada dampak runtime |
| `.env.example` | Placeholder aman | Baru, tidak dibaca runtime |
| `package.json` | Versi dependency + `overrides` | Build & runtime |
| `package-lock.json` | Lockfile konsisten | Build |
| 28 file `src/**/*.functions.ts` + 3 test | `inputValidator` → `validator` | Server functions |
| `src/components/route-fallback.tsx` | Deteksi `_notFound` | SEO 404 |
| `src/components/route-fallback.test.tsx` | Baca `_serverResult.status` | Test |
| `src/lib/rate-limit.server.ts` | Fail-closed finansial | Order/payment/refund/topup/QRIS/PO |
| 5 file `*.functions.ts` | Normalisasi return `{ok:false,error}` | Respons API tidak bocor field `reason` |
| `src/lib/sumopod.server.ts` | Constant-time + timestamp | Webhook |
| `supabase/migrations/20261023100000_stores_public_column_grants.sql` | Grant per-kolom | **Belum diterapkan** |
| `src/lib/__tests__/rate-limit.test.ts` | 17 test kebijakan baru | Test |
| `src/lib/__tests__/stores-column-grants.test.ts` | 9 test kontrak grant | Test |
| `src/lib/__tests__/webhook-signature.test.ts` | 7 test signature/replay | Test |

---

## C. Dependency Report

| Paket | Sebelum | Sesudah |
|---|---|---|
| `@tanstack/react-start` | 1.168.32 | 1.169.3 |
| `@tanstack/react-router` | 1.170.18 | 1.170.45 |
| `@tanstack/start-server-core` | 1.169.17 | 1.169.44 |
| `@tanstack/start-plugin-core` | 1.171.24 | 1.171.54 |
| `@tanstack/react-start-rsc` | 0.1.31 | 0.1.64 |
| `seroval` | 1.5.6 | 1.7.0 |
| `vite` | 8.1.5 | 8.3.5 |
| `vitest` | 4.1.11 | 4.1.12 |
| `shell-quote` (override) | 1.10.0 | 1.12.0 |
| `js-yaml` (override) | 4.3.0 | 4.3.2 |
| `brace-expansion` (override) | 1.1.16 / 5.0.8 | 1.1.21 / 5.0.12 |
| `launch-editor` (override) | 2.14.1 | 2.14.2 |
| `ip-address` (override) | 10.7.2 | 10.7.4 |

Audit: **18 temuan → 3 temuan, critical 7 → 0.**

Sisa 3:
- `@lovable.dev/mcp-js` + `@modelcontextprotocol/sdk` (high) — tidak ada versi rilis yang memperbaiki; `mcp-js@3.2.2` (terbaru) masih mem-pin SDK 1.28.0. Butuh keputusan vendor.
- `esbuild` (low) — hanya dev server di Windows; `0.28.x` di luar range `@lovable.dev/mcp-js`.

---

## D. Security Regression Evidence

**Build:** `npm run build` → exit 0 (3 stage, ~33 detik).

**Unit test:** 501 lulus, 9 gagal, 510 total.
9 kegagalan adalah **pre-existing** (baseline sebelum perubahan: 11 gagal / 471 lulus):
- `marketplace-home.test.tsx` (8) — assertion markup UI usang
- `public-storefront.test.tsx` (1) — assertion teks UI usang

Tidak ada regresi dari perubahan keamanan.

**Smoke test HTTP nyata (dev server):**

| Rute | Status |
|---|---|
| `/` | 200 |
| `/produk` | 200 |
| `/layanan` | 200 |
| `/artikel` | 200 |
| `/auth` | 200 |
| `/toko/ebrystore-official` | 200 |
| `/produk/tidak-ada` | 404 + `noindex` + judul benar |

**Uji otorisasi anon (dijalankan dengan anon key):**

| Kolom `stores` | Sebelum | Sesudah migrasi |
|---|---|---|
| `contact_email` | TERBACA | — |
| `contact_phone` | TERBACA | tetap publik (dibutuhkan WhatsApp) |
| `verification_note` | TERBACA | — |
| `suspended_reason` | TERBACA | — |
| `reviewed_by` | TERBACA | — |
| `owner_id` | TERBACA | — |

Catatan: 0 dari 2 toko saat ini berisi email/telepon, jadi belum ada PII nyata yang
bocor — tetapi strukturnya terbuka dan akan bocor begitu seller mengisi kontak.

**Test baru:** 33 test (17 rate limit, 9 grant, 7 webhook).

**Tidak dijalankan:** E2E Playwright (butuh browser + akun), uji beban, uji staging.

---

## E. Production Readiness

**Risiko deployment:**
1. Migrasi `stores` mengubah privilege — jalankan di staging dulu. Jika storefront
   memakai kolom di luar daftar grant, query akan error 42501.
2. Upgrade TanStack sudah dimigrasikan kode, tapi belum diuji di staging.
3. Fail-closed rate limit berarti gangguan RPC `check_rate_limit` akan menolak
   checkout. Pantau volume error setelah deploy.

**Secret rotation:** BELUM dilakukan. `.env` tidak pernah terbukti masuk riwayat Git
(bukan git repo), tetapi rotasi tetap disarankan sebagai tindakan pencegahan.

**Rollback:** `package.json` + `package-lock.json` tersedia di `.package.json.bak`
dan `.package-lock.json.bak`. Migrasi bisa dibalik dengan
`GRANT SELECT ON public.stores TO anon;`.

**Smoke test pasca-deploy:** `/`, `/produk`, `/toko/<slug>`, checkout satu order uji,
webhook SumoPod test event.

**Monitoring:** error rate `check_rate_limit`, volume 401 webhook, error 42501 PostgREST.

---

## F. Remaining Security Gaps

1. **Riwayat Git tidak dapat diverifikasi** — direktori ini bukan git repo.
2. **Migrasi `stores` belum diterapkan** — butuh approval (perubahan privilege produksi).
3. **`@modelcontextprotocol/sdk` high** — tidak ada perbaikan upstream; endpoint `/mcp`
   mengekspos tool admin sehingga perlu ditinjau ulang.
4. **WAF / DDoS / edge config** — hanya terlihat di Lovable Cloud.
5. **Konfigurasi auth Supabase** (JWT expiry, refresh) — hanya di dashboard.
6. **Staging tidak tersedia** — semua verifikasi di lokal.
7. **E2E tidak dijalankan.**
8. **`tsc --noEmit` melaporkan error pre-existing** (banyak `implicitly any` /
   `unknown`); `tsc` tidak termasuk pipeline `verify`, jadi tidak memblokir build.
9. **9 test UI gagal** — pre-existing, di luar scope keamanan.

---

## G. Approval Gates

Belum dieksekusi, menunggu persetujuan:

1. **Menerapkan migrasi** `20261023100000_stores_public_column_grants.sql` ke database.
2. **Rotasi `SUPABASE_SERVICE_ROLE_KEY`** beserta pembaruan environment deployment.
3. **Deploy ke production.**

---

## H. Kesimpulan

Dua P0 tertutup: secret tidak lagi bisa ter-commit tanpa sengaja, dan critical
dependency turun dari 7 ke 0. Fail-closed rate limit sudah aktif untuk enam operasi
finansial dengan test yang membuktikan pemulihan setelah gangguan.

Satu temuan P1 (API-SEC-007) terbukti nyata dan perbaikannya siap, tetapi sengaja
belum diterapkan karena menyentuh privilege database produksi.
