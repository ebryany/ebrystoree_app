# MGRCAO V3: redesain halaman toko penjual

Tanggal: 2026-10-03. Dasar: [riset audit halaman toko penjual](../ui-ux/2026-10-03-riset-audit-halaman-toko-penjual.md). Status: framework untuk pekerjaan berikutnya; belum dieksekusi.

## M: Mindset

Halaman toko adalah etalase publik seorang seller dan titik kepercayaan pembeli. Pembeli yang datang dari katalog ingin menjawab tiga hal cepat: toko ini menjual apa, apakah aman, dan apa buktinya. Semua keputusan visual dan data harus melayani tiga pertanyaan itu.

Halaman ini juga bagian dari Ebrystore, bukan halaman asing. Navigasi situs harus tetap ada. Setiap angka yang ditampilkan harus berasal dari data nyata; bila belum ada, tampilkan state jujur seperti "Belum ada ulasan", bukan angka kosong atau karangan.

Design Read: storefront publik marketplace, untuk pembeli yang menilai toko sebelum membeli, dengan bahasa visual katalog Ebrystore, dial ENERGY 2 / RHYTHM 2 / MOTION 1.

## G: Goal

1. Halaman kembali menjadi bagian situs: `PageShell` dengan header dan footer.
2. Toko menampilkan semua yang dijual: produk digital dan jasa seller approved.
3. Bukti kepercayaan nyata: rating + jumlah ulasan, transaksi selesai, bergabung sejak, dengan state jujur saat kosong.
4. Kontak seller tampil bila diisi seller (WhatsApp), tidak menampilkan data kosong.
5. Pengurutan dan pencarian dalam toko untuk produk dan jasa.
6. Tidak ada pemotongan diam-diam pada daftar yang panjang.
7. Kartu memberi konteks toko: jenis (produk/jasa), rating, terjual, diskon.
8. SEO: metadata lengkap, `og:image` dari logo bila ada, data terstruktur `ItemList`/`Store`.
9. Mobile-first, target sentuh 44px, tanpa geser horizontal.
10. Tidak ada regresi privasi: proyeksi publik tetap server-only, tanpa membuka tabel privat ke anon.

## R: Role

Frontend/UI/UX specialist dan engineer data publik marketplace, bekerja sendiri tanpa spawn agent. Mandat terbatas pada:

- `src/routes/toko.$slug.tsx` dan komponen storefront baru di `src/components/store/`.
- `src/lib/seller.functions.ts` (perluasan `getPublicStore`).
- `src/lib/marketplace-service-catalog.server.ts` bila perlu query jasa per toko.
- Migration baru bila keputusan membuka agregat rating ke publik disetujui.
- Test terkait.

Di luar allowlist: berhenti dan catat blocker. Tidak menyentuh jalur uang, lifecycle, atau halaman seller internal.

## C: Constraints

- Perluasan query publik tetap memakai proyeksi aman: tanpa `owner_id`, `contact_email` mentah, `moderation_note`, atau field privat lain. Kontak hanya yang seller sendiri isi dan sengaja ditampilkan.
- Rating publik butuh keputusan owner karena menyentuh kebijakan data; sampai disetujui, rating ditampilkan dari data yang boleh dibaca atau tidak ditampilkan sama sekali. Jangan membuka fungsi ke anon tanpa keputusan.
- Jangan menampilkan angka yang tidak punya sumber. Bila kosong, tampilkan state jujur.
- Tanpa dependency baru. Gunakan `PageShell`, kartu yang ada, `StarRating`, dan token desain existing.
- Pertahankan aksesibilitas: heading berurut, `aria-label`, focus ring, alt yang bermakna.
- Bahasa Indonesia, tanpa em dash, tanpa buzzword.
- Setiap keputusan visual punya alasan satu baris.

## A: Actions

1. Bungkus halaman dengan `PageShell`; tambah `pendingComponent` dan `errorComponent` yang konsisten dengan halaman publik lain.
2. Perluas `getPublicStore`: kembalikan juga jasa approved toko (proyeksi publik yang sama dengan katalog jasa), rating ringkas, jumlah transaksi selesai, dan `created_at` toko.
3. Bangun header toko baru: avatar inisial bila tanpa logo, nama, deskripsi, chips bukti (rating, terjual, bergabung sejak), dan tombol kontak bila ada.
4. Tambah section jasa seller bila ada, dengan kartu yang konsisten; bila tidak ada, section tidak ditampilkan.
5. Tambah kontrol urut dan pencarian dalam toko untuk kedua jenis konten.
6. Tangani daftar panjang: tampilkan bertahap dengan tombol "Muat lagi" atau batas yang dinyatakan jelas, bukan dipotong diam-diam.
7. Perkaya kartu di konteks toko: penanda jenis, rating produk bila ada, dan terjual bila ada.
8. Metadata: `og:image` dari logo, deskripsi fallback yang bermakna, data terstruktur `ItemList` produk/jasa dan `Store`.
9. Tests: kontrak query publik (tanpa field privat, termasuk jasa approved), komponen header/kartu, state kosong yang jujur, dan aksesibilitas.
10. Evidence: klik-through browser pada toko nyata, hasil unit/build/lint, dan batas yang belum diuji.

## O: Acceptance

- Halaman toko tampil dengan header dan footer situs; navigasi utama bekerja.
- Produk digital dan jasa approved toko tampil; jasa yang diklik dari katalog ditemukan di toko.
- Bukti kepercayaan memakai data nyata; saat kosong tampil "Belum ada ulasan" dan bukan angka palsu.
- Kontak tampil hanya bila seller mengisinya.
- Pengurutan/pencarian bekerja, dan daftar panjang tidak dipotong diam-diam.
- Metadata dan data terstruktur valid; `og:image` memakai logo bila ada.
- Tidak ada field privat yang bocor ke publik; proyeksi tetap server-only.
- Mobile satu kolom, target 44px, tanpa geser horizontal; keyboard-only dapat menelusuri seluruh halaman.
- Tests/build dilaporkan apa adanya, tanpa klaim yang belum dijalankan.
