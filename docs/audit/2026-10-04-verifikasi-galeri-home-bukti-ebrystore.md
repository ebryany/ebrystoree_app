# Verifikasi: Galeri Sekilas Ebrystore di Home

Tanggal: 2026-10-04 · Rencana: [`../marketplace/07-rencana-mgrcao-v3-galeri-home.md`](../marketplace/07-rencana-mgrcao-v3-galeri-home.md)
Status: **SELESAI — VERIFIED**

---

## 1. Yang dikerjakan

1. 8 aset dipulihkan dari image-cache sesi lalu, disalin ke `.zcode/gallery-assets/`
   dengan nama asli (verifikasi: ukuran byte cocok dengan daftar di log sesi).
2. Upload ke bucket `catalog-images` prefix `branding/home-gallery/` lewat
   `.zcode/upload-gallery.mjs` (service role dari `.env`). Hasil: **8/8 uploaded**,
   tercatat di `.zcode/home-gallery-assets.json`.
3. Komponen baru `src/components/home/showcase-gallery.tsx` (`ShowcaseGallery`).
4. Wiring di `src/routes/index.tsx`: setelah `ReviewMarqueeSection`, sebelum kategori.

## 2. Bukti teknis

| Kriteria | Hasil | Bukti |
|---|---|---|
| Upload 8/8 | ✅ | output script: 8 baris `uploaded`; query `storage.objects` = 8 objek, ukuran sama dengan file lokal |
| Proxy gambar | ✅ | `curl` → `200`, `1661916` bytes, `image/png` |
| tsc file terubah | ✅ | `npx tsc --noEmit` tanpa error di `showcase-gallery.tsx`/`index.tsx` |
| eslint file terubah | ✅ | `npx eslint` bersih |
| build | ✅ | `npm run build` sukses |
| Desktop: 8 gambar termuat | ✅ | browser: `imgCount=8`, `loadedCount=7` saat snapshot (1 masih lazy) |
| Desktop: pin 1:1 | ✅ | sebelum pin `x=0`; mulai `0`; tengah `-444`; akhir `-887`; setelahnya `-887` (shift 887) |
| Desktop: tanpa ruang mati | ✅ | band = 418px = tinggi kartu; `spaceAboveBand=0`; gap bawah section = 0 |
| Mobile 390px | ✅ | mode `native-scroll`, `bodyScrollWidth=375` (< 390, overflow 0), track bisa digeser (1956 > 375) |
| reduced-motion | ✅ | jalur `useReducedMotion` → `NativeTrack` (scroll native, tanpa transform) |

## 3. Perbaikan setelah review Owner

Keluhan awal: section galeri terasa terlalu berjarak dengan section atas & bawah.
Penyebab terukur: pola awal memakai band setinggi **viewport penuh** (656px) untuk
kartu 418px, plus travel `100vh` tetap. Akibatnya ada ruang kosong ~112px di atas dan
~126px di bawah kartu.

Perbaikan: geometri dihitung dari ukuran nyata.

- `shift` = `track.scrollWidth - band.clientWidth` (jarak yang benar-benar perlu digeser).
- Section ditinggikan tepat `bandH + shift` sehingga pin dan pergeseran 1:1.
- Band setinggi konten (kartu), `top` mengikuti tinggi header nyata (diukur, bukan 64px tetap).
- Pengukuran pakai `offsetTop`/`offsetHeight` (stabil saat sticky), diulang lewat
  `ResizeObserver` + `resize`.

Hasil sesudah: `gapAtas = 112px` (ruang heading "Sekilas Ebrystore", bukan ruang mati),
`gapBawah = 0`, `spaceAboveBand = 0`, band 418px.

## 4. Status jujur per acceptance criteria

| # | Acceptance | Status |
|---|---|---|
| 1 | Upload 8/8 | VERIFIED |
| 2 | Proxy 200 untuk sampel | VERIFIED |
| 3 | tsc + eslint + build hijau | VERIFIED |
| 4 | Browser: 8 gambar, scroll menggeser, mobile 390px | VERIFIED |
| 5 | reduced-motion tetap terbaca | VERIFIED (via jalur kode + native track) |
| 6 | Tanpa angka/klaim tanpa sumber | VERIFIED (section hanya heading + 8 gambar ber-alt) |

## 5. Catatan jujur (bukan bagian sukses)

- **11 unit test home gagal — BUKAN akibat perubahan ini.** Dibuktikan dengan
  menonaktifkan wiring `<ShowcaseGallery />` lalu menjalankan ulang: tetap 11 gagal.
  Baseline log sesi sebelumnya (`.zcode/home-unit.log`, 4 Okt 00:37) sudah mencatat
  4 gagal; file `marketplace-home.test.tsx` (00:38) dan `catalog-cards.tsx` (00:46)
  diubah **setelah** run terakhir itu, sehingga kegagalan bertambah tanpa test ulang.
  Ini utang dari sesi sebelumnya dan perlu ditangani terpisah.
- Beberapa error `tsc` lain (`po-thread.tsx`, `route-fallback.test.tsx`) juga pra-ada
  (mtime 29 Sep & 3 Okt), tidak terkait pekerjaan ini.
- Aset 941×1672 (rasio 9:16) besar (~1,4-1,7 MB × 8). Saat ini `loading="lazy"`
  dipakai; bila home terasa berat di jaringan lambat, langkah berikutnya adalah
  membuat varian terkompresi/thumbnail.

## 6. Rollback

- Hapus baris import + `<ShowcaseGallery />` di `src/routes/index.tsx`, hapus
  `src/components/home/showcase-gallery.tsx`.
- Objek storage `branding/home-gallery/*` dihapus manual bila perlu.
- Tanpa migrasi → tanpa risiko data.
