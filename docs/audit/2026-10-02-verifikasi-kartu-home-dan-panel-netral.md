# Verifikasi kartu home dan panel pencarian netral

Tanggal: 2026-10-02. Framework sebelum edit: ../remediation/2026-10-02-mgrcao-v3-revisi-kartu-produk-home.md dan ../remediation/2026-10-02-mgrcao-v3-panel-pencarian-home-netral.md.

## Perubahan

MarketplaceProductCard mempunyai variant home opt-in: preview object-contain, ringkasan asli bila ada, judul dua baris, identitas resmi ringkas, harga lebih besar, CTA minimum 44px dalam satu link. Default katalog tetap object-cover/rounded-lg/tanpa ringkasan. ProductsSection home maksimum empat kolom desktop.

Koreksi owner berikutnya: panel MarketplaceDiscovery memakai bg-card/text-foreground, deskripsi muted, divider akses belanja. Tombol Cari tetap primary; navbar search tetap tampil. Tidak mengubah copy atau routing.

## Evidence

- PASS unit: npm run test:unit, 165 test pada 14 file. marketplace-home.test.tsx 34 test; public-storefront.test.tsx 12 test. Log .zcode/home-card-unit.log.
- PASS scoped lint: npx eslint src/components/home/catalog-cards.tsx src/components/home/marketplace-home.test.tsx src/routes/index.tsx, exit 0. Log .zcode/home-card-lint.log.
- PASS build setelah panel netral: npm run build, exit 0. Log .zcode/home-card-build.log. Tidak menyalakan preview/server.
- PASS kontras token: 18 pasangan light/dark, minimum 5.36:1; foreground/card panel 17.18:1 light dan 14.50:1 dark. Log .zcode/home-card-contrast.log. Bukan pengukuran screenshot atau keseluruhan non-text boundary.
- PASS HTTP/SSR: server existing localhost:8081, home/katalog/detail masing-masing 200; satu kartu home memakai variant, katalog tidak memakai variant, panel netral dan navbar search hadir. .zcode/home-card-http-check.mjs runnable, hasil .zcode/home-card-http-result.json.
- TypeScript bukan PASS: perintah dibatalkan setelah mengeluarkan diagnostics. Output yang tertangkap berisi 70 diagnostic baseline, nol baru dibanding .zcode/public-redesign-tsc.log setelah normalisasi posisi. .zcode/home-card-tsc-comparison.json mencatat batas ini. Tidak memperbaiki error di luar scope.

Test panel sempat gagal karena assertion melarang primary pada seluruh panel termasuk tombol Cari. Diperbaiki agar hanya memeriksa opening section; suite akhir 165 PASS.

## Delivery gate dan batas

- PASS source honesty: deskripsi/harga/store/resmi dari field existing; tidak menambah rating/sold/klaim siap kirim atau aset baru.
- PASS purpose/source: alasan grid/preview/typography/CTA tertulis di framework; token existing, tanpa gradient/glow/animasi dekoratif.
- PASS regression source: satu anchor detail, CTA span bukan button mati, focus/reduced-motion classes, empty/error existing terjaga.
- BELUM DIVERIFIKASI visual/mobile/zoom/theme rendering, keyboard aktual, hydration, console browser dan klik. Browser dan server baru dilarang owner. Build/SSR tidak menggantikan gate tersebut; tidak mengklaim visual-approved atau siap publish.

## Scope

Hanya tiga file source/test dalam allowlist dan dokumen/log terkait. Tidak mengubah katalog/toko consumer, navbar/footer/layanan, API/SQL/database/dependency/AGENTS, tidak publish/commit. Riset banner custom berikutnya tidak berarti implementasi banner sudah ada pada panel.
