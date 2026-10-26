# MGRCAO V3: scroll-text marquee di halaman home

Tanggal: 2026-10-04. Dasar: [riset scroll-text home](../ui-ux/2026-10-04-riset-scroll-text-home.md). Status: dikerjakan.

## M: Mission

Menambahkan pita marquee yang **hidup dan berguna**, bukan ticker dekoratif. Isinya kategori nyata dari database, geraknya mengikuti scroll pengguna, dan tetap dapat dibaca pembaca layar serta pengguna yang memilih gerak minimal.

Prinsip yang dipegang: marquee yang berjalan sendiri tanpa henti adalah noise (R-19). Marquee yang bergerak mengikuti scroll menyerahkan kendali kepada pembaca, dan itu yang dipakai.

## G: Goal

1. Pita marquee ditempatkan tepat setelah banner, sebelum section kategori.
2. Isi pita: kategori jasa dan produk yang benar-benar ada di database.
3. Setiap item dapat diklik menuju katalog dengan filter kategori.
4. Gerak mengikuti scroll (`scrollDependent`), bukan loop otomatis.
5. Hormati `prefers-reduced-motion`: bila aktif, tidak ada gerak; konten tetap terbaca.
6. Aksesibilitas: salinan visual `aria-hidden`, disediakan daftar tautan yang dapat difokuskan keyboard.
7. Bila tidak ada kategori, pita tidak ditampilkan sama sekali.
8. Tanpa dependensi baru (`motion` sudah terpasang).

## R: Role

**Super UI/UX Engineer** untuk marketplace, bekerja sendiri tanpa spawn agent. Mandat: komponen baru di `src/components/home/` dan penyisipan di `src/routes/index.tsx`. Tidak menyentuh server function, RPC, atau skema data.

## C: Constraints

- Tidak menambah dependensi; komponen dibangun dengan `motion` yang sudah ada.
- Tidak memakai kode dari registry luar yang tidak dapat diverifikasi.
- Wajib menghormati `useReducedMotion`.
- Teks visual tidak boleh menjadi satu-satunya sumber informasi: sediakan versi yang dapat diakses.
- Tidak menampilkan kategori yang tidak lolos kelayakan publik (hanya yang dikirim dari query katalog yang sudah terfilter).
- Target sentuh 44px untuk item yang dapat diklik.
- Bahasa Indonesia, tanpa em dash.

## A: Actions

1. Bangun komponen `CategoryMarquee` dengan `motion`, menerima daftar kategori.
2. Mode `scrollDependent` memakai `useScroll` + `useVelocity` + `useTransform` untuk menggeser posisi.
3. `useReducedMotion`: bila aktif, render statis tanpa gerak.
4. Struktur aksesibilitas: pita visual `aria-hidden`, di bawahnya daftar tautan nyata (dapat difokuskan).
5. Sisipkan di home setelah banner, sebelum section kategori.
6. Data diambil dari query kategori yang sudah ada (jasa + produk).
7. Test kontrak dan verifikasi browser.

## O: Outcome

- Pita muncul setelah banner, berisi kategori nyata, dapat diklik.
- Gerak mengikuti scroll, bukan loop.
- Reduced motion menonaktifkan gerak.
- Pembaca layar mendapat daftar tautan yang setara.
- Tidak ada pita bila kategori kosong.
- Tanpa dependensi baru; tests/build dilaporkan apa adanya.
