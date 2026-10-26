# Riset mendalam: Bucket not found

Tanggal dokumen: 2026-10-03.
Status: riset read-only, bukan implementasi atau deployment.
Permintaan: riset sendiri tanpa agen, tulis hasil Markdown, baca hasilnya, lalu susun framework MGRCAO V3 dengan scope terbatas pada temuan.

## 1. Kesimpulan

Ada gap provisioning yang terbukti pada project Supabase terhubung: **avatars, academic-order-attachments, dan job-results tidak ada**. Ketiganya dipanggil source aplikasi dan sudah mempunyai policy storage.objects. Policy tidak membuat bucket.

Bukti independen:

1. Query read-only storage.buckets mengembalikan hanya product-files, payment-proofs, catalog-images.
2. GET metadata Storage dengan kredensial server pada project yang sama mengembalikan `NoSuchBucket`, message `Bucket not found`, untuk ketiga bucket absent. Ketiga bucket existing mengembalikan HTTP 200.
3. Host URL server/client di .env cocok dengan project linked. Ini mengurangi kemungkinan salah project pada konfigurasi lokal yang dibaca, bukan membuktikan environment deployment/browser yang sedang dipakai user.

**Belum diketahui aksi persis yang memunculkan pesan user.** Tidak ada screenshot, URL operasi, sesi user, atau network trace yang mengikat pesan tersebut ke satu bucket. Avatar adalah kandidat kuat: uploader meneruskan pesan error Storage mentah. Lampiran checkout memakai pesan generik; MCP hasil jasa juga dapat memunculkan pesan bucket mentah.

Solusi minimum yang direkomendasikan: provisioning idempotent tiga bucket privat yang absent, dengan batas upload sesuai kontrak existing. Jangan membuat bucket di browser atau saat upload gagal, jangan menjadikan bucket publik, jangan merombak seluruh Storage.

## 2. Cara riset dan batas evidence

- Memetakan pemanggilan Storage melalui pencarian source, lalu membaca consumer utama, migration bucket/policy, konfigurasi client server/browser/MCP, dan test terkait. Ini bukan audit keamanan menyeluruh setiap fungsi yang ditemukan.
- Query metadata melalui helper existing `.zcode/manual-payment-db.mjs`, **mode query saja**, SQL `BEGIN READ ONLY`, statement_timeout 20 detik. Mode apply helper tidak digunakan dan hardcoded untuk pekerjaan lama.
- Memeriksa Storage API menggunakan GET `/storage/v1/bucket/{id}`. Kredensial server hanya dipakai lokal pada host yang terlebih dahulu dicocokkan dengan project linked, tidak dicetak/disimpan dalam hasil.
- Membaca dokumentasi resmi Supabase lewat snapshot source GitHub. WebFetch gagal; tidak dianggap evidence berhasil.
- Tidak upload/download isi file, tidak membuat signed token, tidak memakai akun user/impersonation, tidak menyalakan server, tidak memakai browser/agen, tidak mengubah data/migration/source.

Probe API dicatat pada `2026-10-03T02:13:49.208Z`. Inventory adalah snapshot saat riset, dapat berubah sebelum implementasi.

Query awal salah mengasumsikan digital_product_files mempunyai deleted_at dan gagal. Dikoreksi menjadi hitungan semua referensi. Management API multi-statement hanya mengembalikan hasil SELECT terakhir; inventory final memakai UNION ALL satu result set. Kesimpulan di bawah memakai inventory final dan probe API, bukan hasil parsial awal.

## 3. Inventory live dan pemetaan consumer

| Bucket | Live | Privat | Limit bucket | Consumer dan kontrak |
| --- | --- | --- | --- | --- |
| avatars | Absent | Belum ada | Belum ada | Foto profil, JPEG/PNG/WebP/AVIF, limit client 2 MiB. |
| academic-order-attachments | Absent | Belum ada | Belum ada | Lampiran checkout layanan, limit client dan validator metadata 20 MiB, MIME tidak dibatasi source. |
| job-results | Absent | Belum ada | Belum ada | MCP hasil pengerjaan jasa, description menyebut sekitar 40 MB; tidak ada pengecekan byte eksplisit. |
| product-files | Ada | Ya | null | File produk admin/seller/MCP; app default 100 MiB. null bukan bukti unlimited: global Storage limit tetap dapat berlaku. |
| payment-proofs | Ada | Ya | 5 MiB | Bukti pembayaran; JPEG/PNG/WebP/PDF. |
| catalog-images | Ada | Ya | 5 MiB | Gambar admin dan banner; JPEG/PNG/WebP/AVIF. Banner/client image limit 3 MiB. |

MiB berarti 1024 x 1024 byte; copy UI existing memakai label MB.

Jumlah metadata objek: catalog-images 6, product-files 1, payment-proofs 3. Hitungan ini bukan bukti seluruh byte objek bisa didownload atau seluruh policy sudah benar.

Referensi agregat:
- Profil dengan avatar internal/nonempty: 0.
- academic_order_attachments: 0.
- job_results: 0.
- digital_product_files: 1, tanpa missing storage.objects pada path yang dirujuk.

Tidak ditemukan bukti data pengguna perlu dihapus, dibackfill, atau dipindahkan. Tidak ada pemeriksaan isi objek atau backup binary.

## 4. Temuan source dan dampak

### F1. Bucket foto profil tidak diprovision

`src/components/ebry/avatar-uploader.tsx:9-10,32-52`:
- Memvalidasi MIME dan 2 MiB di client.
- Upload ke avatars dengan path userId/UUID.ext, upsert false.
- Setelah upload sukses, menyimpan referensi `/api/public/avatar/{path}` melalui onChange.
- Catch memakai e.message, sehingga `Bucket not found` dapat tampil langsung.

`src/routes/_authenticated/dashboard.pengaturan.tsx:181` menggunakan AvatarUploader. `src/hooks/use-avatar-url.ts:5-35` memperlakukan prefix tersebut sebagai referensi path dan membuat signed URL avatars selama 300 detik memakai sesi user. Prefix **bukan bukti perlu route HTTP avatar baru**; hook mengubahnya menjadi signed URL.

Migration `20260729084632_ce5fc3d7-f535-4a00-9901-68165428c38d.sql` hanya membuat policy insert/update/select/delete folder pemilik. Migration tercatat applied, policy live ada, bucket live absent. Rekomendasi tetap privat, bukan mengikuti contoh dokumentasi avatar publik.

### F2. Bucket lampiran akademik tidak diprovision

`src/routes/_authenticated/checkout.layanan.$slug.tsx:205-237,549` upload langsung academic-order-attachments dengan path userId/draftKey/UUID.ext. Input tidak mempunyai accept MIME. Kegagalan Storage menghasilkan toast generik dan tidak melanjutkan registerAttachment.

`src/lib/academic.functions.ts:117-155` memvalidasi metadata fileSize maksimum 20 MiB dan prefix user. Tidak memeriksa byte aktual atau keberadaan objek sebelum insert metadata. Ini gap validasi yang terpisah, bukan penyebab NoSuchBucket.

Migration `20260728190857_5e647586-0c39-4269-aa8e-0ab1270f4e18.sql` hanya policy objects: pemilik insert/delete; pemilik atau orders.view select. Migration dan policy live ada; bucket absent.

Rencana lama menyebut order-attachments, tetapi source sekarang memakai **academic-order-attachments**. Jangan membuat nama legacy yang tidak dipanggil source.

### F3. Bucket hasil kerja jasa tidak diprovision

`src/lib/mcp/tools/hermes-deliver-result.ts:25,35-54`:
- Optional file_base64 didecode lalu upload ke job-results dengan path orderId/timestamp-name.
- MIME arbitrary atau application/octet-stream.
- Description menyebut sekitar 40 MB, tanpa runtime byte check eksplisit.
- Upload error diteruskan sebagai `Unggah berkas gagal: {message}`.
- Setelah upload, signed URL dibuat **365 hari**, lalu RPC submit_job_result dipanggil.

Migration `20260918011253_c0310e70-2220-4269-a6ba-f295f3cbc23b.sql:12-20` hanya policy ALL untuk pemegang orders.fulfill. Policy ini tidak memeriksa assignment per order. Bucket absent pada DB dan API.

Privat tidak sama dengan URL selalu pendek: signed URL existing bertahan setahun. Provisioning bucket tidak otomatis memperbaiki TTL, akses order, orphan bila sign/RPC gagal, atau batas decode memory. Risiko ini dicatat, tidak dimasukkan ke refactor fulfillment pada framework minimum.

### F4. Tiga bucket lain tidak missing saat riset

- Product admin/seller memakai product-files dan server signed upload (`src/lib/product-files.functions.ts:103-159`, `src/lib/seller-files.functions.ts:121-126`). Browser kemudian uploadToSignedUrl ke prep.bucket. Product download memakai server signed URL melalui entitlement existing (`src/lib/orders.functions.ts:458`).
- Payment proof memakai payment-proofs. Provisioning terdapat pada `20261002110000_manual_payment_boundary.sql` dan sudah tercatat applied.
- Gambar admin memakai catalog-images (`src/components/admin/image-uploader.tsx:42-66`); banner server juga memakai bucket sama (`src/lib/banner-upload.server.ts:88`). Provisioning terdapat pada `20261003090000_home_banner_branding.sql`, tercatat applied.
- Public catalog-image handler sengaja mengembalikan asset 404 ketika download gagal (`src/routes/api/public/catalog-image.$.tsx:16`). Jangan mengganti respons ini menjadi halaman HTML atau menganggap semua asset 404 adalah bucket absent.

Jangan menghapus/recreate, mengubah public, limit, policy, atau nama bucket existing demi mengatasi tiga bucket absent. Jika pesan muncul pada product/payment/catalog, perlu evidence request project/path/session spesifik, bukan membuat bucket duplikat.

### F5. Konfigurasi lokal konsisten, deployment belum diaudit

Browser client (`src/integrations/supabase/client.ts:34-35`) memprioritaskan VITE_SUPABASE_URL dan VITE key; server (`client.server.ts:33-34`) memakai SUPABASE_URL dan service-role key. MCP (`src/lib/mcp/supabase.ts:22-58`) memakai server URL lalu VITE fallback dan verified user token.

.env lokal: URL server/client keduanya cocok dengan project linked. Kredensial tersedia; nilainya tidak dicetak. Environment process shell sendiri tidak terisi sebelum pembacaan .env; ini bukan bukti runtime app kehilangan konfigurasi karena Vite/runtime dapat memuatnya sendiri.

Tidak membaca backup environment yang tidak diperlukan, tidak mengubah env, tidak memverifikasi stale bundle/deployment. Tidak ada evidence bahwa typo/case bucket atau wrong-project adalah penyebab utama pada snapshot lokal ini.

### F6. Error code dan HTTP status tidak boleh disamakan

Probe GET metadata untuk ketiga absent:
- HTTP transport **400**.
- Body code **NoSuchBucket**.
- Body statusCode **"404"**.
- Message **Bucket not found**.

Dokumentasi resmi memetakan NoSuchBucket ke 404, tetapi respons nyata endpoint ini membedakan transport/body. Jangan assert transport 404 untuk semua operasi Storage.

Installed `node_modules/@supabase/storage-js/src/lib/common/fetch.ts:74-85` memilih body.statusCode, lalu body.code, lalu HTTP status saat membentuk StorageApiError; raw code bisa tidak tersedia sebagai field terpisah seperti contoh docs terbaru. Jangan mendesain normalizer hanya berdasarkan satu properti yang belum diuji.

Dokumentasi juga menyebut NoSuchBucket/NoSuchKey dapat terkait kurang izin bila resource sebenarnya ada. Karena riset memakai akses server dan DB inventory yang cocok, tiga absence di sini bukan sekadar hasil query anon RLS. Namun pengujian endpoint sebagai service role **tidak membuktikan user A/B boleh upload/sign**.

### F7. Dokumentasi historis dan coverage tidak cukup untuk acceptance

`docs/10-operations/transaction-foundation-audit.md:53-63` masih mencatat storage.buckets kosong pada audit lama. Itu bukan state terbaru dan menyebut order-attachments sebagai rencana, bukan nama consumer sekarang.

Pencarian test tidak menemukan coverage khusus NoSuchBucket/listBuckets/StorageApiError. Test transaksi existing memeriksa sebagian migration/readiness, bukan upload E2E enam bucket atau policy user A/B. Unit/build tugas 404 tidak menjadi evidence keberhasilan Storage.

## 5. Referensi resmi

- Error codes: https://supabase.com/docs/guides/storage/debugging/error-codes
- Creating buckets: https://supabase.com/docs/guides/storage/buckets/creating-buckets
- Private/public: https://supabase.com/docs/guides/storage/buckets/fundamentals

Snapshot source resmi di `.zcode/bucket-not-found-research-official-*.mdx`, diambil dari repository supabase/supabase, apps/docs/content/guides/storage.

Fakta yang dipakai: bucket dibuat eksplisit lewat API/dashboard/SQL; batas byte/MIME berada pada bucket; private access menggunakan JWT+RLS atau signed URL. Bucket public membuka retrieval, bukan otomatis membuka upload. NoSuchKey, invalid JWT, AccessDenied, InvalidMimeType, EntityTooLarge, expired signature, serta gangguan network bukan seluruhnya NoSuchBucket.

## 6. Scope perbaikan yang direkomendasikan

**Scope utama tunggal: lengkapi provisioning tiga bucket privat absent dengan nama persis consumer existing.**

Rekomendasi manifest:

| Bucket | public | file_size_limit | allowed_mime_types | Dasar |
| --- | --- | --- | --- | --- |
| avatars | false | 2097152 | JPEG/PNG/WebP/AVIF | Kontrak uploader existing. |
| academic-order-attachments | false | 20971520 | null | Limit existing 20 MiB; belum ada kontrak whitelist. |
| job-results | false | 41943040 | null | Batas rekomendasi 40 MiB dari description existing, bukan konfigurasi live yang sudah ada. |

Null MIME untuk dua bucket dokumen mempertahankan variasi file existing, **bukan sertifikasi file aman**. Menambah whitelist baru, scan malware, file sniffing, atau decode limit membutuhkan pekerjaan khusus. Limit global proyek belum diperiksa; ukuran efektif adalah minimum limit global/bucket. Jika global lebih rendah, jangan diam-diam menaikkannya.

Gunakan satu migration additive baru. Insert absent only, jangan ON CONFLICT UPDATE semua bucket. Bila bucket sudah dibuat sebelum pelaksanaan tetapi berbeda manifest, preflight menghentikan bagian konflik dan melaporkan evidence, bukan overwrite. Policy existing tidak dibuat ulang atau diperluas. Service-role tetap server-only.

Pesan error UI lebih ramah boleh menjadi pekerjaan lain setelah provisioning dibuktikan. Mengganti toast saja menyembunyikan gejala dan tidak memperbaiki absence; tidak perlu shared Storage abstraction atau dashboard bucket baru.

## 7. Acceptance dan batas deployment

- Preflight ulang DB/API, project match, tiga absent/existing, policies, objek/referensi dan global limit sebelum apply.
- Migration idempotent, privat, nama/limit sesuai manifest; existing bucket/policy/object metadata tidak berubah.
- Uji role pemilik/nonpemilik, anon, orders.view/fulfill versus tanpa izin; folder/path sesuai consumer. Uji upload/sign/download pada object test disposable dengan otorisasi terpisah dan cleanup terbatas objek yang dibuat test.
- Avatar 2 MiB/MIME valid, ukuran/MIME invalid ditolak Storage; lampiran 20 MiB; job-results 40 MiB. Keberadaan bucket saja bukan upload E2E PASS.
- Query metadata GET read-only boleh memverifikasi provisioning, tetapi bukan bukti upload user atau signing setelahnya.
- Tidak mengubah transaksi, status pembayaran/order, saldo/rekber, harga, TTL signed URL, lifecycle hasil, atau data historis.
- Pembuatan bucket live adalah perubahan production yang mengaktifkan alur upload: memerlukan izin deployment eksplisit dan review policy existing. Permintaan riset ini tidak memberi izin apply/upload/delete.
- Jangan rollback dengan DELETE bucket, TRUNCATE storage.objects, atau drop policy. Jika apply sudah dilakukan, catat perubahan dan blocker; removal bucket berisi data perlu keputusan owner tersendiri.

## 8. Evidence privat dan status

- `.zcode/bucket-not-found-research-inventory.sql` dan `.json`: final inventory read-only.
- `.zcode/bucket-not-found-research-references.sql` dan `.json`: hitungan referensi agregat.
- `.zcode/bucket-not-found-research-api.mjs`, `.json`, `.log`: GET metadata enam bucket dan project-match booleans, tanpa credential/token URL.
- `.zcode/bucket-not-found-research-official-errors.mdx`, `-create.mdx`, `-fundamentals.mdx`: referensi resmi yang dibaca.
- `.zcode/bucket-not-found-research.sql`/`-db.json`: probe awal/parsial, bukan sumber inventory final.

Pada tahap riset, tidak ada aplikasi, database, policy, bucket, env, dependency, server, AGENTS.md, atau histori git yang diubah. Implementasi belum dilakukan saat snapshot riset diambil. Error TypeScript tambahan pada test 404 sebelumnya tetap di luar scope.

Setelah riset, user meminta framework lalu perbaikan. [Framework MGRCAO V3](../remediation/2026-10-03-mgrcao-v3-bucket-not-found.md) dan [verifikasi implementasi lokal](2026-10-03-verifikasi-bucket-not-found.md) mencatat tahap berikutnya. Temuan live di dokumen ini tetap snapshot riset, bukan status setelah deployment.
