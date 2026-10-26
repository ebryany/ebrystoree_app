# Redesain Katalog Jasa Ebrystore

## Tujuan
Membuat halaman `/layanan` terasa satu keluarga dengan katalog `/produk`, tetapi lebih modern, dinamis, dan berorientasi pada pemilihan jasa. Mengganti bahasa “Pendampingan Akademik” dengan istilah yang lebih santai seperti “Jasa Digital & Bantuan Project”, tanpa mengubah alur transaksi atau data layanan.

## Perubahan yang Dibangun
- Mengganti bagian pembuka besar menjadi header katalog modern yang ringkas, dengan judul, deskripsi, dan tiga penanda kepercayaan: estimasi jelas, progres terpantau, dan revisi tersedia.
- Menyamakan latar, lebar konten, jarak, pencarian, kategori, serta pola hasil katalog dengan halaman produk.
- Mendesain ulang kartu jasa agar lebih mudah dipindai: identitas jasa, harga mulai, ringkasan paket, estimasi, revisi, dan tombol detail yang jelas.
- Membuat grid responsif: satu kolom pada ponsel, dua kolom pada tablet, dan tiga kolom pada layar lebar.
- Mengganti seluruh teks publik di halaman ini yang terlalu formal menjadi bahasa “jasa digital”, “bantuan project”, atau “jasa tugas” yang lebih ramah.
- Memperbarui judul dan deskripsi halaman untuk mesin pencari agar konsisten dengan istilah baru.
- Menjaga pencarian, filter kategori, pemuatan bertahap, keadaan kosong/error, tautan detail, dan data harga tetap bekerja seperti sekarang.

## Detail Teknis
- Fokus perubahan pada tampilan halaman `/layanan`; tidak mengubah database, aturan checkout, atau logika transaksi.
- Tetap memakai warna, tipografi Sora–Manrope, tombol, badge, dan token desain Ebrystore yang sudah ada.
- Ikon kategori jasa ditampilkan secara konsisten berdasarkan konteks umum, tanpa mengarang data baru.
- Animasi dibuat ringan dan tetap menghormati pengaturan pengurangan gerak pengguna.

## Verifikasi
- Memastikan pencarian dan filter kategori memperbarui hasil serta URL.
- Memastikan kartu, harga, paket, estimasi, revisi, dan tombol detail tampil benar.
- Memeriksa tampilan desktop dan ponsel, termasuk tidak ada teks terpotong atau halaman melebar horizontal.
- Memastikan tidak ada error pada halaman setelah perubahan.
