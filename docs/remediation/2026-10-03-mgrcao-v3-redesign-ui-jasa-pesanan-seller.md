# MGRCAO V3: redesain UI/UX pesanan jasa seller

Tanggal: 2026-10-03. Dasar: [riset redesain UI pesanan jasa](../ui-ux/2026-10-03-riset-redesign-ui-jasa-pesanan-seller.md). Status: framework untuk pekerjaan berikutnya; belum dieksekusi.

## M: Mindset

Halaman ini satu layar keputusan: pesanan mana yang harus dikerjakan sekarang. Setiap keputusan visual harus membantu menjawab itu. Kerja dulu, riwayat kemudian. Satu kartu menjawab satu pertanyaan: apa keadaannya, apa langkah berikutnya, berapa nilainya, kapan tenggatnya.

Ini pekerjaan UI murni. Tidak ada RPC baru, tidak ada migration, tidak ada perubahan aturan uang atau lifecycle. Semua data yang ditampilkan sudah tersedia dari `listMyServiceOrders` dan `getSellerServiceOrder`.

Design Read: daftar kerja seller marketplace, untuk penjual yang memantau beberapa pesanan sekaligus, bahasa visual dashboard transaksional, dial ENERGY 1 / RHYTHM 2 / MOTION 1.

## G: Goal

1. Setiap kartu tertutup menjawab: status, langkah berikutnya, nilai, tenggat.
2. Tenggat punya tiga tingkat urgensi yang terlihat (lewat, kurang 24 jam, normal).
3. Detail berlapis: aksi dulu, lalu kebutuhan pembeli, agreement terlipat, riwayat hasil.
4. Bahasa visual selaras dengan `seller.pesanan` + `SellerOrderCard`.
5. Setiap status kerja punya satu baris penjelas "apa artinya bagi saya".
6. Form kirim hasil ringkas: segmented control jenis, input sesuai jenis, satu tombol utama.
7. Mobile-first: satu kolom, target 44px, tanpa geser horizontal yang tidak perlu.
8. Tidak ada regresi aksesibilitas, realtime, atau alur yang sudah bekerja.

## R: Role

Frontend/UI/UX specialist untuk dashboard seller marketplace, bekerja sendiri tanpa spawn agent. Mandat terbatas pada:

- `src/routes/_authenticated/seller.jasa-pesanan.tsx`.
- Komponen baru di `src/components/seller/` bila kartu perlu dipisah.
- Test terkait di `src/lib/__tests__/`.

Di luar allowlist: berhenti dan catat blocker. Tidak menyentuh RPC, migration, jalur uang, atau halaman lain kecuali satu penyesuaian kecil yang memang diperlukan untuk konsistensi.

## C: Constraints

- Tanpa dependency baru. Gunakan `motion/react`, komponen shared `EmptyState`/`ErrorState`/`CardSkeleton`/`StatusPill`/`CountUp`, dan token desain yang sudah ada.
- Tanpa data karangan. Semua angka dari `counts` dan `row` yang sudah ada.
- Pertahankan `role="tablist"`, `aria-selected`, `aria-label`, `aria-current`, focus ring, dan `useReducedMotion`.
- Jangan mengubah kontrak `marketplaceServiceDeliverySchema`, RPC delivery, atau alur persetujuan requirements.
- Jangan menambah `shadow` sebagai default; bayangan hanya untuk elevasi yang punya alasan.
- Bahasa Indonesia, tanpa em dash, tanpa buzzword.
- Setiap keputusan visual punya alasan satu baris yang bisa ditulis.

## A: Actions

1. Kepala halaman: judul + deskripsi kerja, lalu tiga angka ringkas (menunggu aksi, dikerjakan, revisi) dari `counts`, dengan tautan cepat ke tab terkait.
2. Pisah kartu pesanan menjadi komponen `ServiceOrderCard` di `src/components/seller/` mengikuti kerangka `SellerOrderCard` (kepala, isi, kaki).
3. Tambah badge "langkah berikutnya" yang dihitung dari `work_state` + status order + flag komplain.
4. Tambah chip tenggat tiga tingkat dengan ikon jam dan warna sesuai urgensi.
5. Tambah kotak ringkas kebutuhan pembeli pada kartu tertutup bila datanya tersedia dari daftar; jika tidak, tampilkan setelah detail dimuat tanpa fetch tambahan.
6. Susun ulang detail: aksi, kebutuhan pembeli, agreement terlipat, riwayat hasil dengan ikon per jenis.
7. Ringkas form kirim hasil: segmented control jenis, input kondisional, tombol utama tunggal.
8. Tambah peta penjelas per `work_state` yang dipakai di kartu dan detail.
9. Selaraskan tipografi metadata: nomor pesanan mono tebal, nilai uang tegas, label status konsisten.
10. Tests: kontrak source untuk hierarki kartu, badge langkah berikutnya, tingkat urgensi, penjelasan status, dan aksesibilitas yang dipertahankan.
11. Evidence: klik-through browser pada halaman seller nyata, hasil unit/build/lint, dan batas yang belum diuji.

## O: Acceptance

- Kartu tertutup menampilkan status, langkah berikutnya, nilai, dan tenggat tanpa perlu membuka detail.
- Tenggat lewat, kurang 24 jam, dan normal terlihat berbeda.
- Detail mengikuti urutan aksi → kebutuhan → agreement terlipat → riwayat.
- Form kirim hasil tetap mendukung tautan, catatan, dan berkas dengan validasi yang sama.
- Tablist, aria, focus ring, dan reduced motion tetap bekerja; keyboard-only dapat mengoperasikan seluruh aksi.
- Tampilan satu kolom di mobile tanpa geser horizontal; target sentuh minimal 44px.
- Tidak ada perubahan pada RPC, migration, atau jalur uang.
- Tests/build dilaporkan apa adanya; klik-through dicatat per elemen, tanpa klaim yang belum dijalankan.
