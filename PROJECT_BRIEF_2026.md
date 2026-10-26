# Ebrystore — Project Brief untuk Brainstorming AI

**Tanggal**: 2026-10-21
**Tujuan dokumen**: bahan lengkap agar AI lain bisa langsung memahami project tanpa perlu membaca seluruh repo.
**Cara pakai**: tempel dokumen ini sebagai konteks awal, lalu ajukan pertanyaan dari bagian "Brainstorming Starter Questions" di bawah.

---

## 1. Apa Ini

Ebrystore adalah platform marketplace Indonesia untuk **produk digital** (file, akun, lisensi, kode) dan **jasa** (joki game, layanan akademik, jasa kreatif). Awalnya dibangun sebagai toko single-vendor; sejak 30 September 2026 berevolusi menjadi **marketplace multi-vendor** tempat seller eksternal bisa mendaftar dan berjualan.

Yang membedakan dari Shopee/Tokopedia: fokus pada produk digital dan jasa dengan alur pengerjaan yang transparan, bukan barang fisik.

**Status keseluruhan**: fitur inti commerce sudah berjalan dan terverifikasi. Marketplace multi-vendor sudah punya fondasi (seller, toko, moderasi) tetapi belum lengkap untuk peluncuran publik.

---

## 2. Model Bisnis

| Sumber pendapatan | Keterangan | Status keputusan |
|---|---|---|
| Marjin produk digital | Platform menjual produk sendiri juga | Berjalan |
| Tarif paket jasa + add-on | Paket layanan dengan harga bertingkat | Berjalan |
| Komisi marketplace | Persentase dari transaksi seller | **Belum diputuskan** |
| Biaya admin per transaksi | Dikonfigurasi sistem, transparan | **Belum diputuskan** |

### Keputusan owner yang sudah final
- **Direct checkout** tanpa cart penuh di MVP.
- **Refund parsial** dengan approval admin (keputusan ini sudah ada, implementasi perlu dicek ulang).
- **Entitlement digital**: 5 unduhan, masa aktif 365 hari.
- **Stack**: TanStack Start + Supabase.

### Keputusan yang masih terbuka
| ID | Pertanyaan | Dampak |
|---|---|---|
| U-01 | Provider QRIS mana yang dipakai | Memblokir webhook pembayaran otomatis |
| U-04 | Berapa revisi gratis per paket jasa | Memengaruhi syarat layanan |
| U-05 | Skema komisi operator | Memengaruhi desain payout |
| U-06 | Kanal WhatsApp | Ditunda post-MVP |
| U-07 | Verifikasi email wajib atau opsional | Dampak sedang |
| U-09 | Kebijakan biaya admin | Memengaruhi desain ledger |
| U-10 | KYC/escrow | Ditunda karena butuh dasar legal |

---

## 3. Pengguna dan Peran

Sistem punya **7 role** (enum `app_role`):

| Role | Bisa apa | Catatan |
|---|---|---|
| `customer` | Beli, unduh, ulas, ajukan refund | Default untuk user baru |
| `seller` | Kelola produk/jasa sendiri, lihat order sendiri | **Diberikan otomatis saat toko disetujui admin** |
| `operator` | Ambil/kerjakan tugas jasa, unggah hasil | Dashboard `/operator` sudah ada |
| `support` | Tangani komplain, bantu refund | |
| `finance` | Verifikasi pembayaran manual, approve refund | |
| `admin` | Operasional penuh, moderasi, task | |
| `super_admin` | Konfigurasi sistem, manajemen user | |

Izin bersifat granular (contoh: `sellers.view`, `sellers.approve`, `sellers.manage`, `orders.assign`, `products.moderate`), dicek di server lewat `assertPermission`, bukan hanya disembunyikan di UI.

---

## 4. Tech Stack

| Lapisan | Teknologi |
|---|---|
| Runtime | TanStack Start (SSR) + Lovable Cloud |
| Frontend | React 19, TanStack Router v1.170, TypeScript 5.8 |
| UI | Radix UI + Tailwind CSS v4 + shadcn-style components |
| Data | TanStack Query v5, React Hook Form v7 + Zod v4 |
| Chart | Recharts v2 |
| Animasi | motion v13 |
| Database | Supabase (PostgreSQL) + RLS |
| Auth | Supabase Auth |
| Storage | Supabase Storage (bucket publik + privat) |
| Pembayaran | SumoPod (QRIS) + verifikasi manual |
| Email | Nodemailer + SMTP |
| Test | Vitest (unit) + Playwright (e2e) |
| Build | Vite v8 |
| Deploy | Lovable Cloud, sinkron ke GitHub |

---

## 5. Struktur Kode

```
src/
├── routes/                        # File-based routing (103 file)
│   ├── _authenticated/
│   │   ├── admin/                # 32 halaman admin (di luar layout route)
│   │   ├── seller/               # 14 halaman dashboard seller
│   │   ├── dashboard/            # Halaman customer
│   │   ├── operator*             # Dashboard operator
│   │   └── checkout*             # Alur checkout
│   ├── api/public/               # Webhook, job dispatcher, integrasi
│   ├── see/_dashboard/           # Dashboard pertumbuhan (marketing/konten/SEO/kampanye)
│   └── [publik]                  # Home, produk, layanan, toko, artikel, legal
│
├── lib/                          # 241 createServerFn + utilitas server
│   ├── *.functions.ts            # Server functions (pola utama)
│   ├── *.server.ts               # Kode server-only (secret, SMTP, storage)
│   ├── authz.server.ts           # assertPermission + helper otorisasi
│   ├── transaction.server.ts     # Engine transaksi + signed URL
│   ├── marketplace-service.ts    # Domain jasa marketplace
│   ├── mcp/                      # 51 tool MCP untuk admin via AI
│   └── __tests__/                # 33 file test, 357 test case
│
├── components/                   # admin, seller, checkout, ebry, product, ui
└── integrations/supabase/        # Client + middleware auth

supabase/migrations/              # 114 file SQL
docs/                             # Dokumentasi lengkap (audit, arsitektur, evidence)
tests/e2e/                        # 5 spec Playwright (28 skenario)
```

**Angka terverifikasi** (dihitung langsung dari repo):
- 74.592 baris kode di `src/`
- 57 tabel (`CREATE TABLE` di migrasi)
- 114 migrasi SQL
- 241 `createServerFn`
- 103 file route
- 33 file test unit, 357 test case
- 5 file E2E, 28 skenario

---

## 6. Fitur: Apa yang Sudah Jalan

Bagian ini berdasarkan kode dan dokumen evidence, bukan klaim roadmap.

### Fondasi
- Auth lengkap: register, login, logout, reset password, sesi.
- RBAC 7 role + permission granular, dicek server-side.
- Audit log untuk perubahan state.
- Rate limiting pada server function tertentu.
- Scheduler aktif (3 cron job) untuk job terjadwal.

### Katalog & Checkout
- Produk digital dengan 3 mode pengiriman: `shared`, `unique`, `code`.
- Layanan jasa dengan paket dan add-on.
- Checkout langsung (tanpa cart), harga dihitung server.
- Idempotency key mencegah order ganda.
- Snapshot harga dan identitas saat transaksi.

### Pembayaran
- **QRIS via SumoPod**: create payment, ambil QR, cek status, webhook dengan signature + idempotency + batas ukuran body. Webhook menangani **dua jalur**: pembayaran order (tabel `payments`) dan top-up saldo (tabel `credit_topups`).
- **Manual**: upload bukti transfer, verifikasi finance (`payment_verifications`), event log.
- **Store credit**: top-up via QRIS, autopay, ledger append-only (`credit_ledger`).

### Pengiriman Digital
- Entitlement per pembelian (5 unduhan / 365 hari).
- Signed URL untuk akses file privat.
- `consume_download` mencatat setiap unduhan.
- Upload file produk oleh admin/seller (`digital_product_files`).
- Struk digital untuk pembeli.

### Jasa & Fulfillment
- Penugasan operator (`assign_operator`) dari admin.
- Dashboard operator untuk mengambil dan mengerjakan tugas.
- Alur progres, hasil, dan revisi untuk order jasa.
- Delivery artifact untuk hasil pekerjaan.
- Realtime dipakai di 35 file lewat hook `useRealtimeRefresh` (dashboard, admin, seller, chat, timeline).

### Refund
- `request_refund` oleh pembeli.
- `review_refund` dan `process_refund` oleh finance/admin.
- Refund bisa masuk sebagai store credit.
- Rekonsiliasi refund di dashboard.

### Seller & Marketplace
- Role `seller` + tabel `stores`.
- Alur pengajuan toko → antrean admin → approve/reject.
- Moderasi produk lintas seller.
- Dashboard seller: produk, pesanan, jasa, keuangan, performa, chat, pengaturan.
- Halaman toko publik (`/toko/$slug`).
- Ledger transaksi toko (`seller_ledger`, append-only).
- Rating dan ulasan toko.
- Chat realtime antara pembeli dan seller.

### Admin
- 32 halaman: orders, payments, refunds, produk, seller, layanan, artikel, PO, pengguna, izin, audit, task, jobs, notifikasi, settings.
- Laporan marketplace: GMV, penjualan ledger, refund, saldo seller, leaderboard seller.
- Dashboard pertumbuhan: marketing, konten, SEO, kampanye.
- Moderasi jasa.

### Integrasi Tambahan
- MCP server dengan 51 tool (kelola produk, order, user, laporan) agar admin bisa operasi lewat AI.
- Integrasi Jiofarm (demand & links).
- Telegram dispatcher.
- Email transaksional via SMTP dengan template dan retry.
- Analytics event tracking + atribusi UTM.

---

## 7. Fitur: Apa yang Belum atau Parsial

Ini bagian yang paling penting untuk brainstorming. Daftar ini sudah diverifikasi, bukan asumsi.

### Gap kritis
1. **Seller `pending` tidak bisa menyiapkan produk.** Role `seller` baru diberikan setelah toko disetujui, padahal UI di `/seller` menulis "Anda dapat menyiapkan produk, tetapi belum tampil sampai toko disetujui". **Teks ini tidak akurat.** Keputusan produk belum diambil: ubah teks, atau longgarkan policy agar seller pending bisa simpan draft.

2. **Keputusan komisi & biaya admin belum ada.** Ledger dan payout bergantung pada angka ini. Tanpa keputusan, fitur finansial marketplace tidak bisa diselesaikan.

3. **Payout ke seller belum ada.** Saldo seller tercatat di ledger, tetapi pencairan ke rekening bank belum diimplementasikan. MVP berencana manual, tetapi alurnya belum dibangun.

### Parsial
- **Refund parsial**: RPC `request_refund`/`review_refund`/`process_refund` ada, tetapi UI dan alokasi per-item perlu diverifikasi ulang apakah sudah mendukung nominal sebagian.
- **Dispute**: status `disputed` ada di enum dan label UI, tetapi alur penyelesaian sengketa (mediasi, bukti, keputusan) belum dibangun.
- **Notifikasi**: email transaksional sudah ada (dispatcher + retry + log), tetapi cakupan event dan preferensi pengguna perlu dicek.
- **KYC/verifikasi seller**: belum ada. Siapa pun bisa mendaftar sebagai seller tanpa verifikasi identitas.
- **Staging environment**: belum ada. Semua pengujian dilakukan di lokal atau langsung di production.

### Belum ada
- Payout otomatis ke bank.
- Multi-seller cart (memang non-goal MVP).
- Multi-store per seller (non-goal MVP).
- Aplikasi mobile native.
- Escrow penuh (ditunda karena butuh dasar legal).

---

## 8. Keamanan

### Yang sudah ada
- RLS di level tabel.
- Otorisasi objek (`can_access_store`) untuk data toko.
- `assertPermission` di server function.
- Signed URL untuk file privat.
- Webhook dengan signature + idempotency + batas body.
- Rate limiting.
- Proteksi field sensitif (`protect_store_privileged_fields`, `protect_product_transaction_fields`).
- Blokir pembelian sendiri (`block_digital_self_purchase`).
- Least privilege untuk role `anon`.

### Kerentanan yang pernah ditemukan dan diperbaiki
- **IDOR `get_store_balance` + `store_rating_summary`** (30 Sep 2026): user biasa bisa membaca saldo toko orang lain. Ditutup dengan `can_access_store` + `COALESCE(..., false)`.
- **Bug NULL di helper otorisasi**: `can_access_store` mengembalikan NULL karena logika tiga-nilai SQL, sehingga `IF NOT NULL` dianggap lolos dan IDOR tetap terbuka meski kode terlihat benar. Ditemukan lewat uji nyata, bukan review kode.
- **Bug `admin_seller_leaderboard`**: `store_id` ambigu antara OUT parameter dan kolom tabel.

### Risiko yang masih terbuka
- **XSS**: konten user-generated (deskripsi produk, ulasan) perlu sanitasi ketat.
- **Upload file**: validasi tipe dan ukuran ada, tetapi pemindaian malware belum.
- **Verifikasi seller**: belum ada KYC, sehingga seller anonim bisa berjualan.
- **Backup/restore**: belum pernah diuji restore penuh.

---

## 9. Database (Ringkasan)

57 tabel, dikelompokkan (nama sesuai migrasi):

| Kelompok | Tabel utama |
|---|---|
| Auth & user | `profiles`, `user_roles`, `permissions`, `role_permissions` |
| Katalog | `digital_products`, `digital_product_files`, `product_stock_codes`, `services`, `service_packages`, `service_addons`, `categories`, `marketplace_services` |
| Order | `orders`, `order_items`, `order_status_histories`, `service_order_details`, `custom_orders`, `invoices` |
| Pembayaran | `payments`, `manual_payment_proofs`, `payment_verifications`, `payment_events`, `refunds`, `po_payments` |
| Pengiriman digital | `digital_entitlements`, `download_logs`, `digital_order_receipts` |
| Jasa | `operator_assignments`, `job_progress`, `job_results`, `job_revisions`, `marketplace_service_orders`, `marketplace_service_events`, `marketplace_service_deliveries` |
| Marketplace | `stores`, `seller_ledger`, `product_inquiries`, `product_inquiry_messages`, `po_messages` |
| Kredit | `credit_ledger`, `credit_topups` |
| Operasional | `admin_tasks`, `audit_logs`, `system_settings`, `scheduled_job_runs`, `rate_limit_hits`, `notifications` |
| Pertumbuhan | `articles`, `article_status_history`, `campaigns`, `analytics_events`, `analytics_daily`, `seo_audit_results` |
| Ulasan | `product_reviews` (mencakup ulasan toko lewat `store_id`) |
| Email/Telegram | `email_dispatch_log`, `telegram_dispatch_log` |
| Akademik | `academic_order_attachments` |

**Catatan penting**: tidak ada tabel `seller_applications` terpisah. Pengajuan seller langsung menulis ke tabel `stores` dengan `status='pending'` lewat RPC `apply_as_seller`. Tidak ada tabel chat terpisah; chat memakai `product_inquiries` + `product_inquiry_messages`.

**Realtime aktif** untuk produk, entitlement, download log, refund, order jasa, chat/inquiry, PO, dan payment verification.

---

## 10. Testing

| Jenis | Status |
|---|---|
| Unit (Vitest) | **33 file, 357 test case** |
| E2E (Playwright) | **5 spec, 28 skenario, semua lulus** |
| Lint | 0 error, ~450 warning (mayoritas formatting dan `any`) |
| Build | Sukses |

**Cakupan E2E**: storefront publik, auth guard, navigasi mobile, dashboard customer, 8 halaman admin, verifikasi 3 job terjadwal.

**Celah testing**: tidak ada test untuk alur seller end-to-end, moderasi produk, refund, dan payout.

---

## 11. Operasional

| Aspek | Status |
|---|---|
| Hosting | Lovable Cloud (managed) |
| Database | Supabase production |
| Scheduler | 3 cron job aktif |
| Email | SMTP + dispatcher + retry |
| Backup | Ada, **belum diuji restore** |
| Monitoring | Terbatas (Lovable error reporting) |
| Staging | **Tidak ada** |
| CI/CD | GitHub sync → Lovable auto-deploy |

---

## 12. Brainstorming Starter Questions

Tempel bagian ini bersama dokumen ke AI lain.

### Prioritas
1. Dari gap yang ada, mana yang paling mendesak: payout seller, verifikasi KYC, atau dispute resolution?
2. Apakah marketplace sebaiknya dibuka invite-only dulu untuk 10-20 seller terpilih, atau langsung publik?
3. Fitur apa yang bisa dipotong dari rencana saat ini tanpa merusak nilai jual utama?

### Finansial
4. Berapa komisi platform yang wajar untuk pasar produk digital dan jasa lokal? Flat atau bertingkat?
5. Skema hold period dana seller yang aman terhadap refund dan dispute: T+3, T+7, atau lain?
6. Apakah perlu biaya admin terpisah, atau cukup ambil dari komisi?

### Produk & Seller
7. Seller pending: ubah teks UI jadi jujur, atau longgarkan policy agar bisa simpan draft?
8. Seberapa ketat moderasi: pre-approval penuh, atau post-moderation dengan takedown cepat?
9. Fitur seller mana yang paling menentukan retensi: statistik penjualan, chat, atau kecepatan pencairan?

### Kepercayaan
10. Bagaimana menangani sengketa pembeli vs seller tanpa escrow penuh?
11. Apakah perlu verifikasi identitas ringan sebelum payout pertama?
12. Strategi mitigasi produk digital ilegal (hak cipta, malware) di sisi moderasi?

### Teknis
13. Perlukah staging environment sebelum membuka pendaftaran seller?
14. Strategi backup dan disaster recovery yang realistis untuk skala awal?
15. Apakah Supabase + Lovable cukup untuk 12 bulan ke depan, atau perlu rencana migrasi?

### Go-to-Market
16. Siapa seller pertama yang ditargetkan: komunitas joki, kreator digital, atau UMKM?
17. Strategi akuisisi pembeli awal: SEO, komunitas, atau paid ads?
18. Metrik keberhasilan 3 bulan pertama: GMV, seller aktif, atau repeat purchase?

---

## 13. Dokumen Pendukung di Repo

| Dokumen | Isi |
|---|---|
| `docs/00-product/product-brief.md` | Visi produk awal (single-vendor) |
| `docs/marketplace/00-rebaseline.md` | Keputusan evolusi ke marketplace |
| `docs/marketplace/02-decision-register.md` | Daftar keputusan owner |
| `docs/audit/18-overall-progress-report.md` | Audit menyeluruh (Juli 2026, sebagian sudah usang) |
| `docs/evidence/slice-marketplace-35-37-admin-operations.md` | Evidence fitur admin marketplace |
| `docs/08-testing/e2e-test-report.md` | Laporan E2E |
| `docs/ui-ux/00-ebrystore-ui-audit.md` | Audit UI/UX |
| `DESIGN.md` | Arah desain dan aturan anti-slop |
| `roadmap.md` | Roadmap jangka pendek |

---

## 14. Catatan Kejujuran

Beberapa hal yang perlu diketahui saat brainstorming:

1. **Angka "50% progress"** di `docs/audit/18-overall-progress-report.md` berasal dari Juli 2026. Sejak itu banyak fitur masuk (marketplace, jasa, pertumbuhan, email, kredit). Angka itu **tidak lagi akurat** sebagai status keseluruhan.

2. **Dokumen audit lama menyebut beberapa fitur "belum ada"** yang sekarang sudah ada: upload file produk, operator assignment, signed URL, webhook SumoPod, realtime, email. Dokumen ini sudah memverifikasi ulang langsung ke kode.

3. **Bug ditemukan lewat uji nyata, bukan review kode.** Dua bug otorisasi kritis (NULL di `can_access_store`, `store_id` ambigu) lolos dari pembacaan kode dan hanya ketahuan saat dijalankan. Ini alasan kuat untuk menambah test otorisasi otomatis.

4. **Tidak ada staging.** Semua perubahan diuji lokal lalu langsung ke production. Ini risiko operasional nyata.

---

*Dokumen ini dibuat 2026-10-21 dengan memverifikasi langsung struktur repo, migrasi, dan kode. Angka dihitung dari repo, bukan dari dokumen lama.*
