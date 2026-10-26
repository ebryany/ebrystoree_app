# Preflight implementasi banner background home custom (arsip kondisi blocked)

Tanggal: 2026-10-03.
Status: BLOCKED pada gate keamanan sebelum perubahan aplikasi. Banner belum diimplementasikan atau diaktifkan.
Framework: [MGRCAO V3 banner background home custom](../remediation/2026-10-03-mgrcao-v3-banner-background-home-custom.md).

## Otorisasi dan pekerjaan yang dilakukan

Owner memerintahkan “lanjut kerjakan” setelah framework dan Role spesialis disusun. Otorisasi mencakup implementasi source sesuai framework, bukan perubahan database/storage production atau penambahan dependency. Gate C-05/A-07 mewajibkan menghentikan aktivasi bila storage authorization/decoder belum terpenuhi.

Pemeriksaan dilakukan oleh satu pelaksana, tanpa agen, server baru/restart, browser atau dependency baru. Arah DESIGN.md dan framework dibaca. Pemeriksaan storage/settings menggunakan database terhubung melalui helper existing, query SELECT dalam BEGIN READ ONLY dengan statement_timeout 20 detik. Tidak membaca isi file/object, credential, identitas pengguna, atau record pesanan.

## Hasil preflight live

Query runnable: .zcode/home-banner-preflight.sql.
Hasil lokal: .zcode/home-banner-preflight.json.

- Response gabungan bucket/policy/function valid. Helper database mengembalikan hasil result set, sehingga query diperbaiki menjadi satu SELECT jsonb_build_object agar semua hasil audit tercakup.
- Tidak ada row storage.buckets dengan id catalog-images pada database terhubung saat diperiksa. Ini hasil database metadata, bukan pengujian upload melalui Storage API. Tidak membuat bucket otomatis.
- Belum ada key home_banner_% pada system_settings.
- Empat policy catalog-images masih menggunakan is_staff: insert, update, delete, select. Policy bersifat PERMISSIVE dan tidak membatasi prefix branding/home.
- Definisi is_staff live mencakup operator, support, finance, admin, super_admin.
- system_settings write policy ALL menggunakan is_admin, bukan settings.branding.update. Guard server function tidak menutup jalur direct database write yang diizinkan RLS tersebut.
- has_permission live tersedia, menggunakan role_permissions dan bypass super_admin. Ketersediaannya bukan bukti banner sudah dilindungi.

## Hasil kemampuan decode server

Pemeriksaan require.resolve dan npm ls tidak menemukan sharp, jimp, jpeg-js, @napi-rs/canvas atau canvas; global ImageDecoder pada Node runtime undefined.

pngjs 5.0.0 tersedia transitif melalui qrcode 1.5.4, tetapi tidak mencakup JPEG/WebP/AVIF yang diminta kontrak uploader/framework. Signature/MIME checker saja tidak dianggap full decode. Tidak menurunkan dukungan format menjadi PNG-only tanpa keputusan owner, tidak mengimpor dependency baru, dan tidak menulis decoder sendiri.

Log dependency tree: .zcode/home-banner-decoders.log.

## Blocker yang memerlukan keputusan owner

1. Storage/database: izinkan penyusunan dan penerapan migration khusus banner setelah review evidence. Jalur yang direkomendasikan ialah bucket banner terisolasi dengan mutasi server-only melalui permission branding; bukan mengubah seluruh policy catalog-images yang dipakai consumer lain. Guard khusus key banner pada RLS settings tetap diperlukan agar writer langsung tidak menghindari aturan. Draft SQL dan preflight lanjutan harus menetapkan detail sebelum deployment; tidak ada SQL mutasi yang dibuat/dijalankan pada tahap ini.
2. Decoder: izinkan satu dependency server decoder yang mendukung format target dan bounded decode, disarankan sharp dengan kompatibilitas runtime diverifikasi; atau owner secara eksplisit menyempitkan dukungan format menjadi PNG yang dapat diperiksa dengan pngjs existing. Tidak memilih pengurangan scope/format diam-diam.

Tidak memasang UI upload yang tampak berfungsi tetapi pasti gagal karena bucket belum ada. Tidak mendaftarkan key/settings aktif pada jalur writer yang belum memenuhi trust boundary. Renderer/preview belum ditambahkan agar feature tidak terkesan selesai sementara upload/save belum aman.

## Scope dan verification status

- PASS preflight read-only: query dijalankan dan response gabungan diperiksa; hasil di atas bersumber metadata live.
- PASS dependency inspection: decoder yang tersedia/tidak tersedia ditentukan dari runtime resolution dan dependency tree.
- Aplikasi/source test/registry/SQL migration/settings production tidak berubah.
- Unit/lint/build/TypeScript baru tidak dijalankan karena belum ada perubahan source. Baseline historis bukan hasil verifikasi banner.
- GUI/mobile/keyboard/theme/click-through/upload/save/RLS runtime bukan PASS, belum dijalankan. Browser tetap dilarang owner.
- Tidak commit/push/publish; tidak mengunggah/menghapus aset; tidak membuat bucket atau memperluas RBAC global.

Implementasi berhenti pada blocker spesifik sesuai framework. Pekerjaan dapat dilanjutkan setelah keputusan storage/database dan decoder ditetapkan; larangan server/browser tetap berlaku.
