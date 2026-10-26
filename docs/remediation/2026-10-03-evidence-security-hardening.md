# Bukti security hardening

Tanggal: 2026-10-03. Role kerja: **Security Engineer** (application, database, infrastructure).

## Ringkasan

Empat migration diterapkan dan terverifikasi, dua lapisan perimeter diperkuat, dan satu halaman konsol keamanan ditambahkan untuk super_admin. Tidak ada perubahan pada jalur uang, lifecycle, atau aturan bisnis.

## Migration

| Versi | Isi | Hasil |
| --- | --- | --- |
| 20261003210000 | Cabut grant tulis `anon` di semua tabel; whitelist SELECT publik; `search_path` untuk 5 fungsi definer | diterapkan |
| 20261003220000 | Cabut EXECUTE dari `PUBLIC, anon` (anon mewarisi lewat PUBLIC); kembalikan hanya 3 fungsi publik | diterapkan |
| 20261003230000 | Fungsi snapshot keamanan untuk halaman admin | diterapkan |
| 20261003190000 | Backfill + trigger `product_reviews.store_id` (bug rating) | diterapkan sebelumnya hari ini |

## Hasil verifikasi database (read-only)

```
tables_total: 50
tables_with_rls: 50
anon_write_grants: 0
tables_without_policy: 2   (rate_limit_hits, telegram_dispatch_log; internal, akses ditolak total)
anon_functions: [product_rating_summary, search_products_fts, store_rating_summary]
definer_without_search_path: 0
```

Uji terarah pada tabel uang:

```
anon INSERT orders: false
anon UPDATE payments: false
anon INSERT seller_ledger: false
anon UPDATE system_settings: false
anon EXECUTE security_catalog_snapshot(): false
authenticated EXECUTE security_catalog_snapshot(): true
```

Bukti: `.zcode/anon-privilege-db-test.json`, `.zcode/anon-privilege-db-apply.json`, `.zcode/anon-fn-db-apply.json`, `.zcode/security-fn-db-apply.json`, `.zcode/security-fn-db-verify.json`.

## Koreksi metode riset

Riset versi pertama menyimpulkan header keamanan tidak ada karena hanya membaca `vite.config.ts` dan `__root.tsx`. Setelah menelusuri `src/server.ts`, ternyata CSP, `X-Frame-Options`, `Permissions-Policy`, dan `Referrer-Policy` sudah diterapkan sejak sebelumnya. Koreksi sudah ditulis di dokumen riset, dan pekerjaan disesuaikan: yang benar-benar ditambahkan adalah HSTS dan `X-Content-Type-Options`.

## Perimeter

Ditambahkan di `src/server.ts`:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`

Dibatasi di webhook pembayaran:

- Tolak `content-length` > 64 KB dan body > 64 KB sebelum verifikasi signature (status 413).

Verifikasi header pada respons HTML live:

```
content-security-policy: default-src 'self'; ... object-src 'none'; upgrade-insecure-requests
permissions-policy: camera=(), microphone=(), geolocation=(), payment=(self), usb=(), interest-cohort=()
referrer-policy: strict-origin-when-cross-origin
strict-transport-security: max-age=31536000; includeSubDomains
x-content-type-options: nosniff
x-frame-options: SAMEORIGIN
```

## Halaman admin Keamanan

Route `/admin/settings/security`, permission `settings.view`, ditambahkan ke navigasi admin. Menampilkan: jumlah tabel dengan RLS, grant tulis anon, fungsi publik anon, fungsi definer tanpa `search_path`, bucket publik, daftar temuan berlabel (Baik / Perlu perhatian / Kritis), daftar nama fungsi anon, dan 15 audit terakhir.

Server function memakai `requireSupabaseAuth` + `assertPermission(ctx, "settings.view")`; fungsi SQL-nya hanya diberikan ke `authenticated`, dan mengembalikan angka serta nama saja, bukan data pelanggan.

## Verifikasi browser

- Membuka `/admin/settings/security` dengan akun non-admin menampilkan **"Akses ditolak — Akun Anda tidak memiliki izin admin.dashboard.view"**. Ini membuktikan penjagaan izin bekerja di level route; akun uji yang tersedia bukan admin, sehingga tampilan halaman dengan akun admin belum dapat diambil.
- Header keamanan diverifikasi lewat respons HTTP langsung.

## Test dan build

| Pemeriksaan | Hasil |
| --- | --- |
| Unit test | 28 file, 374 tes lulus |
| Build produksi | exit 0 |
| Lint file terkait | 0 error, warning `any` existing |
| TypeScript global | error hanya baseline lama; file security bersih |

## Batas yang belum diuji

- Halaman keamanan belum dilihat dengan akun super_admin; hanya penolakan akses yang terbukti.
- Rate limit endpoint API publik belum ditambahkan untuk endpoint job (masih mengandalkan token); batas body baru berlaku di webhook pembayaran.
- CSP masih memakai `script-src 'unsafe-inline'` karena kebutuhan hidrasi SSR; nonce/hash belum diterapkan.
- `frame-ancestors` masih mengizinkan `*.lovable.app` sesuai kebutuhan preview.
- Tidak ada deployment frontend produksi, commit, atau push.

## Temuan yang masih terbuka (tidak dikerjakan hari ini)

- 2FA untuk admin/super_admin.
- Pemantauan anomali (refund berulang, login gagal, unggahan besar).
- Verifikasi berkala seluruh bucket (privat + batas ukuran + MIME).
- CORS eksplisit dan rotasi rahasia terjadwal.
