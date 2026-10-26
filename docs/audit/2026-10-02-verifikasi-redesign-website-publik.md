# Verifikasi redesign website publik Ebrystore

Tanggal: 2026-10-02. Dasar: [MGRCAO V3 website publik](../remediation/2026-10-02-mgrcao-v3-redesign-website-publik.md). Framework tahap ini dibuat sebelum source diedit.

## Hasil perubahan

- Home: discovery ink-teal solid, teks di atas warna solid, input berkontras, shortcut akun pada surface card. Grid produk dan layanan tetap tidak digandakan.
- Header: brand/logo settings dipertahankan, search pada halaman publik selain home, menu settings pada bar kedua, akses login/account/admin/operator/chat/notifikasi/logout dan drawer mobile dipertahankan. Breakpoint navigasi desktop menjadi lg agar lebih banyak ruang; kontrol akun dan menu 44px.
- Footer: brand/support terpisah dari kelompok navigasi settings; email, WhatsApp, jam operasional, dan kebijakan tetap ada. Jarak kosong mt-20 dihapus, link mendapat focus dan target 44px.
- Produk: menggunakan MarketplaceProductCard existing; toko dapat dibuka melalui link saudara, bukan nested anchor. Tidak memaksa store slug non-null. Harga/toko konsisten dengan home; klaim otomatis/5x/365hari tidak dipasang pada semua item. Hitungan hanya produk ditampilkan, bukan total dari page pertama.
- Layanan: tetap layanan pendampingan akademik platform, menggunakan kartu existing dengan minimum paket aktif/harga valid. Bukan jasa seller marketplace.
- Filter: submit Enter/button, maksimal 80 karakter, clear/reset membatalkan timer pending, kategori wrap dan target 44px, ring menggantikan focus shadow.
- Pagination: manual Muat lebih banyak, tanpa IntersectionObserver auto-fetch. User mengendalikan pengambilan halaman; failure halaman berikutnya mempunyai retry dan tidak menyembunyikan items sebelumnya. Error response dan exception berikutnya sama-sama ditampilkan.
- Katalog memakai PageShell dan skip-to-content existing; empty/error/pending dipertahankan, error kategori terpisah dari produk/layanan.

File source berubah pada tahap ini: `src/components/site-header.tsx`, `src/components/site-footer.tsx`, `src/components/catalog-filters.tsx`, `src/routes/index.tsx`, `src/routes/produk.index.tsx`, `src/routes/layanan.index.tsx`. Test baru: `src/components/home/public-storefront.test.tsx`. Backend/data/SQL tidak berubah pada tahap ini.

Shared header/footer juga dipakai halaman detail, dashboard, seller/operator, dan checkout existing. Chrome ikut berubah; isi, actions transaksi, dan data halaman tersebut tidak diubah. Search header tidak ditambahkan ke dashboard/admin/seller/operator/checkout/auth.

## Evidence executable

| Check | Hasil |
|---|---|
| Semua unit test | PASS, 147 test, 14 file |
| Regression website publik baru | PASS, 12 test: kartu/link toko, slug kosong, kategori error, first/next-page error, pagination, empty filter, layanan platform, header/footer/filter markup |
| Scoped lint tujuh file source/test | PASS, exit 0, log tanpa pesan |
| Production build | PASS, exit 0; warning inlineDynamicImports diabaikan karena codeSplitting specified |
| TypeScript | FAIL baseline, 70 error, 0 diagnostic baru setelah normalisasi nomor baris |
| Kontras token light/dark | PASS, 18 pasangan, minimum 5.36:1 |
| HTTP home | PASS 200, source redesign tersaji dalam SSR markup, 1 produk, 0 kategori, tanpa alert error atau produk duplikat |
| HTTP `/produk`, `/layanan`, `/bantuan`, detail produk actual | PASS 200 |
| HTTP `/produk?q=template` | PASS 200 |
| HTTP unmatched produk dan layanan | PASS 200, empty state filter tampil |

Perubahan TypeScript yang hanya bergeser lokasi: diagnostic RPC search_products_fts pada catalog.functions.ts dari baris 70 menjadi 73 karena formatting pekerjaan sebelumnya. Isi diagnostic sama; bukan perbaikan atau tambahan diagnostic.

Log: `.zcode/public-redesign-unit.log`, `.zcode/public-redesign-lint.log`, `.zcode/public-redesign-build.log`, `.zcode/public-redesign-tsc.log`, `.zcode/public-redesign-contrast.log`. Check HTTP home runnable: `.zcode/home-redesign-http-check.mjs`; evidence `.zcode/home-redesign-http-result.json`.

Regression runnable: `npx vitest run src/components/home/public-storefront.test.tsx src/components/home/marketplace-home.test.tsx`.

## Gate anti-slop

Gate keseluruhan **BELUM DIVERIFIKASI VISUAL**, bukan visual-approved. Source dan HTTP bukan pengganti screenshot/klik/hydration.

- R-02 PASS source yang diedit: copy tanpa em dash.
- R-03 BELUM DIVERIFIKASI render mobile; grid/min-width/wrap/44px ada di source.
- R-17/R-18/R-36/R-38 PASS scoped source: tidak menambah stats/testimoni/personalization/klaim keamanan atau kesiapan palsu; jumlah ditampilkan berasal dari items.
- R-23 PASS: tidak membuat aset baru atau mengganti identitas; logo/name/menu settings dipakai.
- R-24 PASS source/HTTP tujuan katalog/detail/bantuan; auth/role link wiring tetap, interaksi login belum diuji.
- R-25 PASS pasangan token untuk teks pada kedua tema; seluruh computed render belum diperiksa.
- R-26 PASS wiring source dan HTTP destination; submit/reset/drawer/logout browser belum diverifikasi.
- R-27 PASS fixtures normal/empty/error; pending/skeleton tersedia; next-page failure retry tetap menampilkan item sebelumnya.
- R-28 PASS: tidak menambah FAQ generik.
- R-32 BELUM DIVERIFIKASI keyboard runtime; native controls/ring/skip link dan Radix drawer tersedia.
- R-33 PASS: source diedit langsung, tidak ada script patch UI/CSS.
- R-34 BELUM DIVERIFIKASI theme render; tidak menambah theme toggle, pasangan token kedua tema lulus.
- R-35 build PASS, GUI/console/klik-through BELUM DIVERIFIKASI.
- R-37 PASS: DESIGN.md dipakai; ENERGY 2 / RHYTHM 3 / MOTION 2 tertulis sebelum edit.
- Purpose-Gate PASS alasan tertulis dalam framework: ink-teal focal point, dua tingkat nav, font existing, spacing/kartu produk vs layanan, motion feedback, tanpa aset/gradient/glow baru.
- Liveliness BELUM DIVERIFIKASI visual; source mempunyai focal panel ink-teal, composition search/grid layanan horizontal, rhythm spacing.
- Craftsmanship PASS alasan/konten/wiring source; resilience visual/hydration BELUM DIVERIFIKASI.
- Quality Locks PASS source/direction: token/font existing, CTAs spesifik, tanpa clone/promo palsu, radius hierarchy; komposisi render BELUM DIVERIFIKASI.

## Batas akhir

Tidak menyalakan/restart server, menggunakan browser-use/browser pengganti, spawn agent, edit dependency/AGENTS.md, database/migration/transaksi/rekber, publish atau git operations. Jasa seller tetap ditunda. Isi detail/auth/dashboard/checkout bukan scope redesign; hanya menerima chrome shared. Perubahan website publik source/test/build/HTTP selesai; acceptance visual belum tersedia.
