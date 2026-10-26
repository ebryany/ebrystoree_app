# MGRCAO V3: redesign home marketplace Ebrystore

Tanggal: 2026-10-02. Target: `http://localhost:8081/`, route `/`.

Status: framework ini ditulis setelah edit awal home, bukan sebelum edit. User mengoreksi urutan kerja. Sisa pekerjaan menggunakan framework ini untuk pemeriksaan ulang, koreksi scoped, dan verifikasi. Jangan menyatakan framework telah dipakai sejak awal. Implementasi jasa seller tetap ditunda.

## M: Mindset

Home adalah pintu belanja, bukan landing page promosi. Utamakan menemukan produk, melihat harga dan toko, membuka detail, lalu mengakses pesanan. Kepercayaan dibangun dari informasi nyata dan batas layanan yang jelas, bukan badge keamanan, angka ramai, testimoni, atau rekomendasi palsu.

Gunakan arah desain `DESIGN.md`: ink-teal, tipografi existing, low elevation, mobile-first. Filter anti-slop diterapkan selama pemeriksaan ulang. Jangan membuat aset baru, mengubah identitas, atau menambahkan fitur marketplace yang belum ada.

## G: Goals

1. Pencarian produk segera terlihat, tidak tertutup hero/banner besar.
2. Kategori produk berasal dari katalog aktif dan membuka filter yang benar.
3. Produk muncul satu kali, dengan nama, thumbnail jika ada, toko jika tersedia, dan harga yang dapat dipercaya.
4. Layanan pendampingan akademik platform terpisah dari produk digital, tidak diklaim sebagai jasa seller marketplace.
5. Empty, loading, error, retry, keyboard focus, reduced motion, serta layout mobile ditangani.
6. Tidak mengubah backend transaksi, dana rekber, dashboard, pengaturan, atau policy.
7. Verifikasi yang tidak dilakukan dilaporkan sebagai belum diverifikasi, bukan PASS.

## R: Role

Satu engineer pelaksana dan reviewer source. Tidak spawn agent, menyalakan/restart server, menggunakan browser-use, atau mengganti browser automation untuk menghindari larangan. Tidak menambah dependency, mengedit AGENTS.md, publish, commit, atau push.

Pilihan desain reversibel diselesaikan berdasarkan direction dan kontrak existing. Dokumentasi bukan bukti visual. Unit test dengan mock bukan bukti browser, HTTP server function, RLS, atau database.

## C: Context

### Temuan source sebelum edit

| Temuan | Sumber | Dampak |
|---|---|---|
| Hero banner besar sebelum katalog; hasil produk pertama diulang dalam rekomendasi | `src/routes/index.tsx` | Jarak ke katalog panjang, produk duplikat |
| Kategori home menggunakan `kind: service` | `src/routes/index.tsx` | Discovery produk digital tidak menjadi fokus |
| Pencarian mengatakan produk atau jasa tetapi menuju `/produk` | `src/routes/index.tsx` | Ekspektasi tidak sesuai hasil |
| Label populer, personalisasi, ribuan, kesiapan kirim tidak mempunyai field bukti | Home dan marketplace product card | Klaim dihapus, bukan diisi data palsu |
| URL katalog menerima `q`, `kategori`, `toko`; API menerima category/store | `src/routes/produk.index.tsx` | Link kategori wajib menggunakan `kategori` |
| Kategori error dikembalikan sebagai items kosong | `src/lib/catalog.functions.ts` | Tambah error nullable secara additive supaya retry dapat dibedakan |
| Diskon kartu hanya memeriksa nominal positif | `src/components/home/catalog-cards.tsx` | Nominal sama/lebih besar atau tidak finite tidak boleh dianggap diskon |
| Header/footer shared, kartu produk juga dipakai toko | Shared components dan `src/routes/toko.$slug.tsx` | Header/footer tidak diubah; kartu shared tetap kompatibel |

### Design read dan alasan keputusan

Storefront bagi pembeli produk digital, bahasa visual ink-teal Ebrystore. ENERGY 2 / RHYTHM 3 / MOTION 2. Ini target komposisi source; hasil render belum dinilai.

- Warna: token primary existing hanya untuk pencarian, kategori utama, dan status diskon nyata; harga memakai foreground agar tetap terbaca.
- Layout: discovery ringkas, kategori wrap, grid produk utama, layanan horizontal sekunder; urutan mengikuti kebutuhan belanja.
- Tipografi: stack existing menjaga identitas dan keterbacaan, angka harga tabular.
- Spacing: produk lebih dekat ke pencarian, jarak dan garis pemisah lebih besar sebelum layanan untuk membedakan jenis pembelian.
- Kartu produk: thumbnail persegi memudahkan scanning katalog; nama, toko, dan harga berada di luar gambar agar tidak bergantung pada kontras gambar.
- Kartu layanan: horizontal dan label platform membedakan layanan pengerjaan dari file siap pakai.
- Ikon: Search untuk input, ReceiptText untuk pesanan, Store untuk toko, GraduationCap untuk akademik, HelpCircle untuk bantuan. Download hanya fallback jenis produk, bukan janji kesiapan.
- Badge: hanya diskon valid dan toko resmi dari data; tidak memberi badge aman/populer tanpa bukti.
- Motion: transisi warna 150ms memberi feedback hover/focus, tanpa scale/reveal template; skeleton berhenti pada reduced motion.
- Aset: thumbnail katalog existing saja, tanpa banner baru, ilustrasi, atau avatar.

### Allowlist

- `src/routes/index.tsx`.
- Export `MarketplaceProductCard` dan `MarketplaceServiceCard` di `src/components/home/catalog-cards.tsx`; export lama tidak didesain ulang.
- `src/components/home/section-states.tsx`: retry target 44px dan reduced motion skeleton saja.
- `src/lib/catalog.functions.ts`: hasil error kategori nullable saja, tanpa perubahan query, policy, transaksi, atau harga checkout.
- `src/components/home/marketplace-home.test.tsx`.
- Dokumen framework ini, evidence scoped, log pemeriksaan lokal di `.zcode/home-redesign-*`.

Tidak mengimplementasikan jasa seller, cart, wishlist, ratings, sold count, personalization, promo countdown, sorting baru, atau backend rekber.

## A: Actions

### A-01. Pemeriksaan ulang setelah koreksi urutan

1. Baca framework ini, `DESIGN.md`, source hasil edit, kontrak query/navigation, dan pemakaian kartu shared.
2. Pastikan perubahan hanya allowlist. Jangan menghapus kerja existing untuk membuat urutan seolah framework-first.
3. Cocokkan setiap section dengan Goals; hapus section/klaim yang tidak dibutuhkan atau tidak mempunyai bukti.

### A-02. Discovery dan data

1. Pencarian hanya produk, trim, maksimum 80 karakter, submit Enter/button menuju `/produk?q=...`.
2. Kategori memakai `kind: product`, link `/produk?kategori=...`, label data asli, bisa wrap.
3. Satu grid maksimal 12 produk, bukan dua section dengan produk sama. Jangan menamai daftar terbaru/terlaris jika query tidak menjamin itu.
4. Layanan platform maksimal tiga; identitas tidak berubah menjadi jasa seller.
5. Kegagalan satu query tidak menutup semua home. Error response tidak disamarkan sebagai empty.

### A-03. Kartu dan aksesibilitas

1. Diskon hanya finite, positif, dan lebih kecil dari harga dasar valid. Harga dasar negatif/nonfinite menampilkan tautan detail harga, bukan nominal salah. Tampilan bukan pengganti validasi server checkout.
2. Paket layanan minimum dipilih hanya dari paket aktif dengan harga finite dan nonnegatif.
3. Thumbnail dekoratif dalam link mempunyai alt kosong karena nama produk sudah tersedia di link; fallback tidak mengaku produk siap dikirim.
4. Fokus terlihat pada input/form, kategori, kartu, tombol. Kontrol minimal 44px; grid memakai min-width 0, wrap dan word break.
5. Periksa token kontras light/dark secara programmatic, tanpa mengklaim render/theme acceptance.

### A-04. Acceptance checks

| ID | Check | Bukti yang diperlukan |
|---|---|---|
| H-01 | Produk tidak duplikat, kategori memakai parameter benar | Render test mock |
| H-02 | Search mempunyai label, maxlength, submit handler, route benar | Render test dan review source; klik belum terverifikasi |
| H-03 | Empty setiap katalog dan kategori dapat dipahami | Render test |
| H-04 | Tiga error terpisah, retry, search tetap ada | Render test |
| H-05 | Diskon valid; invalid, sama, lebih besar, base salah tidak menghasilkan klaim | Test kartu |
| H-06 | Paket tidak aktif/nonfinite tidak terpilih | Test kartu |
| H-07 | Store resmi berdasarkan field; tidak ada klaim kesiapan/populer/personalization | Test dan source review |
| H-08 | Grid/reflow/focus/reduced motion/44px ada | Source review; mobile dan keyboard GUI belum terverifikasi |
| H-09 | Kontras pasangan token text/background light/dark memenuhi AA | Perhitungan token; bukan screenshot |
| H-10 | Scoped lint, unit keseluruhan, build | Exit code/log aktual |
| H-11 | Typecheck error dibandingkan baseline | Log, tidak menandai seluruh TypeScript bersih bila baseline gagal |
| H-12 | Tidak ada jasa seller/SQL/dependency/server/browser/publish | Batas perubahan dan tindakan aktual |

### A-05. Delivery gate

Jalankan gate anti-slop source, purpose, direction, dan functional states. Bukti visual, klik-through, console browser, mobile 390px, serta theme rendering tetap **BELUM DIVERIFIKASI** di bawah larangan browser-use. Jangan menyebut keseluruhan gate PASS atau UI sudah visual-approved.

Scope yang dapat diselesaikan adalah perubahan source, regression, dan build. Batas pemeriksaan ditulis dalam evidence dan jawaban akhir.

### A-06. Rollback

Jika ada regresi, pulihkan hanya perubahan scoped yang dibuat pada tugas home. Jangan mengembalikan SQL rekber/monitoring atau mengubah saldo. Tidak reset seluruh folder atau membatalkan pekerjaan user. Tidak publish otomatis.

## O: Outputs

1. Home commerce-led memakai kategori, produk, toko, dan harga nyata.
2. Kartu marketplace lebih terbaca; klaim palsu dan grid duplikat hilang.
3. Satu test regression runnable: `npx vitest run src/components/home/marketplace-home.test.tsx`.
4. Evidence source/test/build/typecheck dan status gate dengan batas GUI eksplisit.
5. Ringkasan hasil dan link home, tanpa klaim implementasi jasa atau publish.
