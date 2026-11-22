# Security Event Architecture

Arsitektur deteksi, pencatatan, deduplikasi, dan korelasi Security Events di Ebrystore (`src/lib/security-event.server.ts`).

## Alur Data End-to-End

1. **Titik Deteksi (Sensors):**
   - **RBAC Server Functions (`src/lib/authz.server.ts`):** `assertPermission()` menulis ke `audit_logs` DAN `recordSecurityEvent` (`forbidden_permission_access`).
   - **Rate Limiter (`src/lib/rate-limit.server.ts`):** Setiap penolakan `check_rate_limit()` tercatat sebagai `rate_limit_exceeded` (HTTP `429`).
   - **Route Guard Telemetry (`reportUnauthorizedRouteAccess` di `src/lib/security.functions.ts`):** Navigasi user tanpa hak akses ke `/admin/*` dan `/see/*` tercatat sebagai `forbidden_admin_access` (`HIGH`) dengan Request Reference ID unik.
   - **Payment Webhooks (`webhook.shopeepay.ts`, `webhook.sumopod.ts`):** Signature tidak valid atau timestamp kedaluwarsa (`401`) dicatat sebagai `invalid_webhook_signature`.
   - **Internal Jobs & Integrasi (`email-dispatch.ts`, `shopeepay-reconcile.ts`, `telegram-dispatch.ts`, `jiofarm/*`):** Token tidak valid (`401`) dicatat sebagai `invalid_internal_job_token`.
   - **Privilege Escalation & IDOR Guards (`manage-user-role.ts`, `inquiries.functions.ts`):** Percobaan eskalasi `super_admin`/self-role dicatat sebagai `privilege_escalation_attempt` (`CRITICAL`), sedangkan mutasi chat milik orang lain dicatat sebagai `ownership_violation_attempt`.

2. **Sanitasi & Privasi (`sanitizeSecurityMetadata`, `maskEmail`, `sanitizeUserAgent`):**
   - Kunci sensitif (`password`, `token`, `secret`, `cookie`, `authorization`, `api_key`, `signature`, `jwt`, `session`, `card`, `cvv`, `pin`, `credential`) selalu diganti `"[REDACTED]"`.
   - String token JWT (`eyJ...`) dan header `Bearer ...` dihapus otomatis dari metadata.
   - Alamat email disamarkan (`fe***@ebrystore.my.id`).
   - User-Agent disanitasi dari karakter kontrol (`\r`, `\n`, `\t`) dan dibatasi maksimal `300` karakter.

3. **Deduplikasi & Ketahanan Fail-Safe:**
   - Fungsi DB `public.record_security_event()` menggunakan `pg_advisory_xact_lock` berdasarkan `dedup_key` dan menggabungkan event identik dalam jendela **5 menit** (`occurrence_count = occurrence_count + 1`, memperbarui `last_seen_at`) sehingga serangan flooding tidak memenuhi tabel.
   - Kegagalan logging tidak pernah mengganggu respons penolakan `401`/`403`/`429`.
