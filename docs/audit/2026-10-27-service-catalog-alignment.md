# EBRYSTORE — Service Catalog Layout Alignment Report

Tanggal: 2026-10-27 | Commit: `dbcfca5` (lokal, belum push — menunggu persetujuan)
Target: `/layanan` | Referensi: `/produk`

## 1. Perbedaan awal `/produk` vs `/layanan`

Kedua route sebenarnya sudah memakai fondasi yang sama (PageShell, container
`max-w-6xl`, breadcrumb, `CatalogFilters`, toolbar hasil, load-more, empty/error
state). Perbedaan nyata ada di tiga lapisan:

| Element | `/produk` (before) | `/layanan` (before) | Perubahan |
|---|---|---|---|
| Grid | `auto-fill minmax(260px,1fr)`; kartu 260–320px, tidak meregang | `md:grid-cols-2 lg:grid-cols-3` kolom tetap; 2 jasa meregang jadi kartu raksasa (gambar persegi ±370px) | Grid disamakan |
| Kartu | `MarketplaceProductCard` varian katalog: `rounded-lg`, `p-3`, harga `text-base`, CTA container-query `@[300px]` | `SellerServiceCard`: `rounded-xl`, `p-3.5`, harga `text-lg/xl`, CTA `sm:flex-row` berbasis viewport (sesak di kartu sempit) | Varian kartu disamakan |
| Filter | Panel ramping (DB: 0 kategori produk → chip tak dirender) | 13 chip `min-h-11 px-4` menumpuk 2 baris desktop / 8 baris mobile | Expandable (8 + tombol perluas) |

Akar masalah "filter dominan": DB produksi punya **13 kategori `service` dan 0
kategori `product`**, sehingga perbedaan terlihat hanya di `/layanan`.

## 2. Masalah layout yang ditemukan

1. Kartu jasa meregang memenuhi kolom (2 item → 2 kolom penuh, sepertiga kanan
   kosong) karena jumlah kolom tetap, bukan lebar minimum.
2. Chip kategori 13 buah tanpa batas tampil membuat area listing terdorong jauh
   ke bawah (mobile: katalog baru terlihat setelah ±8 baris chip).
3. CTA kartu jasa memakai breakpoint viewport, bukan lebar kartu — pola yang
   sudah diperbaiki di kartu produk lewat container query.
4. Copy global search tidak jujur: label "Cari produk dan jasa" /
   "Cari di Ebrystore", padahal handler hanya menavigasi ke `/produk`.

## 3. Komponen existing yang dipakai ulang

Tanpa komponen baru: `PageShell`, `CatalogFilters` (ditingkatkan in-place),
`CardsSkeleton`/`SectionEmpty`/`SectionError`, `Button`, `ServiceChatButton`,
`serviceMediaUrl`, pola `variant` dari `MarketplaceProductCard`.

## 4. Perubahan search & category filter

- `CatalogFilters`: bila kategori > 8, tampil 8 pertama + tombol teks
  "Tampilkan N kategori lagi" (`aria-expanded`), berubah jadi "Sembunyikan
  kategori". Kategori aktif di luar 8 pertama tetap dipaksa tampil agar filter
  tidak menghilang saat aktif. Chip tetap `min-h-11` (tap target 44px).
- Karena produk tidak punya kategori di DB, `/produk` **tidak berubah sama
  sekali**; perbaikan terasa penuh di `/layanan` dan otomatis berlaku bila
  kelak kategori produk ditambahkan.
- Pilihan opsi B (primary + expandable) atas A (scroll horizontal) dan C
  (dropdown): tanpa konflik scroll, keyboard-accessible, semua kategori tetap
  tersedia, tidak menambah pola komponen baru.
- Global search: routing TIDAK diubah (masih `/produk`); label diperbaiki
  menjadi "Cari produk" agar sesuai perilaku.

## 5. Perubahan grid & kartu

- `/layanan`: `grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-3 sm:gap-4`
  + `li` `flex min-w-0 flex-col` (identik `/produk`, komentar alasan ikut).
- `SellerServiceCard` mendapat `variant?: "default" | "home"`:
  - katalog (default): `rounded-lg`, isi `p-3`, judul `line-clamp-2` + `title`,
    harga `text-base`, `@container` + CTA `@[300px]:flex-row`, ikon toko
    `size-3` — selaras penuh dengan kartu produk di sebelahnya;
  - beranda (`variant="home"`, dipakai `routes/index.tsx`): tampilan lama
    (`rounded-xl`, `p-3.5`, harga `text-lg/xl`) — beranda tidak berubah.
- Struktur informasi kartu sesuai Phase E: kategori → judul → seller →
  durasi/revisi (dari data agreement, bukan default karangan) → harga → CTA
  (Chat + Pesan, alur checkout jasa tidak disentuh).

## 6. File yang dimodifikasi

- `src/routes/layanan.index.tsx` — grid.
- `src/components/home/seller-service-card.tsx` — varian + alignment.
- `src/components/catalog-filters.tsx` — kategori expandable.
- `src/routes/index.tsx` — `variant="home"` di beranda.
- `src/components/site-header.tsx` — copy search jujur (3 string).

## 7. Responsive verification (browser sungguhan, data produksi via dev server)

- **1440px**: filter panel 1 baris chip + toggle; kartu 2 buah berdampingan
  ukuran katalog (±276px) dengan kolom kosong di kanan — perilaku yang sama
  dengan `/produk` saat isinya sedikit. CTA bertumpuk (kartu < 300px), sama
  dengan kartu produk pada lebar yang sama.
- **390px**: kartu satu kolom penuh, CTA sebaris (kartu > 300px), chip kategori
  jauh lebih ringkas dari sebelumnya (sebelumnya ±8 baris).
- **Overflow 390px**: `scrollWidth 375 = clientWidth 375` → tidak ada scroll
  horizontal (R-03 PASS).
- 1920/1024/768/320: tidak di-screenshot satu per satu — grid berbasis lebar
  minimum bersifat kontinu (bukan titik tetap), sehingga tidak ada band
  lebar yang tidak terdefinisi; ditandai sebagai verifikasi sampel.

## 8. Functional regression tests

- `tsc --noEmit`: bersih (6 error pre-existing di file lain, tidak berubah).
- `eslint`: 0 error pada 5 file yang diubah.
- `vitest run`: 554 lulus; 9 gagal = pre-existing di `marketplace-home` /
  `public-storefront` (baseline sama, diverifikasi via stash).
- Click-through (R-35): toggle perluas/sembunyikan kategori ✓, chip kategori
  memfilter hasil ("Makalah" → 1 layanan, judul jadi "Hasil pencarian") ✓,
  "Reset filter" memulihkan ✓, `/produk` dirender identik (screenshot
  before/after sama) ✓.
- `NITRO_PRESET=node-server npm run build`: sukses (preset deployment VPS).

## 9. Screenshot before/after

Diambil via browser automation (tersimpan di artifacts sesi):
- Before `/layanan` 1440: 2 kartu raksasa + 13 chip 2 baris (production).
- Before `/layanan` 390: 8 baris chip sebelum katalog.
- After `/layanan` 1440: filter ramping + kartu ukuran katalog (dev).
- After `/layanan` 390: panel ringkas, kartu satu kolom.
- Regresi `/produk` 1440: identik dengan before.

## 10. Masalah yang belum terselesaikan

1. `PAGE_SIZE` jasa (6) vs produk (12) — sengaja tidak diubah (perilaku, bukan
   tampilan); layak disatukan bila Owner mau.
2. Kategori produk kosong di DB sehingga chip kategori tak tampil di `/produk`
   — data, bukan bug tampilan.
3. Halaman `/toko/$slug` ikut menerima varian katalog untuk kartu jasa
   (konsisten dengan kartu produk yang ditampilkan berdampingan di sana);
   grid /toko sendiri tidak diubah (di luar scope).
4. Verifikasi viewport 1920/1024/768/320 hanya analisis kontinuitas, bukan
   screenshot per lebar.

## Delivery Gate (antislop)

- Hard Gate: R-02 tanpa em dash pada copy UI ✓; R-03 tanpa overflow 390 ✓
  (diukur); R-17/18/36/38 tidak ada angka/klaim karangan (jumlah kategori dari
  data asli) ✓; R-24/26 semua kontrol punya perilaku nyata ✓; R-25 token warna
  existing ✓; R-27 state loading/empty/error tetap ada ✓; R-32 semua kontrol
  tombol asli + `aria-expanded` ✓; R-33 tidak ada patch skrip ✓; R-35 dijalankan
  & klik-diklik dengan bukti ✓.
- Purpose-Gate: tidak ada teknik baru — semua memakai token & pola existing
  (R-01/04/09/10/12/13/14 aman); alasan tiap keputusan tertulis di komentar
  kode dan laporan ini (R-31).
- Liveliness: mengikuti DESIGN.md (halaman storefront ENERGY 2 / RHYTHM 2 /
  MOTION 1 — catalog grid seragam memang disengaja; aksen ink-teal pada chip
  aktif & hover kartu yang sudah ada).
