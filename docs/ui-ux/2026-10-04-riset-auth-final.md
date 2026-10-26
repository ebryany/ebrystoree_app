# Riset: redesain halaman masuk dan daftar (revisi)

Tanggal: 2026-10-04. Scope: `/auth` mode masuk, daftar, dan lupa sandi. Metode: pengukuran live terhadap halaman berjalan, perbandingan dengan kontainer situs, dan audit keputusan desain sebelumnya. Tidak ada perubahan kode pada tahap riset ini.

## 1. Keluhan yang diverifikasi

### 1.1 Kartu melebihi navbar dan footer

**Terukur:** navbar dan footer memakai `mx-auto w-full max-w-6xl px-4 sm:px-6`.

Auth memakai grid **tanpa kontainer**: `grid w-full lg:grid-cols-[1.05fr_1fr]` yang membentang penuh lebar viewport (1280px), sedangkan navbar berhenti di `max-w-6xl` (1152px) dikurangi padding.

Hasil pengukuran live:

```
viewport       : 1280 x 720
grid auth      : 1280 lebar, 703 tinggi
panel kiri     : 648 x 667
panel kanan    : 617 x 667
navbar/footer  : maksimum 1152 (max-w-6xl)
```

Selisih 128px di kiri-kanan. Itulah sebabnya halaman terlihat lebih lebar daripada kerangka situs; tepinya tidak sejajar dengan logo di header dan kolom footer.

**Kesimpulan:** auth harus duduk di dalam kontainer yang sama dengan navbar/footer, atau minimal sejajar tepinya.

### 1.2 Teks di panel gambar tidak diinginkan

Panel kiri saat ini berisi judul, deskripsi, tiga kartu jaminan, dan tiga langkah. Owner meminta **teks di panel gambar dihapus**; panel cukup menampilkan gambar.

Alasan yang dapat ditulis: halaman auth adalah pintu masuk, bukan halaman penjelasan. Jaminan escrow sudah dikomunikasikan di halaman home; mengulanginya di sini menambah bacaan tanpa menambah keputusan.

### 1.3 Warna hijau di halaman login tidak disukai

Panel memakai `bg-primary` (ink teal) dan aksen amber. Teal gelap terbaca sebagai "hijau" pada beberapa layar. Owner tidak menginginkan warna itu di halaman auth.

Catatan: `--primary` adalah warna brand yang dipakai tombol utama di seluruh situs. Menghapusnya dari auth saja akan membuat halaman auth tidak konsisten dengan sisa aplikasi. Perlu keputusan: tetap pakai primary di tombol, atau auth memakai netral penuh dengan aksen yang lebih ringan.

### 1.4 Form terlihat basic

Kondisi saat ini:

- Tab Masuk/Daftar berupa dua tombol abu-abu di dalam kotak.
- Judul `text-xl` dengan deskripsi satu baris.
- Input tinggi 44px dengan label kecil di atas.
- Tombol Google outline abu-abu.
- Tombol submit solid primary.
- Tidak ada indikator langkah, tidak ada pengelompokan, tidak ada penekanan pada aksi utama.

Yang membuat terasa datar: semua elemen punya bobot visual yang hampir sama. Tidak ada hierarki antara "pilih mode", "isi identitas", "isi kredensial", dan "kirim".

## 2. Perbandingan dengan pola marketplace

Pola yang lazim pada marketplace besar untuk halaman masuk:

| Aspek | Pola lazim | Kondisi auth sekarang |
| --- | --- | --- |
| Kontainer | Sejajar dengan header (lebar sama) | Lebih lebar 128px |
| Panel visual | Gambar atau bidang brand, tanpa teks panjang | Gambar + teks panjang |
| Form | Satu kolom, lebar 380-420px, terpusat | 617px, terlalu lebar untuk satu kolom |
| Judul | Satu judul jelas + subjudul pendek | Ada, tapi kecil |
| Aksi utama | Satu tombol penuh, jelas dominan | Ada, tapi setara dengan elemen lain |
| Pemisah | Alternatif login (Google) dipisah jelas | Ada, pemisah tipis |

## 3. Yang harus diperbaiki

### P0

1. Auth masuk ke kontainer yang sejajar dengan navbar dan footer.
2. Hapus seluruh teks dari panel gambar; panel hanya gambar (dengan alt kosong karena dekoratif).
3. Form dipersempit ke lebar baca yang nyaman (sekitar 400px) meski kontainer lebar.

### P1

4. Naikkan hierarki form: judul lebih besar, jarak antar kelompok lebih jelas, satu aksi dominan.
5. Ganti tab abu-abu dengan pemilih mode yang lebih tegas.
6. Perbaiki tampilan tombol Google agar setara bobotnya sebagai alternatif.
7. Warna: hilangkan kesan hijau; panel gambar diberi overlay netral gelap, bukan teal.

### P2

8. Animasi masuk halus pada kartu form.
9. Status error yang lebih terlihat.

## 4. Batas

- Tidak menambah dependency baru.
- Tidak mengubah logika auth, OAuth, atau validasi `next`.
- Panel gambar memakai banner dari pengaturan admin; bila kosong, panel harus tetap tampil rapi (bidang netral), bukan area putih kosong.
- Form tetap harus dapat dioperasikan keyboard dan target sentuh 44px.

## 5. Kesimpulan

Tiga keluhan owner semuanya tervalidasi dengan pengukuran: auth lebih lebar 128px dari kerangka situs, panel berisi teks yang tidak diinginkan, dan form punya lebar 617px dengan hierarki datar. Perbaikan harus menyelaraskan kontainer, mengosongkan panel teks, mempersempit form, dan menaikkan hierarki tanpa menambah dekorasi.

Framework kerja: `docs/remediation/2026-10-04-mgrcao-v3-auth-final.md`.
