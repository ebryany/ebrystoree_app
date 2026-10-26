# Ebrystore

Marketplace multi-vendor untuk **produk digital** dan **jasa**, dibangun untuk pasar Indonesia. Pembeli dapat menemukan produk atau layanan dari beberapa toko, membandingkan harga, dan menyelesaikan transaksi; seller mengelola tokonya sendiri; admin dan tim operasional menangani moderasi, pembayaran, dan penyelesaian pesanan.

Berbeda dari marketplace barang fisik, Ebrystore dirancang untuk dua jenis penawaran yang alurnya memang tidak sama: produk digital yang diserahkan sebagai file, dan jasa yang dikerjakan bertahap dengan progres dan revisi.

## Dua jenis penawaran

**Produk digital.** File, template, lisensi, atau kode. Setelah pembayaran terverifikasi, pembeli memperoleh entitlement dengan kuota unduh dan masa akses, lalu mengunduh lewat signed URL.

**Jasa.** Layanan dengan paket harga, estimasi durasi, dan batas revisi. Pesanan masuk antrean, ditugaskan ke operator, dikerjakan bertahap, lalu hasilnya diserahkan untuk ditinjau pembeli.

## Peran pengguna

| Peran | Tanggung jawab |
|---|---|
| Customer | Membeli, mengunduh, memberi ulasan, mengajukan refund |
| Seller | Mengelola produk dan jasa tokonya sendiri, melihat pesanan dan keuangannya |
| Operator | Mengerjakan pesanan jasa dan mengunggah hasil |
| Support | Menangani komplain dan membantu proses refund |
| Finance | Memverifikasi pembayaran manual dan menyetujui refund |
| Admin | Operasional harian: moderasi, penugasan, pengelolaan pengguna |
| Super admin | Konfigurasi sistem dan manajemen izin |

Izin bersifat granular dan diperiksa di server, bukan hanya disembunyikan di antarmuka.

## Alur transaksi

```
Pilih produk/jasa → Checkout (harga dihitung server) → Pesanan dibuat
    → Pembayaran (QRIS atau transfer manual + unggah bukti)
    → Verifikasi pembayaran oleh finance
    → Produk digital: entitlement terbit, file dapat diunduh
      Jasa: pesanan masuk antrean operator, dikerjakan, hasil diserahkan
    → Pesanan selesai → Pendapatan seller dicatat di ledger toko
```

Harga akhir selalu dihitung ulang di server. Setiap pembuatan pesanan memakai idempotency key sehingga permintaan ganda tidak menghasilkan dua pesanan.

## Fitur yang sudah berjalan

- Autentikasi lengkap: daftar, masuk, keluar, reset kata sandi.
- Katalog produk digital dengan tiga mode pengiriman: file bersama, stok unik per pembeli, dan kode.
- Layanan jasa dengan paket harga dan add-on.
- Checkout langsung dengan snapshot harga dan identitas produk saat transaksi.
- Pembayaran QRIS lewat SumoPod, termasuk verifikasi signature webhook dan idempotensi.
- Pembayaran manual: unggah bukti transfer, verifikasi oleh finance, penolakan dengan alasan, dan permintaan unggah ulang.
- Store credit: top-up, pemakaian otomatis saat checkout, dan ledger append-only.
- Entitlement produk digital dengan kuota unduh, masa berlaku, dan pencatatan setiap unduhan.
- Alur jasa: penugasan operator, progres, hasil, dan revisi.
- Refund: pengajuan oleh pembeli, peninjauan dan pemrosesan oleh finance.
- Dashboard seller: produk, pesanan, jasa, keuangan, performa, chat, dan pengaturan toko.
- Halaman toko publik, rating, ulasan, dan chat realtime antara pembeli dan seller.
- Panel admin untuk pesanan, pembayaran, refund, produk, seller, layanan, artikel, pengguna, izin, audit log, dan laporan.
- Notifikasi email transaksional lewat SMTP.
- 51 tool MCP agar admin dapat menjalankan operasi rutin lewat asisten AI.

## Yang belum tersedia

Bagian ini penting agar tidak ada ekspektasi yang salah:

- **Komisi marketplace belum ditetapkan.** Ledger menyimpan kolom komisi, tetapi nilainya masih nol. Model monetisasi menunggu keputusan pemilik produk.
- **Pencairan dana ke rekening seller belum dibangun.** Saldo seller tercatat di ledger, tetapi proses payout belum ada.
- **Verifikasi identitas seller (KYC) belum ada.**
- **Alur penyelesaian sengketa belum dibangun.** Statusnya ada, mekanismenya belum.
- **Staging environment belum ada.** Pengujian dilakukan di lokal.

## Teknologi

| Lapisan | Teknologi |
|---|---|
| Framework | TanStack Start (SSR) |
| Frontend | React 19, TanStack Router, TypeScript |
| UI | Tailwind CSS v4, Radix UI, komponen shadcn-style |
| Data | TanStack Query, React Hook Form, Zod |
| Database | Supabase PostgreSQL dengan Row Level Security |
| Auth | Supabase Auth |
| Storage | Supabase Storage (bucket publik dan privat) |
| Pembayaran | SumoPod (QRIS) dan verifikasi transfer manual |
| Email | Nodemailer dengan SMTP |
| Test | Vitest (unit), Playwright (end-to-end) |
| Build | Vite |

## Menjalankan secara lokal

Prasyarat: Node.js 22 atau lebih baru, dan npm.

```sh
git clone https://github.com/ebryany/ebrystoree_app.git
cd ebrystoree_app
npm install
```

Salin `.env.example` menjadi `.env`, lalu isi nilainya:

```sh
cp .env.example .env
```

Variabel yang dibutuhkan terbagi dua kelompok:

- **Publik** (prefix `VITE_`): URL project Supabase dan publishable key. Nilai ini memang dikirim ke browser.
- **Server-only**: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY`. Service role key melewati seluruh RLS, jadi tidak boleh pernah masuk ke bundle klien.

Jalankan server pengembangan:

```sh
npm run dev
```

## Perintah yang tersedia

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` | Build produksi |
| `npm run preview` | Pratinjau hasil build |
| `npm run lint` | Pemeriksaan ESLint |
| `npm run test:unit` | Unit test dengan Vitest |
| `npm run test:e2e` | End-to-end test dengan Playwright |
| `npm run verify` | Lint, unit test, dan build sekaligus |

## Struktur proyek

```
src/
├── routes/              Rute berbasis file, termasuk dashboard seller, admin, operator
├── lib/                 Server functions, utilitas server, dan test
├── components/          Komponen UI bersama dan per domain
├── integrations/        Klien Supabase dan middleware autentikasi
supabase/migrations/     Migrasi SQL, RLS, dan fungsi RPC
tests/e2e/               Skenario Playwright
docs/                    Dokumentasi arsitektur dan laporan audit
```

## Keamanan

- Row Level Security aktif di seluruh tabel yang memuat data pengguna.
- Otorisasi objek untuk data toko, sehingga seller tidak dapat membaca data seller lain.
- Pemeriksaan izin di server untuk operasi administratif.
- Signed URL berumur pendek untuk file produk berbayar.
- Verifikasi signature webhook, batas ukuran body, dan idempotensi pada callback pembayaran.
- Rate limiting pada operasi sensitif.
- Field sensitif toko dan produk dilindungi dari perubahan lewat jalur umum.

Temuan audit dan status remediasinya tersedia di `docs/audit/`.
