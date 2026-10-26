# Riset homepage: banner slider dan jasa seller

## Permintaan
Ganti seluruh panel “Cari kebutuhan digitalmu di Ebrystore.” dengan banner yang diunggah admin. Tambahkan section jasa seller pada homepage. Jadikan `/layanan` katalog jasa seller yang sudah lolos moderasi. Tidak menjalankan agent.

## Temuan source
- `src/routes/index.tsx`: panel pencarian adalah `MarketplaceDiscovery`; `listServices` yang sudah ada hanya mengisi section pendampingan akademik platform.
- `src/routes/layanan.index.tsx`: pencarian, kategori, pagination sudah tersedia, tetapi membaca tabel `services` platform.
- `src/lib/catalog.functions.ts`: `listServices` membaca `services.status = published`, bukan `marketplace_services`.
- `supabase/migrations/20261003110000_marketplace_service_contract.sql`: jasa seller memiliki draft, in_review, approved, rejected, archived. Tidak ada status published. Anon tidak punya akses tabel. Edit jasa approved mengembalikannya ke draft; archive menghapus kelayakan tampil.
- Approval sebelumnya sengaja tidak membuka katalog publik. Permintaan saat ini mengubah batas itu untuk pembacaan katalog saja: approved menjadi kandidat publik bila toko aktif dan kategori service aktif/tidak dihapus.
- Checkout tetap ditutup oleh konstanta aplikasi dan RPC `MARKETPLACE_SERVICE_DISABLED`. Tidak perlu mengubah order, pembayaran, ledger, maupun RPC moderasi.
- `src/lib/website-settings.ts`: pengaturan banner hanya satu pasangan desktop/mobile dan fokus posisi. Path harus aset unggahan UUID pada `/api/public/catalog-image/branding/home/`.
- `admin/settings.website.tsx`: branding memakai izin `settings.branding.update`, save tervalidasi server, audit, invalidasi cache. Upload melalui server function, batas 3 MB dan JPG/PNG/WEBP/AVIF.
- `src/components/ui/carousel.tsx` dan dependency Embla sudah terpasang. Tidak perlu dependency tambahan.
- `SettingsPreview` masih memperagakan banner sebagai latar panel teks. Harus memakai renderer slider yang sama.

## Keputusan minimum
1. Pertahankan banner utama desktop/mobile yang sudah tersimpan. Tambahkan deskripsi aksesibel utama serta koleksi maksimal lima banner tambahan, masing-masing desktop, mobile opsional, dan teks alternatif.
2. Slider manual: swipe, panah, indikator halaman. Tanpa autoplay agar konten tetap dapat dibaca dan tidak membutuhkan kontrol pause. Gambar utuh (`object-contain`), tanpa teks UI di atas artwork. Kosong tidak membuat promo palsu; section banner tidak dirender.
3. Gunakan pembacaan server-only dengan client service role existing karena anon ditutup pada tabel. Terapkan seluruh kelayakan publik di query sebelum pagination. Proyeksi hasil hanya identitas jasa/toko/kategori, harga, dan kesepakatan; jangan kirim owner, kontak, catatan moderator, reviewer, atau field internal. Tidak membuka RLS maupun memberikan akses tabel kepada anon.
4. Endpoint tersendiri untuk jasa seller, agar katalog platform dan detail paket lama tetap berfungsi. Homepage menambah section jasa seller; section platform existing dipertahankan.
5. `/layanan` membaca endpoint seller, mempertahankan filter server dan pagination. Kartu menyediakan rincian kesepakatan melalui disclosure native; tidak mengarahkan jasa seller ke slug layanan platform. Tampilkan batas checkout secara eksplisit.
6. Perbarui label seller/admin agar tidak mengklaim approval masih tersembunyi. Disetujui berarti tampil di katalog jika toko/kategori memenuhi syarat, bukan bisa dibeli.

## Design Read dan tujuan
Marketplace publik untuk pembeli Ebrystore, memakai arah Friendly, Fast, Simple, Trustworthy, Mobile-First dari `docs/ui-ux/01-ebrystore-design-direction.md`. ENERGY 2 / RHYTHM 2 / MOTION 1.
- Warna dan font existing: mempertahankan identitas, bukan membuat tema baru.
- Banner lebar: artwork admin menjadi fokus tanpa ditutup panel pencarian lama.
- Kontrol di permukaan solid: kontras tidak bergantung gambar promo.
- Kartu jasa berisi harga, toko, durasi, revisi: membantu membandingkan pekerjaan nyata.
- Disclosure native: rincian panjang tetap terbaca dan dapat dioperasikan keyboard.
- Jarak antar section: memisahkan produk digital, jasa seller, dan layanan platform.

## Batas bukti
Riset ini berbasis source, bukan inspeksi visual browser. Data approved tidak diciptakan dan keputusan moderasi/refund tidak dijalankan untuk pengujian. Tidak ada migrasi/deploy database yang diperlukan untuk pendekatan server-only ini.
