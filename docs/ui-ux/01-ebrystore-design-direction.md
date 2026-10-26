# Arah Desain Ebrystore

Karakter: Friendly · Fast · Simple · Trustworthy · Mobile-First · Transaction-Focused.

Komposisi: 70% prinsip pengalaman aplikasi layanan modern (kemudahan pakai), 30% identitas visual khas Ebrystore. Tidak meniru bentuk visual, warna merek, ikon, ilustrasi, atau copywriting platform lain.

## Prinsip
1. Layanan mudah ditemukan lewat shortcut + kategori nyata dari database.
2. Informasi berlapis: Ringkasan → Pilihan → Detail → Ketentuan → Ulasan.
3. Status memakai bahasa manusia dan selalu disertai ikon + label + penjelasan.
4. CTA utama selalu terjangkau ibu jari (sticky bottom pada mobile).
5. Satu design system untuk publik, customer, admin, operator; kepadatan yang berbeda.

## Struktur Customer Home (usulan)
1. Greeting + notifikasi penting
2. Shortcut layanan (Produk Digital, Pesan Jasa, Pesanan, Produk Saya, Bantuan, Refund)
3. Perlu tindakan (bayar, unggah bukti, review hasil, revisi, refund)
4. Order aktif (nama item, status, progres, estimasi, CTA)
5. Rekomendasi (populer / terbaru — data nyata saja)
6. Promo maksimal 1–2 banner

## Mobile Navigation
- Customer: Beranda · Pesanan · Produk Saya · Notifikasi · Akun (ikon + label).
- Operator: Beranda · Tugas · Revisi · Notifikasi · Profil.
- Admin: drawer + sticky topbar + command search (tanpa bottom nav).
- Publik: header ringkas + search + drawer, CTA utama tetap terlihat.

## Benchmark 5 halaman pertama
1. Customer Home (`/dashboard`)
2. Service Detail (`/layanan/$slug` — dibuat baru)
3. Checkout (`/checkout/produk/$slug`)
4. Customer Order Detail (`/dashboard/pesanan/$id`)
5. Admin Order Detail (`/admin/orders/$id`)
