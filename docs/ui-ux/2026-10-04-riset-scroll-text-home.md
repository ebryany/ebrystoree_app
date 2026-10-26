# Riset: penempatan scroll-text marquee di halaman home

Tanggal: 2026-10-04. Scope: komponen `scroll-text` dari ui-layouts, dan penentuan tempat yang tepat di halaman home. Metode: pembacaan struktur home saat ini, pemeriksaan dependensi, dan analisis terhadap aturan anti-slop. Tidak ada perubahan kode pada tahap riset ini.

## 1. Apa komponen ini

`scroll-text` adalah marquee teks berbasis `motion` (Framer Motion) dengan dua mode:

- `scrollDependent: false` (default): teks bergerak terus dengan `baseVelocity`, seperti ticker berjalan.
- `scrollDependent: true`: kecepatan dan arah gerak mengikuti posisi scroll pengguna (parallax marquee).

Props: `children` (teks), `baseVelocity` (default -5), `scrollDependent` (default false), `delay` (ms), dan `className` (di dokumentasi tertulis `clasname`, kemungkinan typo).

## 2. Ketersediaan teknis

| Item | Status |
| --- | --- |
| `motion` | Sudah terpasang (`^13.5.0`) |
| Registry ui-layouts (`ui-layouts.com/r/...`) | Tidak dapat diakses dari lingkungan ini (koneksi gagal) |
| CLI `npx uilayouts@latest` | Interaktif (meminta pilihan bahasa), tidak dapat dijalankan otomatis |

**Konsekuensi:** komponen tidak dapat diambil lewat CLI. Karena `motion` sudah tersedia, komponen ekuivalen dapat dibangun langsung di proyek tanpa menambah dependensi. Ini juga menghindari risiko mengambil kode dari sumber luar yang tidak dapat diverifikasi.

## 3. Pertimbangan anti-slop

Aturan yang relevan:

- **R-19 (Motion)**: animasi berulang tanpa tujuan adalah noise. Marquee yang berjalan terus-menerus masuk kategori "endless loop" yang dilarang sebagai default.
- **C-3 (Content-Driven Composition)**: setiap section harus punya alasan dari kebutuhan konten, bukan mengisi template.

Maka marquee di home hanya boleh dipakai bila memenuhi dua syarat:

1. **Isinya nyata.** Bukan slogan atau kata mutiara, melainkan data yang benar-benar ada di katalog.
2. **Geraknya punya alasan.** Bukan ticker yang berjalan sendiri tanpa henti, melainkan gerak yang mengikuti scroll pengguna (`scrollDependent: true`) sehingga kendali ada pada pembaca.

## 4. Penentuan tempat

### 4.1 Struktur home saat ini

```
1. Banner (dari pengaturan admin)
2. Section kategori (chips kategori jasa + produk)
3. Section produk digital
4. Section jasa seller
5. Section layanan akademik
6. Jalur seller (Mulai jualan)
7. Bantuan
```

### 4.2 Kandidat penempatan

| Kandidat | Isi | Penilaian |
| --- | --- | --- |
| Di atas banner | Teks nilai | Ditolak: banner sudah jadi hero; menambah teks di atasnya mengulang kesalahan sebelumnya |
| Di antara banner dan kategori | Kategori jasa | **Dipilih** |
| Di dalam section produk | Nama produk | Ditolak: produk sudah punya kartu; marquee akan menduplikasi |
| Di akhir halaman | Slogan | Ditolak: slogan tanpa data adalah dekorasi |

### 4.3 Alasan pemilihan

Pita marquee ditempatkan **tepat setelah banner, sebelum section kategori**, berisi **kategori jasa dan produk yang benar-benar ada di database**.

Alasan satu baris: pita ini berfungsi sebagai **navigasi cepat yang hidup** — pengunjung langsung melihat ragam layanan yang tersedia dan dapat mengkliknya, sekaligus menjadi transisi visual antara banner dan katalog.

Keuntungan lain:

- Isinya data nyata, bukan slogan.
- Tidak menduplikasi section kategori karena pita ini bersifat ringkas dan dapat diklik, sedangkan section kategori tetap menampilkan label kelompok yang jelas.
- Dengan `scrollDependent: true`, gerak mengikuti scroll sehingga tidak menjadi loop yang mengganggu.

## 5. Batas

- Tidak menambah dependensi (motion sudah ada).
- Tidak boleh berjalan otomatis tanpa henti; wajib `scrollDependent` atau dibatasi.
- Wajib menghormati `prefers-reduced-motion`: bila pengguna memilih gerak minimal, marquee harus berhenti dan tetap dapat dibaca.
- Teks harus dapat dibaca pembaca layar: marquee visual harus `aria-hidden` dan disediakan daftar tautan yang dapat diakses.
- Tidak menampilkan data yang tidak ada; bila kategori kosong, pita tidak ditampilkan sama sekali.

## 6. Kesimpulan

Komponen dapat dibangun langsung dengan `motion` yang sudah terpasang. Tempat terbaik adalah **pita navigasi kategori setelah banner**, berisi data kategori nyata, dengan gerak yang mengikuti scroll dan tetap dapat diakses keyboard serta pembaca layar.

Framework kerja: `docs/remediation/2026-10-04-mgrcao-v3-scroll-text-home.md`.
