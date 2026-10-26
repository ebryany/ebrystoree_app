# Implementasi dan verifikasi banner background home custom

Tanggal: 2026-10-03.
Status: implementasi source selesai, migration diterapkan. Visual/interaction belum diverifikasi (browser dilarang owner).
Framework: [MGRCAO V3 banner background home custom](../remediation/2026-10-03-mgrcao-v3-banner-background-home-custom.md), termasuk bagian Catatan implementasi yang ditulis sebelum file baru dibuat.
Preflight awal: [arsip kondisi blocked](2026-10-03-preflight-banner-background-home-custom.md).

## Otorisasi

Preflight awal menemukan bucket `catalog-images` tidak ada, policy storage `is_staff`, writer settings `is_admin`, dan tanpa decoder JPEG/WebP/AVIF; pekerjaan dihentikan sesuai gate. Owner kemudian memerintahkan lanjut, yang mencakup dua prasyarat yang dilaporkan: dependency decoder server dan migration storage/database scoped. Tidak ada otorisasi commit/push/publish, server, browser, atau perubahan di luar framework.

## Perubahan source

- `src/lib/website-settings.ts`: empat key publik di Branding (`home_banner_image_url`, `home_banner_mobile_image_url`, `home_banner_position_x`, `home_banner_position_y`), validator ketat banner (path canonical `/api/public/catalog-image/branding/home/<UUID>.<ext>`, posisi integer 0..100 tanpa koersi permisif), helper `bannerAssetUrl`/`clampBannerPosition`.
- `src/lib/banner-upload.server.ts` (baru): trust boundary upload. Batas 3 MB, signature sniffing, decode `sharp` penuh, format meta harus cocok sniff, animated (pages > 1) ditolak, dimensi maksimal 8000 px per sisi dan 16 MP, ext dari hasil decode, path UUID baru `branding/home/<UUID>.<ext>` dengan `upsert:false` via `supabaseAdmin`.
- `src/lib/website-settings.functions.ts`: server function `uploadBannerImage` (POST, auth + `settings.branding.update`), input Zod nama/base64.
- `src/components/home/banner-background.tsx` (baru): satu renderer shared. Mobile strip 6rem in-flow, desktop layer absolut penuh; picture/source media native; alt kosong, pointer-events none, cover + object-position; tanpa lazy; error gambar memakai mobile lalu utama lalu panel netral; nilai malformed jatuh ke default aman.
- `src/routes/index.tsx`: MarketplaceDiscovery membaca settings publik via hook existing; banner aktif hanya saat gambar utama valid; backing konten `sm:w-2/3` saat aktif; nav strip netral dalam section yang sama; copy/routing/kontrak pencarian tidak berubah.
- `src/components/admin/image-uploader.tsx`: opsi opt-in `uploadRemote`/`onBusyChange`; jalur logo/katalog existing tidak berubah.
- `src/routes/_authenticated/admin/settings.website.tsx`: field banner memakai uploader server-side; save diblokir selama unggahan berjalan; save/reset kini juga `router.invalidate()` agar root loader SSR membaca nilai baru.
- `src/components/admin/settings-preview.tsx`: preview banner draf memakai renderer yang sama, diberi label draf.
- `src/routes/api/public/catalog-image.$.tsx`: tambah header `X-Content-Type-Options: nosniff`; kontrak lain tidak berubah.
- `src/lib/mcp/tools/update-website-settings.ts`: tidak diubah; jalur MCP otomatis terjaga karena memakai `validateField` yang sama.
- Test: `src/components/home/marketplace-home.test.tsx` 34 menjadi 50 test.

## Migration dan deployment

`supabase/migrations/20261003090000_home_banner_branding.sql`:

- Bucket `catalog-images` dibuat private, 5 MB, MIME JPG/PNG/WebP/AVIF (pola `payment-proofs`). Policy staff existing tidak diubah; upload banner tidak lewat RLS klien melainkan server function service role.
- Permission `settings.branding.update` di-seed ke `public.permissions` (syarat agar `get_my_permissions` mengenalinya) dan diberikan hanya ke `super_admin`; perilaku section Branding tidak melebar.
- Trigger `guard_home_banner_settings` pada `system_settings`: baris `home_banner_%` hanya boleh ditulis pemegang `settings.branding.update` atau service role. Ini menutup celah writer langsung `is_admin` tanpa menyentuh policy settings lain.

Deployment via helper `.zcode/home-banner-db.mjs`: preflight (bucket/permission/trigger belum ada), rehearsal test dalam transaksi dengan ROLLBACK (anon ditolak, authenticated tanpa izin ditolak, passthrough non-banner, service role lolos, snapshot identik), apply (APPLIED 20261003090000), postflight live: bucket private + MIME benar, permission 1, grant super_admin 1, trigger 1, seluruh 27 baris settings baseline tidak berubah, tanpa penambahan baris settings. Log: `.zcode/home-banner-*.log/json`.

## Hasil pemeriksaan

- Decoder `sharp` di Node 22: decode ulang JPEG/PNG/WebP/AVIF OK (AVIF dilaporkan `heif` oleh sharp, dipetakan lewat sniffing ftyp), PNG terpotong ditolak. Log `.zcode/home-banner-decoder-verify.log`.
- Unit: 181 test PASS, 14 file (baseline 165, +16 dari test banner/validator). Log `.zcode/home-banner-unit-full.log`.
- Lint scoped 10 file: 0 error, 25 warning `no-explicit-any`/hooks yang sudah ada sebelum perubahan ini; file banner baru bersih. Log `.zcode/home-banner-lint.log`.
- Build: exit 0; `sharp` hanya di bundle server (`.output/server`), tidak masuk bundle klien. Log `.zcode/home-banner-build.log`.
- TypeScript `tsc --noEmit`: exit 2 (baseline diagnostics pre-existing), perbandingan ternormalisasi 70 vs 70, 0 diagnostic baru. Log/comparison `.zcode/home-banner-tsc*.log/json`.
- Kontras 18 pasangan token light/dark PASS (minimum 5.36:1); banner tidak menambah teks di luar backing card. Log `.zcode/home-banner-contrast.log`.
- HTTP GET server existing di localhost:8081: panel netral, navbar search, kartu home/katalog, dan detail tetap 200 sesuai assertion. Catatan: proses server berjalan sebelum perubahan ini, sehingga hasil ini membuktikan regression panel existing, bukan render banner. Log `.zcode/home-banner-http.log`.

## Batas verifikasi (belum dilakukan)

- Visual/interaction: 390px/768px/desktop, zoom 200%, dua tema, gambar terang/gelap/ramai, crop/focus, console/hydration, click-through upload-save-preview: BELUM DIVERIFIKASI (browser dilarang owner). Renderer/preview memakai media query viewport sehingga preview mobile pada frame admin adalah aproksimasi, sudah diberi keterangan di UI.
- Runtime upload end-to-end di production (unggah file nyata oleh super_admin) belum dijalankan; alurnya diuji lewat unit, rehearsal trigger, dan postflight konfigurasi.
- Objek banner belum ada (settings masih default kosong), sehingga home saat ini tetap panel netral; rollback cukup dengan mengosongkan gambar utama lewat save berizin.
- Orphan object saat replace/reset tidak dihapus otomatis (sesuai kontrak); cleanup merupakan scope terpisah.
- Tidak ada commit/push/publish; histori git tidak disentuh.
