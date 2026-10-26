# Pembaruan UI Dashboard Pengguna

## Ringkasan
Memperbarui `/dashboard` menjadi pusat aktivitas pelanggan yang lebih ringkas, mobile-first, dan berorientasi tindakan. Perubahan hanya pada presentasi frontend; alur transaksi, query, dan permission tetap dipertahankan.

## Yang Akan Dibangun
1. **Header dashboard yang lebih ringan**
   - Greeting, avatar, dan identitas pengguna tanpa hero/kartu dekoratif besar.
   - Ringkasan utama yang mudah dipindai: pesanan aktif, perlu dibayar, dan produk dimiliki.

2. **Pintasan layanan yang lebih ergonomis**
   - Menata ulang shortcut menjadi grid stabil untuk Produk Digital, Pesan Jasa, Pesanan, Produk Saya, Notifikasi, dan Bantuan.
   - Memperjelas hierarchy ikon, label, hover/focus, serta target sentuh mobile.

3. **Prioritas tugas dan pesanan aktif**
   - Blok “Perlu tindakan” muncul paling menonjol saat ada pembayaran, verifikasi, atau refund berjalan.
   - Kartu pesanan menampilkan status manusiawi, nomor pesanan, harga, tanggal, dan akses detail secara lebih jelas.

4. **Kabar terbaru yang lebih informatif**
   - Menampilkan notifikasi sebagai activity feed ringkas dengan waktu yang mudah dibaca.
   - Empty, loading, dan error state tetap konsisten dengan design system.

5. **Navigasi dashboard responsif**
   - Merapikan tab desktop dan bottom navigation mobile agar status aktif jelas dan tidak saling menutupi konten.
   - Memastikan layout nyaman pada layar kecil dan desktop.

## Detail Teknis
- Memperbarui route layout dashboard, halaman ringkasan, dan komponen kartu/shortcut bersama.
- Menggunakan token warna, typography, Button, status, dan ikon yang sudah ada.
- Tidak mengubah server function, skema database, RPC, atau aturan bisnis.
- Menjaga focus-visible, target sentuh minimal 44px, semantic heading, dan reduced-motion.

## Acceptance Criteria
- Dashboard menampilkan greeting, tiga ringkasan utama, enam pintasan, tugas yang perlu tindakan, pesanan aktif, dan kabar terbaru.
- Tindakan pembayaran/refund lebih menonjol daripada konten informasional.
- Bottom navigation mobile tidak menutup konten dan tab desktop tetap mudah digunakan.
- Seluruh tautan, loading/error/empty state, serta data dashboard tetap berfungsi.
- Tidak ada overflow atau overlap pada viewport mobile dan desktop.
- Typecheck/test relevan lulus dan hasil visual diverifikasi pada kedua viewport.
