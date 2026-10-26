# Riset: redesain halaman masuk dan daftar

Tanggal: 2026-10-04. Scope: `/auth` (mode masuk dan daftar). Metode: pembacaan source `src/routes/auth.tsx` (202 baris), inventaris token desain, dan pemeriksaan utility CSS yang dipakai. Tidak ada perubahan kode pada tahap riset ini.

## 1. Kondisi saat ini

Struktur: latar gradien gelap + grid overlay, `SiteHeader variant="dark"`, satu kartu terpusat berisi:
- Toggle Masuk/Daftar (dua tombol dalam wadah abu-abu)
- Judul + deskripsi
- Tombol Google
- Pembatas "atau gunakan email"
- Form (nama untuk daftar, email, kata sandi dengan ikon kunci dan toggle mata)
- Tombol submit bergradien
- Teks syarat & ketentuan
- Baris jaminan di bawah kartu

## 2. Diagnosis: kenapa terasa AI slop

Anti-slop mendefinisikan slop sebagai **teknik tanpa tujuan**, bukan teknik itu sendiri. Tiga pola berikut muncul bersamaan dan masing-masing tidak punya alasan yang dapat ditulis.

### 2.1 Gradien gelap penuh halaman tanpa alasan brand

```
bg-auth-gradient  →  linear-gradient(150deg, gelap → gelap → gelap)
auth-grid         →  garis grid 44px, opacity 40%
```

Latar gelap dengan grid adalah kostum "produk teknologi" yang paling umum di halaman login buatan model. Ebrystore adalah marketplace produk digital dan jasa, bukan alat developer. Tidak ada alasan yang dapat ditulis mengapa latar harus gelap bergaris; halaman lain di aplikasi ini justru terang.

Ini melanggar R-07 (grid sebagai latar tanpa tujuan identitas) dan semangat R-21 (tema gelap dipilih karena alasan, bukan karena terlihat teknis).

### 2.2 Gradien pada tombol utama

```
bg-accent-gradient  →  linear-gradient(100deg, teal → biru)
```

Tombol submit memakai gradien dua warna. Tidak ada hierarki yang dilayani: tombol solid akan sama jelasnya, dan gradien membuatnya terlihat seperti template. Ini pola R-01 sebagai default.

### 2.3 Radius berlebihan pada semua elemen

Hampir setiap elemen memakai `rounded-xl` atau `rounded-2xl`: kartu, toggle, input, tombol Google, tombol submit, tombol mata. Input `h-12 rounded-xl` adalah bentuk pil untuk kolom teks. Ini pola R-11: radius jadi dekorasi, bukan alat hierarki.

### 2.4 Masalah UX yang menyertai

- **Tidak ada pemulihan kata sandi.** Tidak ada tautan "Lupa kata sandi" sama sekali. Pengguna yang lupa sandi tidak punya jalan.
- **Tidak ada konfirmasi kata sandi** saat daftar. Salah ketik tidak terdeteksi sampai pengguna gagal masuk.
- **Tidak ada indikator kekuatan sandi.** Hanya `minLength=8`.
- **Tidak ada checkbox syarat** saat daftar; persetujuan hanya kalimat pasif di bawah tombol.
- **Toggle mode memakai `Button`**, bukan `tablist`, sehingga pembaca layar tidak mengenalinya sebagai pemilih mode.
- **Tidak ada pesan error inline per field**; error hanya toast.
- **Tidak ada status "cek email" setelah daftar** bila verifikasi email aktif.

### 2.5 Yang sudah benar dan harus dipertahankan

- Validasi `next` mencegah open redirect (`startsWith("/") && !startsWith("//")`).
- Tombol mata punya `aria-label` yang berubah.
- Autocomplete benar (`current-password` vs `new-password`, `email`, `name`).
- Target sentuh sudah 44px+.
- Tautan syarat dan kebijakan privasi nyata dan dapat dibuka.
- Alur OAuth Google lewat helper resmi.

## 3. Rancangan yang diusulkan

### 3.1 Latar

Ganti gradien gelap + grid dengan latar terang yang konsisten dengan sisa aplikasi (`bg-surface`), atau satu panel aksen di satu sisi pada layar lebar. Alasan yang dapat ditulis: halaman auth adalah pintu masuk ke marketplace terang, bukan ruang kendali.

### 3.2 Kartu

- Radius sedang (`rounded-xl`), bukan besar di semua tempat.
- Elevasi `shadow-card` saat diam; tidak perlu `shadow-lifted` yang berat.
- Lebar tetap maksimal `max-w-md`, satu kolom.

### 3.3 Form

- Input `rounded-lg` (bukan pil), tinggi 44px, label di atas.
- Toggle mode memakai `role="tablist"` dengan `aria-selected`, atau dua tautan teks dengan garis bawah pada yang aktif.
- Tombol submit solid (bukan gradien), satu warna aksen.
- Tambah "Lupa kata sandi" (bila alur tersedia) atau tandai jelas bila belum.
- Saat daftar: konfirmasi kata sandi + checkbox persetujuan syarat.
- Error inline per field di bawah input, bukan hanya toast.

### 3.4 Setelah daftar

Bila verifikasi email aktif, tampilkan status "Periksa email" dengan alamat yang dikirim, bukan langsung mengarahkan ke dashboard.

### 3.5 Yang tidak dilakukan

- Tidak menambah ilustrasi atau maskot.
- Tidak menambah klaim keamanan yang tidak dapat dibuktikan.
- Tidak mengubah logika autentikasi, OAuth, atau validasi `next`.

## 4. Batas

- Perlu konfirmasi apakah alur "lupa kata sandi" tersedia di backend Supabase; bila belum, tautan tidak boleh dipasang sebagai kontrol mati (R-26).
- Perlu konfirmasi apakah verifikasi email aktif, agar pesan setelah daftar jujur.
- Tidak menyentuh `auth-middleware`, RPC, atau aturan izin.

## 5. Kesimpulan

Halaman auth memakai tiga pola slop sekaligus (gradien gelap penuh halaman, grid latar tanpa tujuan, gradien tombol, radius berlebihan) dan kehilangan fungsi penting (pemulihan kata sandi, konfirmasi sandi, persetujuan eksplisit, status setelah daftar). Redesain harus menghapus dekorasi tanpa alasan sekaligus menutup celah UX tersebut.

Framework kerja: `docs/remediation/2026-10-04-mgrcao-v3-redesign-auth.md`.
