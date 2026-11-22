# Sensitive Route Protection Specification

Dokumen ini menjelaskan bagaimana navigasi rute sensitif dan panggilan API langsung dilindungi secara berlapis di Ebrystore.

## 1. Klasifikasi Rute UI Sensitif

| Pola Rute | Klasifikasi | Penjaga Autentikasi & Sesi | Penjaga Otorisasi & Peran | Perilaku Saat Ditolak |
|---|---|---|---|---|
| `/admin/*` | `ADMIN_ONLY` / `SECURITY_ADMIN_ONLY` | `/_authenticated` (`getCachedSession` + `useSession`) -> redirect ke `/auth` | `AdminLayout` (`getMyAccess` memverifikasi `admin.dashboard.view`) + tiap sub-rute & server function memverifikasi permission spesifik | Merender `SecurityErrorView` (`status=403`) **tanpa nama permission internal**, mencatat event `forbidden_admin_access` ke `security_events` melalui `reportUnauthorizedRouteAccess`, menampilkan `Kode Referensi` |
| `/see/*` | `ADMIN_ONLY` (Growth/SEO) | `GrowthLayout` redirect ke `/see/masuk` | `getMyAccess` (`admin.dashboard.view`) + `articles.view/update` (`konten`), `settings.seo.update` (`seo`/`kampanye`) | Merender `SecurityErrorView` (`status=403`) + mencatat `forbidden_admin_access` + `Kode Referensi` |
| `/seller/*` | `SELLER_ONLY` | `/_authenticated` redirect ke `/auth` | `SellerLayout` (`getMyStore`) + RPC kepemilikan toko | Jika belum punya toko: formulir `Buka Toko`; jika mengakses API/produk seller lain: ditolak RLS & `assert` ownership (`403`) |
| `/operator/*` | `AUTHENTICATED` (Operator) | `/_authenticated` redirect ke `/auth` | Server functions `fulfillment.functions.ts` (`orders.fulfill`, `orders.assign`) | `ForbiddenState` tanpa membocorkan nama permission + catat `forbidden_permission_access` |
| `/dashboard/*`, `/akun`, `/checkout/*` | `CUSTOMER_ONLY` | `/_authenticated` redirect ke `/auth` | Isolasi data per `user_id = auth.uid()` | Guest dialihkan ke `/auth`; percobaan akses ID milik user lain ditolak server |

## 2. Perlindungan Endpoint Tersembunyi (`/_serverFn/*`, `/mcp`, `/api/*`)
1. Seseorang yang menebak atau menyalin URL server function (`createServerFn`) dan memanggilnya langsung via `curl` atau browser `fetch`:
   - Tanpa token: ditolak oleh middleware `requireSupabaseAuth`.
   - Dengan token akun biasa (mis. customer mencoba memanggil `listAdminUsers`, `saveSmtpConfig`, `updateSecurityEventStatus`, `getContentSummary`, atau `listAllInquiries`): ditolak di server oleh `assertPermission()`, dicatat ke `audit_logs` dan `security_events`, serta gagal dieksekusi di lapisan RLS PostgreSQL.
2. Permintaan HTTP langsung ke `/api/v1/catalog/*` yang melebihi batas (`120 req/menit/IP`) ditolak `429 RATE_LIMITED` dan tercatat bila melewati ambang batas.
3. Permintaan gagal ke `/api/*` atau `/mcp` selalu menerima respons JSON konsisten dengan `X-Request-Id`, sementara navigasi HTML menerima halaman error Ebrystore.
