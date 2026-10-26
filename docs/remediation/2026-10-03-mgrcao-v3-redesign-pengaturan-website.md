# MGRCAO V3: redesain UX pengaturan website

Tanggal: 2026-10-03. Dasar: [riset redesain pengaturan website](../ui-ux/2026-10-03-riset-redesign-pengaturan-website.md). Status: dikerjakan.

## M: Mindset

Pengaturan adalah tempat keputusan berdampak. Dua prinsip memandu redesain ini:

1. **Tindakan dan konsekuensi harus berdekatan.** Simpan selalu terjangkau; preview terlihat saat mengubah; konfirmasi muncul di depan mata.
2. **Navigasi mengikuti risiko.** Keputusan konten dan keputusan uang tidak boleh terlihat sama.

Redesain ini tidak mengubah cara kerja penyimpanan, validasi, atau izin. Ia hanya menempatkan hal yang benar di tempat yang benar.

## G: Goal

1. Simpan selalu terjangkau lewat bilah mengambang saat ada perubahan.
2. Preview terlihat berdampingan dan sticky pada layar lebar.
3. Konfirmasi dampak menjadi dialog overlay, bukan panel yang mendorong konten.
4. Hasil pencarian menjadi dropdown, tidak menggeser konten.
5. Sidebar dikelompokkan menurut risiko (Konten, Transaksi, Sistem).
6. Header bagian menampilkan jumlah field, jumlah perubahan, dan lencana risiko.
7. Ada pengaman perubahan belum disimpan (`beforeunload`) dan pintasan `Ctrl/Cmd+S`.
8. Mobile memakai select untuk navigasi bagian.
9. Tidak ada regresi fungsi; aksesibilitas dan target sentuh terjaga.

## R: Role

Frontend/UI/UX Specialist untuk dashboard admin marketplace, bekerja sendiri tanpa spawn agent. Mandat: `src/routes/_authenticated/admin/settings.website.tsx` dan komponen pendukung di `src/components/admin/`. Tidak menyentuh registry pengaturan, server function, atau database.

## C: Constraints

- Tanpa dependency baru; gunakan komponen UI yang ada.
- Tidak mengubah perilaku simpan, validasi, izin, atau format data.
- Dialog harus dapat ditutup dengan Escape dan fokus terkelola.
- `beforeunload` hanya aktif saat ada perubahan belum disimpan.
- Target sentuh minimal 44px, focus ring terlihat, reduced motion dihormati.
- Bahasa Indonesia, tanpa em dash.

## A: Actions

1. Bilah simpan mengambang (sticky bottom) dengan jumlah perubahan, Batal, Simpan, dan Reset.
2. Tata letak tiga kolom pada `xl`: sidebar, kartu, preview sticky; preview kembali ke bawah pada layar lebih kecil.
3. Dialog dampak memakai Dialog existing dengan daftar `nilai lama → nilai baru`.
4. Pencarian menjadi dropdown di bawah input; klik hasil membuka bagian.
5. Sidebar dikelompokkan Konten / Transaksi / Sistem dengan label kelompok.
6. Header bagian: jumlah field, jumlah perubahan, lencana "Menyentuh uang" untuk bagian berisiko.
7. Pengaman `beforeunload` dan pintasan `Ctrl/Cmd+S`.
8. Navigasi bagian memakai select pada mobile.
9. Test kontrak dan verifikasi browser.

## O: Acceptance

- Dengan perubahan belum disimpan, bilah simpan terlihat tanpa menggulir.
- Preview terlihat di samping pada layar lebar dan tetap saat menggulir.
- Dialog dampak muncul di tengah, dapat ditutup dengan Escape.
- Pencarian tidak menggeser konten.
- Sidebar menunjukkan kelompok dan status bagian.
- Header bagian menampilkan jumlah field dan lencana risiko.
- Menutup tab dengan perubahan memberi peringatan; `Ctrl/Cmd+S` menyimpan.
- Mobile: navigasi bagian memakai select; target sentuh 44px.
- Tests/build dilaporkan apa adanya.
