# Ebrystore API Access Control Matrix

Pemetaan kontrol akses wajib per kelompok endpoint dan rute aplikasi. Prinsip: **Default Deny**, **Zero Trust**, dan **Server-Side Authorization**.

| Kategori Endpoint / Rute | Guest | Customer | Seller | Operator | Support | Finance | Admin | Super Admin | Catatan Implementasi |
|---|---|---|---|---|---|---|---|---|---|
| Katalog Publik (`/produk`, `/layanan`, `/api/v1/catalog/*`) | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | Read-only `status='published'`; dilindungi rate limit IP (`120 req/60s`) |
| Telemetry Publik (`/api/public/analytics/track`) | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | Hanya menerima event non-konversi; `payment_success` hanya server-side |
| Dashboard Akun (`/dashboard/*`, `orders.functions.ts`) | DENY (401) | ALLOW (Own) | ALLOW (Own) | ALLOW (Own) | ALLOW (Own) | ALLOW (Own) | ALLOW (Own) | ALLOW (Own) | RLS + `user_id = auth.uid()`, fail-closed rate limits untuk uang |
| Dashboard Seller (`/seller/*`, `seller*.functions.ts`) | DENY (401) | Apply Store Only | ALLOW (Own Store) | DENY (403) | DENY (403) | DENY (403) | Moderation via Admin | ALLOW | Kepemilikan toko divalidasi DB trigger & `verify_seller_product_ownership` |
| Tugas Operator (`/operator/*`, `listMyAssignments`) | DENY (401) | DENY (403) | DENY (403) | ALLOW (`orders.fulfill`) | DENY (403) | DENY (403) | ALLOW (jika berizin) | ALLOW | Guard `orders.fulfill`; scope `all` butuh `orders.assign` |
| Admin Overview & Pertumbuhan (`/admin`, `/see/*`) | DENY (401) | DENY (403) | DENY (403) | ALLOW (terbatas) | ALLOW (`admin.dashboard.view`) | ALLOW (`admin.dashboard.view`) | ALLOW | ALLOW | Akses `/see/konten` diwajibkan `articles.view`; mutasi SEO/kampanye butuh `settings.seo.update` |
| Pembayaran & Refund Admin (`/admin/payments`, `/admin/refunds`) | DENY | DENY | DENY | DENY | DENY (403) | ALLOW (`payments.verify`, `refunds.approve`) | View (`orders/payments/refunds.view`) | ALLOW | Pemisahan hak baca vs eksekusi dana (`verify`/`approve`/`process`) |
| Pengguna, Peran & Matriks Izin (`/admin/pengguna`, `/admin/izin`) | DENY | DENY | DENY | DENY | DENY (hanya `users.view`) | DENY | Kelola non-super_admin (`roles.manage`) | ALLOW (Full) | Trigger DB `protect_role_changes` & `protect_role_permissions_changes` memblokir eskalasi ke `super_admin` |
| Email SMTP & Konfigurasi Sensitif (`saveSmtpConfig`, `updateSetting`) | DENY | DENY | DENY | DENY | DENY (403) | DENY (403) | View Only (`settings.view`) | ALLOW (`settings.manage`) | Password SMTP terenkripsi AES-256-GCM; mutasi butuh `settings.manage` |
| Security Monitoring Center (`/admin/settings/security`) | DENY (401) | DENY (403) | DENY (403) | DENY (403) | DENY (403) | DENY (403) | Read & Resolve Events (`security.events.*`) | ALLOW (Full inkl. Alerts & Settings) | Client dilarang `INSERT/UPDATE/DELETE` langsung ke `security_events` / `security_alerts` |
| Webhooks & Internal Cron (`/api/public/payments/webhook/*`, `/api/public/jobs/*`) | DENY (401 jika tanpa signature/token) | DENY (401) | DENY (401) | DENY (401) | DENY (401) | DENY (401) | DENY (401) | Server/Provider Only | Verifikasi RSA/HMAC atau Secret Token + re-query API provider + catat 401 ke `security_events` |
