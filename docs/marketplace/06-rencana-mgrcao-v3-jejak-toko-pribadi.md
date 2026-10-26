# 06 — Rencana Eksekusi MGRCAO V3: Pembersihan Jejak Toko Pribadi di Admin

Tanggal: 2026-10-02 · Sumber temuan: [`05-jejak-toko-pribadi-admin.md`](./05-jejak-toko-pribadi-admin.md)
Status: **RENCANA — MENUNGGU KONFIRMASI OWNER SEBELUM EKSEKUSI**

---

## M — Mindset

1. **Problem-first**: yang diperbaiki hanya yang terbukti menyesatkan operasi marketplace
   (bukti di dokumen 05), bukan kosmetik menyeluruh.
2. **UI mengikuti kontrak server**: tidak ada angka/label baru yang tidak datang dari
   data nyata (R-17, anti-slop). GMV/fee/payout yang datanya belum ada → slice-nya
   digate, bukan dipalsukan.
3. **Evolusi aditif**: tidak ada migrasi schema pada rencana ini; semua perubahan
   server function (scope query) + UI. Rollback = revert file.
4. **Jaga arah visual Ebrystore**: ink-teal, low elevation, mobile-first, tanpa glow/
   gradient/background dekoratif (keputusan Owner sebelumnya).
5. **Legacy akademik tidak disentuh** (aturan 11 AGENTS.md + keputusan M-11): Pengerjaan
   Jasa & PO Custom hanya diberi LABEL, workflow-nya tidak diubah.
6. **Isolasi & moderasi tidak boleh menurun**: penyempitan scope admin TIDAK boleh
   menghilangkan kemampuan moderasi yang sudah ada.

## G — Goal (target terukur + acceptance criteria)

### Slice 1 — A-1: "Produk Platform Store" (siap)

| Aspek | Target |
|---|---|
| Masalah | `admin/produk.tsx` mengelola SEMUA produk termasuk milik seller (`listAdminProducts` tanpa filter toko) |
| Target | Halaman hanya menampilkan & mengedit produk platform; produk seller hanya lewat Moderasi |
| Acceptance | (a) `listAdminProducts` menambah filter `store_id IS NULL`; (b) judul+meta = "Produk Platform Store"; (c) ada tautan silang ke Moderasi Produk; (d) seller melihat produknya tetap normal; (e) jumlah produk di halaman = jumlah produk platform (dicek di browser) |

### Slice 2 — A-5: Kolom "Toko" di Transaksi (siap)

| Aspek | Target |
|---|---|
| Masalah | Daftar order/pembayaran/refund tidak menampilkan seller |
| Target | Kolom "Toko" (snapshot nama) + filter per toko di daftar order |
| Acceptance | (a) `listOrders`/`listPayments`/`listRefunds` memproyeksikan `store_name_snapshot` dari `order_items` (invariant M-02: satu seller per order → ambil item pertama); (b) kolom tampil di UI ketiga daftar; (c) order multi-item platform tetap tampil "-" atau "Platform"; (d) empty state tetap benar |

### Slice 3 — A-6: Label "Layanan Platform" (siap)

| Aspek | Target |
|---|---|
| Masalah | "Pengerjaan Jasa"/"PO Custom" tidak dibedakan dari penjualan produk seller |
| Target | Label grup "Layanan Platform" di navigasi + sub-judul di kedua halaman |
| Acceptance | (a) navigasi memberi konteks; (b) tidak ada perubahan workflow/RPC sama sekali |

### Slice 4 — A-2/A-3/A-4: Setting Marketplace, Dashboard GMV/fee/payout, Laporan (GATED)

| Aspek | Target |
|---|---|
| Prasyarat (semua wajib, urut) | 1) Engine fee aktif (peta 04 P0-C); 2) Finalisasi O-01 (fee %), O-03 (jadwal payout), O-04 (hold); 3) Konsultasi legal O-05 untuk angka payout |
| Target | Grup setting "Marketplace"; dashboard dua lapis GMV vs pendapatan platform + antrean marketplace; baris GMV→fee→kewajiban di Laporan |
| Acceptance | Ditulis ulang saat slice di-unlock — TIDAK dieksekusi dalam rencana ini. Angka yang datanya belum ada (fee earned, payout due) dilarang ditampilkan sebagai nol palsu |

## G-UI — Lapisan UI/UX (tambahan Owner: "lebih better, pakai library")

Direction resmi kini terdokumentasi di [`DESIGN.md`](../../DESIGN.md) (root) — tulis
ulang keputusan Owner yang sudah ada (ink-teal, low elevation, mobile-first) + matriks
adopsi library, supaya setiap slice konsisten. Untuk rencana ini, lapisan UI/UX per slice:

| Slice | Penyempurnaan UI/UX (semua lolos purpose test) | Library/pola sumber |
|---|---|---|
| 1 | Header halaman pola baru: judul + banner crosslink yang jelas; ikon relevan pada banner (bukan dekorasi kosong); empty-state platform store diberi ilustrasi teks yang jujur | Pola ui-layouts/motion-primitives, port ke token Ebrystore |
| 2 | Kolom "Toko" pakai **chip/initial** (inisial toko + warna dari `CHART_PALETTE` deterministik per nama) bukan teks polos — mempercepat pemindaian; tooltip nama lengkap | Pola avatar/initial bawaan (`avatar.tsx`) |
| 3 | Grup navigasi "Layanan Platform" diberi penanda halus (ikon + sub-teks "dijalankan operator Ebrystore") | Komponen sidebar existing |
| Umum | Transisi masuk konten ≤200ms fade/translate (menghormati reduced-motion); hover states konsisten; skeleton loading yang sudah ada dipertahankan | motion (terpasang) |

**Aturan ketat lapisan UI:**
1. Tanpa dependency baru — `motion` sudah terpasang; pola library lain di-port ke kode
   (copy pattern, tulis ulang pakai token), bukan dipasang mentah (CSP self-only,
   tidak ada CDN).
2. Background generator (neat/feralui/patterncraft): hanya inspirasi **pola statis**
   untuk zona dekoratif yang ditunjuk DESIGN.md; di halaman tabel/data: tidak ada.
3. uiverse.io: standarnya tidak lolos filter (glow/pill berlebihan); lewati kecuali ada
   satu komponen spesifik yang lolos purpose test dengan alasan tertulis.
4. Hard gate tetap: em-dash 0, angka tanpa sumber 0, mobile 390px overflow 0,
   keyboard reachable, bukti klik-through per halaman.

## R — Role

Frontend engineer (UI admin) + backend ringan (scope query pada server function yang
sudah ada). Tidak ada role baru; tidak ada permission baru (`products.view`,
`orders.view`, `payments.view`, `refunds.view` yang ada dipertahankan).

## C — Context (bukti yang sudah diverifikasi 2026-10-02)

- `listAdminProducts` (`admin.functions.ts:197-215`): select tanpa filter `store_id`;
  halaman `admin/produk.tsx` berjudul "Produk digital".
- `listOrders` (`admin-transaction.functions.ts:28`): select `id, order_number,
  order_type, status, total, created_at, expired_at, user_id` — tanpa toko.
- `listPayments` (:145): sudah join `orders(...)` — jalur penambahan toko paling mudah.
- `listRefunds` (:236): select `*, orders(...)` — pola sama.
- Navigasi admin & badge `is_platform` sudah ada; backfill produk legacy ke platform
  store sudah jalan (`20260930100013`).
- Invariant M-02 (satu seller per order) berlaku untuk MVP → kolom toko valid diambil
  dari `order_items[0].store_name_snapshot`.
- Keputusan Owner aktif: visual Ebrystore (M-10), anti AI-slop, migrasi aditif,
  Lovable no-force-push.

## A — Action (urutan eksekusi per slice)

**Slice 1:**
1. `admin.functions.ts` → `listAdminProducts`: tambah `.is("store_id", null)` + filter
   `data.search` tetap sama; hitung count setelah filter.
2. `admin/produk.tsx`: judul/meta "Produk Platform Store", deskripsi jujur, banner
   kecil "Produk seller dikelola lewat Moderasi Produk" + link.
3. Cek `saveProduct`/`deleteProduct`: saat edit, tolak produk bertoko (guard
   aplikasi; catat di laporan sebagai hardening opsional untuk moderasi darurat).

**Slice 2:**
1. `listOrders`: nested select `order_items(store_name_snapshot)` → proyeksikan
   `storeName` (item pertama; NULL → "Platform").
2. `listPayments`/`listRefunds`: pola sama lewat join `orders` yang sudah ada.
3. UI tiga tabel: kolom "Toko" (truncate + title); filter dropdown toko di orders
   (opsi dari daftar toko yang sudah ada di `listStoresForAdmin`, lazy — hanya jika
   effort tetap kecil; kalau tidak, defer dengan catatan).

**Slice 3:**
1. Navigasi admin (`admin/route.tsx` atau komponen sidebar): grup "Layanan Platform"
   berisi Pengerjaan Jasa + PO Custom; label baru di meta/judul halaman.
2. Tidak menyentuh `fulfillment.functions.ts`/`po.functions.ts` sama sekali.

**Setiap slice**: implementasi (server scope dulu, lalu UI dengan lapisan G-UI) →
`npx eslint --fix` file terubah → `npm run test:unit` hijau → build → verifikasi
browser (klik-through halaman terkait + cek mobile 390px overflow 0 + cek kontras
chip toko terhadap WCAG AA) → catat bukti → slice berikutnya.

## O — Output

1. Tiga slice siap dieksekusi berurutan dalam satu sesi (est. total: 1 sesi kerja).
2. `DESIGN.md` (root) — direction visual Ebrystore yang selama ini tersebar, jadi acuan
   satu halaman untuk semua pekerjaan UI berikutnya (termasuk pembacaan dials & matriks
   adopsi library).
3. Slice 4 tetap terdokumentasi sebagai GATED dengan syarat eksplisitnya.
4. Laporan evidence: file berubah + screenshot sebelum/sesudah + hasil klik-through
   (delivery gate R-35) + status jujur per acceptance criteria.
5. Update Decision Register: catatan keputusan A-1 (kebijakan edit produk seller oleh
   admin) sebagai item O-13 bila Owner mau memutuskan.
6. Delivery gate anti-slop: em-dash 0, overflow mobile 0, tanpa angka tanpa sumber,
   tanpa section duplikat, semua kontrol berfungsi.

### Non-goals (dilarang masuk)

- Engine fee, angka GMV/fee/payout (Slice 4 gated).
- Perubahan schema, permission, RLS, RPC finansial.
- Workflow akademik/PO (M-11) — hanya label.
- Redesign visual halaman lain.

### Risiko & rollback

| Risiko | Mitigasi |
|---|---|
| Penyempitan `listAdminProducts` merusak halaman lain pemakai fungsi ini | Fungsi hanya dipakai `admin/produk.tsx` (dicek); tetap diverifikasi build + klik-through |
| Kolom toko memperlambat query daftar | Nested select terbatas `store_name_snapshot`; order terpaginasi |
| Label menyesatkan kalau nanti layanan ikut di-seller-kan | Label "Layanan Platform (dijalankan operator Ebrystore)" — deskriptif, bukan permanen |

Rollback: revert file TSX/server fn per slice; tidak ada migrasi → tanpa risiko data.
