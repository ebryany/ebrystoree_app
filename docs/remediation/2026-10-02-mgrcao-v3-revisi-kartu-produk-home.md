# MGRCAO V3: revisi kartu produk home

Tanggal: 2026-10-02. Framework disusun sebelum edit. Otorisasi: revisi UI/UX kartu produk halaman home, tanpa perluasan scope.

## M: Mindset

Kartu membantu pembeli mengenali isi produk, membandingkan harga, dan membuka detail. Jangan menambah ornamen atau fitur palsu. Pertahankan data asli dan DESIGN.md ink-teal/low elevation/stack existing.

## G: Goals

1. Kartu home lebih lapang, hierarki judul/harga jelas, ringkasan asli terlihat bila ada.
2. Thumbnail tidak memotong isi pratinjau produk pada home.
3. Identitas toko dan status resmi ringkas tanpa mendominasi harga.
4. Harga normal/diskon/invalid tetap konsisten dan jujur; tidak menambah rating/sold/stock.
5. CTA detail lebih jelas, seluruh kartu tetap satu link keyboard-friendly.
6. Tampilan kartu di katalog produk/toko dan layanan tidak berubah.

## R: Role

Satu engineer. Tidak agent, server baru/restart, browser-use atau browser pengganti, dependency, database, publish/git operations. Framework bukan CreateWorkflow. Perubahan reversibel langsung dikerjakan sesuai otorisasi.

## C: Context

Source: MarketplaceProductCard dipakai home, katalog /produk, toko. Saat ini grid home mencapai enam kolom di max-width 6xl; kartu sempit, title dua baris tanpa ruang konsisten, deskripsi payload tidak terlihat, thumbnail object-cover, CTA berupa teks kecil. Harga sudah mempunyai validasi finite/nonnegative dan diskon positif lebih kecil dari base; logika itu dipertahankan.

Design read: kartu discovery produk digital Ebrystore, ENERGY 2 / RHYTHM 2 / MOTION 1. Page direction tidak diubah.

Alasan: maksimal empat kolom desktop memberi ruang nama/harga; dua kolom mobile tetap efisien. Thumbnail home object-contain/padding menjaga pratinjau lengkap. Title dua baris dan deskripsi dua baris memudahkan scanning; harga lebih besar dan tabular. CTA strip 44px memberi affordance jelas tanpa button palsu atau nested link. Store resmi memakai field existing, bukan trust claim baru. Feedback warna/focus saja, reduced motion. Tidak perlu aset/shadow/scale/glow baru.

Allowlist:
- src/components/home/catalog-cards.tsx: MarketplaceProductCard mendapat variant home opsional saja; default dan export lain tidak didesain ulang.
- src/routes/index.tsx: pemanggilan variant home dan grid ProductsSection saja.
- src/components/home/marketplace-home.test.tsx: regression scoped.
- Framework/evidence terkait, log .zcode/home-card-*.

Tidak mengedit navbar/footer/kategori/hero/service/header search, produk.index/layanan/toko, checkout, API, SQL, dependency, settings. Default prop harus menghasilkan markup lama tanpa perubahan visual.

## A: Actions

1. Tambahkan variant home ke kartu existing supaya logika harga tidak digandakan. Home opt-in; consumer lain default lama.
2. Ubah hanya thumbnail/layout/store/description/price/CTA pada variant home dan grid maksimum empat kolom.
3. Deskripsi null tidak menghasilkan copy rekaan. Thumbnail/alt memakai pola existing; image decorative karena link memuat nama.
4. Link product detail tetap valid, satu anchor per kartu; tanpa quick-buy/cart/wishlist atau clickable store baru.
5. Tests: home memakai variant/grid, description muncul hanya di home, default markup tetap, valid/invalid diskon, resmi/store missing, thumbnail contain/lazy, satu link/CTA/focus.
6. Jalankan seluruh unit, scoped lint, build, TypeScript dibanding baseline, kontras token existing, GET home dan katalog existing.
7. Catat GUI/mobile visual/keyboard/hydration belum diuji sesuai larangan, tidak klaim visual-approved.

## O: Outputs

Kartu home lebih informatif dan lapang, consumer default tetap unchanged. Regression runnable dan evidence pemeriksaan. Tidak publish atau mengimplementasikan jasa seller.
