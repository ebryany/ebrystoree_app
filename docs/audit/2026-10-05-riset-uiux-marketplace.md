# Riset: UI/UX Marketplace Ebrystore & Sistem Desain Baru

Tanggal: 2026-10-05 · Status: **RISET SELESAI — MENUNGGU KEPUTUSAN OWNER**
Cakupan: sistem desain baru + komponen marketplace + aturan tata letak.

---

## 0. Catatan metode (jujur)

| Sumber | Status | Catatan |
|---|---|---|
| NN/g "Cards: UI-Component Definition" | `VERIFIED` | Artikel terbaca lengkap, kutipan diambil langsung |
| Prinsip e-commerce mapan (Baymard, NN/g lain) | `PARTIALLY_VERIFIED` | Dari pengetahuan umum, tidak diverifikasi ulang di sesi ini |
| Pengukuran halaman Ebrystore | `VERIFIED` | Dari sesi sebelumnya (tinggi section, lebar, target sentuh) |
| Pembacaan kode komponen | `VERIFIED` | `catalog-cards.tsx`, `seller-service-card.tsx`, `index.tsx` |
| Angka konversi / A-B test | `NOT_MEASURED` | Belum ada data |

**Pembatasan:** riset web lanjutan tidak dilakukan karena browser tidak boleh dijalankan
(arahan Owner). Temuan dari NN/g di bawah adalah kutipan langsung artikel yang sudah
terbaca; selebihnya prinsip yang berlaku umum di e-commerce, ditandai statusnya.

---

## 1. Temuan riset NN/g: kartu (kutipan langsung)

### 1.1 Empat properti kartu

**1. Kartu mengelompokkan informasi.** Satu kartu memuat beberapa jenis informasi
terkait (gambar, judul, ringkasan, tombol) untuk satu konsep.

**2. Kartu merangkum dan menautkan ke detail.** Kutipan:
> *"A card is usually short and offers a linked entry point to further details, rather
> than the full details themselves. It is intended as a high-information-scent outline
> used to entice users to click through."*

**3. Kartu menyerupai kartu fisik.** Kutipan:
> *"Cards use a border around the grouped content, and the background color within the
> card that differs from background color of the underlying canvas. [...] Quite often,
> cards use a slight drop shadow to show depth, which is a clickability signifier. For
> most implementations, clicking or tapping anywhere on the card link to a details page
> [...] This larger touch zone substantially improves usability on both touchscreen
> devices and mouse-based devices (due to Fitts' Law)."*

**4. Kartu mendukung tata letak fleksibel.** Kutipan:
> *"Cards allow for varying height to accommodate differing amounts or types of content,
> but typically the width is fixed from one card to the next."*

### 1.2 Kapan kartu LEBIH BAIK dari daftar

Kutipan:
> *"Cards are better suited when users browse for information than when they search."*

Kartu cocok saat pengunjung **menjelajah** tanpa target spesifik.

### 1.3 Kapan kartu LEBIH BURUK dari daftar — ini penting

Kutipan:
> *"Card layouts typically deemphasize the ranking of content."*

> *"Card layouts are less scannable than lists. A standard vertical list view [...] is
> more scannable than cards because the positioning of the individual elements is fixed
> in size and more predictable for the eye. Thus, cards are not appropriate when users
> search for a specific item from a list."*

> *"Cards take more space. Because cards are bigger than a line of text, any given screen
> size can't show as many cards in a single view as would be possible in a list view. The
> more things are viewable without scrolling, the less demand is placed on users'
> short-term memory."*

### 1.4 Temuan eyetracking: kartu menyulitkan perbandingan

Kutipan:
> *"Cards are also a poor choice when users need to compare between multiple options,
> since cards often aren't structured in a predictable way from item to item; our
> eyetracking research revealed that users look back and forth multiple times between
> items when they compare them, so you should facilitate this process by using a
> consistent visual treatment of items that will be compared."*

> *"Scanning products in a card-based list is challenging to quickly find basic
> information such as price, since the layout is not predictably arranged, and a user
> can't easily anticipate where to look on the page to find that information."*

**Konsekuensi untuk Ebrystore:** harga HARUS berada di posisi yang sama persis di setiap
kartu. Ini bukan preferensi estetika, ini temuan eyetracking.

### 1.5 Prinsip common regions

Kutipan:
> *"Multiple items contained together within a boundary are more likely to be perceived
> as being grouped. This principle can supersede the powerful Gestalt law of proximity."*

Artinya: border dan latar kartu adalah alat pengelompokan, bukan hiasan. Kartu tanpa
border yang jelas akan terbaca sebagai elemen lepas.

---

## 2. Kondisi UI marketplace sekarang (terukur)

### 2.1 Masalah yang sudah terverifikasi

| # | Masalah | Bukti | Sumber temuan |
|---|---|---|---|
| M-1 | Harga di posisi berbeda antar kartu | Kartu produk: harga di bawah; kartu jasa: harga di atas | Baca kode |
| M-2 | Nama produk duplikat tidak terbedakan | 2 produk, keduanya bernama "template" | Query DB |
| M-3 | Kartu tanpa gambar hanya ikon + teks | `catalog-cards.tsx`: ikon `Download` + "Produk digital" | Baca kode |
| M-4 | Kartu produk & kartu jasa punya bahasa berbeda | Produk: border-t di harga. Jasa: harga di header + accordion | Baca kode |
| M-5 | Kartu jasa lebih tinggi dari kartu produk | Jasa punya accordion "Lihat kesepakatan" | Baca kode |
| M-6 | Badge diskon "Diskon 90%" panjang | Mengambil ruang lebar, teks lebih panjang dari "-90%" | Baca kode |
| M-7 | Tidak ada indikator jenis di kartu produk | Kartu jasa punya label kategori, kartu produk tidak | Baca kode |
| M-8 | Grid kategori dihapus, section hilang | Owner minta dihapus karena berat | Arahan Owner |
| M-9 | 13 kategori jasa hanya muncul di halaman `/layanan` | Halaman home tidak punya jalan masuk kategori | Baca kode |

### 2.2 Masalah yang bertentangan dengan temuan NN/g

| # | Masalah | Aturan NN/g yang dilanggar |
|---|---|---|
| X-1 | Harga tidak di posisi konsisten | §1.4 — harga harus di posisi yang bisa diprediksi |
| X-2 | Kartu produk & jasa tidak seragam strukturnya | §1.4 — perbandingan butuh perlakuan visual konsisten |
| X-3 | Tanpa gambar, kartu kehilangan identitas visual | §1.1 no.3 — border/latar adalah penanda keterkelompokan |
| X-4 | Kartu jasa terlalu banyak informasi | §1.1 no.2 — kartu harus ringkas, detail di halaman terpisah |

---

## 3. Sistem desain baru

Prinsip: **satu bahasa untuk semua kartu.** Kartu produk, kartu jasa, kartu kategori, dan
kartu toko memakai kerangka yang sama supaya bisa dibandingkan.

### 3.1 Anatomi kartu (5 zona tetap)

```
┌─────────────────────────────┐
│  ZONA 1 — MEDIA             │  rasio tetap, tinggi sama semua
│  (gambar / inisial / ikon)  │
├─────────────────────────────┤
│  ZONA 2 — IDENTITAS         │  judul (2 baris maks) + deskripsi (1 baris)
├─────────────────────────────┤
│  ZONA 3 — META              │  toko · jenis · durasi (satu baris)
├─────────────────────────────┤
│  ZONA 4 — HARGA             │  SELALU di posisi ini, semua kartu
├─────────────────────────────┤
│  ZONA 5 — AKSI              │  tombol (kartu jasa) atau stretched-link
└─────────────────────────────┘
```

**Aturan mutlak:** ZONA 4 (harga) selalu berada tepat di atas ZONA 5, dengan tinggi blok
yang sama di semua kartu. Ini menjawab temuan §1.4.

### 3.2 Skala ukuran (token baru)

| Token | Nilai | Dipakai untuk |
|---|---|---|
| `--card-media-ratio` | `3 / 2` | Rasio media kartu produk |
| `--card-media-ratio-service` | `16 / 9` | Rasio media kartu jasa |
| `--card-radius` | `0.75rem` | Radius semua kartu |
| `--card-pad` | `0.875rem` | Padding isi kartu |
| `--card-gap` | `0.75rem` | Jarak antar kartu di grid |
| `--card-title-lines` | `2` | Maksimum baris judul |
| `--price-size` | `1.125rem` | Ukuran harga (semua kartu) |
| `--price-weight` | `700` | Berat harga |

### 3.3 Warna peran (bukan warna baru)

| Peran | Token | Aturan pemakaian |
|---|---|---|
| Permukaan kartu | `bg-card` | Selalu putih |
| Latar media | `bg-surface-selected` | Saat gambar kosong |
| Harga | `text-price` | Hanya untuk harga |
| Diskon | `bg-accent` + `text-accent-foreground` | Pil pendek `-90%` |
| Toko resmi | `text-accent` | Ikon kecil saja |
| Aksi utama | `bg-primary` | Tombol pesan |

### 3.4 Tipografi kartu

| Elemen | Ukuran | Berat | Catatan |
|---|---|---|---|
| Judul | 14-15px | 600 | Maks 2 baris, `line-clamp-2` |
| Deskripsi | 12px | 400 | Maks 2 baris |
| Meta | 11-12px | 400 | Warna `muted-foreground` |
| Harga | 18px | 700 | `tabular-nums`, warna `text-price` |
| Harga asal | 12px | 400 | Dicoret, di samping harga |

### 3.5 Varian kartu

| Varian | Media | Deskripsi | Meta | Aksi |
|---|---|---|---|---|
| `product` | 3/2 | 2 baris | toko + siap unduh | stretched-link |
| `service` | 16/9 | 2 baris | toko + durasi + revisi | tombol chat + pesan |
| `category` | ikon 32px | — | jumlah item | stretched-link |
| `store` | avatar | 1 baris | jumlah produk | stretched-link |

Semua varian memakai ZONA 1-5 dengan urutan sama.

---

## 4. Pola tata letak halaman

### 4.1 Prinsip: jelajah vs cari

Temuan NN/g §1.2-1.3: kartu untuk **menjelajah**, daftar untuk **mencari**.

**Konsekuensi Ebrystore:**

| Halaman | Tujuan pengunjung | Bentuk yang tepat |
|---|---|---|
| Home | Menjelajah | Kartu (grid) |
| `/produk` | Cari produk tertentu | **Daftar + filter**, opsi tampilan grid |
| `/layanan` | Cari jasa tertentu | **Daftar + filter**, opsi tampilan grid |
| Toko | Menjelajah toko itu | Kartu |

Sekarang `/produk` dan `/layanan` memakai kartu. Menurut riset, itu kurang tepat untuk
pengunjung yang mencari barang spesifik.

### 4.2 Kerapatan grid

| Layar | Kolom | Lebar kartu | Alasan |
|---|---|---|---|
| 390px (mobile) | 2 | ~170px | Standar mobile commerce |
| 768px (tablet) | 3 | ~230px | — |
| 1280px | 4 | ~290px | — |
| 1920px | 5 | ~340px | Lebar penuh dipakai |

### 4.3 Urutan informasi dalam kartu

Berdasarkan temuan §1.4 (harga harus diprediksi), urutan dari atas:

1. Media (identitas visual)
2. Judul (apa ini)
3. Meta (dari siapa, sifatnya)
4. **Harga** (berapa)
5. Aksi (apa berikutnya)

Harga di atas aksi, bukan di bawah deskripsi. Ini memisahkan "informasi" dari "keputusan".

---

## 5. Keadaan kosong & kejujuran data

### 5.1 Aturan

| Situasi | Yang ditampilkan | Yang DILARANG |
|---|---|---|
| 0 produk | Penjelasan + tautan ke kategori | Angka 0 besar |
| 0 kategori | Section tidak dirender | "Belum ada kategori" |
| Gambar kosong | Inisial nama produk | Ikon generik besar |
| Harga tidak valid | "Lihat harga" | "Rp 0" |
| Toko tanpa nama | Tidak dirender | "Toko tidak diketahui" |

### 5.2 Kasus nyata Ebrystore

Data sekarang: 2 produk, keduanya bernama "template", 1 tanpa gambar, 13 kategori jasa,
0 kategori produk, 1 review, 0 layanan platform.

Artinya: **hampir semua keadaan kosong akan terlihat.** Sistem desain harus dirancang
untuk terlihat baik dengan data sedikit, bukan hanya dengan data banyak.

---

## 6. Celah sistem desain yang ada

| # | Celah | Dampak |
|---|---|---|
| D-1 | Tidak ada token khusus kartu | Setiap kartu mengatur ukurannya sendiri |
| D-2 | Tidak ada anatomi kartu baku | Produk dan jasa berbeda struktur |
| D-3 | Radius tidak konsisten | Kartu `rounded-xl`, tombol `rounded-md` |
| D-4 | Tidak ada aturan posisi harga | Melanggar temuan eyetracking §1.4 |
| D-5 | Tidak ada varian kartu resmi | Setiap komponen baru menebak sendiri |
| D-6 | Keadaan kosong tidak baku | Setiap komponen menangani sendiri |
| D-7 | Tidak ada skala kerapatan | Grid berubah tanpa aturan |

---

## 7. Keputusan yang dibutuhkan Owner

| # | Pertanyaan | Opsi | Rekomendasi |
|---|---|---|---|
| W-01 | Bahasa desain | Ebrystore existing / **baru: bersih, padat, tegas** / campuran | baru, konsisten di semua kartu |
| W-02 | Harga di kartu | atas / **bawah (ZONA 4)** / keduanya | bawah, konsisten |
| W-03 | `/produk` & `/layanan` | kartu / **daftar + filter** / kartu dengan opsi daftar | daftar + filter |
| W-04 | Kartu tanpa gambar | ikon besar / **inisial nama** / pola latar | inisial nama |
| W-05 | Badge diskon | "Diskon 90%" / **"-90%"** | `-90%` (hemat ruang) |
| W-06 | Kartu jasa: accordion kesepakatan | tetap di kartu / **pindah ke halaman detail** | pindah (kartu harus ringkas) |
| W-07 | Jalan masuk kategori di home | tidak ada / **strip horizontal ringan** / panel penuh | strip ringan |
| W-08 | Radius | 8px seragam / **bertingkat (kartu 12, tombol 8)** | bertingkat |

---

## 8. Prioritas pengerjaan

Berdasarkan dampak dan ketergantungan:

| Prioritas | Pekerjaan | Alasan |
|---|---|---|
| P0 | Token kartu + anatomi 5 zona | Semua kartu bergantung ini |
| P0 | Kartu produk & jasa diseragamkan | Melanggar temuan eyetracking sekarang |
| P1 | Harga di posisi konsisten | Temuan eyetracking langsung |
| P1 | Keadaan kosong baku | Data sekarang hampir semuanya kosong |
| P2 | `/produk` & `/layanan` jadi daftar + filter | Temuan jelajah vs cari |
| P2 | Kartu kategori di home | 13 kategori tidak punya jalan masuk |
| P3 | Varian kartu toko | Belum mendesak |

---

## 9. Yang dilarang (langsung gagal)

- Harga di posisi berbeda antar kartu
- Kartu tanpa batas/latar yang jelas (melanggar prinsip common regions)
- Lebih dari 3 informasi dalam satu kartu (kartu harus ringkas)
- Angka kosong ditampilkan sebagai "0" besar
- Ikon generik besar saat gambar kosong
- Teks "Belum ada..." untuk section yang seharusnya tidak dirender
- Warna, radius, atau bayangan di luar token
- Emoji, gradien dekoratif, glow
- Klaim "selesai" tanpa bukti ukur

---

## 10. Status bukti

| Klaim | Status |
|---|---|
| Empat properti kartu NN/g | `VERIFIED` (kutipan langsung) |
| Kartu buruk untuk membandingkan (eyetracking) | `VERIFIED` (kutipan langsung) |
| Harga harus di posisi konsisten | `VERIFIED` (kutipan langsung) |
| Kondisi UI Ebrystore sekarang | `VERIFIED` (baca kode + query DB) |
| Prinsip e-commerce lain | `PARTIALLY_VERIFIED` (pengetahuan umum) |
| Angka konversi | `NOT_MEASURED` |
| Keputusan W-01..W-08 | `OWNER_DECISION_REQUIRED` |
