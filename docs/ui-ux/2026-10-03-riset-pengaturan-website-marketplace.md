# Riset: pembaruan kompleks pengaturan website untuk konteks marketplace

Tanggal: 2026-10-03. Role: Security Engineer + Frontend/UI/UX Specialist. Scope: `/admin/settings/website` — kelengkapan pengaturan sistem dan perbaikan UI/UX. Metode: pembacaan source lengkap (`website-settings.ts` 1391 baris, halaman 466 baris, server function 207 baris), audit live permission di database, dan inventaris nilai bisnis yang masih hardcoded. Tidak ada perubahan kode pada tahap riset ini.

## 1. Kondisi saat ini

### 1.1 Struktur

Halaman memiliki 11 bagian: Umum, Branding, Kontak, Navigasi, SEO, Storefront, Layanan akademik, Order & pembayaran, Notifikasi, Fitur, Maintenance. Setiap field punya `key`, `type`, `default`, `isPublic`, dan validasi; tersimpan di `system_settings` dengan audit log.

Tata letak: sidebar 220px + kartu field + panel preview. Ada indikator perubahan belum disimpan, tombol simpan/batal/reset, dan konfirmasi untuk field berisiko.

Ini fondasi yang baik dan tidak perlu dibongkar.

### 1.2 Temuan kritis: permission tidak terdaftar di database

Kode memakai 10 permission berbeda:

```
settings.website.update    settings.branding.update   settings.contact.update
settings.navigation.update settings.seo.update        settings.commerce.update
settings.payment.update    settings.features.update   settings.maintenance.update
settings.website.view
```

Database **hanya** memiliki tiga:

```
settings.view              settings.manage            settings.branding.update
```

Akibatnya: `has_permission()` mengembalikan false untuk sembilan permission yang tidak terdaftar. Satu-satunya alasan halaman masih bisa disimpan adalah **super_admin bypass** di `assertPermission` (yang menulis audit `permission.super_admin_bypass`).

Dampak nyata:

- Admin biasa dengan `settings.view` dapat **melihat** semua bagian, tetapi **tidak dapat menyimpan apa pun**, tanpa pesan yang jelas mengapa.
- Setiap penyimpanan oleh super_admin menulis audit bypass, sehingga audit log dipenuhi entri yang menandakan konfigurasi izin belum lengkap.
- Rencana pemisahan tugas (mis. admin konten hanya boleh mengubah SEO) tidak dapat dijalankan.

Ini bukan sekadar kerapuhan; ini kesenjangan tata kelola.

### 1.3 Temuan: tidak ada pengaturan konteks marketplace

Grep untuk `marketplace|jasa|seller|escrow|komisi|fee|payout|withdraw|dispute` hanya menemukan `admin_fee`. Padahal aplikasi sudah menjalankan marketplace jasa dengan banyak aturan yang sekarang **hardcoded**:

| Nilai | Lokasi hardcode | Seharusnya |
| --- | --- | --- |
| Maksimal 5 media per jasa | `MARKETPLACE_SERVICE_MEDIA_MAX` + CHECK constraint SQL | dapat diatur admin |
| Gambar maksimal 5 MB | `MARKETPLACE_SERVICE_IMAGE_MAX_BYTES` + constraint | dapat diatur |
| Video maksimal 25 MB | `MARKETPLACE_SERVICE_VIDEO_MAX_BYTES` + bucket | dapat diatur |
| Berkas hasil maksimal 25 MB | `MARKETPLACE_SERVICE_DELIVERY_MAX_BYTES` | dapat diatur |
| Durasi jasa maksimal 36500 hari | RPC quote/creation | dapat diatur |
| Panjang requirements 10-5000 | Zod + SQL | dapat diatur |
| Batas 48 produk per halaman toko | query `getPublicStore` | dapat diatur |
| Batas 64 KB body webhook | `webhook.sumopod.ts` | dapat diatur |
| Maksimal 500 kode stok per batch | RPC `seller_ingest_stock_codes` | dapat diatur |
| Jumlah banner maksimal 5 | `validateBannerSlides` | dapat diatur |

Selain itu tidak ada pengaturan untuk:

- **Kebijakan seller**: apakah seller baru otomatis aktif atau perlu persetujuan; batas jumlah jasa per toko; apakah seller boleh mengubah harga jasa yang sudah approved.
- **Escrow/rekber**: berapa lama dana ditahan setelah pengiriman hasil; apakah auto-release aktif dan berapa lama; kebijakan komplain.
- **Refund & sengketa**: batas waktu, siapa yang memutuskan, apakah refund sebagian didukung.
- **Moderasi**: apakah jasa/produk perlu moderasi sebelum tayang; berapa lama target review.
- **Kualitas**: batas minimum rating untuk tetap tayang, kebijakan ulasan.
- **Pencairan**: minimum saldo untuk pencairan, jadwal, metode.

### 1.4 Temuan UI/UX

| Masalah | Bukti |
| --- | --- |
| Semua field satu tipe baris, tidak dikelompokkan | `section.fields.map((field) => <FieldRow …>)` |
| Tidak ada pencarian field | tidak ada input search |
| Tidak ada penanda bagian yang punya perubahan belum disimpan | hanya total di footer |
| Sidebar tidak menunjukkan status bagian | hanya label |
| Preview di bawah semua field, harus digulir jauh | `<SettingsPreview values={draft} />` |
| Tidak ada indikator "field ini publik" | `isPublic` tidak ditampilkan ke admin |
| Tidak ada peringatan dampak sebelum menyimpan bagian berisiko | hanya `window.confirm` polos |
| Tidak ada riwayat perubahan per bagian | hanya 1 entri audit terakhir |
| Navigasi bagian di mobile jadi baris horizontal panjang | `overflow-x-auto` |
| Tidak ada indikator field yang diubah dari default | `storedKeys` tersedia tetapi tidak dipakai di UI |

## 2. Yang diusulkan

### 2.1 Perbaikan tata kelola izin (P0)

Daftarkan sembilan permission yang hilang ke `permissions` dan `role_permissions`, dengan pemetaan yang masuk akal:

| Permission | admin | super_admin |
| --- | --- | --- |
| settings.website.update | ya | ya |
| settings.branding.update | tidak | ya |
| settings.contact.update | ya | ya |
| settings.navigation.update | ya | ya |
| settings.seo.update | ya | ya |
| settings.commerce.update | tidak | ya |
| settings.payment.update | tidak | ya |
| settings.marketplace.update (baru) | tidak | ya |
| settings.features.update | tidak | ya |
| settings.maintenance.update | tidak | ya |

Alasan: admin mengelola konten dan identitas; keputusan uang, fitur, dan marketplace tetap di super_admin. Ini menghapus ketergantungan pada bypass dan membuat audit log bersih.

### 2.2 Bagian baru: Marketplace

Bagian pengaturan baru berisi aturan yang sekarang hardcoded, dipisah menjadi subkelompok:

**Media & berkas jasa**
- Maksimal media per jasa (1-10)
- Ukuran maksimal gambar (MB)
- Ukuran maksimal video (MB)
- Ukuran maksimal berkas hasil (MB)

**Aturan jasa**
- Durasi jasa maksimal (hari)
- Panjang minimum requirements pembeli
- Batas jumlah jasa aktif per toko (0 = tanpa batas)

**Escrow & pencairan**
- Dana ditahan berapa lama setelah hasil dikirim sebelum auto-release (jam, 0 = mati)
- Apakah auto-release aktif
- Minimum saldo pencairan

**Moderasi**
- Jasa baru wajib moderasi sebelum tayang
- Target waktu review (jam)

**Kebijakan seller**
- Seller baru otomatis aktif atau perlu persetujuan
- Seller boleh mengubah jasa yang sudah approved (akan kembali ke draft)

**Refund & sengketa**
- Batas hari pengajuan refund setelah pembayaran
- Refund sebagian didukung

Setiap field punya default yang sama dengan nilai hardcoded saat ini, sehingga **tidak ada perubahan perilaku** sampai admin mengubahnya. Nilai dibaca dari `system_settings` dengan fallback ke default.

### 2.3 Batas penerapan

Tidak semua nilai dapat langsung dijadikan dinamis tanpa risiko:

- Nilai yang ditegakkan **constraint SQL** (mis. bentuk media) memerlukan migration untuk membaca setting. Ini pekerjaan besar dan berisiko; untuk sekarang field ditampilkan sebagai **read-only dengan penjelasan** bahwa nilainya ditegakkan di database, kecuali yang sudah dapat dibaca lewat `setting_int` di RPC (seperti `admin_fee`).
- Nilai yang dibaca **server function** (mis. ukuran unggah, batas halaman) dapat langsung dipakai.
- Nilai yang dibaca **bucket storage** memerlukan pembaruan bucket; dapat dilakukan lewat server function berizin.

Pendekatan jujur: field yang belum terhubung ditandai jelas "ditegakkan di database, hubungi developer untuk mengubah", bukan dipalsukan sebagai dapat diatur.

### 2.4 Perbaikan UI/UX

1. **Kelompokkan field** dengan subjudul di dalam bagian; bagian besar (Marketplace, Transaksi) tidak lagi satu daftar panjang.
2. **Pencarian field** di atas daftar; menyaring lintas bagian dan menampilkan hasil dengan label bagiannya.
3. **Status bagian di sidebar**: titik penanda bila ada perubahan belum disimpan pada bagian itu.
4. **Indikator publik/privat** pada setiap field (ikon + label kecil), karena ini menentukan apakah nilai terlihat pengunjung.
5. **Penanda "diubah dari default"** memakai `storedKeys` yang sudah tersedia.
6. **Ringkasan dampak sebelum simpan** untuk bagian berisiko (uang, fitur, marketplace), menggantikan `window.confirm` polos.
7. **Preview dipindah ke samping** pada layar lebar (sudah ada grid, tinggal dipindah ke kolom kanan yang sticky).
8. **Navigasi mobile** memakai select/sheet, bukan baris horizontal panjang.
9. **Riwayat perubahan per bagian** (5 entri terakhir) di bawah kartu.

## 3. Prioritas

**P0**: daftarkan permission yang hilang; perbaiki pesan saat admin tidak punya izin.
**P1**: bagian Marketplace baru; pencarian field; pengelompokan; indikator publik; status bagian di sidebar.
**P2**: ringkasan dampak; preview sticky; riwayat per bagian; navigasi mobile.

## 4. Kesimpulan

Fondasi penyimpanan dan validasi pengaturan sudah kuat. Dua hal yang harus dibenahi: **tata kelola izin** (sembilan permission tidak terdaftar, sehingga hanya super_admin yang efektif dapat menyimpan) dan **kelengkapan konteks marketplace** (aturan jasa, escrow, moderasi, dan kebijakan seller masih hardcoded). UI perlu dikelompokkan, dapat dicari, dan jujur menandai mana yang benar-benar dapat diatur.

Framework kerja disusun di `docs/remediation/2026-10-03-mgrcao-v3-pengaturan-website-marketplace.md`.
