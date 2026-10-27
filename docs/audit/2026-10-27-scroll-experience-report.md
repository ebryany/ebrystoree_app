# Ebrystore — Scroll-Driven Homepage Experience Implementation Report

Tanggal: 2026-10-27 | Status: **IMPLEMENTED + DIUJI DI BROWSER (desktop & 390px)**
Belum di-commit/deploy (menunggu persetujuan).

## 1. Komponen existing yang ditemukan

| Komponen | Path | Isi |
|---|---|---|
| `SellerJoinSection` | `src/components/home/home-hero.tsx` | Headline seller, CTA `/auth`, 4 keunggulan (`PERKS`), info moderasi jasa |
| `SmoothScrollStory` | `src/components/home/smooth-scroll-story.tsx` | "Cara memesan", 3 tahap (`PANELS`) |
| Pola acuan rumah | `src/components/home/showcase-gallery.tsx` | Scroll-driven translate + geometri nyata + ResizeObserver |
| Library | `motion ^13.5.0` (`motion/react`) | Sudah dipakai; tidak menambah dependency |

Konten kedua section berasal dari **kode**, bukan setting admin. Aturan 24 jam /
verifikasi manual / pelepasan dana mengikuti mekanisme sistem yang berjalan, tidak diubah.

## 2. Perbedaan dengan referensi UI Layouts

| Referensi | Implementasi Ebrystore | Alasan |
|---|---|---|
| `ReactLenis root` | **Tidak dipakai** | Scroll global berisiko pada sticky, scroll restoration, checkout, modal; efek tidak membutuhkannya |
| `document.querySelectorAll("li")` | Ref terisolasi per komponen | Aturan wajib master prompt |
| `height: 500vh` tetap | Geometri nyata + pacing | Jarak scroll mengikuti lebar konten sesungguhnya |
| 5 panel warna pelangi | 3 kartu `bg-card` + aksen ink-teal | Identitas Ebrystore, jumlah tahap nyata |
| `next/image`, `'use client'` | Komponen React biasa TanStack Start | Bukan Next.js |

## 3. Motion architecture

- **Section A**: `motion.section` + `whileInView` sekali, varian `reveal` (opacity + y 14px, 450ms) dan `stagger` 70ms. Hover: `hover:bg-accent/[0.05]`, ikon `scale-110`.
- **Section B**: `useScroll({ target, offset: ["start start","end end"] })` → `scrollYProgress` → `useTransform` untuk `scale` tiap kartu + `scaleX` progress bar; `useMotionValueEvent` hanya untuk memperbarui **indeks** aktif (bukan per-frame state).
- Tidak ada `scroll` listener global; satu subscription per section.

## 4. Lenis decision

**Tidak dipakai.** Tidak ada kebutuhan yang tidak tercapai dengan sticky + transform;
menghindari konflik scroll global, scroll restoration, dan halaman bertumpuk (modal/dashboard).

## 5. Cara kerja sticky stack

Setiap tahap = wrapper `sticky top-16` setinggi `calc(100svh - 4rem)` (viewport dikurangi tinggi header nyata) berisi `<article>` yang menempel lalu tertutup kartu berikutnya; `scale` mengecil bertahap `1 → 1-(total-1-i)*0.05` seiring progres. Section berakhir saat kartu terakhir selesai, lalu scroll normal berlanjut.

## 6. Perhitungan jarak

Tidak ada jarak horizontal manual: progres section dipetakan ke `scale` kartu; tinggi total mengikuti `100svh × jumlah tahap`, sehingga pin tidak pernah memakan lebih dari satu layar per tahap.

## 7. Responsive behavior

| Viewport | Perilaku |
|---|---|
| 1440px | Stack sticky, 3 kartu (terverifikasi: sticky=3, article=3) |
| 390px (Android) | **Stack sticky aktif** (terverifikasi: sticky=3, article=3, grid statis tidak dirender) |
| 320px | Lebar kartu `w-full` + padding, tanpa overflow horizontal |
| reduced motion | Grid statis `<ol>` 3 kolom/bertumpuk, tanpa pin |

## 8. Accessibility / reduced motion

- Konten ada di HTML server sebagai `<ol>` statis (dibuktikan test SSR), jadi tetap terbaca tanpa JS.
- `aria-current="step"` pada kartu aktif; heading `h2` → `h3` berurutan; semua aksi CTA adalah `<a>`/`<button>` asli.
- `prefers-reduced-motion` → varian statis, tanpa transform.

## 9. File yang diubah

| File | Perubahan |
|---|---|
| `src/components/home/home-hero.tsx` | Reveal + hover, layout rail 1.35fr/1fr, CTA sekunder, strip toko nyata |
| `src/routes/index.tsx` | `proofStores` dari `sellerServicesQuery` (tanpa query baru) |
| `src/components/home/smooth-scroll-story.tsx` | Stacking cards, SSR-safe (statis sebelum mount), reduced-motion fallback |
| `src/lib/__tests__/smooth-scroll-story.test.tsx` | Baru — kontrak SSR + isi tahap |

## 10. Visual verification

Diuji di browser (IAB) pada 1440×900 dan 390×844:
- Section A: heading 30px, rail bernomor `01–04`, CTA `Mulai jualan` 140×44px, strip toko berisi toko asli `citra → /toko/citrahttle`, tanpa overflow (375 = 375).
- Section B: `sticky=3`, `article=3`, `staticGrid=0` di kedua viewport; transform scale kartu pertama terbaca `matrix(0.976671)` (sesuai rumus scale pada progres ~23%).

Catatan jujur: bridge evaluasi browser sesi ini mengembalikan `[object Object]` untuk hasil non-primitif, sehingga pengukuran transform per-posisi scroll tidak bisa dipanen berurutan. Yang terbukti: struktur sticky, scale aktif, dan state render; pengukuran FPS/CLS tidak dilakukan.

## 11. Build / typecheck / test

- `tsc --noEmit`: bersih dari error baru (6 error pre-existing di file lain).
- `eslint`: 0 error pada file yang diubah.
- `vitest`: **557 lulus**; 9 gagal = pre-existing `marketplace-home`/`public-storefront` (baseline sama, diverifikasi via stash sebelumnya).
- `NITRO_PRESET=node-server npm run build`: **exit 0**.

## 12. Belum terverifikasi

1. Smoothness/FPS dan CLS pada perangkat Android fisik (hanya diuji viewport emulasi).
2. Perilaku saat `prefers-reduced-motion` aktif di browser nyata (unit test SSR mengunci jalur statis, tetapi tidak mengukur tampilan).
3. Verifikasi 320/768/1024/1920 hanya analisis layout kontinu, bukan screenshot per lebar.
4. Commit & deploy belum dilakukan.
