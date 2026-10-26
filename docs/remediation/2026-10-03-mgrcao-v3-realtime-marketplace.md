# MGRCAO V3: perluasan realtime marketplace

Tanggal: 2026-10-03. Dasar: [riset realtime](../audit/2026-10-03-riset-realtime-marketplace.md). Status: framework untuk pekerjaan berikutnya, belum dieksekusi dan belum menjadi otorisasi implementasi.

## M: Mindset

Realtime di aplikasi ini berarti Supabase `postgres_changes` yang men-trigger `invalidateQueries` React Query, bukan lapisan state baru. Jangan membuat event bus sendiri, jangan menambah dependency realtime, jangan memakai broadcast/presence untuk kebutuhan yang tidak ada konsumennya.

RLS adalah batas realtime: subscriber hanya menerima baris yang boleh dibacanya. Kegagalan koneksi bersifat diam secara default, jadi status koneksi adalah bagian dari pekerjaan, bukan bonus. Invalidate pada data finansial tetap bermakna read-only: hook tidak pernah mengubah angka, hanya menyegarkan sumber kebenaran dari server.

## G: Goals

1. Satu hook dengan status koneksi yang dapat ditampilkan: subscribed, reconnecting/error, dan resync otomatis saat kembali online.
2. Halaman seller, buyer-list, dan admin jasa menerima pembaruan tanpa refresh manual, dengan pilihan tabel sadar-RLS.
3. Satu pola realtime untuk seluruh src, termasuk notification-bell, tanpa channel manual terpisah.
4. Tidak ada regresi pada pemakaian existing: admin dan detail pesanan buyer tetap bekerja dengan API hook yang sama.
5. Pengujian unit atas perilaku hook (debounce, cleanup, resync, status) dan cakupan halaman baru tercatat.

## R: Role

Bertindak sebagai Engineer Spesialis Realtime Marketplace yang menguasai Supabase Realtime postgres_changes + RLS, React Query invalidation, dan pola TanStack Start yang dipakai repo. Mandat terbatas pada: hook `use-realtime-refresh.ts`, notification-bell, halaman yang tercantum di Actions, dan test terkait. Bukan role untuk merombek arsitektur data, menambah provider realtime baru, atau menyentuh backend SQL.

Di luar allowlist harus berhenti dan dicatat blocker. Bekerja sendiri, tanpa server/browser baru, tanpa dependency baru, tanpa credential. Static assertion bukan bukti websocket; hal itu dicatat jujur di evidence.

## C: Context

- Fondasi: src/hooks/use-realtime-refresh.ts dipakai luas; perubahan signature harus backward compatible (opsi baru bersifat opsional).
- RLS membatasi event: seller tidak menerima `orders` milik toko; jalur seller memakai `notifications` dengan filter `recipient_id=eq.<uid>` sebagai pemicu invalidate, karena setiap perubahan penting pesanan jasa/digital sudah menulis notifications ke seller/buyer.
- digital_products dapat disubscribe seller (RLS select milik sendiri), cocok untuk status moderasi.
- credit_ledger dipakai dashboard.saldo; seller.keuangan membaca get_store_finances yang berakar pada seller_ledger dan orders — pemicu yang sah adalah notifications (pencairan/refund) plus refetch on-focus existing.
- Halaman jasa baru: marketplace_service_orders/deliveries/events punya RLS baca buyer/seller/orders.view sehingga bisa disubscribe langsung oleh pihak yang berhak; admin memakai orders.view.
- Tidak ada `refetchInterval` hari ini; jangan menambahkan polling sebagai pengganti, hanya sebagai pertahanan terakhir bila hook gagal, dan itu bukan bagian framework ini.

## A: Actions

### A-01. Hook: status, reconnect, disiplin event

1. Tambah opsi opsional pada `useRealtimeRefresh`: callback/penyimpan status koneksi. Status minimal: `subscribed`, `error`, `reconnecting`, ditulis ke query key `["realtime-status", channel]` sehingga UI yang butuh bisa membaca tanpa mengubah semua pemanggil.
2. Tangani `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`: tandai status, dan saat `SUBSCRIBED` kembali atau window event `online`/`visibilitychange` terjadi, jalankan resync debounce (pattern existing).
3. Pertahankan cleanup, penamaan channel, dan debounce 300 ms. Jangan mengubah perilaku invalidate pemanggil existing.
4. Satukan notification-bell ke hook (tables: notifications, filter recipient sendiri, keys badge) tanpa mengubah tampilannya.

### A-02. Cakupan seller (sadar-RLS)

1. seller.produk: tables `digital_products` (baris milik sendiri), keys list produk + detail.
2. seller.pesanan dan seller: pemicu `notifications` filter `recipient_id=eq.<uid>`; keys list pesanan toko dan ringkasan. Jangan subscribe `orders`.
3. seller.keuangan: pemicu `notifications` (event pencairan/refund) + keys finances/summary.
4. seller.jasa: tables `marketplace_services` (milik sendiri), keys katalog.
5. seller.jasa-pesanan: tables `marketplace_service_orders` dan `marketplace_service_deliveries` (RLS seller mengizinkan), keys list/detail; komplain aktif memicu invalidate yang sama.

### A-03. Cakupan buyer dan admin jasa

1. dashboard/pesanan list: `orders` dengan filter `user_id=eq.<uid>` (RLS owner), keys list.
2. admin/seller.jasa: tables `marketplace_services`, `marketplace_service_orders`; keys antrean moderasi dan komplain. Admin dengan `orders.view` menerima event sesuai policy.

### A-04. Pengujian dan penerimaan

1. Unit test hook dengan mock supabase: subscribe per tabel + filter, debounce menggabungkan event, removeChannel saat unmount, status berubah pada error lalu kembali subscribed, resync pada `online`.
2. Static test cakupan: setiap halaman di A-02/A-03 memakai hook dengan tabel/filter yang benar; tidak ada pemanggil yang subscribe `orders` untuk seller.
3. Bukti websocket live, RLS delivery, dan GUI berada di luar lingkungan kerja; dicatat belum diuji, bukan lulus.

### Acceptance checks

| ID | Kasus | Hasil wajib |
|---|---|---|
| RT-01 | Channel error lalu pulih | Status berubah, resync berjalan, data tersinkron |
| RT-02 | Tab hidden lama lalu visible | Invalidate terjadwal sekali, tidak beruntun |
| RT-03 | Order baru toko seller (event via notifications) | List pesanan tersegarkan tanpa refresh |
| RT-04 | Admin menyetujui produk seller | Status moderasi berubah di seller.produk tanpa refresh |
| RT-05 | Acceptance buyer pada pesanan jasa | seller.jasa-pesanan dan saldo seller tersinkron |
| RT-06 | Pemanggil existing (admin, detail buyer) | Perilaku invalidate tidak berubah; tidak ada regresi |
| RT-07 | Unmount | Tidak ada channel bocor; timer bersih |
| RT-08 | Seller subscribe orders (anti-pola) | Tidak ada pemakaian seperti itu di kode |

## O: Outputs

- Hook diperluas backward compatible, notification-bell memakai hook, halaman A-02/A-03 terpasang, unit + static tests lulus, evidence log terpisah source/build vs websocket/GUI.
- Tidak ada perubahan SQL, dependency, atau aktivitas publish. Rollback: revert pemakaian hook per halaman bersifat additive; rollback hook memengaruhi semua pemanggil sehingga wajib menjaga signature lama.
- Status koneksi tidak diwajibkan tampil di setiap halaman; hanya boleh ditambahkan bila ada lokasi UI yang disepakati owner, karena menambah elemen visual baru.
