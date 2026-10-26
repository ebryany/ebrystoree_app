# EBRYSTORE — Admin Website Settings Functional Audit & Google Login Reality Report

Tanggal: 26 Oktober 2026
Target audit: `/admin/settings/website` + arsitektur Google Login
Metode: scan registry → trace consumer per key → uji runtime produksi. Tidak mengubah database atau settings.

---

## A. Settings Coverage

| Metrik | Jumlah |
|---|---|
| Total keys di registry (`website-settings.ts`) | **140** |
| Punya consumer di `src/` (di luar registry) | **74** |
| Tanpa consumer (kandidat stored-but-unused) | **66** |
| Dipakai oleh SQL RPC (`setting_int`) | 13 keys |
| Feature flags aktif dipakai server fn | 5 keys |

Ringkasan status:

| Status | Jumlah | Catatan |
|---|---|---|
| `FULLY_FUNCTIONAL` | ±30 | SEO, maintenance, email sender, order/prefix, admin fee, expiry, QRIS kanonik |
| `PARTIALLY_FUNCTIONAL` | ±10 | Storefront visibility (dipakai UI preview, belum semua ke katalog) |
| `STORED_BUT_UNUSED` | **66** | Rinci di bawah |
| `DISPLAY_ONLY` | 6 | Preview panel admin (memang per desain) |
| `MOCK_OR_DEMO` | 0 | Tidak ditemukan mock |
| `BROKEN` | 3 | Google Login (broker 404), notifikasi (cron tak dipicu), SEO canonical (domain lama) |
| `NOT_VERIFIED` | 8 | Marketplace escrow/payout keys |

## B. Matriks Utama (paling relevan)

| Group | Key | Consumer | Status | Bukti |
|---|---|---|---|---|
| Umum | `store_name`, `site_business_name`, `site_tagline` | `__root.tsx` SSR, hero | FULLY_FUNCTIONAL | Judul situs live berubah |
| Branding | `site_logo_url`, `site_favicon_url`, `site_og_image_url` | `__root.tsx` | FULLY_FUNCTIONAL | Favicon & OG live |
| SEO | `seo_*` (12 keys) | `__root.tsx` | FULLY_FUNCTIONAL kecuali `seo_canonical_base` | meta live |
| SEO | `seo_canonical_base` | — | **BROKEN** | Mengarah domain Lovable lama, bukan `app.ebrystore.my.id` |
| Kontak | `site_whatsapp`, `site_operating_hours` | `site-footer.tsx` | FULLY_FUNCTIONAL | Footer live |
| Navigasi | `site_nav_items` | **hanya preview admin** | PARTIALLY_FUNCTIONAL | Header/footer publik hardcode |
| Storefront | `storefront_show_*` (9 keys) | — | **STORED_BUT_UNUSED** | Katalog publik tidak membaca |
| Transaksi | `admin_fee`, `order_expiry_hours` | RPC SQL (11 & 8 pemanggil) | FULLY_FUNCTIONAL | `create_digital_order` memakai |
| Transaksi | `qris_enabled` | `transaction.server.ts` | FULLY_FUNCTIONAL | PAY-01..06 test; alias `qris_payment_active`/`feature_qris` sudah ditangani |
| Transaksi | `qris_expiry_minutes`, `qris_payment_active` | — | STORED_BUT_UNUSED/DUPLICATED | Alias lama; kanonik menang |
| Transaksi | `refund_window_days`, `proof_reupload_limit` | RPC SQL | FULLY_FUNCTIONAL | `process_refund`, `submit_payment_proof` |
| Marketplace | `marketplace_video_max_mb`, `marketplace_image_max_mb` dst | RPC SQL | FULLY_FUNCTIONAL | Validasi upload |
| Marketplace | `marketplace_min_payout`, `marketplace_hold_hours`, `marketplace_auto_release_hours`, `marketplace_partial_refund`, `marketplace_seller_auto_approve` | — | **NOT_VERIFIED / STORED_BUT_UNUSED** | Tidak ada payout system; tidak ada consumer |
| Notifikasi | `notify_email_enabled`, `notify_sender_*` | `email.server.ts` | PARTIALLY_FUNCTIONAL | Konfigurasi dibaca, tapi **cron dispatcher tidak dipicu** |
| Notifikasi | `notify_order_created`, `notify_operator_assigned`, dst (7 keys) | — | **STORED_BUT_UNUSED** | Tidak ada consumer switch |
| Fitur | `feature_digital_products`, `feature_checkout`, `feature_qris` | `orders.functions.ts` (`ensureFeature`) | FULLY_FUNCTIONAL | Checkout ditolak bila flag off |
| Fitur | `feature_registration`, `feature_realtime_tracking`, `feature_revision`, `feature_refund`, `feature_quality_review`, `feature_promo_banner`, `feature_home_faq`, `feature_home_tracking_preview` | — | **STORED_BUT_UNUSED** | Tidak dibaca server/UI |
| Maintenance | `maintenance_*` (7 keys) | `maintenance-gate.tsx` via `__root.tsx` | FULLY_FUNCTIONAL | Gate membungkus root |

## C. Temuan Mockup / Nonfunctional

### C-1. Google Login — `BROKEN` (P0 untuk UX auth)
- **Evidence:** Tombol ada di `/auth` (`auth.tsx:556`), flow `lovable.auth.signInWithOAuth("google")` redirect ke `/~oauth/initiate`. Di produksi: **HTTP 404** (diverifikasi curl).
- **Root cause:** Route `/~oauth/initiate` adalah fitur Lovable Cloud. Setelah deploy ke VPS self-host, route ini tidak ada. Broker `oauth.lovable.app` pun menolak origin `app.ebrystore.my.id` (tidak di `DEFAULT_SUPPORTED_OAUTH_ORIGINS`).
- **Impact:** Tombol "Lanjutkan dengan Google" mati total bagi semua pengunjung.
- **Fix:** Jalur Google OAuth langsung via Supabase Auth (`signInWithOAuth({ provider: "google" })`) + callback route. Butuh konfigurasi Google Cloud Console + Supabase Dashboard (checklist di H).

### C-2. Notifikasi email — `PARTIALLY_FUNCTIONAL` (P1)
- **Evidence:** `email.server.ts` membaca `notify_email_enabled` dan dispatcher ada di `/api/public/jobs/email-dispatch` (dengan `JOBS_CRON_TOKEN`), tetapi **tidak ada pemanggil** — `pg_net` tidak dipasang untuk ini dan cron VPS belum dibuat.
- **Impact:** email transaksional tidak terkirim otomatis; hanya jaring pengaman yang tidak pernah jalan.

### C-3. SEO canonical — `BROKEN` (P1)
- `seo_canonical_base` mengarah ke domain Lovable lama. Website produksi `app.ebrystore.my.id` punya canonical/OG berbeda dari sumber kebenaran.

### C-4. Storefront visibility (9 keys) — `STORED_BUT_UNUSED` (P2)
- Admin bisa toggle "tampilkan harga/estimasi/revisi" tetapi katalog publik tidak membaca nilai itu.

### C-5. Feature flags mati (8 keys) — `STORED_BUT_UNUSED` (P2)
- `feature_refund`, `feature_registration`, dll. tersimpan tapi tidak pernah dicek server. Admin mengira bisa mematikan fitur; ternyata tidak.

### C-6. Preview panel — `DISPLAY_ONLY` (per desain)
- Preview desktop/mobile hanya membaca draft state lokal. Label jujur perlu ditambahkan: "Pratinjau visual, tidak menggantikan simpan".

### C-7. Marketplace payout/escrow keys — `NOT_VERIFIED` (P2)
- `marketplace_min_payout`, `marketplace_hold_hours`, `marketplace_auto_release_hours` tidak dipakai. Konsisten dengan temuan sebelumnya: payout belum dibangun.

## D. Financial & Security Settings

- `admin_fee` (2500), `order_expiry_hours`, `refund_window_days`, `proof_reupload_limit` → **ditegakkan di RPC SQL** (SECURITY DEFINER, snapshot per order). Aman.
- `qris_enabled` → kanonik menang atas alias; sudah ada test PAY-01..06. Aman.
- `marketplace_require_moderation` → dipakai RPC moderasi. Aman.
- `maintenance_*` → `MaintenanceGate` membungkus `__root.tsx`, membaca settings publik. Akses admin via `maintenance_allow_admin`/`maintenance_allow_operator`. Tidak mengganggu webhook (`/api/public/` dikecualikan per implementasi gate).
- **Tidak ada setting yang memuat secret** (service-role key, SMTP password, OAuth secret). SMTP config ada di DB tapi tanpa secret di registry. OAuth secret tidak ada di settings table — benar.

## E. Google OAuth Architecture

Kondisi sekarang:
- Tombol UI: ada (`auth.tsx`), disabled state + error handling ada.
- Flow: Lovable broker → **mati di self-host** (404).
- Supabase Auth email/password: jalan.
- `useSession`: `supabase.auth.getSession()` + `onAuthStateChange` — kompatibel dengan OAuth Supabase.
- Callback application: **belum ada** route `/auth/callback`.
- Identity linking: Supabase default auto-link bila email sama & verified. Perlu diuji.

## F. Perubahan yang diusulkan (menunggu persetujuan)

1. `src/routes/auth.tsx` — ganti `lovable.auth.signInWithOAuth(...)` dengan `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } })`.
2. Route baru `/auth/callback` — tukar code menjadi session (PKCE), guard redirect `next` (harus `/...`, bukan `//`).
3. Optional: setting `feature_google_login` agar admin bisa menyembunyikan tombol bila provider belum siap.

Tidak ada perubahan DB, RLS, atau business rule.

## G. Testing Evidence

| Uji | Hasil |
|---|---|
| Consumer scan 140 keys (script) | selesai |
| `/~oauth/initiate` produksi | **404** (curl) |
| Tombol Google tampil & enabled di `/auth` | ya (browser) |
| 10 halaman publik produksi | 200 |
| tsc | bersih |
| Build | tidak dijalankan ulang untuk audit ini (kode belum diubah) |
| OAuth E2E | **not_verified** — butuh konfigurasi Google Cloud |

## H. Pending External Configuration (butuh akses Anda)

**Google Cloud Console:**
1. OAuth client type "Web application".
2. Authorized JavaScript origins: `https://app.ebrystore.my.id`.
3. Authorized redirect URI: `https://wcxaheqnnsbhifpgiedk.supabase.co/auth/v1/callback`.

**Supabase Dashboard:**
1. Authentication → Providers → Google: aktifkan, isi Client ID + Secret.
2. Authentication → URL Configuration: Site URL `https://app.ebrystore.my.id`; Redirect URLs tambahkan `https://app.ebrystore.my.id/auth/callback`.

**VPS:**
- Tambah env `JOBS_CRON_TOKEN` + cron `/api/public/jobs/*` agar notifikasi jalan.

## I. Prioritas

- **P0:** Google Login broken (tombol mati di produksi) — fix via Supabase OAuth.
- **P1:** Email dispatcher tidak dipicu; `seo_canonical_base` domain lama.
- **P2:** Feature flags & storefront visibility yang tidak ditegakkan — pilih: sambungkan atau beri label di admin.
- **P3:** Preview panel label, konsolidasi alias QRIS di UI admin.

---

## Keputusan yang saya butuhkan dari Anda

1. **P0 Google Login:** setuju saya implementasikan jalur Supabase OAuth langsung (ubah `auth.tsx` + route callback baru)? Setelah itu Anda tinggal isi credentials di Google Cloud + Supabase Dashboard.
2. **66 keys tanpa consumer:** pilih per kelompok — sambungkan (mis. storefront visibility & feature flags), atau beri label "belum aktif" di UI admin. Jangan dihapus dulu.
3. **Email dispatcher:** buat cron di VPS memanggil `/api/public/jobs/email-dispatch` dengan token? Butuh Anda menambahkan `JOBS_CRON_TOKEN` ke `.env` VPS.
4. **SEO canonical:** ganti ke `https://app.ebrystore.my.id`? (perlu konfirmasi domain final — apakah masih ada domain Lovable lain yang dipakai.)
