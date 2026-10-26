# Riset keamanan menyeluruh: Dashboard Admin, Database, Supabase, API, Arsitektur, Frontend, Backend

Tanggal: 2026-10-03. Scope: seluruh lapisan keamanan Ebrystore untuk menuju standar marketplace. Metode: pembacaan source, audit live read-only terhadap database (RLS, grant, policy, fungsi SECURITY DEFINER), dan pemeriksaan konfigurasi endpoint. Tidak ada perubahan kode atau data pada tahap riset ini.

## Ringkasan eksekutif

Fondasi keamanan Ebrystore sudah kuat di jalur transaksi: RLS aktif di semua tabel, tidak ada policy tulis untuk `anon`, tidak ada policy `USING (true)`, semua server function sensitif memakai `requireSupabaseAuth`, endpoint API publik memakai token/signature, dan jalur uang dijaga RPC dengan `SECURITY DEFINER` plus lock. 120 fungsi SECURITY DEFINER menegakkan aturan bisnis di database.

Namun ada **tiga kelas masalah nyata** yang harus ditutup untuk setara marketplace serius:

1. **Grant berlebih untuk `anon`** pada 45 tabel (INSERT/UPDATE/DELETE/TRUNCATE), termasuk tabel uang.
2. **Fungsi SECURITY DEFINER yang dapat dipanggil `anon`** dan **5 fungsi tanpa `search_path`** (risiko hijacking).
3. **Tidak ada security header** (CSP, HSTS, X-Frame-Options) dan **tidak ada konsol pengaturan keamanan terpusat** di dashboard admin.

Semua temuan sudah diverifikasi langsung ke database live, bukan asumsi dari kode.

## 1. Dashboard Admin > Pengaturan

### 1.1 Yang ada sekarang

| Halaman | Permission | Isi |
| --- | --- | --- |
| `settings.transactions` | `settings.view` / `settings.manage` | Penomoran, batas waktu, biaya admin, pembayaran manual, batas berkas |
| `settings.website` | `settings.website.view`, `settings.branding.update`, `settings.dangerous.update` | Konten situs, banner, reset |

Mapping role terverifikasi: `admin` hanya `settings.view`; `super_admin` memegang `settings.view`, `settings.manage`, `settings.branding.update`. Ini benar secara prinsip: admin biasa tidak dapat mengubah pengaturan transaksi.

### 1.2 Yang tidak ada (celah)

- **Tidak ada halaman keamanan terpusat.** Tidak ada tempat untuk melihat: sesi aktif, percobaan login gagal, rate limit yang kena, audit log keamanan, status RLS, atau daftar akses berbahaya.
- **Tidak ada pengaturan keamanan yang dapat dikonfigurasi**: kebijakan sesi, batas percobaan login, 2FA admin, allowlist IP untuk aksi sensitif, atau notifikasi keamanan.
- **Tidak ada indikator kesehatan keamanan**: admin tidak tahu apakah ada grant berlebih, policy hilang, atau fungsi berisiko.
- **`settings.dangerous.update`** hanya dipakai untuk reset section, tidak ada gerbang konfirmasi berlapis yang terlihat di kode (hanya dialog UI).

## 2. Database security

### 2.1 Kuat

- **RLS aktif di seluruh tabel `public`** (hasil query: `rls_disabled` kosong).
- **Tidak ada tabel ber-RLS tanpa policy** kecuali `rate_limit_hits` dan `telegram_dispatch_log` (keduanya tabel internal; RLS aktif tapi tanpa policy → akses ditolak total untuk non-service, yang justru aman).
- **Tidak ada policy tulis untuk `anon`** (query `anon_write_policies` = 0).
- **Tidak ada policy permisif `USING (true)`** (query `permissive_true_policies` = 0).
- 120 fungsi SECURITY DEFINER menegakkan aturan bisnis di sisi database, termasuk jalur uang dengan row lock dan advisory lock.

### 2.2 Celah: grant berlebih untuk `anon` (temuan utama)

`anon` memiliki grant INSERT/UPDATE/DELETE/TRUNCATE pada **45 tabel**, termasuk:

```
orders, order_items, payments, payment_events, payment_verifications,
invoices, refunds, seller_ledger, credit_ledger, profiles, user_roles,
system_settings, audit_logs, marketplace_service_orders,
marketplace_service_deliveries, marketplace_service_events, stores, ...
```

**Dampak saat ini:** RLS tetap memblokir, karena tidak ada policy tulis untuk `anon`. Jadi ini **belum dapat dieksploitasi**, tetapi melanggar prinsip pertahanan berlapis: satu policy yang salah tambah di kemudian hari langsung menjadi lubang kritis pada tabel uang.

**Asal:** grant default Supabase saat tabel dibuat (`GRANT ALL ... TO anon, authenticated`) yang tidak pernah dicabut untuk `anon`.

### 2.3 Celah: fungsi SECURITY DEFINER yang dapat dipanggil `anon`

Tujuh fungsi non-trigger dengan `EXECUTE` untuk `anon`:

| Fungsi | Aman? | Alasan |
| --- | --- | --- |
| `get_my_inventory_summary()` | Efektif aman | Bergantung `my_store_id()` → `auth.uid()` NULL untuk anon → RAISE `NO_STORE` |
| `get_my_low_stock_products()` | Efektif aman | Sama, berbasis store sendiri |
| `verify_seller_product_ownership(uuid)` | Efektif aman | Mengembalikan NULL bila tanpa sesi |
| `seller_ingest_stock_codes(uuid, text[])` | Efektif aman | Memanggil ownership check di atas |
| `product_rating_summary()` | Tidak berbahaya | Agregat publik, memang boleh |
| `search_products_fts(...)` | Tidak berbahaya | Pencarian katalog publik, memang boleh |
| `store_rating_summary(uuid)` | Sengaja publik | Keputusan owner untuk rating toko |

**Kesimpulan:** tidak ada fungsi yang dapat disalahgunakan anon saat ini, tetapi enam di antaranya seharusnya tidak pernah diberi grant ke `anon`. Prinsip least privilege dilanggar.

### 2.4 Celah: 5 fungsi tanpa `search_path`

```
get_my_inventory_summary, get_my_low_stock_products, search_products_fts,
seller_ingest_stock_codes, verify_seller_product_ownership
```

Fungsi SECURITY DEFINER tanpa `SET search_path` rentan **search_path hijacking**: penyerang yang dapat membuat objek di skema yang lebih awal di search_path bisa membajak pemanggilan tabel/fungsi di dalamnya. Standar PostgreSQL: selalu set `search_path = public` pada fungsi SECURITY DEFINER.

### 2.5 Celah: `product_reviews.store_id` (sudah diperbaiki hari ini)

Sudah ditutup lewat migration `20261003190000` (backfill + trigger). Dicatat di sini karena termasuk lapisan integritas data.

## 3. Supabase security

### 3.1 Kuat

- Bucket privat untuk seluruh data sensitif: `payment-proofs`, `product-files`, `academic-order-attachments`, `job-results`, `catalog-images`, `service-deliveries`, `service-media` (terverifikasi `public = false`).
- Akses objek dijaga policy berbasis kepemilikan atau peran.
- Kunci service role hanya dipakai di modul `.server.ts`; tidak ada kebocoran ke bundle klien (grep bersih).
- Klien publik memakai kunci publishable dengan RLS sebagai batas.

### 3.2 Celah

- **Tidak ada audit berkala atas bucket publik.** Saat ini tidak ada bucket publik, tetapi tidak ada penjaga yang mencegah bucket baru dibuat publik tanpa sengaja.
- **Tidak ada verifikasi bahwa semua bucket memiliki batas ukuran dan MIME**; beberapa bucket lama mungkin tanpa batas.
- **Tidak ada pemantauan `storage.objects`** untuk unggahan mencurigakan atau lonjakan.

## 4. API security

### 4.1 Kuat

| Endpoint | Proteksi | Verifikasi |
| --- | --- | --- |
| `/api/public/payments/webhook/sumopod` | Verifikasi signature | `sumopod.verifyWebhook(raw, headers)`, 401 bila gagal |
| `/api/public/jobs/telegram-dispatch` | Bearer/`x-jobs-token` dengan perbandingan waktu-konstan | `JOBS_CRON_TOKEN`, panjang dicek, XOR loop |
| `/api/public/integrations/jiofarm/*` | `authorizeIngest(request)` | 401 bila gagal |
| `/api/public/catalog-image/$` | Validasi path ketat, hanya bucket catalog-images | regex + tolak `..` |
| `/api/public/service-media/$` | Validasi path ketat, hanya bucket service-media | regex + tolak `..` |

### 4.2 Celah

- **Tidak ada rate limit di endpoint API publik.** Rate limit hanya diterapkan di server function (via RPC `check_rate_limit`), bukan di webhook atau endpoint job. Endpoint job dilindungi token, tetapi tidak dibatasi frekuensi.
- **Tidak ada CORS policy eksplisit.** Bergantung default; untuk marketplace sebaiknya eksplisit.
- **Tidak ada batas ukuran body** pada endpoint POST (webhook membaca `request.text()` tanpa batas).
- **Rate limit bersifat fail-open** (`return null` saat RPC error). Ini keputusan sadar untuk ketersediaan, tetapi perlu dicatat sebagai trade-off: saat database bermasalah, pembatasan hilang.
- **Tidak ada idempotency yang terlihat pada endpoint webhook** di lapisan route (meski mungkin ada di handler pembayaran).

## 5. Arsitektur security

### 5.1 Kuat

- Pemisahan jelas: klien publik (publishable key + RLS) vs server (service role) vs database (RPC SECURITY DEFINER).
- Aturan bisnis kritis berada di database, bukan hanya di UI: lifecycle pesanan, pelepasan dana, refund, moderasi, idempotency.
- `authz.server.ts` menyediakan `assertPermission` dan `writeAudit`; 29 titik memanggil audit.
- Middleware `requireSupabaseAuth` memverifikasi token via `getClaims`, bukan sekadar decode.

### 5.2 Celah

- **Tidak ada lapisan otorisasi terpusat untuk route** (route guard berbasis komponen `useCan`, bukan penjaga server-side per route). Server function tetap memeriksa, tetapi konsistensi bergantung disiplin.
- **`loadAccess` mengambil peran dan permission dari klien Supabase** (RLS), bukan dari service role; jika RLS salah, otorisasi ikut salah. Saat ini RLS benar, tetapi ini titik tunggal.
- **Tidak ada pemisahan lingkungan yang terlihat** (dev/staging/prod) pada konfigurasi.
- **Tidak ada rotasi rahasia terjadwal** untuk token job/integrasi.

## 6. Frontend security

### 6.1 Kuat

- Hampir tidak ada `dangerouslySetInnerHTML`; hanya di komponen chart (library internal).
- Konten artikel dirender sebagai React node dengan parser sendiri, dan tautan difilter `isSafeUrl` (menolak `javascript:`, `data:`, `vbscript:`, `file:`).
- Tidak ada penyimpanan data sensitif di `localStorage` selain preferensi suara notifikasi dan sesi Supabase (memang di sana tempatnya).
- Tidak ada kunci rahasia di bundle klien.

### 6.2 Celah

**Koreksi riset:** pemeriksaan awal hanya membaca `vite.config.ts` dan `__root.tsx`, sehingga sempat disimpulkan header tidak ada. Setelah menelusuri `src/server.ts`, ternyata **security header sudah diterapkan**: CSP, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy`, dan `Referrer-Policy`. Ini diakui sebagai kekurangan metode pada versi pertama riset.

Yang benar-benar belum ada:

- **`Strict-Transport-Security` (HSTS)** belum diset. Tanpa itu, koneksi pertama masih dapat di-downgrade.
- **`X-Content-Type-Options: nosniff`** belum diset untuk respons HTML (hanya diset pada proxy gambar).
- **CSP memakai `script-src 'unsafe-inline'`**, yang diperlukan oleh hidrasi SSR TanStack Start. Ini trade-off sadar; risikonya berkurang jika nonce/hash dapat diterapkan kelak.
- **`frame-ancestors` mengizinkan `*.lovable.app`**, sesuai kebutuhan preview Lovable. Untuk produksi mandiri, daftar ini perlu ditinjau.
- **Tidak ada sanitasi terpusat** untuk input pengguna yang ditampilkan (mengandalkan React escaping, yang benar, tetapi tanpa lapisan kedua).
- **Tidak ada perlindungan terhadap klik ganda pada aksi uang** di level klien selain `disabled` (server tetap idempoten, jadi ini minor).

## 7. Backend security

### 7.1 Kuat

- Rate limit berbasis database (atomik, tahan multi-instance), bukan in-memory.
- Idempotency pada jalur uang memakai advisory lock.
- `enforceRateLimit` dipanggil di 21 file server function.
- Audit log ditulis untuk aksi sensitif.
- Error ke pengguna disanitasi (pesan generik), detail hanya ke log server.

### 7.2 Celah

- **Tidak ada pemantauan anomali** (lonjakan order, refund berulang, login gagal) yang memicu peringatan.
- **Tidak ada pembatasan laju per IP** untuk pengguna anonim; rate limit berbasis `userId`, sehingga anon tidak dibatasi di server function tertentu.
- **Fail-open rate limit** dicatat di atas.
- **Tidak ada verifikasi integritas** untuk operasi massal (mis. ingest kode stok) selain batas 500 per batch.

## 8. Prioritas perbaikan

### P0, harus segera

1. Cabut grant tulis `anon` pada seluruh 45 tabel; sisakan SELECT hanya pada yang memang publik.
2. Cabut `EXECUTE` untuk `anon` pada enam fungsi internal; pertahankan hanya fungsi yang sengaja publik.
3. Tambah `SET search_path = public` pada 5 fungsi yang belum.

### P1, penting

4. Security header: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy.
5. Rate limit untuk endpoint API publik dan batas ukuran body.
6. Halaman **Pengaturan > Keamanan** di dashboard admin: ringkasan RLS, grant anon, fungsi berisiko, sesi admin, dan audit keamanan terakhir.

### P2, nilai tambah

7. 2FA untuk `super_admin` dan `admin`.
8. Peringatan anomali (refund berulang, login gagal, unggahan besar).
9. Verifikasi bucket (semua privat, ada batas ukuran dan MIME).
10. CORS eksplisit dan rotasi rahasia terjadwal.

## 9. Kesimpulan

Keamanan transaksional Ebrystore sudah di atas rata-rata aplikasi sejenis: aturan bisnis di database, RLS menyeluruh, idempotency, audit, dan endpoint publik berautentikasi. Yang kurang adalah **lapisan pengerasan perimeter dan tata kelola**: grant berlebih untuk `anon`, fungsi definer tanpa `search_path`, tidak ada security header, dan tidak ada konsol keamanan di dashboard admin.

Tidak ada satu pun temuan yang menunjukkan kebocoran data aktif hari ini. Semuanya adalah risiko yang harus ditutup sebelum skala produksi.

Framework kerja disusun di `docs/remediation/2026-10-03-mgrcao-v3-security-hardening.md`.
