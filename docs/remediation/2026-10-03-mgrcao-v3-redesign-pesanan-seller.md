# MGRCAO V3: redesign UI/UX halaman pesanan toko seller

Tanggal: 2026-10-03. Dasar: [riset layout pesanan seller](../audit/2026-10-03-riset-layout-pesanan-seller.md), [DESIGN.md](../../DESIGN.md). Status: dieksekusi pada pekerjaan ini; backend tidak berubah.

## M: Mindset

Halaman pesanan seller menjawab tiga pertanyaan: apa yang perlu dikerjakan, mana yang masih ditahan, dan mana yang bermasalah. Satu halaman satu sumber kebenaran (antrean monitoring), satu kartu per pesanan, detail finansial di balik ekspansi. Duplikasi list dan tiga kosakata filter adalah akar kebingungan dan dihapus, bukan diperbaiki kosmetik.

## G: Goals

1. Tab status dengan angka nyata: Perlu tindakan, Menunggu penerimaan, Refund aktif, Semua; default Perlu tindakan.
2. Satu kartu per pesanan: nomor + waktu + pill status, baris antrean dengan umur tunggu, chip kesiapan item + tautan Kelola produk, ringkasan dana satu baris, chip refund.
3. Rincian dana penuh di ekspansi accordion.
4. Animasi halus dari library motion existing (tab indikator, stagger kartu, accordion, count-up), hormat reduced-motion.
5. Skeleton, empty state per tab, paginasi, dan realtime refresh tetap bekerja.
6. Mobile 390px rapi; tab digeser horizontal; target sentuh 44px.

## R: Role

Engineer UI/UX halaman data seller dengan kendala token existing, motion existing, dan backend existing (RPC `list_order_monitoring` tanpa perubahan). Scope: satu route + satu komponen kartu baru. Bukan role untuk membuat route detail pesanan seller, mengubah RPC, atau menyentuh halaman admin.

## C: Context

- Data single-source: `listOrderMonitoring` (scope seller, filter actions/delivery_blocked/awaiting_receipt/refund_active/all, halaman 15, counts, total).
- Komponen existing yang dipakai ulang: `CountUp` (report-widgets), `StatusPill`, `Button`, realtime hook (pemicu notifications seller).
- `listSellerOrders`/RPC list_my_store_orders tetap ada untuk pemakai lain; pemakaiannya di halaman ini dilepas karena kartu baru berbasis monitoring.
- Tidak ada route detail pesanan seller; tindakan nyata saat ini: Kelola produk (product_id), selebihnya pasif.
- Animasi hanya dari `motion/react`; pola tab indikator/stagger/accordion dipindahkan dari referensi motion-primitives ke token Ebrystore.

## A: Actions

1. Komponen baru `src/components/seller/seller-order-card.tsx`: kartu pesanan presentasional (kepala, baris antrean, item chip, ringkasan dana, chip refund, accordion rincian dana) dengan motion + reduced-motion.
2. Tulis ulang `seller.pesanan.tsx`: header + tab beranimasi dengan CountUp + daftar kartu (AnimatePresence stagger) + skeleton + empty state per tab + paginasi; realtime refresh keys diperbarui; hapus OrderMonitoringList dan SegmentedFilter dari halaman.
3. Test static: halaman single-source monitoring, tanpa import list ganda, tab memakai counts nyata, animasi hormat reduced-motion, paginasi dan realtime tetap.

## Acceptance checks

| ID | Kasus | Hasil wajib |
|---|---|---|
| PS-01 | Tab aktif default | "Perlu tindakan" terbuka pertama dengan angka nyata |
| PS-02 | Pindah tab | Daftar terganti dengan animasi; angka tab sesuai counts server |
| PS-03 | Item belum siap | Chip "Belum siap" + tautan Kelola produk muncul |
| PS-04 | Rincian dana | Ekspansi membuka dl dana lengkap; tertutup secara default |
| PS-05 | Refund aktif | Chip refund dengan label status terbaca |
| PS-06 | State | Skeleton saat muat; empty state per tab bermakna; error dengan muat ulang |
| PS-07 | Mobile 390px | Tab bisa digeser; kartu tanpa overflow; sentuh 44px |
| PS-08 | Reduced motion | Semua animasi mati; konten tetap lengkap |

## O: Outputs

- Route + komponen kartu baru, test static, verifikasi (prettier, lint, unit, tsc diff, build). GUI tidak dinyalakan; klaim klik-through diganti pemeriksaan kode. Rollback: revert dua file.
- Tidak termasuk: route detail pesanan seller, pencarian nomor order (butuh dukungan server), perubahan SQL, halaman lain.
