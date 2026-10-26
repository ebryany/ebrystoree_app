# Riset: redesain admin orders ke standar marketplace

Tanggal: 2026-10-03. Scope: `/admin/orders` (daftar) dan `/admin/orders/$id` (detail). Metode: pembacaan source kedua halaman, server function `listOrders`/`getOrderDetail`, dan perbandingan dengan standar marketplace. Tidak ada perubahan kode pada tahap riset ini.

## 1. Kondisi saat ini

### 1.1 Daftar order (`orders.index.tsx`, 297 baris)

- Filter: pencarian nomor, status order, jenis, status pembayaran, rentang tanggal, urutan. Semua memakai Select/Input di grid 4 kolom.
- Tabel dengan kolom: Nomor, Customer, Toko, Jenis, Status, Pembayaran, Total, Dibuat, aksi Detail.
- Loading `AdminLoading`, error `AdminError`, empty `EmptyRow`.
- Pager di bawah.
- Ekspor CSV untuk halaman aktif.

### 1.2 Detail order (`orders.$id.tsx`, 319 baris)

- Header dengan nomor order + tombol Kembali.
- Kartu "Ringkasan": 12 field dalam grid (status, total, biaya admin, diskon, customer, email, telepon, kedaluwarsa, dibayar, selesai, invoice, status invoice).
- Kartu "Item order": tabel nama, jenis, harga, qty, total.
- Kartu "Pembayaran": daftar dengan tombol buka pembayaran.
- Kartu "Detail layanan" untuk order akademik.
- `OrderMonitoringDetail` untuk produk digital.

## 2. Masalah untuk konteks marketplace

### 2.1 Jenis order tidak lengkap

Filter jenis hanya menawarkan `digital_product` dan `service`. **`marketplace_service` (jasa seller) tidak ada di filter**, padahal jenis ini sudah aktif dan punya halaman moderasi sendiri. Admin tidak dapat menyaring pesanan jasa seller.

### 2.2 Daftar berbentuk tabel padat, bukan kartu kerja

Standar marketplace (Shopee/Tokopedia seller center, Stripe) memakai baris yang menampilkan: identitas, pembeli, toko, nilai, status, dan **satu hal yang menunggu tindakan**. Tabel saat ini menampilkan semua kolom dengan bobot sama, sehingga:

- Tidak ada penekanan pada order yang perlu tindakan admin (mis. pembayaran menunggu verifikasi, refund aktif, komplain jasa).
- Nomor order, total, dan waktu tersebar tanpa hierarki.
- Tidak ada avatar/inisial pembeli untuk pemindaian cepat.
- Di mobile, tabel memaksa geser horizontal.

### 2.3 Detail tidak menunjukkan alur

Detail menampilkan data sebagai daftar field, bukan **perjalanan pesanan**. Tidak ada:

- Ringkasan status dengan langkah (dibuat → dibayar → dikerjakan → selesai).
- Penanda "apa yang menunggu" (mis. pembayaran perlu diverifikasi).
- Informasi jasa seller: kesepakatan, kebutuhan pembeli, tenggat, hasil pekerjaan.
- Informasi dana: berapa ditahan, kapan dilepas, apakah ada refund aktif.

Untuk order `marketplace_service`, detail saat ini **tidak menampilkan kontrak jasa sama sekali** karena hanya menangani `digital_product` (monitoring) dan `service` (detail layanan akademik).

### 2.4 Tidak ada ringkasan angka

Daftar tidak menampilkan berapa order menunggu verifikasi pembayaran, berapa refund aktif, atau berapa komplain jasa terbuka. Admin harus membuka halaman lain.

### 2.5 Konsistensi visual

Halaman ini belum memakai pola yang sudah kita bangun: StatusPill, kartu kerja dengan "langkah berikutnya", timeline, dan animasi yang hormat reduced motion.

## 3. Rancangan yang diusulkan

### 3.1 Daftar order

**Ringkasan kerja** (di atas): empat angka nyata dari data yang ada:

- Menunggu verifikasi pembayaran
- Sedang dikerjakan
- Refund aktif
- Selesai hari ini

**Filter** dikelompokkan: pencarian + jenis (termasuk **Jasa seller**) + status; tanggal dan urutan dilipat ke panel "Filter lanjutan" agar tidak memenuhi layar.

**Daftar** berbentuk kartu baris (bukan tabel):

```
┌────────────────────────────────────────────────────────┐
│ EBS-20261003-000020          [Menunggu verifikasi]     │
│ JASA BUAT WEB ×1             Rp 22.500                 │
│ C (inisial) Pembeli · toko citra · 3 Okt 19.59         │
│ → Verifikasi pembayaran manual                          │
│                                        [Detail]        │
└────────────────────────────────────────────────────────┘
```

- Ikon jenis (produk/jasa seller/akademik) sebagai penanda cepat.
- Baris "langkah berikutnya" untuk order yang butuh tindakan admin.
- Mobile: satu kolom tanpa geser.

### 3.2 Detail order

**Header**: nomor order, jenis, status pill, total, dan tombol aksi kontekstual.

**Ringkasan tindakan** (bila ada): "Pembayaran menunggu verifikasi" dengan tautan langsung ke halaman pembayaran.

**Perjalanan pesanan**: memakai komponen timeline yang sudah ada (`LiveOrderTimeline`) dengan riwayat status, pembayaran, dan event jasa.

**Kartu informasi** yang disusun ulang:

1. Pembeli & toko
2. Item (dengan snapshot harga)
3. Pembayaran (status, metode, nominal, bukti)
4. Untuk jasa seller: kesepakatan, kebutuhan pembeli, tenggat, hasil pekerjaan, revisi
5. Dana: ditahan/dilepas/cadangan refund
6. Invoice

### 3.3 Data yang perlu ditambahkan

`getOrderDetail` perlu mengembalikan, untuk `marketplace_service`:

- kontrak `marketplace_service_orders` (agreement, requirements, due_at, work_state, revision)
- delivery terakhir
- event jasa

Ini penambahan read-only; tidak mengubah perilaku.

## 4. Batas

- Tidak mengubah alur verifikasi pembayaran, refund, atau keputusan admin; hanya penyajian.
- Tidak menampilkan data pribadi melebihi yang sudah ada (email/telepon sudah tampil untuk admin berizin `orders.view`).
- Angka ringkasan harus dihitung dari data nyata, bukan estimasi.
- Mobile-first: tanpa geser horizontal pada daftar.

## 5. Kesimpulan

Halaman admin orders sudah fungsional tetapi belum berbentuk alat kerja marketplace: jenis jasa seller tidak dapat disaring, daftar tidak menekankan yang butuh tindakan, dan detail jasa seller tidak menampilkan kontrak. Redesain mengarahkan halaman menjadi daftar kerja dengan hierarki jelas dan detail berbentuk perjalanan pesanan.

Framework kerja: `docs/remediation/2026-10-03-mgrcao-v3-redesign-admin-orders.md`.
