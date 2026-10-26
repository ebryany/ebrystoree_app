# Riset: alur bertahap (wizard) tambah jasa seller

Tanggal: 2026-10-03. Scope: form tambah/edit jasa di `/seller/jasa`. Metode: pembacaan source form saat ini, inventaris komponen shared, dan perbandingan dengan pola marketplace.

## 1. Masalah

Form tambah jasa sekarang satu tumpukan panjang: nama, kategori, harga, durasi, revisi, lalu empat textarea kesepakatan, lalu editor media, lalu tombol simpan. Seller tidak tahu:

- ada berapa bagian yang harus diisi;
- sedang di bagian mana;
- apa yang tersisa sebelum bisa menyimpan;
- bagian mana yang salah ketika validasi gagal (pesan hanya muncul di bawah, tanpa menunjuk bagian).

Ini yang membuatnya terasa "basic". Marketplace matang memakai alur bertahap dengan indikator posisi.

## 2. Yang dibutuhkan

Satu alur bertahap yang:

1. Menampilkan langkah dan posisi saat ini (stepper horizontal, konsisten dengan lini masa pesanan yang sudah dipakai).
2. Memvalidasi per langkah, bukan di akhir.
3. Mencegah maju sebelum langkah valid, dengan pesan yang menunjuk field.
4. Menyimpan semua nilai saat berpindah langkah (tidak hilang).
5. Bisa mundur dan mengubah tanpa kehilangan isian.
6. Menampilkan ringkasan sebelum simpan.

## 3. Rancangan langkah

| Langkah | Isi | Alasan |
| --- | --- | --- |
| 1. Informasi | Nama, kategori, harga | Identitas jasa; menentukan sisanya |
| 2. Kesepakatan | Scope, exclusions, deliverable, requirements, durasi, revisi | Kontrak kerja yang dibaca pembeli |
| 3. Media | Unggah maksimal 5 gambar/video, atur urutan | Bukti visual, opsional tapi dianjurkan |
| 4. Tinjau | Ringkasan semua isian + tombol simpan | Cek akhir sebelum moderasi |

Media diletakkan setelah kesepakatan karena seller biasanya menulis isi dulu; media bersifat pelengkap dan tidak memblokir.

## 4. Pola yang dipakai

- Stepper horizontal dengan lingkaran nomor, garis progres, dan label; langkah selesai ditandai centang. Di layar sempit dapat digeser.
- Tombol "Lanjut" dan "Kembali"; tombol simpan hanya di langkah terakhir.
- Validasi memakai Zod yang sudah ada, dijalankan per langkah dengan subset field.
- State form disimpan di satu objek React, bukan `FormData` sekali pakai, supaya nilai tidak hilang saat pindah langkah.

## 5. Batas

- Tidak mengubah skema data atau RPC; ini murni UI.
- Tidak menambah dependency.
- Tetap memakai validasi yang sama (`marketplaceServiceDraftSchema`), sehingga tidak ada aturan baru.

Framework kerja: `docs/remediation/2026-10-03-mgrcao-v3-wizard-tambah-jasa.md`.
