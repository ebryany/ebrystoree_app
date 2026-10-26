# MGRCAO V3: wizard tambah jasa seller

Tanggal: 2026-10-03. Dasar: [riset wizard tambah jasa](../ui-ux/2026-10-03-riset-wizard-tambah-jasa.md). Status: dikerjakan.

## M: Mindset

Seller menambahkan jasa untuk dijual, bukan mengisi formulir. Alur harus menjawab "saya di mana, apa lagi yang kurang, dan kapan bisa kirim". Satu halaman panjang menyembunyikan progres; stepper menampilkannya.

## G: Goal

1. Form dipecah menjadi 4 langkah dengan stepper yang menunjukkan posisi.
2. Validasi per langkah; tidak bisa maju sebelum langkah valid.
3. Nilai tidak hilang saat pindah langkah.
4. Ringkasan sebelum simpan.
5. Tetap memakai skema validasi yang sama; tanpa perubahan data/RPC/dependency.

## R: Role

Frontend/UI/UX specialist, bekerja sendiri. Mandat: `marketplace-service-catalog.tsx` dan komponen wizard baru di `src/components/seller/`.

## C: Constraints

- Tanpa dependency baru; gunakan `motion`, komponen UI existing, dan token desain.
- Validasi memakai `marketplaceServiceDraftSchema` yang sama.
- Aksesibilitas: stepper dengan `aria-current`, tombol 44px, focus ring, reduced motion.
- Bahasa Indonesia, tanpa em dash.

## A: Actions

1. Komponen `ServiceDraftWizard` dengan state terpusat (satu objek draft).
2. Stepper horizontal 4 langkah: Informasi, Kesepakatan, Media, Tinjau.
3. Validasi per langkah memakai subset skema; pesan menunjuk field.
4. Navigasi Lanjut/Kembali; simpan hanya di langkah Tinjau.
5. Langkah Media memakai `ServiceMediaEditor` yang sudah ada.
6. Ringkasan di langkah Tinjau: identitas, kesepakatan, media, dengan tautan kembali ke langkah terkait.
7. Test kontrak: urutan langkah, validasi per langkah, state tidak hilang, aksesibilitas.

## O: Acceptance

- Seller melihat 4 langkah dan posisinya.
- Tidak bisa maju dengan langkah tidak valid; pesan jelas.
- Nilai bertahan saat mundur/maju.
- Ringkasan tampil sebelum simpan.
- Simpan memakai skema validasi yang sama.
- Keyboard-only dapat menyelesaikan alur; reduced motion dihormati.
