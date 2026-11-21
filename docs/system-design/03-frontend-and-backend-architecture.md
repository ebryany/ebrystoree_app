# 05. Frontend Architecture & 06. Backend Architecture

## 5. Frontend Architecture (`VERIFIED`)

### 5.1 Routing Architecture
Routing menggunakan **TanStack Router file-based routing** (`src/routes/`, dikompilasi ke `src/routeTree.gen.ts`):
- **Root (`__root.tsx`)**: Memuat `getPublicWebsiteSettings()`, menyuntikkan metadata SEO (`seo_default_*`, `seo_title_template`, `og:image`, `canonical`), `<html lang={lang}>` (`id`/`en`), `site_accent_color` CSS custom properties, `MaintenanceGate`, `NavProgress`, `Toaster`, serta analitik `page_view`.
- **Public Routes**: `/`, `/produk`, `/produk/$slug`, `/layanan`, `/layanan/$slug`, `/jasa/$id`, `/toko/$slug`, `/artikel`, `/keranjang`, `/auth`.
- **Authenticated Layout (`_authenticated/route.tsx`)**: Guard sesi pengguna sebelum merender route anak:
  - **Customer**: `/dashboard/*`, `/checkout.*`, `/akun`.
  - **Seller**: `/seller/*` (dibatasi ke pemilik toko aktif).
  - **Operator**: `/operator/*`.
  - **Admin**: `/admin/*` (diperiksa permission per halaman/aksi).

### 5.2 Layout, Component & State Architecture
- **Shell & Navigasi**: `PageShell` (`src/components/page-shell.tsx`), `SiteHeader` (`src/components/site-header.tsx`), `SiteFooter` (`src/components/site-footer.tsx`), dengan elemen UI berbasis Radix UI + Tailwind CSS v4 (`src/components/ui/*`).
- **State Management**:
  - **Server State**: TanStack Query (`QueryClient`) dengan `staleTime` terarah (mis. 5 menit untuk `public-website-settings`). Mutasi pada admin/seller menginvalidasi query key spesifik (`["website-settings"]`, `["public-website-settings"]`).
  - **Local / Client State**: React `useState` & `localStorage` untuk keranjang (`cart-store.ts`), recently viewed, dan draft form (`React Hook Form` + `Zod`).
- **SSR, Hydration & Error Handling**:
  - `src/server.ts` membungkus server entry TanStack Start, menormalkan error SSR internal (`normalizeCatastrophicSsrResponse`) menjadi halaman error HTML 500 yang aman tanpa membocorkan stack trace.
  - Route-level `errorComponent` & `SectionErrorBoundary` di beranda mencegah kegagalan satu bagian katalog merusak seluruh halaman (`route-fallback.tsx`).

---

## 6. Backend Architecture (`VERIFIED`)

### 6.1 Transport Layer: Server Functions vs REST API Routes
Backend terbagi atas dua jalur resmi:
1. **TanStack Server Functions (`src/lib/*.functions.ts`)**: Dipanggil oleh aplikasi web SSR/CSR (mis. `orders.functions.ts`, `payments.functions.ts`, `seller.functions.ts`, `marketplace-service.functions.ts`, `academic.functions.ts`, `admin-transaction.functions.ts`). Memakai middleware `requireSupabaseAuth` untuk operasi terautentikasi.
2. **HTTP Server Routes (`src/routes/api/**` & `src/routes/mcp.ts`)**:
   - Webhook eksternal (`/api/public/payments/webhook/sumopod`, `/api/public/payments/webhook/shopeepay`).
   - Cron dispatch (`/api/public/jobs/email-dispatch`, `/api/public/jobs/telegram-dispatch`, `/api/public/jobs/shopeepay-reconcile`) dilindungi `JOBS_CRON_TOKEN`.
   - Media proxy publik aman (`/api/public/catalog-image/$`, `/api/public/service-media/$`, `/api/public/og-image/$`).
   - Analitik publik (`/api/public/analytics/track`) dengan batas payload 4 KB dan whitelist event.
   - Catalog REST API v1 (`/api/v1/catalog/$`).
   - MCP endpoint (`/mcp`) dengan `authGuard` + user-scoped RLS client (51 tool).

### 6.2 Pola Otorisasi & Validasi Input
1. **Validasi Schema**: Setiap input server function & API divalidasi dengan `Zod` (`.strict()`, batas panjang, tipe UUID).
2. **Autentikasi**: `requireSupabaseAuth` memverifikasi token JWT via `supabase.auth.getUser()` dan membuat `supabase` client bertoken pengguna agar **RLS aktif**.
3. **Otorisasi Granular**: `assertPermission(ctx, "<permission>")` memeriksa `role_permissions` & `user_roles` di server serta mencatat penolakan akses.
4. **Rate Limiting (`rate-limit.server.ts`)**: Memanggil RPC `check_rate_limit`. Bucket finansial (`order.create`, `payment.proof`, `refund.request`, `topup.create`, `qris.create`, `po.create`) bersifat **fail-closed** saat limiter gagal; bucket non-finansial bersifat **fail-open**.

### 6.3 Kontrak Operasi Penting

| Operasi | Input & Validasi | Otorisasi | Business Logic & DB | Error & Side Effects |
|---|---|---|---|---|
| **Checkout Digital (`createDigitalOrder`)** | `productId`, `quantity`, `variantId?`, `idempotencyKey` (Zod) | `requireSupabaseAuth` + `orders.create` + `feature_checkout` | RPC `create_digital_order`: hitung harga DB, cek stok, `admin_fee`, `order_min_amount`, buat `orders`, `order_items`, `invoices`, `payments` | Reject `OUT_OF_STOCK`, `SELF_PURCHASE_DENIED`, `ORDER_BELOW_MINIMUM`; catat notifikasi & audit |
| **Webhook Pembayaran (`webhook.sumopod.ts`)** | JSON max 64 KB (`bodySchema` / `envelopeSchema`) | Verifikasi HMAC signature / webhook token (`sumopod.server.ts`) | Verifikasi nominal & status, proses lunas idempoten (`payment_events`), terbitkan entitlement / aktifkan jasa | Return `401` invalid signature, `413` payload besar, `200` duplikat aman |
| **Update Pengaturan (`updateSetting`)** | `key`, `value` (divalidasi `validateField` registry) | `assertPermission` sesuai `section.permission` (`settings.*`) | Tolak `readOnly`, update `system_settings` + `.select("key")` | `clearPublicSettingsCache()` + `writeAudit` |
| **Upload Delivery Jasa (`prepareServiceDeliveryUpload`)** | `orderId`, `mimeType`, `sizeBytes` | `requireSupabaseAuth` + kepemilikan toko order | Cek `marketplace_delivery_max_mb` via `readNumberSetting`, buat signed upload URL | Tolak jika ukuran melebihi batas atau order bukan milik seller |
