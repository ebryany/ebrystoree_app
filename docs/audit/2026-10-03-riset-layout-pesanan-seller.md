# Riset layout halaman pesanan toko (seller/pesanan)

Tanggal: 2026-10-03. Tujuan: memperbaiki UI/UX `/seller/pesanan` yang membingungkan pengguna. Metode: audit halaman + komponen yang dipakai, pemetaan data yang benar-benar tersedia, dan pola halaman pesanan seller pada marketplace umum (Shopee/Tokopedia seller center). Tidak ada pengujian browser.

## 1. Fakta halaman sekarang

- Halaman memuat **dua blok list dengan tiga sistem filter sekaligus**:
  1. `OrderMonitoringList` (komponen admin-grade) dengan dropdown filternya sendiri: "Dalam antrean / Pengiriman belum siap / Menunggu penerimaan / Refund aktif / Semua pesanan digital".
  2. `SegmentedFilter` segmented all/paid/pending.
  3. Section ketiga "Pesanan masuk" berisi baris item.
- Dua list menampilkan data order yang sama dari sudut berbeda (antrean monitoring vs baris item) tanpa penjelasan hubungannya; seller tidak tahu mana yang harus dibaca.
- Baris "Pesanan masuk" berlevel item (satu order bisa muncul beberapa baris), tanpa status penerimaan/dana, tanpa tindakan, dan tidak menuju halaman detail apa pun (route detail pesanan seller memang belum ada).
- Widget monitoring menampilkan tabel dana (item_total, held_receipt, released_total, refund_reserved, refunded_total) selalu terbuka untuk semua pesanan; informasi finansial padat ini menutupi pertanyaan utama seller.
- Kosong/muat: satu teks sederhana; tidak ada skeleton; tidak ada petunjuk tindakan.
- Filter "paid/pending" memakai kosakata berbeda dari label monitoring (antrean) dan dari status order — tiga kosakata untuk satu halaman.

## 2. Kenapa membingungkan (analisa UX)

Pertanyaan utama seller pesanan digital hanya tiga: (1) apa yang perlu saya kerjakan sekarang, (2) pesanan ini sudah diterima pembeli atau masih ditahan, (3) ada masalah (file belum siap / refund) tidak. Halaman sekarang tidak menjawab pertanyaan itu di urutan pertama; ia memaksa seller memahami dua model mental berbeda (antrean ops vs transaksi) dan tiga kosakata filter. Prinsip marketplace umum: satu layar = satu keputusan, status sebagai tab dengan jumlah, satu kartu per pesanan, tindakan utama terlihat.

## 3. Pola halaman pesanan seller pada marketplace umum

- Tab status di atas dengan jumlah per status (Shopee seller: Belum Bayar, Perlu Diproses, Dikirim, Selesai...), tab aktif diberi indikator.
- Satu kartu per pesanan: kepala (nomor + waktu + status), isi (produk), kaki (total + tombol aksi utama).
- Detail finansial/detail lengkap disembunyikan di belakang ekspansi, bukan selalu terbuka.
- State kosong menjelaskan kabar baik atau tindakan berikutnya.

## 4. Data yang tersedia (tanpa perubahan backend)

`list_order_monitoring` (RPC existing, scope seller) sudah menyediakan segalanya untuk kartu per pesanan: `order_number`, `order_status`, `paid_at`, `queue` (delivery_blocked/awaiting_receipt/refund_active/other), `receipt_status` + `accepted_at`, `waiting_since`, `items[]` (name, ready, product_id), `funds[]` (held_receipt, released_total, refund_reserved, refunded_total, released_at), `refunds[]`, plus `counts` (delivery_blocked, awaiting_receipt, refund_active), `total`, halaman 15. Jadi desain baru bisa dibangun single-source tanpa SQL baru.

## 5. Layout terpilih (spesifikasi)

```
+------------------------------------------------------------------+
| Pesanan toko                     [Muat ulang]                    |
| Tab:  Perlu tindakan(2)  Menunggu penerimaan(1)  Refund(0)  Semua |
|        ---------------------------------------------------       |
| +--------------------------------------------------------------+ |
| | EBS-2403-xxxx  · 3 Okt 2025            [Menunggu konfirmasi] | |
| | Perlu tindakan: produk belum siap diakses (14 jam)           | |
| |  Template CV  [Belum siap]  -> Kelola produk                  | |
| | Ditahan Rp 50.000 · Dilepas Rp 0              [Rincian dana]  | |
| +--------------------------------------------------------------+ |
| +--------------------------------------------------------------+ |
| | EBS-2403-yyyy  ...                                           | |
| +--------------------------------------------------------------+ |
| Halaman 1 dari 2                          [Sebelumnya][Berikutnya]|
+------------------------------------------------------------------+
```

- Tab = antrean nyata dari data (Perlu tindakan = delivery_blocked; Menunggu penerimaan = awaiting_receipt; Refund aktif; Semua), jumlah angka nyata dari `counts` dengan animasi count-up existing; default tab "Perlu tindakan" karena itu pekerjaan seller.
- Satu kartu per pesanan: kepala (nomor, tanggal bayar, pill status order), baris antrean (status + umur tunggu), item dengan chip "Siap diakses/Belum siap" + tautan Kelola produk saat belum siap, ringkasan dana satu baris, chip refund bila ada.
- "Rincian dana" menjadi ekspansi (accordion) — detail finansial penuh tetap tersedia tapi tidak menutupi daftar.
- Hapus duplikasi: blok monitoring terpisah dan list item "Pesanan masuk" digabung menjadi satu sumber kebenaran; segmen all/paid/pending dilepas (kosakata status order tetap terlihat lewat pill di kartu).
- Paginasi dan realtime refresh tetap (notifikasi seller sebagai pemicu).

## 6. Pemetaan library dan animasi

- Library animasi: **motion** (terpasang 13.5) yang dipakai repo (`motion/react`), mengikuti aturan DESIGN.md: fade/translate ≤200ms, CountUp pada angka, hormati `prefers-reduced-motion`. Tidak ada library baru, tidak ada uiverse/transitions.dev (tidak lolos purpose test).
- Pola yang dipindahkan (port pola motion-primitives/ui-layouts ke token Ebrystore, bukan tempel mentah):
  - Tab indikator beranimasi (`layoutId`) untuk underline tab aktif.
  - Stagger masuk kartu (fade + translateY 8px, 40ms antar kartu) dan `AnimatePresence` saat pindah tab.
  - Accordion tinggi beranimasi untuk "Rincian dana".
  - `CountUp` existing (components/admin/report-widgets.tsx) untuk angka tab.
- Semua animasi mati (durasi 0) saat reduced-motion.

## Referensi pembanding

- [Tokopedia Seller: mengelola pesanan](https://seller-id.tokopedia.com/university/essay?knowledge_id=5893829518083841) (segmentasi status pesanan seller)
- [Shopee Seller: Webchat/antrean](https://seller.id.shopee.cn/webchat) (pola tab status dengan jumlah)
