# MGRCAO V3: redesain admin orders standar marketplace

Tanggal: 2026-10-03. Dasar: [riset redesain admin orders](../ui-ux/2026-10-03-riset-redesign-admin-orders.md). Status: dikerjakan.

## M: Mindset

Halaman order admin bukan arsip, melainkan **papan kerja**. Admin membukanya untuk menjawab: pesanan mana yang menunggu saya, apa yang harus dilakukan, dan berapa nilainya. Semua keputusan visual melayani itu.

Standar marketplace yang dituju: baris pesanan dengan hierarki jelas (nomor, nilai, pembeli, toko), penanda tindakan berikutnya, dan detail berbentuk perjalanan pesanan, bukan tumpukan field.

Satu hal yang harus jujur: jenis `marketplace_service` sudah aktif tetapi tidak dapat disaring di halaman ini. Itu celah fungsional, bukan sekadar kosmetik.

## G: Goal

1. Filter jenis menyertakan **Jasa seller** (`marketplace_service`).
2. Ringkasan kerja di atas daftar: menunggu verifikasi, dikerjakan, refund aktif, selesai hari ini.
3. Daftar berbentuk kartu baris dengan hierarki: nomor, jenis, nilai, pembeli, toko, waktu, dan **langkah berikutnya**.
4. Detail order menampilkan **perjalanan pesanan** (timeline) dan ringkasan tindakan.
5. Detail `marketplace_service` menampilkan kontrak jasa: kesepakatan, kebutuhan pembeli, tenggat, hasil, revisi.
6. Mobile: satu kolom, tanpa geser horizontal.
7. Tidak mengubah alur keputusan (verifikasi, refund, moderasi); hanya penyajian.
8. Angka ringkasan dihitung dari data nyata.

## R: Role

Frontend/UI/UX Specialist untuk dashboard admin marketplace, bekerja sendiri tanpa spawn agent. Mandat:

- `src/routes/_authenticated/admin/orders.index.tsx` dan `orders.$id.tsx`.
- `src/lib/admin-transaction.functions.ts` untuk penambahan field read-only pada `getOrderDetail` (kontrak jasa).
- Komponen baru di `src/components/admin/` bila perlu.
- Test terkait.

Di luar allowlist: berhenti dan catat blocker. Tidak menyentuh keputusan uang, RPC, atau migration.

## C: Constraints

- Tidak mengubah perilaku verifikasi pembayaran, refund, atau moderasi.
- Data pribadi yang ditampilkan tidak melebihi yang sudah ada untuk admin `orders.view`.
- Ringkasan angka hanya dari query nyata; bila tidak tersedia, jangan tampilkan.
- Pertahankan realtime refresh dan ekspor CSV yang sudah ada.
- Tanpa dependency baru; gunakan komponen existing (`StatusPill`, `LiveOrderTimeline`, `DetailCard`, `Pagination`).
- Aksesibilitas: target 44px, focus ring, reduced motion.
- Bahasa Indonesia, tanpa em dash.

## A: Actions

1. Tambah `marketplace_service` ke filter jenis; label "Jasa seller".
2. Ringkasan kerja dari data daftar: hitung status yang relevan; bila perlu tambah query ringan terpisah.
3. Ubah daftar menjadi kartu baris dengan ikon jenis, nilai tegas, inisial pembeli, nama toko, dan baris langkah berikutnya.
4. Filter lanjutan (tanggal, urutan) dilipat agar layar tidak penuh.
5. Detail: header dengan status dan aksi kontekstual; ringkasan tindakan; timeline perjalanan.
6. Perluas `getOrderDetail`: kembalikan kontrak jasa, delivery terakhir, dan event untuk `marketplace_service`.
7. Kartu detail jasa seller: kesepakatan, kebutuhan pembeli, tenggat, hasil, revisi.
8. Test kontrak dan verifikasi browser.

## O: Acceptance

- Filter jenis menampilkan dan menyaring `marketplace_service`.
- Ringkasan kerja menampilkan angka nyata, bukan nol palsu.
- Setiap baris daftar menjawab: nomor, jenis, nilai, pembeli, toko, waktu, dan langkah berikutnya.
- Detail order menampilkan perjalanan pesanan, bukan hanya daftar field.
- Detail jasa seller menampilkan kontrak dan hasil pekerjaan.
- Mobile tanpa geser horizontal; target sentuh 44px.
- Realtime dan ekspor CSV tetap bekerja.
- Tests/build dilaporkan apa adanya.
