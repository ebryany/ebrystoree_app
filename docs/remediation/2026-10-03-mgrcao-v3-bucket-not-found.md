# Framework prompt MGRCAO V3: provisioning bucket absent

Tanggal: 2026-10-03.
Dasar wajib: [Riset Bucket not found](../audit/2026-10-03-riset-bucket-not-found.md), sudah dibaca sebelum framework ini disusun.
Instruksi terbaru user: lanjut bangun framework, lalu lakukan perbaikan.
Otorisasi awal: implementasi lokal sesuai allowlist. Otorisasi terbaru user: lanjut migrasi/deploy langsung ke database Supabase live untuk tiga bucket sesuai manifest dan risiko yang dikutip. Upload objek test live, pemanggilan fulfillment/RPC, dan deployment frontend tidak termasuk izin ini.

Status pelaksanaan: migration 20261003100000 applied pada project wcxaheqnnsbhifpgiedk. Global Storage limit 50 MiB; tiga bucket privat dan manifest diverifikasi DB/API HTTP 200; histori SQL exact match, policies/bucket existing/object count/referensi tidak berubah. Lima test scoped dan 243 test total lulus; scoped lint bersih; TypeScript 71 baseline, 0 tambahan. Build lengkap, user RLS/upload/GUI dan replay/conflict/rollback belum tervalidasi. [Catatan verifikasi](../audit/2026-10-03-verifikasi-bucket-not-found.md).

## M: Mindset

Perbaiki akar masalah yang terbukti, bukan menyembunyikan pesan error. Bucket metadata dan policy storage.objects adalah dua hal berbeda. Policy existing tidak membuat bucket. Gunakan perubahan paling kecil: satu migration additive, satu test scoped, satu catatan verifikasi.

Jangan menyatakan insiden user pasti avatar; hanya absence tiga bucket yang terbukti. Jangan menyamakan HTTP 400/body statusCode 404 probe dengan semua HTTP Storage 404. Jangan mengklaim migration lokal sudah memulihkan upload live.

## G: Goals

1. Menyediakan migration yang membuat hanya avatars, academic-order-attachments, job-results saat absent, semuanya privat.
2. Memberi limit bucket sesuai kontrak/rekomendasi riset tanpa mengubah policy, consumer, atau bucket lain.
3. Replay pada manifest sama tidak menulis ulang bucket. Existing manifest berbeda memicu exception dan rollback statement, bukan overwrite.
4. Meninggalkan test runnable dan bukti lokal. Memisahkan pemeriksaan statis, eksekusi PostgreSQL, provisioning live, upload user/RLS, dan GUI.

## R: Role

Bertindak sebagai engineer Supabase Storage dan PostgreSQL RLS yang memahami upload React/TypeScript, signed URL, migration additive, dan batas credential server/client. Kerja sendiri, tanpa agen atau workflow. Fokus provisioning Storage; bukan engineer yang memperluas fulfillment, transaksi, atau desain UI.

## C: Context

Temuan F1-F3: tiga bucket absent dikonfirmasi storage.buckets dan GET metadata bercredential server. Policy masing-masing sudah applied. Temuan F4: product-files, payment-proofs, catalog-images ada, privat, mempunyai objek. Temuan F5-F7: konfigurasi .env lokal cocok; runtime deployment, upload user, global limit, dan GUI belum dibuktikan.

### Manifest lokal

| id dan name | public | file_size_limit (byte) | allowed_mime_types |
| --- | --- | --- | --- |
| avatars | false | 2097152 | image/jpeg, image/png, image/webp, image/avif |
| academic-order-attachments | false | 20971520 | null |
| job-results | false | 41943040 | null |

40 MiB adalah rekomendasi operasional dari description sekitar 40 MB, **bukan batas existing yang sudah ditegakkan**. Limit bucket membatasi Storage upload, tidak membatasi memory decode base64 pada MCP. MIME null mempertahankan kontrak dokumen umum, bukan tanda berkas telah lolos pemeriksaan konten.

Sebelum deployment job-results, pemilik harus menerima secara eksplisit manifest 40 MiB/MIME umum serta risiko existing: signed URL 365 hari, policy orders.fulfill untuk seluruh bucket, decode sebelum penolakan Storage, dan orphan bila sign/RPC gagal. Tanpa review/otorisasi itu, berhenti sebelum apply migration live. Jangan memecahkan blocker dengan mengubah source di luar allowlist.

### Allowlist perubahan lokal

- Baru: `supabase/migrations/20261003100000_missing_storage_buckets.sql`.
- Baru: `src/lib/__tests__/storage-buckets.test.ts`.
- Baru: `docs/audit/2026-10-03-verifikasi-bucket-not-found.md`.
- Dokumen riset dan framework ini: hanya koreksi fakta/status/link.
- Evidence lokal privat baru di `.zcode/bucket-not-found-fix-*`, tanpa token, identitas user, signed URL atau isi berkas.

Source consumer, env, policy, applied migrations, configuration, dependency, AGENTS.md, dan dokumen historical tidak masuk allowlist.

### Di luar scope

Tidak mengubah avatar toast/preview, membuat route avatar, shared error normalizer, retry upload, dashboard Storage, banner, thumbnail, product/proof flow, auth/RBAC, order assignment, RPC, signed URL TTL, rekber/saldo, jasa seller, orphan cleanup, metadata validation, antivirus, quota, atau TypeScript error test 404 sebelumnya. Tidak create order-attachments legacy. Tidak menyalakan/restart server, memakai browser-use, browser alternatif, commit/push/publish, atau mengubah histori Lovable.

## A: Actions

### A1. Preflight lokal sebelum menulis migration

- Pastikan allowlist baru belum berisi file user yang akan tertimpa.
- Baca pola migration/test existing dan hasil evidence riset. Inventarisasi bucket/policy/object referensi sudah dilakukan read-only; snapshot itu bukan status permanen.
- Pilih satu migration statement atomik dengan DO block. Insert tiga manifest menggunakan ON CONFLICT (id) DO NOTHING, lalu validasi tiap existing row. Exception konflik membatalkan seluruh statement; tidak boleh menyisakan dua bucket baru ketika bucket ketiga konflik.
- Manifest conflict mencakup name, public, byte limit, MIME allowlist. Urutan MIME tidak perlu dianggap perubahan akses; bandingkan isi set secara konsisten atau laporkan konservatif tanpa overwrite.

### A2. Implementasi lokal minimum

- Tulis migration additive dengan fully qualified storage.buckets, nilai literal sesuai manifest, tanpa policy/permission/function permanen baru.
- Jangan memakai ON CONFLICT DO UPDATE, UPDATE, DELETE, TRUNCATE, DROP, public true, atau service-role bypass baru.
- Test scoped memeriksa manifest exact, insert absent-only, conflict guard null-safe, exception, target storage.buckets saja, dan tidak ada mutasi policy/objek/public/transaksi.
- Gunakan Vitest existing, tanpa dependency baru. Test statis harus disebut statis, bukan eksekusi SQL/RLS.
- Jalankan scoped test, full suite, scoped lint dan build existing bila tersedia. Bandingkan TypeScript dengan baseline sebelum/sesudah bila menjalankannya; baseline task 404 mengandung error baru yang belum diperbaiki dan tidak diubah pada scope ini.
- Jika PostgreSQL lokal tersedia tanpa memulai server baru, uji SQL absent, replay, manifest conflict dan rollback menggunakan fixture terisolasi. Jika tidak tersedia, catat tidak diuji; jangan install/start service atau apply ke production sebagai substitusi.

### A3. Gate apply live, tidak dijalankan oleh instruksi implementasi lokal

Apply hanya setelah user secara eksplisit mengizinkan deployment pada project yang tepat dan manifest/risk job-results diterima.

Sebelum apply:
1. Recheck project linked versus URL client/server yang benar-benar dipakai target; jangan cetak credential. Berhenti jika project mismatch.
2. Recheck tiga target dan tiga existing bucket, policies, object/reference aggregate, migration history. Simpan before read-only teredaksi. Existing konflik menghentikan apply, bukan update diam-diam.
3. Periksa global Storage upload limit. Jika lebih kecil dari manifest, catat batas efektif dan berhenti untuk keputusan owner; jangan menaikkan global limit.
4. Review semua policy storage.objects yang dapat match tiga target, termasuk policy generik OR, bukan hanya policy dengan nama bucket. Missing, akses terlalu luas, atau perubahan policy adalah blocker terpisah.
5. Review/terima risiko job-results dan manifest 40 MiB. Permission orders.fulfill tidak otomatis menjadi assignment per order.
6. Apply migration baru lewat mekanisme versioned deployment yang sesuai; jangan gunakan mode apply helper pembayaran lama yang hardcoded atau ubah applied migration. Record migration history sesuai tool deployment, tidak lewat metadata palsu.

Setelah apply authorized: query metadata/API read-only; bandingkan name/privacy/limits/MIME, policies dan tiga bucket existing. Jangan menyatakan upload berhasil berdasarkan GET metadata saja.

### A4. Acceptance upload/RLS, otorisasi test terpisah

Gunakan user test dan objek disposable yang pemilik telah izinkan. Jangan memalsukan token, membaca objek pelanggan, atau memanggil submit_job_result untuk sekadar test bucket. Test Storage langsung dengan sesi sah, tanpa perubahan status transaksi.

- Avatar: owner upload/sign/download folder sendiri berhasil; anon/nonowner gagal; JPEG/PNG/WebP/AVIF valid; MIME tidak valid dan ukuran >2 MiB ditolak.
- Lampiran: owner folder sendiri berhasil; nonowner tanpa orders.view gagal baca; pemegang orders.view boleh baca; nonowner gagal insert/delete; limit 20 MiB dan berkas umum sesuai kontrak.
- Job-results: orders.fulfill upload/sign/download sesuai policy existing; tanpa permission/anon gagal; limit 40 MiB. Jangan mengklaim assignment-order security sudah diperketat.
- Nilai batas tepat dan satu byte di atasnya, object missing, sesi invalid, serta download privat tanpa signed access dipisahkan dari missing bucket.
- Signed URL tidak masuk log. Cleanup hanya object test yang dicatat dan dibuat oleh pengujian, lewat Storage API dengan otorisasi cleanup; tidak DELETE storage.objects langsung atau prefix massal.
- Tidak ada retry mutasi otomatis. GUI tetap tidak diuji selama larangan browser berlaku.

### A5. Stop conditions dan rollback

Berhenti sebelum tindakan yang blocked jika project mismatch, manifest berbeda, global limit kurang, policy berubah/terlalu luas, data live tidak sesuai snapshot, izin deployment/test belum ada, atau perubahan membutuhkan file di luar allowlist. Laporkan blocker, jangan memperluas scope.

Rollback lokal: hanya file baru pekerjaan ini yang belum dibagikan; jangan restore snapshot source unrelated. Migration conflict harus rollback atomik sendiri. Setelah apply live, jangan delete bucket/policy/objek sebagai rollback otomatis, terlebih bila upload baru sudah terjadi. Forward correction atau removal memerlukan evidence dan otorisasi owner tersendiri; no data loss lebih utama daripada menghilangkan row migration.

## O: Outputs

1. Satu migration additive dan satu test runnable sesuai allowlist setelah implementasi lokal.
2. Catatan verifikasi berisi file berubah, command/status, scope evidence, baseline/added TypeScript, blocker deployment, serta status SQL/RLS/GUI yang belum diuji.
3. Ringkasan yang menyatakan dengan tepat apakah baru lokal atau sudah applied. Jangan gunakan kalimat upload sudah normal bila belum diuji dengan sesi user.
4. Tidak ada perbaikan UI/policy/fulfillment tambahan. Deployment live terhenti pada gate eksplisit, bukan disimpulkan dari persetujuan riset atau perintah umum perbaikan.
