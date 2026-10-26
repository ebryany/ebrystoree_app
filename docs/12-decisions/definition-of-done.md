# Definition of Ready / Done & Release Checklist

## Definition of Ready
Tujuan jelas; user story ada; acceptance criteria ada; business rule ada; alur UI ada; permission ditentukan; model data ada; kontrak API ada; error case terdaftar; kebutuhan keamanan ada; skenario test ada; dependency siap; unknown yang memblokir sudah diputuskan.

## Definition of Done
Kode ditulis dan direview; validasi diterapkan; authorization diterapkan di server; error handling lengkap; logging tanpa data sensitif; audit trail bila relevan; unit + integration test lulus; E2E lulus bila relevan; test authorization negatif lulus; UI responsif diuji; empty/loading/error state tersedia; dokumentasi diperbarui; acceptance criteria lulus; evidence tersimpan; risiko tersisa dicatat; tidak ada critical issue.

## Release Checklist
1. Seluruh acceptance criteria MVP lulus.
2. Security gate bersih.
3. Payment gate lulus atau fitur ditandai `PARTIALLY_VERIFIED` dan dinonaktifkan di produksi.
4. Backup aktif dan restore pernah diuji.
5. Migrasi + rollback teruji.
6. Monitoring dan alert aktif.
7. Halaman legal (syarat, privasi, refund) terisi oleh Owner.
8. Persetujuan rilis Owner tertulis.

## Payment Gate
Payment hanya berstatus `VERIFIED` bila: sandbox lulus, pembuatan payment berhasil, QR/instruksi tampil, webhook diterima, signature valid diterima dan invalid ditolak, duplikat aman, nominal & currency diverifikasi, status payment dan order tersinkron, side effect sekali, expired dan failed diuji, refund diuji, rekonsiliasi tersedia, dan evidence tersimpan. Sebelum itu: `PARTIALLY_VERIFIED`.