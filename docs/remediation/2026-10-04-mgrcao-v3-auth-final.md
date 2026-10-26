# MGRCAO V3: halaman masuk dan daftar (final)

Tanggal: 2026-10-04. Dasar: [riset auth final](../ui-ux/2026-10-04-riset-auth-final.md). Status: dikerjakan.

## M: Mission

Menjadikan halaman masuk dan daftar sebagai halaman yang **sejajar dengan kerangka situs** (tidak lebih lebar dari navbar/footer), **tanpa teks di panel gambar**, **tanpa kesan hijau**, dan dengan **form yang punya hierarki jelas** alih-alih tumpukan elemen setara.

Tiga keluhan owner sudah divalidasi dengan pengukuran: auth 128px lebih lebar dari kontainer situs, panel berisi teks yang tidak diminta, dan form 617px dengan hierarki datar. Tidak ada satupun yang subjektif.

## G: Goal

1. Auth memakai kontainer yang sama dengan navbar/footer sehingga tepinya sejajar.
2. Panel gambar hanya menampilkan gambar; seluruh teks dihapus.
3. Overlay panel netral gelap, bukan teal, agar tidak terbaca hijau.
4. Form dipersempit ke lebar baca nyaman (maksimal sekitar 26rem) meski kontainer lebar.
5. Hierarki form dinaikkan: judul dominan, kelompok field jelas, satu aksi utama.
6. Pemilih mode lebih tegas daripada dua tombol abu-abu.
7. Tombol Google seimbang bobotnya sebagai alternatif.
8. Panel tetap rapi bila banner belum diunggah (bidang netral, bukan putih kosong).
9. Logika auth, OAuth, dan validasi `next` tidak berubah.

## R: Role

**Super UI/UX Engineer** untuk marketplace, bekerja sendiri tanpa spawn agent. Mandat: `src/routes/auth.tsx`. Tidak menyentuh middleware, RPC, atau aturan izin.

Tanggung jawab peran ini bukan menambah dekorasi, melainkan menyelaraskan kerangka, menegakkan hierarki, dan memastikan halaman auth terasa bagian dari marketplace yang sama.

## C: Constraints

- Kontainer auth wajib sejajar dengan `max-w-6xl` + `px-4 sm:px-6` yang dipakai navbar/footer.
- Panel gambar tidak boleh memuat teks apa pun; alt kosong karena dekoratif.
- Tanpa dependency baru.
- Tidak mengubah `signInWithPassword`, `signUp`, `resetPasswordForEmail`, OAuth, atau validasi `next`.
- Target sentuh 44px, focus ring terlihat, reduced motion dihormati.
- Bahasa Indonesia, tanpa em dash.

## A: Actions

1. Bungkus auth dalam kontainer `mx-auto w-full max-w-6xl px-4 sm:px-6` agar sejajar header dan footer.
2. Panel gambar: hapus seluruh teks, jaminan, dan langkah; sisakan gambar dengan overlay netral gelap.
3. Grid: panel gambar dan form di dalam kontainer, dengan celah yang terkendali.
4. Form: batasi lebar kolom kanan, naikkan ukuran judul, atur jarak antar kelompok.
5. Pemilih mode: buat lebih tegas (indikator aktif jelas) tanpa menjadi kapsul berlebih.
6. Tombol Google: bobot seimbang sebagai alternatif, pemisah jelas.
7. Fallback panel: bila banner kosong, pakai bidang netral gelap dengan pola halus, bukan putih.
8. Verifikasi terukur: lebar auth harus sama dengan lebar navbar/footer.
9. Test dan evidence.

## O: Outcome

- Lebar auth sama dengan navbar/footer pada semua breakpoint; terverifikasi dengan pengukuran.
- Panel gambar tanpa teks.
- Tidak ada bidang hijau; overlay netral.
- Form punya satu titik fokus (judul) dan satu aksi dominan.
- Panel tetap rapi tanpa banner.
- Logika auth tidak berubah; tests/build dilaporkan apa adanya.
