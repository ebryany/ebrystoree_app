# Catatan perubahan halaman 404 dan gagal dimuat

Tanggal: 2026-10-03, mengikuti tanggal sesi.
Status: perubahan source diterapkan lokal; unit, build, dan HTTP existing terverifikasi. TypeScript belum bersih: 70 error baseline dan 1 error tambahan pada test baru. Pemeriksaan GUI belum dilakukan. Tidak dipublish/deploy oleh pekerjaan ini.

## 1. Dasar dan batas pekerjaan

- [Riset halaman 404 dan gagal dimuat](2026-10-03-riset-halaman-404-dan-gagal-dimuat.md).
- [Framework MGRCAO V3](../remediation/2026-10-03-mgrcao-v3-halaman-404-dan-gagal-dimuat.md).
- Urutan: riset, dokumen riset, framework, implementasi atas instruksi melanjutkan pengembangan, lalu catatan ini.
- Scope: klasifikasi missing/error detail publik, fallback, recovery, metadata, dan test terkait.
- Snapshot source sebelum perubahan: `.zcode/not-found-fix-source-before.json`, berisi 13 file existing dalam allowlist. Jangan memakai snapshot untuk menimpa perubahan lain secara penuh.

## 2. Perubahan yang diterapkan

### Klasifikasi detail publik

Loader empat detail memeriksa error sebelum memeriksa resource null:

| File | Perubahan |
| --- | --- |
| `src/routes/produk.$slug.tsx` | Error produk menjadi Error, bukan notFound; query sukses tanpa produk tetap notFound. |
| `src/routes/layanan.$slug.tsx` | Error layanan dibedakan dari resource tidak ditemukan. |
| `src/routes/artikel.$slug.tsx` | Error artikel dibedakan dari resource tidak ditemukan. |
| `src/routes/toko.$slug.tsx` | Error toko atau daftar produk menjadi Error; toko valid dengan produk kosong tetap normal. |

`src/lib/articles.functions.ts`, hanya `getArticleBySlug`: menambahkan field `error` secara additive. Query utama gagal memberi pesan aman; absence dan sukses memberi error null. Related articles tetap optional dan boleh kosong bila query related gagal.

`src/lib/seller.functions.ts`, hanya `getPublicStore`: mengambil error query toko dan produk. Query gagal tidak lagi disamarkan sebagai toko absent atau toko kosong. Field store/products existing tetap tersedia.

Server-function produk/layanan di `orders.functions.ts` dan `catalog.functions.ts` tidak diubah. Kontrak yang dipakai checkout dipertahankan; tidak ada verifikasi GUI checkout pada tugas ini.

### Fallback dan pemulihan

- File shared baru `src/components/route-fallback.tsx`: `RouteError` menyediakan heading dan pesan Indonesia, tombol **Muat ulang halaman**, serta link beranda atau katalog sesuai konteks.
- `src/router.tsx`: mendaftarkan defaultErrorComponent untuk route tanpa handler sendiri. Query defaults dan route matching tidak diubah.
- `src/routes/__root.tsx`: 404 global berbahasa Indonesia, main landmark dan lang scoped. Root error memakai shared fallback; logging/reportLovableError existing dipertahankan.
- Empat detail publik menggunakan error fallback dengan tujuan recovery sesuai konteks. Fallback not-found existing dan link katalog/beranda dipertahankan.
- `src/routes/index.tsx`, `produk.index.tsx`, `layanan.index.tsx`, `artikel.index.tsx`: route-level error recovery menggunakan shared fallback, bukan reset boundary saja. Not-found artikel index mendapat heading dan link artikel.
- `src/lib/error-page.ts`: HTML server standalone berbahasa Indonesia, noindex, main/alert, focus-visible, kontrol minimum 44px, serta reload dan link beranda. Tidak bergantung React/router/settings.

Recovery menggunakan reload penuh secara eksplisit, bukan memanggil reset yang bisa undefined pada SSR. Handler tombol tidak memanggil mutasi atau POST. Pada pemuatan document baru, loader dan cache client dimulai ulang; alur browser nyata belum diuji.

### Metadata dan aksesibilitas

- `routeFailureHead` memeriksa status notFound/globalNotFound/error melalui state router; title relevan dan noindex hanya untuk state gagal.
- Root dan empat detail memakai `match` terbaru bersama `matches`. Test awal menemukan matches sendiri dapat belum mencerminkan status terbaru saat head dijalankan pada versi terpasang.
- Head sehat tetap memakai metadata existing. Tidak menyisipkan meta ke body atau membuat route `/404` baru.
- Fallback memiliki heading, main, lang Indonesia scoped, kontrol minimum 44px dan focus-visible. Error menggunakan role alert.
- Desain mengikuti token/font runtime existing; dial ENERGY 1, RHYTHM 1, MOTION 1. Layout sederhana memusatkan tindakan recovery; primary hanya tindakan utama; tidak menambah aset, ilustrasi, animasi atau font.

## 3. Hasil pengujian

| Pemeriksaan | Hasil dan batas |
| --- | --- |
| Unit sebelum perubahan | 203 test, 14 file lulus. |
| Test scoped baru | 35 test lulus pada `src/components/route-fallback.test.tsx`. |
| Suite setelah perubahan | 238 test, 15 file lulus. |
| ESLint scoped | 0 error, 186 warning. Warning tidak dibersihkan dengan format ulang seluruh file. |
| Build production | Lulus, exit 0; tidak menjalankan preview/dev server. |
| TypeScript | Gagal: 70 error baseline menjadi 71; ada 1 error baru pada test. |
| HTTP existing | Probe 10 URL selesai, tanpa entry blocked. Lihat rincian berikut. |
| Visual/interaksi browser | Tidak dilakukan sesuai larangan browser. Bukan PASS. |

Test mencakup loader empat detail, absent/error/sukses, error produk toko, toko kosong yang valid, optional related artikel, status router 404/500, metadata missing/sehat, SSR fallback tanpa provider, tujuan link dan pemanggilan reload. Status 500 pada test adalah state router dengan query mock, bukan bukti respons server live 500. Error setelah stream committed/client tidak dijanjikan mengganti status HTTP.

**Error TypeScript tambahan yang belum diperbaiki:** `src/components/route-fallback.test.tsx:129`, TS2352 pada cast `detail as AnyRoute` dalam setup router test. Unit dan build tetap lulus, tetapi acceptance tanpa tambahan error TypeScript belum terpenuhi. Jangan menyebut seluruh verifikasi bersih.

## 4. HTTP read-only pada server existing

Pada riset sebelumnya port 8081 menolak koneksi. Saat verifikasi implementasi, server existing dapat diakses. Pekerjaan ini tidak menyalakan atau restart server.

| URL | Status | Hasil |
| --- | --- | --- |
| `/` | 200 | HTML, title home, tanpa noindex dari fallback. |
| `/produk/template-zmwo` | 200 | HTML, title produk, tanpa noindex dari fallback. |
| `/__riset-halaman-tidak-ada-20261003` | 404 | HTML, title halaman tidak ditemukan, noindex. |
| `/produk/__riset-tidak-ada-20261003` | 404 | HTML, title produk tidak ditemukan, noindex. |
| `/layanan/__riset-tidak-ada-20261003` | 404 | HTML, title layanan tidak ditemukan, noindex. |
| `/artikel/__riset-tidak-ada-20261003` | 404 | HTML, title artikel tidak ditemukan, noindex. |
| `/toko/__riset-tidak-ada-20261003` | 404 | HTML, title toko tidak ditemukan, noindex. |
| `/produk/template-zmwo/halaman-tidak-ada` | 404 | HTML, title produk tidak ditemukan, noindex. |
| `/admin/__riset-tidak-ada-20261003` | 404 | Hasil observasi; tidak dianggap pengujian guard/auth. |
| `/api/public/catalog-image/products/__riset-tidak-ada-20261003.png` | 404 | text/plain, bukan HTML fallback. |

Probe HTTP memeriksa status/content type/title/noindex; tidak mengklik recovery, menguji login, memaksa outage database, atau mengaudit seluruh tautan situs.

## 5. Evidence lokal

- `.zcode/not-found-fix-unit-before.log`
- `.zcode/not-found-fix-unit-scoped.log`
- `.zcode/not-found-fix-unit-full.log`
- `.zcode/not-found-fix-lint.log`
- `.zcode/not-found-fix-build.log`
- `.zcode/not-found-fix-tsc-before.log`
- `.zcode/not-found-fix-tsc-after.log`
- `.zcode/not-found-fix-tsc-comparison.json`
- `.zcode/not-found-fix-http.mjs`, `.json`, `.log`
- `.zcode/not-found-fix-format.log`

Evidence `.zcode` tetap lokal; tidak dipublish sebagai bagian catatan ini.

## 6. Batas penerimaan

Source/unit/HTTP membuktikan klasifikasi dan fallback pada skenario yang disebut. Tidak membuktikan keyboard nyata, click-through, console browser, render mobile/zoom, kedua tema, atau seluruh pasangan kontras. Gate GUI/visual belum dijalankan; catatan ini bukan approval visual final.

Tidak mengubah database/migration, transaksi/rekber/saldo, auth/RBAC, dashboard/checkout, transport server/API/security headers, banner, thumbnail, CSS global, dependency, AGENTS.md atau histori git. Tidak memakai agen, browser-use, Playwright, server baru/restart, commit/push/publish.

Kesimpulan: penanganan 404/error diterapkan dan hasil unit/build/HTTP tercatat. Verifikasi belum bersih karena satu error TypeScript tambahan pada test; GUI/visual belum diperiksa. Penyebab seluruh error backend/infrastruktur bukan scope pekerjaan ini.
