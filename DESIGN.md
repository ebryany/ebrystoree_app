# DESIGN.md — Arah Desain UI Ebrystore (Admin & Marketplace)

Sumber: keputusan Owner terdokumentasi (AGENTS.md, Decision Register M-10, sesi
redesign 2026-10-02). File ini adalah direction untuk filter anti-slop — bukan
gaya baru yang diada-adakan. Setiap aturan punya alasan satu baris.

## Identitas

- **Kepribadian**: friendly, fast, simple, trustworthy — platform jual-beli produk
  digital yang terasa aman untuk seller dan pembeli.
- **Aksen**: ink-teal (satu aksen, dipakai hemat pada elemen aktif/fokus).
- **Elevasi**: low elevation — border tipis + `bg-card`; shadow hanya untuk elemen
  mengambang sesungguhnya (popover, dialog).
- **Mobile-first**: semua halaman wajib lolos 390px tanpa horizontal overflow.

## Dials (ENERGY / RHYTHM / MOTION)

| Konteks | ENERGY | RHYTHM | MOTION | Alasan |
|---|---|---|---|---|
| Halaman data (laporan, tabel admin) | 1 | 2 | 1 | Keterbacaan angka > dekorasi |
| Halaman publik/storefront | 2 | 2-3 | 2 | Perlu hidup tapi tetap cepat |
| Landing/marketing | 2-3 | 3 | 2-3 | Satu-satunya tempat ekspresi bebas |

## Palet

Maksimal 2-3 warna inti + 1 aksen, diambil dari token yang ada: `card`, `border`,
`muted`, `primary` (ink-teal), `chart-1..5` untuk data. Neutral (putih/hitam/abu)
tidak dihitung. **Tidak ada hue baru** tanpa kebutuhan semantik (danger, warning).

## Tipografi

Stack existing (Geist/Inter family). Angka data selalu `tabular-nums`. Uppercase
tracking-wide hanya untuk label kecil (dt, KPI label), tidak untuk heading panjang.

## Motion (purpose test wajib)

- **Dipakai**: CountUp pada 1-3 angka hero (mengarahkan mata ke metrik utama);
  fade/translate ≤200ms untuk pergantian state; hover/focus states pada semua kontrol.
- **Dilarang**: stagger template ke semua elemen, parallax di halaman data, bounce,
  glow beranimasi.
- Semua animasi hormat `prefers-reduced-motion` (widget `CountUp` sudah contohnya).

## Tekstur & Background

- Halaman data: **tanpa** background animasi. Pola statis inline (SVG/CSS) hanya boleh
  di zona dekoratif yang ditunjuk: band header halaman ("Perlu ditangani"), empty-state
  well — opasitas rendah, tidak menembus area angka.
- Dilarang: CDN eksternal (CSP self-only), gambar gradient berat, animasi JS untuk
  background.

## Adopsi Library (purpose test per library)

| Library | Keputusan | Dipakai untuk |
|---|---|---|
| motion (terpasang, 13.5) | ✅ Aktif | CountUp, transisi state halus |
| motion-primitives.com | ✅ Referensi pola | Port pola komponen (copy pattern, tulis ulang ke token Ebrystore) |
| ui-layouts.com | ✅ Referensi pola | Sama — komponen shadcn-style dipelajari lalu disesuaikan |
| transitions.dev / beautifului.dev | ⚠️ Per komponen | Hanya jika lolos purpose test & selaras token |
| uiverse.io | ⚠️ Hati-hati | Mayoritas melanggar (glow, pill semuanya); hindari kecuali ada alasan tertulis |
| neat / feralui / patterncraft | ⚠️ Inspirasi statis | Pola pattern dipindah ke inline SVG/CSS, zona dekoratif saja |

Aturan porting: komponen dari library ditulis ulang memakai token + komponen UI
existing (Radix/shadcn), bukan ditempel mentah — supaya palet, radius, dan aksesibilitas
konsisten.

## Hard Gates (turunan anti-slop)

Em-dash 0 pada copy UI · tidak ada angka tanpa sumber (R-17) · semua kontrol berfungsi
(R-26) · tiga state UI (R-27) · keyboard + focus visible (R-32) · mobile 390px (R-03) ·
bukti klik-through sebelum deliver (R-35) · tanpa klaim/testimoni palsu (R-36).
