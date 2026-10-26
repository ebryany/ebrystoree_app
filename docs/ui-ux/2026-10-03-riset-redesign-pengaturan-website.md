# Riset: redesain UX halaman pengaturan website

Tanggal: 2026-10-03. Scope: `/admin/settings/website`. Metode: pembacaan source halaman (466 baris) dan pengamatan snapshot DOM live dengan akun super_admin. Tidak ada perubahan kode pada tahap riset ini.

## 1. Kondisi sekarang (terverifikasi live)

Yang sudah bekerja: pencarian lintas bagian, pengelompokan field (Media, Escrow, dll), badge publik/internal, penanda "Ditegakkan database", status bagian di sidebar, ringkasan dampak, dan preview.

## 2. Masalah UX yang tersisa

### 2.1 Tombol simpan jauh dari jangkauan

Bagian Marketplace punya 22 field. Tombol simpan berada di **bawah** kartu. Setelah mengubah field di bagian atas, admin harus menggulir jauh ke bawah untuk menyimpan, lalu kembali ke posisi semula. Ini masalah terbesar untuk bagian panjang.

### 2.2 Preview memaksa gulir

`SettingsPreview` diletakkan **di bawah** kartu konten dalam kolom yang sama. Untuk melihat dampak perubahan pada tampilan situs, admin harus menggulir melewati seluruh field. Preview seharusnya berdampingan dan menempel (sticky).

### 2.3 Ringkasan dampak muncul di bawah

Panel dampak dirender **setelah** kartu, jadi saat admin menekan Simpan di bagian bawah, panel muncul di bawah tombol dan admin harus menggulir lagi. Ia seharusnya menjadi dialog overlay di tengah layar.

### 2.4 Hasil pencarian mendorong konten

Panel hasil pencarian muncul **di atas** kartu bagian, sehingga konten bergeser ke bawah setiap kali mengetik. Hasil pencarian lebih tepat sebagai daftar dropdown di bawah input.

### 2.5 Tidak ada pengaman perubahan belum disimpan

Menutup tab atau berpindah halaman dengan perubahan belum disimpan tidak memberi peringatan. Tidak ada `beforeunload`.

### 2.6 Tidak ada pintasan simpan

Admin yang sering mengubah pengaturan mengharapkan `Ctrl/Cmd+S`. Sekarang harus mencari tombol.

### 2.7 Sidebar datar tanpa pengelompokan

Sebelas bagian ditampilkan sebagai daftar tunggal tanpa pengelompokan. Bagian "Order & pembayaran" dan "Marketplace" (keputusan uang) bercampur dengan "Kontak" dan "SEO" (konten). Tidak ada sinyal tingkat risiko.

### 2.8 Header bagian tidak informatif

Kartu bagian hanya menampilkan judul dan deskripsi. Tidak ada informasi berapa field di dalamnya, berapa yang berubah, atau apakah bagian ini menyentuh uang.

### 2.9 Mobile

Navigasi bagian menjadi baris horizontal panjang yang harus digeser. Untuk 11 bagian, ini tidak nyaman.

## 3. Rancangan redesain

### 3.1 Tata letak tiga kolom (xl)

```
┌──────────┬────────────────────────────┬──────────────┐
│ Sidebar  │ Kartu bagian               │ Preview      │
│ (sticky) │                            │ (sticky)     │
│          │  field...                  │  tampilan    │
│          │  field...                  │  situs       │
│          │                            │              │
└──────────┴────────────────────────────┴──────────────┘
        ┌─────────────────────────────────────┐
        │ Bilah simpan mengambang (sticky)    │
        │ 3 perubahan    [Batal] [Simpan]     │
        └─────────────────────────────────────┘
```

- Preview pindah ke kolom kanan dan sticky, sehingga dampak terlihat saat mengetik.
- Di bawah `xl`, preview kembali ke bawah kartu.

### 3.2 Bilah simpan mengambang

Saat ada perubahan belum disimpan, bilah muncul menempel di bawah layar: jumlah perubahan, tombol Batal dan Simpan, serta tombol Reset. Berlaku di semua bagian tanpa perlu menggulir.

### 3.3 Dialog dampak

Ringkasan dampak menjadi overlay modal dengan latar gelap, fokus terjebak, dapat ditutup dengan Escape, dan menampilkan daftar `nilai lama → nilai baru`.

### 3.4 Pencarian dropdown

Hasil pencarian muncul sebagai daftar di bawah input (dropdown), tidak mendorong konten. Klik hasil membuka bagian dan menyorot field.

### 3.5 Pengelompokan sidebar

Sidebar dibagi tiga kelompok dengan label:

- **Konten**: Umum, Branding, Kontak, Navigasi, SEO, Storefront
- **Transaksi**: Layanan akademik, Order & pembayaran, Marketplace
- **Sistem**: Notifikasi, Fitur, Maintenance

Setiap item menampilkan titik status bila ada perubahan belum disimpan.

### 3.6 Header bagian informatif

Kartu menampilkan: jumlah field, jumlah perubahan, dan lencana risiko untuk bagian yang menyentuh uang atau perilaku sistem.

### 3.7 Pengaman navigasi

- `beforeunload` saat ada perubahan belum disimpan.
- Pintasan `Ctrl/Cmd+S` menyimpan.

### 3.8 Mobile

Navigasi bagian memakai `<select>` pada layar sempit, bukan baris geser.

## 4. Batas

- Tidak mengubah registry, validasi, atau server function.
- Tidak mengubah perilaku simpan; hanya penyajian.
- Tetap memakai komponen UI yang ada (Button, Input, DetailCard, Dialog).
- Semua target sentuh 44px, focus ring terlihat, dan dapat dioperasikan keyboard.

## 5. Kesimpulan

Fondasi fungsional sudah lengkap. Yang perlu diperbaiki adalah **jarak antara tindakan dan konsekuensi**: simpan harus selalu terjangkau, preview harus terlihat saat mengubah, dan konfirmasi harus muncul di depan mata. Ditambah pengaman perubahan belum disimpan dan pengelompokan navigasi menurut risiko.

Framework kerja: `docs/remediation/2026-10-03-mgrcao-v3-redesign-pengaturan-website.md`.
