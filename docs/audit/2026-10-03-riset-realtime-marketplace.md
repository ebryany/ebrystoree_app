# Riset realtime marketplace Ebrystore

Tanggal: 2026-10-03. Scope: pemakaian realtime yang ada sekarang, halaman yang belum realtime padahal seharusnya, serta kelemahan implementasi yang sudah ada. Metode: pembacaan source `src/hooks/use-realtime-refresh.ts`, seluruh pemanggilnya, `src/components/ebry/notification-bell.tsx`, dan konfigurasi client Supabase. Tidak ada server/browser yang dinyalakan; tidak ada pengujian live websocket.

## 1. Yang sudah ada

### Infrastruktur

- `useRealtimeRefresh` (src/hooks/use-realtime-refresh.ts): hook generik berlangganan `postgres_changes` (`event: "*"`, schema public) untuk daftar tabel, lalu memanggil `invalidateQueries` pada query keys terkait dengan debounce 300 ms. Setelah `SUBSCRIBED` ia menjadwalkan refresh sekali untuk menyamakan data yang tertinggal. Saat tab kembali visible juga menjadwalkan refresh. Channel diberi nama unik per instance komponen dan dibersihkan via `removeChannel` saat unmount.
- Konfigurasi client (src/integrations/supabase/client.ts): `createClient` standar dengan auth persist; tidak ada opsi realtime khusus. Kunci publishable dipakai, jadi koneksi realtime memakai JWT/RLS pengguna.
- notification-bell.tsx: membangun channel `postgres_changes` sendiri untuk tabel `notifications` guna badge unread, dengan cleanup `removeChannel`.

### Cakupan pemakaian hook (hasil grep)

- Admin: index (orders, payments, refunds, stores, digital_products, audit_logs), chat.index, jobs, orders.$id, orders.index, payments.$id, payments.index, po.index, refunds.$id, refunds.index, seller.$id, seller.index, seller.produk, tasks.$id, tasks.index.
- Buyer: dashboard.index, dashboard.chat.index, dashboard.notifikasi, dashboard.pesanan.$id (orders, payments, operator_assignments, job_progress, job_results, order_status_histories), dashboard.produk-saya, dashboard.saldo (credit_ledger).
- Seller: seller.chat.index saja.
- Fulfillment: components/fulfillment/workspace.tsx dan pending-queue.tsx.
- Tidak ada pemakaian `refetchInterval` di src: tidak ada polling yang bersaing dengan realtime.

## 2. Yang belum realtime padahal seharusnya

- Seller pesanan toko (seller.pesanan): order baru/status berubah hanya terlihat setelah refresh manual.
- Seller produk (seller.produk): keputusan moderasi admin tidak muncul sampai refresh.
- Seller keuangan (seller.keuangan): ledger/hold berubah tanpa sinyal.
- Halaman jasa yang baru dibuat (seller.jasa, seller.jasa-pesanan, admin/seller.jasa): moderasi, pesanan jasa baru, acceptance buyer, komplain baru, semua statis. Catatan jujur: tahap implementasi jasa 2026-10-03 belum menyertakan realtime.
- Buyer daftar pesanan (dashboard/pesanan/index): status order berubah hanya di halaman detail, tidak di list.
- Seller dashboard (seller): ringkasan pesanan/produk statis.

### Penjebakan RLS yang wajib diperhitungkan

`postgres_changes` hanya mengirim baris yang boleh di-SELECT oleh RLS subscriber. RLS `orders` hanya memberi akses pemilik order atau `orders.view`, sehingga seller TIDAK akan menerima event untuk order toko sendiri via tabel `orders` meskipun hook-nya dipasang. Jalur realtime pesanan toko harus memakai tabel yang memang bisa dibaca seller: `notifications` (recipient sendiri) sebagai pemicu invalidate, atau kebijakan baru yang tidak direkomendasikan pada tahap ini. Tanpa pemahaman ini, pemakaian hook di seller.pesanan akan tampak terpasang tetapi tidak pernah menembak.

## 3. Yang sudah ada namun lemah

1. Status koneksi tidak diekspos. Callback subscribe hanya bereaksi pada `SUBSCRIBED`; `CHANNEL_ERROR`, `TIMED_OUT`, dan `CLOSED` diabaikan. Ketika websocket mati, UI terlihat normal tetapi data membeku sampai tab di-refresh. Tidak ada indikator dan tidak ada re-sync yang terjadwal saat koneksi kembali.
2. Reconnect jaringan tidak menTrigger resync: hanya `visibilitychange` yang ditangani. Browser event `online` belum dipakai.
3. notification-bell memakai pola channel manual terpisah dari hook. Dua pola untuk kebutuhan sama memicu drift; bell juga tidak mendapat perlakuan status/debounce yang sama.
4. Setiap event memicu invalidate seluruh keys tanpa membedakan jenis event; pada tabel sibuk (orders, audit_logs di admin index) ini menghasilkan refetch beruntun. Debounce 300 ms membantu, tetapi tidak ada disiplin event-to-key yang lebih halus.
5. Tidak ada pengujian unit atas hook: debounce, cleanup, dan resync belum punya regresi tercatat.
6. Halaman publik/katalog sengaja tidak realtime; itu wajar untuk halaman data statis dan tidak dicatat sebagai kekurangan.

## 4. Kesimpulan

Realtime sudah punya fondasi yang benar (satu hook, cleanup rapi, debounce, resync subscribe/visibility) dan cakupannya kuat di sisi admin serta detail pesanan buyer. Cakupan seller dan halaman jasa baru adalah celah utama, dengan syarat pemilihan tabel sadar-RLS. Kelemahan terbesar bersifat diam: kegagalan koneksi tidak terlihat oleh siapa pun. Framework perbaikan disusun terpisah di docs/remediation/2026-10-03-mgrcao-v3-realtime-marketplace.md dan belum dieksekusi.
