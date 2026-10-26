# 09 — Rencana Eksekusi MGRCAO V3: Notifikasi Email Transaksional

Tanggal: 2026-10-05 · Sumber temuan: [`../audit/2026-10-05-riset-email-transaksional.md`](../audit/2026-10-05-riset-email-transaksional.md)
Status: **RENCANA — SIAP EKSEKUSI**

---

## M — Mindset

1. **Problem-first**: pembeli perlu tahu saat transaksi selesai / status berubah
   walau tidak sedang membuka aplikasi. Sekarang hanya ada notifikasi in-app yang
   hanya terlihat kalau aplikasi dibuka.
2. **Email bukan pengganti notifikasi in-app** — email adalah lapisan tambahan
   untuk event yang benar-benar penting. Tidak semua 14 tipe notifikasi dikirim
   email; hanya yang membutuhkan perhatian di luar aplikasi.
3. **Kegagalan email tidak boleh merusak transaksi.** Pengiriman terjadi setelah
   transaksi database selesai; kalau SMTP mati, pesanan tetap sah dan tercatat
   untuk dikirim ulang.
4. **Idempoten**: satu event = maksimal satu email. Pola yang sudah terbukti di
   `telegram_dispatch_log` dipakai ulang.
5. **Hormati preferensi pengguna**: ada saklar, ada tautan berhenti langganan.
   Email tidak boleh dipaksa.
6. **Ikuti identitas Ebrystore** (DESIGN.md): ink-teal, low elevation, tanpa
   hiasan berlebihan. Email memakai palet yang sudah dikonversi dari token.

## G — Goal

Email otomatis terkirim saat transaksi selesai dan saat status pesanan berubah
penting, dengan tampilan modern yang terbaca di semua klien email.

### Slice 1 — Fondasi: pengirim + log idempoten + preferensi

| Aspek | Target |
|---|---|
| Masalah | Belum ada kode email sama sekali; belum ada cara mencegah email dobel |
| Target | Modul `email.server.ts` (nodemailer, SMTP SumoPod), tabel `email_dispatch_log` idempoten, kolom preferensi di `profiles` |
| Acceptance | (a) kredensial SMTP terbaca dari env; (b) `sendEmail()` mengembalikan ok/gagal tanpa melempar; (c) log mencegah kirim dobel untuk event yang sama; (d) user bisa mematikan email; (e) tanpa kredensial, aplikasi tetap jalan normal |

**Rancangan tabel `email_dispatch_log`:**

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid PK | — |
| `recipient_id` | uuid | pemilik email |
| `recipient_email` | text | disimpan untuk audit (email bisa berubah) |
| `event` | text | mis. `order.completed` |
| `entity_type` | text | `order` / `refund` / `credit` |
| `entity_id` | uuid | id terkait |
| `template` | text | nama template dipakai |
| `status` | text CHECK | `sent`, `failed`, `skipped` |
| `provider_id` | text | message-id dari SMTP |
| `error` | text | alasan gagal |
| `created_at` | timestamptz | — |
| UNIQUE | `(recipient_id, event, entity_id)` | **kunci idempotensi** |

**Kolom preferensi di `profiles`:** `email_notifications_enabled boolean DEFAULT true`.

### Slice 2 — Template email (satu kerangka, banyak isi)

| Aspek | Target |
|---|---|
| Masalah | Email perlu tampilan konsisten dan terbaca di semua klien |
| Target | `email-layout.ts` (kerangka HTML tabel, palet hex brand) + template per event |
| Acceptance | (a) satu kerangka dipakai semua email; (b) lebar 600px, tabel HTML, CSS inline; (c) ada preview text; (d) ada tautan berhenti langganan; (e) terbaca tanpa gambar; (f) kontras WCAG AA |

**Template yang dibuat (Prioritas 1):**

| Template | Event | Isi utama |
|---|---|---|
| `order-paid` | `order.paid` | Nomor pesanan, total, langkah berikutnya |
| `order-completed-digital` | `order.completed` (digital) | Akses produk aktif, tautan pustaka |
| `service-delivered` | `service.delivered` | Hasil siap ditinjau, tautan pesanan |
| `service-accepted` | `service.accepted` | Transaksi selesai (pembeli + penjual) |
| `receipt-accepted` | `order.receipt_accepted` | Konfirmasi penerimaan tercatat |
| `refund-completed` | `refund_completed` | Dana kembali, jumlah |

**Prioritas 2** (menyusul, pola sama): `order-created`, `order-expired`,
`payment-proof-submitted`, `credit-received`, `service-requirements-approved`.

### Slice 3 — Pemicu + cron kirim ulang + UI preferensi

| Aspek | Target |
|---|---|
| Masalah | Email harus terkirim otomatis tanpa memperlambat transaksi |
| Target | Pemanggilan setelah transaksi selesai; cron Node mengirim yang gagal; UI preferensi di pengaturan akun |
| Acceptance | (a) transaksi selesai → email terkirim; (b) SMTP mati → transaksi tetap sukses, tercatat `failed`; (c) cron mengirim ulang yang `failed` (maks 3×); (d) pengguna bisa mematikan di pengaturan; (e) tidak ada email dobel |

**Pemicu yang dipakai** — mengikuti pola `dispatchServiceOrderAlerts` (Telegram):

1. Setelah `settle_gateway_payment` sukses (webhook/polling) → email `order-paid`
2. Setelah `confirm_digital_receipt` sukses → email `order-completed-digital`
3. Setelah `accept_service_delivery` sukses → email `service-accepted`
4. Setelah `submit_service_delivery` sukses → email `service-delivered`
5. Setelah `process_refund` sukses → email `refund-completed`

**Cara memicu:** fungsi `dispatchEmailQueue()` dipanggil dari titik-titik di atas
(dan dari cron sebagai jaring pengaman), memindai event baru yang belum dikirim
berdasarkan `email_dispatch_log`.

## G-UI — Lapisan UI/UX email

| Elemen | Keputusan | Alasan |
|---|---|---|
| Lebar | maks 600px, satu kolom | Standar; aman di semua klien |
| Struktur | tabel HTML | Outlook tidak dukung flex/grid |
| CSS | inline | Banyak klien membuang `<style>` |
| Header | teks "Ebrystore" warna `#003F42` | Logo gambar sering diblokir |
| Badge status | `#219761` berhasil, `#EBAA2D` menunggu, `#D01D21` gagal | Semantik konsisten dengan aplikasi |
| Kartu detail | tabel label/nilai, angka `tabular-nums` | Angka mudah dibandingkan |
| Tombol | satu, warna `#007A7A`, tinggi min 44px | Target sentuh + satu tindakan jelas |
| Footer | bantuan + berhenti langganan | Wajib secara praktik email |
| Mode gelap | `color-scheme: light dark`, kontras ≥ 4.5:1 | Sebagian klien memaksa gelap |

Aturan ketat: tanpa lampiran; tanpa piksel pelacak; tanpa huruf kapital berlebihan;
judul menyebut apa yang terjadi + nomor pesanan.

## G-UI-RULE — Aturan Anti AI-Slop untuk Email (WAJIB)

Email adalah permukaan UI juga. Semua aturan anti-slop di `DESIGN.md` dan skill
`antislop-ui` berlaku penuh di sini, dengan penyesuaian untuk keterbatasan klien
email. Setiap aturan punya **cara uji** — bukan sekadar niat.

### A. Warna & Permukaan

| # | Aturan | Alasan | Cara uji |
|---|---|---|---|
| E-01 | Palet **hanya** dari tabel hex di atas (turunan token Ebrystore). Dilarang gradien biru-ungu/ungu-pink, orbs blur, atau warna di luar daftar (R-01, R-29) | Gradien default = tanda "tanpa identitas brand", paling khas AI | Cari `linear-gradient`/`radial-gradient` di template: hanya boleh ada bila beralasan tertulis |
| E-02 | Aksen `#007A7A` **hanya** di tombol aksi utama. Tidak di border, ikon, badge, dan teks sekaligus (R-29, R-13) | Aksen di mana-mana berhenti jadi aksen | Hitung elemen beraksen per email: maksimal **1** |
| E-03 | Tanpa glow, tanpa shadow berlapis, tanpa `box-shadow` dekoratif (R-12, R-13) | Elevasi palsu; klien email tidak merender konsisten | Tidak ada `box-shadow` selain garis pemisah |
| E-04 | Maksimal 2-3 warna inti + 1 aksen per email (R-29) | Palet berserakan = tanpa hierarki | Hitung warna unik yang dipakai |

### B. Tipografi & Copy

| # | Aturan | Alasan | Cara uji |
|---|---|---|---|
| E-05 | **Em-dash 0** pada seluruh copy email (hard gate DESIGN.md) | Tanda paling khas tulisan hasil model | Cari karakter `—` di semua template: harus 0 |
| E-06 | **Emoji 0** di subjek, judul, badan, dan tombol (R-04) | Emoji adalah singkatan paling keras untuk "ini dihasilkan, bukan ditulis" | Regex emoji pada semua output: harus 0 |
| E-07 | Dilarang huruf kapital semua dan tanda seru berulang (spam + slop) | Pemicu spam + nada palsu | Cari `[A-Z]{5,}` dan `!!` |
| E-08 | Subjek menyebut **fakta + nomor pesanan**, bukan kata umum ("Notifikasi", "Update") | Pembeli harus bisa memutuskan buka/tidak dari subjek saja | Setiap subjek memuat nomor pesanan atau nama produk |
| E-09 | Tanpa kata pemicu spam: "GRATIS", "PROMO", "SEGERA", "JANGAN LEWATKAN" | Filter spam + nada tidak jujur | Daftar kata diperiksa sebelum kirim |
| E-10 | Tanpa klaim/testimoni yang tidak bisa diverifikasi (R-36) | Email transaksional menyampaikan fakta transaksi, bukan promosi | Tidak ada kalimat pujian produk |

### C. Struktur & Data

| # | Aturan | Alasan | Cara uji |
|---|---|---|---|
| E-11 | **Semua angka berasal dari data nyata.** Nomor pesanan, total, status: dari database. Tidak ada angka contoh (R-17, R-38) | Angka palsu = kebohongan yang terlihat | Setiap field di kartu detail dipetakan ke kolom DB |
| E-12 | Tanpa angka karangan, tanpa delta tren ("+12% minggu ini") | Klaim tren tanpa seri data di belakangnya | Tidak ada persentase di template |
| E-13 | Empty state jujur: bila data tidak ada, tulis alasannya, bukan "Tidak ada data" (R-27) | State kosong harus memberi tahu sebab + langkah berikutnya | Setiap nilai null punya teks pengganti yang menjelaskan |
| E-14 | Satu email = satu tindakan utama. Tombol kedua hanya bila benar-benar perlu (R-26) | Dua tombol bersaing = tidak ada fokus | Hitung tombol: maksimal **1** primer, sekunder hanya bila ada alasan tertulis |
| E-15 | Tanpa bagian yang hanya "mengisi template" (R-05, C-3) | Section ada karena konten butuh, bukan karena template punya | Setiap blok dipetakan ke kebutuhan transaksi |
| E-16 | Tanpa ilustrasi/ikon yang tidak berhubungan dengan isi (R-22) | Dekorasi tanpa makna | Setiap gambar punya teks alternatif yang menjelaskan fungsinya |

### D. Aksesibilitas & Ketahanan

| # | Aturan | Alasan | Cara uji |
|---|---|---|---|
| E-17 | Email **terbaca penuh tanpa gambar** (gambar sering diblokir) | Kalau logo gagal dimuat, email harus tetap bermakna | Nonaktifkan gambar: semua info tetap terbaca |
| E-18 | Kontras teks ≥ 4.5:1, termasuk saat klien memaksa mode gelap (R-25, R-03) | Keterbacaan di semua kondisi | Ukur kontras tiap pasangan warna |
| E-19 | Semua kontrol bisa dijangkau keyboard; tautan punya teks yang jelas (bukan "klik di sini") (R-32) | Aksesibilitas dasar | Semua `<a>` punya teks deskriptif |
| E-20 | Tanpa piksel pelacak, tanpa tautan pelacak | Privasi; tidak diperlukan untuk transaksional | Tidak ada `<img>` 1x1 atau parameter pelacak |
| E-21 | Setiap email punya tautan berhenti langganan yang benar-benar berfungsi (R-26) | Kontrol harus bekerja, bukan hiasan | Uji klik: benar-benar mengubah preferensi |

### E. Larangan Keras (langsung FAIL)

- Gradien warna default AI (biru-ungu, ungu-pink, neon)
- Emoji di subjek atau judul
- Em-dash di copy
- Angka atau nama karangan (`John Doe`, `Rp 99.999` sebagai contoh)
- Tombol atau tautan yang tidak punya tujuan nyata
- Klaim/testimoni tanpa bukti
- Lampiran (pemicu spam + risiko keamanan)
- Lebih dari satu tombol aksi utama
- Warna di luar palet yang disetujui

### F. Checklist sebelum template dianggap selesai

Semua jawaban harus **ya**:

- [ ] Palet dari tabel hex, tanpa gradien default (E-01, E-04)
- [ ] Aksen hanya di satu tombol (E-02)
- [ ] Tanpa glow/shadow dekoratif (E-03)
- [ ] Em-dash 0 (E-05)
- [ ] Emoji 0 (E-06)
- [ ] Subjek memuat nomor pesanan/nama produk (E-08)
- [ ] Semua angka dari database, tidak ada contoh (E-11, E-12)
- [ ] Null punya teks penjelas, bukan "Tidak ada data" (E-13)
- [ ] Maksimal satu tombol utama (E-14)
- [ ] Terbaca penuh tanpa gambar (E-17)
- [ ] Kontras ≥ 4.5:1 di terang dan gelap (E-18)
- [ ] Tautan berhenti langganan benar-benar berfungsi (E-21)
- [ ] Tidak ada satu pun butir di bagian E

**Aturan penerapan:** checklist ini dijalankan **sebelum** template dianggap selesai,
dan hasilnya dicatat di laporan verifikasi — bukan diklaim. Bila ada butir yang gagal,
template belum boleh dipakai, sekalipun emailnya "sudah bisa terkirim".

## R — Role

Backend engineer (nodemailer, SMTP, idempoten) + frontend engineer (template HTML
email + UI preferensi) + security reviewer (kredensial, header anti-spam) +
QA (uji kirim nyata, cek spam, cek dobel).

## C — Context (bukti terverifikasi, rincian di dokumen riset)

- **Email belum ada**: nol dependensi, nol kode, nol tabel log.
- **Notifikasi in-app sudah jalan**: 90 baris, 14 tipe. **Tidak ada trigger** pada
  tabel `notifications` — semua disisipkan dari dalam RPC. Ini titik integrasi bersih.
- **27/27 user punya email** di `profiles.email`.
- **Pola idempoten sudah terbukti**: `telegram_dispatch_log` (`order_id`, `event`, `sent_at`).
- **`pg_net` tersedia**, tapi jalur yang dipilih adalah Node (nodemailer) karena
  template HTML jauh lebih terawat di TypeScript.
- **SMTP**: `smtp.sumopod.com:465` (SSL) dari `email.ebrystore.my.id`.
- **Palet email** sudah dikonversi dari token OKLCH ke hex (klien email tidak
  mendukung oklch).

## A — Action

1. **Slice 1** → pasang `nodemailer` → `email.server.ts` (config dari env,
   `sendEmail()` tidak melempar) → migrasi `email_dispatch_log` + preferensi
   → test unit (config hilang, idempotensi, preferensi mati).
2. **Slice 2** → `email-layout.ts` (kerangka tabel HTML + palet hex) → 6 template
   Prioritas 1 → **jalankan checklist anti-slop G-UI-RULE bagian F** → uji render
   (HTML valid, kontras, tanpa gambar tetap terbaca).
3. **Slice 3** → `dispatchEmailQueue()` di 5 titik pemicu + cron Node → UI
   preferensi di `/dashboard/pengaturan` → uji kirim nyata ke alamat sendiri.
4. **Setiap slice**: implementasi → `npx eslint --fix` → `npm run test:unit` →
   `npm run build` → catat bukti.
5. **Gerbang anti-slop (wajib)**: template belum dianggap selesai sebelum checklist
   G-UI-RULE bagian F lulus semua dan hasilnya dicatat. Email yang "sudah bisa
   terkirim" tetapi melanggar butir larangan keras (bagian E) = **belum selesai**.

## O — Output

1. `src/lib/email.server.ts` + `src/lib/email-layout.ts` + 6 template.
2. Migrasi `email_dispatch_log` + kolom preferensi.
3. Pemicu email di 5 titik transaksi + cron kirim ulang.
4. UI preferensi email di pengaturan akun.
5. Test unit: config hilang, idempotensi, preferensi mati, template render.
6. **Hasil checklist anti-slop G-UI-RULE bagian F** per template (13 butir,
   semuanya harus "ya"), dicatat di laporan verifikasi.
7. Laporan verifikasi dengan bukti kirim nyata (bukan klaim).

### Non-goals

- Email pemasaran/broadcast (hanya transaksional).
- Lampiran (faktur PDF menyusul terpisah bila diminta).
- Pelacakan buka/klik (privasi; tidak perlu).
- Ganti penyedia email.

### Keputusan Owner yang diperlukan

| ID usulan | Pertanyaan | Default aman |
|---|---|---|
| O-17 | Alamat pengirim tampil (`noreply@ebrystore.my.id`?) | Pakai `email.ebrystore.my.id` yang tersedia |
| O-18 | SPF/DKIM/DMARC sudah dipasang di DNS? | Perlu dicek sebelum produksi; tanpa ini email rawan spam |
| O-19 | Kirim juga ke penjual saat transaksi selesai? | Ya untuk `service.accepted` (dana dilepas) |

### Risiko & rollback

| Risiko | Mitigasi |
|---|---|
| Email masuk spam | SPF/DKIM/DMARC + hindari lampiran/kata pemicu; uji ke Gmail nyata |
| Kegagalan SMTP merusak transaksi | Pengiriman **setelah** transaksi; gagal dicatat, tidak melempar |
| Email dobel | UNIQUE `(recipient_id, event, entity_id)` |
| Password SMTP bocor | **Sudah terjadi** — rotate setelah penerapan |
| Beban saat ramai | Kirim asinkron, tidak menunggu di jalur checkout |

Rollback: hapus modul + migrasi (drop tabel log, drop kolom preferensi); pemicu
dilepas satu per satu. Tanpa migrasi destruktif ke data transaksi.
