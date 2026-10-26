# Riset realtime chat marketplace (pola toko online pada umumnya)

Tanggal: 2026-10-03. Tujuan: memetakan jarak antara chat yang ada sekarang di Ebrystore dengan chat toko online pada umumnya (Shopee, Tokopedia, dan sejenisnya), lalu menyusun urutan perbaikan yang realistis. Metode: pembacaan source, migration, dan pembanding fitur dari dokumentasi publik marketplace. Tidak ada pengujian live websocket.

## 1. Yang sudah ada di Ebrystore

### Model data

- Domain chat utama: `product_inquiries` + `product_inquiry_messages` (migration 20260905003813), diperluas migration 20260930100027: kolom `store_id` (auto-fill via trigger dari produk) dan role pengirim `seller` selain `customer/staff/system`.
- Thread: subject, status `open/answered/closed`, `last_message_at`, product_id, store_id, user_id (pembeli pemilik). Trigger `touch_product_inquiry` memperbarui last_message_at dan status otomatis saat pesan masuk (jawaban seller/staff membuat status answered).
- Pesan: teks saja, maksimal 2000 karakter, flag `is_system` (belum dipakai), tanpa lampiran, tanpa read receipt.
- Domain chat terpisah yang sudah berjalan: PO custom (po_messages, custom_orders, po_payments di migration 20260820012138) dengan pola serupa.

### Jalur dan UX

- Satu komponen `InquiryThread` (src/components/inquiry/inquiry-thread.tsx) dipakai tiga mode: buyer (dashboard/chat/$id), seller (seller/chat/$id), staff (admin/chat/$id).
- List percakapan: buyer (dashboard/chat, `listMyInquiries`), seller (`listSellerInquiries`, filter status), admin (`listAllInquiries`).
- Konteks produk: header thread menampilkan nama produk + link ke halaman produk.
- Quick replies: dialog tanya produk (product/inquiry-dialog.tsx) menyiapkan 3 pertanyaan preset dan langsung membuat thread + pesan pertama.
- Seller/staff bisa menutup dan membuka kembali percakapan.
- Rate limit server: inquiry.create 10/60 detik, inquiry.message 20/60 detik (rate-limit.server.ts).

### Realtime dan notifikasi

- Thread dan list chat sudah memakai `useRealtimeRefresh` pada `product_inquiry_messages` + `product_inquiries`, termasuk status koneksi dan resync dari pekerjaan realtime 2026-10-03. Pesan baru dari lawan bicara muncul tanpa refresh.
- Setiap pesan menulis baris `notifications` dua arah (pembeli ke owner toko, atau ke staff untuk toko platform; balasan ke pembeli), sehingga bell, toast, dan suara jalan.

## 2. Yang belum ada dibanding chat toko online pada umumnya

Fitur pembanding dari dokumentasi publik Shopee/Tokopedia: pesan realtime dengan jenis text, gambar, kartu produk, kartu invoice/order, status terkirim/dibaca, penawaran/voucher lewat chat, auto-reply, broadcast, dan chat dari halaman toko tanpa produk.

1. Unread per thread. Tidak ada penanda jumlah pesan belum dibaca di list chat; satu-satunya sinyal adalah badge notifikasi di bell yang menghitung baris notifications, bukan pesan chat. Model juga belum punya penanda kapan pembeli/penjual terakhir membaca thread.
2. Read receipt per pesan (centang dibaca) belum ada, sehingga status `answered` bukan bukti pesan sudah dibaca.
3. Typing indicator dan presence (online/terakhir aktif) belum ada. Ini bukan domain postgres_changes; butuh channel broadcast/presence Supabase per thread.
4. Lampiran gambar di chat belum ada (hanya teks). Chat Shopee mendukung text, sticker, image, video, product, dan invoice.
5. Kartu produk dalam thread hanya link teks; belum ada kartu mini (thumbnail, harga) seperti chat marketplace umum. Kartu order/invoice pasca-transaksi juga belum ada.
6. Chat toko umum (mulai percakapan dari halaman toko tanpa produk spesifik) belum ada; semua thread harus berangkat dari produk.
7. Chat terkait order pasca-pembelian (konteks transaksi, status pengiriman sebagai pesan sistem) belum ada untuk produk digital maupun jasa.
8. Nego/penawaran (offer, voucher chat), auto-reply, dan broadcast seller belum ada dan seharusnya bukan MVP karena menyentuh kebijakan bisnis dan anti-spam.
9. Keselamatan: belum ada blokir pengguna, lapor percakapan, atau batasan siapa yang boleh memulai chat selain harus login. RLS peserta sudah benar, tapi tidak ada alat moderasi di luar baca staff.

## 3. Yang sudah ada namun lemah

1. Optimistic UI tidak ada: kirim pesan menunggu server, tanpa bubble "mengirim" atau retry; jaringan lambat terasa hang.
2. Auto-scroll menyeret pembaca: `scrollIntoView` berjalan setiap panjang daftar berubah, jadi saat realtime pesan baru masuk, pengguna yang sedang membaca pesan lama di atas ikut terlempar ke bawah.
3. List thread tidak menampilkan pratinjau pesan terakhir, hanya subject + waktu; tidak ada pencarian maupun paginasi (buyer cap 50, seller/admin cap 100).
4. Thread dibaca memuat maksimal 300 pesan tanpa paginasi; thread panjang terpotong diam-diam tanpa tanda.
5. Notifikasi chat tidak terdedup: setiap pesan baru selalu membuat baris notification baru walau notifikasi sebelumnya untuk thread yang sama belum dibaca, sehingga bell bisa dibanjiri saat percakapan ramai.
6. Status `answered` bergantung penuh pada role pengirim terakhir; tanpa read state, seller yang "menjawab" tidak tahu apakah pembeli melihatnya, dan pembeli tidak tahu balasan mana yang baru.
7. `is_system` tersedia di model tapi belum dimanfaatkan untuk pesan sistem (mis. "produk sedang dinonaktifkan") yang lazim di chat marketplace.
8. Label role `staff` ditetapkan dengan fallback "bukan owner dan bukan seller" di sendInquiryMessage; kalau nanti ada peran lain yang boleh membalas, role bisa meleset tanpa guard.

## 4. Urutan perbaikan yang disarankan

### Tahap 1: dasar "seperti toko online umum" (teknis, tanpa kebijakan bisnis baru)

- Read state per peserta: simpan penanda kapan pembeli dan penjual terakhir membaca (kolom atau tabel kecil), update saat thread dibuka, lalu list chat menampilkan badge unread per thread dan thread menampilkan pembatas pesan baru.
- Optimistic send dengan status mengirim/gagal-coba-lagi, plus perbaikan auto-scroll (hanya scroll bila pembaca sudah dekat bawah).
- Dedup notifikasi per thread (jangan buat notifikasi baru bila ada notifikasi belum dibaca untuk thread yang sama).
- Pratinjau pesan terakhir di list thread.
- Kartu produk mini pada header thread.
- Paginasi pesan (load more) menggantikan potongan 300 diam-diam.

### Tahap 2: nuansa realtime

- Typing indicator via Supabase realtime broadcast per thread (bukan tabel, bukan postgres_changes, tidak persist).
- Presence online/terakhir aktif via presence channel; opsional dan bisa ditunda tanpa merusak tahap 1.
- Status dibaca per pesan (centang) dibangun di atas read state tahap 1.

### Tahap 3: tertahan keputusan bisnis (JDO, bukan pekerjaan teknis murni)

- Lampiran gambar: butuh bucket baru chat-attachments, kebijakan retensi/privasi, dan moderasi; jangan pakai catalog-images.
- Chat toko umum tanpa produk: butuh keputusan anti-spam (siapa boleh memulai, limit thread terbuka).
- Nego/penawaran, voucher chat, auto-reply, broadcast, blokir/lapor, chat terkait order: masing-masing kebijakan terpisah.

## 5. Catatan teknis Supabase untuk pembanding

- RLS peserta yang ada sekarang sudah benar (pembeli pemilik thread, seller lewat store_id, staff is_staff) dan postgres_changes hanya mengirim baris yang boleh dibaca subscriber, jadi unread bisa dihitung di klien tanpa bocor.
- Typing/presence tidak boleh lewat tabel: pakai channel broadcast/presence dengan nama deterministik dari inquiry id agar dua klien bertemu tanpa data persist.
- Read state diupdate lewat direct UPDATE dengan RLS (pembeli pemilik) dan RPC kecil untuk sisi seller (karena seller bukan pemilik baris product_inquiries), mirip pola read RPC lain.

## Referensi eksternal (fitur pembanding)

- [Qiscus: Shopee Chat Documentation](https://documentation.qiscus.com/app-center/shopee) (jenis pesan Shopee: text, sticker, image, video, product, invoice)
- [Shopee Open Platform: Chat push dan update API](https://open.shopee.com/announcements/970)
- [Tokopedia Care: Cara menghubungi penjual](https://www.tokopedia.com/help/article/bagaimana-cara-menghubungi-penjual)
- [Tokopedia Seller Center: Voucher Chat](https://seller-id.tokopedia.com/university/essay?knowledge_id=5533163473782529)
- [Tokopedia Care: Broadcast Chat](https://www.tokopedia.com/help/article/broadcast-chat)

Kesimpulan: fondasi realtime chat Ebrystore sudah benar (tabel, RLS, realtime refresh, notifikasi) dan PO custom memakai pola serupa. Jarak terbesar dengan chat toko online umum ada di sinyal sosial (unread, dibaca, typing, presence) dan kenyamanan kirim (optimistic, scroll, dedup), bukan di pipa realtime. Lampiran, nego, auto-reply, dan chat toko umum sebaiknya tertahan keputusan kebijakan.
