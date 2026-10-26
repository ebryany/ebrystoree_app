# Business Rules

## Harga & Order
- BR-01: Harga final SELALU dihitung ulang di server dari data katalog saat checkout.
- BR-02: Snapshot harga, nama item, dan konfigurasi paket disimpan di `order_items` agar perubahan katalog tidak mengubah order lama.
- BR-03: Nomor order unik, format `EBS-YYYYMMDD-XXXXXX`.
- BR-04: Biaya admin dan diskon dicatat sebagai baris terpisah pada order.

## Pembayaran
- BR-10: Order hanya dianggap dibayar bila ada payment berstatus `paid`.
- BR-11: Webhook diproses hanya setelah signature valid.
- BR-12: Satu `provider_event_id` hanya boleh diproses sekali (unique constraint).
- BR-13: Selisih nominal > 0 → `needs_review`, tidak otomatis `paid`.
- BR-14: Pembayaran kedaluwarsa otomatis pada `expires_at`; order kembali dapat dibayar ulang lewat payment baru, bukan mengubah payment lama.

## Produk Digital
- BR-20: Entitlement dibuat otomatis saat payment `paid`, sekali per order item (idempotent).
- BR-21: Kuota default 5 unduhan, masa aktif 365 hari sejak entitlement dibuat; dapat dioverride per produk.
- BR-22: Setiap unduhan menaikkan counter dan menulis `download_logs`.
- BR-23: Signed URL berlaku maksimal 5 menit.

## Jasa
- BR-30: Order jasa tidak dapat masuk `in_progress` sebelum payment `paid`.
- BR-31: Satu order jasa memiliki satu operator aktif; penggantian operator menutup assignment lama.
- BR-32: Jumlah revisi gratis mengikuti paket; kelebihan revisi ditolak atau menjadi add-on berbayar (kebijakan U-04).
- BR-33: Customer tidak dapat menyelesaikan order sebelum ada `result_files`.
- BR-34: Order `disputed` tidak boleh ditutup otomatis oleh scheduler.

## Refund
- BR-40: Refund parsial wajib memiliki nominal, alasan, dan approval admin.
- BR-41: Total refund atas satu order tidak boleh melebihi total dibayar.
- BR-42: Refund atas produk digital mencabut entitlement terkait.

## Akses
- BR-50: Customer hanya mengakses data miliknya.
- BR-51: Operator hanya mengakses order yang ditugaskan kepadanya.
- BR-52: Finance tidak dapat mengubah role, produk, atau status pengerjaan.
- BR-53: Setiap transisi status penting menulis audit log dengan aktor, role, waktu, dan alasan.