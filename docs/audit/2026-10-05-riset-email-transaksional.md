# Riset: Notifikasi Email Transaksional (SMTP SumoPod)

Tanggal: 2026-10-05 · Status: **RISET SELESAI — BUKTI TERKUMPUL**
Konteks: menerapkan email otomatis saat transaksi selesai dan update status pesanan.
Kredensial SMTP sudah disediakan Owner (`smtp.sumopod.com:465`, SSL, dari `email.ebrystore.my.id`).

> **Catatan keamanan:** password SMTP dikirim lewat chat sehingga sudah terekspos.
> Wajib dirotasi setelah penerapan selesai. Dokumen ini tidak memuat nilainya.

---

## 1. Kondisi infrastruktur saat ini

### 1.1 Email: BELUM ADA sama sekali

| Cek | Hasil |
|---|---|
| Dependensi email di `package.json` | **tidak ada** (tidak ada nodemailer/resend/sendgrid) |
| Kode pengiriman email di `src/` | **tidak ada** |
| Tabel log pengiriman email | **tidak ada** |
| Setting SMTP di `system_settings` | **tidak ada** |

Satu-satunya file yang menyebut "notification" adalah
`src/lib/mcp/tools/resend-order-notification.ts`, tetapi itu **notifikasi in-app**
(memanggil RPC `admin_broadcast_notification`), bukan email.

### 1.2 Notifikasi in-app: SUDAH JALAN (ini fondasinya)

Tabel `notifications` (90 baris data nyata) dengan 14 tipe terpakai:

| Tipe | Jumlah | Kapan dibuat |
|---|---|---|
| `payment.proof_submitted` | 45 | Bukti transfer diunggah |
| `order.created` | 13 | Pesanan dibuat |
| `seller.applied` | 6 | Pengajuan toko |
| `order.paid` | 6 | Pembayaran lunas |
| `product_inquiry` | 3 | Chat pembeli |
| `order.expired` | 3 | Pesanan kedaluwarsa |
| `seller.active` | 3 | Toko disetujui |
| `order.completed` | 2 | Pesanan selesai |
| `order.receipt_accepted` | 2 | Pembeli konfirmasi terima |
| `service.delivered` | 2 | Seller kirim hasil |
| `service.requirements_approved` | 2 | Requirements disetujui |
| `service.accepted` | 1 | Hasil jasa diterima |
| `order.cancelled` | 1 | Pesanan dibatalkan |
| `seller.suspended` | 1 | Toko ditangguhkan |

**Kolom:** `id, recipient_id, type, title, message, related_type, related_id, read_at, created_at`.

**Trigger pada tabel ini: TIDAK ADA.** Semua notifikasi disisipkan langsung dari dalam
fungsi RPC (mis. `settle_gateway_payment`, `confirm_digital_receipt`,
`accept_service_delivery`). Ini titik integrasi yang paling bersih.

### 1.3 Data email user: TERSEDIA

- `profiles` punya kolom `email`
- **27 dari 27 user punya email** (100%)
- Contoh nyata: `febryanustambing54@gmail.com`, `admin@ebrystore.com`

### 1.4 Pola integrasi eksternal yang sudah terbukti

`src/lib/telegram.server.ts` + tabel `telegram_dispatch_log`:

- Idempotensi lewat tabel log (`order_id`, `event`, `sent_at`)
- Fungsi `dispatchServiceOrderAlerts()` memeriksa log sebelum mengirim
- Pola ini **bisa ditiru** untuk email

### 1.5 Ekstensi database

- `pg_net` **tersedia** (untuk HTTP call dari dalam database bila diperlukan)
- `pg_cron` aktif dengan 4 job

---

## 2. Pilihan arsitektur pengiriman

Ada dua jalur yang mungkin. Perbandingannya:

| Aspek | A. Server Node (nodemailer) | B. pg_net dari database |
|---|---|---|
| Kapan dikirim | Dari server function / cron Node | Dari trigger DB |
| Kelebihan | Kontrol penuh, template HTML mudah, retry gampang | Tidak perlu server, langsung saat data berubah |
| Kekurangan | Perlu cron Node untuk kasus async | Template HTML di dalam SQL (sulit dirawat), rawan blokir transaksi bila provider lambat |
| Kesesuaian dengan project | **Tinggi** — project sudah punya pola `*.server.ts` + cron Node | Rendah — akan menaruh HTML panjang di SQL |

**Rekomendasi: jalur A (nodemailer di server Node).** Alasan:

1. Project sudah punya pola server-only module (`telegram.server.ts`, `sumopod.server.ts`).
2. HTML email panjang jauh lebih terawat di TypeScript daripada di SQL.
3. Kegagalan SMTP tidak boleh membatalkan transaksi database — dengan jalur A,
   pengiriman terjadi setelah transaksi selesai (tidak memblokir).
4. Sudah ada cron Node (`expire_orders` dipanggil dari DB, tapi ada juga cron Node
   untuk Telegram) yang bisa dipakai untuk retry.

**Kredensial:** SMTP SumoPod (`smtp.sumopod.com:465`, SSL) — bukan API HTTP.
Artinya **nodemailer** adalah pilihan tepat (dukungan SMTP native + TLS).

---

## 3. Event mana yang layak dikirim email

Tidak semua 14 tipe notifikasi layak jadi email. Kriteria: **pembeli butuh tahu
walau tidak sedang membuka aplikasi**.

### Prioritas 1 — inti permintaan Owner ("transaksi selesai" + "update")

| Event | Penerima | Alasan |
|---|---|---|
| `order.paid` | Pembeli | Bukti pembayaran diterima; pembeli ingin konfirmasi |
| `order.completed` (digital) | Pembeli | **Transaksi selesai** — inti permintaan |
| `service.accepted` (jasa) | Pembeli + Penjual | Transaksi selesai; penjual tahu dana dilepas |
| `order.receipt_accepted` | Pembeli | Konfirmasi penerimaan tercatat |
| `service.delivered` | Pembeli | Hasil pekerjaan siap ditinjau — pembeli harus bertindak |
| `refund_completed` | Pembeli | Uang kembali — wajib diberitahu |

### Prioritas 2 — update yang membutuhkan tindakan

| Event | Penerima | Alasan |
|---|---|---|
| `order.created` | Pembeli | Instruksi pembayaran + batas waktu |
| `order.expired` | Pembeli | Pesanan batal otomatis |
| `payment.proof_submitted` | Pembeli | Bukti diterima, menunggu verifikasi |
| `credit_received` | Pembeli | Saldo bertambah |
| `service.requirements_approved` | Pembeli | Pengerjaan dimulai |

### Tidak dikirim email (cukup in-app)

- `seller.applied`, `seller.active`, `seller.suspended` — frekuensi rendah,
  sudah ditangani notifikasi in-app + Telegram
- `product_inquiry` — chat, terlalu sering untuk email
- `payment.proof_submitted` ke staff — sudah ada antrean admin

### Preferensi pengguna (wajib)

Email tidak boleh dipaksa. Perlu kolom preferensi:
`email_notifications_enabled` (default true) + kategori opsional.
Sertakan tautan berhenti berlangganan di footer setiap email.

---

## 4. UI/UX email modern

### 4.1 Prinsip yang dipakai (dan alasannya)

| Prinsip | Alasan |
|---|---|
| **Satu kolom, lebar maksimal 600px** | Standar email; aman di semua klien (Gmail, Outlook, mobile) |
| **Tabel HTML, bukan flexbox/grid** | Outlook tidak mendukung flexbox/grid |
| **CSS inline** | Banyak klien email membuang `<style>` di `<head>` |
| **Tanpa gambar eksternal untuk elemen penting** | Gambar sering diblokir; email harus tetap terbaca |
| **Teks alternatif pada semua gambar** | Aksesibilitas + gambar diblokir |
| **Kontras WCAG AA** | Teks tetap terbaca di mode gelap paksa |
| **Tombol aksi tunggal dan jelas** | Satu tindakan utama per email |
| **Tanpa pelacakan piksel** | Privasi; tidak perlu untuk transaksional |

### 4.2 Palet (dikonversi dari token Ebrystore ke hex)

Klien email tidak mendukung `oklch()`, jadi token dikonversi:

| Token | Hex | Dipakai untuk |
|---|---|---|
| `background` | `#FBFAF6` | Latar halaman email |
| `card` | `#FFFFFF` | Kartu konten |
| `foreground` | `#071F21` | Teks utama |
| `muted-fg` | `#54676A` | Teks sekunder |
| `primary` | `#003F42` | Judul, header |
| `accent` | `#007A7A` | Tombol aksi utama |
| `border` | `#D7E0E0` | Garis pemisah |
| `success` | `#219761` | Status berhasil (lunas, selesai) |
| `warning` | `#EBAA2D` | Status menunggu tindakan |
| `destructive` | `#D01D21` | Status gagal/refund |

Font: `Sora` untuk judul, `Manrope` untuk isi — dengan fallback
`-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.

### 4.3 Struktur email (satu kerangka untuk semua tipe)

```
┌─────────────────────────────────────┐
│  Header: logo teks "Ebrystore"      │  ← warna primary, teks putih
├─────────────────────────────────────┤
│  Badge status (opsional)            │  ← "Lunas" hijau / "Perlu tindakan" kuning
│                                     │
│  Judul: apa yang terjadi            │  ← kalimat aktif, bukan "Notifikasi"
│  Ringkasan: 1-2 kalimat             │
│                                     │
│  ┌─ Kartu detail ─────────────┐     │
│  │ Nomor pesanan   EBS-...    │     │  ← tabel label/nilai, tabular
│  │ Total           Rp 25.000  │     │
│  │ Status          Selesai    │     │
│  └────────────────────────────┘     │
│                                     │
│  [ Tombol: Lihat pesanan ]          │  ← satu aksi utama (accent)
│                                     │
│  Catatan kecil / langkah lanjutan   │
├─────────────────────────────────────┤
│  Footer: bantuan, berhenti langganan│  ← wajib ada
└─────────────────────────────────────┘
```

### 4.4 Judul (subject) yang baik

| Buruk | Baik |
|---|---|
| "Notifikasi" | "Pembayaran diterima — pesanan EBS-20261005-000039" |
| "Update status" | "Hasil pekerjaan siap ditinjau — pesanan EBS-..." |
| "Pesanan selesai" | "Pesanan EBS-... selesai. Akses produkmu sudah aktif" |

Aturan: **sebutkan apa yang terjadi + nomor pesanan**. Pembeli harus bisa memutuskan
membuka atau tidak hanya dari judul.

### 4.5 Preview text

Setiap email punya `<span>` tersembunyi berisi ringkasan 1 baris. Tanpa ini,
klien email menampilkan potongan HTML acak sebagai preview.

### 4.6 Mode gelap

- Jangan pakai warna yang bergantung pada latar putih (mis. teks abu sangat muda)
- Batas kontras minimum 4.5:1 untuk teks normal
- `color-scheme: light dark` di `<head>` agar klien tahu email mendukung keduanya

### 4.7 Yang dilarang

- Lampiran (memicu spam filter; pakai tautan)
- Kata pemicu spam ("GRATIS!!!", huruf kapital berlebihan)
- Gambar besar tanpa teks alternatif
- Tautan yang tidak jelas tujuannya
- Lebih dari satu tombol aksi utama

---

## 5. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| SMTP gagal → pembeli tidak dapat kabar | Catat di tabel log, kirim ulang lewat cron; kegagalan **tidak** membatalkan transaksi |
| Email masuk spam | SPF/DKIM/DMARC untuk domain `ebrystore.my.id`; kirim dari `email.ebrystore.my.id`; hindari lampiran |
| Pembeli merasa dispam | Preferensi + tautan berhenti langganan; hanya event Prioritas 1 & 2 |
| Email dobel kirim | Tabel log idempoten (pola sama seperti `telegram_dispatch_log`) |
| Password SMTP bocor | **Sudah terjadi** — rotate setelah penerapan |
| Alamat email palsu/tidak valid | Validasi format sebelum kirim; catat kegagalan bounce |
| Beban server saat ramai | Kirim asinkron (tidak menunggu di jalur transaksi) |

---

## 6. Status bukti

| Bagian | Status |
|---|---|
| Email existing | `NOT_IMPLEMENTED` (nol kode) |
| Notifikasi in-app | `VERIFIED` (90 baris, 14 tipe) |
| Data email user | `VERIFIED` (27/27 ada email) |
| Pola idempotensi | `VERIFIED` (`telegram_dispatch_log`) |
| `pg_net` tersedia | `VERIFIED` |
| Kredensial SMTP | Diterima Owner; **harus dirotasi** |
| Palet email | `VERIFIED` (dikonversi dari token) |
| Event prioritas | Ditentukan berdasarkan data nyata 14 tipe |
| SPF/DKIM domain | `NOT_VERIFIED` — perlu dicek sebelum produksi |
