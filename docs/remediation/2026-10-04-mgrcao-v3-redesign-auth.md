# MGRCAO V3: redesain halaman masuk dan daftar

Tanggal: 2026-10-04. Dasar: [riset redesain auth](../ui-ux/2026-10-04-riset-redesign-auth.md). Status: dikerjakan.

## M: Mission

Menghapus tiga pola AI slop di halaman auth (gradien gelap penuh halaman, grid latar tanpa tujuan, gradien tombol + radius berlebihan) sekaligus menutup celah UX nyata: tidak ada pemulihan kata sandi, tidak ada konfirmasi sandi, tidak ada persetujuan eksplisit, dan tidak ada status setelah daftar.

Halaman auth adalah pintu masuk ke marketplace terang. Latarnya harus mengikuti bahasa aplikasi, bukan kostum "ruang kendali gelap".

## G: Goal

1. Hapus gradien gelap penuh halaman dan grid latar; pakai latar terang konsisten.
2. Tombol submit solid, bukan gradien.
3. Radius sedang dan konsisten; input bukan bentuk pil.
4. Toggle Masuk/Daftar memakai `role="tablist"` yang benar.
5. Tambah "Lupa kata sandi" dengan alur nyata (kirim tautan reset).
6. Tambah konfirmasi kata sandi saat daftar.
7. Tambah checkbox persetujuan syarat saat daftar.
8. Status setelah daftar jujur: bila verifikasi email aktif, tampilkan layar "periksa email" dengan alamatnya.
9. Error inline per field, bukan hanya toast.
10. Pertahankan yang sudah benar: validasi `next` anti open redirect, autocomplete, aria-label toggle sandi, target 44px.

## R: Role

Frontend/UI/UX Specialist marketplace, bekerja sendiri tanpa spawn agent. Mandat: `src/routes/auth.tsx` dan utilitas CSS auth di `src/styles.css` bila perlu dibersihkan. Tidak menyentuh middleware auth, RPC, atau aturan izin.

## C: Constraints

- Tidak mengubah logika autentikasi: `signInWithPassword`, `signUp`, OAuth tetap sama.
- Validasi `next` anti open redirect dipertahankan apa adanya.
- Tanpa dependency baru.
- "Lupa kata sandi" hanya dipasang bila alurnya benar-benar berfungsi; tidak boleh jadi kontrol mati (R-26).
- Pesan setelah daftar harus jujur: verifikasi email memang aktif di sistem ini.
- Target sentuh 44px, focus ring terlihat, reduced motion dihormati.
- Bahasa Indonesia, tanpa em dash.

## A: Actions

1. Latar: ganti `bg-auth-gradient` + `auth-grid` dengan latar terang; satu panel aksen hanya bila ada alasan.
2. Kartu: `rounded-xl`, `shadow-card`, satu kolom `max-w-md`.
3. Toggle mode: `role="tablist"` + `aria-selected`, atau tautan teks dengan indikator aktif.
4. Input: `rounded-lg`, tinggi 44px, label di atas, error inline per field.
5. Tombol submit: solid aksen, satu CTA.
6. Tambah alur lupa kata sandi memakai `supabase.auth.resetPasswordForEmail`.
7. Tambah konfirmasi kata sandi + checkbox syarat pada mode daftar.
8. Layar status "periksa email" setelah daftar tanpa sesi.
9. Hapus utility `auth-grid` dan `bg-auth-gradient` bila tidak dipakai lagi di tempat lain.
10. Test kontrak dan verifikasi browser.

## O: Outcome

- Tidak ada gradien gelap penuh halaman, tidak ada grid latar, tidak ada gradien tombol.
- Radius konsisten; input bukan pil.
- Pemulihan kata sandi berfungsi, bukan tautan mati.
- Daftar memerlukan konfirmasi sandi dan persetujuan syarat.
- Setelah daftar, pengguna melihat status nyata sesuai verifikasi email.
- Error tampil di dekat field yang salah.
- Logika auth, OAuth, dan anti open redirect tidak berubah.
- Tests/build dilaporkan apa adanya.
