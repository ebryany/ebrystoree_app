# Riset keamanan: file upload, XSS, dan manipulasi data via intercept request

Tanggal: 2026-10-03. Role: Security Engineer. Scope: seluruh jalur unggah berkas, sink XSS, dan trust boundary antara klien dan server (termasuk skenario penyerang yang mengubah request lewat proxy/intercept). Metode: pembacaan source, audit live read-only storage dan database, serta penelusuran setiap pemanggilan storage. Tidak ada perubahan kode pada tahap riset ini.

## Ringkasan

Tiga hal yang diaudit:

1. **File upload** — 16 titik pemanggilan storage di 8 bucket.
2. **XSS** — 2 sink yang berpotensi berbahaya, keduanya perlu diperiksa ulang.
3. **Manipulasi data via intercept** — apakah server mempercayai field sensitif dari klien.

Kesimpulan awal: fondasi cukup kuat (harga tidak dipercaya dari klien, upload sensitif lewat signed URL, RLS pada storage), tetapi ada **empat celah nyata** yang harus ditutup.

## 1. File upload

### 1.1 Inventaris bucket (live)

| Bucket | Privat | Batas ukuran | MIME |
| --- | --- | --- | --- |
| academic-order-attachments | ya | 20 MB | **tidak ada (semua tipe)** |
| avatars | ya | 2 MB | 4 gambar |
| catalog-images | ya | 5 MB | 4 gambar |
| job-results | ya | 40 MB | **tidak ada (semua tipe)** |
| payment-proofs | ya | 5 MB | 4 (3 gambar + pdf) |
| product-files | ya | **tidak ada** | **tidak ada (semua tipe)** |
| service-deliveries | ya | 25 MB | 11 dokumen/gambar |
| service-media | ya | 25 MB | 6 (gambar + video) |

Semua bucket privat. Itu baik.

### 1.2 Celah A: tiga bucket tanpa batas MIME, satu tanpa batas ukuran

- `product-files` tidak punya `file_size_limit` **dan** tidak punya `allowed_mime_types`. Artinya klien yang memegang signed upload URL dapat mengunggah berkas berukuran apa pun dan tipe apa pun. Batas ukuran hanya ditegakkan di server function (`maxUploadBytes` dari setting), tetapi **tidak ada di storage**. Signed URL yang bocor atau disalahgunakan langsung menjadi jalur unggah tanpa batas.
- `job-results` (40 MB) dan `academic-order-attachments` (20 MB) membatasi ukuran tetapi menerima tipe apa pun. Berkas HTML/SVG yang diunggah lalu dilayani dengan `Content-Type` tebakan dapat menjadi vektor XSS tersimpan bila kelak disajikan inline.

### 1.3 Celah B: unggah langsung dari klien tanpa verifikasi objek

Dua jalur mengunggah langsung dari klien ke storage, lalu hanya mendaftarkan path ke server:

- **`checkout.layanan`** (`academic-order-attachments`): klien mengunggah, lalu memanggil `registerAcademicAttachment`. Server memeriksa `storagePath.startsWith(userId)` dan ukuran/MIME dari **klaim klien**, tetapi **tidak memverifikasi bahwa objek itu benar-benar ada** dan **tidak membaca metadata asli objek**. Klien dapat mendaftarkan path milik user lain (ditolak oleh prefix), atau mendaftarkan `fileSize`/`mimeType` palsu, atau mendaftarkan path yang tidak pernah diunggah.
- **`po-thread`** (`payment-proofs`): klien mengunggah bukti transfer langsung, lalu memanggil `uploadProof`. Perlu diverifikasi apakah server memeriksa keberadaan objek; dari pembacaan, pola `payment-proofs` di `submit_payment_proof` **memang** memverifikasi `storage.objects` (ditemukan di migration manual payment boundary), jadi jalur ini lebih baik.

Perbedaan ini menunjukkan standar verifikasi belum seragam.

### 1.4 Celah C: validasi hanya di klien pada beberapa jalur

- `avatar-uploader`: validasi MIME dan ukuran hanya di klien; bucket membatasi ukuran dan MIME, jadi aman karena storage yang menegakkan.
- `service-media-editor` dan `service-delivery`: validasi di klien, tetapi signed URL dibuat server dengan cek MIME dan ukuran; bucket juga membatasi. Aman berlapis.
- `checkout.layanan`: bucket **tidak** membatasi MIME, jadi klien bebas mengunggah tipe apa pun hingga 20 MB.

### 1.5 Celah D: SVG dan HTML

Tidak ada bucket yang secara eksplisit melarang `image/svg+xml` atau `text/html`. Bucket dengan daftar MIME eksplisit aman. Bucket tanpa daftar (`product-files`, `job-results`, `academic-order-attachments`) dapat menerima keduanya. Risiko bergantung pada bagaimana berkas disajikan: jika inline, SVG dapat menjalankan script.

## 2. XSS

### 2.1 Kuat

- Hampir tidak ada `dangerouslySetInnerHTML`. Hanya satu pemakaian: komponen `chart.tsx` untuk menyuntik CSS variabel tema. Nilai yang disuntik berasal dari `config` yang didefinisikan pengembang, bukan input pengguna; dan tidak ada satu pun pemanggil `ChartContainer` dengan `config` dari data pengguna (grep pemanggil: kosong).
- Konten artikel dirender sebagai React node oleh parser sendiri, dan tautan difilter `isSafeUrl` yang menolak `javascript:`, `data:`, `vbscript:`, `file:`, lalu hanya mengizinkan `https:`, `http:`, `mailto:`, path relatif, dan anchor.
- Aset banner memakai validator jauh lebih ketat (`isBannerAssetUrl`) yang hanya menerima path canonical hasil unggahan server dengan UUID dan ekstensi gambar yang diizinkan. Ini contoh yang benar: nilai yang dipakai sebagai background divalidasi seketat mungkin.
- React escaping aktif untuk seluruh teks yang ditampilkan.

### 2.2 Celah

- **Tidak ada sanitasi terpusat** untuk konten yang berasal dari pengguna dan ditampilkan sebagai teks panjang. React escaping sudah mencegah eksekusi, tetapi tidak ada lapisan kedua bila kelak ada kebutuhan render HTML.
- **Tidak ada CSP nonce**, sehingga `script-src 'unsafe-inline'` tetap diperlukan untuk hidrasi. Ini melemahkan CSP sebagai pertahanan XSS.
- **Tidak ada validasi terpusat untuk URL yang ditampilkan sebagai gambar** di luar banner. `img-src` pada CSP mengizinkan `https:` bebas, sehingga gambar dari domain mana pun dapat dimuat (kebocoran referrer/privasi, bukan eksekusi script).

## 3. Manipulasi data via intercept browser request

Skenario: penyerang membuka DevTools/proxy, mengubah payload request, lalu mengirim ulang.

### 3.1 Kuat (terverifikasi dari kode)

| Data | Apakah dipercaya dari klien? | Bukti |
| --- | --- | --- |
| Harga order | **Tidak** | `createDigitalOrder` hanya menerima `productId`, `quantity`, `idempotencyKey`; harga dihitung RPC |
| Total jasa | **Tidak** | `createMarketplaceServiceOrder` menerima `expectedTotal` hanya untuk mendeteksi quote basi, harga dibaca dari DB |
| Status order/pembayaran | **Tidak** | Perubahan status hanya lewat RPC dengan guard kepemilikan dan state |
| Peran/pengguna | **Tidak** | `user_roles` diisi server; `anon` tidak punya grant tulis (sudah dicabut) |
| Seller credit | **Tidak** | Hanya lewat `credit_seller_earnings` dengan syarat acceptance |
| Admin fee | **Tidak** | Dibaca dari `system_settings` di RPC quote |

Ini bagian terkuat arsitektur: aturan bisnis di database, bukan di klien.

### 3.2 Celah E: field turunan yang dipercaya dari klien

- `registerAcademicAttachment` menerima `mimeType` dan `fileSize` dari klien dan menyimpannya tanpa memverifikasi metadata objek storage. Penyerang dapat mencatat `fileSize: 1` untuk berkas 20 MB, atau `mimeType: image/png` untuk berkas PDF. Dampaknya saat ini terbatas pada data tampilan, tetapi merusak integritas dan dapat menyesatkan moderator.
- `registerServiceMedia` (jalur media jasa yang baru) — perlu dipastikan pola yang sama tidak terulang. Migration media memverifikasi keberadaan objek di RPC, yang lebih baik.

### 3.3 Celah F: tidak ada verifikasi objek pada jalur attachment

Sudah disebut di 1.3. Klien dapat mengirim `storagePath` yang tidak pernah ada; baris database tercatat, lalu gagal saat diunduh.

### 3.4 Celah G: rate limit berbasis userId saja

`enforceRateLimit` memakai `userId`. Untuk aksi anonim (mis. endpoint publik), tidak ada pembatasan per IP. Penyerang dengan banyak akun dapat melewati batas per akun.

### 3.5 Celah H: idempotency key dari klien

`idempotencyKey` berasal dari klien (`crypto.randomUUID()` di browser). Server hanya memvalidasi bentuk UUID. Penyerang dapat mengirim key yang sama berulang untuk memicu replay (ditolak dengan benar oleh RPC karena memverifikasi pemilik dan service) atau mengirim key acak untuk membuat banyak order — dibatasi rate limit 20/menit.

## 4. Prioritas perbaikan

### P0

1. Tetapkan `allowed_mime_types` dan `file_size_limit` untuk `product-files`, `job-results`, dan `academic-order-attachments`; larang SVG dan HTML secara eksplisit.
2. Verifikasi objek storage pada `registerAcademicAttachment`: baca metadata asli dari storage, dan tolak bila objek tidak ada atau metadata tidak cocok.

### P1

3. Terapkan pola verifikasi objek yang sama pada semua jalur "unggah dulu, daftar kemudian".
4. Tambah validasi MIME terpusat untuk unggahan langsung (`checkout.layanan`) di sisi server sebelum pendaftaran.
5. Rate limit per IP untuk aksi anonim.

### P2

6. CSP nonce untuk menghapus `unsafe-inline`.
7. Sanitasi terpusat untuk konten pengguna yang ditampilkan panjang.
8. Daftar domain gambar yang diizinkan pada `img-src`.

## 5. Kesimpulan

Arsitektur Ebrystore sudah menempatkan aturan bisnis di database, sehingga manipulasi request tidak dapat mengubah harga, status, atau saldo. Yang tersisa adalah integritas **metadata berkas** dan **batas penyimpanan**: tiga bucket menerima tipe apa pun, satu tanpa batas ukuran, dan satu jalur pendaftaran lampiran tidak memverifikasi objek. XSS praktis tertutup oleh React escaping, parser artikel yang aman, dan validator aset banner yang ketat; yang kurang adalah nonce CSP sebagai lapisan kedua.

Tidak ada temuan yang menunjukkan eksekusi kode atau kebocoran data aktif. Semua adalah risiko integritas dan pengerasan yang harus ditutup sebelum skala produksi.

Framework kerja disusun di `docs/remediation/2026-10-03-mgrcao-v3-upload-xss-integrity.md`.
