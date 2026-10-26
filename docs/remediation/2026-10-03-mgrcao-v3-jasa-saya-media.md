# MGRCAO V3: Jasa Saya dan media jasa (5 gambar + video)

Tanggal: 2026-10-03. Dasar: [riset Jasa Saya dan media jasa](../ui-ux/2026-10-03-riset-jasa-saya-dan-media.md). Status: framework untuk pekerjaan berikutnya.

## M: Mindset

Halaman ini adalah rumah seller untuk seluruh jasanya, bukan gudang draft. Namanya harus jujur: "Jasa Saya". Aksi utamanya adalah menambahkan jasa, bukan menyimpan draft.

Media bukan hiasan. Jasa adalah pembelian berdasarkan kepercayaan, dan pembeli perlu melihat gambaran hasil sebelum membayar. Namun media juga data besar dan berisiko: batas ukuran, tipe yang benar, dan akses yang ketat harus ditegakkan di SQL dan storage, bukan hanya di UI.

## G: Goal

1. Penamaan jujur: "Jasa Saya" di sidebar dan halaman, aksi "Tambahkan Jasa".
2. Seller dapat melampirkan maksimal 5 media per jasa (gambar dan video).
3. Media tersimpan privat dan hanya dapat dibaca publik lewat proxy terkontrol.
4. Media tampil di kartu listing seller, katalog publik, halaman toko, dan checkout.
5. Validasi ditegakkan berlapis: Zod di server function, constraint di SQL, dan verifikasi objek di storage.
6. Tidak ada regresi pada moderasi, checkout, atau lifecycle jasa.

## R: Role

Frontend/UI/UX specialist dan engineer storage marketplace, bekerja sendiri tanpa spawn agent. Mandat terbatas pada:

- Migration baru: kolom `media`, bucket `service-media`, RPC draft diperluas.
- `src/lib/marketplace-service.ts` dan `src/lib/marketplace-service.functions.ts`.
- `src/components/seller/marketplace-service-catalog.tsx` dan komponen media baru di `src/components/seller/`.
- `src/components/home/seller-service-card.tsx`, `src/routes/toko.$slug.tsx`, checkout jasa.
- Rute proxy media publik.
- Test terkait.

Di luar allowlist: berhenti dan catat blocker. Tidak menyentuh jalur uang, lifecycle, atau moderasi selain field media.

## C: Constraints

- Jangan mengedit migration yang sudah diterapkan; buat migration baru.
- Batas 5 media, MIME, dan ukuran ditegakkan di SQL, bukan hanya di UI.
- Bucket privat; publik hanya lewat proxy dengan validasi path.
- Unggah lewat signed URL dengan verifikasi kepemilikan listing; jangan memberi klien akses tulis langsung ke bucket.
- Verifikasi keberadaan objek sebelum menyimpan path; path tanpa objek harus ditolak.
- Jasa lama tanpa media tetap tampil normal (array kosong).
- Tanpa dependency baru. Gunakan komponen dan token existing.
- Aksesibilitas: `alt` wajib untuk gambar, dan video memakai kontrol bawaan browser.
- Bahasa Indonesia, tanpa em dash.

## A: Actions

1. Migration: tambah kolom `media jsonb NOT NULL DEFAULT '[]'` dengan constraint panjang maksimal 5 dan bentuk objek yang sah.
2. Migration: buat bucket privat `service-media` dengan MIME gambar dan video serta batas ukuran per tipe.
3. Migration: perluas `save_marketplace_service_draft` menerima `_media jsonb`, validasi bentuk dan path, lalu grant ulang.
4. Server function: `prepareServiceMediaUpload` (signed URL dengan verifikasi kepemilikan) dan `registerServiceMedia` (verifikasi objek ada, kembalikan entri media).
5. Rute proxy publik media jasa dengan validasi path ketat.
6. UI seller: rename label, tombol "Tambahkan Jasa", dan bagian "Media jasa" di form dengan pratinjau, urutan, dan hapus.
7. Kartu listing seller: thumbnail pertama dan jumlah media.
8. Katalog publik, halaman toko, dan checkout: tampilkan media pertama; galeri ringkas di checkout.
9. Tests: constraint SQL, skema Zod, alur unggah, proxy, dan tampilan kartu.
10. Evidence: klik-through browser, hasil unit/build/lint, dan batas yang belum diuji (durasi video, transcode).

## O: Acceptance

- Sidebar dan halaman memakai "Jasa Saya"; aksi utama "Tambahkan Jasa".
- Seller dapat mengunggah sampai 5 media campuran gambar dan video dengan pratinjau dan hapus.
- Lebih dari 5 media ditolak di UI dan di SQL.
- MIME dan ukuran di luar daftar ditolak; path tanpa objek ditolak.
- Media tampil di kartu seller, katalog publik, halaman toko, dan checkout.
- Objek tetap privat; hanya proxy yang melayani publik.
- Jasa tanpa media tetap tampil normal.
- Moderasi, checkout, dan lifecycle tidak berubah perilakunya.
- Tests/build dilaporkan apa adanya, tanpa klaim yang belum dijalankan.
