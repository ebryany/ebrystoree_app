# Otomatisasi Produk Google AI Pro (JioFarm)

## Kondisi & batasan

JioFarm adalah program Python yang menyewa nomor Jio, login OTP, lalu memanen link redeem Google AI Pro. Program seperti ini tidak bisa berjalan di dalam Ebrystore — situs ini jalan di lingkungan server ringan yang tidak bisa menjalankan Python, menyewa nomor, atau menunggu OTP berjam-jam.

Jadi JioFarm tetap dijalankan di komputer/VPS Anda, dan Ebrystore diberi "pintu masuk" aman supaya setiap link yang dipanen langsung masuk stok dan terkirim otomatis ke pembeli.

```text
JioFarm (VPS Anda)  --kirim link-->  Ebrystore  --kirim otomatis-->  Pembeli
        ^                                |
        +------ lihat antrean pesanan ---+
```

## Alur yang akan dibangun

1. Pembeli memesan produk Google AI Pro dan membayar (QRIS/manual seperti sekarang).
2. Jika stok link tersedia: satu link langsung dikunci untuk pembeli itu, pesanan selesai, notifikasi terkirim. Hitungan detik.
3. Jika stok kosong: pesanan masuk status baru "Sedang disiapkan", pembeli melihat keterangan bahwa akunnya sedang dibuat otomatis, dengan perkiraan waktu.
4. JioFarm membaca antrean tersebut, berburu link, lalu mengirim setiap link yang didapat ke Ebrystore.
5. Begitu link masuk, pesanan paling lama di antrean langsung dipenuhi dan pembeli dapat notifikasi.

## Yang akan dibuat

### Basis data
- Tabel `product_stock_codes`: satu baris per link redeem (produk, isi link, sumber, status tersedia/terkunci/terkirim, kedaluwarsa, nomor yang dipakai, entitlement pemilik). Lengkap dengan izin akses dan aturan keamanan baris.
- Mode pengiriman baru `code` pada produk digital (di samping `shared` dan `unique` yang sudah ada), agar hanya produk tertentu yang memakai stok link.
- Status pesanan baru `waiting_stock` pada mesin status pesanan + catatan riwayatnya.
- Fungsi basis data `claim_stock_code` yang mengunci satu link secara aman (anti rebutan, `FOR UPDATE SKIP LOCKED`) dan `fulfill_waiting_stock_orders` yang memenuhi antrean saat stok baru masuk.
- Pemenuhan otomatis dipanggil dari jalur pelunasan yang sudah ada (`settle_gateway_payment` dan verifikasi manual admin).

### Pintu masuk untuk JioFarm
Dua endpoint publik yang diamankan token rahasia (`JIOFARM_INGEST_TOKEN`):
- `POST /api/public/integrations/jiofarm/links` — kirim satu atau banyak link sekaligus; menolak duplikat, mencatat sumber, langsung memicu pemenuhan antrean.
- `GET /api/public/integrations/jiofarm/demand` — mengembalikan jumlah pesanan menunggu + stok tersedia, supaya JioFarm tahu kapan harus berburu dan kapan berhenti.

Keduanya memvalidasi isi kiriman, menolak token salah, dan tidak pernah membocorkan data pembeli.

### Tampilan pembeli
- Halaman detail pesanan: kartu khusus berisi link redeem, tombol salin, tombol buka, dan petunjuk penukaran; menggantikan tombol unduh untuk produk mode `code`.
- Saat stok kosong: kartu "Sedang disiapkan otomatis" dengan indikator proses, bukan halaman kosong.
- Notifikasi saat link siap.

### Tampilan admin
- Panel stok link di halaman produk: jumlah tersedia/terkunci/terkirim, tambah link manual, hapus link rusak.
- Halaman antrean "Menunggu stok" agar Anda tahu berapa pesanan yang menunggu.
- Tombol untuk membuat dan mengganti token JioFarm.

### Sisi JioFarm
Skrip pengirim kecil (`docs/integrations/jiofarm-hook.md` + contoh Python) yang tinggal Anda tempel ke JioFarm: setiap kali link ditemukan, kirim ke Ebrystore. Tidak perlu mengubah logika hunting-nya.

## Catatan penting

- Perlu satu token rahasia baru yang Anda simpan juga di sisi JioFarm.
- Kalau JioFarm mati atau tidak dapat link, pesanan tetap menunggu — admin bisa menambah link manual atau membatalkan/refund.
- Link redeem punya masa berlaku; stok yang kedaluwarsa otomatis ditandai dan tidak akan dikirim ke pembeli.
