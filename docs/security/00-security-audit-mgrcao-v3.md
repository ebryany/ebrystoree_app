# Laporan Full Security Audit — Ebrystore (MGRCAO V3)

Tanggal: 2026-10-02 · Metode: review statis kode sumber + migrasi SQL + eksekusi test/lint/tsc lokal
Status: **SELESAI (dengan batasan cakupan yang dinyatakan eksplisit)**

---

## 1. Ringkasan Eksekutif

Audit mencakup 22 area keamanan dari paket `ebrystore-security-mgrcao-v3` terhadap codebase Ebrystore (marketplace produk digital, TanStack Start + Supabase).

**Kesimpulan utama:**

- **Tidak ada temuan Critical yang terbukti.** Klaim Critical awal dari beberapa pemeriksaan (fungsi staff PO bisa dipanggil user biasa, Bola lintas-seller, dsb.) **dicabut setelah ditelusuri ke kebijakan RLS/RPC efektif** — jalur tersebut diblokir database.
- **4 temuan High** berbasis bukti statis SQL/kode yang kuat: bypass otorisasi task via NULL, seller melewati moderasi lewat API langsung, race saldo kredit buyer, dan reversal ganda saat cancel/expire.
- **~12 temuan Medium** (reconciliasi amount QRIS, webhook replay window, ledger tidak append-only di level DB, rate limit fail-open, CSP `unsafe-inline`, signed URL 365 hari, dll.).
- **Batasan:** semua temuan adalah bukti statis dari file repositori. Skema yang benar-benar ter-deploy, konfigurasi produksi, dan perilaku runtime **tidak diverifikasi** (tidak ada akses database produksi dalam audit ini).

**Verifikasi lokal yang dijalankan:**

| Perintah | Hasil |
|---|---|
| `npm run test:unit` | 58/58 PASS (Vitest 4.1.11, 6 file) |
| `npm run lint` | Exit 0 (0 error) |
| `tsc --noEmit` | Exit 2 — 68+ error pre-existing (schema generated, `po-thread.tsx`, `inquiries.functions.ts`, dll.) |

---

## 2. Arsitektur & Trust Boundary

```
Visitor / Customer / Seller / Staff / Super-admin
              │
       Browser React bundle (Vite)
         │              │
 TanStack server fn     +── Supabase Data API / Auth / Storage
 (JWT Bearer,                 (publishable key + user JWT → RLS)
  auth.getClaims())
         │
         ├── user-JWT client ──── RLS + SECURITY DEFINER RPC
         ├── service_role ─────── bypass RLS (payment settle, file signing, notifikasi, rate limit)
         └── Sumopod API (QRIS)
                │
   Sumopod ── webhook publik ── verifikasi token/HMAC ── settle_gateway_payment
```

Boundary kunci (verifikasi sumber):

| Boundary | Verifikasi | Catatan |
|---|---|---|
| Browser → server fn | `src/integrations/supabase/auth-middleware.ts:74-105` (getClaims, user-JWT client) | Identitas dari `sub` token, bukan input klien |
| Server → service_role | `src/integrations/supabase/client.server.ts` (server-only, env) | Bypass RLS; setiap pemakaian butuh guard aplikasi |
| Webhook Sumopod | `src/lib/sumopod.server.ts:152-178` (token / HMAC Svix) | Tidak ada cek umur timestamp (lihat M-6) |
| Download produk | `src/lib/orders.functions.ts:363-388` → `consume_download` RPC → signed URL 300 detik | Singkat dan bagus; kontras dengan URL hasil jasa 365 hari (M-8) |
| Role/permission | `has_permission` (DB join), `is_staff`, `is_admin`, `my_store_id()` | super_admin bypass di DB + audit |

**Aktor:** anonim, customer, seller (via kepemilikan toko), operator, support, finance, admin, super_admin, system (job), Sumopod (provider).

---

## 3. Temuan Berdasarkan Severity

### 3.1 Klaim awal yang DICABUT (penting untuk kejujuran audit)

Klaim Critical/High awal berikut **tidak valid** setelah definisi RLS/RPC terakhir ditelusuri:

| Klaim awal | Kenapa dicabut | Bukti |
|---|---|---|
| `submitPoQuote`/`verifyPoPayment`/`deliverPoResult` bisa dipanggil user biasa | RPC cek `is_staff(auth.uid())` + state + lock | `20260820012138_...sql:147,255,309` |
| `listAllInquiries`/`listAllPoRequests` bocor ke semua user | RLS owner OR staff | `20260905003813_...sql:26-40`; `20260820012138_...sql:49-50` |
| `saveMyProduct` BOLA lintas-seller | RLS UPDATE paksa `store_id = my_store_id()` + permission | `20260930100013_...sql:71-74` |
| `assignOperator` eskalasi | RPC cek `orders.assign` + state + role operator | `20260728190807_...sql:566-590` |
| `getMyOrder`/`getInquiry` BOLA | RLS orders/payments/inquiries owner OR staff | `20260728131303_...sql:83-84,230-232` |
| `sendInquiryMessage` user acung jadi "staff" | Parent RLS hanya izinkan owner/staff/seller toko terkait | kebijakan kumulatif inquiry |

Pelajaran: **guard aplikasi yang hilang + otorisasi DB yang memadai = celah defense-in-depth (Informational), bukan exploit.**

### 3.2 HIGH

> **Status perbaikan (2026-10-02):** H-1, H-2, H-3, H-4 sudah diperbaiki di
> `supabase/migrations/20261002100001_fix_h1_h4_security.sql` + regresi statis
> `src/lib/__tests__/security-h1-h4.test.ts` (rencana:
> `docs/security/01-rencana-perbaikan-h1-h4-mgrcao-v3.md`). Status: **VERIFIED (statis)**.
> Verifikasi runtime (isolasi DB aktual) tetap belum dilakukan.

#### H-1 — Bypass otorisasi `update_admin_task` via assignee NULL
- **Status:** VERIFIED (statis, logika SQL)
- **Bukti:** `supabase/migrations/20260728180436_...sql:38` — `ELSIF NOT (has_permission(...) OR t.assignee_id = auth.uid())`. Jika user tanpa permission memanggil task dengan `assignee_id IS NULL` (kolom nullable, `20260728131438_...sql:132`): `false OR NULL = NULL`, `NOT NULL = NULL`, `IF` tidak raise. User bisa claim lalu menyelesaikan task siapa pun. EXECUTE di-grant ke `authenticated` (baris 79).
- **Dampak:** perubahan integritas task operasional tanpa hak (bukan settlement finansial/role).
- **Fix:** `ELSIF (has_permission(...) OR t.assignee_id = auth.uid()) IS NOT TRUE THEN RAISE...` + tolak `_assignee` NULL pada aksi `assign`.

#### H-2 — Seller bisa self-approve moderasi produk via API langsung
- **Status:** VERIFIED (statis)
- **Bukti:** `20260930100013_catalog_ownership_moderation.sql:35` (default `moderation_status='approved'`), `:71-74` (RLS UPDATE hanya cek store + permission, tidak kolom moderasi), `:83-85` (trigger hanya turunkan publish jika `moderation_status <> 'approved'`), plus grant table-wide INSERT/UPDATE authenticated di `20260728115920_...sql:202`. Handler `seller.functions.ts:151-162` memang mengecualikan kolom moderasi, tapi **panggilan REST langsung ke Supabase melewati allowlist handler**.
- **Dampak:** seller publish produk sendiri tanpa review admin — meruntuhkan boundary moderasi yang didesain.
- **Fix:** lindungi kolom `moderation_status/reviewed_by/reviewed_at/status` di level DB (trigger BEFORE yang menolak perubahan kolom terlindungi tanpa permission `products.update`, atau revoke grant tabel dan paksa lewat RPC moderasi).

#### H-3 — Race pemakaian saldo kredit bisa bikin saldo negatif
- **Status:** VERIFIED (statis, logika concurrency)
- **Bukti:** `20260930100005_order_credit_usage.sql:40` mengunci **order** (`FOR UPDATE`), `:48` membaca saldo agregat user, `:54` kunci idempotensi per-order. Dua request bersamaan pada **order berbeda** membaca saldo sama → dua debit lolos → saldo minus.
- **Fix:** advisory lock per `user_id` sebelum baca saldo (`pg_advisory_xact_lock(hashtext(user_id))`), atau constraint trigger yang menolak debit melebihi saldo.

#### H-4 — Reversal kredit ganda saat cancel vs expire bersaing
- **Status:** VERIFIED (statis)
- **Bukti:** `20261001100001_fix_seller_credit_and_refund.sql:207` kunci reversal cancel = `cancel:<order>`; `:249` kunci expire = `expire:<order>`; `:239-245` SELECT kandidat expire **tanpa lock**; `:258-262` UPDATE unconditional. Job expire membaca order, lalu user cancel manual berhasil, lalu job tetap mencatat reversal → kredit dikembalikan 2x.
- **Fix:** `FOR UPDATE SKIP LOCKED` pada kursor job + satu kunci reversal bersama per debit asal (mis. `reverse:order:<id>` dipakai baik cancel maupun expire).

### 3.3 MEDIUM

| ID | Temuan | Bukti inti | Fix ringkas |
|---|---|---|---|
| M-1 | QRIS polling settle pakai `expected_amount`, bukan amount dari provider (`detail.amount` dibuang) | `src/lib/payments.functions.ts:110-126`; RPC menolak `_paid_amount < expected` (`20260816165151_...sql:26`) tapi caller menyuplai expected sendiri | Validasi amount provider (gross/net/fee), pass nilai terverifikasi |
| M-2 | Debit seller saat refund = full subtotal item, bukan amount refund | `20261001100001_...sql:138-151` vs `r.amount` untuk buyer | Alokasikan porsi seller dari `r.amount`; cap kumulatif |
| M-3 | Ledger tidak append-only di level DB: service_role ALL; `ON DELETE CASCADE` di FK store | `20260930100003_credit_ledger.sql:38-50`; `20260930100015_seller_earnings_ledger.sql:19,26` | Revoke UPDATE/DELETE/TRUNCATE service_role; trigger tolak mutasi; FK RESTRICT |
| M-4 | `write_audit_log` bisa dipanggil user authenticated mana pun dengan narasi bebas | `20260728122903_...sql:237-261`, grant `:261` | Batasi eksekusi ke service_role/domain RPC; event telemetri klien pisah tabel |
| M-5 | Rate limiter fail-open (RPC error → allow) | `src/lib/rate-limit.server.ts:49-64` | Fail-closed untuk flow sensitif uang; alerting |
| M-6 | Webhook HMAC tanpa cek umur timestamp (replay window tak terbatas) + mode token-only tidak binding body | `src/lib/sumopod.server.ts:152-168` | Tolak timestamp > 5 menit; simpan event id unik |
| M-7 | CSP `script-src 'unsafe-inline'` + sesi Supabase di localStorage | `src/server.ts:62-75`; `previewAuthStorage.ts` | Nonce/hash CSP; pertimbangkan HttpOnly |
| M-8 | Hasil jasa (job results) signed URL 365 hari, disimpan sebagai URL | `src/lib/mcp/tools/hermes-deliver-result.ts:5,46-66` | Simpan path; terbitkan URL pendek per-request dengan cek entitlement |
| M-9 | `sender_role`/`is_system` pesan inquiry bisa ditulis caller via API langsung (policy INSERT tidak membatasi kolom) | `20260905003813_...sql:47-52`; `20260930100027_...sql:54-64` | Derive role di policy/trigger; tolak `is_system` dari klien; ganti **kedua** policy permissive (OR!) |
| M-10 | Cek stok checkout tanpa reservasi/lock → oversell unique/code saat konkuren | `20260930100028_...sql:25-42` (SELECT tanpa `FOR UPDATE`, tanpa dekremen) | Reservasi atomik berexpiry, atau alokasi saat settle + kompensasi |
| M-11 | Metadata file (MIME/size) dari klien dipercaya saat registrasi; bukan metadata objek aktual | `seller-files.functions.ts:93-180`; `product-files.functions.ts:104-179` | Fetch metadata objek; tolak mismatch; scanning malware |
| M-12 | `internal_note`/`internal_deadline` ikut ke respons customer fulfillment | `src/lib/fulfillment.functions.ts:173,195,212,217` | Proyeksi per-role; lindungi kolom di DB |

### 3.4 LOW / Hygiene

| ID | Temuan | Bukti |
|---|---|---|
| L-1 | `.gitignore` tidak mengecualikan `.env` (file `.env` dan `.env.backup-lovable` ada di root) | `.gitignore` |
| L-2 | Error mentah DB dikembalikan ke klien admin | `admin.functions.ts:163,175,280,296`; `admin-seller.functions.ts:27-39` |
| L-3 | Header: tidak ada HSTS / `X-Content-Type-Options`; header hanya di respons HTML | `src/server.ts:77-93` |
| L-4 | Pesan register membedakan email terdaftar (enumeration, tergantung config Supabase) | `src/routes/auth.tsx:93-100` |
| L-5 | Hapus file admin tanpa dialog konfirmasi | `product-files-dialog.tsx:279-286` |
| L-6 | Logout tidak meng-invalidate query cache React (potensi data terkait akun sebelumnya) | `__root.tsx:181-186` |
| L-7 | Dua lockfile (`package-lock.json` + `bun.lock`) | root |
| L-8 | `tsc --noEmit` gagal 68+ error pre-existing (mayoritas schema generated/`any`) | output tsc |
| L-9 | Tidak ada logging audit kegagalan login level aplikasi | pencarian migrasi |
| L-10 | `.env` menunjuk project Supabase berbeda dari `supabase/config.toml` (`wcxaheqnnsbhifpgiedk` vs `ayhwmcptscfbuzcobcav`) | `.env` vs config.toml — **risiko migrasi ke project yang salah** |

### 3.5 Kontrol positif yang terverifikasi

- Identitas selalu dari `auth.uid()` / verified JWT claims — tidak ada kepercayaan `user_id` klien.
- Harga/total checkout dihitung server dari katalog DB (`create_digital_order`), quantity di-clamp 1-10.
- Webhook menolak status non-paid, RPC settle mengunci baris payment + idempoten (`already_settled`), EXECUTE hanya service_role.
- Download produk: entitlement RPC + signed URL **300 detik**.
- Refund diproses dalam satu transaksi SQL dengan lock + validasi state.
- Kedua ledger punya `idempotency_key UNIQUE`; saldo dihitung dari SUM, bukan kolom yang bisa diedit.
- RLS aktif pada seluruh 44 tabel public yang ditemukan; tidak ada statement DISABLE RLS.
- Rate limit tersimpan di DB (advisory lock, atomic), bukan in-memory.
- Pelanggan biasa **tidak bisa** membaca email profil orang lain (RLS own-or-admin).
- CSRF middleware terdaftar (`src/start.ts:24-30`); error SSR catastrophic dirender halaman generik.

---

## 4. Risiko Business Logic (Prompt 15)

| Skenario adversarial | Status | Catatan |
|---|---|---|
| Harga dimanipulasi klien | REFUTED | server pakai harga DB |
| Quantity negatif | REFUTED | clamp 1-10; unique/code dipaksa 1 |
| Checkout ganda | DIMITIGASI | idempotency key per payment |
| Webhook duplikat | DIMITIGASI | lock + status check di settle |
| Refund ganda | DIMITIGASI | lock refund + state validation |
| Saldo dipakai konkuren | **BERMASALAH (H-3)** | lock salah granularitas |
| Cancel vs expire bersaing | **BERMASALAH (H-4)** | kunci reversal berbeda |
| Oversell stok konkuren | **BERMASALAH (M-10)** | tanpa reservasi |
| Underpay via polling | **BERMASALAH (M-1)** | amount dari lokal |
| Partial refund | **BERMASALAH (M-2)** | debit seller penuh |

---

## 5. Production Security Gate (Prompt 22)

| Kontrol | Status | Evidence |
|---|---|---|
| Trust boundary terdokumentasi | **PASS** | Bagian 2 laporan ini |
| Database tidak publik tak-sengaja | **NOT VERIFIED** | config deployment tak diaudit |
| Least privilege service credential | **FAIL** | service_role ALL di ledger (M-3) |
| Authentication | **PASS** | getClaims + auth.uid() konsisten |
| Authorization (fungsi) | **PASS (statis, pasca-fix)** | H-1 fixed di `20261002100001`; runtime belum diuji |
| Object ownership | **PASS** | RLS store/order/payment/inquiry terverifikasi |
| Input/schema validation | **PASS** | Zod di seluruh server fn |
| Business validation | **PARTIAL** | M-1, M-2, M-10 |
| Session security | **PARTIAL** | localStorage + M-7 |
| CSRF strategy | **PASS w/ caveat** | middleware ada; konfigurasi belum direview detail |
| XSS/output encoding | **PARTIAL** | CSP unsafe-inline (M-7); tidak ditemukan sink React berbahaya |
| Secret management | **FAIL (hygiene)** | L-1, L-10 |
| Payment verification | **PARTIAL** | webhook ada verifikasi; M-1, M-6 |
| Webhook verification | **PARTIAL** | M-6 replay window |
| File entitlement | **PASS** | consume_download + 300s URL; **kecuali** M-8 (365 hari job result) |
| Rate limiting | **PARTIAL** | ada per-flow DB-backed; M-5 fail-open; download tidak ter-cover |
| Idempotency | **PASS** | kunci unik di semua jalur uang |
| Race-condition controls | **PARTIAL (statis, pasca-fix)** | H-3, H-4 fixed di `20261002100001`; M-10 (stok) belum |
| Security logging | **PARTIAL** | audit event luas; M-4 fabricable; L-9 no login-fail |
| Sensitive log protection | **PARTIAL** | tidak ada password/token di log; error-capture serialize objek bebas |
| Error handling | **PARTIAL** | sanitasi transaksi bagus; L-2 admin raw error |
| Security headers | **PARTIAL** | CSP/XFO/Referrer ada; HSTS/nosniff tidak (L-3) |
| Production hardening | **NOT VERIFIED** | deployment tak diaudit; tidak ada debug/seed route di sumber |
| Dependency review | **NOT VERIFIED** | `npm audit` tidak dijalankan; L-7 dual lockfile |
| Backup/restore | **NOT VERIFIED** | di luar cakupan sumber |
| Monitoring/incident | **NOT VERIFIED** | di luar cakupan sumber |

**Kesimpulan gate: BELUM LAYAK PRODUCTION.** Blokir utama: H-1 s/d H-4, M-1/M-2/M-6 (jalur uang), L-1/L-10 (secret hygiene), plus verifikasi deployment yang belum dilakukan.

---

## 6. Urutan Remediasi Prioritas

**Segera (sebelum seller/money flow produksi):**
1. ~~H-1~~ **SELESAI** (`20261002100001`): patch NULL-safe `update_admin_task`.
2. ~~H-2~~ **SELESAI** (`20261002100001`): trigger pelindung kolom moderasi (pendekatan trigger dipilih, revoke grant tabel ditunda karena berisiko lebih luas).
3. ~~H-3 + H-4~~ **SELESAI** (`20261002100001`): advisory lock per-user + `SKIP LOCKED` + kunci reversal tunggal.
4. M-1 + M-6: pass amount provider ke settle; tolak webhook timestamp tua.
5. L-1 + L-10: `.env` ke `.gitignore`; samakan project ID `.env` vs `config.toml`.

**Sebelum go-live penuh:**
6. M-2 alokasi refund proporsional; M-3 ledger append-only; M-4 audit log.
7. M-5 fail-closed rate limit flow uang; M-9 policy INSERT pesan inquiry.
8. M-8 URL hasil jasa jadi pendek; M-10 reservasi stok.
9. M-7 CSP nonce; L-3 HSTS/nosniff; L-2 error map admin.

**Hardening lanjutan:** M-11 verifikasi metadata objek; M-12 proyeksi internal field; L-4/L-5/L-6/L-9 UX & logging; L-8 tsc; verifikasi deployment + backup/restore + `npm audit`.

---

## 7. Batasan & Yang Belum Diverifikasi

- Semua temuan = **bukti statis repositori**. Skema ter-deploy, grants aktual, config Supabase produksi (MFA admin, email confirmation, kebijakan auth), bucket storage actual flags, dan edge/CDN headers **tidak diverifikasi**.
- Test lokal 58/58 adalah test unit/regresi statis + model — **bukan** bukti isolasi DB runtime. Skenario verifikasi ulang yang aman disiapkan di `docs/security/verification-evidence.md`.
- Tidak ada mutasi finansial, tidak ada exploit aktif, tidak ada akses nilai secret (hanya nama env), tidak ada perubahan kode sumber.
- `npm audit` / SCA tidak dijalankan (menyentuh registry eksternal tanpa persetujuan).

## 8. Deliverable Terkait

- `docs/security/backend-api-audit.md` — audit detail Prompt 04-05 (adjudikasi lengkap per fungsi, 154 fungsi terinventarisasi)
- `docs/security/verification-evidence.md` — cakupan test & skenario verifikasi ulang aman
- Laporan ini — konsolidasi 22 area + production gate
