# MGRCAO V3: redesign website publik Ebrystore

Tanggal: 2026-10-02. Status awal: framework ditulis sebelum edit tahap website publik. Otorisasi: user meminta "redesain webnya". Melanjutkan home yang sudah diubah, bukan mengimplementasikan jasa seller.

## M: Mindset

Bangun satu storefront yang konsisten, bukan kumpulan landing page. Search, kategori, produk, harga, dan identitas toko harus menjadi alat belanja. Layout tidak boleh bergantung pada katalog ramai atau promosi palsu.

Pertahankan direction DESIGN.md, data asli, auth, query/filter/pagination, checkout dan rekber existing. Anti-slop diterapkan selama pengerjaan. Tidak memperkenalkan aset/dependency atau motif generik baru.

## G: Goals

1. Header publik menjadi navigasi marketplace: brand, pencarian produk, akun, kategori navigasi settings existing.
2. Home mempunyai komposisi storefront yang lebih tegas, bukan sekadar kotak putih: area discovery ink-teal dan grid produk yang konsisten dengan katalog.
3. Katalog produk menggunakan kartu marketplace yang sama, tanpa janji automatic/stock unsupported; hitungan hanya jumlah yang benar-benar ditampilkan.
4. Katalog layanan menampilkan paket existing sebagai layanan platform, bukan marketplace seller.
5. Filter search/category 44px, focus terlihat, empty/error/retry jelas; pagination dapat dilanjutkan manual jika gagal.
6. Footer tidak menjadi lima blok yang dipaksakan ke empat kolom; link kebijakan/support settings tetap tersedia.
7. Build/tests/source/HTTP diperiksa; GUI belum diverifikasi sesuai larangan browser.

## R: Role

Satu engineer bekerja sendiri. Tidak menyalakan/restart server, memakai browser-use atau browser automation pengganti, spawn agent, edit AGENTS.md/dependency, mengubah database/migration, publish atau operasi git. Tidak meredesain dashboard/admin/seller/operator, auth, atau checkout; perubahan shared header/footer sebatas tampilan dan navigasi existing.

## C: Context

Source dibaca sebelum framework: home sebelumnya sudah diimplementasikan; DESIGN.md ink-teal/low elevation/stack existing; katalog produk dan layanan menggandakan kartu dengan shadow/scale; footer mempunyai lima blok pada grid empat kolom; filter search menonaktifkan ring dan menggantinya dengan shadow, clear dan kategori 36px. Katalog produk memakai total dari page pertama padahal API total hanya panjang page itu. Jangan menyebutnya total marketplace. Pagination existing tetap tersedia.

Kontrak: /produk memakai q/kategori/toko; /layanan memakai q/kategori. Backend listProducts memakai category/store. Layanan platform tidak mempunyai store ownership. Branding dan menu berasal dari settings. Tidak mengubah settings hanya untuk redesign.

Design read: storefront bagi pembeli digital, bahasa visual ink-teal Ebrystore, ENERGY 2 / RHYTHM 3 / MOTION 2.

Alasan keputusan:
- Ink-teal solid pada discovery home menjadi identitas/focal point, bukan gradient/glow/template illustration.
- Header mempunyai dua tingkat: brand/search/account, lalu navigasi; pencarian tidak bersaing dengan seluruh menu dalam satu bar.
- Koreksi owner: pencarian navbar juga tampil di home, meskipun panel home mempunyai pencarian sendiri; dashboard/checkout tidak mendapat search baru.
- Grid produk memakai kartu existing agar harga/toko identik sepanjang penelusuran; tautan toko existing tetap dipertahankan tanpa nested link.
- Katalog layanan menggunakan kartu horizontal dengan thumbnail dan paket minimum valid, berbeda dari produk file.
- Filter wrap, bukan scrolling tersembunyi; input native dan ring, kontrol 44px.
- Footer brand/support terpisah dari katalog/layanan/help/legal, ukuran mengikuti konten dan settings.
- Font existing mempertahankan identitas; harga tabular, heading sentence case, teks di luar gambar.
- Motion hanya feedback warna <=200ms, reduced motion; tidak ada scale/reveal/loop dekoratif.

Allowlist:
- src/routes/index.tsx, src/routes/produk.index.tsx, src/routes/layanan.index.tsx.
- src/components/site-header.tsx, site-footer.tsx, catalog-filters.tsx, catalog-states.tsx jika state perlu diperbaiki.
- src/components/home/catalog-cards.tsx untuk mempertahankan navigasi toko tanpa nested link dan source regression home existing.
- Test storefront kecil pada src/components/home, framework/evidence terkait, log .zcode/public-redesign-*.

Tidak mengubah detail transaksi/policy/database atau menambah cart/wishlist/personalization/ratings/promo. Detail produk/layanan/toko/bantuan/artikel menerima chrome shared, bukan rewrite keseluruhan isi.

## A: Actions

### A-01. Baseline

Baca source dan framework ini sebelum edit. Existing home: 135 unit test PASS, build PASS, TypeScript 70 error baseline. Catat route/link/settings consumer. Jangan memakai dokumen sebagai bukti visual.

### A-02. Chrome dan home

1. Pertahankan logo/name/menu settings dan seluruh akses role/account/mobile menu.
2. Hapus cabang dark konstan yang tidak dipakai hanya bila menyederhanakan perubahan; tetap gunakan token theme-aware. Variant legacy tetap kompatibel.
3. Pencarian header publik trim/maxlength 80; route /produk q. Header mobile menu tetap Radix accessible.
4. Home discovery ink-teal dengan text primary-foreground solid; input white/card, ring jelas. Komposisi katalog tidak diulang.
5. Footer susun berdasarkan nav data; email/support/hours/legal tidak hilang.

### A-03. Katalog dan filter

1. Produk kartu shared, grid responsive, jumlah items.length bukan total page pertama.
2. Tautan toko dengan slug nyata tetap dapat dibuka tanpa nested link; hilangkan non-null assertion sebagai asumsi slug.
3. Layanan disebut platform; harga minimum valid/aktif, tanpa klaim revisi semua paket bila tidak terbukti.
4. Filter input maxlength, Enter immediate search, clear/reset cancel pending debounce, ring, 44px, kategori wrap.
5. Error kategori eksplisit tidak menutup produk/layanan. Error pagination ditampilkan dengan retry manual dan tidak menghapus item sebelumnya.
6. Jangan mengubah API atau database untuk desain.

### A-04. Acceptance

- Render regression: produk tidak duplikat, harga/discount valid, link toko bukan nested anchor, markup katalog konsisten, hitungan tidak mengaku total.
- Search/filter/header source atau render check: q/kategori/toko terpelihara, maxlength, submit, focus/44px.
- Empty/error/normal output per katalog; first/next-page error mempunyai retry.
- Semua unit tests, scoped lint, build; TypeScript dibandingkan baseline, jangan memperbaiki unrelated error.
- Kontras pasangan token light/dark; HTTP server existing home/catalog/search/detail/support.
- GUI, hydration, Tab, mobile screenshot dan klik-through BELUM DIVERIFIKASI; bukan PASS visual.

### A-05. Delivery dan rollback

Hasil source/tests/HTTP dilaporkan beserta batas visual. Jangan menyatakan redesign seluruh dashboard atau publish. Jika regresi terjadi, perbaiki/pulihkan hanya edit pada tahap ini, bukan reset folder atau menghapus perubahan user.

## O: Outputs

Website publik dengan chrome dan katalog seragam, home lebih berkarakter storefront, satu regression runnable, evidence lint/unit/build/typecheck/HTTP/contrast. Implementasi jasa seller dan finansial tetap tidak berubah.
