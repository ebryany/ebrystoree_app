# Riset aktivasi checkout jasa seller

Tanggal: 2026-10-03. Permintaan: "oke aktifkan" setelah kartu katalog tidak membuka checkout. Dikerjakan sendiri, tanpa agent.

## Temuan source dan database aktual

- `src/components/home/seller-service-card.tsx` hanya membuka kesepakatan, tanpa tujuan checkout.
- `src/lib/marketplace-service.functions.ts:createMarketplaceServiceOrder` mengembalikan pesan disabled tanpa RPC.
- RPC live `create_marketplace_service_order(uuid,text)` hanya melempar `MARKETPLACE_SERVICE_DISABLED`.
- Pemeriksaan read-only melalui Management API disimpan di `.zcode/checkout-jasa-live-before.json`. Constraint live `orders_order_type_check` belum menerima `marketplace_service`; `order_items` masih menerima digital_product/service/addon/fee.
- `order_items.service_id` menunjuk layanan platform, bukan marketplace_services. Jasa seller perlu FK sendiri; jangan memasukkan ID seller ke FK platform.
- Dua migration kontrak/dispatch sudah tercatat. Jalur verifikasi manual, gateway, refund, acceptance, dan ledger tersedia, tetapi belum pernah terbuka dari checkout.
- `activate_paid_marketplace_service` dan `approve_service_requirements` memanggil `jsonb_typeof(jsonb_extract_path_text(...))`. Fungsi menerima jsonb, bukan text. Perbaikan harus menggunakan `jsonb_extract_path` sebelum aktivasi transaksi.
- Seller menyetujui kebutuhan setelah pembayaran. Durasi mulai ketika seller menyetujui kebutuhan, bukan ketika listing dibuka atau order dibuat.
- `credit_seller_earnings` memerlukan pembayaran lunas, acceptance, dan tidak ada refund aktif. Trigger marketplace tidak melepas dana saat pembayaran.
- Halaman `/dashboard/pesanan/$id` sudah menyediakan pembayaran DANA/QRIS, saldo, pembatalan, riwayat. Komponen buyer jasa terdapat di `/dashboard/jasa/$id`, tetapi belum dihubungkan dari detail pesanan umum.
- Filter daftar pesanan customer `service` hanya memasukkan layanan platform; perlu menyertakan marketplace_service.

## Kontrak implementasi

1. Route khusus `/checkout/jasa/$id`, tidak memakai checkout akademik berbasis slug/paket.
2. Kartu menyediakan tautan judul dan tombol Pesan jasa ke route tersebut; tautan toko tetap terpisah.
3. Preview checkout melalui RPC authenticated dengan proyeksi nama, harga, agreement, versi, toko, kategori, biaya admin, total. Bukan SELECT unrestricted pada tabel privat.
4. Buyer memasukkan kebutuhan 10 sampai 5000 karakter dan menyetujui agreement secara eksplisit. Tidak meminta kata sandi atau kredensial akun.
5. RPC creation memvalidasi auth, orders.create, feature_checkout, approval, toko/kategori aktif, bukan toko sendiri, versi dan total terbaru. Harga dan agreement dibaca dari database, tidak dipercaya dari browser.
6. Lock idempotency global per key, kemudian store, listing, category. Pemeriksaan duplicate memverifikasi user dan jenis/service yang sama; key milik transaksi lain ditolak. Key ulang menghasilkan order yang sama, tanpa pembayaran/ledger kedua.
7. Satu transaksi membentuk orders, order_items dengan FK seller jasa, snapshot toko/nama/harga, kontrak agreement/version/requirements/revision, invoice, payment manual, history, notification, audit. Tidak membuat pembayaran lunas atau ledger kredit.
8. Migration baru memperluas constraint tanpa mengubah migration yang sudah deployed. Signature lama tetap fail-closed; EXECUTE authenticated dicabut agar tidak ada bypass input checkout baru.
9. Detail pesanan umum menampilkan komponen buyer jasa. Fulfillment operator/akademik tidak dipakai pada order jasa seller.
10. Uji database memakai transaksi rollback dengan fixtures test terisolasi. Tidak melakukan keputusan moderasi, transfer, approval pembayaran, acceptance, atau refund pada data nyata.

## Arah UI

Mengikuti `docs/ui-ux/01-ebrystore-design-direction.md`: Friendly, Fast, Simple, Trustworthy, Mobile-First, Transaction-Focused. ENERGY 2 / RHYTHM 2 / MOTION 1.

- Ringkasan biaya berdampingan dengan agreement pada desktop; satu kolom di mobile agar seluruh kesepakatan terbaca.
- Warna, font, radius memakai design tokens Ebrystore; CTA utama satu aksen karena keputusan utama adalah membuat pesanan.
- Kontrol minimal 44px, label nyata, fokus terlihat, tanpa dekorasi/asset baru.
- Loading, kegagalan/retry, unavailable, toko sendiri, pending submit, validasi kebutuhan/consent, dan stale quote dijelaskan.
- Tidak ada autoplay atau animasi tambahan; interaksi checkout tidak memerlukan motion.

## Batas

Tidak menyentuh order platform/digital di luar dispatch/filter yang diperlukan. Tidak commit/push, tidak rewrite history, tidak menguji transaksi keuangan nyata. Deploy aktivasi RPC dibatasi pada project Supabase yang sudah terhubung, sesudah preflight dan pengujian rollback. Permintaan aktivasi menjadi otorisasi perubahan fitur dan database terkait, bukan otorisasi pembayaran nyata.
