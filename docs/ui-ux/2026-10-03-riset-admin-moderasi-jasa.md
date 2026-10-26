# Riset UI/UX admin moderasi jasa

Tanggal: 2026-10-03. Metode: inspeksi source, bukan observasi browser.

## Temuan

Halaman `src/routes/_authenticated/admin/seller.jasa.tsx` sudah ditulis ulang pada tahap sebelumnya, belum diverifikasi. `admin-ui.tsx` menyediakan `AdminPageHeader`, `useCan`, dan `ForbiddenState`; gunakan standar itu. Backend existing menyediakan dua antrean berpaginasi dengan total server: moderasi (`services.view`, keputusan `services.update`) dan komplain (`orders.view`, keputusan `orders.update`/`refunds.approve`).

Gap tersisa: tab manual belum mempunyai navigasi panah/tabpanel; akun orders-only membuka tab moderasi; panel komplain tanpa izin kosong; alasan dapat diedit ketika mutation berjalan; scope komplain dibatasi tiga baris; tidak ada refresh normal; refund penuh tidak memiliki konfirmasi; copy empty membuat klaim terlalu luas.

## Arah

Panel keputusan admin, tenang, mobile-first sesuai arah Ebrystore. ENERGY 1 / RHYTHM 2 / MOTION 2. Warna/token dan font existing menjaga konsistensi; badge menandai status nyata; kartu memisahkan tiap keputusan; ruang antarseksi memisahkan kontrak dari aksi; transisi pendek membantu perubahan panel, bukan dekorasi. Tidak ada gambar, KPI buatan, atau dependency baru.

## Rekomendasi

Gunakan Tabs Radix existing untuk keyboard dan relasi panel. Pilih tab berdasarkan izin; pertahankan panel saat berpindah agar alasan tidak hilang. Gunakan header admin, refresh, skeleton/error/empty shared. Kontrak terbaca penuh; disclosure punya aria-expanded. Kunci input saat pending, alasan minimal lima karakter. Refund penuh memerlukan dialog konfirmasi existing. Jangan menjalankan keputusan nyata saat pengujian.

## Batas

Tidak mengubah database, permission, query contract, policy refund, atau membuka checkout. Tidak menyimpulkan keamanan dana dari antrean kosong. Verifikasi GUI belum dilakukan.
