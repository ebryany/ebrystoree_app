# Laporan — Alignment Card Produk Digital vs Card Jasa Seller

Tanggal: 2026-10-23 · Mode: Inspect → Root Cause → Implement → Verify
File diubah: **1** (`src/routes/index.tsx`) · Build: sukses · Lint: 0 error

---

## 1. Akar Penyebab (terbukti dari kode)

Kedua section memakai **sistem layout berbeda**, bukan sekadar beda padding.

| Aspek | Card Jasa | Card Produk (sebelum) |
|---|---|---|
| Container | `flex flex-wrap justify-center gap-4` | `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` |
| Lebar kartu | **tetap** `sm:w-[272px]` | **mengisi kolom** (hingga 344px di 1440px) |
| Posisi saat item < kolom | terpusat (`justify-center`) | menempel kiri (grid mengisi dari kolom pertama) |

**Dua akibat langsung:**

1. **Kartu membesar.** `grid-cols-4` di container 1361px → tiap kolom 344px, sedangkan kartu jasa tetap 272px. Selisih 26%.
2. **Grup menempel kiri.** Dengan 2 item di grid 4 kolom, hanya 2 kolom pertama terisi; sisanya kosong di kanan.

Ini masalah **arsitektur layout**, bukan margin atau padding.

---

## 2. Perubahan

Satu file: `src/routes/index.tsx` — fungsi `ProductsSection`.

### Mode grid (≤ 4 item)
```diff
- <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
-   <li className="min-w-0">
+ <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
+   <div className="w-[calc(50%-0.375rem)] sm:w-[272px]">
```
Sekarang identik dengan `SellerServicesSection`: `flex-wrap` + `justify-center` + lebar tetap 272px.

### Mode carousel (> 4 item)
```diff
- className="basis-[calc(50%-0.375rem)] pl-3 sm:basis-[calc(33.333%-0.667rem)] sm:pl-4 lg:basis-1/4"
+ className="basis-[calc(50%-0.375rem)] pl-3 sm:basis-[288px] sm:pl-4"
```
`288px = 272px kartu + 16px padding kiri`, sehingga lebar kartu di carousel juga 272px — sama dengan kartu jasa, bukan lagi 1/4 viewport.

---

## 3. Hasil Verifikasi (runtime, bukan klaim)

Diukur langsung di browser dengan 2 produk nyata.

### Desktop — kedua section sekarang **identik**

| Viewport | Section | Lebar kartu | Grup kiri–kanan | Grup lebar | Offset dari tengah | Overflow X |
|---|---|---|---:|---:|---:|---:|
| 1280 | Jasa | 272px | 353–913 | 560px | **0** | 0 |
| 1280 | Produk | 272px | 353–913 | 560px | **0** | 0 |
| 1440 | Jasa | 272px | 433–993 | 560px | **0** | 0 |
| 1440 | Produk | 272px | 433–993 | 560px | **0** | 0 |
| 1920 | Jasa | 272px | 673–1233 | 560px | **0** | 0 |
| 1920 | Produk | 272px | 673–1233 | 560px | **0** | 0 |

Sebelum perbaikan, kartu produk 344px dan grup menempel di kiri container.

### Mobile & tablet

| Viewport | Kartu 1 | Kartu 2 | Overflow X | CTA Keranjang | CTA Beli |
|---|---|---|---|---|---|
| 360 | 151px @ x16 | 151px @ x179 | 0 | 2 | 2 |
| 390 | 166px @ x16 | 166px @ x194 | 0 | 2 | 2 |
| 768 | 272px @ x97 | 272px @ x385 | 0 | 2 | 2 |

Pada 768px kedua kartu terpusat (97px dan 385px, simetris terhadap 753px).

### Functional regression
- `Tambah ke Keranjang`: **2 tombol hadir** di semua viewport
- `Beli Langsung`: **2 tautan** ke `/checkout/produk/$slug`
- Tidak ada perubahan pada navbar, hero, atau kartu jasa

---

## 4. Yang Tidak Diubah

- `SellerServiceCard` — tidak disentuh sama sekali
- Navbar dan hero — tidak disentuh
- Cart store dan server functions — tidak disentuh
- Database, harga, stok — tidak disentuh
- Tidak ada komponen baru

---

## 5. Catatan & Sisa Masalah

**Dua tautan judul produk setinggi 18px** (di bawah target 44px). Ini **pre-existing** dan
bukan regresi dari perubahan ini: seluruh kartu memakai stretched-link (`after:inset-0`),
sehingga area klik efektif jauh lebih besar dari bounding box tautannya.

**11 test gagal** di `src/components/home/` — baseline yang sama seperti sebelum perubahan
(soal teks "Toko resmi"/"Brief pembeli" yang sudah tidak dirender). Tidak bertambah oleh
perubahan ini; sebelumnya 12, sekarang 11.

**Belum diverifikasi:** tampilan dengan >4 produk (mode carousel). Dataset saat ini hanya
2 produk, jadi jalur carousel belum pernah dirender dengan data nyata. Perubahannya
matematis (`288px` = `272px + 16px`), tetapi belum dibuktikan secara visual.
