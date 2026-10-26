# Verifikasi eksekusi framework realtime chat marketplace

Tanggal: 2026-10-03. Dasar: [framework MGRCAO V3 realtime chat](../remediation/2026-10-03-mgrcao-v3-realtime-chat-marketplace.md) dan [riset chat](2026-10-03-riset-realtime-chat-marketplace.md). Perubahan: satu migration additive + source chat. Deployment live migration chat dilakukan 2026-10-03 dengan otorisasi eksplisit owner ("lakukan migrasi"); tidak ada deployment source/dependency lain.

## Deployment live migration 20261003130000 (otorisasi owner)

Pola sama dengan deployment bucket: helper `.zcode/chat-read-state-deploy.mjs` (preflight baca-saja → apply satu transaksi dengan advisory lock + registry → verifikasi). Evidence privat di `.zcode/chat-read-state-live-before.json`, `-apply.json`, `-after.json`.

- Preflight: project cocok (wcxaheqnnsbhifpgiedk), migration belum tercatat, kolom target absen, dependensi ada (touch_product_inquiry, is_staff, my_store_id, trg_touch_product_inquiry), snapshot 5 policy product_inquiries, data saat itu 1 thread / 2 pesan.
- Apply: satu transaksi — `SET LOCAL statement_timeout='60s'`, `lock_timeout='10s'`, advisory lock `pg_advisory_xact_lock(20261003,130000)`, SQL migration exact, lalu registry insert versi 20261003130000 / chat_read_state.
- Verifikasi: 4 kolom hadir; trigger mengisi preview; registry statements exact sama dengan file lokal; policy tidak berubah; grant benar (authenticated ada, PUBLIC/anon tidak bocor); backfill lengkap (customer_read_missing=0, merchant_read_missing=0; preview 1/1); data tidak berubah (1 inquiry, 2 pesan, latest_message_at sama dengan pra-apply). SHA-256 migration: fb72e0240491bcabae09e8f2147e7c0ee90f3846073ecdaeeccafe6bfdda906d.

## Perbaikan akar masalah "chat tidak realtime" (laporan owner, 2026-10-03)

Laporan: pesan masuk tidak tampil tanpa refresh dan centang dibaca tidak muncul. Inspeksi live membuktikan akar masalahnya bukan di kode klien: **postgres_changes hanya mengirim event untuk tabel yang terdaftar di publication `supabase_realtime`, dan `product_inquiries`/`product_inquiry_messages` tidak pernah terdaftar**. Subscribe klien sukses (SUBSCRIBED) tetapi tidak pernah ada event; chat PO (`po_messages`) terdaftar, itulah mengapa chat PO terasa realtime. `digital_products` juga ternyata absen sehingga moderasi produk di sisi seller tidak realtime.

Perbaikan: migration `20261003131000_chat_realtime_publication.sql` (idempoten, guard `pg_publication_tables`) mendaftarkan `product_inquiries`, `product_inquiry_messages`, dan `digital_products` ke publication. Diterapkan live dengan otorisasi owner melalui helper `.zcode/chat-publication-deploy.mjs` (preflight → apply satu transaksi advisory lock 20261003,131000 + registry → verifikasi). Verifikasi: keanggotaan publication naik 16 → 19 dengan tiga tabel baru; anggota existing tidak berubah; registry statements exact sama dengan file lokal (SHA-256 524ee86c…5ccbecc9). Evidence privat `.zcode/chat-publication-live-*.json`.

Implikasi perilaku setelah fix: pesan masuk tampil tanpa refresh (INSERT event memicu invalidate), perubahan read stamp menyebar live (UPDATE event pada product_inquiries), sehingga centang "Dibaca" pada bubble milik sendiri muncul otomatis begitu lawan bicara membuka thread. Pengujian lintas dua sesi nyata tetap di luar lingkungan kerja; owner dapat mengujinya dengan dua sesi login berbeda.

## A-01 Read state, preview, unread (migration 20261003130000_chat_read_state.sql)

- Kolom baru product_inquiries: `customer_read_at`, `merchant_read_at`, `last_message_body`, `last_message_role` (CHECK role tertutup).
- Backfill preview dari pesan terakhir (DISTINCT ON) dan read timestamp ke now() agar pengguna existing tidak menerima badge unread palsu setelah deploy.
- Trigger `touch_product_inquiry` diperbarui: mengisi preview tiap pesan, perilaku status (closed/answered) persis seperti versi 20260930100027.
- RPC `mark_inquiry_read`: SECURITY DEFINER, FOR UPDATE, deteksi peran (pembeli pemilik → customer_read_at; seller via my_store_id → merchant_read_at; staff is_staff → merchant_read_at; selain itu FORBIDDEN). REVOKE public/anon, GRANT authenticated.
- RPC `unread_inquiry_counts`: hitung pesan lawan bicara yang lebih baru dari stamp baca pemanggil untuk tiga sudut pandang (pembeli, seller toko, staff).

## A-02 Thread: dibaca, optimistic, scroll, paginasi

- src/lib/inquiries.functions.ts: getInquiry kini mengembalikan jendela 50 pesan terbaru + hasMore + oldest (menggantikan potongan 300 diam-diam); getInquiryMessagesPage baru untuk load more berbasis cursor `before`; markInquiryRead dan listInquiryUnreadCounts sebagai wrapper RPC; FIELDS list menambah preview + read timestamp.
- src/components/inquiry/inquiry-thread.tsx ditulis ulang sebagai orkestrator: meta query + pesan, load more (prepend state lokal), mark-read otomatis saat thread terbuka/pesan baru masuk selagi tab visible (guard stamp agar tidak berputar), optimistic send dengan bubble "Mengirim" dan "Gagal, coba lagi" (retry memakai tempId yang sama), tutup/buka percakapan tetap untuk seller/staff.
- src/components/chat/chat-window.tsx: auto-scroll hanya bila pembaca dekat bawah (threshold 120px), tombol "Pesan baru di bawah" saat tidak dekat bawah, divider hari, pembatas "Pesan baru", grup timestamp 5 menit, centang Terkirim/Dibaca pada bubble terakhir milik sendiri, pesan sistem, banner thread ditutup.
- src/components/chat/chat-time.ts: helper murni shortChatTime (jam/Kemarin/tanggal) dan chatDayLabel.

## A-03 Typing (broadcast, tanpa persist)

- src/hooks/use-chat-typing.ts: channel broadcast `chat-typing:<inquiry-id>` dengan self:false, throttle 2 detik, indikator hilang setelah 3 detik, cleanup removeChannel saat unmount; tidak ada insert/update ke tabel mana pun. Dipakai thread lewat onDraftChange.

## A-04 Dedup notifikasi

- notifyOnce: cek notifikasi belum dibaca dengan related_type/related_id sama, perbarui title/message/created_at bila ada, sisanya insert; notifyStaff/notifySeller dan jalur balasan ke pembeli kini semuanya lewat notifyOnce (service role).

## A-06 Desain UI baru

- List chat (buyer: dashboard/chat, seller: seller/chat): avatar inisial, pratinjau pesan terakhir, waktu singkat, badge unread angka (components/chat/chat-list-item.tsx). Seller mempertahankan pill status + nama pembeli sebagai judul.
- Admin chat: kolom subjek kini menampilkan badge unread + pratinjau pesan terakhir.
- Jendela chat: header sticky (kembali, avatar, judul, peran, status), kartu produk mini (thumbnail, nama, harga akhir) dengan link bertipe, area pesan role="log", composer sticky auto-grow 1-5 baris, Enter kirim/Shift+Enter baris baru, tanpa tombol lampir (kontrol mati dihindari sampai keputusan JDO).
- Realtime invalidations mencakup unread counts di ketiga list.

## A-05 Presence

Sengaja tidak dibangun pada tahap ini (opsional di framework); tidak ada klaim status online.

## A-07 Pengujian dan evidence

- src/lib/__tests__/chat-realtime.test.ts: helper waktu (unit murni), kontrak SQL (kolom, backfill, trigger preview, guard RPC, revoke/grant, formula unread), kontrak source (dedup satu insert, window 50 + page fn, mark-read via RPC + guard visibility, optimistic retry, near-bottom scroll, role=log, typing broadcast tanpa persist, badge/pratinjau di tiga list).
- Hasil: unit 286 lulus pada 19 file (.zcode/chat-unit.log); lint file terubah exit 0 (.zcode/chat-lint.log); TypeScript 71 → 71 (added 0, .zcode/chat-tsc.log); build produksi exit 0 (.zcode/chat-build.log).
- Catatan: prettier tidak memproses file SQL (tanpa parser) — migration mengikuti gaya migration lain.

## Belum diuji dan batas

- Migration chat SUDAH diterapkan ke database live 2026-10-03 (lihat bagian deployment di atas); fitur unread/preview/read state aktif pada aplikasi yang sudah memakai source baru.
- Dua klien nyata belum diuji: typing lintas sesi, pembatas "Pesan baru", dan centang dibaca memerlukan dua sesi nyata + browser (di luar batasan kerja).
- GUI tidak diklik-through (tanpa server/browser); verifikasi UI berupa pemeriksaan kode dan static test.
- Tinggi viewport chat memakai dvh dan perlu dicek saat GUI tersedia; halaman $id seller/staff/buyer tidak diubah (InquiryThread dipakai langsung).
