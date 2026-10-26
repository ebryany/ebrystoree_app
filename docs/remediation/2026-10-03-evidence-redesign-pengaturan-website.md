# Bukti redesain pengaturan website

Tanggal: 2026-10-03. Role: Security Engineer + Frontend/UI/UX Specialist.

## Ringkasan pekerjaan

Dua pekerjaan selesai pada `/admin/settings/website`:

1. **Pengaturan kompleks konteks marketplace**: tata kelola izin diperbaiki dan bagian Marketplace ditambahkan dengan 22 field dalam 6 kelompok.
2. **Redesain UX**: tata letak tiga kolom, bilah simpan mengambang, dialog dampak, pencarian dropdown, sidebar berkelompok, dan pengaman perubahan.

## Fase 1: Tata kelola izin (selesai)

**Temuan kritis:** kode memakai 10 permission pengaturan, tetapi database hanya memiliki 3. Akibatnya `has_permission()` selalu false untuk sembilan permission, dan satu-satunya alasan halaman dapat disimpan adalah bypass super_admin yang sekaligus membanjiri audit log.

Migration `20261003250000_settings_permissions.sql`:

| Peran | Permission pengaturan |
| --- | --- |
| admin | 6 (website view/update, contact, navigation, seo, branding view) |
| super_admin | 13 (semua, termasuk payment, features, maintenance, marketplace) |

Terverifikasi: 13 permission terdaftar, 19 pemetaan peran. Admin tidak mendapat `settings.payment.update` atau `settings.marketplace.update`; keputusan uang tetap di super_admin.

## Fase 2: Bagian Marketplace (selesai)

Bagian baru dengan 22 field dalam 6 kelompok:

| Kelompok | Isi |
| --- | --- |
| Media & berkas jasa | Maksimal media, ukuran gambar/video/berkas hasil, penanda batas bucket |
| Aturan jasa | Durasi maksimal, minimum karakter requirements, batas jasa aktif, produk per halaman |
| Escrow & pencairan | Masa tahan dana, pelepasan otomatis + waktunya, minimum pencairan |
| Moderasi | Wajib moderasi, target waktu review |
| Kebijakan seller | Auto-approve seller, edit jasa disetujui kembali ke draft |
| Refund & sengketa | Batas waktu komplain, dukungan refund sebagian |

**Prinsip yang dijaga:** setiap default identik dengan nilai hardcoded yang berjalan sekarang, sehingga tidak ada perubahan perilaku sampai admin mengubahnya. Diverifikasi oleh test.

**Kejujuran batas:** field "Batas bucket storage" ditandai `readOnly` + `enforcedInDatabase` dengan penjelasan bahwa perubahan memerlukan migration, bukan dipalsukan sebagai dapat diatur.

## Fase 3: Pengikatan batas ke setting (selesai)

Migration `20261003260000_marketplace_settings_binding.sql` menghubungkan batas media dan durasi ke `system_settings` dengan fallback default.

**Kendala teknis yang dijelaskan jujur:** CHECK constraint hanya menerima fungsi IMMUTABLE, sehingga tidak boleh membaca `system_settings` yang nilainya berubah. Karena itu dipakai dua lapis:

1. Constraint = batas aman maksimum (hard cap: media 10, gambar 20 MB, video 100 MB).
2. RPC = menegakkan nilai yang benar-benar dikonfigurasi admin.

Konsekuensi yang dicatat: menurunkan batas tidak menghapus media jasa lama, tetapi setiap penyimpanan berikutnya harus mematuhi batas baru.

Terverifikasi: RPC membaca 4 setting, hard cap utuh, default sama dengan perilaku sebelumnya, media jasa lama tidak berubah.

## Fase 4: Redesain UX (selesai)

| Sebelum | Sesudah |
| --- | --- |
| Tombol simpan di bawah kartu, harus menggulir jauh | Bilah simpan mengambang saat ada perubahan |
| Preview di bawah seluruh field | Preview sticky di kolom kanan (xl); tetap di bawah pada layar kecil |
| Panel dampak mendorong konten | Dialog overlay dengan daftar `nilai lama → nilai baru` |
| Hasil pencarian mendorong konten | Dropdown di bawah input |
| Sidebar 11 item datar | Tiga kelompok: Konten / Transaksi / Sistem, dengan penanda `!` untuk bagian berisiko |
| Header bagian hanya judul | Jumlah pengaturan, jumlah diubah, lencana "Menyentuh uang/perilaku" |
| Tanpa pengaman perubahan | `beforeunload` + pintasan `Ctrl/Cmd+S` |
| Mobile: baris geser panjang | Mobile: select |

## Bug yang ditemukan dan diperbaiki saat verifikasi

Saat verifikasi browser, halaman menampilkan "Halaman belum dapat dimuat". Penyebabnya: dua `useEffect` dan satu `useState` yang saya tambahkan berada **setelah early return** (`if (!canView) return …`), melanggar Rules of Hooks sehingga React melempar error.

Perbaikan: semua hook dipindahkan ke atas seluruh early return. Diverifikasi dengan pemeriksaan otomatis bahwa tidak ada hook tersisa di bawah early return, dan halaman kembali tampil normal di browser.

Ini dicatat sebagai temuan nyata, bukan disembunyikan.

## Verifikasi browser (akun super_admin)

| Elemen | Hasil |
| --- | --- |
| Sidebar berkelompok | Konten (6 bagian), Transaksi (3), Sistem (3) |
| Penanda risiko | `!` pada Order & pembayaran, Marketplace, Fitur, Maintenance |
| Header bagian | "11 pengaturan" tampil; lencana berubah saat ada perubahan |
| Badge field | "Tampil di situs" / "Internal" / "Diubah dari default" / "Ditegakkan database" |
| Bagian Marketplace | 6 kelompok tampil dengan nilai default benar (media 5, gambar 5, video 25, durasi 365) |
| Pencarian "escrow" | Dropdown menampilkan 4 hasil dengan label bagian |

## Test dan build

| Pemeriksaan | Hasil |
| --- | --- |
| Unit test | 30 file, **402 tes lulus** |
| Test baru | 18 tes (permission, bagian Marketplace, UI contract, binding SQL) |
| Build produksi | exit 0 |
| Lint file terkait | 0 error, warning `any` existing |
| TypeScript file terkait | 0 error |

## Batas yang belum diuji

- Interaksi bilah simpan mengambang, dialog dampak, dan pintasan `Ctrl/Cmd+S` belum diuji dengan klik nyata di browser; diverifikasi lewat kontrak source dan typecheck.
- `beforeunload` tidak dapat diuji lewat browser otomatis.
- Preview sticky belum diverifikasi pada lebar layar di bawah `xl`.
- Field Marketplace yang bergantung pada job terjadwal (pelepasan otomatis, masa tahan dana) belum terhubung ke scheduler; nilainya tersimpan dan terbaca, tetapi belum ada worker yang mengeksekusinya. Ini dicatat sebagai pekerjaan berikutnya, bukan diklaim selesai.
- Tidak ada deployment frontend produksi, commit, atau push.
