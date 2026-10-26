# Riset & Kesimpulan — Redesain Dashboard User Gaya Perbankan Mobile

Tanggal: 2026-09-30 · Konteks: Ebrystore (produk digital + jasa akademik)

> **Catatan metode:** WebSearch/WebFetch tidak tersedia di lingkungan ini, jadi riset ini berbasis **pengetahuan pola desain aplikasi perbankan yang sudah mapan** + **analisis langsung kode & data Ebrystore**. Bukan hasil browsing real-time. Semua rekomendasi sudah dipetakan ke fitur nyata yang ada di `getCustomerSummary`.

---

## 1. Hasil Riset: Anatomi Dashboard Bank Mobile

Aplikasi bank mobile (BCA, Jago, Blu, SeaBank, Livin', jenius, dan padanan global seperti Revolut, N26, Monzo) punya **anatomi yang sangat konsisten**. Urutan dari atas ke bawah:

```
┌─────────────────────────────────────────────┐
│  [Header berwarna]                          │  ← A. HEADER
│  Avatar · "Halo, Nama"           [🔔] [⚙]  │     Warna brand solid/gradient
│  (kadang: nama bank/logo)                   │     Teks putih
├─────────────────────────────────────────────┤
│  ╔═══════════════════════════════════════╗  │  ← B. KARTU UTAMA (hero)
│  ║  [label kecil]                        ║  │     Kartu besar menonjol
│  ║  ANGKA BESAR                           ║  │     Warnai/gradient
│  ║  sub-info · [aksi]                     ║  │     = "saldo" versi bank
│  ╚═══════════════════════════════════════╝  │     Paling menonjol di layar
├─────────────────────────────────────────────┤
│   ⬤      ⬤      ⬤      ⬤                  │  ← C. MENU AKSI
│  Top Up  Bayar  Transfer  Tarik             │     IKON BULAT (circle)
│                                             │     4 kolom grid
│  (kadang 2 baris = 8 aksi)                  │     Label di bawah ikon
├─────────────────────────────────────────────┤
│  Promo / Banner                             │  ← D. BANNER (opsional)
│  ┌───────────────────────────────────────┐  │     Kartu berwarna
│  └───────────────────────────────────────┘  │
├─────────────────────────────────────────────┤
│  Transaksi terakhir          Lihat semua →  │  ← E. LIST TRANSAKSI
│  ⬤ Nama transaksi        Rp 100.000        │     Ikon bulat + nama
│  ⬤ Nama transaksi        +Rp 50.000        │     + nominal (kanan)
│  ⬤ Nama transaksi        Rp 25.000         │     Warna: keluar/masuk
├─────────────────────────────────────────────┤
│  [Beranda] [Transaksi] [QRIS] [Akun]        │  ← F. BOTTOM NAV
└─────────────────────────────────────────────┘
```

### 6 elemen kunci (yang wajib ada untuk "rasa bank")

| # | Elemen | Karakteristik | Kenapa penting |
|---|---|---|---|
| **A** | Header berwarna | Solid/gradient, teks putih, avatar + sapaan + 2 ikon aksi | Identitas & kehangatan; membedakan dari halaman biasa |
| **B** | Kartu utama menonjol | Kartu besar, angka/judul besar, sedikit warna | **Titik fokus** — mata langsung ke sini |
| **C** | Menu aksi ikon bulat | Grid 4 kolom, ikon dalam lingkaran, label 12px | Bahasa universal bank |
| **D** | Banner promo | Kartu berwarna, bisa digeser | CTA/penawaran |
| **E** | List transaksi | Ikon bulat + judul + waktu + nominal kanan | Riwayat/aktivitas |
| **F** | Bottom nav | 4-5 tab ikon+label | Navigasi utama |

### Prinsip rasa "bank" (yang membuat beda dari marketplace)

1. **Header berwarna** — bukan putih polos. Bank selalu punya warna brand di atas.
2. **Satu kartu "hero"** — kartu saldo adalah bintang halaman; semua lain lebih kecil.
3. **Ikon bulat** — menu bank selalu ikon dalam lingkaran (bukan kotak/persegi).
4. **Nominal di kanan** — list transaksi selalu nominal rata kanan, tegas.
5. **Tenang & lega** — sedikit warna, banyak ruang, hierarki jelas.
6. **Info utama = angka** — bank menonjolkan *angka* (saldo), bukan teks.

---

## 2. Pemetaan: Fitur Ebrystore → Elemen Bank

Kunci redesain: **menerjemahkan "saldo" menjadi konteks produk digital.**

| Elemen Bank | Padanan Ebrystore | Sumber data (sudah ada) |
|---|---|---|
| **Saldo** | Kartu **"Ringkasan Aktivitas"** — pesanan aktif / perlu bayar / produk dimiliki | `activeOrders`, `awaitingPayment`, `entitlements` |
| Top Up / Transfer | Menu: **Produk Digital, Pesan Jasa, PO Custom, Chat** | route |
| Bayar / Tagihan | **Kartu "Perlu dibayar"** (jika ada) = tagihan menunggu | `awaitingPayment` |
| Riwayat transaksi | **List "Pesanan terakhir"** (ikon + nama + nominal kanan) | `recentOrders[{order_number, status, total, created_at, order_items}]` |
| Notifikasi | **List "Aktivitas"** (feed ringkas) | `notifications[{title, message, created_at, read_at}]` |
| Promo banner | **Banner jasa akademik / produk unggulan** | (opsional, statis) |
| Kartu kredit | **Kartu "Produk saya"** — akses unduhan | `entitlements` |
| Poin/reward | **Statistik kecil**: selesai, refund | `completedOrders`, `activeRefunds` |

**Semua data ini SUDAH tersedia** dari `getCustomerSummary` — **nol perubahan backend**.

---

## 3. Kesimpulan: Rekomendasi Desain

### 3.1 Struktur Halaman (urutan final)

```
┌───────────────────────────────────────────────┐
│ A. HEADER GRADIENT TEAL                       │  ← Anda pilih: gradient teal
│    [Avatar] Halo, Admin 👋         [🔔]        │     Teks putih
│    "Ada 2 hal menunggu" / "Semua aman"         │
├───────────────────────────────────────────────┤
│ B. KARTU HERO (kartu aktivitas)               │  ← BINTANG halaman
│    ┌─────────────────────────────────────┐    │     Kartu besar, gradient/berwarna
│    │  Ringkasan akunmu                    │    │     Angka besar
│    │  [2]      [1]       [3]              │    │     3 angka: aktif/bayar/produk
│    │  Aktif   Bayar   Dimiliki             │    │
│    └─────────────────────────────────────┘    │
├───────────────────────────────────────────────┤
│ C. MENU AKSI (ikon bulat, 4 kolom × 2)        │  ← IKON BULAT
│    ⬤        ⬤        ⬤        ⬤              │     8 menu
│  Produk   Jasa     Pesanan  Produk Saya       │
│    ⬤        ⬤        ⬤        ⬤              │
│  PO      Chat    Notifikasi Bantuan           │
├───────────────────────────────────────────────┤
│ D. PERLU TINDAKAN (jika ada) — banner alert   │
├───────────────────────────────────────────────┤
│ E. PESANAN TERAKHIR          Lihat semua →    │  ← LIST ala transaksi bank
│    ⬤ Pesanan #EBS-...      Rp 150.000         │     Ikon bulat + nominal kanan
│    ⬤ Pesanan #EBS-...      Rp 99.000          │
├───────────────────────────────────────────────┤
│ F. AKTIVITAS TERBARU         Lihat semua →    │
│    ⬤ Judul notifikasi      waktu              │
└───────────────────────────────────────────────┘
   [Beranda][Pesanan][Produk][Notif][Akun]        ← bottom nav (sudah ada)
```

### 3.2 Keputusan desain konkret

| Aspek | Keputusan | Alasan |
|---|---|---|
| **Header** | Gradient teal (`--gradient-hero`), teks putih, sudut bawah membulat | Sesuai pilihan Anda; rasa bank |
| **Kartu hero** | Kartu besar gelap/gradient, 3 angka dominan | Ini "saldo" versi Ebrystore — titik fokus |
| **Menu** | Ikon dalam **lingkaran** (`rounded-full`), bukan kotak | Bahasa visual bank |
| **List pesanan** | Ikon bulat kiri + judul + waktu + **nominal kanan** | Pola list transaksi bank |
| **List aktivitas** | Sama: ikon bulat + teks + waktu | Konsisten |
| **Warna** | Header/kartu berwarna; list di kartu putih | Kontras jelas, rasa bank |
| **Radius** | Konsisten `rounded-2xl`; ikon `rounded-full` | Rapi |
| **Kepadatan** | Lega (bukan padat marketplace) | Kontras dengan versi sebelumnya |

### 3.3 Perbandingan 3 pendekatan

| Aspek | Marketplace padat (sebelumnya) | **Bank mobile (usulan)** |
|---|---|---|
| Header | Putih polos | **Gradient teal berwarna** |
| Fokus | Semua rata | **Kartu hero menonjol** |
| Ikon menu | Kotak | **Bulat** |
| Kepadatan | Padat | **Lega, tenang** |
| Kesan | Katalog/etalase | **Aplikasi pribadi & tepercaya** |
| Cocok untuk | Belanja | **Akun pribadi, pesanan, status** |

**Kesimpulan:** untuk **dashboard akun pribadi**, gaya bank **lebih cocok** daripada marketplace — karena isinya bukan katalog, tapi **status & aktivitas pribadi user** (pesanan, pembayaran, produk dimiliki).

---

## 4. Yang saya butuh sebelum eksekusi

Saya sudah siap kerjakan. Tapi 3 hal perlu keputusan Anda:

1. **Kartu hero isi apa?**
   - Kartu 3 angka (aktif/bayar/dimiliki) — *rekomendasi saya*
   - Kartu 1 angka besar (mis. total pesanan) + sub-info
   - Kombinasi: 1 angka besar + 2 kecil

2. **Banner "Perlu dibayar"** — kalau ada tagihan, tampilkan sebagai **kartu banner berwarna** (ala bank "tagihan jatuh tempo") di bawah header? *(rekomendasi: ya)*

3. **Bottom nav** — sudah ada 5 tab (Beranda/Pesanan/Produk/Notif/Akun). Bank biasanya punya tab tengah aksi (mis. QRIS). Mau tambah tab tengah "Katalog"? Atau biarkan 5 tab?

---

*Dokumen ini akan saya pakai sebagai acuan eksekusi. Kalau ada yang ingin diubah dari kesimpulan ini, beri tahu sebelum saya mulai.*
