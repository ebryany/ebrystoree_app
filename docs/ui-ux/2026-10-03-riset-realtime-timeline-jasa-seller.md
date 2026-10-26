# Riset realtime dan timeline pesanan jasa seller

Tanggal: 2026-10-03. Scope: kenapa realtime pesanan jasa terasa mati, kenapa timeline membingungkan, apakah ada status pengerjaan, dan kenapa pengiriman hasil tidak punya unggah berkas. Metode: pembacaan source hook realtime, dua komponen timeline, halaman buyer dan seller, form delivery, skema tabel jasa, serta publikasi Supabase dari migration. Tidak ada pengujian websocket live dan tidak ada perubahan database pada tahap riset ini.

## 1. Ringkasan masalah yang dilaporkan

Pengguna mengamati pada pesanan `EBS-20261003-000017`:

- Panel pesanan jasa (khusus) sudah benar: agreement, kebutuhan, tenggat, dan riwayat singkat muncul.
- Timeline besar di bawahnya justru hanya menampilkan tahap pembayaran: Menunggu pembayaran, Bukti diperiksa, Pembayaran diterima, Selesai. Tidak ada tahap pengerjaan.
- Tidak jelas apakah ada pembaruan status pengerjaan secara realtime.
- Seller tidak bisa mengunggah berkas hasil, hanya bisa mengisi tautan HTTPS atau catatan.

Ketiga hal itu punya akar teknis yang berbeda dan semuanya nyata.

## 2. Akar masalah A: tabel jasa tidak terdaftar di publikasi realtime

Supabase `postgres_changes` hanya mengirim event untuk tabel yang menjadi anggota publication `supabase_realtime`. Migration awal realtime (`20260728180436_...sql`) mendaftarkan `orders`, `payments`, `admin_tasks`, `operator_assignments`, `job_progress`, `job_results`, `job_revisions`, `order_status_histories`, dan `notifications`.

Tabel jasa seller dibuat belakangan di `20261003110000_marketplace_service_contract.sql` dan **tidak pernah ditambahkan** ke publication. Pemeriksaan `grep` atas seluruh migration tidak menemukan `marketplace_service_orders`, `marketplace_service_deliveries`, atau `marketplace_service_events` pada `ALTER PUBLICATION supabase_realtime ADD TABLE`.

Akibatnya:

- `useRealtimeRefresh` di `seller.jasa-pesanan.tsx` yang mendaftarkan tabel `marketplace_service_orders` dan `marketplace_service_deliveries` **subscribe sukses tetapi tidak pernah menerima event**. Kode terlihat benar, perilaku diam.
- Ini persis pola bug yang sudah pernah diperbaiki untuk chat: `20261003131000_chat_realtime_publication.sql` menambahkan `product_inquiries`, `product_inquiry_messages`, dan `digital_products` karena alasan yang sama.

Jadi jawaban atas "apakah ada update realtime?" adalah: **tidak, belum berjalan untuk domain jasa**, walau kodenya sudah dipasang.

## 3. Akar masalah B: halaman buyer memantau tabel yang salah

`src/routes/_authenticated/dashboard.pesanan.$id.tsx` memakai `useRealtimeRefresh` dengan:

```
tables: ["orders","payments","operator_assignments","job_progress","job_results","job_revisions","order_status_histories"]
```

Tabel `marketplace_service_orders`, `marketplace_service_deliveries`, dan `marketplace_service_events` tidak termasuk. Jadi perubahan `work_state` jasa (requirements disetujui, hasil dikirim, revisi diminta, diterima) **tidak memicu refresh** halaman buyer dari jalur realtime.

Yang membuat panel buyer masih terasa hidup adalah `refetchInterval: 15_000` yang saya tambahkan di `marketplace-service-order.tsx`. Itu polling, bukan realtime: ada jeda sampai 15 detik, dan ia menyegarkan query detail jasa saja, bukan data halaman lain. Timeline besar di bawahnya memakai query terpisah yang ikut ter-invalidate lewat hook, tetapi karena tabel jasa tidak dipantau, ia hanya ikut menyegarkan saat polling komponen jasa memicu invalidasi turunan.

Catatan RLS: `orders` tidak dapat dipakai seller untuk memantau pesanan toko, karena policy `orders` membatasi ke pemilik order atau `orders.view`. Karena itu jalur seller harus lewat tabel jasa (yang punya policy `is_service_order_seller`) atau `notifications` filter `recipient_id`. Tabel jasa adalah pilihan yang benar, asal terdaftar di publication.

## 4. Akar masalah C: timeline besar salah membaca jenis pesanan

`src/components/ebry/live-timeline.tsx`:

```
const stages = order?.order_type === "service" ? SERVICE_STAGES : DIGITAL_STAGES;
```

Hanya `service` yang mendapat `SERVICE_STAGES`. Pesanan `marketplace_service` jatuh ke `DIGITAL_STAGES` = `["awaiting_payment","payment_under_review","paid","completed"]`. Itulah mengapa pengguna melihat rel tahapan yang berhenti di "Selesai" setelah pembayaran, tanpa tahap pengerjaan.

Selain itu:

- `buildOrderEvents` membangun feed dari `order_status_histories`, `payments`, dan `fulfillment` (operator). Untuk jasa seller, `fulfillment` sengaja tidak dipanggil (`enabled: order_type === "service"`), jadi tidak ada event pengerjaan.
- Tabel `marketplace_service_events` sudah menyimpan event kaya (`order_created`, `requirements_approved`, `delivery_submitted`, `revision_requested`, `accepted`, `complaint_opened`, `refund_requested`) beserta `actor_role` dan `payload`, tetapi **tidak dialirkan ke `LiveOrderTimeline`**.

Akibatnya ada dua "timeline" yang tidak sinkron:

1. `MarketplaceServiceOrderDetail` menampilkan "Riwayat pesanan" dari `marketplace_service_events` (benar, tapi ringkas).
2. `LiveOrderTimeline` menampilkan rel tahap pembayaran generik (salah konteks untuk jasa).

Ini yang membuat pengguna bingung: informasi pengerjaan ada, tetapi tersebar dan tidak punya satu garis waktu yang konsisten.

## 5. Status pengerjaan yang sebenarnya sudah ada

Model `work_state` di `marketplace_service_orders` sudah lengkap:

`awaiting_requirements` → `in_progress` → `delivered` → `revision_requested` → `accepted`, plus `complaint_open` dan `refunded`.

Labelnya sudah tersedia di `marketplaceServiceWorkStateLabels`. Jadi "status update pengerjaan" sebenarnya **sudah ada di database dan sudah ditampilkan di panel khusus**, hanya tidak direpresentasikan pada timeline besar dan tidak disiarkan realtime. Tidak perlu model status baru.

## 6. Pengiriman hasil: kenapa tidak ada unggah berkas

`submit_service_delivery(_order_id, _kind, _url, _note, _summary)` hanya menerima `kind IN ('link','note')`. Skema `marketplace_service_deliveries` juga hanya mengizinkan `kind` link atau note, dengan constraint `(kind = 'link') = (url IS NOT NULL)`.

Alasan historisnya tercatat di keputusan bisnis JDO-07 (`docs/audit/2026-10-02-riset-jasa-seller-marketplace-dan-rekber.md`): retensi berkas/bukti, kategori artifact, dan penyimpanan data pribadi **belum ditetapkan**, sehingga unggah artifact sengaja ditutup.

Konsekuensinya untuk menambah unggah berkas, diperlukan keputusan dan pekerjaan nyata, bukan sekadar tombol:

- Bucket privat baru (mis. `service-deliveries`) dengan `file_size_limit` dan `allowed_mime_types`.
- Policy `storage.objects` insert/select/delete yang mengikat path ke pemilik toko atau pembeli pesanan, bukan sekadar folder user.
- Kolom/atribut pada `marketplace_service_deliveries` (mis. `storage_path`, `mime_type`, `file_size`, `original_name`) dan penyesuaian constraint `kind`.
- Penyajian unduhan lewat signed URL agar objek tetap privat.
- Kebijakan retensi: berapa lama berkas disimpan, siapa boleh mengunduh, dan bagaimana saat refund/komplain.

Pola unggah yang sudah ada dan bisa ditiru: `academic-order-attachments` di `checkout.layanan.$slug.tsx` (path `${user.id}/${draftKey}/...`, policy folder `auth.uid()`), serta `job-results` yang dibatasi `orders.fulfill`. Pola ini tidak bisa dipakai apa adanya untuk jasa seller karena kepemilikan berkas adalah toko/pesanan, bukan operator.

## 7. Temuan tambahan (konsistensi, bukan akar masalah utama)

1. `list_my_service_orders` dan `get_my_service_order` memakai `ms.name` (nama listing saat ini), bukan `name_snapshot` pada `order_items`. Bila seller mengganti nama jasa, riwayat pesanan lama ikut berubah. Snapshot harga tetap benar, nama tidak.
2. `dashboard.pesanan.index.tsx` menentukan ikon dari `o.order_type === "service"`, sehingga `marketplace_service` memakai ikon produk, walau label tipe sudah benar ("Jasa seller").
3. `seller.jasa-pesanan.tsx` empty state masih berbunyi "Checkout jasa masih nonaktif, pesanan baru belum bisa masuk." Kalimat itu sudah tidak benar sejak checkout aktif.
4. `SellerOrderDetail` hanya menginvalidasi key detail (`seller-service-order`), tidak key daftar (`my-service-orders`). Setelah aksi seller, kartu daftar bisa tertinggal sampai refetch lain.
5. `useRealtimeRefresh` menulis status koneksi ke `realtimeStatusKey(channel)`, tetapi belum ada konsumen UI yang menampilkan status itu. Kegagalan koneksi tetap diam.

## 8. Kesimpulan

- Realtime jasa belum berjalan karena tabel jasa tidak ada di publication, dan halaman buyer memantau tabel yang tidak mencakup domain jasa. Ini akar masalah paling penting dan paling murah diperbaiki.
- Timeline besar membingungkan karena `marketplace_service` memakai `DIGITAL_STAGES` dan tidak menerima event `marketplace_service_events`. Perbaikan yang benar adalah satu timeline sadar-jasa yang membaca event jasa, bukan menambah timeline ketiga.
- Status pengerjaan sudah ada; yang hilang adalah penyiaran realtime dan representasi visual yang konsisten.
- Unggah berkas hasil adalah kebutuhan sah, tetapi tertahan keputusan retensi/privasi (JDO-07). Menambahkannya berarti migration bucket + policy + kolom + signed URL, bukan perubahan UI saja.
- Temuan konsistensi (nama snapshot, ikon, empty state, invalidasi daftar, indikator status koneksi) layak dibenahi bersamaan karena murah dan berdampak pada kejelasan.

Framework perbaikan disusun terpisah di `docs/remediation/2026-10-03-mgrcao-v3-realtime-timeline-jasa-seller.md`.
