# Verifikasi redesign home marketplace

Tanggal: 2026-10-02. Framework: [MGRCAO V3 home](../remediation/2026-10-02-mgrcao-v3-redesign-home-marketplace.md).

## Hasil dan urutan kerja

Source home sudah berubah. Framework ditulis setelah edit awal karena koreksi user; pemeriksaan ulang, perbaikan parameter wajib filter pesanan, word-wrap kategori, dan verifikasi final mengikuti framework. Bukan pelaksanaan framework-first sejak awal.

Perubahan utama:

- Discovery ringkas dengan pencarian produk, batas input 80 karakter, akses katalog/pesanan/produk dibeli.
- Kategori produk aktif dari database, URL filter `kategori` sesuai kontrak katalog.
- Satu grid maksimal 12 produk, tanpa section rekomendasi duplikat.
- Nama, toko, label resmi dari field existing, harga, dan diskon valid pada kartu.
- Tidak lagi mengklaim populer, personalisasi, ribuan, atau siap dikirim tanpa field bukti.
- Layanan platform akademik terpisah, maksimal tiga, tidak menjadi jasa seller.
- Error kategori dikembalikan eksplisit secara additive. Query/filter/policy katalog tidak berubah.
- Skeleton reduced-motion, retry minimal 44px, fokus dan wrap tersedia di source.

Kartu produk marketplace juga dipakai halaman toko existing; styling kartu itu ikut berubah. Header/footer shared dan export ProductCard/ServiceCard lama tidak didesain ulang; formatter merapikan file kartu.

## Pemeriksaan executable

| Pemeriksaan | Hasil aktual |
|---|---|
| `npx vitest run src/components/home/marketplace-home.test.tsx` | PASS, 16 test |
| `npm run test:unit` | PASS, 135 test pada 13 file |
| Scoped ESLint home/kartu/states/test | PASS, exit 0, tidak ada pesan |
| ESLint `catalog.functions.ts` | 0 error, 6 warning di luar fungsi kategori; fungsi kategori tidak memiliki pesan lint |
| `npm run build` final | PASS, exit 0; warning `inlineDynamicImports` diabaikan karena `codeSplitting` tersedia |
| `npx tsc --noEmit` | FAIL, exit 2; 70 error persis sama dengan baseline `.zcode/monitoring-tsc.log`, 0 error tambahan |
| `.zcode/home-redesign-contrast.mjs` | PASS, 18 pasangan token light/dark, minimum 5.36:1 |

Log lokal: `.zcode/home-redesign-unit.log`, `.zcode/home-redesign-lint.log`, `.zcode/home-redesign-catalog-lint.json`, `.zcode/home-redesign-build.log`, `.zcode/home-redesign-tsc.log`, `.zcode/home-redesign-contrast.log`.

Render test memakai mock query dan router. Membuktikan output markup dari fixtures, bukan server functions live atau klik browser. Perhitungan kontras mengambil OKLCH token, bukan warna computed screenshot.

## Gate anti-slop

Gate keseluruhan **BELUM TERVERIFIKASI**, bukan visual-approved. Larangan browser-use, server baru, dan agent dipertahankan.

| Aturan | Status | Evidence/batas |
|---|---|---|
| R-02 | PASS scoped source | Copy home baru tanpa em dash; export kartu lama tidak dijadikan scope rewrite |
| R-03 | BELUM DIVERIFIKASI GUI | Grid responsive, min-w-0, wrap, 44px ada; mobile 390px tidak dirender |
| R-17, R-18, R-36, R-38 | PASS scoped source | Tidak ada stats/testimoni/klaim palsu; harga/toko/kategori berasal dari payload |
| R-23 | PASS scoped source | Tidak membuat aset; thumbnail existing dan fallback jelas |
| R-24 | PASS kontrak source | Tujuan home ada di route manifest; bukan bukti navigasi browser |
| R-25 | PASS pasangan token | 18 pasangan memenuhi AA; tidak menilai seluruh shared header/footer atau computed render |
| R-26 | PASS wiring source, GUI belum | Semua kontrol mempunyai link/onSubmit/onRetry; efek klik live belum diperiksa |
| R-27 | PASS markup | Fixtures empty/error/normal lulus; suspense dan pending component tersedia |
| R-28 | PASS scoped source | Tidak menambah FAQ |
| R-32 | BELUM DIVERIFIKASI GUI | Elemen native, focus ring, urutan DOM ada; Tab/Enter browser belum diuji |
| R-33 | PASS | Edit source langsung, tidak ada script patch source/CSS |
| R-34 | BELUM DIVERIFIKASI GUI | Tidak menambah theme toggle; token kedua tema diuji, render belum |
| R-35 | BELUM DIVERIFIKASI GUI | Build PASS; klik-through dan console browser belum diperiksa |
| R-37 | PASS direction | DESIGN.md dibaca; ENERGY 2 / RHYTHM 3 / MOTION 2 dinyatakan |
| Purpose-Gate | PASS alasan source | Warna/layout/font/spacing/kartu/ikon/badge/motion/aset dijelaskan dalam framework |
| Liveliness | BELUM DIVERIFIKASI visual | Search sebagai focal point, variasi grid produk/kartu layanan ada di source; kualitas komposisi belum dinilai pada render |
| Craftsmanship C-1/C-3/C-5 | PASS scoped source | Konten nyata, alasan eksplisit, section promosi tidak diperlukan dihapus |
| Craftsmanship C-2/C-4 | BELUM DIVERIFIKASI GUI | Wiring/state tersedia, interaksi dan resilience runtime belum diperiksa |
| Quality Locks | PASS direction/source; visual belum | Token/radius/CTA existing dipakai, tanpa clone/gradient/dependency baru; hasil visual belum dinilai |

## Tujuan kontrol, belum klik-through

- Cari: submit menuju `/produk`, search `q` trimmed.
- Semua produk/katalog: `/produk`.
- Kategori: `/produk?kategori=<slug>`.
- Produk: `/produk/<slug>`.
- Semua layanan: `/layanan`; kartu layanan `/layanan/<slug>`.
- Pesanan saya: `/dashboard/pesanan?filter=all`, auth existing berlaku.
- Produk yang dibeli: `/dashboard/produk-saya`, auth existing berlaku.
- Bantuan: `/bantuan`.
- Retry data: refetch query terkait; exception section: reset query; error route: reset route.

## Pemeriksaan HTTP server existing setelah instruksi kerjakan

Framework dibaca kembali sebelum pemeriksaan runtime lanjutan. `node .zcode/home-redesign-http-check.mjs` lulus: GET home HTTP 200, judul dan markup redesign tersedia, tidak ada alert error, klaim lama, atau produk duplikat.

Payload publik saat pemeriksaan menampilkan satu kartu produk dan nol link kategori. Kategori tidak diisi data buatan; fallback kategori tetap tersedia. GET `/produk`, `/layanan`, `/bantuan`, dan detail produk yang tampil mengembalikan HTTP 200. GET `/produk?q=template` mengembalikan HTTP 200 dan memuat produk yang cocok.

Evidence: `.zcode/home-redesign-http-result.json`. Semua pemeriksaan read-only melalui HTTP/SSR markup, bukan klik browser, visual review, atau bukti hydration. Tidak menyalakan server baru dan tidak mengubah database.

## Batas

Tidak ada server dinyalakan/restart, browser automation, agent, dependency, SQL/database, transaksi/saldo, publish, atau git operation. Implementasi jasa seller tetap ditunda. Frontend production belum dipublish. Perubahan source/test/build selesai; acceptance visual/interaksi belum tersedia.
