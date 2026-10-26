# Deployment, Monitoring, Backup & Rollback

## Environment
| Env | Tujuan | Data |
|---|---|---|
| Preview/Dev | Pengembangan harian | Data seed, gateway sandbox |
| Production | Publik | Data nyata, gateway live |

Secret dikelola lewat penyimpanan secret platform (bukan file di repositori). Variabel yang dibutuhkan didokumentasikan namanya saja: kredensial payment gateway, secret webhook, dan shared secret cron.

## Pipeline
Build → typecheck → unit & integration test → migrasi database → deploy → smoke test (health check, checkout sandbox, webhook sandbox).

## Monitoring Minimum
Uptime, error rate, waktu respons, login gagal, pembayaran gagal, webhook gagal/tertunda, job terjadwal gagal, notifikasi gagal, penggunaan storage, kesehatan database, order terlambat, status backup, aktivitas mencurigakan.

## Backup & Recovery
Backup database otomatis harian oleh platform; uji restore ke environment non-produksi minimal sekali sebelum rilis dan setiap kuartal. File storage tercakup dalam kebijakan retensi. RPO target 24 jam, RTO target 4 jam untuk MVP.

## Rollback
Kembalikan versi aplikasi sebelumnya; migrasi dirancang aditif (tambah kolom/tabel, hindari drop destruktif pada rilis yang sama) agar versi lama tetap kompatibel. Perubahan destruktif dilakukan dua tahap pada rilis terpisah.

## Deployment Gate
Rilis produksi diblokir bila: migrasi belum diuji, rollback belum tersedia, variabel environment belum terdokumentasi, secret masih hard-coded, backup belum aktif, health check belum ada, job terjadwal belum berjalan, sandbox payment belum lulus, webhook belum terverifikasi, test kritis belum lulus, atau Owner belum memberi persetujuan rilis.