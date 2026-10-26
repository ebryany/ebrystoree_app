# MGRCAO V3: penyelesaian redesain admin moderasi jasa

Dasar: [riset source](../ui-ux/2026-10-03-riset-admin-moderasi-jasa.md).

## M: Mindset

Selesaikan perubahan existing, bukan menulis ulang lagi. Informasi kontrak dan keamanan keputusan lebih penting daripada animasi.

## G: Goals

Dua antrean jelas, kontrol keyboard berfungsi, loading/error/empty eksplisit, input terkunci saat proses, alasan terjaga saat pindah tab, konfirmasi refund penuh.

## R: Role

Senior frontend engineer spesialis UI/UX dashboard marketplace, bekerja sendiri tanpa agen. Cocokkan komponen existing dan pertahankan permission server.

## C: Context

File halaman telah berisi kartu/status/motion. Standar admin: AdminPageHeader/useCan/ForbiddenState. Tabs dan AlertDialog tersedia. Scope: halaman admin jasa, satu regression test, dokumentasi. Tidak mengubah backend atau data transaksi. ENERGY 1 / RHYTHM 2 / MOTION 2.

## A: Actions

1. Perbaiki tab menggunakan Radix existing, permission-aware default, panel tetap mounted tetapi hidden ketika tidak aktif.
2. Tambah header admin dan refresh tiap antrean. Batasi animasi sesuai reduced motion.
3. Disclosure aksesibel, scope penuh, kunci field saat pending, target sentuh 44px.
4. Konfirmasi refund melalui AlertDialog. Tidak klik keputusan nyata saat verifikasi.
5. Tambah regression runnable; jalankan lint scoped, unit tests, build, typecheck. Laporkan error baseline secara jujur; tidak mengklaim GUI lulus tanpa observasi.

## O: Outputs

Halaman admin terselesaikan; regression test dan evidence hasil pemeriksaan. Tidak commit/push/deploy. Tidak ada perubahan checkout/moderation/refund policy.
