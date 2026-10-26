# MGRCAO V3: perbaikan thumbnail produk invalid

Tanggal: 2026-10-03.
Status: framework untuk perbaikan yang dijelaskan di bawah. Dieksekusi dalam sesi yang sama atas laporan owner berikut diagnosa: produk "template" tersimpan dengan `thumbnail_url = "ds"` sehingga halaman publik merender gambar pecah.

## M: Mindset

Satu bug nyata: kolom gambar berisi teks bebas, dan renderer memercayai nilai kolom itu mentah-mentah. Jalur seller memungkinkan input ini; audit yang tersedia belum membuktikan jalur penulisan asal. Perbaiki akar (validasi persist) dan gejala (renderer tidak merender src tidak valid), tanpa membangun sistem upload baru atau mengubah alur seller/admin lainnya.

## G: Goals

1. Nilai `thumbnail_url` baru dari jalur seller tidak mungkin berisi teks yang bukan URL gambar (kosong, path internal `/api/public/catalog-image/...`, atau `https?://`).
2. Renderer kartu produk dan halaman detail memperlakukan thumbnail tidak valid sama dengan kosong: menampilkan placeholder yang rapi, bukan `<img>` pecah.
3. Baris data produk "template" yang terlanjur berisi `"ds"` dibersihkan menjadi NULL dengan catatan nilai lama.
4. Tidak ada perubahan pada jalur admin yang sudah tervalidasi, alur upload, bucket, atau kolom lain.

## R: Role

Bertindak sebagai Full-Stack Engineer perbaikan bug kecil terkontrol: mengubah validasi persist dan defensif renderer pada React/TypeScript/TanStack Start, plus satu pembersihan data bedah. Satu pelaksana, tanpa agen, tanpa server, tanpa browser.

## C: Context

- `src/lib/seller.functions.ts:152` skema `thumbnailUrl: z.string().trim().max(500).optional()` tanpa refine; baris 177 menulisnya langsung ke `thumbnail_url`.
- `src/lib/admin.functions.ts` (thumbnailInput) sudah menolak nilai selain kosong/`https?://`/path internal; tidak diubah.
- `src/components/home/catalog-cards.tsx` merender `<img>` bila `item.thumbnail_url` truthy; dipakai kartu home, katalog, dan toko.
- `src/routes/produk.$slug.tsx:109-117` merender `<img src={p.thumbnail_url}>` bila truthy; sumber alt "Pratinjau produk template".
- Data live: satu produk published dengan `thumbnail_url = "ds"`; bucket `catalog-images` kini ada (migration banner 20261003090000), tetapi upload logo/produk belum diverifikasi end-to-end.
- Batas: layanan (`services`) diverifikasi lewat MCP `z.string().url()` dan form admin tervalidasi; di luar scope kecuali bukti menunjukkan sebaliknya.

## A: Actions

1. Tambah helper kecil `isRenderableImageUrl` di `src/lib/utils.ts`: HTTP(S) dengan host valid melalui parser URL, atau path `/api/public/catalog-image/...` canonical. Tolak whitespace/control, backslash, credentials, protocol-relative, path traversal, dan protokol lain. Validasi sintaks tidak membuktikan file tersedia; tidak melakukan fetch URL input.
2. Gunakan helper di kartu produk dan halaman detail: thumbnail tidak valid diperlakukan kosong.
3. Tambah refine pada skema `thumbnailUrl` seller menggunakan helper yang sama dengan renderer (kosong/path internal/HTTP(S) sah, maks 500).
4. Pembersihan data satu baris: `UPDATE digital_products SET thumbnail_url = NULL WHERE id = '<id produk template>' AND thumbnail_url = 'ds'`, dengan nilai sebelum tercatat di log; verifikasi sesudahnya.
5. Regression: unit test kartu (thumbnail invalid menampilkan placeholder tanpa `<img src="ds">`), suite penuh, lint scoped, build, HTTP GET memastikan tidak ada lagi `src="ds"` di home/detail.

## O: Outputs

- Source: `src/lib/utils.ts`, `src/components/home/catalog-cards.tsx`, `src/routes/produk.$slug.tsx`, `src/lib/seller.functions.ts`, satu tambahan test di `marketplace-home.test.tsx`.
- Data: satu baris dibersihkan, log `.zcode/thumbnail-fix-*`.
- Evidence: `docs/audit/2026-10-03-perbaikan-thumbnail-invalid.md` dengan hasil nyata dan batas verifikasi (visual/browser tetap belum).
