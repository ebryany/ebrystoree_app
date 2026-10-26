# 07 — Rencana Eksekusi MGRCAO V3: Galeri Bukti Ebrystore di Home

Tanggal: 2026-10-04 · Sumber temuan: [`../audit/2026-10-04-riset-galeri-home-bukti-ebrystore.md`](../audit/2026-10-04-riset-galeri-home-bukti-ebrystore.md)
Status: **DIEKSEKUSI** (satu slice, additive)

---

## M — Mindset

1. **Problem-first**: menyelesaikan tugas terhenti (galeri scroll horizontal + 8 aset)
   yang upload-nya gagal karena kredensial salah; bukan menambah fitur baru.
2. **Evidence-before-claim**: isi galeri = 8 aset desain milik Ebrystore yang
   dikirim Owner. Bukan testimoni, bukan angka. Tidak ada klaim "bukti transaksi"
   palsu; alt text jujur deskriptif.
3. **Evolusi aditif**: tidak ada migrasi schema. Aset disimpan di bucket yang sudah
   ada (`catalog-images`) dengan prefix baru `branding/home-gallery/`; komponen baru
   di `src/components/home/`; wiring satu baris di `index.tsx`. Rollback = revert file
   + hapus objek storage.
4. **Ikuti arah visual Ebrystore** (DESIGN.md): ink-teal, low elevation, mobile-first
   390px, reduced-motion dihormati, tanpa glow/gradient dekoratif, tanpa console noise.
5. **Jangan sentuh** jalur banner/review/kategori yang sudah `VERIFIED` di sesi lalu.

## G — Goal

Menampilkan galeri scroll horizontal berisi 8 aset resmi di home, sebagai
"sekilas produk Ebrystore" yang jujur, berfungsi di desktop & mobile.

| Aspek | Target |
|---|---|
| Masalah | 8 aset tidak terpakai; komponen galeri belum ada; upload sebelumnya gagal |
| Target | (a) 8 aset tersimpan di `catalog-images/branding/home-gallery/` dan dapat dibaca via proxy; (b) komponen `ProofGallery` (nama kerja) di home, di antara banner dan pita review; (c) scroll horizontal terhubung ke scroll halaman (pola gist), tanpa scroll-jack di mobile/reduced-motion |
| Acceptance | 1) `node .zcode/upload-gallery.mjs` sukses 8/8; 2) `curl` proxy 200 untuk 1 sampel; 3) tsc + eslint + unit test hijau; 4) browser: galeri tampil dengan 8 gambar di `/`, scroll menggeser track, mobile 390px tanpa overflow; 5) reduced-motion → galeri tetap terbaca tanpa animasi; 6) tidak ada angka/klaim tanpa sumber |

## G-UI — Lapisan UI/UX

| Elemen | Penyempurnaan | Sumber pola |
|---|---|---|
| Frame galeri | Kartu rasio 9:16 dengan radius token (`rounded-xl`), border tipis, tanpa shadow | Token Ebrystore |
| Track | `gap` konsisten, kartu tidak lebih dari ~65% lebar container mobile agar terlihat ada lanjutan | Pola carousel existing (`ui/carousel.tsx`, embla terpasang) |
| Progres | Tidak ada indikator angka palsu; cukup posisi visual | Anti-slop |
| A11y | `<ul>` + alt deskriptif; versi reduced-motion = grid scroll-snap native tanpa JS transform | DESIGN.md hard gates |
| Heading | `h2` nyata (bukan sr-only) karena ini section konten, teks jujur: "Sekilas Ebrystore" + sub "Delapan momen yang sering dipakai pengguna" — **dihapus bila terkesan klaim**; alternatif netral: "Sekilas Ebrystore" saja | R-36 |

Aturan ketat: tanpa dependency baru (`motion` sudah ada); tidak memakai gambar
Unsplash; tidak ada teks footer gist; tidak ada `console.log`.

## R — Role

Frontend engineer (komponen + wiring). Tidak ada server function baru: upload aset
adalah operasi sekali-jalan lewat script Node dengan service role (dev/ops), bukan
fitur aplikasi. Tidak ada perubahan permission/RLS.

## C — Context (bukti terverifikasi, lihat dokumen riset)

- 8 aset 941×1672 px di `.zcode/gallery-assets/` (dipulihkan dari image-cache,
  cocok ukuran byte dengan log sesi).
- Kegagalan lama: token CLI `sbp_` → `403 Invalid Compact JWS`. Jalur benar:
  `SUPABASE_SERVICE_ROLE_KEY` dari `.env` (JWT `eyJ…`).
- Bucket `catalog-images`: privat, 5 MB, MIME png diizinkan; prefix
  `branding/home-gallery/` masih kosong.
- Proxy `GET /api/public/catalog-image/$` menerima path regex
  `^[A-Za-z0-9/_-]+\.[A-Za-z0-9]{2,5}$` — nama file `01-…png` lolos.
- Home: `index.tsx` `Beranda()` urutan `HomeBanners` → `ReviewMarqueeSection` →
  Kategori → …; header sticky `z-40` tinggi 4rem.
- DESIGN.md: publik dial ENERGY 2 / MOTION 2; dilarang parallax berlebihan; semua
  animasi hormati reduced-motion; mobile 390px overflow 0.
- Gist asli terekstrak utuh (pola `useScroll` + `useTransform` + sticky 300vh).

## A — Action

1. **Upload aset** — perbaiki `.zcode/upload-gallery.mjs` (baca `.env`, strip tanda
   kutip, pakai `SUPABASE_SERVICE_ROLE_KEY`), jalankan; simpan hasil ke
   `.zcode/home-gallery-assets.json`.
2. **Verifikasi proxy** — `curl` satu URL `/api/public/catalog-image/branding/home-gallery/01-….png`
   (via dev server atau cukup cek objek ada di storage; proxy diuji di browser saat klik-through).
3. **Komponen** `src/components/home/proof-gallery.tsx`:
   - Props `items: { src, alt }[]` (data dari hasil upload; komponen tidak fetch).
   - Desktop/gerak normal: pola gist — section tinggi ~220vh, sticky viewport,
     `useScroll` progress memetakan `x` dari 0 ke `-(trackWidth - viewportWidth)`.
     Hitung lebar via ref + `ResizeObserver`/resize listener (pola `resetCarouselEndPosition`
     gist, disederhanakan tanpa `console.log`).
   - Mobile (`useIsMobile`) atau `useReducedMotion`: render **native horizontal
     scroll** (`overflow-x-auto`, `snap-x`) — tanpa scroll-jack, tetap bisa digeser jari.
   - `will-change: transform`; gambar `loading="lazy" decoding="async"`.
4. **Wiring** `index.tsx`: `<ProofGallery items={…} />` setelah `HomeBanners`,
   sebelum `ReviewMarqueeSection` (pita review tetap "setelah banner" sesuai
   keputusan Owner sebelumnya; galeri ikut menyusul di bawahnya).
5. **Data aset di kode**: array statis di komponen (8 entri, URL dari hasil upload).
   Alasan: aset kurasi platform, bukan data dinamis; menghindari schema/settings baru.
6. **Verifikasi**: `npx tsc --noEmit` → `npx eslint` file terubah → `npm run test:unit`
   → `npm run build` → dev server + browser (desktop & 390px, klik-through, cek
   gambar termuat via proxy, cek reduced-motion via emulate).

## O — Output

1. 8 objek di `catalog-images/branding/home-gallery/` + bukti upload (`home-gallery-assets.json`).
2. `src/components/home/proof-gallery.tsx` (komponen baru) + wiring `index.tsx`.
3. `.zcode/upload-gallery.mjs` yang benar (dokumentasi jalur upload aset statis).
4. Laporan verifikasi (tsc/lint/test/build + klik-through + mobile 390px) dicatat
   menyusul di `docs/audit/2026-10-04-verifikasi-galeri-home-bukti-ebrystore.md`.
5. Status jujur per acceptance criteria.

### Non-goals

- Tidak ada jalur upload galeri di UI admin (aset kurasi, bukan fitur seller).
- Tidak menyentuh banner, review marquee, kategori, atau server function lain.
- Tidak menambah schema, permission, RLS, atau dependency baru.
- Tidak memakai gambar Unsplash / aset eksternal.

### Risiko & rollback

| Risiko | Mitigasi |
|---|---|
| Scroll-jack terasa aneh di layar pendek | tinggi section adaptif; mobile pakai native scroll |
| 12,9 MB total aset membebani | lazy-load; hanya 8; dimuat saat mendekati viewport |
| Nama file `01-…png` bentrok bila upload ulang | `x-upsert: true`; script idempoten |
| Galeri dianggap klaim "bukti" palsu | teks netral "Sekilas Ebrystore", tanpa angka; alt deskriptif |

Rollback: hapus komponen + baris wiring (revert file); objek storage dihapus manual
bila diperlukan. Tanpa migrasi → tanpa risiko data.
