# Riset: Jasa Saya dan media jasa (5 gambar + video)

Tanggal: 2026-10-03. Scope: halaman `/seller/jasa` (sekarang berlabel "Draft Jasa"), penamaan aksi, dan kemampuan menambahkan media pada jasa. Metode: pembacaan source halaman, skema `marketplace_services`, RPC draft/moderasi, pola unggah yang sudah ada, serta katalog publik dan checkout. Tidak ada perubahan kode pada tahap riset ini.

## 1. Kondisi saat ini

### 1.1 Penamaan yang menyesatkan

- Sidebar memakai label "Draft Jasa" (`dashboard-sidebar.tsx`, `seller-sidebar.tsx`).
- Halaman berjudul "Jasa toko" dengan tombol "Buat draft", empty state "Buat draft pertama, lalu ajukan moderasi".
- Padahal halaman ini bukan hanya draft: di dalamnya ada tab Moderasi, Disetujui, dan Perlu perbaikan. Jasa yang sudah tayang pun dikelola dari sini.

Kata "draft" membuat seller mengira halaman ini hanya tempat menyimpan rancangan, bukan tempat mengelola seluruh jasa.

### 1.2 Tidak ada media sama sekali

Tabel `marketplace_services` hanya menyimpan `name`, `price`, `agreement`, `status`, dan metadata moderasi. Tidak ada kolom gambar atau video.

Akibatnya:

- Kartu jasa di katalog publik (`/layanan`) hanya teks: nama, toko, scope, durasi, revisi, harga.
- Halaman checkout jasa juga hanya teks.
- Halaman toko menampilkan kartu jasa tanpa visual.
- Pembeli tidak punya gambaran hasil pekerjaan, padahal jasa adalah pembelian berdasarkan kepercayaan.

Ini kesenjangan besar dibanding standar marketplace jasa (Fiverr menampilkan galeri gambar dan video pada setiap gig).

### 1.3 RPC draft tidak menerima media

`save_marketplace_service_draft(_id, _expected_version, _name, _category_id, _price, _agreement)` tidak punya parameter media. Skema Zod `marketplaceServiceDraftSchema` juga `.strict()` tanpa field media.

### 1.4 Pola unggah yang sudah ada di aplikasi

| Pola | Contoh | Catatan |
| --- | --- | --- |
| Server function + service role | `banner-upload.server.ts` (bucket `catalog-images`) | Server memvalidasi isi berkas dengan sharp, lalu menyimpan. Klien tidak menyentuh storage. |
| Signed upload URL | `seller-files.functions.ts`, `orders.functions.ts` (payment proof) | Server membuat URL bertanda tangan, klien mengunggah langsung, lalu server memverifikasi keberadaan objek. |
| Proxy publik | `/api/public/catalog-image/$` | Melayani objek privat lewat rute publik dengan validasi path. |

Bucket `catalog-images` sudah ada: privat, 5 MB, hanya gambar (jpeg/png/webp/avif). Untuk video dibutuhkan bucket atau konfigurasi berbeda karena batas ukuran dan MIME.

## 2. Kebutuhan

1. Ganti penamaan "Draft Jasa" menjadi "Jasa Saya" agar sesuai isi halaman.
2. Ganti aksi "Buat draft" menjadi "Tambahkan Jasa".
3. Seller dapat melampirkan **maksimal 5 media** per jasa: gambar dan video.
4. Media tampil di katalog publik, halaman toko, dan checkout, sehingga pembeli melihat gambaran jasa.
5. Media harus aman: privat, akses terkontrol, dan tidak membuka tabel privat ke anon.

## 3. Rancangan yang diusulkan

### 3.1 Skema data

Tambah kolom `media jsonb NOT NULL DEFAULT '[]'` pada `marketplace_services`, berisi array objek:

```
{ "kind": "image" | "video", "path": "…", "alt": "…", "mime": "image/jpeg", "size": 12345 }
```

Batasan yang ditegakkan di SQL:

- Panjang array maksimal 5.
- `kind` hanya `image` atau `video`.
- `path` wajib berada di bucket media jasa.
- `alt` maksimal 160 karakter (aksesibilitas, bukan hiasan).
- MIME hanya format yang diizinkan.

Alasan memakai jsonb, bukan tabel relasi: media adalah atribut kecil dari satu listing, tidak pernah di-query lintas listing, dan urutannya bermakna (urutan tampil). Tabel relasi akan menambah join tanpa manfaat.

### 3.2 Penyimpanan

Bucket privat baru `service-media`:

- Gambar: jpeg, png, webp, avif, maksimal 5 MB per berkas.
- Video: mp4, webm, maksimal 25 MB per berkas.

Alasan batas terpisah: video wajar lebih besar, tetapi harus dibatasi agar tidak menjadi penyimpanan liar. Total per jasa dibatasi 5 media, sehingga kasus terburuk masih terukur.

Akses:

- Tulis: hanya pemilik toko lewat server function (signed upload URL dengan validasi kepemilikan listing).
- Baca: publik lewat proxy `/api/public/service-media/$` yang hanya melayani objek di bucket ini, sehingga objek tetap privat di storage.

### 3.3 RPC

`save_marketplace_service_draft` diperluas menerima `_media jsonb`. Karena mengubah signature, RPC lama di-`DROP` dan dibuat ulang dengan parameter tambahan, lalu grant diatur ulang. Pemanggil lama (server function) diperbarui bersamaan.

Validasi media diletakkan di SQL (bukan hanya Zod) karena SQL adalah batas kepercayaan terakhir.

### 3.4 UI

- Halaman: judul "Jasa Saya", tombol "Tambahkan Jasa".
- Form: bagian "Media jasa" dengan unggah hingga 5 berkas, campuran gambar dan video, dengan pratinjau, hapus, dan penanda urutan. Unggah berjalan sebelum simpan; bila simpan gagal, berkas yang sudah terunggah tetap dapat dipakai ulang saat mencoba lagi.
- Kartu listing: menampilkan thumbnail pertama bila ada.
- Katalog publik dan halaman toko: kartu jasa menampilkan gambar pertama.
- Checkout: menampilkan galeri ringkas sebelum kesepakatan.

## 4. Batas dan risiko

- Video adalah data besar: perlu batas ukuran, durasi tidak dapat diverifikasi tanpa pemrosesan tambahan, jadi hanya ukuran dan MIME yang ditegakkan. Ini dicatat sebagai batas, bukan diklaim sebagai validasi penuh.
- Tidak ada transcode; video ditampilkan apa adanya. Format yang tidak didukung browser akan gagal tampil, jadi hanya mp4/webm yang diterima.
- Media lama (jasa yang sudah ada) tidak punya media; UI harus menangani array kosong tanpa merusak tampilan.
- Proxy publik harus menolak path traversal dan hanya melayani bucket media jasa.
- Unggahan gagal di tengah jalan tidak boleh menyimpan path yang tidak ada objeknya; verifikasi keberadaan objek wajib.

Framework kerja disusun di `docs/remediation/2026-10-03-mgrcao-v3-jasa-saya-media.md`.
