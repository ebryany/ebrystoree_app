# MGRCAO V3: desain UI/UX form tambah produk seller

Tanggal: 2026-10-03. Dasar: keluhan owner bahwa form tambah produk terlihat polos dan tidak seperti marketplace (screenshot seller.produk.baru), [DESIGN.md](../../DESIGN.md), temuan form pada source. Status: dieksekusi pada pekerjaan ini; scope terkunci pada file di bawah.

## M: Mindset

Form tambah produk adalah alur kerja seller, bukan landing page. Kualitasnya diukur dari: seller paham field mana yang wajib, melihat bagaimana produknya akan tampil ke pembeli, dan tidak mengisi data yang tidak tersimpan. Form lama hanya satu kolom field datar, tidak memakai field yang sudah didukung backend (kategori, limit unduhan, masa berlaku), dan tidak ada validasi diskon terhadap harga.

Pratinjau kartu katalog adalah inti "terasa marketplace": seller melihat hasil akhirnya. Pratinjau bersifat jujur: tampilan non-klik, tanpa slug palsu, dan menyebut status moderasi.

## G: Goals

1. Form terbagi section bermakna: informasi produk, harga, pengaturan produk digital.
2. Field yang sudah didukung `saveMyProduct` ikut tersedia: kategori, limit unduhan, masa berlaku.
3. Pratinjau kartu pembeli yang hidup mengikuti input (nama, deskripsi, thumbnail, harga akhir).
4. Validasi inline yang benar: nama minimal, harga wajib, diskon < harga, URL gambar renderable.
5. Mobile 390px rapi, target sentuh 44px, focus terlihat, tanpa hue/asset/dependency baru.

## R: Role

Engineer UI/UX alur seller dengan kendala token existing dan server functions existing. Scope: satu route form plus satu server function kecil untuk kategori. Bukan role untuk redesign dashboard, upload file baru, atau mengubah `saveMyProduct`.

## C: Context

- `saveMyProduct` (src/lib/seller.functions.ts) sudah menerima name, shortDescription, description, price, discountPrice, thumbnailUrl (validasi `isRenderableImageUrl`), downloadLimit default 5, validityDays default 365, categoryId opsional.
- Form edit (seller.produk.$id) tidak disentuh tahap ini; penyelarasan edit menyusul bila diminta.
- Kategori platform di tabel categories kind `product`, SELECT publik untuk authenticated. Belum ada server function listernya; dibuatkan satu yang kecil.
- Backend tidak berubah. Moderasi tetap: produk baru berstatus draft/pending.
- Pratinjau tidak boleh jadi Link mati (R-24/R-26): komposisi visual sendiri, bukan MarketplaceProductCard yang wajib slug.

## A: Actions

1. Tulis ulang seller.produk.baru.tsx: header (kembali, judul, satu kalimat tujuan), grid dua kolom desktop (form kiri, pratinjau kanan sticky), satu kolom mobile dengan pratinjau setelah form.
2. Card Informasi produk: nama (counter 160), kategori (select dari listProductCategories, opsi tanpa kategori), deskripsi singkat (counter 300), deskripsi lengkap.
3. Card Harga: input angka ribuan id-ID, validasi inline harga wajib dan diskon < harga, baris "tampil di katalog" memakai harga akhir dengan tabular-nums.
4. Card Pengaturan produk digital: limit unduhan (1-100), masa berlaku (1-3650 hari), gambar produk, URL alternatif. Submit di akhir, full width, min-h-11.
5. Error inline per field dengan aria-invalid dan pesan eksplisit; toast tetap untuk kegagalan server.
6. listProductCategories: server function GET ber-auth, select id/name kind product aktif, error jelas bila gagal.
7. Upload gambar produk (permintaan owner 2026-10-03): ImageUploader existing dengan uploadRemote; server function uploadProductImage (rate limit seller.product, toko aktif milik sendiri) memakai persistCatalogImage; validasi server tetap ukuran/signature/sharp/dimensi; URL hasil lewat proxy /api/public/catalog-image sehingga lolos isRenderableImageUrl. banner-upload.server.ts diubah minimal: validator diekstrak menjadi persistCatalogImage dan persistBannerImage menjadi wrapper tanpa mengubah perilaku banner.

## O: Outputs

- Route form baru, export listProductCategories dan uploadProductImage di seller.functions.ts, ekstraksi persistCatalogImage di banner-upload.server.ts, verifikasi: prettier, lint scoped, unit penuh, tsc dibanding baseline 71 (harus 0 tambahan), build. GUI tidak dinyalakan; klaim klik-through diganti pemeriksaan kode.
- Rollback: revert route, dua export, dan ekstraksi validator; tidak ada perubahan data.
- Tidak termasuk: form edit, halaman lain, realtime (framework terpisah).
