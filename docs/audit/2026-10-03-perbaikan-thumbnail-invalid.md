# Verifikasi perbaikan thumbnail produk invalid

Tanggal: 2026-10-03, mengikuti penamaan framework sesi.
Framework: [MGRCAO V3 thumbnail invalid](../remediation/2026-10-03-mgrcao-v3-perbaikan-thumbnail-invalid.md).

## Hasil

Perbaikan source selesai. Pointer thumbnail produk `template-zmwo` yang terkonfirmasi berisi `ds` dibersihkan menjadi NULL pada database terhubung. Produk tidak dihapus; identitas dan status published tetap sama. Tidak ada commit, push, atau publish aplikasi.

## Diagnosis dan batas provenance

- Renderer sebelumnya mengecek truthy pada `thumbnail_url`, sehingga teks `ds` diteruskan sebagai `src` gambar relatif.
- Skema `saveMyProduct` seller sebelumnya menerima teks bebas sampai 500 karakter. Ini merupakan jalur yang memungkinkan data invalid, bukan bukti siapa atau jalur mana yang menulis nilai asal.
- Audit yang diperiksa sebelumnya hanya menunjukkan approval moderasi. Tidak membuktikan sumber penulisan thumbnail.

## Source dalam scope

- `src/lib/utils.ts`: helper `isRenderableImageUrl` memvalidasi HTTP(S) melalui parser URL atau path katalog internal. Menolak protocol-relative, credentials, whitespace/control, backslash, path traversal, encoding rusak, dan protokol lain.
- `src/components/home/catalog-cards.tsx`: kartu produk default/home memakai helper; invalid/kosong memakai placeholder existing. Kartu layanan tidak diubah.
- `src/routes/produk.$slug.tsx`: detail produk memakai helper dan placeholder existing.
- `src/lib/seller.functions.ts`: input thumbnail seller kosong tetap diizinkan; input lain harus lolos helper setelah trim, maksimum 500 karakter.
- `src/components/home/marketplace-home.test.tsx`: 22 kasus tambahan mencakup helper, render kartu/detail, dan validator seller sebenarnya melalui mock builder server function. Fixture preview lama diganti ke path katalog internal yang sah; assertion tampilan tetap dipertahankan.

Validasi sintaks tidak membuktikan URL menunjuk gambar atau file tersedia. Tidak ada fetch server terhadap URL input, upload baru, perubahan admin, bucket, banner, rekber, atau layanan.

## Koreksi data

1. Pemeriksaan read-only terbaru mengonfirmasi target `template-zmwo`, published, thumbnail `ds`.
2. Snapshot sebelum disimpan privat di `.zcode/thumbnail-fix-db-before.json`.
3. UPDATE dalam transaksi dibatasi ID, slug, dan nilai thumbnail `ds`; row count wajib tepat satu atau rollback.
4. Pembacaan sesudah mengonfirmasi thumbnail NULL serta ID, nama, slug, dan status tidak berubah.

Evidence privat: `.zcode/thumbnail-fix-db.mjs`, `.zcode/thumbnail-fix-db.log`, `.zcode/thumbnail-fix-db-apply.json`, `.zcode/thumbnail-fix-db-after.json`. Tidak ada produk atau object Storage yang dihapus. SQL hanya menetapkan kolom thumbnail; kolom lain yang mungkin ditulis trigger tidak diaudit menyeluruh.

## Pemeriksaan akhir

| Pemeriksaan | Hasil |
| --- | --- |
| Unit seluruh suite | PASS, 203 test, 14 file |
| Test home termasuk thumbnail | PASS, 72 test |
| Lint scoped | Exit 0, 0 error, 26 warning |
| Build | PASS, exit 0 |
| HTTP server existing localhost:8081 | Home, katalog, detail HTTP 200 |
| HTML gambar | Tidak ada tag img dengan src ds; placeholder detail ditemukan |
| TypeScript | Exit 2, 70 diagnostik baseline, 0 tambahan |

Log: `.zcode/thumbnail-fix-unit-final.log`, `.zcode/thumbnail-fix-lint-final.log`, `.zcode/thumbnail-fix-build.log`, `.zcode/thumbnail-fix-http.log`, `.zcode/thumbnail-fix-http-result.json`, `.zcode/thumbnail-fix-tsc.log`, `.zcode/thumbnail-fix-tsc-comparison.json`.

Run test pertama menemukan dua fixture `/preview.png` di luar kontrak katalog internal. Fixture diperbaiki tanpa melemahkan assertion. Lint pertama menemukan dua error no-control-regex; regex memakai Unicode control category, lalu lint dan suite diulang.

## Gate dan batas verifikasi

- PASS fungsi scoped: validator seller menolak `ds`; render kartu/detail invalid menghasilkan placeholder, dibuktikan unit test.
- PASS konservasi desain: placeholder, ukuran, class, alt, navigasi, dan kontrol existing dipertahankan; tidak membuat aset atau desain baru.
- PASS batas operasi: satu pelaksana, tanpa agen/browser, tanpa menyalakan atau restart server, tanpa dependency baru.
- Build dan HTTP bukan persetujuan visual. Screenshot, click-through browser, input form seller end-to-end, kegagalan unduh pada URL yang sintaksnya sah, dan tampilan mobile/theme belum diverifikasi. TypeScript global bukan PASS karena baseline masih gagal.
