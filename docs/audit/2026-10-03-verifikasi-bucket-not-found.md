# Verifikasi lokal dan deployment live: Bucket not found

Tanggal: 2026-10-03.
Status terbaru: migration 20261003100000 applied ke project Supabase live wcxaheqnnsbhifpgiedk atas izin eksplisit user. Tiga bucket privat sudah ada dan GET metadata HTTP 200. Upload user/RLS belum diuji.

Dasar:
- [Riset](2026-10-03-riset-bucket-not-found.md).
- [Framework MGRCAO V3](../remediation/2026-10-03-mgrcao-v3-bucket-not-found.md), dibuat sebelum implementasi atas instruksi user.

## Perubahan

1. `supabase/migrations/20261003100000_missing_storage_buckets.sql`: satu DO statement untuk membuat bucket absent saja.
2. `src/lib/__tests__/storage-buckets.test.ts`: lima test kontrak migration menggunakan Vitest existing.
3. Dokumen riset, framework, dan catatan verifikasi ini.

Manifest lokal:

| Bucket | public | Limit byte | MIME |
| --- | --- | --- | --- |
| avatars | false | 2097152 | image/jpeg, image/png, image/webp, image/avif |
| academic-order-attachments | false | 20971520 | null |
| job-results | false | 41943040 | null |

Migration memakai ON CONFLICT DO NOTHING, lalu membaca row dengan FOR UPDATE dan memvalidasi name/public/limit/MIME null-safe. MIME diurutkan untuk perbandingan, sehingga perbedaan urutan tidak dianggap konflik; NULL tetap dibedakan dari array kosong. Konflik memicu STORAGE_BUCKET_MANIFEST_CONFLICT dan membatalkan satu DO statement, termasuk insert sebelumnya dalam statement yang sama. Tidak ada handler yang menelan exception.

Tidak mengubah consumer aplikasi, env, policy, permission, objek, tiga bucket existing, migration historis, TTL signed URL, RPC fulfillment, transaksi, atau dependency. Tidak memakai agen/browser, menyalakan server, commit/push, deploy frontend, atau mengubah AGENTS.md. Deployment database hanya menambah tiga bucket dan mencatat migration baru.

## Hasil command

| Pemeriksaan | Hasil | Batas bukti |
| --- | --- | --- |
| Prettier test baru | Selesai | Hanya file test scoped. |
| `npx vitest run src/lib/__tests__/storage-buckets.test.ts` | 5/5 lulus | Kontrak source SQL, bukan eksekusi PostgreSQL. |
| `npm run test:unit` | 243 test/16 file lulus | Tidak upload live atau menjalankan RLS Storage. |
| `npx eslint src/lib/__tests__/storage-buckets.test.ts` | Exit 0, output kosong | Scoped, bukan lint seluruh aplikasi. |
| `npx tsc --noEmit`, sebelum/sesudah | Keduanya exit 2; 71 error sebelum, 71 sesudah; tambahan/penghapusan 0 | Baseline TypeScript tetap tidak bersih. Error test 404 sebelumnya tidak disentuh. |
| `npm run build` pertama | Terputus saat tahap Nitro | Log sebagian build berhasil bukan bukti build keseluruhan berhasil. |
| Build ulang lewat shell | Exit 127 | Output log kosong; sebab tidak terbukti. |
| Build ulang lewat Node/npm executable absolut | Exit 3765269347, tahap Nitro belum selesai | Tidak ada bukti build production lengkap berhasil. Tidak mengubah config atau restart service sebagai dugaan perbaikan. |

Executable psql/postgres/docker tidak ditemukan pada pemeriksaan lokal. Tidak memulai/install server untuk menguji SQL. Setelah izin deployment, jalur insert manifest dieksekusi pada PostgreSQL live dan diverifikasi. Skenario replay/conflict/rollback/konkurensi belum diuji; unit statis tidak menutupi kekurangan tersebut.

Test memeriksa tiga nama/limit/MIME exact, public false, absent-only insert, larangan overwrite/policy/object/transaction mutation, conflict guard null-safe, row lock, serta satu DO statement dengan exception tanpa commit/exception swallowing. Ini pengamanan kontrak source, bukan bukti perilaku konkurensi live.

## Evidence lokal privat

Di `.zcode/`:
- `bucket-not-found-fix-format.log`.
- `bucket-not-found-fix-unit-scoped.log` dan `bucket-not-found-fix-unit-full.log`.
- `bucket-not-found-fix-lint.log`.
- `bucket-not-found-fix-tsc-before.log`, `-tsc-after.log`, `-tsc-comparison.json`.
- `bucket-not-found-fix-build.log`, `-build-retry.log`, `-build-final.log`, `-build-status.json`.

Evidence tidak memuat credential atau signed URL. Inventory/API riset tetap snapshot sebelum implementasi, bukan bukti setelah deployment.

## Deployment live setelah izin user

User meminta lanjut migrasi/deploy langsung ke Supabase live, dengan mengutip manifest dan risiko sebelumnya. Otorisasi digunakan hanya untuk provisioning tiga bucket, bukan upload test, perubahan fulfillment, atau perluasan policy.

Preflight read-only:
- Project linked wcxaheqnnsbhifpgiedk cocok dengan URL server/browser di .env.
- Global Storage fileSizeLimit 52428800 byte (50 MiB), memadai untuk seluruh manifest 2/20/40 MiB. Global config tidak diubah.
- Tiga target masih absent pada DB/API. Tiga bucket existing tidak berubah dibanding riset.
- Semua policy storage.objects/storage.buckets dibandingkan dengan snapshot riset; sama, tidak ada policy generik baru. Policy pemilik avatars/academic dan orders.fulfill job-results tetap seperti riset.
- Object count, referensi agregat dan inventory direcheck tepat sebelum apply.

Apply melalui Management API database/query: satu transaksi BEGIN, statement timeout 30 detik, lock timeout 5 detik, advisory transaction lock, SQL migration exact, insert histori supabase_migrations.schema_migrations, lalu COMMIT. SQL dan histori dicatat atomik, bukan migration repair/mark-applied tanpa menjalankan SQL. Mode apply helper pembayaran lama tidak digunakan. Tidak mengirim rollback destruktif.

Migration SHA-256: 6fd97b3fab608e5f3121ebec99cda6e61682c0001cd2ef51cbd6ed1324edbd3c.

Verifikasi setelah apply:
- avatars, academic-order-attachments, job-results ada; name/privacy/limit/MIME sama dengan manifest.
- GET metadata keenam bucket HTTP 200, termasuk tiga target yang sebelumnya NoSuchBucket.
- Histori version 20261003100000, name missing_storage_buckets, statements exact match dengan file migration lokal.
- Policies, tiga bucket existing, object count, dan referensi agregat sebelum/sesudah sama.

Evidence tambahan privat: `.zcode/bucket-not-found-fix-deploy.mjs`, `-live-before.json`, `-live-apply.json`, `-live-after.json`, `-management-api.json`. Pembaca credential helper sempat gagal akibat escaping C# saat menyalin template; dikoreksi sebelum preflight berhasil. Tidak ada mutasi database pada percobaan preflight gagal, credential tidak dicetak.

## Belum diuji dan risiko yang tetap

Tidak upload/sign/download objek test live, mengubah order, atau menjalankan submit_job_result. Tidak menguji user owner/nonowner/anon, orders.view/fulfill, ukuran tepat/di atas limit, MIME invalid, blob download, GUI, atau runtime bundle deployment. GET metadata bercredential server bukan acceptance RLS user.

Risiko job-results tetap: signed URL setahun, policy seluruh bucket untuk orders.fulfill, decode base64 sebelum penolakan upload, kemungkinan orphan. Migration mengatasi absence dan memberi limit bucket; tidak memperbaiki risiko terpisah tersebut. Jangan delete bucket berisi data/policy sebagai rollback otomatis.

## Kesimpulan

Gap provisioning tiga bucket pada project live sudah teratasi dan diverifikasi DB/Storage API. Upload aplikasi end-to-end belum dinyatakan lulus. Unit/lint lokal lulus, TypeScript tidak bertambah; build lengkap masih belum tervalidasi. Database live hanya berubah untuk tiga bucket baru dan histori migration, bukan objek/customer data/transaksi.
