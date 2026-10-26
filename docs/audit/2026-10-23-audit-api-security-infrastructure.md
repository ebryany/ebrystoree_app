# Ebrystore Marketplace API Security & Infrastructure Readiness Audit

Tanggal: 2026-10-23 · Mode: **AUDIT ONLY — READ-ONLY**
Tidak ada kode, endpoint, permission, database, konfigurasi, atau deployment yang diubah.

---

## A. Executive Summary

**Kontrol otorisasi Ebrystore kuat dan terbukti. Dua temuan P0 ada di luar lapisan otorisasi.**

Diuji langsung dengan akun sintetis (sudah dihapus), bukan hanya dari membaca kode:

| Uji serangan | Hasil |
|---|---|
| Customer membaca order customer lain (by ID) | **`[]` kosong** ✅ |
| Customer membaca `seller_ledger` | **`[]`** ✅ |
| Customer membaca `credit_ledger` orang lain | **`[]`** ✅ |
| Customer membaca `profiles` orang lain | **hanya profil sendiri** ✅ |
| Customer menambah role `admin` ke diri sendiri | **DITOLAK** — "Tidak dapat memberi peran untuk akun sendiri" ✅ |
| Customer memanggil `admin_marketplace_overview` | **FORBIDDEN** ✅ |
| Customer memanggil `admin_list_stores` | **FORBIDDEN** ✅ |
| Customer memanggil `review_seller` | **FORBIDDEN** ✅ |
| Customer membaca saldo toko seller lain | **FORBIDDEN** ✅ |
| Anon memanggil 8 RPC sensitif | **semua ditolak** ✅ |
| Webhook tanpa signature valid | **401** ✅ |
| Webhook nominal tidak cocok | ditolak (`amount mismatch`) ✅ |
| Webhook duplikat | `already settled` ✅ |

**Dua temuan P0:**

1. **`.env` berisi `SUPABASE_SERVICE_ROLE_KEY` dan TIDAK ada di `.gitignore`.**
   Satu `git add .` akan meng-commit kredensial tertinggi ke repositori. Service role
   melewati seluruh RLS.
2. **7 kerentanan `critical` pada dependency**, termasuk `@tanstack/react-start`,
   `@tanstack/start-server-core`, `seroval`, dan `shell-quote`. Semuanya punya
   perbaikan tersedia (`fixAvailable: true`).

**Keterbatasan bukti:**
- Folder ini **bukan git repo**, jadi tidak bisa diverifikasi apakah `.env` pernah
  ter-commit. Risikonya nyata, tetapi belum terbukti terjadi.
- Tidak ada akses ke dashboard Supabase (log, metrik, konfigurasi auth).
- Tidak ada akses konfigurasi Lovable Cloud (edge, WAF, TLS termination).
- Tidak menjalankan DAST, brute force, atau load test.

---

## B. API Architecture & Trust Boundary Map

```
                    ┌─────────────────────────────────────────┐
   Browser ────────►│  TanStack Start SSR (Lovable Cloud)     │
   (untrusted)      │                                          │
                    │  ├─ 211 server functions (createServerFn)│
                    │  │     └─ requireSupabaseAuth (token)    │
                    │  │     └─ assertPermission (RBAC)        │
                    │  │     └─ RLS (defense in depth)         │
                    │  │                                       │
                    │  └─ 6 route handlers (/api/public/*)     │
                    │        ├─ webhook.sumopod  → HMAC verify │
                    │        ├─ jobs/*           → token check │
                    │        └─ analytics/track  → rate limit  │
                    └──────────────┬──────────────────────────┘
                                   │ publishable key + user JWT
                                   ▼
                    ┌─────────────────────────────────────────┐
                    │  Supabase (PostgREST + Auth + Storage)   │
                    │  ├─ 158 RLS policy                       │
                    │  ├─ ~90 RPC (SECURITY DEFINER)           │
                    │  └─ Storage: payment-proofs, product-files│
                    └──────────────┬──────────────────────────┘
                                   │ service_role (server-only)
                                   ▼
                    ┌─────────────────────────────────────────┐
                    │  PostgreSQL                              │
                    └─────────────────────────────────────────┘

   SumoPod ──webhook──► /api/public/payments/webhook/sumopod
            ◄─status───  getPaymentStatus (server-side re-check)
```

**Batas kepercayaan:**

| Lapisan | Sumber identitas | Diverifikasi di |
|---|---|---|
| Browser → Server fn | JWT di header `Authorization` | `requireSupabaseAuth` (format + signature via Supabase) |
| Server fn → DB (user) | JWT pengguna | RLS |
| Server fn → DB (admin ops) | `service_role` | Kode server, tidak pernah ke client |
| SumoPod → webhook | HMAC signature / token | `verifyWebhook` |
| Cron → jobs | Bearer token | Route handler |

**Titik privileged:**
- `supabaseAdmin` (service_role) — dipakai di webhook, rate limit, analytics, jobs
- `SECURITY DEFINER` RPC — ~90 fungsi dengan `search_path = public` eksplisit

---

## C. API Security Findings Matrix

### API-SEC-001 — `SUPABASE_SERVICE_ROLE_KEY` ada di `.env` tanpa `.gitignore`

| Field | Isi |
|---|---|
| **Severity** | **Critical** |
| **Affected API** | Seluruh API (kredensial ini melewati semua RLS) |
| **Security control** | Secrets management |
| **Evidence** | `.env` memuat `SUPABASE_SERVICE_ROLE_KEY=<ada>` (nilai tidak ditampilkan). Isi `.gitignore` diperiksa baris per baris: **tidak ada** entri `.env`, `*.env`, atau `.env*` |
| **Root cause** | `.gitignore` dibuat untuk build artifacts (`.output`, `.wrangler`, `node_modules`) tetapi tidak mencakup file environment |
| **Exploitability** | Siapa pun dengan akses ke repositori (kolaborator, CI log, fork publik) mendapat kunci yang **melewati seluruh 158 RLS policy** |
| **Business impact** | Baca/tulis seluruh data: order, payment, saldo, ledger, PII 34 profil. Dapat membuat order palsu, mengubah saldo, mencabut entitlement |
| **Recommendation** | Tambah `.env` dan `.env.*` ke `.gitignore` **sekarang**. Verifikasi riwayat git (`git log --all -- .env`). Jika pernah ter-commit, **rotasi kunci** di Supabase |
| **Verification** | **Verified** (file + isi `.gitignore`), **Not Verified** apakah pernah ter-commit (bukan git repo) |

### API-SEC-002 — 7 dependency `critical` + 8 `high`

| Field | Isi |
|---|---|
| **Severity** | **High** |
| **Affected API** | Build & runtime (SSR, RSC, serialisasi) |
| **Security control** | Dependency management |
| **Evidence** | `npm audit`: total 18 (7 critical, 8 high, 2 moderate, 1 low). Critical: `@tanstack/react-start`, `@tanstack/react-start-rsc`, `@tanstack/react-start-server`, `@tanstack/start-plugin-core`, `@tanstack/start-server-core`, `seroval` (2 CVE: promise-thenable assimilation + memory exhaustion), `shell-quote` (command injection). Semua `fixAvailable: true` |
| **Root cause** | Versi dependency tertinggal dari patch keamanan |
| **Exploitability** | `seroval` CVE-2025 (memory exhaustion via `fromJSON`) dapat dipicu lewat deserialisasi data dari klien. `shell-quote` hanya berbahaya bila ada shell invocation (perlu verifikasi) |
| **Business impact** | Potensi DoS pada SSR; RCE bila `shell-quote` dipakai dengan input tak tepercaya |
| **Recommendation** | `npm audit fix`, lalu uji build + test. Untuk TanStack, upgrade minor terkontrol karena menyentuh framework inti |
| **Verification** | **Verified** (output `npm audit`) |

### API-SEC-003 — Rate limit `fail-open` saat RPC error

| Field | Isi |
|---|---|
| **Severity** | **Medium** |
| **Affected API** | Semua endpoint dengan `enforceRateLimit` (12 bucket) |
| **Security control** | Abuse prevention |
| **Evidence** | `rate-limit.server.ts`: `if (error) { console.error(...); return null; }` — `null` berarti **diizinkan**. Sama untuk `catch` |
| **Root cause** | Keputusan desain: ketersediaan di atas pembatasan |
| **Exploitability** | Penyerang yang bisa membuat `check_rate_limit` gagal (mis. membanjiri RPC) otomatis mematikan seluruh rate limit |
| **Business impact** | Spam checkout, refund request, seller registration tanpa batas saat DB tertekan |
| **Recommendation** | Pertahankan fail-open untuk endpoint baca, tetapi **fail-closed** untuk endpoint finansial (`order.create`, `refund.request`, `topup.create`, `payment.proof`) |
| **Verification** | **Verified** (kode) |

### API-SEC-004 — `submitProductReview` tanpa rate limit

| Field | Isi |
|---|---|
| **Severity** | **Low** |
| **Affected API** | `submitProductReview` → `submit_product_review` |
| **Security control** | Abuse prevention |
| **Evidence** | `reviews.functions.ts` — nol `enforceRateLimit`. Tetapi RPC mewajibkan pembelian terverifikasi (`order_items` + status `paid/completed`) dan `UNIQUE (product_id, user_id)` |
| **Root cause** | Kontrol dipindah ke validasi bisnis, bukan rate limit |
| **Exploitability** | Sangat terbatas: satu ulasan per produk per pembeli. Spam hanya mungkin dengan banyak akun yang benar-benar membeli |
| **Business impact** | Rendah — biaya serangan (harus beli produk) melebihi manfaat |
| **Recommendation** | Tidak mendesak. Bila perlu, tambah bucket `review.create` 5/jam |
| **Verification** | **Verified** (kode + RPC) |

### API-SEC-005 — 17 file server function tanpa `assertPermission`

| Field | Isi |
|---|---|
| **Severity** | **Low** (mitigasi RLS terverifikasi) |
| **Affected API** | `orders.functions.ts` (24 fn), `seller.functions.ts` (19), `inquiries.functions.ts` (11), dll. |
| **Security control** | Function-level authorization |
| **Evidence** | 17 file punya `createServerFn` tanpa `assertPermission`. **Tetapi** 23/24 fn di `orders.functions.ts` memakai `requireSupabaseAuth`, dan query berjalan dengan JWT pengguna sehingga RLS aktif |
| **Root cause** | Dua pola otorisasi: `assertPermission` untuk operasi admin, RLS untuk operasi milik-sendiri |
| **Exploitability** | **Tidak terbukti.** Uji langsung: customer tidak bisa membaca order/ledger/profil orang lain |
| **Business impact** | Tidak ada bukti dampak. Risiko: bila suatu saat RLS dilonggarkan, tidak ada lapisan kedua |
| **Recommendation** | Bukan bug. Dokumentasikan pola: "operasi milik-sendiri → RLS; operasi admin → `assertPermission`" |
| **Verification** | **Verified** (kode + uji BOLA lulus) |

### API-SEC-006 — 3 fungsi server tanpa auth middleware

| Field | Isi |
|---|---|
| **Severity** | **Low** |
| **Affected API** | `catalog.functions.ts` (7 fn), `cart.functions.ts` (2 fn), sisanya publik by design |
| **Security control** | Authentication |
| **Evidence** | `catalog.functions.ts` memakai `createPublicClient()` — katalog memang publik. `cart.functions.ts` `validateCartItems` hanya membaca produk publik |
| **Root cause** | Desain: katalog dan validasi keranjang memang bisa diakses tanpa login |
| **Exploitability** | Tidak ada data privat yang terekspos (diverifikasi: hanya produk `published` + toko `active`) |
| **Business impact** | Tidak ada |
| **Recommendation** | Tidak ada tindakan. Ini perilaku yang benar |
| **Verification** | **Verified** |

### API-SEC-007 — `stores` dapat dibaca publik (by design, perlu dicatat)

| Field | Isi |
|---|---|
| **Severity** | **Low** (informational) |
| **Affected API** | `GET /rest/v1/stores` dengan anon/publishable key |
| **Security control** | Tenant isolation |
| **Evidence** | Uji: user biasa mendapat `Ebrystore Official` dan `citra` — keduanya `status='active'`. Policy `stores_select_public USING (status = 'active')` |
| **Root cause** | Dibutuhkan untuk storefront publik `/toko/$slug` |
| **Exploitability** | Hanya toko aktif. Toko `pending`/`suspended` tidak terlihat |
| **Business impact** | Tidak ada. Nama toko memang publik |
| **Recommendation** | Tidak ada. Pastikan kolom sensitif (`contact_phone`, `contact_email`) tidak ikut terekspos — perlu verifikasi terpisah |
| **Verification** | **Partially verified** — perlu cek apakah kolom kontak terekspos ke anon |

---

## D. API Authorization Matrix

| Operasi | Anon | Customer | Seller | Operator | Support | Finance | Admin | Super |
|---|---|---|---|---|---|---|---|---|
| Baca katalog publik | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Baca order sendiri | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Baca order orang lain | ❌ | ❌ | ❌ | ⚠️ `orders.view` | ⚠️ `orders.view` | ⚠️ `orders.view` | ⚠️ | ✅ |
| Baca `seller_ledger` sendiri | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ✅ |
| Baca saldo toko orang lain | ❌ | ❌ | ❌ | ❌ | ⚠️ `sellers.view` | ⚠️ | ⚠️ | ✅ |
| Ajukan seller | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Approve seller | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ `sellers.approve` | ✅ |
| Moderasi produk | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ `products.update` | ✅ |
| Verifikasi pembayaran | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ `payments.verify` | ⚠️ | ✅ |
| Proses refund | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ `refunds.process` | ⚠️ | ✅ |
| Ubah status toko sendiri | ❌ | ❌ | ❌ (trigger) | ❌ | ❌ | ❌ | ⚠️ | ✅ |
| Tambah role ke diri sendiri | ❌ | ❌ (trigger) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⚠️ = bergantung pada permission yang diberikan; diverifikasi via `has_permission`.

---

## E. Infrastructure Security Gap Analysis

| Kontrol | Status | Bukti |
|---|---|---|
| **TLS/HTTPS** | ✅ Aktif | `strict-transport-security: max-age=31536000; includeSubDomains` |
| **CSP** | ✅ Ketat | `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'self'` |
| **X-Frame-Options** | ✅ | `SAMEORIGIN` |
| **X-Content-Type-Options** | ✅ | `nosniff` |
| **Referrer-Policy** | ✅ | `strict-origin-when-cross-origin` |
| **Permissions-Policy** | ✅ | camera/mic/geo dinonaktifkan |
| **CORS manual** | ✅ Tidak ada (tidak perlu) | Tidak ada `Access-Control-Allow-*` — mengandalkan same-origin |
| **WAF** | ❓ Tidak dapat diverifikasi | Bergantung Lovable Cloud; tidak ada konfigurasi di repo |
| **DDoS protection** | ❓ Tidak dapat diverifikasi | idem |
| **Edge rate limiting** | ❓ Tidak dapat diverifikasi | idem |
| **Secrets management** | ❌ **Bermasalah** | API-SEC-001 |
| **Dependency security** | ❌ **Bermasalah** | API-SEC-002 |
| **Staging environment** | ❓ Tidak terverifikasi | Tidak ada konfigurasi staging di repo |
| **Request correlation ID** | ❓ | Tidak ditemukan di kode |

---

## F. Security Hardening Roadmap

### P0 — Critical Protection

| # | Tindakan | Dependensi | Dampak | Risiko regresi | Acceptance criteria |
|---|---|---|---|---|---|
| **P0-1** | Tambah `.env` + `.env.*` ke `.gitignore`; audit riwayat git; rotasi service role bila pernah ter-commit | Tidak ada | Menutup jalur kebocoran kredensial tertinggi | Nol | `.env` muncul di `git check-ignore`; kunci lama tidak berlaku |
| **P0-2** | `npm audit fix` untuk 7 critical + 8 high | Perlu uji build | Menutup CVE di framework inti | **Sedang** — TanStack upgrade bisa mengubah perilaku SSR | Build sukses, test lulus, `npm audit` critical = 0 |

### P1 — Operational Security

| # | Tindakan | Alasan |
|---|---|---|
| P1-1 | Rate limit `fail-closed` untuk 4 endpoint finansial | API-SEC-003 |
| P1-2 | Verifikasi kolom `stores` yang terekspos ke anon | API-SEC-007 |
| P1-3 | Tambah rate limit `review.create` (5/jam) | API-SEC-004 |
| P1-4 | Dokumentasikan pola otorisasi (RLS vs `assertPermission`) | API-SEC-005 |
| P1-5 | Aktifkan logging authorization denial di Supabase | Tidak ada jejak penolakan akses saat ini |

### P2 — Advanced Hardening

| # | Tindakan |
|---|---|
| P2-1 | Request correlation ID di seluruh server function |
| P2-2 | Security regression test otomatis (BOLA/BFLA) di CI |
| P2-3 | Dependency scanning berkala |
| P2-4 | Dokumentasikan incident response (kebocoran kredensial, webhook gagal, akses lintas seller) |

---

## G. Yang Sudah Sangat Baik (jangan diubah)

1. **Webhook SumoPod** — HMAC verification, batas payload 64 KB, zod validation, cek nominal,
   idempotensi (`already settled`), dan **verifikasi ulang ke provider** sebelum settle.
   Ini implementasi yang matang.
2. **RLS 158 policy** dengan `SECURITY DEFINER` + `search_path` eksplisit.
3. **Trigger `protect_role_changes`** — privilege escalation diblokir di level database.
4. **Trigger `protect_store_privileged_fields`** — seller tidak bisa mengubah status tokonya sendiri.
5. **Security headers lengkap** termasuk CSP ketat dan `frame-ancestors`.
6. **`assertPermission` pada 12 file** untuk operasi admin.
7. **Semua RPC sensitif** `REVOKE` dari anon.

---

## H. Batasan Audit

| Item | Alasan | Bukti minimum yang dibutuhkan |
|---|---|---|
| Riwayat commit `.env` | Folder bukan git repo | `git log --all -- .env` di repo asli |
| Konfigurasi WAF/DDoS/edge | Hanya di Lovable Cloud | Screenshot dashboard |
| Konfigurasi auth Supabase (JWT expiry, refresh) | Hanya di dashboard | Screenshot Auth settings |
| Log authorization denial | Tidak diekspos | Supabase Logs |
| Staging environment | Tidak ada di repo | Konfirmasi owner |
| DAST / fuzzing | Tidak dijalankan (dilarang) | Rencana terpisah di lingkungan izin |
| Kolom `stores` terekspos anon | Belum diuji per kolom | Query `select=*` dengan anon key |

**Yang terverifikasi:** 13 uji serangan langsung (semua lulus), struktur 211 server function,
6 route handler publik, 158 RLS policy, security headers aktual, `npm audit` lengkap,
dan analisis webhook end-to-end.
