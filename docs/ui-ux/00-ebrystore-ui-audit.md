# Audit UI/UX Ebrystore — Kondisi Saat Ini

Status: UI_UX_DISCOVERY_IN_PROGRESS
Tanggal: 2026-07-29
Metode: pembacaan seluruh route + screenshot mobile 390px (evidence: /tmp/browser/uiaudit/shots)

## 1. Stack Frontend
- TanStack Start v1 (file-based routing, SSR), React 19, Vite 7.
- Tailwind CSS v4 (`src/styles.css`, token oklch + `@theme inline`), shadcn/ui (45 primitives terpasang).
- Font: Space Grotesk (display) + Plus Jakarta Sans (sans) — sudah dua family, sesuai batas.
- Ikon: lucide-react (satu library, konsisten).
- Data: TanStack Query + server functions; motion: hanya `tw-animate-css`, belum ada motion system.

## 2. Token yang Sudah Ada
- Warna semantik lengkap: background/foreground/card/muted/border + `success`, `warning`, `info`, `surface`, sidebar-set.
- Primary = teal gelap (oklch 0.33 0.062 200), Accent = amber (oklch 0.78 0.155 68).
- Radius base 0.75rem dengan skala sm→4xl.
- Gradien `--gradient-hero`, `--gradient-accent`.

Kesimpulan: fondasi token cukup baik. Redesign TIDAK memerlukan pembongkaran token, hanya penambahan (surface tiers, elevation, motion, status token, spacing scale) dan keputusan accent final.

## 3. Masalah Utama (ringkas)
### Mobile
- Tidak ada bottom navigation untuk customer maupun operator.
- Tidak ada sticky CTA di detail produk & checkout.
- Tidak ada bottom sheet; semua interaksi memakai dialog desktop.
- Dashboard customer memakai tab bar horizontal yang mudah terlewat.

### Dashboard Customer
- Halaman ringkasan tampil sebagai 6 kartu KPI angka nol bertumpuk vertikal — terasa seperti laporan bisnis, bukan aplikasi layanan.
- Tidak ada greeting, shortcut layanan, maupun blok "perlu tindakan".
- Order aktif tidak diangkat ke atas; tidak ada CTA langsung ("Bayar sekarang", "Unggah bukti").
- Empty state generik ("Belum ada notifikasi.") tanpa arah tindakan.

### Checkout & Pembayaran
- Checkout satu halaman panjang tanpa step indicator dan tanpa ringkasan yang bisa dilipat.
- Total tidak cukup menonjol dibanding rincian.
- Instruksi pembayaran manual belum berbentuk kartu metode dengan tombol salin, countdown deadline, dan status verifikasi yang komunikatif.
- Belum ada alur checkout jasa (paket, kebutuhan, unggah file).

### Order Tracking
- Riwayat status tampil sebagai daftar teks, bukan timeline dengan ikon milestone, progres, dan estimasi.
- Status memakai istilah internal (`payment_under_review`, `waiting_assignment`) di beberapa tempat.

### Dashboard Admin
- Struktur sidebar sudah baik, tetapi belum ada blok "Perlu perhatian" di halaman ringkasan.
- Tabel desktop dipaksa mengecil di mobile (belum ada card view).
- Aksi berisiko sudah punya modal konfirmasi (baik), tetapi belum ada sticky action bar pada detail.
- Modul Operator, Progres, Revisi, Komplain, Kategori belum ada.

### Operator
- Belum ada dashboard operator sama sekali.

## 4. Konsistensi Visual
- Badge status didefinisikan terpisah di `components/admin/tx-ui.tsx` dan tidak dipakai sisi customer → risiko dua bahasa status.
- Kartu memakai kombinasi kelas ad-hoc, bukan varian komponen.
- Loading state: sebagian pakai `animate-pulse` manual, sebagian tanpa skeleton.
- Tidak ada `prefers-reduced-motion` handling.

## 5. Yang Tidak Boleh Rusak
- RPC transaksi (`create_digital_order`, `submit_payment_proof`, `verify_manual_payment`, refund, task).
- Guard permission granular pada seluruh server function admin.
- Rute `_authenticated` dan redirect pasca-login ke `/dashboard`.