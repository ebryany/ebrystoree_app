# MGRCAO V3: upload, XSS, dan integritas data

Tanggal: 2026-10-03. Dasar: [riset upload, XSS, dan integritas](../audit/2026-10-03-riset-upload-xss-integrity.md). Status: framework untuk pekerjaan berikutnya. Role: Security Engineer.

## M: Mindset

Penyerang tidak memakai UI. Ia membuka proxy, mengubah payload, lalu mengirim ulang. Setiap field yang datang dari klien harus dianggap klaim, bukan fakta. Yang menentukan kebenaran adalah database dan storage, bukan request body.

Prinsip kerja:

- **Storage menegakkan batasnya sendiri.** Batas MIME dan ukuran tidak boleh hanya di server function; bucket harus menolak juga.
- **Metadata berkas harus dibaca dari objek, bukan dari klien.** `fileSize` dan `mimeType` yang dikirim klien adalah klaim sampai diverifikasi.
- **Objek harus ada sebelum didaftarkan.** Path tanpa objek adalah baris database yang rusak.
- **Tolak dengan daftar putih.** Terutama untuk tipe berkas: yang tidak disebut, ditolak.

## G: Goal

1. Semua bucket punya `file_size_limit` dan `allowed_mime_types` eksplisit; SVG dan HTML ditolak.
2. Setiap pendaftaran berkas memverifikasi objek benar-benar ada dan metadata cocok dengan objek asli.
3. Jalur unggah langsung dari klien tunduk pada validasi server yang sama.
4. Rate limit tidak hanya per akun, tetapi juga per IP untuk aksi anonim.
5. XSS: pertahankan React escaping dan parser aman; tambah nonce CSP sebagai lapisan kedua.
6. Tidak ada regresi pada alur unggah yang sudah bekerja.

## R: Role

**Security Engineer** (application, database, storage), bekerja sendiri tanpa spawn agent. Mandat terbatas pada:

- Migration baru untuk konfigurasi bucket.
- `src/lib/academic.functions.ts`, `src/lib/seller-files.functions.ts`, `src/lib/product-files.functions.ts`, `src/lib/marketplace-service.functions.ts` untuk verifikasi objek.
- `src/lib/rate-limit.server.ts` untuk pembatasan per IP.
- `src/server.ts` untuk nonce CSP bila dikerjakan.
- Test terkait.

Di luar allowlist: berhenti dan catat blocker. Tidak menyentuh jalur uang, lifecycle, atau aturan bisnis.

## C: Constraints

- Jangan mengedit migration yang sudah diterapkan; buat migration baru.
- Konfigurasi bucket harus idempoten dan menolak konflik manifes (pola yang sudah dipakai untuk bucket lain).
- Jangan memperketat MIME sampai memutus unggahan sah: daftar harus mencakup format yang memang dipakai produk (dokumen, gambar, arsip, video untuk media jasa).
- Verifikasi objek memakai service role, bukan klien; jangan membuka akses storage ke klien.
- Nonce CSP tidak boleh memutus hidrasi; bila tidak dapat dijamin, catat sebagai tertunda alih-alih dipaksakan.
- Setiap klaim disertai bukti query atau hasil uji.

## A: Actions

### Fase 1: Batas storage

1. Migration: tetapkan `file_size_limit` dan `allowed_mime_types` untuk `product-files`, `job-results`, dan `academic-order-attachments`.
2. Larang `image/svg+xml`, `text/html`, dan `application/xhtml+xml` di semua bucket yang menerima dokumen.
3. Verifikasi live: setiap bucket punya batas ukuran dan MIME.

### Fase 2: Integritas metadata

4. `registerAcademicAttachment`: verifikasi objek ada di storage, baca ukuran asli dari metadata, dan tolak bila `fileSize`/`mimeType` klien tidak cocok dengan objek.
5. Terapkan pola yang sama pada jalur "unggah dulu, daftar kemudian" lainnya.
6. Test: objek tidak ada ditolak; metadata tidak cocok ditolak.

### Fase 3: Pembatasan laju

7. Tambah pembatasan per IP untuk aksi anonim pada endpoint yang menerima input pengguna.
8. Test: batas berlaku dan tidak memutus pengguna sah.

### Fase 4: XSS lapisan kedua

9. Evaluasi nonce CSP; bila hidrasi TanStack Start dapat menerimanya, terapkan. Bila tidak, catat sebagai tertunda dengan alasan teknis.
10. Dokumentasikan hasil.

## O: Acceptance

- Tidak ada bucket tanpa `file_size_limit`; tidak ada bucket tanpa `allowed_mime_types`.
- SVG dan HTML ditolak di semua bucket dokumen.
- Pendaftaran berkas menolak objek yang tidak ada dan metadata yang tidak cocok.
- Alur unggah sah tetap bekerja: bukti pembayaran, lampiran tugas, berkas produk, media jasa, avatar, dan banner.
- Rate limit anonim berlaku dan terverifikasi.
- Status CSP nonce jelas: diterapkan, atau dicatat tertunda dengan alasan.
- Tests/build dilaporkan apa adanya; tidak ada klaim yang belum dijalankan.
