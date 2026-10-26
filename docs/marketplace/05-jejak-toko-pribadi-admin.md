# 05 — Inventarisasi Jejak "Toko Pribadi" di Dashboard Admin & Wujudnya di Marketplace

Tanggal: 2026-10-02 · Sifat: **RISET + USAULAN, BUKAN EKSEKUSI**
Pertanyaan: apa saja di dashboard admin yang masih berpikir "single-vendor" (warisan
toko online pribadi), dan apa wujudnya kalau disesuaikan ke marketplace?

Metode: baca rute admin satu per satu + definisi RPC-nya. Status per item: `VERIFIED`
(bukti file:baris) atau diberi tanda keputusan bila butuh Owner.

---

## A. Temuan: Jejak Single-Vendor

### A-1. "Kelola Produk Digital" mengelola SEMUA produk — `VERIFIED`

- Sekarang: `admin/produk.tsx` berjudul "Produk digital — Kelola katalog produk digital
  termasuk draft yang belum terbit" dengan CRUD penuh (`saveProduct`,
  `products.create/update/delete`). Tidak ada pemisahan produk platform vs produk seller
  di judul/scope halaman — padahal kini katalog berisi produk seller juga.
- Risiko: admin mengedit produk seller langsung lewat form yang sama; secara semantik
  ini menerobos batas "produk seller milik seller" (admin punya kuasa moderasi, bukan
  kuasa menulis ulang katalog seller).
- **Jadi di marketplace:** halaman ini direname & dipersempit jadi **"Produk Platform
  Store"** (hanya `store_id IS NULL`/platform store), berdampingan dengan **"Moderasi
  Produk Seller"** yang sudah ada (`admin/seller.produk.tsx`). Edit seller tetap lewat
  moderasi, bukan form produk umum. `OWNER_DECISION_REQUIRED` (ringan): apakah admin
  boleh edit produk seller dalam kondisi tertentu (mis. konten melanggar hukum).

### A-2. Setting `admin_fee` — warisan biaya toko pribadi — `VERIFIED`

- Sekarang: "Pengaturan Transaksi → Batas waktu & biaya → `admin_fee`" (flat, ditambahkan
  ke total pembeli di `create_digital_order`: `v_fee := setting_int('admin_fee', 0)`).
  Ini konsep toko pribadi: "surcharge ke pembeli".
- Model marketplace: platform mengambil **fee dari pendapatan seller** (deduct dari
  ledger), bukan menaikkan harga pembeli. Dua konsep beda arah alirannya.
- **Jadi di marketplace:** grup setting baru **"Marketplace"** di Pengaturan Transaksi:
  `marketplace_fee_percent` (draft Owner 3%), `withdrawal_fee` (draft Rp10.000),
  `payout_hold_days` (draft 3). `admin_fee` lama tetap dipakai untuk produk platform
  atau di-retire — `OWNER_DECISION_REQUIRED` (O-01 finalisasi).

### A-3. Dashboard admin: "Ringkasan transaksi" berpikir "pendapatan kita" — `VERIFIED`

- Sekarang: `admin/index.tsx` menampilkan Nilai pesanan dibayar / Pesanan masuk /
  Setelah refund / Rasio dibayar. Semuanya metrik single-vendor: tidak ada dimensi
  "milik siapa uang ini". RPC `admin_marketplace_overview` sudah menghitung `gmv`,
  jumlah toko, produk pending — **tapi tidak ditampilkan di dashboard**, hanya di
  halaman Seller.
- **Jadi di marketplace:** dashboard memecah dua lapis: **GMV** (nilai barang terjual
  semua seller) vs **Pendapatan platform** (fee 3% + fee penarikan), plus **kewajiban
  payout** (saldo hold yang harus dibayar seller) dan antrean khas marketplace
  (pendaftaran seller pending, produk pending moderasi — sebagian sudah ada di
  `admin_marketplace_overview`, tinggal diangkat ke dashboard).

### A-4. "Laporan" transaksi tanpa dimensi seller — `VERIFIED`

- Sekarang: `admin/reports.tsx` (baru di-redesign) memproyeksikan pendapatan platform
  secara agregat; tidak ada GMV per seller / fee earned / payout due. Laporan
  marketplace terpisah di "Laporan Marketplace" (`admin/seller.laporan.tsx`, sudah
  bagus: per-seller sales, rating, ledger).
- **Jadi di marketplace:** laporan transaksi menambah baris atas: GMV → potong fee →
  kewajiban seller. (Tunggu fee engine aktif; sekarang fee=0, angkanya sama.)

### A-5. Order/Payment/Refund tanpa kolom toko — `VERIFIED` (ringan)

- Sekarang: tabel admin orders/payments tidak menampilkan seller (data snapshot toko
  ada di `order_items`, hanya belum diproyeksikan).
- **Jadi di marketplace:** kolom "Toko" di daftar order/pembayaran/refund + filter per
  toko. Kecil, tapi ini yang membuat admin percaya diri menjawab "pesanan ini milik
  seller siapa" saat ada dispute.

### A-6. "Pengerjaan Jasa" & "PO Custom" — BUKAN legacy, dipertahankan — `VERIFIED`

- Layanan akademik/jasa dijalankan operator platform (keputusan M-11: layanan legacy
  dipisah, tidak di-seller-kan). Di marketplace cukup diberi label jelas
  **"Layanan Platform"** supaya tidak tertukar dengan penjualan produk seller.

### A-7. Yang sudah benar (tidak perlu diubah)

- Navigasi sudah punya grup "Marketplace" (Seller / Moderasi / Laporan Marketplace) —
  `VERIFIED`.
- Seller admin pages sudah menampilkan badge `is_platform` — `VERIFIED`
  (`seller.index.tsx:203`, `seller.$id.tsx:362`).
- Produk legacy sudah di-backfill ke platform store (`20260930100013`).
- Pembayaran tetap platform sebagai penerima (held-funds, M-06) — konsep ini benar
  untuk marketplace, tidak perlu diubah.

## B. Urutan Usulan Perbaikan

| # | Item | Effort | Prasyarat |
|---|---|---|---|
| 1 | A-1 rename + scope "Produk Platform Store" | Kecil (UI + filter query) | Tidak ada |
| 2 | A-5 kolom "Toko" di orders/payments/refunds | Kecil | Tidak ada |
| 3 | A-3 dashboard: GMV vs fee vs payout + antrean marketplace | Sedang | Fee engine (P0-C peta 04) untuk angka fee/payout |
| 4 | A-2 grup setting "Marketplace" | Sedang | Finalisasi O-01/O-03/O-04 |
| 5 | A-4 laporan: baris GMV → fee → kewajiban | Sedang | Fee engine |
| 6 | A-6 label "Layanan Platform" | Trivial | Tidak ada |

Item 1, 2, 6 bisa dikerjakan **sekarang tanpa menunggu apa pun**; item 3, 4, 5 menggantung
pada engine fee & keputusan O-01..O-04.

## Batasan

Semua temuan dari baca kode (file:baris tercantum); tidak ada pengujian runtime. Scope
halaman admin yang tidak disebut (artikel, jobs, audit, izin) sudah diperiksa sekilas dan
tidak mengandung asumsi single-vendor yang berarti.
