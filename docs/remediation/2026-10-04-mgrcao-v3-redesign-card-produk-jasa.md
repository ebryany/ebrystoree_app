# MGRCAO V3: redesain kartu produk digital dan jasa seller

Tanggal: 2026-10-04. Dasar: [riset redesain kartu](../ui-ux/2026-10-04-riset-redesign-card-produk-jasa.md). Status: dikerjakan (kartu dulu; CTA menyusul sesuai keputusan owner).

## M: Mission

Memberi kartu katalog hierarki yang jelas supaya pengunjung dapat memindai harga, toko, dan jenis item dalam sekali lihat, tanpa menambah dekorasi yang tidak berfungsi.

Diagnosis riset: kartu tidak kekurangan hiasan; ia kekurangan hierarki. Semua elemen berbobot sama, hover hampir tak terasa, dan dua kartu di halaman yang sama memakai bahasa visual berbeda.

## G: Goal

1. Elevasi nyata saat hover (naik + shadow + glow halus) sebagai satu-satunya aksen.
2. Harga menjadi puncak visual setiap kartu.
3. Setiap kartu punya satu aksi yang terlihat.
4. Kerangka konsisten antar kartu: media → identitas → fakta → harga → aksi.
5. Varian `default` (katalog) tetap berfungsi.
6. Reduced motion dihormati: tanpa transform, tetap ada perubahan warna.
7. Tidak menambah sistem keranjang (tidak ada di aplikasi) dan tidak mengubah jalur checkout.

## R: Role

Frontend/UI/UX Specialist marketplace, bekerja sendiri tanpa spawn agent. Mandat: `src/components/home/catalog-cards.tsx` dan `src/components/home/seller-service-card.tsx`. Tidak menyentuh database, RPC, atau halaman checkout.

## C: Constraints

- Tanpa dependency baru; gunakan token yang ada (`shadow-card`, `glow-soft`, `--price`, `--accent`).
- Glow hanya saat hover pada satu kartu yang disorot; bukan di semua kartu sekaligus (dose cap anti-slop).
- Tidak menambah gradient, orb, atau elemen dekoratif tanpa fungsi.
- Tidak ada data baru; hanya penyajian ulang.
- Target sentuh 44px, focus ring terlihat, `motion-reduce` dihormati.
- Bahasa Indonesia, tanpa em dash.

## A: Actions

1. Kartu produk: kerangka baru dengan media, badge diskon di atas media, judul, toko, garis pemisah, harga tebal berwarna, dan footer aksi.
2. Kartu jasa: kerangka sama, dengan fakta kerja (durasi, revisi) sebagai baris ringkas.
3. Interaksi: hover naik + `shadow-card` + glow halus; fokus keyboard diperlakukan sama.
4. Reduced motion: hilangkan transform, pertahankan perubahan warna.
5. Pastikan varian `default` dan pemakaian di `/produk`, `/layanan`, serta home tetap benar.
6. Test kontrak dan verifikasi browser.

## O: Outcome

- Setiap kartu punya satu titik fokus (harga) dan satu aksi jelas.
- Hover dan fokus terasa nyata tetapi tetap tenang.
- Dua jenis kartu memakai kerangka yang sama.
- Tidak ada gradient, orb, atau glow berlebihan.
- Varian katalog tidak rusak.
- Tests/build dilaporkan apa adanya; CTA beli dicatat sebagai pekerjaan berikutnya.
