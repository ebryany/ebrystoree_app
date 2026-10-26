# Riset: Galeri Bukti Ebrystore di Home (Aset Opening + Scroll Horizontal)

Tanggal: 2026-10-04 · Status: **RISET SELESAI — BUKTI TERKUMPUL**

Konteks: kelanjutan tugas yang terhenti pada sesi `sess_e87d96c2`. User meminta
komponen galeri scroll horizontal (contoh gist `coleturner`) dipasang di home dengan
"bukti Ebrystore / bukti transaksi", lalu mengirim 8 aset PNG dan berkata "pake aset
ini aja". Upload gagal `400 Invalid Compact JWS`; sesi mati sebelum selesai.

---

## 1. Aset: 8 PNG berhasil dipulihkan

Aset asli di `%TEMP%` sudah terhapus. Dipulihkan dari image-cache sesi
(`C:\Users\febry\.zcode\cli\image-cache\sess_e87d96c2-…\`), 8 file, semuanya
941×1672 px. Mapping ke nama asli diverifikasi lewat **kecocokan ukuran byte persis**
dengan daftar ukuran yang tercatat di log sesi:

| # | Nama asli | Ukuran | File cache |
|---|---|---|---|
| 01 | opening-sesuatu-baru.png | 1.661.916 B | image-8e1c1fa0… |
| 02 | belanja-digital-lebih-cepat.png | 1.692.305 B | image-285b3122… |
| 03 | semua-kebutuhan-digital.png | 1.455.540 B | image-898a1780… |
| 04 | bantuan-tugas-terstruktur.png | 1.606.991 B | image-3af68350… |
| 05 | ai-premium-template.png | 1.587.822 B | image-11e61c99… |
| 06 | pantau-pesanan.png | 1.606.843 B | image-f38a5b3b… |
| 07 | rapi-cepat-terpercaya.png | 1.645.339 B | image-30ca8c58… |
| 08 | semua-dalam-satu-akun.png | 1.628.491 B | image-d52a3cf7… |

Disalin ke `.zcode/gallery-assets/` dengan nama asli (bukti: `ls` 8 file, ukuran sama).
Ukuran 1,4–1,7 MB per file → **di bawah** `file_size_limit` bucket (5 MB).

## 2. Kegagalan upload sebelumnya — akar masalah

- Script lama memakai **token CLI Supabase** (`sbp_…`) dari Windows Credential Manager.
  Storage menolak: `403 Invalid Compact JWS` — token itu bukan service role.
- Bukti format kredensial: `.env` punya `SUPABASE_SERVICE_ROLE_KEY` (JWT `eyJ…`, 221 char),
  **bukan** `sbp_`. Nilai di `.env` dibungkus tanda kutip ganda.
- Jadi jalur yang benar: pakai `SUPABASE_SERVICE_ROLE_KEY` langsung, bukan token CLI.

## 3. Jalur upload yang sah (sudah terbukti di repo)

- Bucket `catalog-images` **privat** (`public=false`), limit 5 MB, MIME
  `image/jpeg|png|webp|avif` (bukti: query `storage.buckets`).
- Aplikasi menyimpan aset lewat `persistCatalogImage()` di
  `src/lib/banner-upload.server.ts` (validasi sniff signature + sharp decode + dimensi),
  lalu membaca lewat proxy `GET /api/public/catalog-image/$` (`src/routes/api/public/catalog-image.$.tsx`)
  yang memakai `supabaseAdmin.storage.download()`.
- Pemakai yang ada: `persistBannerImage` (banner home) dan `persistCatalogImage`
  (thumbnail produk seller, prefix `products/<store.id>`).
- **Belum ada** jalur untuk aset galeri statis; prefix baru `branding/home-gallery/`
  dapat diverifikasi proxy dengan regex path yang sama (`^[A-Za-z0-9/_-]+\.[A-Za-z0-9]{2,5}$`).
- Bucket saat ini **kosong** untuk prefix `branding/home-gallery/` (bukti query
  `storage.objects`: hasil `[]`).

## 4. Kenapa harus server-side, bukan upload dari browser

- CSP `img-src 'self' data: blob: https:` — gambar lokal aman lewat proxy self.
- Bucket privat → tidak ada akses langsung tanpa signed/proxy.
- Preseden repo: semua aset catalog masuk via server function + service role
  (bukan anon key). Mengikuti pola itu menghindari pengecualian baru.

## 5. Struktur home saat ini (titik sisip)

Urutan `src/routes/index.tsx` (`Beranda`): `HomeBanners` → `ReviewMarqueeSection`
(pita review, sudah ada) → Kategori → Produk digital → Jasa seller → Pendampingan
akademik → `SellerJoinSection` → bantuan.

- Header `sticky top-0 z-40` (`site-header.tsx:77`), tinggi min 16 (4rem).
- `DESIGN.md`: halaman publik dial ENERGY 2 / RHYTHM 2-3 / MOTION 2; dilarang parallax
  di halaman data, hormati `prefers-reduced-motion`, mobile 390px overflow 0,
  tanpa angka tanpa sumber (R-17), tanpa testimoni palsu (R-36).

## 6. Komponen gist yang diminta (terekstrak utuh dari log)

`useElementViewportPosition` + `useScroll` + `useTransform` → sticky section tinggi
`300vh`, track `motion.div` digeser `x` seiring `scrollYProgress`. Aspek yang perlu
diubah saat porting (alasan di dokumen rencana):

- `items` Unsplash → 8 aset lokal (`/api/public/catalog-image/…`).
- `console.log` debug → dihapus (anti-slop, no console noise).
- `'use client'` / `export default` → konvensi TanStack Router repo.
- Warna hardcode (`#008299`, hitam) → token Ebrystore (ink-teal, `bg-card`, border).
- `h-screen` + tinggi 300vh → perlu diuji mobile 390px & reduced-motion.
- `<img alt='img'>` → alt deskriptif per aset.
- Footer gist ("ui-layout", "Thanks for Scrolling") → tidak relevan, dibuang.

## 7. Batasan & risiko

| Risiko | Bukti/batasan | Mitigasi |
|---|---|---|
| Aset 9:16 besar (1,4–1,7 MB × 8) memperlambat home | 8 file, total ~12,9 MB | lazy-load + `decoding="async"`; hanya muat saat terlihat |
| Scroll-jack 300vh mengganggu mobile | header sticky 4rem; 390px wajib | uji mobile; sediakan mode statis/reduced-motion |
| Klaim "bukti transaksi" tidak nyata | data nyata minim: 1 review, 1 thumbnail, 0 logo toko | galeri = **8 aset desain sendiri**, bukan testimoni; alt jujur, tanpa angka palsu |
| Prefix baru belum dikenal proxy/validator | regex path sama, bucket sama | verifikasi 1 URL lewat proxy sebelum lanjut |

## 8. Status bukti

- `VERIFIED`: 8 aset ada & dimensi cocok; bucket & limit; proxy route; kegagalan JWS
  & penyebabnya; prefix kosong; titik sisip home; header sticky.
- `NOT_IMPLEMENTED`: upload aset galeri; komponen galeri; wiring home.
- `OWNER_DECISION_REQUIRED`: tidak ada (arah sudah jelas dari permintaan user).
