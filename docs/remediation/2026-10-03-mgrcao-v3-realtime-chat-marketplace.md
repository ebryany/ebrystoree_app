# MGRCAO V3: realtime chat marketplace (unread, dibaca, typing, kenyamanan kirim)

Tanggal: 2026-10-03. Dasar: [riset realtime chat](../audit/2026-10-03-riset-realtime-chat-marketplace.md). Status: framework untuk pekerjaan berikutnya; belum dieksekusi dan bukan otorisasi implementasi.

## M: Mindset

Pipa realtime chat Ebrystore sudah benar; yang hilang adalah sinyal sosial chat toko online umum: pesan belum dibaca, sudah dibaca, sedang mengetik, dan kenyamanan mengirim. Semua itu dibangun di atas tabel dan pola existing tanpa domain chat baru, tanpa chat engine generik, dan tanpa menyentuh jalur transaksi.

Read state adalah data kecil yang sensitif: menyimpan kapan peserta terakhir membaca, bukan history baca per pesan. Typing dan presence tidak boleh masuk database; mereka milik channel broadcast Supabase yang hilang begitu koneksi putus. Lampiran gambar, nego, auto-reply, chat toko umum, dan blokir/lapor menyangkut kebijakan dan tetap tertahan keputusan owner.

## G: Goals

1. List chat menampilkan badge pesan belum dibaca per thread dan pratinjau pesan terakhir.
2. Thread menampilkan pembatas pesan baru dan status dibaca sederhana; seller tahu pesannya sudah dibaca pembeli.
3. Mengirim pesan terasa instan: bubble optimistic dengan status mengirim/gagal-coba-lagi, dan auto-scroll tidak lagi menyeret pembaca.
4. Typing indicator antara pembeli dan seller berjalan lewat broadcast channel tanpa data persist.
5. Notifikasi chat tidak lagi membanjiri bell (dedup per thread).
6. Thread panjang terbaca utuh lewat load more, bukan potongan 300 diam-diam.
7. Tidak ada regresi pada mode buyer/seller/staff yang dipakai tiga halaman, PO custom, dan bell.

## R: Role

Bertindak sebagai Engineer Spesialis Realtime Chat Marketplace yang menguasai Supabase postgres_changes + broadcast/presence, RLS, React Query, dan pola TanStack Start repo. Mandat hanya jalur chat inquiry (thread, pesan, read state, typing, notifikasi dedup) plus UI list/thread yang tercantum. Bukan role untuk chat PO custom di luar meniru perilaku, lampiran media, chat order, nego, auto-reply, maupun moderasi keselamatan.

Di luar allowlist = blocker, berhenti. Bekerja sendiri, tanpa server/browser, tanpa dependency baru, tanpa credential. Static assertion bukan bukti websocket lintas sesi; itu dicatat jujur.

## C: Context

- Tabel existing: product_inquiries (status, last_message_at, store_id, user_id), product_inquiry_messages (sender_role, body, is_system). Trigger touch_product_inquiry memperbarui thread setiap pesan masuk.
- RLS read/insert peserta sudah benar; seller bukan pemilik baris product_inquiries sehingga update read state sisi merchant wajib lewat RPC SECURITY DEFINER dengan guard store/staff.
- Broadcast typing memakai nama channel deterministik dari inquiry id; tidak ada tabel baru untuk typing. postgres_changes tetap dipakai untuk pesan.
- notifikasi existing dua arah di inquiries.functions.ts adalah tempat dedup; bell memakai onEvent INSERT dari pekerjaan realtime 2026-10-03.
- PO custom (po_messages) boleh menerima perbaikan yang sama hanya bila ekstensinya murni berbagi komponen perilaku; kalau perlu migrasi tambahan, catat blocker, jangan sekalian.
- Keputusan yang belum ada (JDO): retensi lampiran, chat toko umum, nego/voucher, auto-reply/broadcast, blokir/lapor. Dilarang menetapkannya diam-diam.

## A: Actions

### A-01. Read state dan pratinjau (migration additive)

1. Migration baru menambahkan `customer_read_at`, `merchant_read_at`, `last_message_body`, `last_message_role` pada product_inquiries; trigger touch_product_inquiry diperbarui mengisi last_message_* setiap pesan (tanpa mengubah perilaku status).
2. Pembeli mengisi customer_read_at via direct UPDATE (RLS owner). Merchant mengisi merchant_read_at via RPC SECURITY DEFINER `mark_inquiry_read` dengan guard store owner atau staff, disarankan saat thread dibuka dan saat pesan masuk saat tab visible.
3. List chat (buyer/seller/admin) menghitung unread dari pesan setelah read timestamp peserta dan menampilkan badge; pratinjau last_message_body dipotong satu baris di list.

### A-02. Thread: dibaca, optimistic, scroll, paginasi

1. Bubble pesan menampilkan status terkirim/dibaca sederhana (dibaca = lawan bicara punya read timestamp setelah pesan dibuat); duplicate tampilan dihindari.
2. Optimistic send: bubble sementara dengan status mengirim, gagal menampilkan tombol coba lagi; id temporer diganti hasil server setelah invalidate.
3. Auto-scroll hanya bila pembaca dekat bawah; pesan baru saat pembaca di atas menampilkan tombol "pesan baru" alih-alih menyeret.
4. Load more: paginasi pesan ascending dengan window terbaru (mis. 50) dan tombol muat pesan sebelumnya; hilangkan potongan 300 tanpa tanda.

### A-03. Typing indicator (broadcast, tanpa persist)

1. Hook kecil (mis. use-chat-typing) mengirim event broadcast "typing" dengan throttle saat pengguna mengetik dan berlangganan channel per inquiry id.
2. Thread menampilkan indikator teks "sedang mengetik…" milik lawan bicara; tidak ada data yang tersimpan dan channel dibersihkan saat unmount.
3. Presence online/terakhir aktif bersifat opsional (A-05); jangan membangunnya bila tak sempat diuji.

### A-04. Dedup notifikasi

1. Saat membuat notifikasi chat (dua arah), cek dulu notifikasi belum dibaca dengan related_type/related_id sama; bila ada, perbarui waktu/pesannya alih-alih menambah baris baru.
2. Pastikan bell dan toast tetap berjalan dengan pola existing; tidak ada perubahan skema notifications.

### A-05. Presence (opsional, terpisah)

1. Bila dieksekusi: presence channel per thread, tampilan online/terakhir aktif minimal, tanpa data persist; satu pemakaian saja di thread.
2. Bila tidak dieksekusi tahap ini, tandai jelas belum dibangun; jangan mengklaim fitur online.

### A-06. Desain ulang UI chat (UI/UX terbaik dalam batas DESIGN.md)

Semua keputusan memakai token existing, tanpa hue/asset/dependency baru, ikon lucide yang sudah ada, dan wajib lolos 390px. Setiap keputusan punya alasan satu baris.

**List percakapan (buyer, seller, admin)**

```
+------------------------------------------------------+
| Chat                                                  |
| +--------------------------------------------------+ |
| | [A]  Nama pembeli / Subjek produk      14.32  (3)| |  <- badge unread aksen
| |      Pratinjau pesan terakhir satu baris…        | |
| +--------------------------------------------------+ |
| | [A]  Subjek lain                       Kemarin    | |  <- baris sudah dibaca: polos
| |      Balasan terakhir…                           | |
| +--------------------------------------------------+ |
+------------------------------------------------------+
```

- Avatar inisial (kotak membulat, huruf pertama nama) sebagai placeholder geometris, bukan foto palsu (R-23).
- Baris belum dibaca diberi badge angka aksen dan teks semibold; pola visual sama semua baris, hierarki lewat weight bukan warna baru.
- Pratinjau pesan terakhir satu baris (dari kolom last_message_body A-01) + waktu singkat (jam, "Kemarin", atau tanggal).
- Empty state: "Belum ada percakapan" + tindakan menuju katalog; loading: 3 baris skeleton, bukan spinner penuh; error: pesan + muat ulang.

**Jendela chat**

```
+------------------------------------------------------+
| <- Kembali   [A] Nama lawan · Penjual      [Aktif]   |  <- header sticky
| +--------------------------------------------------+ |
| | [thumb] Nama produk            Rp50.000  Lihat > | |  <- kartu produk mini
| +--------------------------------------------------+ |
|  ----------------------- Hari ini ------------------ |  <- divider hari
|             +----------------------------+           |
|             | Pesan saya          14.30 ✓✓|          |  <- bubble primary, dibaca
|             +----------------------------+           |
| +----------------------------+                       |
| | Pesan lawan         14.31  |                       |  <- bubble card + border
| +----------------------------+                       |
| | sedang mengetik ● ● ●        |                     |  <- hanya saat broadcast aktif
| +----------------------------+                       |
|  ---------- Pesan baru (pembatas) ------------------ |
| +--------------------------------------------------+ |
| | [textarea 1-5 baris]                      [Kirim]| |  <- composer sticky
| +--------------------------------------------------+ |
+------------------------------------------------------+
```

- Header sticky: kembali, avatar inisial lawan, nama + label peran (Penjual/Pembeli/Tim Ebrystore), pill status thread; kartu produk mini horizontal (thumbnail 40px, nama, harga, link) di bawah header.
- Area pesan memakai latar halaman, bubble milik pengirim `bg-primary text-primary-foreground`, lawan `bg-card border`; radius dan ekor kecil mempertahankan pola existing.
- Divider hari dan pembatas "Pesan baru" (dari read state A-01) memberi ritme baca; timestamp 11px, grup pesan beruntun pengirim yang sama dalam 5 menit tidak mengulang timestamp.
- Read receipt: centang ganda kecil hanya pada bubble terakhir milik sendiri setelah dibaca lawan (CheckCheck existing).
- Typing indicator: bubble lawan dengan tiga titik beranimasi, fallback teks statis saat `prefers-reduced-motion` (sinyal fungsi nyata, bukan dekorasi).
- Composer sticky bawah: textarea auto-grow 1-5 baris, tombol kirim min 44px, nonaktif saat kosong/mengirim; bubble optimistic opasitas rendah dengan spinner, gagal diberi aksi "Coba lagi". Tidak ada tombol lampir sampai JDO lampiran diputuskan (menghindari kontrol mati, R-26).
- Thread ditutup: banner jelas di atas composer dengan aksi buka kembali untuk seller/staff.

**Layout, state, aksesibilitas**

- Mobile-first: chat memakai tinggi layar penuh (header sticky, area pesan fleksibel scroll, composer sticky), desktop maksimal lebar wajar di tengah; tanpa overflow 390px.
- Area pesan `role="log"` `aria-label="Riwayat pesan"` dengan live region sopan agar pembaca layar tahu pesan baru.
- Semua state hadir: loading skeleton, error muat ulang, empty, thread ditutup (R-27); fokus keyboard terlihat di semua kontrol (R-32).
- Komponen boleh dipecah dalam `src/components/chat/` (thread, bubble, list item, header) tanpa mengubah route existing.

### A-07. Pengujian dan penerimaan

1. Static SQL contract: kolom read/preview ada, trigger mengisi preview, RPC mark_inquiry_read guarded, tidak ada GRANT lebar, tidak menyentuh tabel transaksi.
2. Unit/source: perhitungan unread benar untuk ketiga sudut pandang, dedup tidak membuat baris kedua, optimistic tidak menulis ke server sebelum validasi.
3. Dua klien nyata dibutuhkan untuk membuktikan typing/read lintas sesi; bila lingkungan tidak tersedia, tandai belum diuji dan jangan klaim.

### Acceptance checks

| ID | Kasus | Hasil wajib |
|---|---|---|
| CH-01 | Pesan baru masuk saat list terbuka | Badge unread thread bertambah tanpa refresh |
| CH-02 | Thread dibuka oleh pembeli | customer_read_at terisi; badge hilang |
| CH-03 | Thread dibuka seller/staff | merchant_read_at terisi via RPC; akses non-peserta ditolak |
| CH-04 | Bubble setelah dibaca | Status dibaca muncul pada pesan terakhir milik pengirim |
| CH-05 | Kirim saat jaringan lambat/gagal | Bubble mengirim lalu gagal dengan coba lagi; tidak ada pesan ganda |
| CH-06 | Pembaca di atas, pesan baru masuk | Tidak terseret; tombol pesan baru muncul |
| CH-07 | Lawan mengetik | Indikator muncul lalu hilang; tidak ada baris DB baru |
| CH-08 | Lima pesan beruntun | Satu notifikasi per thread terdedup, bukan lima |
| CH-09 | Thread 120 pesan | Muat utuh via load more; tidak terpotong diam-diam |
| CH-10 | Tiga mode buyer/seller/staff | Perilaku konsisten; tidak ada regresi PO dan bell |
| CH-11 | List chat 390px | Tanpa overflow; badge dan pratinjau terbaca; target sentuh 44px |
| CH-12 | Chat window 390px | Header/composer sticky, pesan fleksibel scroll, keyboard tidak menutup composer |
| CH-13 | Semua state UI | Loading, error, empty, closed, optimistic, typing tampil dan jujur |
| CH-14 | Token dan aksesibilitas | Tanpa hue/asset baru; role=log; fokus terlihat; kontras AA; reduced motion dihormati |

## O: Outputs

- Migration read state + preview, RPC mark_inquiry_read, inquiries.functions.ts (unread, dedup, paginasi, markInquiryRead), komponen chat baru di src/components/chat/ (list item, thread, bubble, header, composer) yang dipakai tiga route existing, hook typing, test static/unit, evidence terpisah source vs websocket/GUI.
- Desain UI chat baru mengikuti spesifikasi A-06: token existing, tiga state wajib, mobile-first, aksesibel; GUI tidak diklaim lulus tanpa klik-through nyata.
- Tidak ada commit/push/publish, dependency, atau perubahan tabel transaksi/notifikasi. Rollback: migration additive dapat di-drop sebelum ada data kritikal; perilaku lama kembali dengan revert komponen.
- Tahap JDO (lampiran, chat toko umum, nego, auto-reply, blokir/lapor, chat order) tidak dieksekusi dan dicatat blocker, bukan selesai.
