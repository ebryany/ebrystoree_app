# Ebrystore API Role & Permission Matrix

Sistem otorisasi Ebrystore menggunakan arsitektur Role-Based & Permission-Based (`public.app_role`, `public.permissions`, `public.role_permissions`, dan `public.has_permission(_user_id, _permission)`).

## 1. Peran Sistem (`public.app_role`)

- **`customer`**: Pembeli standar (diberikan otomatis saat registrasi via trigger `handle_new_user()`).
- **`seller`**: Pemilik toko marketplace aktif (diberikan saat pengajuan toko disetujui).
- **`operator`**: Pelaksana pesanan jasa akademik/layanan platform.
- **`support`**: Tim dukungan pelanggan & moderasi dasar (akses lihat order/chat/artikel).
- **`finance`**: Tim keuangan (verifikasi pembayaran manual, refund, payout seller, laporan keuangan).
- **`admin`**: Administrator operasional platform (katalog, pengguna non-super_admin, pengaturan konten/SEO, pemantauan event keamanan).
- **`super_admin`**: Pengelola penuh sistem (manajemen permission matrix, SMTP, maintenance, alert security management, keputusan marketplace berbahaya).

## 2. Permission Baru Grup `Keamanan` (Migrasi `20261122100000`)

| Permission Key | Deskripsi | `customer` | `operator` | `support` | `finance` | `admin` | `super_admin` |
|---|---|---|---|---|---|---|---|
| `security.events.read` | Melihat Security Monitoring Center & daftar security events | - | - | - | - | YES | YES |
| `security.events.view_details` | Melihat detail teknis event, IP/UA tersanitasi & riwayat investigasi | - | - | - | - | YES | YES |
| `security.alerts.read` | Melihat daftar peringatan keamanan (Security Alerts) | - | - | - | - | YES | YES |
| `security.events.resolve` | Mengubah status investigasi event & menulis catatan resolusi | - | - | - | - | YES | YES |
| `security.alerts.manage` | Menindaklanjuti & mengubah status Security Alerts | - | - | - | - | - | YES |
| `security.settings.manage` | Mengelola konfigurasi aturan deteksi & postur keamanan sistem | - | - | - | - | - | YES |

## 3. Penegakan Permission pada Modul yang Diperketat

| Modul / Aksi | Permission Wajib Sebelum Hardening | Permission Wajib Setelah Hardening |
|---|---|---|
| `email-admin.functions.ts` (`getEmailStatus`) | Role array manual (`support`/`admin`/`super_admin`) | `settings.view` (`assertPermission`) |
| `email-admin.functions.ts` (`sendTestEmail`, `saveSmtpConfig`, `clearSmtpConfig`) | Role array manual (`support` bisa kirim test email!) | `settings.manage` (`assertPermission`) + `email.test` rate limit |
| `growth.functions.ts` (`getContentSummary`, `listArticlesForBoard`) | Role array manual (memungkinkan `finance`/`support` tanpa `articles.view`) | `articles.view` (`assertPermission`) |
| `growth-actions.functions.ts` (`moveArticleStatus`, `saveArticleChecklist`) | Role array manual `admin`/`super_admin` | `articles.update` (`assertPermission`) |
| `campaigns.functions.ts` (`createCampaign`), `growth-actions.functions.ts` (`deleteCampaign`, `setCampaignStatus`, `ignoreSeoIssue`), `seo-audit.functions.ts` (`runSeoAuditNow`) | Role array manual | `settings.seo.update` (`assertPermission`) + `seo.audit` rate limit |
| `inquiries.functions.ts` (`listAllInquiries`), `po.functions.ts` (`listAllPoRequests`) | Hanya mengandalkan RLS | `orders.view` (`assertPermission`) |
