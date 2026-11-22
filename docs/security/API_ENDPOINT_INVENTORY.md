# Ebrystore API Endpoint Inventory

Inventarisasi aktual seluruh permukaan API, Server Functions (`createServerFn`), MCP tools, dan rute sensitif berdasarkan inspeksi langsung repositori Ebrystore.

## 1. HTTP API Routes (`src/routes/api/*`)

| Endpoint | Method | File Implementasi | Auth | Authorization | Sensitivitas | Rate Limiting |
|---|---|---|---|---|---|---|
| `/api/health` | `GET` | `src/routes/api/health.ts` | None | Public | Rendah | Cloudflare/Nginx `ebry_general` |
| `/api/v1/catalog/$` | `GET` | `src/routes/api/v1/catalog/$.ts`, `src/lib/catalog-api.server.ts` | None | Public (published only) | Rendah | IP Rate Limit (`catalog.public`: 120 req/60s) + Nginx |
| `/api/public/catalog-image/$` | `GET` | `src/routes/api/public/catalog-image.$.tsx` | None | Regex allowlist path + MIME | Rendah | Nginx cache `ebrystore_media` |
| `/api/public/service-media/$` | `GET` | `src/routes/api/public/service-media.$.tsx` | None | Regex allowlist path + MIME | Rendah | Nginx cache `ebrystore_media` |
| `/api/public/og-image/$` | `GET` | `src/routes/api/public/og-image.$.tsx` | None | Whitelist path | Rendah | Nginx cache |
| `/api/public/analytics/track` | `POST` | `src/routes/api/public/analytics/track.ts` | Optional Bearer | Validasi Zod (tolak `payment_success` dari browser) | Rendah | RPC `check_rate_limit` (`analytics.track`: 60/60s) |
| `/api/public/payments/webhook/shopeepay` | `POST` | `src/routes/api/public/payments/webhook.shopeepay.ts` | Asymmetric Signature + Timestamp | Server-to-server `verifyAndSettle` | Kritis (Finansial) | Header + Body limit `64 KB` + Security Event logging on 401 |
| `/api/public/payments/webhook/sumopod` | `POST` | `src/routes/api/public/payments/webhook.sumopod.ts` | HMAC Webhook Signature | Server-to-server `getPaymentStatus` re-verify | Kritis (Finansial) | Body limit `64 KB` + Security Event logging on 401 |
| `/api/public/jobs/email-dispatch` | `POST` | `src/routes/api/public/jobs/email-dispatch.ts` | Secret Token (`JOBS_CRON_TOKEN`) | Timing-safe comparison | Tinggi (Internal) | Security Event logging on 401 |
| `/api/public/jobs/shopeepay-reconcile` | `POST` | `src/routes/api/public/jobs/shopeepay-reconcile.ts` | Secret Token (`JOBS_CRON_TOKEN`) | Timing-safe comparison | Kritis (Finansial) | Security Event logging on 401 |
| `/api/public/jobs/telegram-dispatch` | `POST` | `src/routes/api/public/jobs/telegram-dispatch.ts` | Secret Token (`JOBS_CRON_TOKEN`) | Timing-safe comparison | Sedang (Internal) | Security Event logging on 401 |
| `/api/public/integrations/jiofarm/demand` | `GET` | `src/routes/api/public/integrations/jiofarm/demand.ts` | Secret Token (`JIOFARM_INGEST_TOKEN`) | Timing-safe comparison | Tinggi (Internal) | Security Event logging on 401 |
| `/api/public/integrations/jiofarm/links` | `POST` | `src/routes/api/public/integrations/jiofarm/links.ts` | Secret Token (`JIOFARM_INGEST_TOKEN`) | Timing-safe comparison + `128 KB` cap | Kritis (Stok Kode) | Security Event logging on 401 |

## 2. Model Context Protocol (MCP) & OAuth Routes

| Endpoint | Method | File Implementasi | Auth | Authorization |
|---|---|---|---|---|
| `/mcp` | `ANY` | `src/routes/mcp.ts` | Supabase OAuth Bearer JWT | Per-tool RLS + `authGuard` (`src/lib/mcp/index.ts`, 52 tools) |
| `/.mcp/list-tools` | `ANY` | `src/routes/[.mcp]/list-tools.ts` | Supabase OAuth Bearer JWT | Per-tool schema discovery |
| `/.mcp/invoke-tool/$tool` | `ANY` | `src/routes/[.mcp]/invoke-tool/$tool.ts` | Supabase OAuth Bearer JWT | RLS user-scoped + escalation checks di `manage_user_role` |
| `/.well-known/oauth-protected-resource` | `ANY` | `src/routes/[.well-known]/oauth-protected-resource.ts` | Public Metadata | RFC 9728 OAuth resource metadata |
| `/.lovable/oauth/consent` | `GET` | `src/routes/[.]lovable.oauth.consent.tsx` | Supabase Session | HTTP/HTTPS origin check (`safeOauthRedirectUrl`) |

## 3. TanStack Start Server Functions (`src/lib/*.functions.ts`) — Ringkasan 26 Modul (173+ Fungsi)

| Modul | Jumlah Fungsi | Klasifikasi Akses | Guard Utama |
|---|---|---|---|
| `catalog.functions.ts`, `presence.functions.ts`, `cart.functions.ts` | 10 | `PUBLIC` | Query `status='published'`, Zod schema |
| `articles.functions.ts` | 6 | Campuran (`2 PUBLIC`, `4 ADMIN`) | `assertPermission`: `articles.view/create/update/delete` |
| `reviews.functions.ts`, `social.functions.ts` | 17 | Campuran (`9 PUBLIC`, `8 AUTH`) | RLS + `rate-limit.server.ts` (`review.guest`, `social.toggle`) |
| `orders.functions.ts`, `payments.functions.ts`, `credit-topup.functions.ts`, `topup-manual.functions.ts` | 37 | `CUSTOMER` / `AUTH` (+2 Admin) | `requireSupabaseAuth` + RLS + RPC ownership + fail-closed rate limit |
| `academic.functions.ts` | 6 | `CUSTOMER` / `AUTH` | `requireSupabaseAuth` + RPC atomic pricing & order |
| `po.functions.ts` | 12 | `CUSTOMER` & `ADMIN` | `requireSupabaseAuth` + RLS + `orders.view` (`listAllPoRequests`) |
| `inquiries.functions.ts` | 13 | `CUSTOMER`, `SELLER`, `ADMIN` | `requireSupabaseAuth` + RLS + `orders.view` (`listAllInquiries`) + ownership check (`setInquiryStatus`) |
| `seller.functions.ts`, `seller-files.functions.ts`, `product-variants.functions.ts` | 33 | `SELLER` (1 Public: `getPublicStore`) | `requireSupabaseAuth` + `verify_seller_product_ownership` / `my_store_id` + RLS |
| `marketplace-service.functions.ts` | 24 | `CUSTOMER`, `SELLER`, `ADMIN` | `requireSupabaseAuth` + RPC (`marketplace_service_*`) + `services.view/update` + `orders.view` |
| `fulfillment.functions.ts` | 9 | `CUSTOMER`, `OPERATOR`, `ADMIN` | `requireSupabaseAuth` + `orders.fulfill`, `orders.assign`, RPC assignment checks |
| `admin.functions.ts` | 24 | `ADMIN` / `SUPER_ADMIN` (`getMyAccess` untuk auth session) | `assertPermission`: `admin.dashboard.view`, `products.*`, `services.*`, `users.view`, `roles.manage`, `permissions.*`, `audit_logs.view` |
| `admin-transaction.functions.ts`, `admin-payout.functions.ts`, `admin-seller.functions.ts`, `order-monitoring.functions.ts` | 33 | `ADMIN` / `FINANCE` / `SELLER` | `assertPermission` (`orders.view`, `payments.*`, `refunds.*`, `payouts.*`, `sellers.*`, `tasks.*`, `reports.view`, `settings.*`) |
| `product-files.functions.ts`, `notifications-admin.functions.ts`, `jobs.functions.ts`, `website-settings.functions.ts` | 20 | `ADMIN` (1 Public: `getPublicWebsiteSettings`) | `assertPermission` (`products.*`, `notifications.broadcast`, `audit_logs.view`, `settings.*`) |
| `email-admin.functions.ts`, `growth.functions.ts`, `growth-actions.functions.ts`, `campaigns.functions.ts`, `seo-audit.functions.ts` | 18 | `ADMIN` | Diperketat ke `assertPermission`: `settings.view/manage`, `admin.dashboard.view`, `articles.view/update`, `settings.seo.update` |
| `security.functions.ts` | 6 | `SECURITY_ADMIN` (1 Authenticated telemetry) | `reportUnauthorizedRouteAccess` (authenticated) + `security.events.*`, `security.alerts.*`, `settings.*` |
