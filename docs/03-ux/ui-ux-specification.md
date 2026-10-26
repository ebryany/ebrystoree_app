# Sitemap, User Flow & UI/UX Specification

## Sitemap
```text
Publik: / • /produk • /produk/$slug • /layanan • /layanan/$slug • /kategori/$slug
        /checkout • /pembayaran/$paymentId • /cek-pesanan
        /tentang • /faq • /kontak • /syarat • /privasi • /kebijakan-refund
        /auth (login, daftar, lupa password) • /reset-password

Customer  (_authenticated): /akun • /akun/pesanan • /akun/pesanan/$id
          /akun/produk-saya • /akun/invoice • /akun/notifikasi • /akun/profil
Operator  : /operator • /operator/tugas • /operator/tugas/$id
Finance   : /finance • /finance/verifikasi • /finance/verifikasi/$id • /finance/refund
Support   : /support/komplain • /support/komplain/$id
Admin     : /admin (overview) • /admin/produk • /admin/layanan • /admin/pesanan
            /admin/pembayaran • /admin/operator • /admin/penugasan • /admin/refund
            /admin/pengguna • /admin/konten • /admin/laporan • /admin/audit-log • /admin/pengaturan
```

## Alur Kunci
1. **Produk digital:** katalog → detail → checkout → pilih metode → bayar → konfirmasi server → halaman "Produk Saya" → unduh (signed URL).
2. **Jasa:** layanan → pilih paket & add-on → isi kebutuhan + unggah lampiran → checkout → bayar → timeline progres → review hasil → setujui atau minta revisi → selesai → ulasan.
3. **Manual payment:** instruksi transfer → unggah bukti → menunggu verifikasi → keputusan finance → notifikasi.

## State Wajib per Halaman
Default, loading (skeleton), empty (dengan ajakan aksi), validation inline, error dengan aksi coba lagi, unauthorized (ajakan masuk), forbidden, expired (mis. link unduh/pembayaran kedaluwarsa), success, dan responsif mobile-first.

## Design System
- Token warna, tipografi, radius, dan bayangan didefinisikan sebagai token semantik di `src/styles.css`; komponen tidak boleh memakai kelas warna literal.
- Arah visual: bersih dan tegas, aksen tunggal hangat (bukan gradasi ungu generik), tipografi berkarakter untuk judul dan sans netral untuk teks.
- Komponen inti: CatalogCard, PriceTag, StatusBadge (satu warna per kelompok status), OrderTimeline, ProgressBar, FileDropzone, PaymentInstructionCard, DataTable dengan filter, EmptyState, ConfirmDialog untuk aksi berisiko.
- Aksesibilitas: kontras AA, fokus terlihat, label form eksplisit, dapat dioperasikan keyboard, pesan error terhubung ke input.